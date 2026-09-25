// ============================================================
// TESTS/BUILD113.TEST.JS — BUILD 113
// Mod regression tests for BUILD 113, split out of tests/mods.test.js
// unchanged. Same shape as tests/mods.test.js: plain Node script,
// playwright launched directly, node:assert, a fresh page per mod.
// Run: node tests/build113.test.js
// ============================================================

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, TEST_FACE, freshFightPage, triggerMod, assertNoErrors } = require('./shared-constants');

const { runModTest: runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---- Anthem (BUILD 113) — 6 + 4 per point of weight on its own face:
  // weight 1 -> 10, weight 2 -> 14. Second trigger is driven through a real
  // second round (CARD_PHASE -> ... -> the next ROLL_PHASE via nextPhase(),
  // the same phase-machine transitions End Turn/auto-advance use — never a
  // shortcut) rather than reloading/re-forcing mid-turn, so this also
  // proves the weight read survives a full turn cycle intact. ----
  await runTest(browser, 'Anthem: 10 damage at weight 1, 14 at weight 2 after Strengthen', async (browser) => {
    const page = await freshFightPage(browser);
    const weightBefore = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, TEST_FACE);
    assert.strictEqual(weightBefore, 1, 'test assumes a fresh face starts at weight 1');

    let hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await triggerMod(page, 'anthem');
    let hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 10, 'expected exactly 10 damage at weight 1 (6 + 4*1)');

    // strengthenFace() (pipeline.js) is the one production function any
    // weight write goes through (Strengthen's own die-action button and
    // Ordain's effect both call it) — called directly here, same as
    // Ordain's own test above calls triggerMod() directly.
    const weightAfter = await page.evaluate((faceNum) => strengthenFace(faceNum), TEST_FACE);
    assert.strictEqual(weightAfter, 2, 'expected strengthenFace() to raise weight from 1 to 2');

    // Drive a full real turn cycle (CARD_PHASE -> END_PLAYER_TURN ->
    // ENEMY_ROLL_PHASE -> ENEMY_ACT_PHASE -> CHECK_WIN_LOSS -> START_OF_TURN
    // -> ROLL_PHASE) via nextPhase(), then force the same face again for a
    // second, independent trigger. Self-correcting step budget (not a
    // blind fixed count): runPhase()'s own win/loss guard can absorb one
    // nextPhase() call without advancing gameState.turn.phase when it runs
    // (a normal, documented behaviour, not a bug in this test), so this
    // loops until ROLL_PHASE is actually reached rather than assuming
    // exactly six calls always suffice.
    let reachedRollPhase = false;
    for (let i = 0; i < 10; i++) {
      const r = await page.evaluate(() => { nextPhase(); return { phase: gameState.turn.phase, status: gameState.run.status }; });
      if (r.phase === 'ROLL_PHASE') { reachedRollPhase = true; break; }
      assert.notStrictEqual(r.status, 'loss', 'player died mid-test (unexpected) — phase stuck at ' + r.phase);
    }
    assert.ok(reachedRollPhase, 'did not reach the second round\'s ROLL_PHASE within 10 phase steps');
    hpBefore = await page.evaluate(() => gameState.enemy.hp);
    // Round 1's forcePlayerRoll() (inside triggerMod()) reached CARD_PHASE
    // via the fight-start autoAdvance() timer (armed once, by
    // startFreshTurnPaused(), only for the fight's very first ROLL_PHASE).
    // That timer is not re-armed for a second round, so here the
    // ROLL_PHASE -> CARD_PHASE step after forcing the roll must be driven
    // explicitly, the same nextPhase() call End Turn/auto-advance make.
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 14, 'expected exactly 14 damage at weight 2 (6 + 4*2)');

    assertNoErrors(page);
    await page.close();
  });

  await browser.close();
  process.exit(report('build113') > 0 ? 1 : 0);
})();
