// ============================================================
// TESTS/BUILD144.TEST.JS — BUILD 144
// Standing regression suite for BUILD 144's skin pass: fonts (item 4),
// palette (item 5), the log toggle (item 6), the phase badge's underscore
// -free text (item 7), stepped motion (item 8), plus every face-btn/hand
// card carrying a non-empty title and every BUILD 143 element id still
// present. Same shape as tests/build142.test.js: plain Node script,
// playwright launched directly, node:assert. Run: node tests/build144.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

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

async function freshPage(browser) {
  const page = await browser.newPage();
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

// The full list of element ids present in index.html at BUILD 143 (head
// a86f202) — `git show a86f202:index.html | grep -oE 'id="[^"]+"'`.
const BUILD143_IDS = [
  'actStamp', 'buildStamp', 'buildStampNumber', 'cardRewardPanel', 'copyRunRecordBtn',
  'devApplyPoisonBtn', 'devBeginRollBtn', 'devChrome', 'devChromeToggleBtn', 'devClearFaceBtn',
  'devFaceInput', 'devIntentBreakInput', 'devIntentKindSelect', 'devIntentMaxInput',
  'devIntentMinInput', 'devIntentReleaseInput', 'devIntentStacksInput', 'devLoadAllBtn',
  'devLoadModBtn', 'devModLoader', 'devModSelect', 'devMuteAudioCheckbox', 'devNextPhaseBtn',
  'devPauseBeforeRollCheckbox', 'devPauseControl', 'devPoisonApplier', 'devPoisonInput',
  'devPoisonTargetSelect', 'devRestartFightBtn', 'devSetIntent', 'devSetIntentBtn',
  'devSetTestDieBtn', 'devSkipToCardRewardBtn', 'devSkipToDieActionBtn', 'devStepControl',
  'devTestDie', 'devTestDieBuffSelect', 'devTestDieSizeSelect', 'dieActionPanel', 'endTurnBtn',
  'enemyActiveValue', 'enemyBuffsValue', 'enemyDieList', 'enemyHpValue', 'enemyIntentLabel',
  'enemyIntentValue', 'enemyNameLine', 'enemyNameValue', 'enemyPanel', 'enemyPanelTitle',
  'enemyPoisonValue', 'enemyReadLine', 'enemyReadValue', 'enemyWrathLine', 'enemyWrathValue',
  'fightScreen', 'handRow', 'inspector', 'inspectorContent', 'inspectorToggleBtn', 'log',
  'mapScreen', 'phaseBadge', 'playerBlockValue', 'playerDebuffsValue', 'playerDeckValue',
  'playerDieList', 'playerDiscardValue', 'playerDrainLine', 'playerDrainValue', 'playerHpValue',
  'playerPanel', 'playerSoulValue', 'registryInspector', 'registryInspectorContent',
  'registryInspectorToggleBtn', 'resultBanner', 'riteScreenPanel', 'rollHero',
  'rollResultLabel', 'rollResultNumber', 'roundValue', 'startGameBtn'
];

const TIMING_FN_PATTERN = /\b(ease-in-out|ease-in|ease-out|ease|linear)\b/;

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM 4 — fonts
  // ---------------------------------------------------------------

  await runTest('Item 4: both font files exist and are larger than 10 kB', async () => {
    const pressStart = path.join(ROOT, 'fonts', 'PressStart2P-Regular.ttf');
    const vt323 = path.join(ROOT, 'fonts', 'VT323-Regular.ttf');
    assert.ok(fs.existsSync(pressStart), 'fonts/PressStart2P-Regular.ttf must exist');
    assert.ok(fs.existsSync(vt323), 'fonts/VT323-Regular.ttf must exist');
    assert.ok(fs.statSync(pressStart).size > 10000, 'PressStart2P-Regular.ttf must be larger than 10 kB');
    assert.ok(fs.statSync(vt323).size > 10000, 'VT323-Regular.ttf must be larger than 10 kB');
  });

  await runTest('Item 4: index.html contains both @font-face rules', () => {
    assert.ok(/@font-face\s*\{\s*font-family:\s*'Press Start 2P'/.test(INDEX_HTML), 'must declare the Press Start 2P @font-face rule');
    assert.ok(/@font-face\s*\{\s*font-family:\s*'VT323'/.test(INDEX_HTML), 'must declare the VT323 @font-face rule');
  });

  await runTest('Item 4: getComputedStyle(document.body).fontFamily starts with VT323', async () => {
    const page = await freshPage(browser);
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    assert.ok(fontFamily.replace(/['"]/g, '').trim().startsWith('VT323'), 'body font-family must start with VT323, got: ' + fontFamily);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 5 — palette
  // ---------------------------------------------------------------

  await runTest('Item 5: body background is rgb(0, 0, 0)', async () => {
    const page = await freshPage(browser);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.strictEqual(bg, 'rgb(0, 0, 0)');
    await page.close();
  });

  await runTest('Item 5: #enemyPanel and #playerPanel match the body background', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const colours = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      enemy: getComputedStyle(document.getElementById('enemyPanel')).backgroundColor,
      player: getComputedStyle(document.getElementById('playerPanel')).backgroundColor
    }));
    assert.strictEqual(colours.enemy, colours.body, '#enemyPanel background must match body');
    assert.strictEqual(colours.player, colours.body, '#playerPanel background must match body');
    await page.close();
  });

  await runTest('Item 5: #playerHpValue computed colour is rgb(248, 113, 113)', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const colour = await page.evaluate(() => getComputedStyle(document.getElementById('playerHpValue')).color);
    assert.strictEqual(colour, 'rgb(248, 113, 113)');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 6 — log toggle
  // ---------------------------------------------------------------

  await runTest('Item 6: on load hidden, one column, then toggles open/closed, then still hidden after New Run', async () => {
    const page = await freshPage(browser);

    let state = await page.evaluate(() => {
      const log = document.getElementById('log');
      const app = document.querySelector('.app');
      return {
        logVisible: log.offsetParent !== null,
        columns: getComputedStyle(app).gridTemplateColumns
      };
    });
    assert.strictEqual(state.logVisible, false, '#log must be hidden by default');
    assert.ok(state.columns.trim().split(/\s+/).length === 1, '.app must be one column by default, got: ' + state.columns);

    await page.click('#logToggleBtn');
    state = await page.evaluate(() => ({
      logVisible: document.getElementById('log').offsetParent !== null,
      btnText: document.getElementById('logToggleBtn').textContent
    }));
    assert.strictEqual(state.logVisible, true, '#log must be visible after one click');
    assert.strictEqual(state.btnText, 'LOG ▾');

    await page.click('#logToggleBtn');
    state = await page.evaluate(() => ({
      logVisible: document.getElementById('log').offsetParent !== null,
      btnText: document.getElementById('logToggleBtn').textContent
    }));
    assert.strictEqual(state.logVisible, false, '#log must be hidden after a second click');
    assert.strictEqual(state.btnText, 'LOG ▸');

    await page.click('#startGameBtn');
    await page.waitForFunction(() => gameState.run.screen === 'map');
    state = await page.evaluate(() => document.getElementById('log').offsetParent !== null);
    assert.strictEqual(state, false, '#log must still be hidden after New Run and reaching the map');
    await page.close();
  });

  await runTest('Item 6: the flag holds across the fight screen and across fights within one page load', async () => {
    const page = await freshPage(browser);
    await page.click('#logToggleBtn'); // open
    await enterOpeningFight(page);
    let logVisible = await page.evaluate(() => document.getElementById('log').offsetParent !== null);
    assert.strictEqual(logVisible, true, 'log must stay open once the fight screen is reached');

    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    await page.waitForFunction(() => dieActionStep !== null);
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.waitForFunction(() => cardRewardStep !== null);
    await page.evaluate(() => { cardRewardSkip(); });
    await page.waitForFunction(() => gameState.run.screen === 'map');
    logVisible = await page.evaluate(() => document.getElementById('log').offsetParent !== null);
    assert.strictEqual(logVisible, true, 'log must still be open across a fight win/reward flow, within the same page load');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 7 — phase badge text
  // ---------------------------------------------------------------

  await runTest('Item 7: #phaseBadge textContent contains no underscore during a fight', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    for (let i = 0; i < 8; i++) {
      const text = await page.evaluate(() => document.getElementById('phaseBadge').textContent);
      assert.ok(text.indexOf('_') === -1, 'phase badge text must contain no underscore, got: ' + text);
      const done = await page.evaluate(() => gameState.run.status !== 'active');
      if (done) break;
      await page.evaluate(() => { nextPhase(); });
    }
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 8 — stepped motion
  // ---------------------------------------------------------------

  await runTest('Item 8: no transition or animation rule names ease/ease-in/ease-out/ease-in-out/linear', () => {
    const styleBlock = INDEX_HTML.slice(INDEX_HTML.indexOf('<style>'), INDEX_HTML.indexOf('</style>'));
    const offenders = [];
    styleBlock.split('\n').forEach(function(line, idx) {
      if (/(transition|animation)\s*:/.test(line) && TIMING_FN_PATTERN.test(line)) {
        offenders.push((idx + 1) + ': ' + line.trim());
      }
    });
    assert.strictEqual(offenders.length, 0, 'found eased/linear timing functions:\n' + offenders.join('\n'));
  });

  // ---------------------------------------------------------------
  // Face-btn / hand-card titles, and the BUILD 143 id inventory
  // ---------------------------------------------------------------

  await runTest('Item 9: every .face-btn in #playerDieList has a non-empty title', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#playerDieList .face-btn')).map(b => b.title)
    );
    assert.ok(titles.length > 0, 'expected at least one face-btn in #playerDieList');
    titles.forEach(function(t, i) { assert.ok(t && t.length > 0, 'face ' + (i + 1) + ' must have a non-empty title'); });
    await page.close();
  });

  await runTest('Item 9: every hand card has a non-empty title', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#handRow .hand-card-el')).map(b => b.title)
    );
    assert.ok(titles.length > 0, 'expected at least one card in hand');
    titles.forEach(function(t, i) { assert.ok(t && t.length > 0, 'hand card ' + (i + 1) + ' must have a non-empty title'); });
    await page.close();
  });

  await runTest('Item 9: every BUILD 143 element id still exists', async () => {
    const page = await freshPage(browser);
    const missing = await page.evaluate((ids) => ids.filter(id => !document.getElementById(id)), BUILD143_IDS);
    assert.deepStrictEqual(missing, [], 'these BUILD 143 ids are missing: ' + missing.join(', '));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build144 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
