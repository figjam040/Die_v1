// ============================================================
// TESTS/BUILD131.TEST.JS — BUILD 131
// Regression tests for BUILD 131, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build131.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {

  // ---------------------------------------------------------------
  // BUILD 131 — checkpoint 3, sixteen new cards, no new engine code. One
  // test per card, each playing the real card through playCard() (never
  // calling card.effect() directly) and checking its numbers, its own
  // condition, and its cap where it has one — same style Tithe/Anathema/
  // Retribution already established for a capped card: pick inputs that
  // push the raw value past the cap so the cap is actually exercised, not
  // just declared.
  // ---------------------------------------------------------------


  await runTest('BUILD 131: Tenet — a blank roll counts 0 triggers', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); }); // face 3 is blank, no modData at all
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['tenet'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 6, 'expected the base 6 damage with a blank rolled face (0 triggers)');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Vacancy — 1 damage per blank face on the die, no cap', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const blanksBefore = await page.evaluate(() => gameState.die.faces.filter(function(f) { return f.number >= 2 && f.number <= 19 && f.modId === null; }).length);
    assert.strictEqual(blanksBefore, 17, 'test setup: a fresh die holds 17 blank faces');
    await page.evaluate(() => { updatePlayer({ hand: ['vacancy'], soul: 5 }); });
    const hpBefore1 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const hpAfter1 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore1 - hpAfter1, 17, 'expected 17 damage for 17 blank faces, above the old cap of 16');

    // Load faces and confirm the count follows the blanks left.
    const blanksAfter = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      for (let n = 2; n <= 9; n++) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); }
      updateDie({ faces: newFaces });
      updatePlayer({ hand: ['vacancy'], soul: 5 });
      return gameState.die.faces.filter(function(f) { return f.number >= 2 && f.number <= 19 && f.modId === null; }).length;
    });
    const hpBefore2 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const hpAfter2 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore2 - hpAfter2, blanksAfter, 'expected exactly ' + blanksAfter + ' damage');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Lauds — 4 damage +3 per loaded Growth mod (two mods on one face count twice), capped at 13', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      [2, 3, 4, 5].forEach(function(n) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'zeal' }); }); // 4 Growth-tagged faces: 4 + 3*4 = 16, caps at 13
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, untouched, still blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['lauds'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 13, 'expected damage capped at 13 despite 16 raw (4 + 3x4 loaded Growth mods)');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Chastise — 7 damage', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['chastise'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 7, 'expected exactly 7 damage');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Cloister — 7 block', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['cloister'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 7, 'expected exactly 7 block');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Psalm — draw 1, costs 0 soul', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: gameState.player.hand.concat(['psalm']) }); });
    const before = await page.evaluate(() => ({ handLen: gameState.player.hand.length, soul: gameState.player.soul }));
    await page.evaluate(() => { playCard(gameState.player.hand.length - 1); });
    const after = await page.evaluate(() => ({ handLen: gameState.player.hand.length, soul: gameState.player.soul }));
    assert.strictEqual(after.handLen - (before.handLen - 1), 1, 'expected hand size to grow by exactly 1 net of the played card (1 drawn)');
    assert.strictEqual(after.soul, before.soul, 'expected soul unchanged (cost 0)');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Reliquary — 6 block always, +5 damage if block was 10 or more before playing it', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    // Below the threshold: only block, no damage.
    await page.evaluate(() => { updatePlayer({ hand: ['reliquary'], soul: 5, block: 0 }); });
    const beforeLow = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    const afterLow = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(afterLow.block - beforeLow.block, 6, 'expected exactly 6 block with 0 block before playing');
    assert.strictEqual(beforeLow.hp - afterLow.hp, 0, 'expected no damage with block under 10 before playing');

    // At/above the threshold: block plus the bonus damage.
    await page.evaluate(() => { updatePlayer({ hand: ['reliquary'], soul: 5, block: 10 }); });
    const beforeHigh = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    const afterHigh = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(afterHigh.block - beforeHigh.block, 6, 'expected exactly 6 block with 10 block before playing');
    assert.strictEqual(beforeHigh.hp - afterHigh.hp, 5, 'expected exactly 5 bonus damage with 10 block before playing');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Vindication — damage equal to twice block (block read, not spent), capped at 24', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['vindication'], soul: 5, block: 20 }); }); // 2*20 = 40, caps at 24
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.strictEqual(before.hp - after.hp, 24, 'expected damage capped at 24 despite 40 raw (2x20 block)');
    assert.strictEqual(after.block, before.block, 'expected block to be read only, never spent');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Myrrh — 6 block +1 per stack of poison on the enemy, capped at 12', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updateEnemy({ poisonStacks: 10 }); updatePlayer({ hand: ['myrrh'], soul: 5 }); }); // 6 + 10 = 16, caps at 12
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 12, 'expected block capped at 12 despite 16 raw (6 + 10 stacks of poison)');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Exequy — damage equal to the enemy\'s stacks of poison, not removed, capped at 12', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updateEnemy({ poisonStacks: 20 }); updatePlayer({ hand: ['exequy'], soul: 5 }); }); // caps at 12
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    assert.strictEqual(before - after.hp, 12, 'expected damage capped at 12 despite 20 stacks of poison');
    assert.strictEqual(after.poison, 20, 'expected poison stacks unchanged — not removed');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Gloria — 30 damage, unaffordable and dimmed like any other card on base soul 3 (cost 4)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    // Unaffordable on base soul (F02: 3), same generic soul >= cost gate every card uses.
    await page.evaluate(() => { updatePlayer({ hand: ['gloria'], soul: 3 }); });
    const beforeNoAfford = await page.evaluate(() => ({ hp: gameState.enemy.hp, soul: gameState.player.soul, handLen: gameState.player.hand.length }));
    await page.evaluate(() => { playCard(0); });
    const afterNoAfford = await page.evaluate(() => ({ hp: gameState.enemy.hp, soul: gameState.player.soul, handLen: gameState.player.hand.length }));
    assert.strictEqual(beforeNoAfford.hp, afterNoAfford.hp, 'expected no effect when unaffordable (soul 3 < cost 4)');
    assert.strictEqual(beforeNoAfford.soul, afterNoAfford.soul, 'expected soul untouched when unaffordable');
    assert.strictEqual(beforeNoAfford.handLen, afterNoAfford.handLen, 'expected the card to stay in hand when unaffordable');

    // Affordable: full 30 damage.
    await page.evaluate(() => { updatePlayer({ hand: ['gloria'], soul: 4 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 30, 'expected exactly 30 damage when affordable');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Oblation — 7 damage per soul spent (all of it, soul becomes 0), capped at 42', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['oblation'], soul: 7 }); }); // 7*7 = 49, caps at 42
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, soul: gameState.player.soul }));
    assert.strictEqual(before - after.hp, 42, 'expected damage capped at 42 despite 49 raw (7x7 soul spent)');
    assert.strictEqual(after.soul, 0, 'expected soul to become exactly 0');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Oblation — 0 soul deals 0 damage', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['oblation'], soul: 0 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, soul: gameState.player.soul }));
    assert.strictEqual(before - after.hp, 0, 'expected 0 damage with 0 soul spent');
    assert.strictEqual(after.soul, 0, 'expected soul to stay 0');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Tabernacle — 2 block per blank face on the die, no cap, whatever the rolled weight', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { weight: 4 }); // face 3, weight 4: must not matter
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['tabernacle'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 34, 'expected 2 block per blank face (17 blanks = 34), above the old cap of 12');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Jubilee — 4 damage +2 per weight added to the die this run, capped at 24', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      // 12 weight added: 4 + 2*12 = 28, caps at 24.
      updateRun({ weightAdded: 12 });
    });
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, untouched, still blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['jubilee'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 24, 'expected damage capped at 24 despite 28 raw (4 + 2x12 weight added)');
    await liveBrowser.close();
  });

  process.exit(report('build131') > 0 ? 1 : 0);
})();
