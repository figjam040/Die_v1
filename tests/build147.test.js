// ============================================================
// TESTS/BUILD147.TEST.JS
// Standing regression suite for BUILD 147: the intent hover box (game-font
// .hover-tip, not a native title), the narrowed console filter (drops only
// a missing art/*.png, not any other missing resource), the rolled-face
// hold for a blank roll, and the die icon number's black backing. Same
// shape as tests/build146.test.js: plain Node script, playwright launched
// directly, node:assert. Run: node tests/build147.test.js
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
  // location().url carries the failing resource's own path — msg.text()
  // itself never includes it for a "Failed to load resource" line.
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

async function rowHasClass(page, containerId, faceNumber, className) {
  return page.evaluate(({ containerId, faceNumber, className }) => {
    const rows = Array.from(document.getElementById(containerId).querySelectorAll('.die-row'));
    const row = rows.find((r) => parseInt(r.querySelector('.face-num').textContent, 10) === faceNumber);
    return row ? row.classList.contains(className) : false;
  }, { containerId, faceNumber, className });
}

// Extracts the literal "is this an art/*.png failure" predicate from a
// test file's own console filter, so this test exercises the real code —
// never a re-implementation of the same logic living in a second place.
function extractArtFailurePredicate(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  let match = source.match(/const isArtFailure = ([^;]+);/);
  let expr;
  if (match) {
    expr = match[1];
  } else {
    match = source.match(/!\((\w+\.text\.indexOf\([^;]*!== -1)\)\)/);
    if (!match) throw new Error('could not find the art-failure filter predicate in ' + filePath);
    expr = match[1];
  }
  expr = expr
    .replace(/msg\.text\(\)/g, 'text')
    .replace(/msg\.location\(\)\.url/g, 'url')
    .replace(/m\.text/g, 'text')
    .replace(/m\.url/g, 'url');
  return new Function('text', 'url', 'return (' + expr + ');');
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM (a) — intent hover box
  // ---------------------------------------------------------------

  await runTest('Item a: the intent icon and value share one hover-tip sentence, starting with the kind word, and carry no title attribute', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const iconTip = document.querySelector('#enemyIntentIcon .hover-tip');
      const valueTip = document.querySelector('#enemyIntentValue .hover-tip');
      return {
        iconTipText: iconTip ? iconTip.textContent : null,
        valueTipText: valueTip ? valueTip.textContent : null,
        iconHasTitle: document.getElementById('enemyIntentIcon').hasAttribute('title'),
        valueHasTitle: document.getElementById('enemyIntentValue').hasAttribute('title')
      };
    });
    assert.strictEqual(v.iconTipText, v.valueTipText, 'icon hover-tip text must equal value hover-tip text, got "' + v.iconTipText + '" vs "' + v.valueTipText + '"');
    assert.ok(v.iconTipText, 'expected a non-empty hover-tip sentence');
    assert.ok(
      /^(Attack:|Charge:|Afflict:)/.test(v.iconTipText),
      'expected the hover-tip sentence to start with Attack:, Charge: or Afflict:, got "' + v.iconTipText + '"'
    );
    assert.strictEqual(v.iconHasTitle, false, '#enemyIntentIcon must not carry a title attribute');
    assert.strictEqual(v.valueHasTitle, false, '#enemyIntentValue must not carry a title attribute');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (b) — narrowed console filter
  // ---------------------------------------------------------------

  const FILTER_FILES = [
    'tests/autoplay.js',
    'tests/shared-constants.js',
    'tests/screenshots.js',
    'tests/build146.test.js'
  ];

  for (const relPath of FILTER_FILES) {
    await runTest('Item b: ' + relPath + ' drops a Failed to load resource under art/, keeps one under js/', async () => {
      const predicate = extractArtFailurePredicate(path.join(ROOT, relPath));
      const artDrop = predicate('Failed to load resource: net::ERR_FILE_NOT_FOUND', 'file:///C:/Users/figja/Die_v1/art/verger.png');
      const jsKeep = predicate('Failed to load resource: net::ERR_FILE_NOT_FOUND', 'file:///C:/Users/figja/Die_v1/js/config.js');
      assert.strictEqual(artDrop, true, relPath + ' must treat a missing art/*.png as an expected fallback (dropped)');
      assert.strictEqual(jsKeep, false, relPath + ' must NOT drop a missing js/*.js resource — that is a real failure');
    });
  }

  // ---------------------------------------------------------------
  // ITEM (c) — rolled face holds, blank and loaded alike
  // ---------------------------------------------------------------

  await runTest('Item c: a blank rolled face and a loaded rolled face both hold die-row-rolled past 600ms', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { devChromeOpen = true; });

    // Face 2 starts blank on a fresh Ordained die.
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.waitForTimeout(650);
    await page.evaluate(() => { refreshInspector(); });
    const blankHolds = await rowHasClass(page, 'playerDieList', 2, 'die-row-rolled');
    const blankStillFlashing = await rowHasClass(page, 'playerDieList', 2, 'die-row-rolled-blank-flash');
    assert.strictEqual(blankHolds, true, 'a blank rolled face must carry die-row-rolled after 600ms');
    assert.strictEqual(blankStillFlashing, false, 'a blank rolled face must not still carry the flash class after 600ms');

    // Drive a full real round (CARD_PHASE -> ... -> the next ROLL_PHASE)
    // via nextPhase(), the same transitions End Turn/auto-advance use.
    let reachedRollPhase = false;
    for (let i = 0; i < 10; i++) {
      const r = await page.evaluate(() => { nextPhase(); return { phase: gameState.turn.phase, status: gameState.run.status }; });
      if (r.phase === 'ROLL_PHASE') { reachedRollPhase = true; break; }
      assert.notStrictEqual(r.status, 'loss', 'player died mid-test (unexpected) — phase stuck at ' + r.phase);
    }
    assert.ok(reachedRollPhase, 'did not reach the second round\'s ROLL_PHASE within 10 phase steps');

    // Face 10 carries the Ordained's own anchor, Consecrate, from run start.
    await page.evaluate(() => { forcePlayerRoll(10); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.waitForTimeout(650);
    await page.evaluate(() => { refreshInspector(); });
    const loadedHolds = await rowHasClass(page, 'playerDieList', 10, 'die-row-rolled');
    const loadedStillFlashing = await rowHasClass(page, 'playerDieList', 10, 'die-row-rolled-flash');
    assert.strictEqual(loadedHolds, true, 'a loaded rolled face must carry die-row-rolled after 600ms');
    assert.strictEqual(loadedStillFlashing, false, 'a loaded rolled face must not still carry the flash class after 600ms');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (d) — die icon number legibility
  // ---------------------------------------------------------------

  await runTest('Item d: .die-icon-number is 26px and its number sits on a black backing', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { devChromeOpen = true; forcePlayerRoll(10); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => {
      const numEl = document.querySelector('#playerDieIcon .die-icon-number');
      const backingEl = document.querySelector('#playerDieIcon .die-icon-number-text');
      return {
        fontSize: numEl ? getComputedStyle(numEl).fontSize : null,
        backingBg: backingEl ? getComputedStyle(backingEl).backgroundColor : null,
        backingText: backingEl ? backingEl.textContent : null
      };
    });
    assert.strictEqual(v.fontSize, '26px', 'expected .die-icon-number font-size 26px, got ' + v.fontSize);
    assert.strictEqual(v.backingBg, 'rgb(0, 0, 0)', 'expected the number backing to be rgb(0, 0, 0), got ' + v.backingBg);
    assert.strictEqual(v.backingText, '10', 'expected the backing span to carry the rolled face number');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (e) — no errors
  // ---------------------------------------------------------------

  await runTest('Item e: no page errors and no console errors (art excluded) on the fight screen and the map', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForTimeout(300);
    // A missing art/*.png is the expected fallback path, not a bug —
    // excluded only when the resource path is under art/. Any other
    // "resource not found" (a script, font, audio file) still fails.
    const realConsoleErrors = page._consoleErrors.filter((m) => !(m.text.indexOf('Failed to load resource') !== -1 && m.url.indexOf('art/') !== -1)).map((m) => m.text);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the fight screen: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realConsoleErrors, [], 'console errors on the fight screen: ' + realConsoleErrors.join('; '));
    await page.close();
  });

  await runTest('Item e: no page errors and no console errors (art excluded) on the map', async () => {
    const page = await freshPage(browser);
    await page.waitForTimeout(300);
    const realConsoleErrors = page._consoleErrors.filter((m) => !(m.text.indexOf('Failed to load resource') !== -1 && m.url.indexOf('art/') !== -1)).map((m) => m.text);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the map: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realConsoleErrors, [], 'console errors on the map: ' + realConsoleErrors.join('; '));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build147 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
