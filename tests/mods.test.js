// ============================================================
// TESTS/MODS.TEST.JS — BUILD 100
// Per-mod assertion suite: for each of the eleven config.mods entries,
// dev-loads it onto a blank face (face 2), forces that face's roll through
// the real forcePlayerRoll()/resolvePlayerRoll()/MOD_TRIGGER dispatch (never
// a shortcut that calls a mod's effect() directly), and asserts the exact
// numeric change the mod's own spec (CLAUDE.md MODS section) promises,
// read straight off gameState. A mod whose registerListener() call names a
// hook nothing ever dispatches (Vigil's BUILD 100 bug: 'END_PLAYER_TURN' as
// a dead phase-name string) registers successfully and produces zero
// observable effect — this suite fails on that zero, not on an exception,
// which is what makes it catch a dead mod rather than just a crashing one.
//
// Not @playwright/test — this project has no test runner installed, only
// the raw `playwright` library (package.json). Plain Node script, chromium
// launched directly, assertions via node:assert, a fresh page per mod for
// full gameState isolation. Run: node tests/mods.test.js
//
// Every fight is entered via the real enterSlot('opening', null) — same
// path a click on the map's opening node uses — landing on a fresh 50 HP
// enemy with poisonStacks/block/soul/hand all at their real post-draw
// values, never a hand-built fixture gameState.
// ============================================================

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, TEST_FACE, freshFightPage, triggerMod, assertNoErrors } = require('./shared-constants');

const { results, runModTest: runTest } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---- Smite — 16 damage, flat ----
  await runTest(browser, 'Smite: 16 damage dealt', async (browser) => {
    const page = await freshFightPage(browser);
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'smite');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 16, 'expected exactly 16 damage');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Penance — 8 damage + 8 block ----
  await runTest(browser, 'Penance: 8 damage + 8 block', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await triggerMod(page, 'penance');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(before.hp - after.hp, 8, 'expected exactly 8 damage');
    assert.strictEqual(after.block - before.block, 8, 'expected exactly 8 block');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Offering — +2 soul, draw 1 ----
  await runTest(browser, 'Offering: +2 soul, draw 1', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, hand: gameState.player.hand.length }));
    await triggerMod(page, 'offering');
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, hand: gameState.player.hand.length }));
    assert.strictEqual(after.soul - before.soul, 2, 'expected exactly +2 soul');
    assert.strictEqual(after.hand - before.hand, 1, 'expected exactly +1 card drawn');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Blight — 6 poison to enemy ----
  await runTest(browser, 'Blight: 6 poison applied', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.enemy.poisonStacks);
    await triggerMod(page, 'blight');
    const after = await page.evaluate(() => gameState.enemy.poisonStacks);
    assert.strictEqual(after - before, 6, 'expected exactly +6 poison');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Virulence — 3 poison, then doubles total (0 -> 3 -> 6) ----
  await runTest(browser, 'Virulence: 3 poison then doubled to 6', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.enemy.poisonStacks);
    assert.strictEqual(before, 0, 'test assumes a fresh fight starts at 0 poison');
    await triggerMod(page, 'virulence');
    const after = await page.evaluate(() => gameState.enemy.poisonStacks);
    assert.strictEqual(after, 6, 'expected (0+3)*2 = 6 poison');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Sanctuary — 16 block, flat ----
  await runTest(browser, 'Sanctuary: 16 block gained', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.player.block);
    await triggerMod(page, 'sanctuary');
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 16, 'expected exactly 16 block');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Consecrate — +2 soul on trigger ----
  await runTest(browser, 'Consecrate: +2 soul on trigger', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.player.soul);
    await triggerMod(page, 'consecrate');
    const after = await page.evaluate(() => gameState.player.soul);
    assert.strictEqual(after - before, 2, 'expected exactly +2 soul');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Zeal — 10 damage on first trigger; face's own modData.accumulatedBonus
  // becomes 4 immediately after, the persistent per-face counter ----
  await runTest(browser, 'Zeal: 10 damage, face bonus counter becomes 4', async (browser) => {
    const page = await freshFightPage(browser);
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'zeal');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    const bonus = await page.evaluate((faceNum) => {
      const face = gameState.die.faces[faceNum - 1];
      return face.modData ? face.modData.accumulatedBonus : null;
    }, TEST_FACE);
    assert.strictEqual(hpBefore - hpAfter, 10, 'expected exactly 10 damage on first trigger (bonus starts at 0)');
    assert.strictEqual(bonus, 4, 'expected the face\'s own accumulatedBonus to become 4 after one trigger');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Fervour — turn-scoped DAMAGE_MULTIPLIER that doubles 'attack' damage ----
  await runTest(browser, 'Fervour: doubles a subsequent attack-tagged hit', async (browser) => {
    const page = await freshFightPage(browser);
    await triggerMod(page, 'fervour');
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { dealDamage('enemy', 10, 'attack', 'test_fervour'); });
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 20, 'expected 10 base doubled to 20 by the registered multiplier');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Ordain — 10 damage, then +1 weight permanently on the triggering face ----
  await runTest(browser, 'Ordain: 10 damage, face weight 1 -> 2', async (browser) => {
    const page = await freshFightPage(browser);
    const weightBefore = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, TEST_FACE);
    assert.strictEqual(weightBefore, 1, 'test assumes a fresh face starts at weight 1');
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'ordain');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    const weightAfter = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, TEST_FACE);
    assert.strictEqual(hpBefore - hpAfter, 10, 'expected exactly 10 damage');
    assert.strictEqual(weightAfter, 2, 'expected face weight to permanently increase from 1 to 2');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Elevation — 10 damage; the face directly above the triggering face
  // (faceNumber + 1) permanently gains +1 weight, but only if that face is
  // loaded and is not face 20. TEST_FACE (2) is loaded with 'elevation';
  // face 3 (directly above) is pre-loaded with 'smite' here so it counts as
  // "loaded" for Elevation's own check. ----
  await runTest(browser, 'Elevation: 10 damage, loaded face above weight 1 -> 2', async (browser) => {
    const page = await freshFightPage(browser);
    const ABOVE_FACE = TEST_FACE + 1;
    await page.evaluate((faceNum) => {
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite' });
      updateDie({ faces: newFaces });
    }, ABOVE_FACE);
    const weightBefore = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ABOVE_FACE);
    assert.strictEqual(weightBefore, 1, 'test assumes the face above starts at weight 1');

    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'elevation');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    const weightAfter = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ABOVE_FACE);

    assert.strictEqual(hpBefore - hpAfter, 10, 'expected exactly 10 damage');
    assert.strictEqual(weightAfter, 2, 'expected the loaded face above to permanently gain +1 weight');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Vigil — 4 damage, plus 1 per 3 blanks rolled this run. ----
  await runTest(browser, 'Vigil: 4 damage plus 1 for every 3 blanks rolled this run', async (browser) => {
    let page = await freshFightPage(browser);
    let hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'vigil');
    let hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 4, 'expected 4 damage with no blanks rolled');
    assertNoErrors(page);
    await page.close();

    page = await freshFightPage(browser);
    await page.evaluate(() => { updateRun({ blanksRolled: 9 }); });
    hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'vigil');
    hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 7, 'expected 4 + 3 damage with 9 blanks rolled');
    assertNoErrors(page);
    await page.close();
  });

  // BUILD 135 — a Nat 20 that kills the enemy wins the fight immediately.
  // playSweep()'s dispatches (pipeline.js) are staggered via setTimeout —
  // well under the 1800ms ROLL_PHASE pause — so the kill lands, and
  // checkWinNow() (phase-machine.js, called as the sweep's onComplete)
  // fires, long before that pause would otherwise carry the phase on to
  // CARD_PHASE on its own. Waiting for run.status === 'win' rather than for
  // CARD_PHASE is the point of this test: before this build, nothing caught
  // a sweep-timed kill until the next real phase transition (End Turn) saw
  // it cold.
  await runTest(browser, 'Nat 20: a kill from the sweep wins the fight immediately, without End Turn', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite' }); // 16 damage
      updateDie({ faces: newFaces });
      updateEnemy({ hp: 10 }); // below Smite's 16 damage — the sweep's own trigger is lethal
    }, TEST_FACE);
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // face 20, Nat 20
    await page.waitForFunction(() => gameState.run.status === 'win');
    const phaseAtWin = await page.evaluate(() => gameState.turn.phase);
    assert.strictEqual(phaseAtWin, 'ROLL_PHASE', 'the win must register the instant the sweep\'s dispatch kills the enemy — turn.phase must never have reached CARD_PHASE first');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Checkpoint 3 tags/mods build — six new mods ----

  // ---- Largesse — +2 soul, 4 block, flat ----
  await runTest(browser, 'Largesse: +2 soul, 4 block', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    await triggerMod(page, 'largesse');
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    assert.strictEqual(after.soul - before.soul, 2, 'expected exactly +2 soul');
    assert.strictEqual(after.block - before.block, 4, 'expected exactly 4 block');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Tithe — 1 block per blank face on the die, on the trigger itself. ----
  await runTest(browser, 'Tithe: 1 block per blank face on the die', async (browser) => {
    let page = await freshFightPage(browser);
    const blockBefore = await page.evaluate(() => gameState.player.block);
    await triggerMod(page, 'tithe');
    // Faces 1 and 20 are Nat faces; 10 (Consecrate) and 2 (Tithe) are loaded.
    const blockAfter = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockAfter - blockBefore, 16, 'expected 1 block for each of the 16 blank faces');
    assertNoErrors(page);
    await page.close();

    // Five more faces loaded: the count follows the blanks left.
    page = await freshFightPage(browser);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      [3, 4, 5, 6, 7].forEach(function(n) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); });
      updateDie({ faces: newFaces });
    });
    await triggerMod(page, 'tithe');
    const blockAfter2 = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockAfter2, 11, 'expected 1 block for each of the 11 blank faces');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Congregation — 8 damage, 16 if another loaded mod (anywhere on the
  // die) carries the Growth tag; never counts itself. ----
  await runTest(browser, 'Congregation: 8 damage, 16 with another loaded Growth mod, never counts itself', async (browser) => {
    // Baseline: only Congregation (Growth-tagged itself) and the anchor
    // (Consecrate, not Growth-tagged) are loaded -> 8 damage. If
    // Congregation counted itself, this would incorrectly read 16.
    let page = await freshFightPage(browser);
    let hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'congregation');
    let hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 8, 'expected 8 damage with no other Growth mod loaded (must not count itself)');
    assertNoErrors(page);
    await page.close();

    // Boosted: face 3 pre-loaded with Zeal (Growth-tagged) -> 16 damage.
    page = await freshFightPage(browser);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'zeal' }); // face 3
      updateDie({ faces: newFaces });
    });
    hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'congregation');
    hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 16, 'expected 16 damage with another loaded Growth mod (zeal) present');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Cope — 8 block; permanently +2 per trigger, stored in the
  // triggering face's own modData (copeBonus), same pattern Zeal's own
  // accumulatedBonus already uses. ----
  await runTest(browser, 'Cope: 8 block, permanently +2 per trigger via modData', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.player.block);
    await triggerMod(page, 'cope');
    const after = await page.evaluate(() => gameState.player.block);
    const bonus = await page.evaluate((faceNum) => {
      const face = gameState.die.faces[faceNum - 1];
      return face.modData ? face.modData.copeBonus : null;
    }, TEST_FACE);
    assert.strictEqual(after - before, 8, 'expected exactly 8 block on first trigger (bonus starts at 0)');
    assert.strictEqual(bonus, 2, 'expected the face\'s own copeBonus to become 2 after one trigger');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Anathema — end-of-round damage equal to current block, capped at
  // 16; block is read only, never spent (still intact afterward, unchanged
  // until the next START_OF_TURN clears it as it always has). ----
  await runTest(browser, 'Anathema: end of round damage equals block, capped at 16, block unspent', async (browser) => {
    // Uncapped: 10 block -> 10 damage, block still 10 afterward.
    let page = await freshFightPage(browser);
    await triggerMod(page, 'anathema');
    await page.evaluate(() => { updatePlayer({ block: 10 }); });
    let hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'END_PLAYER_TURN');
    let hpAfter = await page.evaluate(() => gameState.enemy.hp);
    let blockAfter = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(hpBefore - hpAfter, 10, 'expected damage equal to 10 block, uncapped');
    assert.strictEqual(blockAfter, 10, 'block must be read, not spent');
    assertNoErrors(page);
    await page.close();

    // Capped: 20 block -> capped at 16 damage.
    page = await freshFightPage(browser);
    await triggerMod(page, 'anathema');
    await page.evaluate(() => { updatePlayer({ block: 20 }); });
    hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'END_PLAYER_TURN');
    hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 16, 'expected damage capped at 16 despite 20 block');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Thurible — 8 damage, applies 3 stacks of poison; log line must
  // read "stacks of poison" (KI-25's wording), never a bare "N poison". ----
  await runTest(browser, 'Thurible: 8 damage, 3 stacks of poison applied, log reads "stacks of poison"', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    await triggerMod(page, 'thurible');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    const logText = await page.evaluate(() => document.getElementById('log').textContent);
    assert.strictEqual(before.hp - after.hp, 8, 'expected exactly 8 damage');
    assert.strictEqual(after.poison - before.poison, 3, 'expected exactly +3 poison stacks');
    assert.ok(/\[MOD\] thurible:[^\n]*stacks of poison/.test(logText), 'log line must read "stacks of poison": ' + logText.slice(-200));
    assert.ok(!/\[MOD\] thurible:[^\n]*\d+ poison\b(?! stacks)/i.test(logText), 'log line must not state a bare "N poison" amount');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Checkpoint 3, prompt D — trigger a face outside a roll ----

  // ---- Magnificat — the heaviest OTHER loaded face triggers; ties go to
  // the lowest-numbered face; its own face never counts. Face 5 and face 7
  // are both loaded at weight 2 (a tie) and face 9 at weight 1 (lighter,
  // must not be picked) — asserts both the tie-break and the weight
  // comparison in one pass. ----
  await runTest(browser, 'Magnificat: the heaviest other loaded face triggers, ties go to the lowest-numbered face', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite', weight: 2 }); // face 5, weight 2
      newFaces[6] = Object.assign({}, newFaces[6], { modId: 'blight', weight: 2 }); // face 7, weight 2 (tie — lower number, face 5, must win)
      newFaces[8] = Object.assign({}, newFaces[8], { modId: 'penance', weight: 1 }); // face 9, weight 1 (lighter, must not be picked)
      updateDie({ faces: newFaces });
    });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks, block: gameState.player.block }));
    await triggerMod(page, 'magnificat');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks, block: gameState.player.block }));
    assert.strictEqual(before.hp - after.hp, 16, 'expected smite (face 5, tied heaviest, lowest-numbered) to trigger, not blight (face 7) or penance (face 9)');
    assert.strictEqual(after.poison - before.poison, 0, 'blight (face 7) must not have triggered despite tying on weight');
    assert.strictEqual(after.block - before.block, 0, 'penance (face 9) must not have triggered, being lighter than the tie');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Checkpoint 3, Bound engine — three plain Bound mods ----

  // ---- Unison — 6 damage, flat, no conditions. ----
  await runTest(browser, 'Unison: 6 damage', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'unison');
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 6, 'expected exactly 6 damage');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Accord — 10 block, flat, no conditions. ----
  await runTest(browser, 'Accord: 10 block', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.player.block);
    await triggerMod(page, 'accord');
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 10, 'expected exactly 10 block');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Kinship — applies 4 stacks of poison. ----
  await runTest(browser, 'Kinship: applies 4 stacks of poison', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.enemy.poisonStacks);
    await triggerMod(page, 'kinship');
    const after = await page.evaluate(() => gameState.enemy.poisonStacks);
    assert.strictEqual(after - before, 4, 'expected exactly 4 stacks of poison applied');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Bound engine (pipeline.js: isBoundFace/grantBoundToFace/runBoundScan/
  // playSweep) — a face is Bound if a loaded mod on it carries the printed
  // Bound tag, or the face was granted Bound for the fight. ----

  // Two loaded Bound faces (Unison on face 2, Accord on face 3) — rolling
  // either one must fire both, in the same roll, via the die-wide Bound
  // scan. Sweep playback is paced (fast sweep timing) but state updates the
  // instant each dispatch runs, so waiting for CARD_PHASE (which only
  // arrives after the real 1800ms ROLL_PHASE pause) is long enough for both
  // to have landed.
  await runTest(browser, 'Bound scan: two loaded Bound faces fire together from one roll', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3
      updateDie({ faces: newFaces });
    });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(2); }); // rolls Unison (face 2), itself Bound
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(before.hp - after.hp, 6, 'expected Unison (the rolled face) to fire for 6 damage');
    assert.strictEqual(after.block - before.block, 10, 'expected Accord (the other loaded Bound face) to fire too, via the scan, for 10 block');
    assertNoErrors(page);
    await page.close();
  });

  // The scan never runs during a Nat 20 sweep — onNatTwenty()'s own loop
  // already fires every loaded face itself; if the scan also ran off each
  // Bound face's own turn in that loop, a two-Bound-face die would double-
  // fire. Face 20 dev-loaded is a Nat stub (never a real mod), so Nat 20's
  // sweep here reaches faces 2 (Unison), 3 (Accord) and 10 (Consecrate,
  // the anchor, not Bound) exactly once each.
  await runTest(browser, 'Bound scan: does not run during a Nat 20 sweep', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // face 20, Nat 20
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const counts = await page.evaluate(() => ({
      unison: gameState.die.faces[1].modData ? (gameState.die.faces[1].modData.triggerCount || 0) : 0,
      accord: gameState.die.faces[2].modData ? (gameState.die.faces[2].modData.triggerCount || 0) : 0
    }));
    assert.strictEqual(counts.unison, 1, 'Unison must trigger exactly once from the Nat 20 sweep, not twice via a spurious scan');
    assert.strictEqual(counts.accord, 1, 'Accord must trigger exactly once from the Nat 20 sweep, not twice via a spurious scan');
    assertNoErrors(page);
    await page.close();
  });

  // grantBoundToFace() (pipeline.js) — refuses face 1, face 20, and a
  // genuinely blank face (both slots null); succeeds on a loaded face.
  await runTest(browser, 'grantBoundToFace: refuses face 1, face 20, and a blank face', async (browser) => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const r1 = grantBoundToFace(1);
      const r20 = grantBoundToFace(GAME_CONFIG.DIE_SIZE.PLAYER);
      const r3 = grantBoundToFace(3); // a fresh die's face 3 is blank
      return { r1: r1, r20: r20, r3: r3, face3ModData: gameState.die.faces[2].modData || null };
    });
    assert.strictEqual(v.r1, false, 'face 1 must be refused');
    assert.strictEqual(v.r20, false, 'face 20 must be refused');
    assert.strictEqual(v.r3, false, 'a blank face must be refused');
    assert.ok(!v.face3ModData || !v.face3ModData.boundGranted, 'a refused blank face must not have been granted Bound anyway');
    assertNoErrors(page);
    await page.close();
  });

  // Bound grants are fight-scoped (last one fight), unlike the rest of a
  // face's modData (trigger counts, Zeal's/Cope's own accumulators), which
  // is run-scoped and survives a fight reset — see Trigger counts tests
  // above. clearFightScopedState() (shared by resetFight() and every real
  // fight transition) must strip boundGranted and nothing else.
  await runTest(browser, 'grantBoundToFace: the grant clears at fight end, other modData survives', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE); // gives the face a real triggerCount of 1
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const granted = await page.evaluate((faceNum) => {
      const ok = grantBoundToFace(faceNum);
      return { ok: ok, boundGranted: gameState.die.faces[faceNum - 1].modData.boundGranted };
    }, TEST_FACE);
    assert.strictEqual(granted.ok, true, 'the grant on a loaded face must succeed');
    assert.strictEqual(granted.boundGranted, true, 'the face must carry the grant before any reset');

    await page.evaluate(() => {
      devPauseBeforeFirstRoll = true;
      resetFight();
      startFreshTurnPaused();
    });
    const afterReset = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData, TEST_FACE);
    assert.ok(!afterReset.boundGranted, 'the Bound grant must be cleared by a fight reset');
    assert.strictEqual(afterReset.triggerCount, 1, 'the same face\'s own trigger count (run-scoped, unrelated to the grant) must survive the same reset');
    assertNoErrors(page);
    await page.close();
  });

  // ---- triggerFaceOutsideRoll() itself (pipeline.js) — the shared function
  // Threnody, Reverberation and Magnificat all go through. Called directly
  // here (the same convention the trigger-count tests above use for
  // callListeners) since it's engine plumbing, not any one card/mod's own
  // effect. ----

  await runTest(browser, 'triggerFaceOutsideRoll: refuses face 1 and face 20', async (browser) => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const r1 = triggerFaceOutsideRoll(1);
      const r20 = triggerFaceOutsideRoll(GAME_CONFIG.DIE_SIZE.PLAYER);
      return { r1: r1, r20: r20, natOneFired: gameState.player.natOneFiredThisFight };
    });
    assert.strictEqual(v.r1, false, 'face 1 must be refused');
    assert.strictEqual(v.r20, false, 'face 20 must be refused');
    assert.strictEqual(v.natOneFired, false, 'face 1 must not have actually triggered Penitence — the call must be refused outright, not dispatched');
    assertNoErrors(page);
    await page.close();
  });

  await runTest(browser, 'triggerFaceOutsideRoll: refuses a second outside trigger of the same face in one round', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    const v = await page.evaluate((faceNum) => {
      const first = triggerFaceOutsideRoll(faceNum);
      const second = triggerFaceOutsideRoll(faceNum);
      return { first: first, second: second };
    }, TEST_FACE);
    assert.strictEqual(v.first, true, 'the first outside trigger this round must succeed');
    assert.strictEqual(v.second, false, 'a second outside trigger of the same face in the same round must be refused');
    assertNoErrors(page);
    await page.close();
  });

  await runTest(browser, 'triggerFaceOutsideRoll: stops at the round trigger cap', async (browser) => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      // Faces 2-12 (eleven faces), each single-mod (smite): eleven separate
      // outside triggers attempted, one per face (never repeating a face,
      // so the "once per round" rule above can't be what stops the last
      // one) — only GAME_CONFIG.ROUND_TRIGGER_CAP (10) of them may succeed.
      const newFaces = gameState.die.faces.slice();
      for (let n = 2; n <= 12; n++) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); }
      updateDie({ faces: newFaces });
      const results = [];
      for (let n = 2; n <= 12; n++) { results.push(triggerFaceOutsideRoll(n)); }
      return { results: results, cap: GAME_CONFIG.ROUND_TRIGGER_CAP, count: gameState.turn.roundTriggerCount };
    });
    assert.strictEqual(v.results.filter(function(r) { return r === true; }).length, v.cap, 'exactly ' + v.cap + ' triggers should succeed before the cap stops the rest');
    assert.strictEqual(v.results[v.results.length - 1], false, 'the eleventh outside trigger this round must be refused by the cap');
    assert.strictEqual(v.count, v.cap, 'the round trigger counter must not exceed the cap for these single-mod faces');
    assertNoErrors(page);
    await page.close();
  });

  // ---- Checkpoint 3, the remaining Bound pieces: Concord, Herald ----

  await runTest(browser, 'Concord: +1 soul, 3 block', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    await triggerMod(page, 'concord');
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    assert.strictEqual(after.soul - before.soul, 1, 'expected +1 soul');
    assert.strictEqual(after.block - before.block, 3, 'expected 3 block');
    assertNoErrors(page);
    await page.close();
  });

  // Herald — 6 damage; one other random loaded face without Bound gains
  // Bound for the fight, through grantBoundToFace() and pickRandom() (state.
  // js, the same Math.random() source shuffle() uses). Herald itself (face
  // 2), Accord (face 4, already Bound — must never be picked) and three
  // non-Bound candidates (Smite face 3, Blight face 5, and Consecrate — the
  // anchor, always loaded on face 10 — a real candidate too, since it's
  // just another loaded, non-Bound face here) are in play; Math.random is
  // replaced with a fixed sequence so the pick is deterministic — proves
  // the grant lands on a loaded, non-Bound, non-own face, that the grant
  // lives in that face's own modData (ARCH-CF2), that face weight is
  // untouched (ARCH-CF6 — strengthenFace() is the only writer, never called
  // here), and that the grant is fight-scoped, not run-scoped.
  await runTest(browser, 'Herald: 6 damage; a fixed random sequence grants Bound to a loaded, non-Bound, non-own face for the fight only', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'herald' }); // face 2
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'smite' });  // face 3, not Bound
      newFaces[3] = Object.assign({}, newFaces[3], { modId: 'accord' }); // face 4, already Bound — must be excluded
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'blight' }); // face 5, not Bound
      updateDie({ faces: newFaces });
      // Fixed sequence: candidates (ascending) are [face3, face5, face10 —
      // the anchor] — floor(0.5*3)=1 always picks face5.
      Math.random = function() { return 0.5; };
    });
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({
      hpAfter: gameState.enemy.hp,
      face3: gameState.die.faces[2].modData || null,
      face4: gameState.die.faces[3].modData || null,
      face5: gameState.die.faces[4].modData || null,
      face10: gameState.die.faces[9].modData || null,
      face5Weight: gameState.die.faces[4].weight
    }));
    assert.strictEqual(hpBefore - v.hpAfter, 6, 'expected 6 damage');
    assert.ok(!v.face3 || !v.face3.boundGranted, 'face 3 (not picked) must not have been granted Bound');
    assert.ok(!v.face4 || !v.face4.boundGranted, 'face 4 (already Bound via Accord) must never be the grant target');
    assert.ok(!v.face10 || !v.face10.boundGranted, 'face 10 (the anchor, not picked) must not have been granted Bound');
    assert.strictEqual(v.face5.boundGranted, true, 'face 5 must be granted Bound, per the fixed random sequence, living in its own modData (ARCH-CF2)');
    assert.strictEqual(v.face5Weight, 1, 'the grant must never touch face weight (ARCH-CF6: strengthenFace() is the only writer)');

    await page.evaluate(() => {
      devPauseBeforeFirstRoll = true;
      resetFight();
      startFreshTurnPaused();
    });
    const afterReset = await page.evaluate(() => gameState.die.faces[4].modData);
    assert.ok(!afterReset || !afterReset.boundGranted, 'the Herald grant must clear at fight end, same as any other Bound grant');
    assertNoErrors(page);
    await page.close();
  });

  await runTest(browser, 'Dread: applies 4 stacks of awe', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => gameState.enemy.aweStacks);
    await triggerMod(page, 'dread');
    const after = await page.evaluate(() => gameState.enemy.aweStacks);
    assert.strictEqual(after - before, 4, 'expected exactly +4 stacks of awe');
    assertNoErrors(page);
    await page.close();
  });

  await runTest(browser, 'Genuflect: 6 block, applies 3 stacks of awe', async (browser) => {
    const page = await freshFightPage(browser);
    const before = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    await triggerMod(page, 'genuflect');
    const after = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    assert.strictEqual(after.block - before.block, 6, 'expected exactly +6 block');
    assert.strictEqual(after.awe - before.awe, 3, 'expected exactly +3 stacks of awe');
    assertNoErrors(page);
    await page.close();
  });

  await browser.close();

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' mod tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
    process.exit(1);
  }
  process.exit(0);
})();
