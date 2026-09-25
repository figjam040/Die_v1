// ============================================================
// TESTS/BUILD134.TEST.JS — BUILD 134
// Regression tests for BUILD 134, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build134.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 134 — checkpoint 3, the remaining Bound pieces: the mod count
  // goes from 23 to 25 (24 offerable plus Consecrate) and the reward card
  // count from 33 to 36; both grow by exactly one tier bucket in each of
  // the three tiers relative to the totals the BUILD 129 tier maps above
  // already imply (12/7/3 mods -> 12/8/4; 17/11/5 cards -> 18/12/6).
  // ---------------------------------------------------------------
  await runTest('BUILD 134: offerable mod and reward card tier totals', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const totals = await page.evaluate(() => {
      function tally(ids, getTier) {
        const out = { basic: 0, uncommon: 0, rare: 0 };
        ids.forEach(function(id) {
          const tier = getTier(id);
          if (tier) out[tier] += 1;
        });
        return out;
      }
      const modTotals = tally(Object.keys(gameState.config.mods), function(id) { return gameState.config.mods[id].tier || null; });
      const cardTotals = tally(Object.keys(gameState.config.cardPool), function(id) { return gameState.config.cardPool[id].tier || null; });
      return { modTotals: modTotals, cardTotals: cardTotals };
    });
    // D-111 (BUILD 169): the common tier is named basic.
    assert.deepStrictEqual(totals.modTotals, { basic: 13, uncommon: 9, rare: 4 }, 'offerable mods must be 13 basic, 9 uncommon, 4 rare (Consecrate excluded, it carries no tier)');
    assert.deepStrictEqual(totals.cardTotals, { basic: 24, uncommon: 16, rare: 8 }, 'reward cards must be 24 basic, 16 uncommon, 8 rare (Vacancy is rare)');
    await liveBrowser.close();
  });


  // ---------------------------------------------------------------
  // BUILD 134 — checkpoint 3, the remaining Bound pieces: Kyrie, Novena,
  // Canticle (cards; Concord and Herald, the two new mods, are tested
  // directly in tests/mods.test.js like every other mod). All three read
  // isBoundFace()/call grantBoundToFace()/triggerFaceOutsideRoll()
  // (pipeline.js, the Bound engine, BUILD 133) — no second copy of any of
  // them here, playing the real card through playCard() as every other
  // card test in this file does.
  // ---------------------------------------------------------------

  await runTest('BUILD 134: Kyrie — 5 damage on a non-Bound rolled face', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, an ordinary blank, not Bound
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['kyrie'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 5, 'expected plain 5 damage on a non-Bound rolled face');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Kyrie — 10 damage if the rolled face has Bound', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'unison' }); // face 3, Bound (via the 'bound' tag)
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); }); // triggers Unison (6 damage) too
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['kyrie'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    // Isolates Kyrie's own play — Unison's 6 damage already landed above.
    assert.strictEqual(before - after, 10, 'expected empowered 10 damage when the rolled face is Bound');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Novena — every loaded Bound face triggers, each through triggerFaceOutsideRoll()', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2, Bound (6 damage)
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3, Bound (10 block)
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5, not Bound (16 damage) — must not trigger
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, untouched, stays blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['novena'], soul: 5 }); });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    // playSweep() paces multi-face playback via setTimeout — give both Bound
    // faces (2 and 3) time to land before reading the result.
    await page.waitForFunction(() => gameState.die.faces[1].modData && gameState.die.faces[1].modData.triggerCount === 1 &&
      gameState.die.faces[2].modData && gameState.die.faces[2].modData.triggerCount === 1, { timeout: 5000 });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block, smiteTriggerCount: gameState.die.faces[4].modData ? (gameState.die.faces[4].modData.triggerCount || 0) : 0 }));
    assert.strictEqual(before.hp - after.hp, 6, 'expected only Unison (Bound, face 2) to deal damage — 6');
    assert.strictEqual(after.block - before.block, 10, 'expected only Accord (Bound, face 3) to generate block — 10');
    assert.strictEqual(after.smiteTriggerCount, 0, 'expected Smite (face 5, not Bound) to never trigger');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Canticle — 6 block; if the rolled face is loaded, it gains Bound for this fight (never face 1 or 20)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'smite' }); // face 3, loaded
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['canticle'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const v = await page.evaluate(() => ({ block: gameState.player.block, face3Bound: !!(gameState.die.faces[2].modData && gameState.die.faces[2].modData.boundGranted) }));
    assert.strictEqual(v.block - before, 6, 'expected 6 block');
    assert.strictEqual(v.face3Bound, true, 'expected the loaded rolled face (3) to be granted Bound for the fight');

    // A Nat roll (face 1) must never be granted Bound — grantBoundToFace()
    // itself refuses both Nat faces, and the "loaded" check here already
    // excludes them (Nat faces are not real mods), so nothing is granted.
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['canticle'], soul: 5 }); });
    await page.evaluate(() => { playCard(0); });
    const face1Bound = await page.evaluate(() => !!(gameState.die.faces[0].modData && gameState.die.faces[0].modData.boundGranted));
    assert.strictEqual(face1Bound, false, 'face 1 must never be granted Bound');
    await liveBrowser.close();
  });

  process.exit(report('build134') > 0 ? 1 : 0);
})();
