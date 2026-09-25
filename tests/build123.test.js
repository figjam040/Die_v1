// ============================================================
// TESTS/BUILD123.TEST.JS — BUILD 123
// Regression tests for BUILD 123, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build123.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 123 (checkpoint 1, OQ-13): tests/autoplay.js's LOAD_PRIORITY must
  // rank every loadable mod (every real entry in gameState.config.mods
  // except the anchor, 'consecrate') exactly once, no more, no fewer, no
  // duplicates. tests/autoplay.js's own CLI already runs this check before
  // any batch (assertEveryLoadableModIsRanked) — added here too so a mod
  // added later without updating LOAD_PRIORITY fails the standing
  // regression suite immediately, not only a manual autoplay.js invocation.
  // The exact BUILD 105 gap this checkpoint closed: Anthem and Elevation
  // were built at 113/114 and never added to the old hand-tuned list.
  // ---------------------------------------------------------------
  await runTest('BUILD 123: LOAD_PRIORITY ranks every loadable mod exactly once', async () => {
    const { LOAD_PRIORITY } = require('./autoplay.js');
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const loadableModIds = await page.evaluate(() => Object.keys(gameState.config.mods).filter(id => id !== 'consecrate').sort());
    await liveBrowser.close();
    assert.strictEqual(LOAD_PRIORITY.length, new Set(LOAD_PRIORITY).size, 'LOAD_PRIORITY must not contain duplicates: ' + JSON.stringify(LOAD_PRIORITY));
    assert.deepStrictEqual(LOAD_PRIORITY.slice().sort(), loadableModIds, 'LOAD_PRIORITY must rank exactly the loadable mods — found ' + loadableModIds.length + ' loadable mods, LOAD_PRIORITY has ' + LOAD_PRIORITY.length);
  });

  process.exit(report('build123') > 0 ? 1 : 0);
})();
