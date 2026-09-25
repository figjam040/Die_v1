// ============================================================
// TESTS/BUILD118.TEST.JS — BUILD 118
// Regression tests for BUILD 118, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build118.test.js
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
  // BUILD 118 (KI-19 fix) — collectTriggerCountsByMod() used to OVERWRITE
  // a mod's count with whichever face was processed last instead of
  // summing across every face carrying it. The real Load flow can never
  // produce a die with the same mod on two faces (it excludes any mod
  // already on the die), but devLoadMod() (the dev tool) has no such
  // guard, so these tests build that shape directly via updateDie(), the
  // same way a real test die reached it.
  // ---------------------------------------------------------------

  await runTest('BUILD 118: a mod on more than one face sums across those faces', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      // Blight on three faces (2, 3, 4), each with a different trigger
      // count — must sum to 1+2+4=7, not report just one face's value.
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'blight', modData: { triggerCount: 1 } });
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'blight', modData: { triggerCount: 2 } });
      newFaces[3] = Object.assign({}, newFaces[3], { modId: 'blight', modData: { triggerCount: 4 } });
      updateDie({ faces: newFaces });
      return collectTriggerCountsByMod();
    });
    assert.strictEqual(counts.blight, 7, 'expected 1 + 2 + 4 = 7, summed across all three faces, not just the last one processed');
    await page.close();
  });

  await runTest('BUILD 118: a mod in a second slot is counted toward the same sum as the first slot', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      // Consecrate (the anchor, always modId on face 10) plus a second
      // face where consecrate sits in the SECOND slot (modId2) — both
      // must add into the one consecrate total.
      newFaces[9] = Object.assign({}, newFaces[9], { modData: { triggerCount: 3 } }); // face 10, consecrate already modId
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite', modId2: 'consecrate', modData: { triggerCount: 0, triggerCount2: 5 } }); // face 5
      updateDie({ faces: newFaces });
      return collectTriggerCountsByMod();
    });
    assert.strictEqual(counts.consecrate, 8, 'expected 3 (first-slot, face 10) + 5 (second-slot, face 5) = 8');
    await page.close();
  });

  await runTest('BUILD 118: a mod on no face records zero rather than being omitted', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => collectTriggerCountsByMod());
    // A fresh die carries only the anchor (consecrate, face 10) — every
    // other real mod is on no face at all this run.
    assert.strictEqual(counts.elevation, 0, 'a mod never loaded this run must still appear, at 0, not be missing from the object');
    assert.ok(Object.prototype.hasOwnProperty.call(counts, 'elevation'), 'the key itself must exist, not just read as undefined');
    assert.strictEqual(Object.keys(counts).length, 27, 'expected all twenty-seven real mods present, every one of them, loaded or not');
    await page.close();
  });

  await browser.close();
  process.exit(report('build118') > 0 ? 1 : 0);
})();
