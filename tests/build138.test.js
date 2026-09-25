// ============================================================
// TESTS/BUILD138.TEST.JS — BUILD 138
// Regression tests for BUILD 138, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build138.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 138 (die feedback): the hop — a face that fires without being
  // the rolled face (Nat 20 sweep, Bound scan, outside-roll trigger) moves
  // to the rolled-face look too — plus faces 1/20's own run-scoped roll
  // counts.
  // ---------------------------------------------------------------
  await runTest('BUILD 138: after a Bound scan, every fired face carries the rolled-face look until the next round starts', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); }); // rolls Unison (Bound) -> scan fires Accord (face 3)
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const during = await page.evaluate(() => {
      function rowFor(n) { return document.querySelectorAll('#playerDieList .die-row')[GAME_CONFIG.DIE_SIZE.PLAYER - n]; }
      const rolledRow = rowFor(2);
      const hoppedRow = rowFor(3);
      const hasLook = function(row) { return row.classList.contains('die-row-rolled') || row.classList.contains('die-row-rolled-flash'); };
      return {
        hoppedFaces: gameState.turn.hoppedFaces.slice(),
        rolledHasLook: hasLook(rolledRow),
        hoppedHasLook: hasLook(hoppedRow)
      };
    });
    assert.deepStrictEqual(during.hoppedFaces, [3], 'the Bound scan must record only the other Bound face (3) as hopped, not the rolled face itself');
    assert.strictEqual(during.rolledHasLook, true, 'the rolled face (2) must carry the rolled-face look, exactly as before this build');
    assert.strictEqual(during.hoppedHasLook, true, 'the scanned face (3) must carry the same rolled-face look once it has fired');

    // Advance into the next round's START_OF_TURN/ROLL_PHASE and confirm
    // the look clears at the same site rolledFaceNumber itself clears at.
    await page.evaluate(() => { nextPhase(); }); // CARD_PHASE -> END_PLAYER_TURN
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const after = await page.evaluate(() => {
      const hoppedRow = document.querySelectorAll('#playerDieList .die-row')[GAME_CONFIG.DIE_SIZE.PLAYER - 3];
      const hasLook = hoppedRow.classList.contains('die-row-rolled') || hoppedRow.classList.contains('die-row-rolled-flash');
      return { hoppedFaces: gameState.turn.hoppedFaces.slice(), hoppedHasLook: hasLook };
    });
    assert.deepStrictEqual(after.hoppedFaces, [], 'hoppedFaces must be cleared once the next round starts');
    assert.strictEqual(after.hoppedHasLook, false, 'face 3 must lose the rolled-face look once the next round starts');
    await liveBrowser.close();
  });

  await runTest('BUILD 138: hopped faces are recorded in firing order', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5
      newFaces[14] = Object.assign({}, newFaces[14], { modId: 'sanctuary' }); // face 15
      updateDie({ faces: newFaces }); // face 10 already carries the starting anchor, consecrate
    });
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // Nat 20 sweep
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hoppedFaces = await page.evaluate(() => gameState.turn.hoppedFaces.slice());
    assert.deepStrictEqual(hoppedFaces, [5, 10, 15], 'hopped faces must be recorded in the same ascending order the Nat 20 sweep fires them in');
    await liveBrowser.close();
  });

  await runTest("BUILD 138: a Nat 20 roll raises face 20's count, a Nat 1 roll raises face 1's, both reset on a new run", async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const before = await page.evaluate(() => ({
      face20: (gameState.die.faces[19].modData && gameState.die.faces[19].modData.triggerCount) || 0,
      face1: (gameState.die.faces[0].modData && gameState.die.faces[0].modData.triggerCount) || 0
    }));
    assert.strictEqual(before.face20, 0, 'face 20 must start this fight with no roll count yet');
    assert.strictEqual(before.face1, 0, 'face 1 must start this fight with no roll count yet');

    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // Nat 20
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { nextPhase(); }); // CARD_PHASE -> END_PLAYER_TURN
    await advanceUntilPhase(page, 'ROLL_PHASE');
    // No leftover autoAdvance() timer is pending here (round 1's chain died
    // the moment it reached CARD_PHASE — see F10 Penitence's own identical
    // note above), so this round's ROLL_PHASE -> CARD_PHASE step needs an
    // explicit nextPhase() alongside the forced roll, unlike round 1's.
    await page.evaluate(() => { forcePlayerRoll(1); }); // Nat 1
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    const afterRolls = await page.evaluate(() => ({
      face20: (gameState.die.faces[19].modData && gameState.die.faces[19].modData.triggerCount) || 0,
      face1: (gameState.die.faces[0].modData && gameState.die.faces[0].modData.triggerCount) || 0,
      badge20: document.querySelectorAll('#playerDieList .die-row')[0].querySelector('.die-trigger-count').textContent,
      badge1: document.querySelectorAll('#playerDieList .die-row')[19].querySelector('.die-trigger-count').textContent
    }));
    assert.strictEqual(afterRolls.face20, 1, 'one Nat 20 roll must raise face 20\'s own count by exactly one');
    assert.strictEqual(afterRolls.face1, 1, 'one Nat 1 roll must raise face 1\'s own count by exactly one');
    assert.strictEqual(afterRolls.badge20, '#1', 'face 20 must show the same #N count badge every other face uses');
    assert.strictEqual(afterRolls.badge1, '#1', 'face 1 must show the same #N count badge every other face uses');

    await page.evaluate(() => { startNewRun(); });
    const afterNewRun = await page.evaluate(() => ({
      face20: gameState.die.faces[19].modData,
      face1: gameState.die.faces[0].modData
    }));
    assert.strictEqual(afterNewRun.face20, undefined, 'a brand new run must wipe face 20\'s roll count, same as every other face\'s modData');
    assert.strictEqual(afterNewRun.face1, undefined, 'a brand new run must wipe face 1\'s roll count, same as every other face\'s modData');
    await liveBrowser.close();
  });

  process.exit(report('build138') > 0 ? 1 : 0);
})();
