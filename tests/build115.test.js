// ============================================================
// TESTS/BUILD115.TEST.JS — BUILD 115
// Mod regression tests for BUILD 115, split out of tests/mods.test.js
// unchanged. Same shape as tests/mods.test.js: plain Node script,
// playwright launched directly, node:assert, a fresh page per mod.
// Run: node tests/build115.test.js
// ============================================================

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, TEST_FACE, freshFightPage, triggerMod, assertNoErrors } = require('./shared-constants');

const { runModTest: runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---- Two-mod faces (BUILD 115) ----

  // A face can hold up to two mods (modId, then modId2 — load order). Both
  // trigger when the face is rolled, first-loaded first, each resolving
  // fully before the next begins. Fervour (loaded first, modId) registers a
  // turn-scoped DAMAGE_MULTIPLIER that doubles 'attack' damage; Smite
  // (loaded second, modId2) deals a flat 16 'attack' damage. If dispatch
  // order is correct, Fervour's multiplier is already registered by the
  // time Smite's dealDamage() runs, so the result is 32, not 16 — this is
  // an order assertion, not just a "both fired" assertion.
  await runTest(browser, 'Two mods on one face: both trigger in load order (Fervour then Smite = 32)', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'fervour', modId2: 'smite' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 32, 'expected Fervour (loaded first) to already be registered when Smite (loaded second) deals its 16 attack damage, doubling it to 32 — a reversed dispatch order would leave it at 16');
    assertNoErrors(page);
    await page.close();
  });

  // The cap holds at two, never three. Exercises the real dev-tool cap
  // logic (devLoadMod(), dev-tools.js) rather than reaching into gameState
  // directly: fills modId, then modId2, then attempts a third load on the
  // same face and asserts it is refused — neither existing slot is
  // overwritten.
  await runTest(browser, 'Two-mod cap: a third load onto a full face is refused', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { devChromeOpen = true; renderDevModOptions(); });
    async function loadViaDevTool(modId, faceNumber) {
      await page.evaluate(({ modId, faceNumber }) => {
        document.getElementById('devModSelect').value = modId;
        document.getElementById('devFaceInput').value = String(faceNumber);
        devLoadMod();
      }, { modId, faceNumber });
    }
    await loadViaDevTool('smite', TEST_FACE);
    await loadViaDevTool('penance', TEST_FACE);
    await loadViaDevTool('offering', TEST_FACE); // third attempt onto the same, now-full face
    const face = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1], TEST_FACE);
    assert.strictEqual(face.modId, 'smite', 'first slot must remain smite, untouched by the refused third load');
    assert.strictEqual(face.modId2, 'penance', 'second slot must remain penance, not overwritten by the refused third load');
    assertNoErrors(page);
    await page.close();
  });

  // A face holding two mods triggers both under a Nat 20, within that
  // face's own turn in the ascending sequence — same MOD_TRIGGER dispatch
  // onNatTwenty() already uses for a single-mod face, called twice in a row
  // for this one. Smite (16 damage) and Blight (6 poison) are independently
  // observable, so this asserts "both fired," complementing the order
  // assertion above.
  await runTest(browser, 'Nat 20: a two-mod face triggers both mods', async (browser) => {
    const page = await freshFightPage(browser);
    await page.evaluate((faceNum) => {
      devChromeOpen = true;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'smite', modId2: 'blight' });
      updateDie({ faces: newFaces });
    }, TEST_FACE);
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // face 20, Nat 20
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    assert.strictEqual(before.hp - after.hp, 16, 'expected Smite\'s 16 damage from the Nat 20 loop');
    assert.strictEqual(after.poison - before.poison, 6, 'expected Blight\'s 6 poison from the Nat 20 loop');
    assertNoErrors(page);
    await page.close();
  });

  await browser.close();
  process.exit(report('build115') > 0 ? 1 : 0);
})();
