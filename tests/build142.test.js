// ============================================================
// TESTS/BUILD142.TEST.JS — BUILD 142
// Standing regression suite for BUILD 142's seven items: item S (Seal wears
// off), item A (act 1 lane fight HP by position), item B (the five act 1
// enemies), item C (the ten act 2/3 enemies), item D (enemy Nat sound and
// visual), item E (Hosanna), item F (Threnody). Same shape as
// tests/build141.test.js: plain Node script, playwright launched directly,
// node:assert. Run: node tests/build142.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

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
  const page = await browser.newPage();
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

async function advanceUntilPhase(page, targetPhase, maxSteps) {
  for (let i = 0; i < (maxSteps || 30); i++) {
    const phase = await page.evaluate(() => gameState.turn.phase);
    if (phase === targetPhase) return;
    await page.evaluate(() => { nextPhase(); });
  }
  throw new Error('did not reach phase ' + targetPhase);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM S — a Seal wears off (BASE for items B/C)
  // ---------------------------------------------------------------

  await runTest('Item S-a: a face Sealed for round 3 is Sealed in round 3 and not Sealed in round 4', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ sealNextRound: [14] }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); }); // round 3's own START_OF_TURN (round already at 2 from the opening-fight helper's own resolve)
    const round3 = await page.evaluate(() => gameState.turn.sealedFaces.slice());
    assert.deepStrictEqual(round3, [14], 'face 14 must be Sealed the round after Seal queues it');
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const round4 = await page.evaluate(() => gameState.turn.sealedFaces.slice());
    assert.deepStrictEqual(round4, [], 'face 14 must not still be Sealed one round later');
    await page.close();
  });

  await runTest('Item S-b: a face Sealed in the last round of one fight is not Sealed in round 1 of the next fight', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ sealNextRound: [14] }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const midFight = await page.evaluate(() => gameState.turn.sealedFaces.slice());
    assert.deepStrictEqual(midFight, [14], 'sanity: face 14 must be Sealed mid-fight before the fight ends');
    await page.evaluate(() => { resetFight(); });
    const nextFight = await page.evaluate(() => gameState.turn.sealedFaces.slice());
    assert.deepStrictEqual(nextFight, [], 'a Sealed face must not carry into the next fight');
    await page.close();
  });

  await runTest('Item S-c: two Seal triggers in one round seal two faces next round, both wearing off the round after', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ sealNextRound: [9, 14] }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const sealedRound = await page.evaluate(() => gameState.turn.sealedFaces.slice().sort(function(a, b) { return a - b; }));
    assert.deepStrictEqual(sealedRound, [9, 14], 'both queued faces must be Sealed the following round');
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const afterRound = await page.evaluate(() => gameState.turn.sealedFaces.slice());
    assert.deepStrictEqual(afterRound, [], 'both Sealed faces must wear off the round after');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM A — act 1 lane fight HP by position
  // ---------------------------------------------------------------

  await runTest('Item A: act 1 lane fight HP by position is 58/65/78/85 on the lower lane; the upper lane matches, elite at position 3 is 100', async () => {
    const page = await freshPage(browser);
    const act = await page.evaluate(() => buildAct(1));
    assert.strictEqual(act.lower[0].enemy.hp, 58);
    assert.strictEqual(act.lower[2].enemy.hp, 65);
    // Since BUILD 151, lower[3] is the event slot (The Font), not a fight.
    assert.strictEqual(act.lower[3].type, 'event');
    assert.strictEqual(act.lower[3].id, 'font');
    assert.strictEqual(act.lower[5].enemy.hp, 78);
    assert.strictEqual(act.lower[6].enemy.hp, 85);
    assert.strictEqual(act.upper[0].enemy.hp, 58);
    assert.strictEqual(act.upper[2].enemy.hp, 65);
    assert.strictEqual(act.upper[3].enemy.hp, 100, 'position 3 on the upper lane is the Elite, at its own flat 100 HP');
    assert.strictEqual(act.upper[3].label, 'Elite');
    assert.strictEqual(act.upper[5].enemy.hp, 78);
    assert.strictEqual(act.upper[6].enemy.hp, 85);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — the five act 1 enemies
  // ---------------------------------------------------------------

  await runTest('Item B-a: each act 1 enemy\'s pattern, HP and lane placement match, Verger\'s two patterns included', async () => {
    const page = await freshPage(browser);
    const act = await page.evaluate(() => buildAct(1));
    assert.strictEqual(act.opening.enemy.name, 'Verger');
    assert.strictEqual(act.opening.enemy.hp, 50);
    assert.deepStrictEqual(act.opening.enemy.pattern, [{ kind: 'attack', min: 6, max: 9 }, { kind: 'attack', min: 6, max: 9 }]);
    // Since BUILD 151, lower[3] is the event slot (The Font), not a second Verger fight.
    assert.strictEqual(act.lower[3].type, 'event');
    assert.strictEqual(act.lower[3].id, 'font');
    [act.upper[0], act.upper[5], act.lower[0], act.lower[5]].forEach(function(s) {
      assert.strictEqual(s.enemy.name, 'Thurifer');
      assert.deepStrictEqual(s.enemy.pattern, [{ kind: 'attack', min: 10, max: 14 }, { kind: 'charge', release: 24, breakAt: 11 }]);
    });
    [act.upper[2], act.upper[6], act.lower[2], act.lower[6]].forEach(function(s) {
      assert.strictEqual(s.enemy.name, 'Asperser');
      assert.deepStrictEqual(s.enemy.pattern, [{ kind: 'attack', min: 11, max: 15 }, { kind: 'attack', min: 11, max: 15 }, { kind: 'afflict', stacks: 4 }]);
    });
    assert.strictEqual(act.upper[3].enemy.name, 'Lector');
    assert.strictEqual(act.upper[3].enemy.hp, 100);
    assert.strictEqual(act.boss.enemy.name, 'Hierophant');
    assert.strictEqual(act.boss.enemy.hp, 100);
    await page.close();
  });

  await runTest('Item B-b: every act 1 Attack range is at most 4 wide', async () => {
    const page = await freshPage(browser);
    const act = await page.evaluate(() => buildAct(1));
    // lower[3] is the event slot (The Font) since BUILD 151, no enemy there.
    const allEnemies = [act.opening.enemy, act.upper[0].enemy, act.upper[2].enemy, act.upper[3].enemy, act.lower[0].enemy, act.boss.enemy];
    allEnemies.forEach(function(e) {
      e.pattern.forEach(function(entry) {
        if (entry.kind === 'attack') {
          assert.ok(entry.max - entry.min <= 4, e.name + '\'s Attack range ' + entry.min + '-' + entry.max + ' is wider than 4');
        }
      });
    });
    await page.close();
  });

  await runTest('Item B-c: the Lector\'s die has 12 rows, and a forced player roll of 6 triggers Drain', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('upper', GAME_CONFIG.ELITE_SLOT_INDEX); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const dieSize = await page.evaluate(() => gameState.enemy.die.faces.length);
    assert.strictEqual(dieSize, 12);
    await page.evaluate(() => { forcePlayerRoll(6); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    // Force Lector's own roll to face 1 (an ordinary blank on its die) so
    // the only Drain trigger this round can come from the read itself, not
    // a coincidental natural roll of its own face 6.
    await page.evaluate(() => { forceEnemyRoll(1); });
    // drainNextRound is consumed the instant the NEXT round's own
    // START_OF_TURN runs (soul resets to maxSoul - drainNextRound, then the
    // queue clears) — so the read's effect is checked via that next
    // round's actual starting soul, one less than the usual max.
    await advanceUntilPhase(page, 'START_OF_TURN');
    const soulAfter = await page.evaluate(() => gameState.player.soul);
    const maxSoul = await page.evaluate(() => gameState.player.maxSoul);
    assert.strictEqual(soulAfter, maxSoul - 1, 'expected Lector\'s read of a player roll of 6 to trigger Drain (next round starts 1 soul short)');
    await page.close();
  });

  await runTest('Item B-d: the Hierophant\'s pattern cycles, and a forced player Nat 1 cancels its intent once, not a second time', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(1); }); // player's own Nat 1
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { autoAdvance(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const afterFirst = await page.evaluate(() => ({ cancelledThisTurn: gameState.turn.enemyAttackCancelledThisTurn, natFired: gameState.enemy.natOneFiredThisFight, hpBefore: gameState.player.hp }));
    assert.strictEqual(afterFirst.natFired, true, 'the Hierophant\'s Nat 1 must have fired once, answering the player\'s own Nat 1');
    // A second player Nat 1 later this fight must not cancel a second time —
    // the enemy's attack should land normally now.
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpBeforeSecond = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { autoAdvance(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const stillOnceFired = await page.evaluate(() => gameState.enemy.natOneFiredThisFight);
    assert.strictEqual(stillOnceFired, true, 'natOneFiredThisFight must still read true (never re-fires)');
    await page.close();
  });

  await runTest('Item B-e: every act 1 name and hover is not empty, and neither map line is empty', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const act = gameState.run.act;
      const eliteFace3 = act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.die.faces[2];
      const bossFace1 = act.boss.enemy.die.faces[0];
      return {
        names: [act.opening.enemy.name, act.upper[0].enemy.name, act.upper[2].enemy.name, act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.name, act.boss.enemy.name],
        eliteHover: faceHoverText(eliteFace3, act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.buffPoisonStacks, act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.name),
        bossHover: faceHoverText(bossFace1, act.boss.enemy.buffPoisonStacks, act.boss.enemy.name)
      };
    });
    v.names.forEach(function(n) { assert.ok(n && n.length > 0, 'enemy name must not be empty'); });
    assert.ok(v.eliteHover && v.eliteHover.length > 0, 'elite face hover must not be empty');
    assert.ok(v.bossHover && v.bossHover.length > 0, 'boss face hover must not be empty');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — the act 2 and act 3 enemies
  // ---------------------------------------------------------------

  await runTest('Item C-a: each act 2/3 enemy\'s HP, pattern, die size and faces match', async () => {
    const page = await freshPage(browser);
    const acts = await page.evaluate(() => ({ act2: buildAct(2), act3: buildAct(3) }));
    const a2 = acts.act2;
    assert.strictEqual(a2.opening.enemy.name, 'Chorister');
    assert.strictEqual(a2.opening.enemy.hp, 70);
    assert.strictEqual(a2.upper[0].enemy.name, 'Cantor');
    assert.strictEqual(a2.upper[0].enemy.hp, 110);
    assert.strictEqual(a2.upper[2].enemy.name, 'Flagellant');
    assert.strictEqual(a2.upper[2].enemy.hp, 119);
    // Since BUILD 151, lower[3] is the event slot (The Font), not a fight.
    assert.strictEqual(a2.lower[3].type, 'event');
    assert.strictEqual(a2.lower[3].id, 'font');
    assert.strictEqual(a2.upper[3].enemy.name, 'Archdeacon');
    assert.strictEqual(a2.upper[3].enemy.hp, 140);
    assert.strictEqual(a2.upper[3].enemy.die.faces.length, 12);
    assert.strictEqual(a2.boss.enemy.name, 'Cardinal');
    assert.strictEqual(a2.boss.enemy.hp, 140);
    assert.strictEqual(a2.boss.enemy.die.faces.length, 20);
    assert.strictEqual(a2.boss.enemy.wrathPerTrigger, 3);

    const a3 = acts.act3;
    assert.strictEqual(a3.opening.enemy.name, 'Anchorite');
    assert.strictEqual(a3.opening.enemy.hp, 95);
    assert.strictEqual(a3.upper[0].enemy.name, 'Mendicant');
    assert.strictEqual(a3.upper[0].enemy.hp, 149);
    assert.strictEqual(a3.upper[2].enemy.name, 'Inquisitor');
    assert.strictEqual(a3.upper[2].enemy.hp, 162);
    // Since BUILD 151, lower[3] is the event slot (The Font), not a fight.
    assert.strictEqual(a3.lower[3].type, 'event');
    assert.strictEqual(a3.lower[3].id, 'font');
    assert.strictEqual(a3.upper[3].enemy.name, 'Exarch');
    assert.strictEqual(a3.upper[3].enemy.hp, 190);
    assert.strictEqual(a3.upper[3].enemy.die.faces.length, 12);
    assert.strictEqual(a3.boss.enemy.name, 'Pontifex');
    assert.strictEqual(a3.boss.enemy.hp, 190);
    assert.strictEqual(a3.boss.enemy.die.faces.length, 20);
    assert.strictEqual(a3.boss.enemy.wrathPerTrigger, 3);
    await page.close();
  });

  await runTest('Item C-b: every act 2/3 Attack range is at most 4 wide', async () => {
    const page = await freshPage(browser);
    const acts = await page.evaluate(() => ({ act2: buildAct(2), act3: buildAct(3) }));
    [acts.act2, acts.act3].forEach(function(act) {
      const enemies = [act.opening.enemy, act.upper[0].enemy, act.upper[2].enemy, act.upper[3].enemy, act.boss.enemy];
      enemies.forEach(function(e) {
        e.pattern.forEach(function(entry) {
          if (entry.kind === 'attack') {
            assert.ok(entry.max - entry.min <= 4, e.name + '\'s Attack range ' + entry.min + '-' + entry.max + ' is wider than 4');
          }
        });
      });
    });
    await page.close();
  });

  await runTest('Item C-c/d/e: every normal die has 1-2 buff faces of 6, every elite has 4 of 12, Cardinal/Pontifex have 5 of 20 plus Nats', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const acts = { act2: buildAct(2), act3: buildAct(3) };
      function buffCount(enemy) { return enemy.die.faces.filter(function(f) { return f.modId !== null && f.modId !== 'ENEMY_NAT_ONE' && f.modId !== 'ENEMY_NAT_TWENTY'; }).length; }
      return {
        normals: [acts.act2.opening.enemy, acts.act2.upper[0].enemy, acts.act2.upper[2].enemy, acts.act3.opening.enemy, acts.act3.upper[0].enemy, acts.act3.upper[2].enemy].map(function(e) {
          return { name: e.name, size: e.die.faces.length, count: buffCount(e) };
        }),
        elites: [acts.act2.upper[3].enemy, acts.act3.upper[3].enemy].map(function(e) { return { name: e.name, size: e.die.faces.length, count: buffCount(e) }; }),
        bosses: [acts.act2.boss.enemy, acts.act3.boss.enemy].map(function(e) {
          return { name: e.name, size: e.die.faces.length, count: buffCount(e), face1: e.die.faces[0].modId, faceTop: e.die.faces[e.die.faces.length - 1].modId };
        })
      };
    });
    v.normals.forEach(function(n) {
      assert.strictEqual(n.size, 6, n.name + '\'s die must be 6-sided');
      assert.ok(n.count === 1 || n.count === 2, n.name + '\'s die must trigger a buff on 1 or 2 faces, got ' + n.count);
    });
    v.elites.forEach(function(e) {
      assert.strictEqual(e.size, 12, e.name + '\'s die must be 12-sided');
      assert.strictEqual(e.count, 4, e.name + '\'s die must trigger a buff on 4 faces');
    });
    v.bosses.forEach(function(b) {
      assert.strictEqual(b.size, 20, b.name + '\'s die must be 20-sided');
      assert.strictEqual(b.count, 5, b.name + '\'s die must trigger a buff on 5 faces');
      assert.strictEqual(b.face1, 'ENEMY_NAT_ONE', b.name + ' face 1 must be ENEMY_NAT_ONE');
      assert.strictEqual(b.faceTop, 'ENEMY_NAT_TWENTY', b.name + ' top face must be ENEMY_NAT_TWENTY');
    });
    await page.close();
  });

  await runTest('Item C-f: no die\'s expected stacks of poison per round exceed 0.30 times the act\'s amount', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const acts = { act1: buildAct(1), act2: buildAct(2), act3: buildAct(3) };
      const dice = [];
      function collect(actLabel, slots) {
        slots.forEach(function(s) {
          if (s.enemy && s.enemy.die) {
            const faces = s.enemy.die.faces;
            const poisonCount = faces.filter(function(f) { return f.modId === 'enemy_buff_poison'; }).length;
            const hasNats = faces.some(function(f) { return f.modId === 'ENEMY_NAT_TWENTY'; });
            dice.push({ act: actLabel, name: s.enemy.name, poisonCount: poisonCount, size: faces.length, hasNats: hasNats, amount: s.enemy.buffPoisonStacks });
          }
        });
      }
      collect('act1', [acts.act1.upper[GAME_CONFIG.ELITE_SLOT_INDEX], acts.act1.boss]);
      collect('act2', [acts.act2.opening, acts.act2.upper[0], acts.act2.upper[2], acts.act2.upper[GAME_CONFIG.ELITE_SLOT_INDEX], acts.act2.boss]);
      collect('act3', [acts.act3.opening, acts.act3.upper[0], acts.act3.upper[2], acts.act3.upper[GAME_CONFIG.ELITE_SLOT_INDEX], acts.act3.boss]);
      return dice;
    });
    v.forEach(function(d) {
      const effectiveCount = d.hasNats ? d.poisonCount * 2 : d.poisonCount;
      const expected = (effectiveCount / d.size) * d.amount;
      const cap = 0.30 * d.amount;
      assert.ok(expected <= cap + 1e-9, d.act + ' ' + d.name + ': expected poison per round ' + expected.toFixed(3) + ' exceeds cap ' + cap.toFixed(3));
    });
    await page.close();
  });

  await runTest('Item C-g: Cardinal\'s and Pontifex\'s Nats and reads behave as written under forced rolls', async () => {
    const page = await freshPage(browser);

    // D-101 (BUILD 158): every boss's Nat 20, Cardinal and Pontifex
    // included, now forces its own pattern's charge entry next round
    // instead of its old designed sweep (Cardinal used to Seal its two
    // heaviest loaded faces). Cardinal is act 2's own boss — set the live
    // run onto act 2 before jumping (a fresh run otherwise starts on act
    // 1's Hierophant).
    await page.evaluate(() => { updateRun({ act: buildAct(2) }); });
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const cardinalChargeEntry = await page.evaluate(() => gameState.enemy.pattern.filter(function(e) { return e.kind === 'charge'; })[0]);
    await page.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    await page.evaluate(() => { forceEnemyRoll(20); }); // Cardinal's own Nat 20
    const cardinalForced = await page.evaluate(() => gameState.enemy.forcedNextIntent);
    assert.deepStrictEqual(cardinalForced, { kind: 'charge', release: cardinalChargeEntry.release, breakAt: cardinalChargeEntry.breakAt }, 'Cardinal\'s Nat 20 must force its own Charge next round');
    assert.deepStrictEqual(await page.evaluate(() => gameState.player.sealNextRound), [], 'Cardinal\'s Nat 20 must no longer Seal any face');

    // Cardinal's Nat 1: heaviest loaded face triggers now, attack not cancelled.
    const page2 = await freshPage(browser);
    await page2.evaluate(() => { updateRun({ act: buildAct(2) }); });
    await page2.evaluate(() => { devJumpToSlot('boss', null); });
    await page2.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page2.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[13] = Object.assign({}, newFaces[13], { modId: 'smite', weight: 2 }); // face 14
      updateDie({ faces: newFaces });
    });
    await page2.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page2, 'ENEMY_ROLL_PHASE');
    const enemyHpBefore = await page2.evaluate(() => gameState.enemy.hp);
    await page2.evaluate(() => { forceEnemyRoll(1); }); // Cardinal's own Nat 1
    const v2 = await page2.evaluate(() => ({ enemyHp: gameState.enemy.hp, cancelled: gameState.turn.enemyAttackCancelledThisTurn }));
    assert.strictEqual(enemyHpBefore - v2.enemyHp, 16, 'Cardinal\'s Nat 1 must trigger its heaviest loaded face (smite, 16 damage) outside the roll');
    assert.strictEqual(v2.cancelled, false, 'Cardinal\'s Nat 1 must not cancel its own attack');

    // Pontifex's Nat 20 forces its own Charge next round (D-101), same as
    // Cardinal's and Hierophant's.
    const page3 = await freshPage(browser);
    await page3.evaluate(() => { updateRun({ act: buildAct(3) }); });
    await page3.evaluate(() => { devJumpToSlot('boss', null); });
    await page3.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const pontifexChargeEntry = await page3.evaluate(() => gameState.enemy.pattern.filter(function(e) { return e.kind === 'charge'; })[0]);
    await page3.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page3, 'ENEMY_ROLL_PHASE');
    await page3.evaluate(() => { forceEnemyRoll(20); }); // Pontifex's own Nat 20
    const pontifexForced = await page3.evaluate(() => gameState.enemy.forcedNextIntent);
    assert.deepStrictEqual(pontifexForced, { kind: 'charge', release: pontifexChargeEntry.release, breakAt: pontifexChargeEntry.breakAt }, 'Pontifex\'s Nat 20 must force its own Charge next round');
    assert.strictEqual(await page3.evaluate(() => gameState.enemy.pontifexDoubleAttackThisRound), false, 'Pontifex\'s Nat 20 must no longer double that round\'s Attack');

    // Pontifex's own pattern is [attack, afflict, attack, charge] — walk
    // its own real rounds (forcing a harmless player roll and a harmless
    // enemy roll each time, face 2 on both dice, to keep the walk
    // deterministic) until it reaches the charge's wind-up round, force a
    // Nat 20 there, and confirm it changes nothing (already charging).
    const page4 = await freshPage(browser);
    await page4.evaluate(() => { updateRun({ act: buildAct(3) }); });
    await page4.evaluate(() => { devJumpToSlot('boss', null); });
    await page4.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    for (let i = 0; i < 10; i++) {
      const stage = await page4.evaluate(() => gameState.enemy.chargeStage);
      if (stage === 'windup') { break; }
      await page4.evaluate(() => { forcePlayerRoll(2); });
      await advanceUntilPhase(page4, 'ENEMY_ROLL_PHASE');
      await page4.evaluate(() => { forceEnemyRoll(2); }); // harmless blank, avoids a premature Nat
      await advanceUntilPhase(page4, 'ROLL_PHASE');
    }
    const stageCheck = await page4.evaluate(() => gameState.enemy.chargeStage);
    assert.strictEqual(stageCheck, 'windup', 'sanity: must have reached Pontifex\'s own wind-up round');
    await page4.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page4, 'ENEMY_ROLL_PHASE');
    await page4.evaluate(() => { forceEnemyRoll(20); }); // Nat 20 during the wind-up round — no effect
    const forcedDuringWindup = await page4.evaluate(() => gameState.enemy.forcedNextIntent);
    assert.strictEqual(forcedDuringWindup, null, 'a Nat 20 landing during an active wind-up must not set forcedNextIntent');
    await page.close();
    await page2.close();
    await page3.close();
    await page4.close();
  });

  await runTest('Item C-h: every act 2/3 name and hover is not empty', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const acts = { act2: buildAct(2), act3: buildAct(3) };
      const names = [
        acts.act2.opening.enemy.name, acts.act2.upper[0].enemy.name, acts.act2.upper[2].enemy.name, acts.act2.upper[3].enemy.name, acts.act2.boss.enemy.name,
        acts.act3.opening.enemy.name, acts.act3.upper[0].enemy.name, acts.act3.upper[2].enemy.name, acts.act3.upper[3].enemy.name, acts.act3.boss.enemy.name
      ];
      const cardinalWrathFace = acts.act2.boss.enemy.die.faces[6]; // face 7
      const pontifexSealFace = acts.act3.boss.enemy.die.faces[7]; // face 8
      return {
        names: names,
        cardinalHover: faceHoverText(cardinalWrathFace, acts.act2.boss.enemy.buffPoisonStacks, acts.act2.boss.enemy.name, acts.act2.boss.enemy.wrathPerTrigger),
        pontifexHover: faceHoverText(pontifexSealFace, acts.act3.boss.enemy.buffPoisonStacks, acts.act3.boss.enemy.name, acts.act3.boss.enemy.wrathPerTrigger),
        cardinalNat20Hover: faceHoverText(acts.act2.boss.enemy.die.faces[19], acts.act2.boss.enemy.buffPoisonStacks, 'Cardinal'),
        cardinalNat1Hover: faceHoverText(acts.act2.boss.enemy.die.faces[0], acts.act2.boss.enemy.buffPoisonStacks, 'Cardinal'),
        pontifexNat20Hover: faceHoverText(acts.act3.boss.enemy.die.faces[19], acts.act3.boss.enemy.buffPoisonStacks, 'Pontifex'),
        pontifexNat1Hover: faceHoverText(acts.act3.boss.enemy.die.faces[0], acts.act3.boss.enemy.buffPoisonStacks, 'Pontifex')
      };
    });
    v.names.forEach(function(n) { assert.ok(n && n.length > 0, 'enemy name must not be empty'); });
    ['cardinalHover', 'pontifexHover', 'cardinalNat20Hover', 'cardinalNat1Hover', 'pontifexNat20Hover', 'pontifexNat1Hover'].forEach(function(k) {
      assert.ok(v[k] && v[k].length > 0, k + ' must not be empty');
    });
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — the enemy Nat sound and visual (KI-22)
  // ---------------------------------------------------------------

  await runTest('Item D-a: enemy_nat_20 and enemy_nat_1 both exist, are each 200ms or less, and both play on forced enemy Nats', async () => {
    const page = await freshPage(browser);
    const durations = await page.evaluate(() => {
      const calls = [];
      let currentDelay = 0;
      const originalSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, delay) {
        const prev = currentDelay;
        currentDelay = delay;
        fn();
        currentDelay = prev;
        return 0;
      };
      const originalPlayTone = window.playTone;
      window.playTone = function(waveform, fStart, fEnd, durationMs) {
        calls.push({ delay: currentDelay, durationMs: durationMs });
      };
      const out = {};
      ['enemy_nat_20', 'enemy_nat_1'].forEach(function(name) {
        calls.length = 0;
        currentDelay = 0;
        SOUND_TABLE[name](0);
        out[name] = calls.reduce(function(m, c) { return Math.max(m, c.delay + c.durationMs); }, 0);
      });
      window.setTimeout = originalSetTimeout;
      window.playTone = originalPlayTone;
      return out;
    });
    assert.ok(durations.enemy_nat_20 > 0 && durations.enemy_nat_20 <= 200, 'enemy_nat_20 must exist and be 200ms or less, measured ' + durations.enemy_nat_20);
    assert.ok(durations.enemy_nat_1 > 0 && durations.enemy_nat_1 <= 200, 'enemy_nat_1 must exist and be 200ms or less, measured ' + durations.enemy_nat_1);

    // Both must actually play on a forced enemy Nat — instrument
    // playAudioEvent() itself and force each Nat face on the boss die.
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const played = await page.evaluate(() => {
      const seen = [];
      const original = window.playAudioEvent;
      window.playAudioEvent = function(name) { seen.push(name); return original(name); };
      forceEnemyRoll(20);
      window.playAudioEvent = original;
      return seen;
    });
    assert.ok(played.indexOf('enemy_nat_20') !== -1, 'a forced enemy Nat 20 must play enemy_nat_20');
    await page.close();

    const page2 = await freshPage(browser);
    await page2.evaluate(() => { devJumpToSlot('boss', null); });
    await page2.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page2.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page2, 'ENEMY_ROLL_PHASE');
    const played1 = await page2.evaluate(() => {
      const seen = [];
      const original = window.playAudioEvent;
      window.playAudioEvent = function(name) { seen.push(name); return original(name); };
      forceEnemyRoll(1);
      window.playAudioEvent = original;
      return seen;
    });
    assert.ok(played1.indexOf('enemy_nat_1') !== -1, 'a forced enemy Nat 1 must play enemy_nat_1');
    await page2.close();
  });

  await runTest('Item D-b: the intent text shows on a forced Nat 20 and on a forced Nat 1', async () => {
    // BUILD 147 nests a .hover-tip child inside #enemyIntentValue, so
    // textContent alone now includes that sentence too — read only the
    // element's own direct text nodes, the visible number/word.
    const readVisibleText = () => Array.from(document.getElementById('enemyIntentValue').childNodes)
      .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');

    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    await page.evaluate(() => { forceEnemyRoll(20); refreshInspector(); });
    const nat20Text = await page.evaluate(readVisibleText);
    assert.strictEqual(nat20Text, 'NAT 20');
    await page.close();

    const page2 = await freshPage(browser);
    await page2.evaluate(() => { devJumpToSlot('boss', null); });
    await page2.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page2.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page2, 'ENEMY_ROLL_PHASE');
    await page2.evaluate(() => { forceEnemyRoll(1); refreshInspector(); });
    const nat1Text = await page2.evaluate(readVisibleText);
    assert.ok(nat1Text.indexOf('NAT 1') !== -1, 'expected the intent text to name Nat 1, got: ' + nat1Text);
    await page2.close();
  });

  // ---------------------------------------------------------------
  // ITEM E — Hosanna
  // ---------------------------------------------------------------

  await runTest('Item E-a/b: 6 damage against an Attack; 12 against a wind-up, a release and an Afflict', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    async function playHosannaAndMeasure() {
      await page.evaluate(() => { updatePlayer({ hand: ['hosanna'], soul: 5 }); });
      const before = await page.evaluate(() => gameState.enemy.hp);
      await page.evaluate(() => { playCard(0); });
      const after = await page.evaluate(() => gameState.enemy.hp);
      return before - after;
    }

    assert.strictEqual(await playHosannaAndMeasure(), 6, 'expected 6 against an Attack');

    async function forceEntryAndAdvance(entry) {
      await page.evaluate((e) => { devSetNextIntent(e); }, entry);
      await page.evaluate(() => { autoAdvance(); });
      await page.waitForFunction((kind) => gameState.turn.phase === 'CARD_PHASE' && gameState.enemy.currentEntry && gameState.enemy.currentEntry.kind === kind, entry.kind);
    }

    await forceEntryAndAdvance({ kind: 'charge', release: 30, breakAt: 999 }); // now a wind-up round
    assert.strictEqual(await playHosannaAndMeasure(), 12, 'expected 12 against a wind-up');

    // A charge's release round follows automatically the round after its
    // wind-up — the wind-up->release transition (advanceEnemyIntentForRound(),
    // pipeline.js) takes precedence over any forced intent, so no forcing
    // is needed or possible here; just play the next round with no cards.
    await page.evaluate(() => { autoAdvance(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE' && gameState.enemy.currentEntry && gameState.enemy.currentEntry.kind === 'charge' && gameState.enemy.chargeStage === 'release');
    assert.strictEqual(await playHosannaAndMeasure(), 12, 'expected 12 against a release');

    await forceEntryAndAdvance({ kind: 'afflict', stacks: 4 });
    assert.strictEqual(await playHosannaAndMeasure(), 12, 'expected 12 against an Afflict');
    await page.close();
  });

  await runTest('Item E-c: Hosanna\'s text is not empty', async () => {
    const page = await freshPage(browser);
    const text = await page.evaluate(() => CARD_EFFECT_TEXT['hosanna']);
    assert.ok(text && text.length > 0);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM F — Threnody
  // ---------------------------------------------------------------

  await runTest('Item F-a: threnodyFace is between 2 and 19, shared by two copies, and fixed across fights', async () => {
    const page = await freshPage(browser);
    const face = await page.evaluate(() => gameState.run.threnodyFace);
    assert.ok(face >= 2 && face <= 19, 'threnodyFace must be 2-19, got ' + face);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ hand: ['threnody', 'threnody'] }); });
    const bothSame = await page.evaluate(() => gameState.run.threnodyFace);
    assert.strictEqual(bothSame, face, 'both copies must read the same run-fixed face');
    await page.evaluate(() => { resetFight(); });
    const afterReset = await page.evaluate(() => gameState.run.threnodyFace);
    assert.strictEqual(afterReset, face, 'threnodyFace must stay fixed across a fight reset');
    await page.close();
  });

  await runTest('Item F-b: a loaded face triggers, a blank one gives 2 block, and the round cap holds', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // KI-29: forced to a face that is always blank on a fresh die (10
    // carries Consecrate), so the blank/round-cap cases below can't land
    // on a threnodyFace that happens to already be loaded.
    await page.evaluate(() => { updateRun({ threnodyFace: 7 }); });
    const faceNumber = await page.evaluate(() => gameState.run.threnodyFace);
    // Loaded case.
    await page.evaluate((fn) => {
      const newFaces = gameState.die.faces.slice();
      newFaces[fn - 1] = Object.assign({}, newFaces[fn - 1], { modId: 'smite' });
      updateDie({ faces: newFaces });
    }, faceNumber);
    await page.evaluate((fn) => { forcePlayerRoll(fn === 9 ? 8 : 9); }, faceNumber); // roll a different, untouched face
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['threnody'], soul: 5 }); });
    const beforeLoaded = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const afterLoaded = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(beforeLoaded - afterLoaded, 16, 'expected the loaded threnodyFace to trigger for 16 damage (smite)');

    // Blank case, new fight.
    const page2 = await freshPage(browser);
    await enterOpeningFight(page2);
    await page2.evaluate(() => { updateRun({ threnodyFace: 7 }); });
    const faceNumber2 = await page2.evaluate(() => gameState.run.threnodyFace);
    await page2.evaluate((fn) => { forcePlayerRoll(fn === 9 ? 8 : 9); }, faceNumber2);
    await page2.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page2.evaluate(() => { updatePlayer({ hand: ['threnody'], soul: 5 }); });
    const beforeBlank = await page2.evaluate(() => gameState.player.block);
    await page2.evaluate(() => { playCard(0); });
    const afterBlank = await page2.evaluate(() => gameState.player.block);
    assert.strictEqual(afterBlank - beforeBlank, 2, 'expected a blank threnodyFace to give 2 block');

    // Round cap: exhaust the cap with mod triggers, then Threnody must refuse.
    const page3 = await freshPage(browser);
    await enterOpeningFight(page3);
    await page3.evaluate(() => { updateRun({ threnodyFace: 7 }); });
    const faceNumber3 = await page3.evaluate(() => gameState.run.threnodyFace);
    await page3.evaluate((fn) => { forcePlayerRoll(fn === 9 ? 8 : 9); }, faceNumber3);
    await page3.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page3.evaluate(() => { updateTurn({ roundTriggerCount: GAME_CONFIG.ROUND_TRIGGER_CAP }); });
    await page3.evaluate(() => { updatePlayer({ hand: ['threnody'], soul: 5 }); });
    const beforeCap = await page3.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page3.evaluate(() => { playCard(0); });
    const afterCap = await page3.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    assert.deepStrictEqual(afterCap, beforeCap, 'Threnody must refuse once the round trigger cap is already reached');
    await page.close();
    await page2.close();
    await page3.close();
  });

  await runTest('Item F-c: the text shows the live threnodyFace number and is not empty', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({ face: gameState.run.threnodyFace, text: getCardEffectText('threnody') }));
    assert.ok(v.text && v.text.length > 0, 'threnody text must not be empty');
    assert.ok(v.text.indexOf(String(v.face)) !== -1, 'threnody text must name the live face number ' + v.face + ', got: ' + v.text);
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build142 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
