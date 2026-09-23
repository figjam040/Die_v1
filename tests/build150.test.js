// ============================================================
// TESTS/BUILD150.TEST.JS
// Standing regression suite for BUILD 150: lowered break numbers, the
// Bulwark card, gold, the shop (opens after every rite), and three artifacts
// (Third Eye, Loaded Die, Tolling Bell). Same shape as tests/build149.test.js:
// plain Node script, playwright launched directly, node:assert.
// Run: node tests/build150.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');

const results = [];
async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log('PASS — ' + name);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log('FAIL — ' + name + ': ' + err.message);
  }
}

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — break numbers lowered by 4
  // ---------------------------------------------------------------

  await runTest('Item A: every breakAt is lowered by 4 from its BUILD 149 value', async () => {
    const page = await freshPage(browser);
    const expected = {
      thurifer: 11, lector: 15, hierophant: 19, chorister: 14, cantor: 17,
      archdeacon: 21, cardinal: 25, inquisitor: 29, exarch: 31, pontifex: 31
    };
    const actual = await page.evaluate(() => {
      const out = {};
      Object.keys(GAME_CONFIG.ENEMIES).forEach(function(id) {
        const charge = GAME_CONFIG.ENEMIES[id].pattern.find(function(e) { return e.kind === 'charge'; });
        if (charge) out[id] = charge.breakAt;
      });
      return out;
    });
    Object.keys(expected).forEach(function(id) {
      assert.strictEqual(actual[id], expected[id], id + ': expected breakAt ' + expected[id] + ', got ' + actual[id]);
    });
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — Bulwark
  // ---------------------------------------------------------------

  await runTest('Item B: Bulwark gives 6 block against an Attack round, 16 against a wind-up round and a release round', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    // Attack round (default fresh-fight pattern has no charge active).
    // clearListeners('turn') drops whatever the round's own natural roll
    // registered (a Consecrate roll adds 3 block per card played), so
    // only Bulwark's own block is measured.
    await page.evaluate(() => { clearListeners('turn'); updateEnemy({ chargeStage: null }); updatePlayer({ hand: ['bulwark'], soul: 5 }); });
    const before1 = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after1 = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after1 - before1, 6, 'expected 6 block against an Attack round');

    // Wind-up round.
    await page.evaluate(() => { clearListeners('turn'); updateEnemy({ chargeStage: 'windup' }); updatePlayer({ hand: ['bulwark'], soul: 5 }); });
    const before2 = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after2 = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after2 - before2, 16, 'expected 16 block against a wind-up round');

    // Release round.
    await page.evaluate(() => { clearListeners('turn'); updateEnemy({ chargeStage: 'release' }); updatePlayer({ hand: ['bulwark'], soul: 5 }); });
    const before3 = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after3 = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after3 - before3, 16, 'expected 16 block against a release round');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — gold
  // ---------------------------------------------------------------

  await runTest('Item C: a Fight win adds 12-20 gold, an Elite win adds 30-40, a non-final Boss win adds 60, and the act 3 Boss adds none', async () => {
    const page = await freshPage(browser);
    // Fight (opening).
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const fightGold = await page.evaluate(() => gameState.run.gold);
    assert.ok(fightGold >= 12 && fightGold <= 20, 'expected 12-20 gold from a Fight win, got ' + fightGold);
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.evaluate(() => { cardRewardSkip(); });

    // Elite.
    const goldBeforeElite = await page.evaluate(() => gameState.run.gold);
    await page.evaluate(() => { devJumpToSlot('upper', 3); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const eliteDelta = await page.evaluate((before) => gameState.run.gold - before, goldBeforeElite);
    assert.ok(eliteDelta >= 30 && eliteDelta <= 40, 'expected 30-40 gold from an Elite win, got ' + eliteDelta);
    await page.evaluate(() => { artifactRewardSkip(); });
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.evaluate(() => { cardRewardSkip(); });

    // Act 1 Boss (non-final).
    const goldBeforeBoss = await page.evaluate(() => gameState.run.gold);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const bossDelta = await page.evaluate((before) => gameState.run.gold - before, goldBeforeBoss);
    assert.strictEqual(bossDelta, 60, 'expected exactly 60 gold from a non-final Boss win, got ' + bossDelta);
    await page.close();

    // Act 3 Boss (final) — no gold.
    const page2 = await freshPage(browser);
    await page2.evaluate(() => {
      updateRun({ actNumber: 3, act: buildAct(3), currentSlot: 'opening', lane: null, gold: 100 });
    });
    await page2.evaluate(() => { devJumpToSlot('boss', null); });
    await page2.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const goldBeforeFinal = await page2.evaluate(() => gameState.run.gold);
    await page2.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const goldAfterFinal = await page2.evaluate(() => gameState.run.gold);
    assert.strictEqual(goldAfterFinal, goldBeforeFinal, 'expected no gold from the act 3 (final) Boss win');
    await page2.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — the shop
  // ---------------------------------------------------------------

  await runTest('Item D: the shop opens after a rite, a purchase deducts the price and adds the card, removal rises 75 then 100, an unaffordable item cannot be bought, Leave costs nothing', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('upper', 1); }); // a rite slot
    await page.waitForTimeout(50);
    await page.evaluate(() => { updateRun({ gold: 500 }); riteChooseHeal(); });
    const shopOpen = await page.evaluate(() => shopStep);
    assert.strictEqual(shopOpen, 'open', 'expected the shop to open after a rite resolves');

    const shopCardId = await page.evaluate(() => gameState.run.shop.cards[0]);
    const price = await page.evaluate((id) => GAME_CONFIG.SHOP.CARD_PRICE[gameState.config.cardPool[id].tier], shopCardId);
    const before = await page.evaluate(() => ({ gold: gameState.run.gold, owned: gameState.player.ownedCards.length }));
    await page.evaluate((id) => { shopBuyCard(id); }, shopCardId);
    const after = await page.evaluate(() => ({ gold: gameState.run.gold, owned: gameState.player.ownedCards.length }));
    assert.strictEqual(before.gold - after.gold, price, 'expected the card purchase to deduct its exact price');
    assert.strictEqual(after.owned - before.owned, 1, 'expected the bought card to be added to ownedCards');

    // Removal price: 75, then rises to 100 after one purchase (anywhere in the run).
    const priceBefore = await page.evaluate(() => gameState.run.removalPrice);
    assert.strictEqual(priceBefore, 75, 'expected the removal price to start at 75');
    await page.evaluate(() => { shopBuyRemoval(); });
    await page.evaluate(() => { shopRemoveCard(0); });
    const priceAfter = await page.evaluate(() => gameState.run.removalPrice);
    assert.strictEqual(priceAfter, 100, 'expected the removal price to rise to 100 after one purchase');

    // Unaffordable item cannot be bought.
    await page.evaluate(() => { closeShopScreen(); });
    await page.evaluate(() => { devJumpToSlot('upper', 4); }); // the second rite slot
    await page.waitForTimeout(50);
    await page.evaluate(() => { updateRun({ gold: 0 }); riteChooseHeal(); });
    const cardId2 = await page.evaluate(() => gameState.run.shop.cards[0]);
    const goldBefore = await page.evaluate(() => gameState.run.gold);
    const ownedBefore = await page.evaluate(() => gameState.player.ownedCards.length);
    await page.evaluate((id) => { shopBuyCard(id); }, cardId2);
    const goldAfter = await page.evaluate(() => gameState.run.gold);
    const ownedAfter = await page.evaluate(() => gameState.player.ownedCards.length);
    assert.strictEqual(goldAfter, goldBefore, 'expected an unaffordable card purchase to change nothing');
    assert.strictEqual(ownedAfter, ownedBefore, 'expected an unaffordable card purchase to add nothing');

    // Leave costs nothing and returns to the map.
    const goldBeforeLeave = await page.evaluate(() => gameState.run.gold);
    await page.evaluate(() => { closeShopScreen(); });
    const afterLeave = await page.evaluate(() => ({ gold: gameState.run.gold, screen: gameState.run.screen, shopStep: shopStep }));
    assert.strictEqual(afterLeave.gold, goldBeforeLeave, 'expected Leave to cost no gold');
    assert.strictEqual(afterLeave.screen, 'map', 'expected Leave to return to the map');
    assert.strictEqual(afterLeave.shopStep, null, 'expected the shop panel to close on Leave');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM E — artifacts
  // ---------------------------------------------------------------

  await runTest('Item E: Third Eye forces the chosen face once, then is unavailable until the next act resets it', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateRun({ artifacts: ['third_eye'] }); });
    await page.evaluate(() => { thirdEyeChooseFace(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const afterChoose = await page.evaluate(() => ({ rolled: gameState.turn.rolledFaceNumber, used: gameState.run.thirdEyeUsedThisAct }));
    assert.strictEqual(afterChoose.rolled, 5, 'expected the chosen face 5 to be the one rolled');
    assert.strictEqual(afterChoose.used, true, 'expected thirdEyeUsedThisAct to be true after one use');

    // A second attempt the same act must refuse (rolledFaceNumber unchanged).
    await page.evaluate(() => { thirdEyeChooseFace(9); });
    const stillFive = await page.evaluate(() => gameState.turn.rolledFaceNumber);
    assert.strictEqual(stillFive, 5, 'expected a second Third Eye use this act to be refused');

    // The next act resets it — the real advanceRun() boss->next-act path.
    await page.evaluate(() => { updateRun({ actNumber: 1, currentSlot: 'boss' }); advanceRun(); });
    const usedNextAct = await page.evaluate(() => gameState.run.thirdEyeUsedThisAct);
    assert.strictEqual(usedNextAct, false, 'expected thirdEyeUsedThisAct to reset at the next act');
    await page.close();
  });

  await runTest('Item E: Loaded Die uses the higher of two forced rolls', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['loaded_die'] }); });
    const result = await page.evaluate(() => {
      const seq = [0.05, 0.95]; // pool index 1 (face 2), then pool index 19 (face 20)
      let i = 0;
      Math.random = function() { return seq[i++ % seq.length]; };
      return rollWithArtifacts(gameState.die.faces).number;
    });
    assert.strictEqual(result, 20, 'expected the higher-numbered face (20) to stand over the lower (2)');
    await page.close();
  });

  await runTest('Item E: Tolling Bell triggers two faces in a wind-up (or release) round, and one in an Attack round', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateRun({ artifacts: ['tolling_bell'] });
      updateEnemy({ chargeStage: 'windup' });
      const newFaces = gameState.die.faces.map(function(f, i) {
        const n = i + 1;
        if (n === 1 || n === 20) return f;
        return Object.assign({}, f, { modId: 'smite' }); // 16 damage every trigger
      });
      updateDie({ faces: newFaces });
      // Force both of the round's rolls onto a non-Nat, smite-loaded face —
      // faces 1/20 are excluded above so a random Nat roll would otherwise
      // make this test flaky.
      Math.random = function() { return 0.5; };
    });
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 32, 'expected two 16-damage triggers (32 total) during a wind-up round');

    const page2 = await freshPage(browser);
    await enterOpeningFight(page2);
    await page2.evaluate(() => {
      updateRun({ artifacts: ['tolling_bell'] });
      updateEnemy({ chargeStage: null });
      const newFaces = gameState.die.faces.map(function(f, i) {
        const n = i + 1;
        if (n === 1 || n === 20) return f;
        return Object.assign({}, f, { modId: 'smite' });
      });
      updateDie({ faces: newFaces });
      Math.random = function() { return 0.5; };
    });
    const hpBefore2 = await page2.evaluate(() => gameState.enemy.hp);
    await page2.evaluate(() => { nextPhase(); });
    await page2.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfter2 = await page2.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore2 - hpAfter2, 16, 'expected exactly one 16-damage trigger during an Attack round');
    await page.close();
    await page2.close();
  });

  await runTest('Item E: the artifact panel appears after an Elite win and after the act 1 Boss win, but not after a plain Fight win', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const afterFight = await page.evaluate(() => artifactRewardStep);
    assert.strictEqual(afterFight, null, 'expected no artifact panel after a plain Fight win');
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.evaluate(() => { cardRewardSkip(); });

    await page.evaluate(() => { devJumpToSlot('upper', 3); }); // Elite
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const afterElite = await page.evaluate(() => artifactRewardStep);
    assert.strictEqual(afterElite, 'choose', 'expected the artifact panel after an Elite win');
    await page.evaluate(() => { artifactRewardSkip(); });
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.evaluate(() => { cardRewardSkip(); });

    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    const afterBoss = await page.evaluate(() => artifactRewardStep);
    assert.strictEqual(afterBoss, 'choose', 'expected the artifact panel after the act 1 Boss win');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM F — no empty on-screen text, card pool count
  // ---------------------------------------------------------------

  await runTest('Item F: no card, mod or artifact has empty on-screen text, and the card pool has 48 entries', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const cardPoolIds = Object.keys(gameState.config.cardPool);
      const missingCards = cardPoolIds.filter(function(id) { return !getCardEffectText(id); });
      const modIds = Object.keys(gameState.config.mods).filter(function(id) { return id !== 'consecrate'; });
      const missingMods = modIds.filter(function(id) { return !MOD_DESCRIPTION[id]; });
      const artifactIds = Object.keys(gameState.config.artifacts);
      const missingArtifacts = artifactIds.filter(function(id) { return !gameState.config.artifacts[id].text; });
      return { cardPoolCount: cardPoolIds.length, missingCards: missingCards, missingMods: missingMods, missingArtifacts: missingArtifacts };
    });
    assert.strictEqual(v.cardPoolCount, 48, 'expected 48 reward-pool cards');
    assert.deepStrictEqual(v.missingCards, [], 'every reward-pool card must have on-screen text');
    assert.deepStrictEqual(v.missingMods, [], 'every offerable mod must have on-screen text');
    assert.deepStrictEqual(v.missingArtifacts, [], 'every artifact must have on-screen text');
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build150 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
