// ============================================================
// TESTS/BUILD153.TEST.JS
// Standing regression suite for the artifact pass: the rename, the ten new
// artifacts, artifacts sold in the shop, and seven new cards. Same shape as
// tests/build151.test.js: plain Node script, playwright launched directly,
// node:assert. Run: node tests/build153.test.js
// ============================================================

const { chromium } = require('playwright');
const fs = require('fs');
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

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function freshFightPage(browser, artifacts) {
  const page = await freshPage(browser);
  await page.evaluate((held) => {
    devChromeOpen = true;
    updateRun({ artifacts: held || [] });
  }, artifacts);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Forces a face through the real roll dispatch and settles on CARD_PHASE.
async function forceRoll(page, faceNumber) {
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((n) => { devChromeOpen = true; forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

// Writes modIds straight onto faces through updateDie(), the same way
// tests/mods.test.js sets a face up before forcing its roll.
async function loadFaces(page, pairs) {
  await page.evaluate((list) => {
    const newFaces = gameState.die.faces.slice();
    list.forEach(function(p) {
      newFaces[p[0] - 1] = Object.assign({}, newFaces[p[0] - 1], { modId: p[1], modId2: null });
    });
    updateDie({ faces: newFaces });
  }, pairs);
}

// The last '[ROLL] pool size: N' the log holds — how many tickets the bag
// actually carried on the most recent rollDie() call.
async function lastPoolSize(page) {
  return page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll('#log div'))
      .map(function(d) { return d.textContent; })
      .filter(function(t) { return t.indexOf('[ROLL] pool size: ') === 0; });
    return lines.length ? parseInt(lines[lines.length - 1].split(': ')[1], 10) : -1;
  });
}

const NEW_ARTIFACT_IDS = ['tithe_box', 'merchants_seal', 'leaden_face', 'reliquary_chain',
  'plague_bell', 'alms', 'hourglass', 'second_chance', 'gilded_die', 'bone_counter'];
const NEW_CARD_IDS = ['venom', 'ballast', 'refrain', 'second_sight', 'cadence', 'watchword', 'blight_weight'];

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — the rename
  // ---------------------------------------------------------------

  // The banned word is assembled at runtime so this file can scan for it
  // without containing it.
  await runTest('Item A: no file under js/, index.html or tests/ names the old word for an artifact', async () => {
    const banned = new RegExp('rel' + 'ic', 'i');
    const files = fs.readdirSync(path.join(ROOT, 'js')).map(function(f) { return path.join('js', f); })
      .concat(['index.html'])
      .concat(fs.readdirSync(path.join(ROOT, 'tests'))
        .filter(function(f) { return f.endsWith('.js'); })
        .map(function(f) { return path.join('tests', f); }));
    const offenders = files.filter(function(rel) {
      return banned.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    });
    assert.deepStrictEqual(offenders, [], 'files still naming the old word: ' + offenders.join(', '));
  });

  await runTest('Item A: the artifact row holds eight slots and ARTIFACT_MAX is 8', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      slots: document.querySelectorAll('#artifactRow .artifact-slot').length,
      max: GAME_CONFIG.ARTIFACT_MAX,
      total: Object.keys(gameState.config.artifacts).length
    }));
    assert.strictEqual(v.slots, 8, 'the artifact row must hold eight slots');
    assert.strictEqual(v.max, 8, 'ARTIFACT_MAX must be 8');
    assert.strictEqual(v.total, 13, 'there must be thirteen artifacts');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — the ten new artifacts
  // ---------------------------------------------------------------

  await runTest('Item B: Tithe Box pays 15 gold on a forced Nat 20', async () => {
    const page = await freshFightPage(browser, ['tithe_box']);
    await page.evaluate(() => { updateRun({ gold: 0 }); });
    await forceRoll(page, 20);
    const gold = await page.evaluate(() => gameState.run.gold);
    assert.strictEqual(gold, 15, 'a Nat 20 must pay 15 gold, got ' + gold);
    await page.close();
  });

  // D-111 (BUILD 169): the common tier is named basic; its price key follows.
  await runTest("Item B: Merchant's Seal prices a basic at 37 and leaves removal at 75 after a purchase", async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['merchants_seal'], gold: 1000 }); });
    const before = await page.evaluate(() => ({
      common: shopPriceWithArtifacts(GAME_CONFIG.SHOP.CARD_PRICE.basic),
      removal: shopRemovalPrice(),
      gold: gameState.run.gold
    }));
    assert.strictEqual(before.common, 37, 'a basic card must cost 37, got ' + before.common);
    assert.strictEqual(before.removal, 75, 'removal must cost 75, got ' + before.removal);

    await page.evaluate(() => { openShopScreen(); shopBuyRemoval(); shopRemoveCard(0); });
    const after = await page.evaluate(() => ({ gold: gameState.run.gold, removal: shopRemovalPrice() }));
    assert.strictEqual(before.gold - after.gold, 75, 'the removal must charge 75, charged ' + (before.gold - after.gold));
    assert.strictEqual(after.removal, 75, 'removal must still cost 75 after a purchase, got ' + after.removal);
    await page.close();
  });

  await runTest('Item B: Leaden Face makes Strengthen add 2 weight', async () => {
    const page = await freshPage(browser);
    const plain = await page.evaluate(() => {
      const before = gameState.die.faces[4].weight;
      openDieActionScreen('reward');
      dieActionPickStrengthenFace(5);
      return gameState.die.faces[4].weight - before;
    });
    assert.strictEqual(plain, 1, 'Strengthen must add 1 weight without the artifact, added ' + plain);

    const leaden = await page.evaluate(() => {
      updateRun({ artifacts: ['leaden_face'] });
      const before = gameState.die.faces[5].weight;
      openDieActionScreen('reward');
      dieActionPickStrengthenFace(6);
      return gameState.die.faces[5].weight - before;
    });
    assert.strictEqual(leaden, 2, 'Leaden Face must make Strengthen add 2 weight, added ' + leaden);
    await page.close();
  });

  await runTest('Item B: Reliquary Chain triggers the loaded face above a rolled Bound face, and never face 20', async () => {
    const page = await freshFightPage(browser, ['reliquary_chain']);
    await loadFaces(page, [[5, 'unison'], [6, 'smite']]);
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await forceRoll(page, 5);
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 22, 'Unison (6) plus the chained Smite (16) must deal 22, dealt ' + (hpBefore - hpAfter));
    await page.close();

    // Face 19 is Bound: nothing above it may trigger, face 20 being a Nat stub.
    const page2 = await freshFightPage(browser, ['reliquary_chain']);
    await loadFaces(page2, [[19, 'unison']]);
    const hp2Before = await page2.evaluate(() => gameState.enemy.hp);
    await forceRoll(page2, 19);
    const v = await page2.evaluate(() => ({
      hp: gameState.enemy.hp,
      outside: gameState.turn.outsideTriggeredFaces.slice()
    }));
    assert.strictEqual(hp2Before - v.hp, 6, 'only Unison may land from face 19, dealt ' + (hp2Before - v.hp));
    assert.strictEqual(v.outside.indexOf(20), -1, 'face 20 must never be chained into');
    await page2.close();
  });

  await runTest('Item B: Plague Bell applies 4 stacks of poison with 8 loaded faces and none with 1', async () => {
    const page = await freshFightPage(browser, ['plague_bell']);
    const eight = await page.evaluate(() => {
      const ids = ['smite', 'penance', 'offering', 'blight', 'virulence', 'sanctuary', 'largesse', 'tithe'];
      const newFaces = gameState.die.faces.slice();
      ids.forEach(function(id, i) {
        newFaces[i + 1] = Object.assign({}, newFaces[i + 1], { modId: id, modId2: null });
      });
      updateDie({ faces: newFaces });
      updateEnemy({ poisonStacks: 0 });
      callListeners('FIGHT_START', {});
      return gameState.enemy.poisonStacks;
    });
    assert.strictEqual(eight, 4, '8 loaded faces must apply 4 stacks of poison, applied ' + eight);

    const one = await page.evaluate(() => {
      const newFaces = gameState.die.faces.map(function(f) {
        if (f.number === 1 || f.number === 10 || f.number === GAME_CONFIG.DIE_SIZE.PLAYER) { return f; }
        return Object.assign({}, f, { modId: f.number === 2 ? 'smite' : null, modId2: null });
      });
      updateDie({ faces: newFaces });
      updateEnemy({ poisonStacks: 0 });
      callListeners('FIGHT_START', {});
      return gameState.enemy.poisonStacks;
    });
    assert.strictEqual(one, 0, '1 loaded face must apply no poison, applied ' + one);
    await page.close();
  });

  await runTest('Item B: Alms gives 1 soul and no block on a rolled blank', async () => {
    const page = await freshFightPage(browser, ['alms']);
    const before = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    await forceRoll(page, 2);
    const after = await page.evaluate(() => ({ soul: gameState.player.soul, block: gameState.player.block }));
    assert.strictEqual(after.soul - before.soul, 1, 'a blank roll must give 1 soul, gave ' + (after.soul - before.soul));
    assert.strictEqual(after.block - before.block, 0, 'a blank roll must give no block, gave ' + (after.block - before.block));
    await page.close();
  });

  await runTest('Item B: Hourglass skips the round 1 intent and the pattern still advances', async () => {
    const page = await freshFightPage(browser, ['hourglass']);
    await forceRoll(page, 2);
    const before = await page.evaluate(() => ({
      hp: gameState.player.hp, poison: gameState.player.poisonStacks, index: gameState.enemy.patternIndex
    }));
    await page.evaluate(() => {
      let guard = 0;
      while (gameState.turn.phase !== 'CHECK_WIN_LOSS' && guard < 10) { nextPhase(); guard++; }
    });
    const after = await page.evaluate(() => ({
      hp: gameState.player.hp, poison: gameState.player.poisonStacks,
      index: gameState.enemy.patternIndex, skipped: gameState.turn.enemyRoundSkippedThisTurn
    }));
    assert.strictEqual(after.hp, before.hp, 'the enemy must deal no damage in round 1');
    assert.strictEqual(after.poison, before.poison, 'the enemy must apply nothing in round 1');
    assert.strictEqual(after.skipped, true, 'the round must be marked skipped');
    assert.strictEqual(after.index, (before.index + 1) % 2, 'the pattern must advance as if the intent had resolved');
    await page.close();
  });

  await runTest('Item B: Second Chance rerolls once a fight and the first face never triggers', async () => {
    const page = await freshFightPage(browser, ['second_chance']);
    await loadFaces(page, [[2, 'smite']]);
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    // A seeded Math.random makes the discarded face (2, Smite) and the
    // face that stands (4, blank) both exact.
    await page.evaluate(() => {
      const seq = [0.05, 0.15];
      let i = 0;
      Math.random = function() { const v = seq[Math.min(i, seq.length - 1)]; i++; return v; };
      secondChanceReroll();
    });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({
      rolled: gameState.turn.rolledFaceNumber,
      hp: gameState.enemy.hp,
      used: gameState.turn.secondChanceUsedThisFight
    }));
    assert.strictEqual(v.rolled, 4, 'the second face must stand, stood ' + v.rolled);
    assert.strictEqual(v.hp, hpBefore, 'the discarded face must not trigger');
    assert.strictEqual(v.used, true, 'Second Chance must be spent for the rest of the fight');
    await page.close();
  });

  await runTest('Item B: Gilded Die no longer sells weight: no payment function, no button, the bag stays at 20 tickets', async () => {
    const page = await freshFightPage(browser, ['gilded_die']);
    await page.evaluate(() => { updateRun({ gold: 50 }); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const pool = await lastPoolSize(page);
    const v = await page.evaluate(() => ({
      gold: gameState.run.gold,
      payFn: typeof gildedDiePayForFace,
      button: document.getElementById('gildedDieBtn'),
      turnField: 'gildedFace' in gameState.turn
    }));
    assert.strictEqual(pool, 20, 'the bag must hold 20 tickets, held ' + pool);
    assert.strictEqual(v.payFn, 'undefined', 'gildedDiePayForFace must be gone');
    assert.strictEqual(v.button, null, 'the Gilded Die button must be gone');
    assert.strictEqual(v.turnField, false, 'turn.gildedFace must be gone');
    assert.ok(v.gold >= 50, 'no gold may be charged for a roll, left ' + v.gold);
    await page.close();
  });

  await runTest('Item B: Bone Counter charges 15 gold on a Nat 1, and under 15 gold Penitence runs as normal', async () => {
    const page = await freshFightPage(browser, ['bone_counter']);
    await page.evaluate(() => { updateRun({ gold: 20 }); });
    await forceRoll(page, 1);
    const rich = await page.evaluate(() => ({ gold: gameState.run.gold, penitence: gameState.player.penitenceActive }));
    assert.strictEqual(rich.gold, 5, '15 gold must be charged, left ' + rich.gold);
    assert.strictEqual(rich.penitence, false, 'Penitence must not arm while the gold is there');
    await page.close();

    const page2 = await freshFightPage(browser, ['bone_counter']);
    await page2.evaluate(() => { updateRun({ gold: 10 }); });
    await forceRoll(page2, 1);
    const poor = await page2.evaluate(() => ({ gold: gameState.run.gold, penitence: gameState.player.penitenceActive }));
    assert.strictEqual(poor.gold, 10, 'no gold may be taken under the price, left ' + poor.gold);
    assert.strictEqual(poor.penitence, true, 'Penitence must arm as normal under the price');
    await page2.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — artifacts in the shop and in the reward panel
  // ---------------------------------------------------------------

  await runTest('Item C: the shop stocks one unheld artifact at 150 gold', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ artifacts: ['third_eye'], gold: 1000 });
      openShopScreen();
      const offered = gameState.run.shop.artifact;
      const price = GAME_CONFIG.SHOP.ARTIFACT_PRICE;
      shopBuyArtifact();
      return {
        offered: offered, price: price, gold: gameState.run.gold,
        held: gameState.run.artifacts.slice(), bought: gameState.run.shop.artifactBought
      };
    });
    assert.strictEqual(v.price, 150, 'the shop artifact must cost 150 gold, cost ' + v.price);
    assert.ok(v.offered && v.offered !== 'third_eye', 'the shop must stock an artifact the run does not hold, stocked ' + v.offered);
    assert.strictEqual(v.gold, 850, '150 gold must be charged, left ' + v.gold);
    assert.ok(v.held.indexOf(v.offered) !== -1, 'the bought artifact must be held');
    assert.strictEqual(v.bought, true, 'the slot must be spent once bought');
    await page.close();
  });

  await runTest('Item C: the artifact reward panel offers 3 unheld artifacts, down to the last 3', async () => {
    const page = await freshPage(browser);
    const none = await page.evaluate(() => {
      updateRun({ artifacts: [] });
      openArtifactRewardScreen();
      return artifactRewardOptions.slice();
    });
    assert.strictEqual(none.length, 3, 'the panel must offer 3 artifacts, offered ' + none.length);
    assert.strictEqual(new Set(none).size, 3, 'the panel must never repeat an artifact');

    const ten = await page.evaluate(() => {
      const held = Object.keys(gameState.config.artifacts).slice(0, 10);
      updateRun({ artifacts: held });
      openArtifactRewardScreen();
      return { options: artifactRewardOptions.slice(), held: held };
    });
    assert.strictEqual(ten.options.length, 3, 'with 10 held the panel must still offer 3, offered ' + ten.options.length);
    ten.options.forEach(function(id) {
      assert.strictEqual(ten.held.indexOf(id), -1, 'a held artifact must never be offered: ' + id);
    });
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — the seven new cards
  // ---------------------------------------------------------------

  await runTest('Item D: Venom applies 2 stacks of poison, 4 against an already poisoned enemy', async () => {
    const page = await freshFightPage(browser, []);
    await forceRoll(page, 2);
    const clean = await page.evaluate(() => {
      updateEnemy({ poisonStacks: 0 });
      updatePlayer({ hand: ['venom'], soul: 5 });
      playCard(0);
      return gameState.enemy.poisonStacks;
    });
    assert.strictEqual(clean, 2, 'Venom must apply 2 stacks of poison, applied ' + clean);

    const poisoned = await page.evaluate(() => {
      updateEnemy({ poisonStacks: 3 });
      updatePlayer({ hand: ['venom'], soul: 5 });
      playCard(0);
      return gameState.enemy.poisonStacks - 3;
    });
    assert.strictEqual(poisoned, 4, 'Venom must apply 4 stacks against a poisoned enemy, applied ' + poisoned);
    await page.close();
  });

  await runTest("Item D: Ballast deals 3 times the heaviest face's weight, capped at 12", async () => {
    const page = await freshFightPage(browser, []);
    await forceRoll(page, 2);
    const light = await page.evaluate(() => {
      clearListeners('turn');
      const before = gameState.enemy.hp;
      updatePlayer({ hand: ['ballast'], soul: 5 });
      playCard(0);
      return before - gameState.enemy.hp;
    });
    assert.strictEqual(light, 3, 'at weight 1 Ballast must deal 3, dealt ' + light);

    const heavy = await page.evaluate(() => {
      strengthenFace(3); strengthenFace(3); strengthenFace(3); strengthenFace(3);
      const before = gameState.enemy.hp;
      updatePlayer({ hand: ['ballast'], soul: 5 });
      playCard(0);
      return before - gameState.enemy.hp;
    });
    assert.strictEqual(heavy, 12, 'at weight 5 Ballast must cap at 12, dealt ' + heavy);
    await page.close();
  });

  await runTest('Item D: Refrain triggers the rolled face again, and a blank gives its block again', async () => {
    const page = await freshFightPage(browser, []);
    await loadFaces(page, [[5, 'smite']]);
    await forceRoll(page, 5);
    const again = await page.evaluate(() => {
      clearListeners('turn');
      const before = gameState.enemy.hp;
      updatePlayer({ hand: ['refrain'], soul: 5 });
      playCard(0);
      return before - gameState.enemy.hp;
    });
    assert.strictEqual(again, 16, 'Refrain must trigger Smite again for 16, dealt ' + again);
    await page.close();

    const page2 = await freshFightPage(browser, []);
    await forceRoll(page2, 3);
    const blank = await page2.evaluate(() => {
      const before = gameState.player.block;
      updatePlayer({ hand: ['refrain'], soul: 5 });
      playCard(0);
      return gameState.player.block - before;
    });
    assert.strictEqual(blank, 2, 'a blank rolled face must give 2 block again, gave ' + blank);
    await page2.close();
  });

  await runTest('Item D: Second Sight rolls again and the new face triggers as a roll', async () => {
    const page = await freshFightPage(browser, []);
    await loadFaces(page, [[3, 'smite']]);
    await forceRoll(page, 2);
    const v = await page.evaluate(() => {
      clearListeners('turn');
      const before = gameState.enemy.hp;
      Math.random = function() { return 0.11; };
      updatePlayer({ hand: ['second_sight'], soul: 5 });
      playCard(0);
      return { damage: before - gameState.enemy.hp, rolled: gameState.turn.rolledFaceNumber };
    });
    assert.strictEqual(v.rolled, 3, 'the new face must become the rolled face, got ' + v.rolled);
    assert.strictEqual(v.damage, 16, 'the new face must trigger as a roll, dealt ' + v.damage);
    await page.close();
  });

  await runTest('Item D: Cadence deals 2 per round, capped at 12', async () => {
    const page = await freshFightPage(browser, []);
    await forceRoll(page, 2);
    const early = await page.evaluate(() => {
      clearListeners('turn');
      updateTurn({ round: 3 });
      const before = gameState.enemy.hp;
      updatePlayer({ hand: ['cadence'], soul: 5 });
      playCard(0);
      return before - gameState.enemy.hp;
    });
    assert.strictEqual(early, 6, 'on round 3 Cadence must deal 6, dealt ' + early);

    const late = await page.evaluate(() => {
      updateTurn({ round: 10 });
      const before = gameState.enemy.hp;
      updatePlayer({ hand: ['cadence'], soul: 5 });
      playCard(0);
      return before - gameState.enemy.hp;
    });
    assert.strictEqual(late, 12, 'on round 10 Cadence must cap at 12, dealt ' + late);
    await page.close();
  });

  await runTest('Item D: Watchword gives 5 block, 12 after a Bound face triggered this round', async () => {
    const page = await freshFightPage(browser, []);
    await forceRoll(page, 2);
    const plain = await page.evaluate(() => {
      clearListeners('turn');
      const before = gameState.player.block;
      updatePlayer({ hand: ['watchword'], soul: 5 });
      playCard(0);
      return { block: gameState.player.block - before, bound: gameState.turn.boundTriggeredThisRound };
    });
    assert.strictEqual(plain.bound, false, 'no Bound face has triggered yet');
    assert.strictEqual(plain.block, 5, 'Watchword must give 5 block, gave ' + plain.block);
    await page.close();

    const page2 = await freshFightPage(browser, []);
    await loadFaces(page2, [[4, 'unison']]);
    await forceRoll(page2, 4);
    const bound = await page2.evaluate(() => {
      clearListeners('turn');
      const before = gameState.player.block;
      updatePlayer({ hand: ['watchword'], soul: 5 });
      playCard(0);
      return { block: gameState.player.block - before, bound: gameState.turn.boundTriggeredThisRound };
    });
    assert.strictEqual(bound.bound, true, 'a Bound face triggering must set the round flag');
    assert.strictEqual(bound.block, 12, 'Watchword must give 12 block after a Bound trigger, gave ' + bound.block);
    await page2.close();
  });

  await runTest("Item D: Blight Weight applies twice the rolled face's weight in poison, capped at 8", async () => {
    const page = await freshFightPage(browser, []);
    await forceRoll(page, 2);
    const light = await page.evaluate(() => {
      updateEnemy({ poisonStacks: 0 });
      updatePlayer({ hand: ['blight_weight'], soul: 5 });
      playCard(0);
      return gameState.enemy.poisonStacks;
    });
    assert.strictEqual(light, 2, 'at weight 1 it must apply 2 stacks of poison, applied ' + light);
    await page.close();

    const page2 = await freshFightPage(browser, []);
    await page2.evaluate(() => { strengthenFace(2); strengthenFace(2); strengthenFace(2); strengthenFace(2); });
    await forceRoll(page2, 2);
    const heavy = await page2.evaluate(() => {
      updateEnemy({ poisonStacks: 0 });
      updatePlayer({ hand: ['blight_weight'], soul: 5 });
      playCard(0);
      return { stacks: gameState.enemy.poisonStacks, weight: gameState.turn.rolledFaceWeight };
    });
    assert.strictEqual(heavy.weight, 5, 'the rolled face must carry weight 5, carried ' + heavy.weight);
    assert.strictEqual(heavy.stacks, 8, 'at weight 5 it must cap at 8 stacks of poison, applied ' + heavy.stacks);
    await page2.close();
  });

  // ---------------------------------------------------------------
  // COUNTS AND ON-SCREEN TEXT
  // ---------------------------------------------------------------

  await runTest('Item D: the reward card pool holds 48 cards, the seven new ones among them', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate((ids) => ({
      total: Object.keys(gameState.config.cardPool).length,
      missing: ids.filter(function(id) { return !gameState.config.cardPool[id]; })
    }), NEW_CARD_IDS);
    assert.strictEqual(v.total, 48, 'the reward pool must hold 48 cards, holds ' + v.total);
    assert.deepStrictEqual(v.missing, [], 'every new card must be in the reward pool');
    await page.close();
  });

  await runTest('Items B and D: every new artifact and card carries non-empty on-screen text', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate((ids) => ({
      artifacts: ids.artifacts.filter(function(id) {
        const a = gameState.config.artifacts[id];
        return !a || !a.text || !a.name;
      }),
      cards: ids.cards.filter(function(id) { return !getCardEffectText(id); })
    }), { artifacts: NEW_ARTIFACT_IDS, cards: NEW_CARD_IDS });
    assert.deepStrictEqual(v.artifacts, [], 'every new artifact needs a name and text');
    assert.deepStrictEqual(v.cards, [], 'every new card needs on-screen text');
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build153 tests passed.');
})();
