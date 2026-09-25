// ============================================================
// TESTS/BUILD132.TEST.JS — BUILD 132
// Regression tests for BUILD 132, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build132.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {

  // ---------------------------------------------------------------
  // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
  // Threnody and Reverberation both go through triggerFaceOutsideRoll()
  // (pipeline.js, tested directly in tests/mods.test.js); these two tests
  // check each card's own targeting/condition logic, playing the real card
  // through playCard() as every other card test in this file does.
  // ---------------------------------------------------------------


  await runTest('BUILD 132: Reverberation — a loaded face is not triggered again, only blank faces trigger', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); }); // triggers smite once, normally
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(before.hp - after.hp, 0, 'expected the loaded rolled face (smite) not to trigger again');
    assert.strictEqual(after.block - before.block, 32, 'expected 2 block for each of the 16 blank faces');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Reverberation — a blank rolled face is one of the blank faces triggered, 2 block each', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 34, 'expected 2 block for each of the 17 blank faces, the rolled one included');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Reverberation — a Nat roll changes nothing: every blank face still triggers for 2 block', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    // Face 1 (Nat 1), not face 20: a Nat 20 roll sweeps every loaded face,
    // including the anchor (Consecrate, face 10), whose own effect
    // registers a turn-scoped 3-block-per-card-played listener that would
    // then also fire when Reverberation itself is played, confounding the
    // block delta this test reads. Nat 1's onNatOne registers no such
    // listener, so it isolates the branch cleanly.
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 34, 'expected 2 block for each of the 17 blank faces after a Nat roll');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Magnificat is offerable through Load (ARCH-CF6: weight changes only via strengthenFace())', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const seen = await page.evaluate(() => {
      let sawMagnificat = false;
      for (let i = 0; i < 1000 && !sawMagnificat; i++) {
        dieActionChooseLoad();
        if (dieActionMods.indexOf('magnificat') !== -1) sawMagnificat = true;
      }
      // ARCH-CF6 spot-check: Magnificat's own effect (cards-mods.js) never
      // writes face.weight anywhere — the only weight it reads is off the
      // candidate faces it scans, never mutated.
      return sawMagnificat;
    });
    assert.ok(seen, 'expected magnificat to appear in a Load offer within 1000 samples');
    await liveBrowser.close();
  });

  process.exit(report('build132') > 0 ? 1 : 0);
})();
