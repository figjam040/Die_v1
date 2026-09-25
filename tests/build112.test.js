// ============================================================
// TESTS/BUILD112.TEST.JS — BUILD 112
// Regression tests for BUILD 112, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build112.test.js
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
  // BUILD 112 (KI-9) — clearFightScopedState()/resetFight() lost their
  // clearListeners('fight') call in BUILD 092 (correctly — 'fight' was
  // always dead, see FIGHT RESET), but neither function calls
  // clearListeners('turn') either, and a 'turn'-scoped listener (e.g.
  // Fervour's DAMAGE_MULTIPLIER registration) can genuinely still be
  // registered the instant a fight ends mid-turn (a win doesn't wait for
  // that turn's own next START_OF_TURN). This test checks BOTH halves
  // honestly rather than assuming either: the registry really does still
  // carry the stale entry in the narrow window right after a fight ends,
  // and it is really gone by the time the next fight is actually playable
  // — because every real fight-transition path (beginFightFromSlot() via
  // startFreshTurnPaused()) synchronously runs a new START_OF_TURN, whose
  // own clearListeners('turn') call (phase-machine.js) is what actually
  // closes the gap, not clearFightScopedState()/resetFight() themselves.
  // Nothing in that narrow window dispatches DAMAGE_MULTIPLIER (post-win
  // die-action/card-reward screens don't), so the stale entry is never
  // exercised — but it does genuinely exist for a moment, which is the
  // literal KI-9 finding, not a fix that was never needed.
  // ---------------------------------------------------------------
  await runTest('KI-9: a stale turn-scoped listener does not survive into a second real fight', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'fervour' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const registeredMidFight1 = await page.evaluate(() => (gameState.registry.listeners['DAMAGE_MULTIPLIER'] || []).some(function(l) { return l.id === 'fervour_double_attacks'; }));
    assert.strictEqual(registeredMidFight1, true, 'Fervour must actually register its turn-scoped listener when triggered');

    // Force fight 1's win the same way the other tests in this file do —
    // runPhase()'s own top-of-function win guard, the real win code path.
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const staleRightAfterWin = await page.evaluate(() => (gameState.registry.listeners['DAMAGE_MULTIPLIER'] || []).some(function(l) { return l.id === 'fervour_double_attacks'; }));
    assert.strictEqual(staleRightAfterWin, true, 'KI-9, confirmed: clearFightScopedState()/resetFight() do not clear turn-scoped listeners, so the stale entry genuinely still exists the instant the fight ends');

    // Real post-win screens (die action, card reward) — skip through
    // whichever appear, exactly as a player clicking Skip would.
    for (let i = 0; i < 5; i++) {
      const state = await page.evaluate(() => ({ dieActionStep: dieActionStep, cardRewardStep: cardRewardStep }));
      if (state.dieActionStep !== null) { await page.evaluate(() => { dieActionChooseSkip(); }); continue; }
      if (state.cardRewardStep !== null) { await page.evaluate(() => { cardRewardSkip(); }); continue; }
      break;
    }

    // Enter fight 2 the real way — chooseLane()/enterSlot(), which is what
    // every real "next fight" transition actually calls.
    await page.evaluate(() => { chooseLane('upper'); enterSlot('upper', 0); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE' || gameState.turn.phase === 'START_OF_TURN');
    const staleOnceFight2Started = await page.evaluate(() => (gameState.registry.listeners['DAMAGE_MULTIPLIER'] || []).some(function(l) { return l.id === 'fervour_double_attacks'; }));
    assert.strictEqual(staleOnceFight2Started, false, 'no stale fight-scoped listener may survive into a second real fight — fight 2\'s own START_OF_TURN must have cleared it');
    await page.close();
  });

  // ---------------------------------------------------------------
  // BUILD 112 (KI-2) — playCard()'s new one-line run.status guard.
  // ---------------------------------------------------------------
  await runTest('KI-2: playCard() rejects a call attempted after the run has halted', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Force the win the same real way every other test in this file does.
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const status = await page.evaluate(() => gameState.run.status);
    assert.notStrictEqual(status, 'active', 'test setup: run must actually be halted before the guard is exercised');
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, handLen: gameState.player.hand.length }));
    const result = await page.evaluate(() => {
      const beforeLog = document.querySelectorAll('#log > div').length;
      playCard(0); // attempted post-halt — must be a real no-op, not a thrown error
      const afterLog = document.querySelectorAll('#log > div').length;
      const lastLine = document.querySelector('#log > div:last-child') ? document.querySelector('#log > div:last-child').textContent : '';
      return { threw: false, logGrew: afterLog > beforeLog, lastLine: lastLine };
    }).catch(function() { return { threw: true }; });
    assert.strictEqual(result.threw, false, 'playCard() must not throw when called after halt, it must reject cleanly');
    assert.ok(result.logGrew, 'the rejection must be logged, not a silent no-op');
    assert.ok(result.lastLine.indexOf('cannot play') !== -1, 'expected the guard\'s own rejection line: ' + result.lastLine);
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, handLen: gameState.player.hand.length }));
    assert.strictEqual(after.soul, before.soul, 'no soul may be spent by a rejected post-halt call');
    assert.strictEqual(after.handLen, before.handLen, 'no card may leave the hand on a rejected post-halt call');
    await page.close();
  });

  await browser.close();
  process.exit(report('build112') > 0 ? 1 : 0);
})();
