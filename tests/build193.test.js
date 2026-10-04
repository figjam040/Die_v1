// Standing regression suite for BUILD 193: D-159 the act 2 and act 3
// backdrops, D-161 the victory screen and D-162 the three defeat screens
// (shut under automation, opened by ?endscreen=1, closed by New Run).
// Run: node tests/build193.test.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL, freshFightPage, assertNoErrors } = require('./shared-constants');

const { runTest, report } = createRunner();

const ROOT = path.resolve(__dirname, '..');
const BACKDROPS = ['act2', 'act3', 'victory', 'defeat1', 'defeat2', 'defeat3'];
const ART_FILES = ['background_act2.png', 'background_act2_cracks.png', 'background_act2_lava.png', 'background_act2_motion.js',
  'background_act2_ring.png', 'background_act3.png', 'background_act3_core.png', 'background_act3_fall.png', 'background_act3_haze.png',
  'background_act3_motion.js', 'background_act3_threads.png', 'background_defeat1.png', 'background_defeat1_light.png',
  'background_defeat1_motion.js', 'background_defeat2.png', 'background_defeat2_light.png', 'background_defeat2_motion.js',
  'background_defeat3.png', 'background_defeat3_light.png', 'background_defeat3_motion.js', 'background_victory.png',
  'background_victory_haze.png', 'background_victory_light.png', 'background_victory_mist.png', 'background_victory_motion.js',
  'background_victory_purple.png', 'background_victory_sea.png', 'background_victory_word.png'];

async function pageAt(browser, query) {
  const page = await browser.newPage();
  const errors = [];
  page.on('dialog', function(d) { d.accept(); });
  page.on('pageerror', err => errors.push(err.message));
  // A missing art/*.png is the expected fallback, as in freshFightPage().
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) errors.push(msg.text());
  });
  await page.goto(FILE_URL + query);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  page._errors = errors;
  return page;
}

function shown(page, id) {
  return page.evaluate((id) => getComputedStyle(document.getElementById(id)).display, id);
}

function loseInAct(page, act) {
  return page.evaluate((act) => { updateRun({ actNumber: act }); updatePlayer({ hp: 0 }); runPhase('CHECK_WIN_LOSS'); }, act);
}

function winRun(page) {
  return page.evaluate(() => {
    updateRun({ actNumber: GAME_CONFIG.ACTS, currentSlot: 'boss' });
    updateEnemy({ hp: 0 });
    runPhase('CHECK_WIN_LOSS');
  });
}

(async () => {
  const browser = await chromium.launch();

  await runTest('D-159 the 28 art files are in place and backups/incoming/ is gone', async () => {
    ART_FILES.forEach(function(f) { assert.ok(fs.existsSync(path.join(ROOT, 'art', f)), 'missing art/' + f); });
    assert.ok(!fs.existsSync(path.join(ROOT, 'backups', 'incoming')), 'backups/incoming/ still present');
    assert.ok(fs.existsSync(path.join(ROOT, 'backups', 'backdrop_kit')), 'backups/backdrop_kit/ left alone');
    assert.strictEqual(fs.readdirSync(path.join(ROOT, 'js')).filter(function(f) { return f.endsWith('.js'); }).length, 16);
  });

  await runTest('D-159 every new backdrop registers and every layer picture it names exists; the defeats play once', async () => {
    const page = await freshFightPage(browser);
    for (const name of BACKDROPS) {
      const def = await page.evaluate((name) => new Promise(function(done) { backdropMotionLoadDef(name, done); }), name);
      assert.ok(def, 'no definition registered for ' + name);
      assert.strictEqual(def.still, 'art/background_' + name + '.png');
      const paths = [def.still];
      def.effects.forEach(function(e) { [e.layer, e.litLayer].forEach(function(p) { if (p) paths.push(p); }); });
      paths.forEach(function(p) { assert.ok(fs.existsSync(path.join(ROOT, p)), name + ' names missing ' + p); });
      if (name.indexOf('defeat') === 0) assert.strictEqual(def.once, true, name + ' plays once');
    }
    assertNoErrors(page);
    await page.close();
  });

  for (const act of [2, 3]) {
    await runTest('D-159 act ' + act + ' fight: its backdrop canvas shows at 40 percent, one frozen frame', async () => {
      const page = await freshFightPage(browser);
      await page.waitForFunction(() => document.getElementById('actBackgroundCanvas').style.display === 'block');
      await page.evaluate((act) => { updateRun({ actNumber: act }); renderActBackground(); }, act);
      await page.waitForFunction((act) => {
        const still = BACKDROP_MOTION.images['art/background_act' + act + '.png'], c = document.getElementById('actBackgroundCanvas');
        return still && still.naturalWidth > 0 && c.style.display === 'block' && c.width === still.naturalWidth;
      }, act);
      const v = await page.evaluate(() => ({ raf: BACKDROP_MOTION.raf, live: BACKDROP_MOTION.live.length, opacity: getComputedStyle(document.getElementById('actBackgroundCanvas')).opacity }));
      assert.deepStrictEqual([v.raf, v.live, v.opacity], [0, 1, '0.4']);
      assertNoErrors(page);
      await page.close();
    });
  }

  await runTest('D-161 D-162 under automation a loss and a win leave the end screen shut', async () => {
    const lost = await freshFightPage(browser);
    await loseInAct(lost, 1);
    assert.strictEqual(await lost.evaluate(() => gameState.run.outcome), 'lost');
    assert.strictEqual(await shown(lost, 'endScreen'), 'none');
    assertNoErrors(lost);
    await lost.close();
    const won = await freshFightPage(browser);
    await winRun(won);
    assert.strictEqual(await won.evaluate(() => gameState.run.outcome), 'won');
    assert.strictEqual(await shown(won, 'endScreen'), 'none');
    assertNoErrors(won);
    await won.close();
  });

  await runTest('D-162 ?endscreen=1: a loss in act 2 plays defeat2, then DEFEAT and the buttons; Copy copies, New Run resets', async () => {
    const page = await pageAt(browser, '?endscreen=1');
    await loseInAct(page, 2);
    const open = await page.evaluate(() => {
      const s = document.getElementById('endScreen');
      return { display: getComputedStyle(s).display, z: getComputedStyle(s).zIndex, word: document.getElementById('endWord').textContent, ready: s.classList.contains('end-ready') };
    });
    assert.deepStrictEqual([open.display, open.z, open.word, open.ready], ['block', '2000', 'DEFEAT', false]);
    await page.waitForFunction(() => document.getElementById('endCanvas').style.display === 'block');
    assert.ok(await page.evaluate(() => BACKDROP_MOTION.live.some(function(e) { return e.canvas.id === 'endCanvas'; })), 'end canvas is live');
    assert.ok(await page.evaluate(() => BACKDROP_MOTION.images['art/background_defeat2.png'].naturalWidth > 0), 'defeat2 still loaded');
    await page.waitForFunction(() => document.getElementById('endScreen').classList.contains('end-ready'), null, { timeout: 15000 });
    await page.click('#endCopyBtn');
    assert.ok(await page.evaluate(() => document.getElementById('log').textContent.indexOf('[CLICK] Copy Run Record') !== -1), 'Copy forwards to the run record button');
    await page.click('#endNewRunBtn');
    const after = await page.evaluate(() => ({
      log: document.getElementById('log').textContent.indexOf('[CLICK] New Run (end screen)') !== -1,
      outcome: gameState.run.outcome, screen: gameState.run.screen, hp: gameState.player.hp, maxHp: gameState.player.maxHp,
      live: BACKDROP_MOTION.live.some(function(e) { return e.canvas.id === 'endCanvas'; })
    }));
    assert.strictEqual(await shown(page, 'endScreen'), 'none');
    assert.deepStrictEqual([after.log, after.outcome, after.screen, after.hp, after.live], [true, 'active', 'map', after.maxHp, false]);
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await runTest('D-161 ?endscreen=1: the final boss win plays victory with no word', async () => {
    const page = await pageAt(browser, '?endscreen=1');
    await winRun(page);
    assert.strictEqual(await shown(page, 'endScreen'), 'block');
    assert.strictEqual(await page.evaluate(() => document.getElementById('endWord').textContent), '');
    await page.waitForFunction(() => document.getElementById('endScreen').classList.contains('end-ready'), null, { timeout: 15000 });
    assert.ok(await page.evaluate(() => BACKDROP_MOTION.images['art/background_victory.png'].naturalWidth > 0), 'victory still loaded');
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await browser.close();
  const failed = report('BUILD 193');
  process.exit(failed > 0 ? 1 : 0);
})();
