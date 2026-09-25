// Standing regression suite for BUILD 175: rendering.js split into four
// render files, the permanent F26 name-collision and script-tag checks,
// and the split's screens rendering exactly as BUILD 174's did.
// The reference is BUILD 174's own commit (519abc3), read out of git into
// test-results/, so the test never depends on a folder outside the repo.
// Run: node tests/build175.test.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { createRunner, topLevelNames, FILE_URL } = require('./shared-constants');
const { diffPNGs } = require('./pngdiff');

const ROOT = path.resolve(__dirname, '..');
const REF_COMMIT = '519abc3';
const REF_DIR = path.join(ROOT, 'test-results', 'build175-ref');
const SHOT_DIR = path.join(ROOT, 'test-results', 'build175-shots');
const RENDER_FILE_MAX_LINES = 1500;
const RENDER_FILES = ['rendering.js', 'render-fight.js', 'render-map.js', 'render-layers.js', 'render-text.js'];
const LOAD_ORDER = ['config', 'state', 'listener-registry', 'audio', 'pipeline', 'cards-mods', 'run-and-map', 'phase-machine',
  'rendering', 'render-fight', 'render-map', 'render-layers', 'render-text', 'dev-tools', 'bootstrap'];
const SEED = 175;

const { runTest, report } = createRunner();
const countLines = (file) => fs.readFileSync(file, 'utf8').split('\n').length - 1;

// Writes BUILD 174's index.html, js/, fonts/ and art/ into REF_DIR, byte for
// byte from the commit, binary files included.
function extractReference() {
  fs.rmSync(REF_DIR, { recursive: true, force: true });
  const list = execFileSync('git', ['ls-tree', '-r', '--name-only', REF_COMMIT, '--', 'index.html', 'js', 'fonts', 'art'], { cwd: ROOT, encoding: 'utf8' });
  list.split('\n').filter(Boolean).forEach(function(rel) {
    const out = path.join(REF_DIR, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, execFileSync('git', ['show', REF_COMMIT + ':' + rel], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }));
  });
}

function seededRandom(seed) {
  let s = seed >>> 0;
  Math.random = function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', function(err) { errors.push('page: ' + err.message); });
  page.on('console', function(msg) {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) errors.push('console: ' + msg.text());
  });
  return errors;
}

// The map on load, then the opening fight paused in ROLL_PHASE, the same
// steps tests/screenshots.js takes. No face is strengthened: BUILD 176
// replaced the weight fill with a line. The build stamp is hidden in both
// shots, the one place the two builds may differ.
async function shootMapAndFight(browser, url, label) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = watchErrors(page);
  await page.addInitScript(seededRandom, SEED);
  await page.goto(url);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => document.fonts.ready);
  const hideStamp = () => { document.getElementById('buildStamp').style.visibility = 'hidden'; };
  await page.evaluate(hideStamp);
  await page.waitForTimeout(300);
  const mapPath = path.join(SHOT_DIR, label + '_map.png');
  await page.screenshot({ path: mapPath });

  await page.evaluate(() => { devChromeOpen = true; devPauseBeforeFirstRoll = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN');
  await page.evaluate(() => { nextPhase(); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate(hideStamp);
  await page.waitForTimeout(300);
  const fightPath = path.join(SHOT_DIR, label + '_fight.png');
  await page.screenshot({ path: fightPath });
  await page.close();
  return { mapPath, fightPath, errors };
}

(async () => {
  await runTest('the four render files exist and each, with rendering.js, is under ' + RENDER_FILE_MAX_LINES + ' lines', async () => {
    RENDER_FILES.forEach(function(f) {
      const file = path.join(ROOT, 'js', f);
      assert.ok(fs.existsSync(file), 'js/' + f + ' missing');
      const lines = countLines(file);
      assert.ok(lines < RENDER_FILE_MAX_LINES, 'js/' + f + ' is ' + lines + ' lines');
    });
  });

  await runTest('index.html loads the fifteen js/ files in the recorded order', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    const order = Array.from(html.matchAll(/<script src="js\/([a-z-]+)\.js"><\/script>/g)).map(function(m) { return m[1]; });
    assert.deepStrictEqual(order, LOAD_ORDER);
  });

  await runTest('no top-level name is declared in two js/ files, or twice in one', async () => {
    const where = {};
    fs.readdirSync(path.join(ROOT, 'js')).filter(function(f) { return f.endsWith('.js'); }).forEach(function(f) {
      topLevelNames(fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')).forEach(function(name) {
        (where[name] = where[name] || []).push(f);
      });
    });
    const dupes = Object.keys(where).filter(function(name) { return where[name].length > 1; });
    assert.ok(Object.keys(where).length > 300, 'only ' + Object.keys(where).length + ' names found');
    assert.deepStrictEqual(dupes.map(function(name) { return name + ': ' + where[name].join(', '); }), []);
  });

  const browser = await chromium.launch();

  await runTest('the map and fight screens are pixel-identical to BUILD 174 apart from the build stamp', async () => {
    extractReference();
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const refUrl = 'file://' + path.join(REF_DIR, 'index.html').replace(/\\/g, '/');
    const ref = await shootMapAndFight(browser, refUrl, 'build174');
    const cur = await shootMapAndFight(browser, FILE_URL, 'build175');
    assert.deepStrictEqual(ref.errors.concat(cur.errors), []);
    ['mapPath', 'fightPath'].forEach(function(key) {
      const d = diffPNGs(ref[key], cur[key]);
      assert.ok(d.comparable, key + ' not comparable: ' + d.reason);
      assert.strictEqual(d.changedPixels, 0, key + ': ' + d.changedPixels + ' pixels differ');
    });
  });

  await runTest('hovering a face, the DIE layer, one Load offer and the map render without console or page errors', async () => {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    const errors = watchErrors(page);
    page.on('dialog', function(d) { d.accept(); });
    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
    await page.evaluate(() => { devPauseBeforeFirstRoll = true; enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN');
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');

    await page.hover('#playerDieList .die-row:has(.face-num:text-is("10")) .face-btn');
    const tip = await page.evaluate(() => [...document.querySelectorAll('#playerDieList .hover-tip')]
      .filter((t) => getComputedStyle(t).visibility === 'visible').map((t) => t.textContent));
    assert.strictEqual(tip.length, 1, 'one face hover box shows');
    assert.ok(/Consecrate/.test(tip[0]), 'face 10 hover names Consecrate: ' + tip[0]);

    await page.click('#dieInfoBtn');
    const dieRows = await page.evaluate(() => getComputedStyle(document.getElementById('dieInfoLayer')).display !== 'none' &&
      document.querySelectorAll('#dieInfoContent .info-table-row').length);
    assert.strictEqual(dieRows, 20, 'DIE layer shows a table row for each of the 20 faces');
    await page.click('#dieInfoCloseBtn');

    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    await page.waitForFunction(() => dieActionStep === 'choose');
    await page.click('#dieActionPanel button:text-is("Load")');
    await page.waitForFunction(() => dieActionStep === 'load_pick_mod');
    assert.strictEqual(await page.locator('#dieActionPanel .offer-symbol').count(), 3, 'the Load offer shows three symbols');
    await page.locator('#dieActionPanel .offer-symbol').first().click();
    await page.waitForFunction(() => dieActionStep === 'load_pick_face');
    await page.locator('#playerDieList .die-row-pickable').first().click();
    await page.waitForFunction(() => cardRewardStep !== null);
    await page.click('#cardRewardPanel .offer-skip');
    await page.waitForFunction(() => gameState.run.screen === 'map');
    assert.ok(await page.locator('#mapScreen .map-node').count() > 10, 'the map draws its nodes');
    assert.deepStrictEqual(errors, []);
    await page.close();
  });

  await browser.close();
  process.exit(report('build175') > 0 ? 1 : 0);
})();
