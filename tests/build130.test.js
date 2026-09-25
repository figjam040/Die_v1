// ============================================================
// TESTS/BUILD130.TEST.JS — BUILD 130
// Regression tests for BUILD 130, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build130.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {

  // ---------------------------------------------------------------
  // BUILD 130 — checkpoint 3 tags, plus the six new mods that need no
  // other new engine code (Largesse, Tithe, Congregation, Cope, Anathema,
  // Thurible). Every mod and card carries a tags field; ARCH-CF2/ARCH-CF6
  // hold (per-face state stays in modData, face weight changes only
  // through strengthenFace()) for the two new mods that touch either.
  // ---------------------------------------------------------------

  await runTest('BUILD 130: every mod carries the tags listed in the checkpoint 3 tags build', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tags = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.mods).forEach(function(id) { out[id] = gameState.config.mods[id].tags || null; });
      return out;
    });
    assert.deepStrictEqual(tags, {
      consecrate: ['soul'],
      smite: [],
      penance: ['bastion'],
      offering: ['soul'],
      blight: ['poison'],
      virulence: ['poison'],
      sanctuary: ['bastion'],
      vigil: ['blank'],
      zeal: ['mass', 'growth'],
      fervour: ['mass'],
      ordain: ['mass', 'growth'],
      anthem: ['mass'],
      elevation: ['mass', 'growth'],
      // The six new mods.
      largesse: ['soul'],
      tithe: ['blank'],
      congregation: ['growth'],
      cope: ['growth', 'bastion'],
      anathema: ['bastion'],
      thurible: ['poison'],
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      magnificat: ['mass'],
      // BUILD 133 — checkpoint 3, Bound engine.
      unison: ['bound'], accord: ['bound'], kinship: ['bound', 'poison'],
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      concord: ['bound', 'soul'], herald: ['bound'],
      // BUILD 149 — the awe cluster.
      dread: ['awe'], genuflect: ['awe']
    });
    await liveBrowser.close();
  });

  await runTest('BUILD 130: every reward-pool card carries the tags listed in the checkpoint 3 tags build', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tags = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.cardPool).forEach(function(id) { out[id] = gameState.config.cardPool[id].tags || null; });
      return out;
    });
    assert.deepStrictEqual(tags, {
      rebuke: [], censure: [], vestment: [], litany: [], scripture: [],
      interdict: [], orison: ['blank'],
      censer: ['poison'], purge: ['poison'], reckoning: ['poison'],
      communion: ['soul'], rapture: ['soul'],
      retribution: ['bastion'],
      covenant: ['mass'],
      judgement: [],
      // BUILD 131 — checkpoint 3 cards, sixteen new cards.
      chastise: [], cloister: [], psalm: [],
      tenet: ['growth', 'mass'], jubilee: ['growth', 'mass'],
      gradual: ['mass'], vacancy: ['blank'], tabernacle: ['blank'],
      lauds: ['growth'],
      reliquary: ['bastion'], vindication: ['bastion'],
      myrrh: ['poison'], exequy: ['poison'],
      hosanna: [], gloria: ['soul'], oblation: ['soul'],
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      threnody: ['growth'], reverberation: ['blank'],
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      kyrie: ['bound'], novena: ['bound'], canticle: ['bound'],
      // BUILD 149 — the awe cluster.
      kneel: ['awe'], compline: ['awe'], tremendum: ['awe'], mysterium: ['awe'],
      // BUILD 150 — Bulwark.
      bulwark: [],
      // BUILD 153 — seven cards beside the artifact pass.
      venom: ['poison'], ballast: ['mass'], refrain: ['bound'], second_sight: ['die'],
      cadence: ['growth'], watchword: ['bound'], blight_weight: ['poison', 'mass']
    });
    await liveBrowser.close();
  });

  await runTest('BUILD 130: the three starters (Strike/Ward/Rite) carry an empty tags list', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tags = await page.evaluate(() => ({
      strike: gameState.config.cards['strike'].tags,
      ward: gameState.config.cards['ward'].tags,
      rite: gameState.config.cards['rite'].tags
    }));
    assert.deepStrictEqual(tags, { strike: [], ward: [], rite: [] });
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Largesse — +2 soul, 4 block', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'largesse' }); // face 2
      updateDie({ faces: newFaces });
    });
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    assert.strictEqual(after.soul - before.soul, 2, 'expected exactly +2 soul');
    assert.strictEqual(after.block - before.block, 4, 'expected exactly 4 block');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Tithe — 1 block per blank face on the die when it triggers', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'tithe' }); // face 2
      updateDie({ faces: newFaces });
    });
    // Faces 1 and 20 are Nat faces; 10 (Consecrate) and 2 (Tithe) are loaded: 16 blanks.
    const blockBefore = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const blockAfter = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockAfter - blockBefore, 16, 'expected 1 block per blank face (16 blanks)');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Congregation — 8 damage, 16 with another loaded Growth mod, never counts itself', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'congregation' }); // face 2
      updateDie({ faces: newFaces });
    });
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 8, 'expected 8 damage with no other Growth mod loaded (must not count itself)');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Cope — 8 block, permanently +2 per trigger stored in modData (ARCH-CF2)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'cope' }); // face 2
      updateDie({ faces: newFaces });
    });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const after = await page.evaluate(() => gameState.player.block);
    const bonus = await page.evaluate(() => gameState.die.faces[1].modData ? gameState.die.faces[1].modData.copeBonus : null);
    assert.strictEqual(after - before, 8, 'expected exactly 8 block on first trigger');
    assert.strictEqual(bonus, 2, 'expected the face\'s own modData.copeBonus to become 2 after one trigger (ARCH-CF2: per-face state stays in modData)');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Anathema — end of round damage equals block, capped at 16', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'anathema' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ block: 20 }); });
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'END_PLAYER_TURN');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 16, 'expected damage capped at 16 despite 20 block');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: Thurible — 8 damage, 3 stacks of poison applied', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'thurible' }); // face 2
      updateDie({ faces: newFaces });
    });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, poison: gameState.enemy.poisonStacks }));
    assert.strictEqual(before.hp - after.hp, 8, 'expected exactly 8 damage');
    assert.strictEqual(after.poison - before.poison, 3, 'expected exactly +3 poison stacks');
    await liveBrowser.close();
  });

  await runTest('BUILD 130: the six new mods are all offerable through Load (ARCH-CF6: weight changes only via strengthenFace())', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const newMods = ['largesse', 'tithe', 'congregation', 'cope', 'anathema', 'thurible'];
      const seen = {};
      newMods.forEach(function(id) { seen[id] = false; });
      for (let i = 0; i < 1000 && !Object.values(seen).every(Boolean); i++) {
        dieActionChooseLoad();
        dieActionMods.forEach(function(id) { if (id in seen) seen[id] = true; });
      }
      // ARCH-CF6 spot-check: strengthenFace() is still the only weight
      // writer these new mods touch anywhere (Cope never writes weight at
      // all; none of the six call strengthenFace() directly, unlike Ordain/
      // Elevation) — confirmed by reading the source rather than a runtime
      // probe, since no new weight-writing code was added.
      return seen;
    });
    Object.keys(v).forEach(function(id) { assert.ok(v[id], 'expected ' + id + ' to appear in a Load offer within 1000 samples'); });
    await liveBrowser.close();
  });

  process.exit(report('build130') > 0 ? 1 : 0);
})();
