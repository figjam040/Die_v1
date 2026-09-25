// ============================================================
// TESTS/BUILD116.TEST.JS — BUILD 116
// Regression tests for BUILD 116, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build116.test.js
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
  // BUILD 116 — the second-slot gate removed. A Load offer may now target
  // an already-loaded (non-Nat, not-yet-full) face at any point in a run,
  // not only once no blank face remains.
  // ---------------------------------------------------------------

  await runTest('BUILD 116: Load offer includes an already-loaded face while blank faces still exist', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' }); // face 2 — one slot loaded, one free
      updateDie({ faces: newFaces });
      const blankExists = gameState.die.faces.some(function(f) { return f.modId === null; });
      openDieActionScreen();
      dieActionChooseLoad();
      dieActionPickMod(dieActionMods[0]);
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const face2Row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      return { blankExists: blankExists, face2Classes: face2Row ? face2Row.className : null };
    });
    assert.ok(v.blankExists, 'test assumes blank faces remain elsewhere on the die (only face 2 and the anchor are loaded)');
    assert.ok(v.face2Classes && v.face2Classes.indexOf('die-row-pickable') !== -1, 'an already-loaded, non-full face must be a valid Load target while blanks remain: ' + v.face2Classes);
    await page.close();
  });

  await runTest('BUILD 116: the cap still refuses a third mod (a full face is never a Load target)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight' }); // face 2 — both slots full
      updateDie({ faces: newFaces });
      openDieActionScreen();
      dieActionChooseLoad();
      dieActionPickMod(dieActionMods[0]);
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const face2Row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      return face2Row ? face2Row.className : null;
    });
    assert.ok(v && v.indexOf('die-row-pick-inert') !== -1, 'a face already holding two mods must never be Load-eligible: ' + v);
    await page.close();
  });

  await runTest('BUILD 116: the Load offer still excludes the anchor, gate removed or not', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // Load a couple of mods first so the die is a realistic mid-run mix
      // of loaded/blank faces, not just the fresh starting die.
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' });
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'blight' });
      updateDie({ faces: newFaces });
      openDieActionScreen();
      dieActionChooseLoad();
      return dieActionMods.slice();
    });
    assert.strictEqual(v.indexOf('consecrate'), -1, 'the anchor must never appear in a Load offer, regardless of how many faces are already loaded');
    await page.close();
  });

  await browser.close();
  process.exit(report('build116') > 0 ? 1 : 0);
})();
