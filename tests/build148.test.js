// ============================================================
// TESTS/BUILD148.TEST.JS
// Standing regression suite for BUILD 148: KI-28 (a Charge's break check
// now runs after the enemy's own poison tick, so the release round's tick
// counts toward the break), the run transcript, the log's Play/All views,
// the log's full-screen mode, and the browser-zoom check. Same shape as
// tests/build147.test.js: plain Node script, playwright launched directly,
// node:assert. Run: node tests/build148.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');

const results = [];
async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log('PASS — ' + name);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log('FAIL — ' + name + ': ' + err.message);
  }
}

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location().url || '' }); });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  page._pageErrors = pageErrors;
  page._consoleErrors = consoleErrors;
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

function realErrors(page) {
  return page._consoleErrors.filter((m) => !(m.text.indexOf('Failed to load resource') !== -1 && m.url.indexOf('art/') !== -1)).map((m) => m.text);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM (a) — KI-28: the break check counts the release round's tick
  // ---------------------------------------------------------------

  await runTest('Item a: wind-up damage plus the release round\'s own tick breaks the Charge, and the release deals no damage', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 10 }], patternIndex: 0, poisonStacks: 0 });
      runPhase('START_OF_TURN'); // wind-up begins, windupStartHp captured
    });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); }); // logs the wind-up
    await page.evaluate(() => {
      // 6 damage dealt during the wind-up round — below breakAt (10) alone.
      updateEnemy({ hp: gameState.enemy.hp - 6 });
      // Poison gained during the wind-up round; ticks at the release
      // round's own START_OF_TURN, for 4 more — 6 + 4 = 10, reaches breakAt.
      updateEnemy({ poisonStacks: 4 });
    });
    const playerHpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('START_OF_TURN'); }); // release round begins: tick, then the break check
    const broken = await page.evaluate(() => gameState.enemy.chargeBroken);
    assert.strictEqual(broken, true, 'expected 6 (wind-up) + 4 (release tick) = 10 to reach breakAt 10');
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const playerHpAfter = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(playerHpAfter, playerHpBefore, 'a broken Charge must deal no release damage to the player');
    await page.close();
  });

  await runTest('Item a: the mirror case — 6 (wind-up) + 3 (release tick) = 9 stays under breakAt 10, the release lands', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 10 }], patternIndex: 0, poisonStacks: 0, block: 0 });
      updatePlayer({ block: 0 });
      runPhase('START_OF_TURN');
    });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    await page.evaluate(() => {
      updateEnemy({ hp: gameState.enemy.hp - 6 });
      updateEnemy({ poisonStacks: 3 });
    });
    const playerHpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const broken = await page.evaluate(() => gameState.enemy.chargeBroken);
    assert.strictEqual(broken, false, 'expected 6 + 3 = 9 to stay under breakAt 10');
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const v = await page.evaluate(() => ({ hpAfter: gameState.player.hp, block: gameState.player.block, release: gameState.enemy.pattern[0].release }));
    const rawExpected = Math.max(0, v.release - v.block);
    assert.strictEqual(playerHpBefore - v.hpAfter, rawExpected, 'expected the full release (' + rawExpected + ') to land on the player');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (b) — run transcript content
  // ---------------------------------------------------------------

  await runTest('Item b: a FIGHT line and an R1 line appear after one End Turn; WON follows a fight win, LOAD follows a Load', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { document.getElementById('endTurnBtn').click(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE' && gameState.turn.round === 2, { timeout: 10000 });

    const afterRound1 = await page.evaluate(() => gameState.run.transcript);
    assert.ok(afterRound1.some((l) => l.indexOf('FIGHT') === 0), 'expected a FIGHT line, got: ' + JSON.stringify(afterRound1));
    const r1Line = afterRound1.find((l) => l.indexOf('R1 ') === 0);
    assert.ok(r1Line, 'expected an R1 line, got: ' + JSON.stringify(afterRound1));
    assert.ok(/roll \d+/.test(r1Line), 'expected the R1 line to name the rolled face, got: ' + r1Line);
    assert.ok(r1Line.indexOf('enemy ') !== -1, 'expected the R1 line to name the enemy action, got: ' + r1Line);
    assert.ok(/you \d+\/\d+ bl\d+ P\d+$/.test(r1Line), 'expected the R1 line to end with the player\'s HP over max, got: ' + r1Line);

    // Win the fight and confirm a WON line follows.
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    await page.waitForTimeout(200);
    const afterWin = await page.evaluate(() => gameState.run.transcript);
    assert.ok(afterWin[afterWin.length - 1].indexOf('WON r') === 0, 'expected the newest line to be WON, got: ' + JSON.stringify(afterWin.slice(-2)));

    // Take the Load reward and confirm a LOAD line follows.
    await page.evaluate(() => { dieActionChooseLoad(); });
    const mods = await page.evaluate(() => dieActionMods);
    await page.evaluate((modId) => { dieActionPickMod(modId); }, mods[0]);
    const blankFace = await page.evaluate(() => gameState.die.faces.find((f) => f.modId === null).number);
    await page.evaluate((face) => { dieActionPickLoadFace(face); }, blankFace);
    const afterLoad = await page.evaluate(() => gameState.run.transcript);
    const lastLine = afterLoad[afterLoad.length - 1];
    assert.ok(lastLine.indexOf('LOAD ') === 0, 'expected the newest line to be LOAD, got: ' + lastLine);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (c) — localStorage mirror, emptied by New Run
  // ---------------------------------------------------------------

  await runTest('Item c: the transcript is mirrored to localStorage under dieRunTranscript and emptied by New Run', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dieRunTranscript')));
    const live = await page.evaluate(() => gameState.run.transcript);
    assert.deepStrictEqual(stored, live, 'expected localStorage to mirror gameState.run.transcript exactly');
    assert.ok(live.length > 0, 'expected at least one transcript line after entering the opening fight');

    await page.evaluate(() => { startNewRun(); });
    const storedAfterNewRun = await page.evaluate(() => JSON.parse(localStorage.getItem('dieRunTranscript') || '[]'));
    const liveAfterNewRun = await page.evaluate(() => gameState.run.transcript);
    assert.deepStrictEqual(storedAfterNewRun, [], 'expected New Run to empty the localStorage transcript');
    assert.deepStrictEqual(liveAfterNewRun, [], 'expected New Run to empty gameState.run.transcript');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (d) — Copy Run Record reports and copies both
  // ---------------------------------------------------------------

  await runTest('Item d: Copy Run Record\'s log line reports both counts and the clipboard text carries TRANSCRIPT plus every line', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    // A loss flushes the run record immediately, so a CSV line exists to copy.
    await page.evaluate(() => { updatePlayer({ hp: 0 }); runPhase(gameState.turn.phase); });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      window.__copiedText = null;
      // Intercepts the same shared clipboard helper the real button uses,
      // rather than depending on a granted browser clipboard permission.
      window.copyTextToClipboard = function(text) { window.__copiedText = text; };
    });

    await page.evaluate(() => { document.getElementById('copyRunRecordBtn').click(); });
    await page.waitForTimeout(100);

    const copied = await page.evaluate(() => window.__copiedText);
    const transcript = await page.evaluate(() => gameState.run.transcript);
    assert.ok(copied, 'expected the intercepted clipboard text to be set');
    assert.ok(copied.indexOf('TRANSCRIPT') !== -1, 'expected the clipboard text to contain TRANSCRIPT');
    const afterTranscriptWord = copied.split('TRANSCRIPT\n')[1];
    const transcriptLinesInClipboard = afterTranscriptWord.split('\n').filter((l) => l.length > 0);
    assert.strictEqual(transcriptLinesInClipboard.length, transcript.length, 'expected the clipboard TRANSCRIPT block to carry the same line count as gameState.run.transcript');

    // The app's own log() writes to the #log DOM panel, not the browser
    // devtools console — read the line back from there.
    const reportLine = await page.evaluate(() => {
      const entries = Array.from(document.getElementById('log').children).map((el) => el.textContent);
      return entries.find((t) => t.indexOf('[RUN RECORD] copied') === 0) || null;
    });
    assert.ok(reportLine, 'expected a [RUN RECORD] copied ... log line');
    assert.ok(/record line\(s\)/.test(reportLine), 'expected the log line to report record line(s), got: ' + reportLine);
    assert.ok(/transcript line\(s\)/.test(reportLine), 'expected the log line to report transcript line(s), got: ' + reportLine);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (e) — Play/All log views
  // ---------------------------------------------------------------

  await runTest('Item e: Play view hides [STATE] entries and shows [ROLL] entries; All view shows both; DOM entry count is unchanged', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updateUi({ logOpen: true }); });
    await page.waitForTimeout(100);

    const playView = await page.evaluate(() => {
      const stateEl = document.querySelector('#log .log-state');
      const rollEl = document.querySelector('#log .log-roll');
      return {
        logView: gameState.ui.logView,
        stateHidden: stateEl ? stateEl.offsetParent === null : null,
        rollVisible: rollEl ? rollEl.offsetParent !== null : null,
        count: document.getElementById('log').children.length
      };
    });
    assert.strictEqual(playView.logView, 'play', 'expected the default log view to be play');
    assert.strictEqual(playView.stateHidden, true, 'expected a [STATE] entry to be hidden in Play view');
    assert.strictEqual(playView.rollVisible, true, 'expected a [ROLL] entry to be visible in Play view');

    // Switched silently (not via a real click) so the toggle's own
    // [CLICK]/[STATE] log lines don't skew the before/after DOM count.
    await page.evaluate(() => { updateUi({ logView: 'all' }, true); });
    await page.waitForTimeout(50);
    const allView = await page.evaluate(() => {
      const stateEl = document.querySelector('#log .log-state');
      const rollEl = document.querySelector('#log .log-roll');
      return {
        logView: gameState.ui.logView,
        stateVisible: stateEl ? stateEl.offsetParent !== null : null,
        rollVisible: rollEl ? rollEl.offsetParent !== null : null,
        count: document.getElementById('log').children.length
      };
    });
    assert.strictEqual(allView.logView, 'all', 'expected the log view to flip to all');
    assert.strictEqual(allView.stateVisible, true, 'expected a [STATE] entry to be visible in All view');
    assert.strictEqual(allView.rollVisible, true, 'expected a [ROLL] entry to remain visible in All view');
    assert.strictEqual(allView.count, playView.count, 'expected the same number of DOM entries in both views — nothing is skipped, only hidden');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (f) — log full screen
  // ---------------------------------------------------------------

  await runTest('Item f: logOpen true covers the viewport and shows CLOSE; logOpen false leaves the face row where BUILD 147 put it', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    const faceRowBefore = await page.evaluate(() => document.getElementById('playerDieList').getBoundingClientRect());

    await page.evaluate(() => { updateUi({ logOpen: true }); });
    await page.waitForTimeout(100);
    const openBox = await page.evaluate(() => {
      const r = document.querySelector('.right-col').getBoundingClientRect();
      return { w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight };
    });
    const closeVisible = await page.evaluate(() => document.getElementById('logCloseBtn').offsetParent !== null);
    assert.ok(Math.abs(openBox.w - openBox.vw) <= 2, 'expected the log to cover the viewport width, got ' + openBox.w + ' vs ' + openBox.vw);
    assert.ok(Math.abs(openBox.h - openBox.vh) <= 2, 'expected the log to cover the viewport height, got ' + openBox.h + ' vs ' + openBox.vh);
    assert.strictEqual(closeVisible, true, 'expected the CLOSE button to be visible while the log is open');

    await page.evaluate(() => { document.getElementById('logCloseBtn').click(); });
    await page.waitForTimeout(100);
    const faceRowAfter = await page.evaluate(() => document.getElementById('playerDieList').getBoundingClientRect());
    assert.ok(Math.abs(faceRowBefore.x - faceRowAfter.x) <= 2 && Math.abs(faceRowBefore.y - faceRowAfter.y) <= 2 && Math.abs(faceRowBefore.width - faceRowAfter.width) <= 2,
      'expected the face row to return to its pre-log-open position and size');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (g) — browser zoom is never blocked
  // ---------------------------------------------------------------

  await runTest('Item g: no viewport meta restricts zoom, and applyScale() reads window.innerWidth/innerHeight', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*>/i);
    if (viewportMatch) {
      assert.ok(!/user-scalable\s*=\s*no/i.test(viewportMatch[0]), 'viewport meta must not set user-scalable=no');
      assert.ok(!/maximum-scale/i.test(viewportMatch[0]), 'viewport meta must not set maximum-scale');
    }
    const page = await freshPage(browser);
    const fnSource = await page.evaluate(() => applyScale.toString());
    assert.ok(fnSource.indexOf('window.innerWidth') !== -1, 'expected applyScale() to read window.innerWidth');
    assert.ok(fnSource.indexOf('window.innerHeight') !== -1, 'expected applyScale() to read window.innerHeight');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (h) — no errors
  // ---------------------------------------------------------------

  await runTest('Item h: no page errors and no console errors (art excluded) on the fight screen', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the fight screen: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors on the fight screen: ' + realErrors(page).join('; '));
    await page.close();
  });

  await runTest('Item h: no page errors and no console errors (art excluded) on the map', async () => {
    const page = await freshPage(browser);
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the map: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors on the map: ' + realErrors(page).join('; '));
    await page.close();
  });

  await runTest('Item h: no page errors and no console errors (art excluded) with the log open', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateUi({ logOpen: true }); });
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors with the log open: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors with the log open: ' + realErrors(page).join('; '));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build148 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
