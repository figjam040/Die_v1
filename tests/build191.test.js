// Standing regression suite for BUILD 191: D-159 moving backdrops (the act
// backdrop drawn on #actBackgroundCanvas, one frozen frame under automation,
// the still kept when no motion file exists) and D-158 the title screen
// (shut under automation, opened by ?title=1, closed by Start).
// Canvas pixels are never read here: file:// pictures taint the canvas.
// Run: node tests/build191.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createRunner, FILE_URL, freshFightPage, assertNoErrors } = require('./shared-constants');

const { runTest, report } = createRunner();

const ART = path.resolve(__dirname, '..', 'art');
const BACKDROPS = ['act1', 'title'];

async function pageAt(browser, query) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  // A missing art/*.png is the expected fallback, as in freshFightPage().
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) errors.push(msg.text());
  });
  await page.goto(FILE_URL + query);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  page._errors = errors;
  return page;
}

function shown(page, id) {
  return page.evaluate((id) => getComputedStyle(document.getElementById(id)).display, id);
}

(async () => {
  const browser = await chromium.launch();

  await runTest('D-159 the nine files are in place and backdrop-motion.js loads before dev-tools.js', async () => {
    ['background_act1.png', 'background_act1_light.png', 'background_act1_haze.png', 'background_act1_motion.js',
      'background_title.png', 'background_title_glow.png', 'background_title_lava.png', 'background_title_motion.js']
      .forEach(function(f) { assert.ok(fs.existsSync(path.join(ART, f)), 'missing art/' + f); });
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', 'js', 'backdrop-motion.js')));
    assert.ok(!fs.existsSync(path.resolve(__dirname, '..', 'backups', 'incoming')), 'backups/incoming/ still present');
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const a = html.indexOf('js/render-text.js'), b = html.indexOf('js/backdrop-motion.js'), c = html.indexOf('js/dev-tools.js');
    assert.ok(a < b && b < c, 'backdrop-motion.js sits between render-text.js and dev-tools.js');
  });

  await runTest('D-159 every layer picture a motion file names exists in art/', async () => {
    const page = await pageAt(browser, '');
    for (const name of BACKDROPS) {
      const def = await page.evaluate((name) => new Promise(function(done) { backdropMotionLoadDef(name, done); }), name);
      assert.ok(def, 'no definition registered for ' + name);
      assert.strictEqual(def.still, 'art/background_' + name + '.png');
      const paths = [def.still];
      def.effects.forEach(function(e) { [e.layer, e.litLayer].forEach(function(p) { if (p) paths.push(p); }); });
      paths.forEach(function(p) { assert.ok(fs.existsSync(path.resolve(__dirname, '..', p)), name + ' names missing ' + p); });
    }
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await runTest('D-159 act 1 fight: the canvas takes over from the still, one frozen frame, no animation loop', async () => {
    const page = await freshFightPage(browser);
    await page.waitForFunction(() => document.getElementById('actBackgroundCanvas').style.display === 'block');
    const v = await page.evaluate(() => {
      const c = document.getElementById('actBackgroundCanvas'), still = BACKDROP_MOTION.images['art/background_act1.png'];
      return { w: c.width, h: c.height, sw: still.naturalWidth, sh: still.naturalHeight, raf: BACKDROP_MOTION.raf, live: BACKDROP_MOTION.live.length, opacity: getComputedStyle(c).opacity };
    });
    assert.strictEqual(await shown(page, 'actBackgroundImg'), 'none');
    assert.deepStrictEqual([v.w, v.h], [v.sw, v.sh], 'canvas sized to the still');
    assert.strictEqual(v.raf, 0, 'no requestAnimationFrame loop under automation');
    assert.strictEqual(v.live, 1);
    assert.strictEqual(v.opacity, '0.4', 'the act-background class keeps its 40 percent opacity');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-159 ?motion=1 starts the animation loop under automation', async () => {
    const page = await pageAt(browser, '?motion=1');
    await page.evaluate(() => { enterSlot('opening', null); });
    await page.waitForFunction(() => BACKDROP_MOTION.raf !== 0);
    assert.strictEqual(await shown(page, 'actBackgroundCanvas'), 'block');
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await runTest('D-97 an act with no backdrop picture hides both the still and the canvas', async () => {
    const page = await freshFightPage(browser);
    await page.waitForFunction(() => document.getElementById('actBackgroundCanvas').style.display === 'block');
    await page.evaluate(() => { updateRun({ actNumber: 9 }); renderActBackground(); });
    await page.waitForFunction(() => document.getElementById('actBackgroundImg').style.display === 'none');
    assert.strictEqual(await shown(page, 'actBackgroundCanvas'), 'none');
    assert.strictEqual(await page.evaluate(() => BACKDROP_MOTION.live.length), 0, 'the act canvas left the live list');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-158 under automation the title screen stays shut', async () => {
    const page = await pageAt(browser, '');
    assert.strictEqual(await shown(page, 'titleScreen'), 'none');
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await runTest('D-158 ?title=1 opens the title over the map; Start closes it and logs the click', async () => {
    const page = await pageAt(browser, '?title=1');
    assert.notStrictEqual(await shown(page, 'titleScreen'), 'none');
    await page.waitForFunction(() => document.getElementById('titleCanvas').style.display === 'block');
    const v = await page.evaluate(() => {
      const r = document.getElementById('titleStartBtn').getBoundingClientRect(), s = document.getElementById('titleScreen');
      return { z: getComputedStyle(s).zIndex, pos: getComputedStyle(s).position, btnVisible: r.width > 0 && r.height > 0, img: document.getElementById('titleStillImg').style.display };
    });
    assert.deepStrictEqual([v.z, v.pos, v.btnVisible, v.img], ['2000', 'fixed', true, 'none']);
    assert.strictEqual(await page.evaluate(() => gameState.run.screen), 'map', 'the run underneath already started');
    await page.click('#titleStartBtn');
    assert.strictEqual(await shown(page, 'titleScreen'), 'none');
    assert.ok(await page.evaluate(() => document.getElementById('log').textContent.indexOf('[CLICK] Start') !== -1), 'Start click logged');
    assert.ok(await page.evaluate(() => BACKDROP_MOTION.live.every(function(e) { return e.canvas.id !== 'titleCanvas'; })), 'title canvas stopped');
    assert.deepStrictEqual(page._errors, []);
    await page.close();
  });

  await browser.close();
  const failed = report('BUILD 191');
  process.exit(failed > 0 ? 1 : 0);
})();
