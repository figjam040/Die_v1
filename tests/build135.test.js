// ============================================================
// TESTS/BUILD135.TEST.JS — BUILD 135
// Regression tests for BUILD 135, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build135.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 135 — win the fight the moment the enemy dies. CHECK_WIN_LOSS's
  // own phase (phase-machine.js) never actually runs this check itself —
  // it is the label on the last PHASE_ORDER slot, reached only after End
  // Turn/ENEMY_ACT_PHASE. The real check is the top-of-runPhase() guard
  // (BUILD 053/068), re-entered on demand via the new shared checkWinNow()
  // (phase-machine.js) any time a player-side kill happens outside a
  // natural phase transition — a card (unchanged since BUILD 053, now
  // routed through the shared helper) or a Nat 20 sweep/Bound scan
  // (BUILD 133's playSweep()) completing (new this build — those staggered,
  // async dispatches used to leave a kill undetected until End Turn's own
  // next phase transition saw it cold).
  // ---------------------------------------------------------------
  // The shared `browser` is already closed by this point (see above) — both
  // of these launch their own instance, same shape as the BUILD 132
  // Magnificat test just above.
  await runTest('BUILD 135: a card that kills the enemy wins the fight immediately, no End Turn needed', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { nextPhase(); }); // ROLL_PHASE -> CARD_PHASE, one real (non-lethal) roll
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => {
      const newHand = gameState.player.hand.slice();
      newHand[0] = 'strike'; // 5 damage, cost 1 (well within the default 3 soul)
      updatePlayer({ hand: newHand });
      updateEnemy({ hp: 3 }); // below Strike's 5 damage — this play is lethal
    });
    await page.evaluate(() => { playCard(0); });
    const status = await page.evaluate(() => gameState.run.status);
    const phase = await page.evaluate(() => gameState.turn.phase);
    assert.strictEqual(status, 'win', 'playCard() itself must win the fight the instant the card is played — no nextPhase()/End Turn call was made');
    assert.strictEqual(phase, 'CARD_PHASE', 'turn.phase must never have needed to leave CARD_PHASE for the win to register');
    await liveBrowser.close();
  });

  await runTest('BUILD 135: enemy HP on screen never reads below 0', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => {
      // Internal state is never clamped (overkill damage applies raw) —
      // only the rendered display (rendering.js's renderStats()) is.
      updateEnemy({ hp: -37 });
      renderStats();
    });
    const [text, rawHp] = await page.evaluate(() => [document.getElementById('enemyHpValue').textContent, gameState.enemy.hp]);
    assert.strictEqual(rawHp, -37, 'test setup: internal enemy.hp must actually be negative');
    assert.ok(/^0 \//.test(text), 'displayed enemy HP must clamp to 0, never show the raw negative value: got "' + text + '"');
    await liveBrowser.close();
  });

  process.exit(report('build135') > 0 ? 1 : 0);
})();
