// ============================================================
// TESTS/BUILD108.TEST.JS — BUILD 108
// Mod regression tests for BUILD 108, split out of tests/mods.test.js
// unchanged. Same shape as tests/mods.test.js: plain Node script,
// playwright launched directly, node:assert, a fresh page per mod.
// Run: node tests/build108.test.js
// ============================================================

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, TEST_FACE, freshFightPage, triggerMod, assertNoErrors } = require('./shared-constants');

const { runModTest: runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---- Per-mod trigger counts (BUILD 108) ----
  // BUILD 103's gameState.die.triggerCounts (a separate array indexed by
  // face number) was folded into each face's own modData: triggerCount for
  // modId, triggerCount2 for modId2 on a two-mod face. Run-scoped, not
  // fight-scoped — see the reset tests below.

  // Isolation: dispatches MOD_TRIGGER directly for only ONE of a two-mod
  // face's mods — the same production hook mod_dispatch (cards-mods.js)
  // listens on, the one both resolvePlayerRoll() and onNatTwenty() call,
  // just isolated to one mod here so the neighbour's counter can be
  // checked without a real roll (which always fires both mods on a
  // two-mod face — see BUILD 115 — and so can't isolate this on its own).
  await runTest(browser, 'Trigger counts: incrementing one mod on a two-mod face does not touch its neighbour', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite', modId2: 'blight' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    await page.evaluate((faceNum) => {
      callListeners('MOD_TRIGGER', { modId: 'smite', faceNumber: faceNum });
    }, TEST_FACE);
    const modData = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(modData.triggerCount, 1, 'the mod that fired (smite, modId) must have its own count incremented');
    assert.strictEqual(modData.triggerCount2 || 0, 0, 'the neighbour mod (blight, modId2) that did not fire must stay at 0');
    assertNoErrors(page);
    await page.close();
  });

  // Fight-scoped reset (Restart Fight / resetFight()) must NOT touch either
  // count — run-scoped now, per the prompt's explicit instruction.
  // devPauseBeforeFirstRoll is set true before the reset so the fresh
  // fight's own autoAdvance() timer never fires a real roll that could
  // touch gameState.die.faces before this test reads it.
  await runTest(browser, 'Trigger counts: both counts survive a fight reset (Restart Fight)', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite', modId2: 'blight' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const before = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(before.triggerCount, 1);
    assert.strictEqual(before.triggerCount2, 1);
    await page.evaluate(() => {
      devPauseBeforeFirstRoll = true;
      resetFight();
      startFreshTurnPaused();
    });
    // Paused (devPauseBeforeFirstRoll true), startFreshTurnPaused() stops at
    // START_OF_TURN rather than auto-advancing into ROLL_PHASE — see its
    // own header comment (run-and-map.js). No real roll happens, so
    // gameState.die.faces can be read immediately.
    await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN');
    const after = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(after.triggerCount, 1, 'trigger count must survive a fight reset');
    assert.strictEqual(after.triggerCount2, 1, 'second mod trigger count must survive a fight reset');
    assertNoErrors(page);
    await page.close();
  });

  // A brand new run (startNewRun()) rebuilds the die from scratch via
  // buildFreshPlayerDieFaces(), which returns faces with no modData at all
  // — this is what actually wipes both counts, same mechanism that already
  // wiped Zeal's own accumulatedBonus before this build.
  await runTest(browser, 'Trigger counts: wiped by a new run, not just reset', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite', modId2: 'blight' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const before = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(before.triggerCount, 1);
    assert.strictEqual(before.triggerCount2, 1);
    await page.evaluate(() => { startNewRun(); });
    const after = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(after, undefined, 'a brand new run must wipe every face\'s modData, trigger counts included');
    assertNoErrors(page);
    await page.close();
  });

  // A Nat 20 sweep must increment both of a two-mod face's counts, exactly
  // once each, same as the "both trigger" test above but asserting the
  // counters specifically rather than the mods' own damage/poison effects.
  await runTest(browser, 'Trigger counts: a Nat 20 sweep increments both mods on a two-mod face', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite', modId2: 'blight' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // face 20, Nat 20
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const modData = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.strictEqual(modData.triggerCount, 1, 'expected the Nat 20 sweep to trigger modId (smite) once');
    assert.strictEqual(modData.triggerCount2, 1, 'expected the Nat 20 sweep to trigger modId2 (blight) once');
    assertNoErrors(page);
    await page.close();
  });

  await browser.close();
  process.exit(report('build108') > 0 ? 1 : 0);
})();
