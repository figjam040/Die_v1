// Standing regression suite for BUILD 189, the 4 Oct design session
// (D-143 to D-150): Tenet reads rolls, the Verger/Lector/Asperser patterns,
// act 1 poison only from the Hierophant, Siphon and Stigma, new texts, and
// Second Sight's exhaust flag.
// Run: node tests/build189.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, freshPage, freshFightPage, assertNoErrors } = require('./shared-constants');

const { runTest, report } = createRunner();

// A fresh opening fight with a big enemy, its first roll forced onto faceNumber.
async function fightRolled(browser, faceNumber) {
  const page = await freshFightPage(browser);
  await page.evaluate(() => { updateEnemy({ hp: 1000, maxHp: 1000 }); });
  await rollFace(page, faceNumber);
  return page;
}

async function rollFace(page, faceNumber) {
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
}

// Plays one card through playCard() and returns the enemy HP and player block it moved.
async function play(page, cardId) {
  return page.evaluate((id) => {
    updatePlayer({ hand: [id], soul: 10 });
    const hp = gameState.enemy.hp;
    const block = gameState.player.block;
    playCard(0);
    return { damage: hp - gameState.enemy.hp, block: gameState.player.block - block };
  }, cardId);
}

function setFace(page, faceNumber, changes) {
  return page.evaluate((a) => {
    const faces = gameState.die.faces.slice();
    const i = playerFaceIndex(a.faceNumber);
    faces[i] = Object.assign({}, faces[i], a.changes);
    updateDie({ faces: faces });
  }, { faceNumber, changes });
}

// Plays the rest of the round through the real phase machine, then forces the next roll.
async function nextRound(page, faceNumber) {
  await page.evaluate(() => { nextPhase(); continueAutoAdvance(); });
  await rollFace(page, faceNumber);
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. D-143 Tenet ----------

  await runTest('D-143 Tenet: 6 damage plus the rolled face\'s rolls, this roll included', async () => {
    const page = await fightRolled(browser, 3);
    assert.strictEqual(await page.evaluate(() => getPlayerFace(3).modData.rollCount), 1, 'a blank face counts its roll');
    assert.strictEqual((await play(page, 'tenet')).damage, 7);
    await page.close();
  });

  await runTest('D-143 Tenet counts rolls, never triggers', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { updateEnemy({ hp: 1000, maxHp: 1000 }); });
    await setFace(page, 5, { modId: 'cope', modData: { triggerCount: 40, rollCount: 2 } });
    await rollFace(page, 5);
    const v = await page.evaluate(() => getPlayerFace(5).modData);
    assert.strictEqual(v.rollCount, 3);
    assert.strictEqual(v.triggerCount, 41, 'the trigger count still counts on its own');
    assert.strictEqual((await play(page, 'tenet')).damage, 9, '6 + 3 rolls, not 6 + 41 triggers');
    const outside = await page.evaluate(() => { triggerFaceOutsideRoll(5); return getPlayerFace(5).modData.rollCount; });
    assert.strictEqual(outside, 3, 'an outside trigger is not a roll');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-143 a Nat face counts its rolls too, and Purify keeps a face\'s roll count', async () => {
    const page = await fightRolled(browser, 20);
    assert.strictEqual(await page.evaluate(() => getPlayerFace(20).modData.rollCount), 1);
    const kept = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      const i = playerFaceIndex(7);
      faces[i] = Object.assign({}, faces[i], { modId: 'smite', modData: { triggerCount: 2, rollCount: 5 } });
      updateDie({ faces: faces });
      dieActionPickPurifyFace(7);
      return getPlayerFace(7);
    });
    assert.strictEqual(kept.modId, null);
    assert.deepStrictEqual(kept.modData, { rollCount: 5 });
    await page.close();
  });

  await runTest('D-143 Tenet text', async () => {
    const page = await freshPage(browser);
    assert.strictEqual(await page.evaluate(() => getCardEffectText('tenet')), '6 damage. +1 for each time this face has been rolled.');
    await page.close();
  });

  // ---------- 2. D-144 Verger ----------

  await runTest('D-144 Verger: Attack 7, Attack 9, Charge release 14 break 8', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      cfg: GAME_CONFIG.ENEMIES.verger_opening.pattern,
      opening: gameState.run.act.opening.enemy.pattern,
      words: formatPatternWords(GAME_CONFIG.ENEMIES.verger_opening.pattern)
    }));
    const expected = [{ kind: 'attack', min: 7, max: 7 }, { kind: 'attack', min: 9, max: 9 }, { kind: 'charge', release: 14, breakAt: 8 }];
    assert.deepStrictEqual(v.cfg, expected);
    assert.deepStrictEqual(v.opening, expected);
    assert.strictEqual(v.words, 'Attack 7, Attack 9, Charge 14');
    await page.close();
  });

  await runTest('D-144 the live Verger opens with Attack 7, then 9, then winds up', async () => {
    const page = await fightRolled(browser, 3);
    const seen = [await page.evaluate(() => gameState.enemy.currentEntry.rolledValue)];
    await nextRound(page, 3);
    seen.push(await page.evaluate(() => gameState.enemy.currentEntry.rolledValue));
    await nextRound(page, 3);
    seen.push(await page.evaluate(() => gameState.enemy.chargeStage + ' ' + gameState.enemy.currentEntry.release + ' ' + gameState.enemy.currentEntry.breakAt));
    assert.deepStrictEqual(seen, [7, 9, 'windup 14 8']);
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 3. D-145 Lector ----------

  await runTest('D-145 Lector: round-1 Attack 13, Charge break 13', async () => {
    const page = await freshPage(browser);
    const p = await page.evaluate(() => gameState.run.act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.pattern);
    assert.deepStrictEqual(p[0], { kind: 'attack', min: 13, max: 13 });
    assert.deepStrictEqual(p[2], { kind: 'charge', release: 27, breakAt: 13 });
    await page.close();
  });

  // ---------- 4. D-146 act 1 poison ----------

  await runTest('D-146 Asperser and Lector Afflict 4 became Attack 4', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({ asperser: GAME_CONFIG.ENEMIES.asperser.pattern, lector: GAME_CONFIG.ENEMIES.lector.pattern }));
    assert.deepStrictEqual(v.asperser[2], { kind: 'attack', min: 4, max: 4 });
    assert.deepStrictEqual(v.lector[1], { kind: 'attack', min: 4, max: 4 });
    await page.close();
  });

  await runTest('D-146 no act 1 enemy applies poison except the Hierophant', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const act = gameState.run.act;
      const slots = [act.opening].concat(act.upper, act.lower, [act.boss]).filter(function(s) { return s && s.type === 'fight'; });
      return slots.map(function(s) {
        const faces = (s.enemy.die && s.enemy.die.faces) || [];
        return {
          name: s.enemy.name,
          afflicts: s.enemy.pattern.filter(function(e) { return e.kind === 'afflict'; }).length,
          poisonFaces: faces.filter(function(f) { return f.modId === 'enemy_buff_poison'; }).map(function(f) { return f.number; })
        };
      });
    });
    const names = v.map(function(e) { return e.name; });
    ['Verger', 'Thurifer', 'Asperser', 'Lector', 'Hierophant'].forEach(function(n) { assert.ok(names.indexOf(n) !== -1, n + ' must be in act 1'); });
    v.filter(function(e) { return e.name !== 'Hierophant'; }).forEach(function(e) {
      assert.strictEqual(e.afflicts, 0, e.name + ' must not Afflict');
      assert.deepStrictEqual(e.poisonFaces, [], e.name + ' must carry no poison face');
    });
    const h = v.find(function(e) { return e.name === 'Hierophant'; });
    assert.deepStrictEqual(h.poisonFaces, [5, 10, 15], 'the Hierophant keeps its poison faces');
    await page.close();
  });

  await runTest('D-146 acts 2 and 3 still Afflict and carry poison faces', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => [2, 3].map(function(n) {
      const act = buildAct(n);
      const slots = [act.opening].concat(act.upper, act.lower, [act.boss]).filter(function(s) { return s && s.type === 'fight'; });
      return {
        afflicts: slots.filter(function(s) { return s.enemy.pattern.some(function(e) { return e.kind === 'afflict'; }); }).length,
        poisonDice: slots.filter(function(s) { return s.enemy.die && s.enemy.die.faces.some(function(f) { return f.modId === 'enemy_buff_poison'; }); }).length,
        archdeacon: GAME_CONFIG.ENEMIES.archdeacon.pattern[1]
      };
    }));
    v.forEach(function(a) {
      assert.ok(a.afflicts > 0 && a.poisonDice > 0, JSON.stringify(a));
      assert.deepStrictEqual(a.archdeacon, { kind: 'afflict', stacks: 5 });
    });
    await page.close();
  });

  // ---------- 5. D-147 Siphon and Stigma ----------

  await runTest('D-147 Siphon: uncommon, 1 soul, text, 3 stacks', async () => {
    const page = await fightRolled(browser, 3);
    const card = await page.evaluate(() => ({ tier: gameState.config.cards.siphon.tier, cost: gameState.config.cards.siphon.soulCost, text: getCardEffectText('siphon') }));
    assert.deepStrictEqual(card, { tier: 'uncommon', cost: 1, text: 'Apply 3 stacks of Siphon.' });
    await play(page, 'siphon');
    assert.strictEqual(await page.evaluate(() => gameState.enemy.siphonStacks), 3);
    await page.close();
  });

  await runTest('D-147 Siphon spends one stack per hit, block half the damage rounded up', async () => {
    const page = await fightRolled(browser, 3);
    await play(page, 'siphon');
    const hits = [];
    for (let i = 0; i < 4; i++) {
      const r = await play(page, 'strike');
      hits.push([r.damage, r.block, await page.evaluate(() => gameState.enemy.siphonStacks)]);
    }
    assert.deepStrictEqual(hits, [[5, 3, 2], [5, 3, 1], [5, 3, 0], [5, 0, 0]]);
    const tick = await page.evaluate(() => {
      applySiphon(1);
      const block = gameState.player.block;
      dealDamage('enemy', 4, 'poison', 'test');
      return { stacks: gameState.enemy.siphonStacks, block: gameState.player.block - block };
    });
    assert.deepStrictEqual(tick, { stacks: 1, block: 0 }, 'poison is not attack damage');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-147 Stigma: rare, 2 soul, text', async () => {
    const page = await freshPage(browser);
    const card = await page.evaluate(() => ({ tier: gameState.config.cards.stigma.tier, cost: gameState.config.cards.stigma.soulCost, text: getCardEffectText('stigma') }));
    assert.deepStrictEqual(card, { tier: 'rare', cost: 2, text: 'The enemy gains Stigma for 2 rounds.' });
    await page.close();
  });

  await runTest('D-147 Stigma: a mod hits again at half, rounded down; a card does not; it ends after two rounds', async () => {
    const page = await fightRolled(browser, 3);
    await setFace(page, 5, { modId: 'smite' });
    await setFace(page, 6, { modId: 'unison' });
    await play(page, 'stigma');
    const hit = function(n) {
      return page.evaluate((f) => { const hp = gameState.enemy.hp; triggerFaceOutsideRoll(f); return hp - gameState.enemy.hp; }, n);
    };
    const round1 = [await page.evaluate(() => gameState.enemy.stigmaStacks), await hit(5), (await play(page, 'strike')).damage];
    assert.deepStrictEqual(round1, [2, 24, 5], 'Smite 16 + 8; Strike 5 alone');
    await nextRound(page, 3);
    const round2 = [await page.evaluate(() => gameState.enemy.stigmaStacks), await hit(6)];
    assert.deepStrictEqual(round2, [1, 9], 'still on in round 2: Unison 6 + 3');
    await nextRound(page, 3);
    const round3 = [await page.evaluate(() => gameState.enemy.stigmaStacks), await hit(5)];
    assert.deepStrictEqual(round3, [0, 16], 'gone in round 3');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-147 Siphon and Stigma show in the enemy panel with a hover line, and clear at fight reset', async () => {
    const page = await fightRolled(browser, 3);
    await page.evaluate(() => { applySiphon(3); applyStigma(2); });
    const v = await page.evaluate(() => ['status-siphon', 'status-stigma'].map(function(c) {
      const el = document.querySelector('#enemyStatusRow .' + c);
      return el ? el.firstChild.textContent + ' | ' + ((el.querySelector('.hover-tip') || {}).textContent || '') : null;
    }));
    assert.ok(v[0] && v[0].indexOf('Siphon 3 | Siphon:') === 0, v[0]);
    assert.ok(v[1] && v[1].indexOf('Stigma 2 | Stigma:') === 0, v[1]);
    const after = await page.evaluate(() => { clearFightScopedState(); return [gameState.enemy.siphonStacks, gameState.enemy.stigmaStacks]; });
    assert.deepStrictEqual(after, [0, 0]);
    await page.close();
  });

  await runTest('D-147 card pool 50, tiers 24/15/11', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const counts = {};
      Object.keys(gameState.config.cardPool).forEach(function(id) { const t = gameState.config.cardPool[id].tier; counts[t] = (counts[t] || 0) + 1; });
      return { n: Object.keys(gameState.config.cardPool).length, counts: counts };
    });
    assert.strictEqual(v.n, 50);
    assert.deepStrictEqual(v.counts, { basic: 24, uncommon: 15, rare: 11 });
    await page.close();
  });

  // ---------- 6. D-148 Tolling Bell ----------

  await runTest('D-148 Tolling Bell text', async () => {
    const page = await freshPage(browser);
    assert.strictEqual(await page.evaluate(() => gameState.config.artifacts.tolling_bell.text), 'When a blank triggers, gain 2 block, plus 1 for every blank rolled earlier this fight.');
    await page.close();
  });

  // ---------- 7. D-149 mod texts ----------

  await runTest('D-149 Zeal, Cope, Ordain and Elevation texts', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({ zeal: MOD_DESCRIPTION.zeal, cope: MOD_DESCRIPTION.cope, ordain: MOD_DESCRIPTION.ordain, elevation: MOD_DESCRIPTION.elevation }));
    assert.deepStrictEqual(v, {
      zeal: '10 damage. +4 each trigger.',
      cope: '8 block. +2 each trigger.',
      ordain: 'Deal 10 damage. This face gains 1 weight.',
      elevation: 'Deal 10 damage. The face above gains 1 weight.'
    });
    await page.close();
  });

  // ---------- 8. D-150 Second Sight ----------

  await runTest('D-150 Second Sight: 2 soul, exhaust, text; Second Sight alone carries the flag', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      cost: gameState.config.cards.second_sight.soulCost,
      text: getCardEffectText('second_sight'),
      flagged: Object.keys(gameState.config.cards).filter(function(id) { return gameState.config.cards[id].exhaust; })
    }));
    assert.deepStrictEqual(v, { cost: 2, text: 'Roll again. Both rolls stand. Gone this fight.', flagged: ['second_sight'] });
    await page.close();
  });

  await runTest('D-150 Second Sight leaves the fight after one play; both rolls stand; the newest roll is the rolled face', async () => {
    const page = await fightRolled(browser, 10);
    const v = await page.evaluate(() => {
      const soulAfterFirst = gameState.player.soul;
      updatePlayer({ ownedCards: gameState.player.ownedCards.concat(['second_sight']), deck: [], discard: [], hand: ['second_sight', 'strike'] });
      const random = Math.random;
      Math.random = function() { return 0.12; };
      playCard(0);
      Math.random = random;
      const piles = gameState.player.deck.concat(gameState.player.hand, gameState.player.discard);
      return {
        soulAfterFirst: soulAfterFirst,
        soulSpent: soulAfterFirst - gameState.player.soul,
        inPiles: piles.indexOf('second_sight') !== -1,
        hand: gameState.player.hand.slice(),
        rolled: [gameState.turn.rolledFaceNumber, gameState.turn.rollOutcome],
        consecrateStill: gameState.registry.listeners.ON_CARD_PLAY.some(function(l) { return l.id === 'consecrate_block_per_card'; }),
        rollCounts: [getPlayerFace(10).modData.rollCount, getPlayerFace(3).modData.rollCount]
      };
    });
    assert.strictEqual(v.soulAfterFirst, 5, 'face 10 Consecrate: 3 soul + 2');
    assert.strictEqual(v.soulSpent, 2);
    assert.strictEqual(v.inPiles, false, 'gone from deck, hand and discard');
    assert.deepStrictEqual(v.hand, ['strike']);
    assert.deepStrictEqual(v.rolled, [3, 'blank'], 'the newest roll is the rolled face');
    assert.strictEqual(v.consecrateStill, true, 'the first roll still stands');
    assert.deepStrictEqual(v.rollCounts, [1, 1], 'both rolls count as rolls');
    const back = await page.evaluate(() => { clearFightScopedState(); return gameState.player.deck.indexOf('second_sight') !== -1; });
    assert.strictEqual(back, true, 'the next fight\'s deck has it again');
    assertNoErrors(page);
    await page.close();
  });

  await browser.close();
  const failed = report('BUILD 189');
  process.exit(failed > 0 ? 1 : 0);
})();
