// ============================================================
// TESTS/BUILD117.TEST.JS — BUILD 117
// Regression tests for BUILD 117, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build117.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // BUILD 117 — two-mod row (side by side, not stacked), full mod-pool
  // hover coverage, and the twenty-row column with a two-mod face present.
  // ---------------------------------------------------------------

  await runTest('BUILD 117: a two-mod row renders both names and both counts', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // #playerDieList sits inside #fightScreen, hidden (display:none) on the map
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight', modData: { triggerCount: 4, triggerCount2: 9 } }); // face 2
      updateDie({ faces: newFaces });
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      const names = Array.from(row.querySelectorAll('.die-mod')).map(function(el) { return el.textContent; });
      const counts = Array.from(row.querySelectorAll('.die-trigger-count-inline')).map(function(el) { return el.textContent; });
      // Both mods must be on the SAME line — one .die-mod-stack (the old,
      // now-removed vertical layout) would mean this build's fix regressed.
      const hasStack = !!row.querySelector('.die-mod-stack');
      return { names: names, counts: counts, hasStack: hasStack };
    });
    assert.deepStrictEqual(v.names, ['Smite', 'Blight'], 'both mod names must render, in load order');
    assert.deepStrictEqual(v.counts, ['#4', '#9'], 'each mod\'s own trigger count must render beside its own name');
    assert.strictEqual(v.hasStack, false, 'must not use the old vertical .die-mod-stack layout');
    await page.close();
  });

  await runTest('BUILD 117: every mod in the pool has a hover description', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const modIds = Object.keys(gameState.config.mods);
      const missing = modIds.filter(function(id) { return !MOD_DESCRIPTION[id]; });
      return { total: modIds.length, missing: missing };
    });
    assert.strictEqual(v.total, 27, 'expected twenty-seven real mods');
    assert.deepStrictEqual(v.missing, [], 'every mod must have a MOD_DESCRIPTION entry: missing ' + JSON.stringify(v.missing));
    await page.close();
  });

  await runTest('BUILD 117: the die column is still twenty rows with a two-mod face present, all rows the same height', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // #playerDieList sits inside #fightScreen, hidden (display:none) on the map
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId2: 'virulence', modData: { triggerCount: 15, triggerCount2: 27 } }); // face 10 (already Consecrate)
      updateDie({ faces: newFaces });
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const heights = rows.map(function(r) { return Math.round(r.getBoundingClientRect().height); });
      return { rowCount: rows.length, uniqueHeights: Array.from(new Set(heights)), heights: heights };
    });
    assert.strictEqual(v.rowCount, 20, 'die column must still be exactly twenty rows');
    assert.strictEqual(v.uniqueHeights.length, 1, 'every row must measure the same height, two-mod face included: ' + JSON.stringify(v.heights));
    await page.close();
  });

  await browser.close();
  process.exit(report('build117') > 0 ? 1 : 0);
})();
