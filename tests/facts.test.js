// ============================================================
// TESTS/FACTS.TEST.JS — BUILD 102
// Asserts every F-number in the FACTS block (js/config.js's header comment,
// mirrored on the Notion "Die — V1" page) against GAME_CONFIG and against
// the running gameState after a fresh New Run — never against a second,
// hand-typed copy of the numbers. A mismatch between the documented fact
// and the live value is a failing test.
//
// Same shape as tests/mods.test.js: plain Node script (no test runner
// installed, only the raw `playwright` library), chromium launched
// directly, node:assert, a fresh page per fact group needing isolated
// fight/run state. Run: node tests/facts.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

let currentTestName = null;
const { results, runTest } = createRunner(function(name) { currentTestName = name; });
// BUILD 112 (KI-14): some facts have no independent oracle — the assertion
// is GAME_CONFIG (or a value derived one-to-one from it, e.g. audio.js's
// CHAIN_STEP_CAP = GAME_CONFIG.CHAIN_STEP_CAP) compared against a hardcoded
// literal that is itself just a second, hand-typed copy of the same FACTS
// number. Both copies are written by the same author from the same source,
// so a wrong documented fact would pass in both places silently — this
// checks internal consistency (did the number get retyped correctly two
// places), not real game behaviour. specOnlyEqual() is assert.strictEqual
// with that admission attached: it still fails the test if the two copies
// diverge (a real, if narrow, use), but every use is logged distinctly and
// counted separately so the final pass count doesn't overstate how much of
// this file is independently-verified behaviour vs spec/config echo. A test
// that also exercises real behaviour (a forced roll, a real card effect(), a
// real phase transition) keeps those assertions as plain assert calls,
// unweakened — only the literal-vs-config lines route through this.
const specOnlyChecks = [];
function specOnlyEqual(actual, expected, label) {
  specOnlyChecks.push({ test: currentTestName, label: label });
  console.log('  [SPEC-ONLY] ' + currentTestName + ' — ' + label + ' (comment/config comparison only, no independent behavioural check)');
  assert.strictEqual(actual, expected, label);
}
function specOnlyDeepEqual(actual, expected, label) {
  specOnlyChecks.push({ test: currentTestName, label: label });
  console.log('  [SPEC-ONLY] ' + currentTestName + ' — ' + label + ' (comment/config comparison only, no independent behavioural check)');
  assert.deepStrictEqual(actual, expected, label);
}
(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // F01/F02/F04/F16/F17/F18/F20/F21/F24/F25/F27 — static facts, all
  // readable straight off GAME_CONFIG and the freshly-built run/act, no
  // fight needed. One page, one pass.
  // ---------------------------------------------------------------
  await runTest('F01 player HP 70 (GAME_CONFIG + gameState)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      cfg: GAME_CONFIG.PLAYER_MAX_HP,
      hp: gameState.player.hp,
      maxHp: gameState.player.maxHp
    }));
    specOnlyEqual(v.cfg, 70, 'F01: GAME_CONFIG.PLAYER_MAX_HP === 70 (documented fact, no independent oracle)');
    assert.strictEqual(v.hp, 70);
    assert.strictEqual(v.maxHp, 70);
    await page.close();
  });

  await runTest('F02 soul 3 (GAME_CONFIG + gameState)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      cfg: GAME_CONFIG.PLAYER_MAX_SOUL,
      soul: gameState.player.soul,
      maxSoul: gameState.player.maxSoul
    }));
    specOnlyEqual(v.cfg, 3, 'F02: GAME_CONFIG.PLAYER_MAX_SOUL === 3 (documented fact, no independent oracle)');
    assert.strictEqual(v.soul, 3);
    assert.strictEqual(v.maxSoul, 3);
    await page.close();
  });

  await runTest('F04 starting deck 5 Strike 4 Ward 1 Rite (GAME_CONFIG + ownedCards)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      function counts(deck) {
        return deck.reduce(function(acc, id) { acc[id] = (acc[id] || 0) + 1; return acc; }, {});
      }
      return { cfg: counts(GAME_CONFIG.STARTING_DECK), owned: counts(gameState.player.ownedCards) };
    });
    specOnlyDeepEqual(v.cfg, { strike: 5, ward: 4, rite: 1 }, 'F04: GAME_CONFIG.STARTING_DECK counts (documented fact, no independent oracle)');
    assert.deepStrictEqual(v.owned, { strike: 5, ward: 4, rite: 1 });
    await page.close();
  });

  // D-123 (BUILD 169): SLOTS_PER_LANE and RITE_SLOT_INDICES are per act; act 1 has nine slots.
  await runTest('F16 lanes 2, slots per lane 9/8/8, three rites per lane, elite at slot 4 of the upper lane', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      laneCount: GAME_CONFIG.LANE_COUNT,
      slotsPerLane: GAME_CONFIG.SLOTS_PER_LANE,
      eliteIndex: GAME_CONFIG.ELITE_SLOT_INDEX,
      allowed: GAME_CONFIG.ELITE_ALLOWED_SLOT_INDICES,
      riteIndices: GAME_CONFIG.RITE_SLOT_INDICES,
      upperLen: gameState.run.act.upper.length,
      lowerLen: gameState.run.act.lower.length,
      upperEliteLabel: gameState.run.act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].label,
      lowerHasElite: gameState.run.act.lower.some(function(s) { return s.label === 'Elite'; }),
      upperRiteLabels: GAME_CONFIG.RITE_SLOT_INDICES[0].map(function(i) { return gameState.run.act.upper[i].label; }),
      lowerRiteLabels: GAME_CONFIG.RITE_SLOT_INDICES[0].map(function(i) { return gameState.run.act.lower[i].label; }),
      act2Len: buildAct(2).upper.length,
      upperFightCount: gameState.run.act.upper.filter(function(s) { return s.type === 'fight'; }).length,
      lowerFightCount: gameState.run.act.lower.filter(function(s) { return s.type === 'fight'; }).length,
      lowerEventCount: gameState.run.act.lower.filter(function(s) { return s.type === 'event'; }).length,
      upperLabels: gameState.run.act.upper.map(function(s) { return s.label; }),
      lowerLabels: gameState.run.act.lower.map(function(s) { return s.label; })
    }));
    specOnlyEqual(v.laneCount, 2, 'F16: GAME_CONFIG.LANE_COUNT === 2 (documented fact, no independent oracle)');
    specOnlyDeepEqual(v.slotsPerLane, [9, 8, 8], 'F16: GAME_CONFIG.SLOTS_PER_LANE === [9,8,8] (documented fact, no independent oracle)');
    assert.strictEqual(v.upperLen, 9);
    assert.strictEqual(v.lowerLen, 9);
    assert.strictEqual(v.act2Len, 8);
    assert.deepStrictEqual(v.allowed, [3], 'F16: the elite is slot 4 of the upper lane (0-based index 3), not a range');
    assert.strictEqual(v.eliteIndex, 3);
    assert.strictEqual(v.upperEliteLabel, 'Elite');
    assert.strictEqual(v.lowerHasElite, false, 'the elite sits on one lane only, per D-23');
    assert.deepStrictEqual(v.riteIndices, [[1, 5, 8], [1, 4, 7], [1, 4, 7]], 'F16: three rites per lane, act 1 at slots 2, 6 and 9, acts 2-3 at 2, 5 and 8 (1-based)');
    assert.deepStrictEqual(v.upperRiteLabels, ['Rite', 'Rite', 'Rite']);
    assert.deepStrictEqual(v.lowerRiteLabels, ['Rite', 'Rite', 'Rite']);
    // Act 1's upper lane holds 6 fights (9 slots minus 3 rites, the elite
    // included); the lower lane's slot index 3 is the Anomaly, so 5.
    assert.strictEqual(v.upperFightCount, 6);
    assert.strictEqual(v.lowerFightCount, 5);
    assert.strictEqual(v.lowerEventCount, 1);
    assert.deepStrictEqual(v.upperLabels, ['Fight', 'Rite', 'Fight', 'Elite', 'Fight', 'Rite', 'Fight', 'Fight', 'Rite']);
    // D-117: the event slot reads Anomaly to the player.
    assert.deepStrictEqual(v.lowerLabels, ['Fight', 'Rite', 'Fight', 'Anomaly', 'Fight', 'Rite', 'Fight', 'Fight', 'Rite']);
    await page.close();
  });

  await runTest('CHECKPOINT 3 MAP: no lane shows the same normal enemy twice in a row', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // BUILD 142: normalTypeIndex is gone (replaced by named enemy defs,
      // GAME_CONFIG.ENEMIES) — the same "no repeat" property now checks the
      // enemy's own name instead of the old anonymous rotation index.
      function normalTypeSequence(lane) {
        return gameState.run.act[lane]
          .filter(function(s) { return s.type === 'fight' && s.label === 'Fight'; })
          .map(function(s) { return s.enemy.name; });
      }
      return { upper: normalTypeSequence('upper'), lower: normalTypeSequence('lower') };
    });
    ['upper', 'lower'].forEach(function(lane) {
      const seq = v[lane];
      for (let i = 1; i < seq.length; i++) {
        assert.notStrictEqual(seq[i], seq[i - 1], lane + ' lane repeats normal enemy type ' + seq[i] + ' at consecutive normal fights (sequence: ' + seq.join(',') + ')');
      }
    });
    await page.close();
  });

  await runTest('KI-25: every mod log line that states an amount of poison reads "N stacks of poison"', async () => {
    const TEST_FACE = 5;

    async function triggerModAndGetLog(modId) {
      const page = await freshPage(browser);
      await enterOpeningFight(page);
      await page.evaluate(({ modId, faceNum }) => {
        const newFaces = gameState.die.faces.slice();
        newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: modId });
        updateDie({ faces: newFaces });
      }, { modId, faceNum: TEST_FACE });
      await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
      await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
      const logText = await page.evaluate(() => document.getElementById('log').textContent);
      await page.close();
      return logText;
    }

    const blightLog = await triggerModAndGetLog('blight');
    assert.ok(/\[MOD\] blight: applied 6 stacks of poison/.test(blightLog), 'blight log line must read "stacks of poison": ' + blightLog.slice(-200));

    const virulenceLog = await triggerModAndGetLog('virulence');
    assert.ok(/\[MOD\] virulence: applied 3 stacks of poison, doubled to \d+ stacks of poison/.test(virulenceLog), 'virulence log line must read "stacks of poison": ' + virulenceLog.slice(-200));

    // No [MOD] line anywhere in the log states a bare "N poison" amount.
    const bareModPoison = /\[MOD\][^\n]*\b\d+ poison\b(?! stacks)/i;
    assert.ok(!bareModPoison.test(blightLog + virulenceLog), 'found a [MOD] log line stating a bare "N poison" amount');
  });

  // BUILD 142 (item A/B) rewrite: act 1's five lane-fight positions now
  // carry their own fixed HP (GAME_CONFIG.ACT1_LANE_FIGHT_HP), not the old
  // three-value NORMAL_FIGHT_HP rotation, and every enemy acts from a
  // literal, final-numbers pattern (GAME_CONFIG.ENEMIES) rather than a
  // flat intentMin/intentMax band read from GAME_CONFIG.INTENT — updated
  // under this build's own test rule (named explicitly in its prompt).
  await runTest('F17/F18 HP and intent per slot type (GAME_CONFIG + built act)', async () => {
    const page = await freshPage(browser);
    const act = await page.evaluate(() => gameState.run.act);
    const cfg = await page.evaluate(() => GAME_CONFIG);
    assert.strictEqual(act.opening.enemy.hp, cfg.HP.OPENING);
    assert.strictEqual(act.opening.enemy.name, 'Verger', 'act 1 opening enemy must be the Verger');
    specOnlyDeepEqual(cfg.ACT1_LANE_FIGHT_HP, [58, 65, 78, 85], 'F17: GAME_CONFIG.ACT1_LANE_FIGHT_HP === [58,65,78,85] (documented fact, no independent oracle)');
    assert.strictEqual(act.upper[0].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[0]);
    assert.strictEqual(act.upper[2].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[1]);
    assert.strictEqual(act.lower[0].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[0]);
    assert.strictEqual(act.lower[2].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[1]);
    // BUILD 151 (F44): lower[3] is now the event slot (The Font), not a fight.
    assert.strictEqual(act.lower[3].type, 'event');
    assert.strictEqual(act.lower[3].label, 'Anomaly');
    [act.upper[0], act.upper[2], act.lower[0], act.lower[2]].forEach(function(s) {
      assert.ok(s.enemy.pattern.length > 0, 'every act 1 lane fight must carry a non-empty pattern');
    });
    assert.strictEqual(act.upper[3].enemy.hp, cfg.HP.ELITE);
    assert.strictEqual(act.upper[3].enemy.name, 'Lector', 'act 1 elite must be the Lector');
    assert.strictEqual(act.boss.enemy.hp, cfg.HP.BOSS);
    assert.strictEqual(act.boss.enemy.name, 'Hierophant', 'act 1 boss must be the Hierophant');
    await page.close();
  });

  // BUILD 142: the act 1 elite is now Lector, a named designed enemy —
  // 12-sided (DIE_SIZE.ELITE lowered from 20 to 12), poison on faces 3 and
  // 9 (not the old flat 7/14), plus its own drain/wrath faces, no Nats.
  await runTest('F20 elite die: Lector, 12-sided, poison on 3 and 9, no Nat faces', async () => {
    const page = await freshPage(browser);
    const faces = await page.evaluate(() => gameState.run.act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.die.faces);
    assert.strictEqual(faces.length, 12, 'the elite die must be 12-sided');
    const poisonFaces = faces.filter(function(f) { return f.modId === 'enemy_buff_poison'; }).map(function(f) { return f.number; });
    assert.deepStrictEqual(poisonFaces, [3, 9]);
    assert.strictEqual(faces[0].modId, null, 'elite face 1 must be an ordinary blank, no ENEMY_NAT_ONE');
    assert.strictEqual(faces[11].modId, 'enemy_buff_wrath', 'elite face 12 (the top face) is Lector\'s own wrath face, not a Nat — the elite die never carries Nats');
    await page.close();
  });

  await runTest('F21 boss die: poison on 5/10/15, plus Nat 20 and Nat 1', async () => {
    const page = await freshPage(browser);
    const faces = await page.evaluate(() => gameState.run.act.boss.enemy.die.faces);
    const poisonFaces = faces.filter(function(f) { return f.modId === 'enemy_buff_poison'; }).map(function(f) { return f.number; });
    assert.deepStrictEqual(poisonFaces, [5, 10, 15]);
    assert.strictEqual(faces[0].modId, 'ENEMY_NAT_ONE');
    assert.strictEqual(faces[19].modId, 'ENEMY_NAT_TWENTY');
    await page.close();
  });

  await runTest('F24 mods 27', async () => {
    const page = await freshPage(browser);
    const n = await page.evaluate(() => Object.keys(gameState.config.mods).length);
    specOnlyEqual(n, 27, 'F24: twenty-seven real mods (documented fact — the mod pool is a single, self-declared source, no independent oracle to check its count against)');
    await page.close();
  });

  await runTest('F25 cards 48 (reward pool)', async () => {
    const page = await freshPage(browser);
    const n = await page.evaluate(() => Object.keys(gameState.config.cardPool).length);
    specOnlyEqual(n, 48, 'F25: forty-eight reward-pool cards (documented fact — a single, self-declared source, no independent oracle to check its count against)');
    await page.close();
  });

  await runTest('F27 pitch chain cap 8, reset at START_OF_TURN', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const cfgCap = GAME_CONFIG.CHAIN_STEP_CAP;
      const codeCap = CHAIN_STEP_CAP;
      modChainStep = cfgCap - 1;
      playAudioEvent('mod_trigger'); // steps from 7 -> capped at 8
      const atCap = modChainStep;
      playAudioEvent('mod_trigger'); // must stay capped, not climb to 9
      const stillAtCap = modChainStep;
      resetSoundChains();
      const afterReset = modChainStep;
      return { cfgCap, codeCap, atCap, stillAtCap, afterReset };
    });
    specOnlyEqual(v.cfgCap, 8, 'F27: GAME_CONFIG.CHAIN_STEP_CAP === 8 (documented fact, no independent oracle)');
    specOnlyEqual(v.codeCap, 8, "F27: audio.js's CHAIN_STEP_CAP === 8 (this constant is literally `= GAME_CONFIG.CHAIN_STEP_CAP`, grep-confirmed — not an independently-declared second source, so this is the same circularity as cfgCap, not a real cross-file check)");
    assert.strictEqual(v.atCap, 8);
    assert.strictEqual(v.stillAtCap, 8, 'chain must not climb past the cap');
    assert.strictEqual(v.afterReset, 0, 'resetSoundChains() must zero the chain');
    await page.close();
  });

  await runTest('F28 sound duration ceiling — 200ms holds except the documented exemptions', async () => {
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
      Object.keys(SOUND_TABLE).forEach(function(name) {
        calls.length = 0;
        currentDelay = 0;
        SOUND_TABLE[name](0);
        out[name] = calls.reduce(function(m, c) { return Math.max(m, c.delay + c.durationMs); }, 0);
      });
      window.setTimeout = originalSetTimeout;
      window.playTone = originalPlayTone;
      return out;
    });
    const ceiling = await page.evaluate(() => GAME_CONFIG.SOUND_DURATION_CEILING_MS);
    const exempt = await page.evaluate(() => GAME_CONFIG.SOUND_DURATION_CEILING_EXEMPT);
    Object.keys(durations).forEach(function(name) {
      if (exempt.indexOf(name) !== -1) {
        assert.ok(durations[name] > ceiling, name + ' is listed as exempt but measured ' + durations[name] + 'ms, at or under the ' + ceiling + 'ms ceiling — remove it from the exemption list');
      } else {
        assert.ok(durations[name] <= ceiling, name + ' measured ' + durations[name] + 'ms, over the ' + ceiling + 'ms ceiling and not in the exemption list');
      }
    });
    await page.close();
  });

  // ---------------------------------------------------------------
  // F03/F05/F06/F07/F08/F09 — need an active fight (the opening fight).
  // ---------------------------------------------------------------
  await runTest('F03 draw 5 at START_OF_TURN', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => ({ cfg: GAME_CONFIG.DRAW_COUNT, hand: gameState.player.hand.length }));
    specOnlyEqual(v.cfg, 5, 'F03: GAME_CONFIG.DRAW_COUNT === 5 (documented fact, no independent oracle)');
    assert.strictEqual(v.hand, 5, 'real drawCards(5) dispatch at START_OF_TURN must actually leave 5 cards in hand');
    await page.close();
  });

  await runTest('F05 blank roll 2 block', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Face 3 is blank on a fresh die (only face 10 carries Consecrate).
    const blockBefore = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockBefore, 0);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({ cfg: GAME_CONFIG.BLANK_ROLL_BLOCK, block: gameState.player.block, outcome: gameState.turn.rollOutcome }));
    assert.strictEqual(v.outcome, 'blank');
    specOnlyEqual(v.cfg, 2, 'F05: GAME_CONFIG.BLANK_ROLL_BLOCK === 2 (documented fact, no independent oracle)');
    assert.strictEqual(v.block, 2, 'a real forced blank roll must actually grant 2 block');
    await page.close();
  });

  await runTest('F06/F07/F08 Strike/Ward/Rite cost and effect', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const out = {};
      out.strikeCost = gameState.config.cards['strike'].soulCost;
      out.wardCost = gameState.config.cards['ward'].soulCost;
      out.riteCost = gameState.config.cards['rite'].soulCost;

      updateEnemy({ hp: 100 });
      gameState.config.cards['strike'].effect();
      out.strikeDamage = 100 - gameState.enemy.hp;

      updatePlayer({ block: 0 });
      gameState.config.cards['ward'].effect();
      out.wardBlock = gameState.player.block;

      updateEnemy({ hp: 100 });
      updatePlayer({ block: 0 });
      gameState.config.cards['rite'].effect();
      out.riteDamage = 100 - gameState.enemy.hp;
      out.riteBlock = gameState.player.block;
      return out;
    });
    specOnlyEqual(v.strikeCost, 1, 'F06: strike soulCost === 1 (documented fact, no independent oracle)'); assert.strictEqual(v.strikeDamage, 5, 'strike.effect() must actually deal 5 damage');
    specOnlyEqual(v.wardCost, 1, 'F07: ward soulCost === 1 (documented fact, no independent oracle)'); assert.strictEqual(v.wardBlock, 5, 'ward.effect() must actually grant 5 block');
    specOnlyEqual(v.riteCost, 2, 'F08: rite soulCost === 2 (documented fact, no independent oracle)'); assert.strictEqual(v.riteDamage, 6, 'rite.effect() must actually deal 6 damage (D-121)'); assert.strictEqual(v.riteBlock, 6, 'rite.effect() must actually grant 6 block');
    await page.close();
  });

  await runTest('F09 poison decays N then N-1, ticked at the end of the poisoned side\'s turn', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ poisonStacks: 6 }); });
    await advanceUntilPhase(page, 'CARD_PHASE');
    const before = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { nextPhase(); }); // CARD_PHASE -> END_PLAYER_TURN, the player's poison ticks inline
    const v = await page.evaluate(() => ({ hp: gameState.player.hp, stacks: gameState.player.poisonStacks }));
    assert.strictEqual(before - v.hp, 6, 'expected exactly 6 poison damage this tick');
    assert.strictEqual(v.stacks, 5, 'expected stacks to decay from 6 to 5');
    await page.close();
  });

  // ---------------------------------------------------------------
  // F10 — Penitence: 3 rounds, once per fight.
  // ---------------------------------------------------------------
  await runTest('F10 Penitence 3 rounds, once per fight', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(1); }); // face 1 = NAT_ONE
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const onset = await page.evaluate(() => ({
      cfg: GAME_CONFIG.PENITENCE_TURNS,
      active: gameState.player.penitenceActive,
      remaining: gameState.player.penitenceTurnsRemaining,
      fired: gameState.player.natOneFiredThisFight,
      outcome: gameState.turn.rollOutcome
    }));
    specOnlyEqual(onset.cfg, 3, 'F10: GAME_CONFIG.PENITENCE_TURNS === 3 (documented fact, no independent oracle)');
    assert.strictEqual(onset.outcome, 'nat_one');
    assert.strictEqual(onset.active, true);
    assert.strictEqual(onset.remaining, 3);
    assert.strictEqual(onset.fired, true);

    // Advance to next round's ROLL_PHASE (one START_OF_TURN tick spent) and
    // force face 1 again — once-per-fight means this must resolve blank.
    // No leftover autoAdvance() timer is pending at this point (round 1's
    // chain died the moment it reached CARD_PHASE), so the ROLL_PHASE ->
    // CARD_PHASE step here has to be driven explicitly, unlike round 1's.
    await advanceUntilPhase(page, 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const second = await page.evaluate(() => ({ outcome: gameState.turn.rollOutcome, remaining: gameState.player.penitenceTurnsRemaining }));
    assert.strictEqual(second.outcome, 'blank', 'a second Nat 1 this fight must resolve as a plain blank');
    assert.strictEqual(second.remaining, 2, 'the one START_OF_TURN tick since onset must have ticked the counter down');
    await page.close();
  });

  // ---------------------------------------------------------------
  // F11 — player Nat 20: every loaded face triggers, ascending, repeatable.
  // ---------------------------------------------------------------
  await runTest('F11 Nat 20 repeatable — every loaded face triggers each time', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5
      updateDie({ faces: newFaces });
    });
    const hpBeforeRound1 = await page.evaluate(() => gameState.enemy.hp); // opening fight enemy starts at 50, not 100
    await page.evaluate(() => { forcePlayerRoll(20); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfterRound1 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBeforeRound1 - hpAfterRound1, 16, 'round 1 Nat 20 must trigger Smite (16) plus Consecrate (no damage) once each');

    // Same reasoning as F10: round 1's leftover autoAdvance() timer is spent
    // once CARD_PHASE is reached, so round 2's ROLL_PHASE -> CARD_PHASE step
    // must be driven explicitly here.
    await advanceUntilPhase(page, 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(20); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpAfterRound2 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpAfterRound1 - hpAfterRound2, 16, 'Nat 20 must trigger the same loaded face again next round — repeatable, not once-per-fight');
    await page.close();
  });

  // ---------------------------------------------------------------
  // F12/F13 — Strengthen face eligibility, Load offer shape.
  // ---------------------------------------------------------------
  await runTest('F12 Strengthen targets face 20, never face 1', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseStrengthen(); });
    const v = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      function classesFor(num) {
        const row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === String(num); });
        return row ? row.className : null;
      }
      return { face1: classesFor(1), face20: classesFor(20) };
    });
    assert.ok(v.face1 && v.face1.indexOf('die-row-pick-inert') !== -1, 'face 1 must never be Strengthen-eligible');
    assert.ok(v.face20 && v.face20.indexOf('die-row-pickable') !== -1, 'face 20 must be Strengthen-eligible');
    await page.close();
  });

  await runTest('F13 Load offer is 3 mods, excluding the anchor', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openDieActionScreen('reward');
      dieActionChooseLoad();
      return dieActionMods.slice();
    });
    assert.strictEqual(v.length, 3);
    assert.strictEqual(v.indexOf('consecrate'), -1, 'the anchor must never appear in a Load offer');
    await page.close();
  });

  // ---------------------------------------------------------------
  // F19/F22/F23 — the enemy half, driven from the boss fight (three
  // loaded poison faces plus both Nat faces — see F21).
  // ---------------------------------------------------------------
  await runTest('F19 enemy poison buff applies GAME_CONFIG.ENEMY_BUFF_POISON_STACKS', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const before = await page.evaluate(() => gameState.player.poisonStacks);
    await page.evaluate(() => { forceEnemyRoll(5); }); // boss face 5 = enemy_buff_poison
    const v = await page.evaluate(() => ({ cfg: GAME_CONFIG.ENEMY_BUFF_POISON_STACKS, stacks: gameState.player.poisonStacks }));
    specOnlyEqual(v.cfg, 3, 'F19: GAME_CONFIG.ENEMY_BUFF_POISON_STACKS === 3 (documented fact, no independent oracle)');
    assert.strictEqual(v.stacks - before, 3, 'a real forced enemy poison-buff roll must actually apply 3 stacks (act 1)');
    await page.close();
  });

  await runTest('F23 enemy Nat 1: cancels attack, flat self-poison, once per fight', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const enemyBefore = await page.evaluate(() => gameState.enemy.poisonStacks);
    await page.evaluate(() => { forceEnemyRoll(1); }); // boss face 1 = ENEMY_NAT_ONE
    const first = await page.evaluate(() => ({
      cfg: GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON,
      stacks: gameState.enemy.poisonStacks,
      cancelled: gameState.turn.enemyAttackCancelledThisTurn,
      fired: gameState.enemy.natOneFiredThisFight
    }));
    specOnlyEqual(first.cfg, 5, 'F23: GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON === 5 (documented fact, no independent oracle)');
    assert.strictEqual(first.stacks - enemyBefore, 5, 'a real forced enemy Nat 1 must actually self-poison 5 stacks');
    assert.strictEqual(first.cancelled, true);
    assert.strictEqual(first.fired, true);

    await page.evaluate(() => { nextPhase(); }); // ENEMY_ROLL_PHASE -> ENEMY_ACT_PHASE (returns early, cancelled)
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const beforeSecond = await page.evaluate(() => gameState.enemy.poisonStacks);
    await page.evaluate(() => { forceEnemyRoll(1); });
    const second = await page.evaluate(() => ({ stacks: gameState.enemy.poisonStacks, cancelled: gameState.turn.enemyAttackCancelledThisTurn }));
    assert.strictEqual(second.stacks, beforeSecond, 'once per fight — a second Nat 1 must not self-poison again');
    assert.strictEqual(second.cancelled, false, 'once per fight — a second Nat 1 must not cancel the attack again');
    await page.close();
  });

  await browser.close();

  // ---------------------------------------------------------------
  // F26 — files under /js/: fifteen, in the documented order. Filesystem
  // fact, checked from Node directly rather than through a page.
  // ---------------------------------------------------------------
  await runTest('F26 fifteen files under /js/, in load order', async () => {
    const expected = ['config', 'state', 'listener-registry', 'audio', 'pipeline', 'cards-mods', 'run-and-map', 'phase-machine', 'rendering', 'render-fight', 'render-map', 'render-layers', 'render-text', 'dev-tools', 'bootstrap'];
    const actual = fs.readdirSync(path.resolve(__dirname, '..', 'js')).filter(function(f) { return f.endsWith('.js'); }).map(function(f) { return f.replace(/\.js$/, ''); });
    assert.strictEqual(actual.length, 15);
    expected.forEach(function(name) { assert.ok(actual.indexOf(name) !== -1, 'missing js/' + name + '.js'); });
    const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
    const order = (html.match(/<script src="js\/([a-z-]+)\.js"><\/script>/g) || []).map(function(tag) { return tag.match(/js\/([a-z-]+)\.js/)[1]; });
    assert.deepStrictEqual(order, expected, 'index.html script tag order must match the documented load order, config.js first');
  });

  // ---------------------------------------------------------------
  // BUILD 122 (KI-18): the on-screen build stamp goes stale because
  // nothing ever failed when a build forgot to bump it — the standing
  // CLAUDE.md instruction alone already failed twice (BUILD 116, BUILD
  // 118). This test makes a forgotten bump a failing test instead: it
  // reads GAME_CONFIG.BUILD (config.js) and independently reads CLAUDE.md's
  // own CONFIRMED WORKING section, extracts every "(BUILD nnn)" it names,
  // and asserts the highest one matches. Two independently hand-authored
  // sources, not a comparison of GAME_CONFIG against itself.
  // ---------------------------------------------------------------
  await runTest('KI-18: GAME_CONFIG.BUILD matches the newest CONFIRMED WORKING entry', async () => {
    const configSrc = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'config.js'), 'utf8');
    const buildMatch = configSrc.match(/BUILD:\s*(\d+)/);
    assert.ok(buildMatch, 'GAME_CONFIG.BUILD not found in config.js');
    const configBuild = parseInt(buildMatch[1], 10);

    const claudeMd = fs.readFileSync(path.resolve(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const startIdx = claudeMd.indexOf('# CONFIRMED WORKING');
    const endIdx = claudeMd.indexOf('# CURRENT SUBSTAGE');
    assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'CONFIRMED WORKING / CURRENT SUBSTAGE section markers not found in CLAUDE.md');
    const confirmedWorkingSection = claudeMd.slice(startIdx, endIdx);
    const buildNumbers = Array.from(confirmedWorkingSection.matchAll(/\(BUILD (\d+)\)/g)).map(function(m) { return parseInt(m[1], 10); });
    assert.ok(buildNumbers.length > 0, 'no "(BUILD nnn)" entries found in CONFIRMED WORKING');
    const newestDocumented = Math.max.apply(null, buildNumbers);

    assert.strictEqual(configBuild, newestDocumented, 'GAME_CONFIG.BUILD (' + configBuild + ') must match the newest CONFIRMED WORKING entry (BUILD ' + newestDocumented + ') — a forgotten stamp bump');

    // The shared `browser` above is already closed by this point (F26 runs
    // after it) — a short-lived browser of its own, same launch path every
    // other test file uses.
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const rendered = await page.evaluate(() => ({ cfg: GAME_CONFIG.BUILD, dom: document.getElementById('buildStampNumber').textContent }));
    assert.strictEqual(rendered.cfg, configBuild, 'GAME_CONFIG.BUILD read live must match the static file read');
    assert.strictEqual(parseInt(rendered.dom, 10), configBuild, 'on-screen build stamp must render GAME_CONFIG.BUILD, not a hand-typed number');
    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 125 (F31, checkpoint 2): per-act enemy HP/intent multipliers,
  // applied at enemy-slot creation (buildAct(), run-and-map.js) with
  // Math.ceil, and the enemy buff's own poison amount riding the intent
  // multiplier the same way. Reads buildAct() directly (it's a real,
  // page-global function, not a second hand-typed copy of its output) for
  // three different act numbers and checks the documented numbers exactly.
  // ---------------------------------------------------------------
  await runTest('F31: enemy HP/intent and the poison-buff amount scale per act with Math.ceil, act 1 unchanged', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const acts = await page.evaluate(() => ({ act1: buildAct(1), act2: buildAct(2), act3: buildAct(3) }));
    await liveBrowser.close();

    assert.strictEqual(acts.act2.opening.enemy.hp, 70, 'act 2 opening HP must be ceil(50*1.4)=70');
    assert.strictEqual(acts.act3.boss.enemy.hp, 190, 'act 3 boss HP must be ceil(100*1.9)=190');
    assert.strictEqual(acts.act3.upper[2].enemy.hp, 162, 'act 3\'s 85-HP normal must become ceil(85*1.9)=162');
    assert.strictEqual(acts.act2.boss.enemy.buffPoisonStacks, 4, 'act 2 enemy buff must apply ceil(3*1.2)=4 stacks of poison');
    assert.strictEqual(acts.act3.boss.enemy.buffPoisonStacks, 5, 'act 3 enemy buff must apply ceil(3*1.45)=5 stacks of poison');

    // Act 1's own HP multiplier is still 1.0, but BUILD 142 (item A) gave
    // its five lane-fight positions their own fixed HP (ACT1_LANE_FIGHT_HP)
    // instead of the old three-value NORMAL_FIGHT_HP rotation — updated
    // here under BUILD 142's own test rule (item A deliberately changes
    // this). The opening/elite/boss HP figures are still unchanged.
    // BUILD 142 (item B) also drops the old flat boss intentMin/intentMax
    // assertions: every enemy now acts from a literal, final-numbers
    // pattern (GAME_CONFIG.ENEMIES) that ACT_INTENT_MULTIPLIER no longer
    // scales, so a boss's intentMin/intentMax are now purely derived
    // display bounds (patternBounds(), run-and-map.js), not a scaled band —
    // checked against the Hierophant's own pattern instead.
    assert.strictEqual(acts.act1.opening.enemy.hp, 50, 'act 1 opening HP must be unchanged');
    assert.strictEqual(acts.act1.upper[0].enemy.hp, 58, 'act 1 lane position 1 HP must be ACT1_LANE_FIGHT_HP[0] (58)');
    assert.strictEqual(acts.act1.upper[2].enemy.hp, 65, 'act 1 lane position 2 HP must be ACT1_LANE_FIGHT_HP[1] (65)');
    // D-123 (BUILD 169): act 1's ninth slot at index 4 moves positions 3/4 to indices 6/7.
    assert.strictEqual(acts.act1.upper[6].enemy.hp, 78, 'act 1 lane position 3 HP must be ACT1_LANE_FIGHT_HP[2] (78)');
    assert.strictEqual(acts.act1.upper[7].enemy.hp, 85, 'act 1 lane position 4 HP must be ACT1_LANE_FIGHT_HP[3] (85)');
    assert.strictEqual(acts.act1.upper[3].enemy.hp, 100, 'act 1 elite HP must be unchanged');
    assert.strictEqual(acts.act1.boss.enemy.hp, 100, 'act 1 boss HP must be unchanged');
    assert.strictEqual(acts.act1.boss.enemy.name, 'Hierophant', 'act 1 boss must be the Hierophant');
    assert.ok(acts.act1.boss.enemy.pattern.length > 0, 'act 1 boss must carry a non-empty pattern');
    assert.strictEqual(acts.act1.boss.enemy.buffPoisonStacks, 3, 'act 1 enemy buff must still apply the flat 3 stacks of poison');
  });

  // ---------------------------------------------------------------
  // BUILD 125 (F32, checkpoint 2): beating the act 1 or act 2 boss grants a
  // reward flow (die action + card reward) exactly like any other fight
  // win, then starts the next act — no map screen with nothing left on it,
  // no VICTORY yet. Only the act 3 boss is VICTORY, with no reward (D-22).
  // Forces each boss win the same real-code-path way every other win test
  // in this file does (updateEnemy({hp:0}); nextPhase(); — runPhase()'s own
  // top-of-function win guard), then skips through whatever reward panels
  // appear exactly as a player Skip-clicking would (same loop shape as the
  // KI-9 test above).
  // ---------------------------------------------------------------
  await runTest('F32: acts 1-2 boss wins grant a reward and start the next act; only act 3 is VICTORY', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);

    async function skipThroughRewardFlow() {
      for (let i = 0; i < 5; i++) {
        const s = await page.evaluate(() => ({ artifactRewardStep: artifactRewardStep, dieActionStep: dieActionStep, cardRewardStep: cardRewardStep }));
        if (s.artifactRewardStep !== null) { await page.evaluate(() => { artifactRewardSkip(); }); continue; }
        if (s.dieActionStep !== null) { await page.evaluate(() => { dieActionChooseSkip(); }); continue; }
        if (s.cardRewardStep !== null) { await page.evaluate(() => { cardRewardSkip(); }); continue; }
        break;
      }
    }

    // Act 1 boss — BUILD 150: a non-final Boss win opens the artifact reward
    // panel first (same as an Elite win), then the die action panel.
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const afterAct1Boss = await page.evaluate(() => ({ outcome: gameState.run.outcome, artifactRewardStep: artifactRewardStep, dieActionStep: dieActionStep }));
    assert.notStrictEqual(afterAct1Boss.outcome, 'won', 'act 1 boss win must not end the run');
    assert.ok(afterAct1Boss.artifactRewardStep !== null || afterAct1Boss.dieActionStep !== null, 'act 1 boss win must open the artifact or die action reward panel, same as any fight win');
    await skipThroughRewardFlow();
    const afterAct1Flow = await page.evaluate(() => ({ actNumber: gameState.run.actNumber, currentSlot: gameState.run.currentSlot, lane: gameState.run.lane, bossCompleted: gameState.run.act.boss.completed, outcome: gameState.run.outcome }));
    assert.strictEqual(afterAct1Flow.actNumber, 2, "closing act 1's boss reward flow must start act 2");
    assert.strictEqual(afterAct1Flow.currentSlot, 'opening', 'act 2 must open on its own opening fight');
    assert.strictEqual(afterAct1Flow.lane, null, 'act 2 must start with no lane committed');
    assert.strictEqual(afterAct1Flow.bossCompleted, false, "act 2 is a fresh map — its boss must not already read completed");
    assert.strictEqual(afterAct1Flow.outcome, 'active', 'run must still be active after act 1');

    // Act 2 boss.
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const afterAct2Boss = await page.evaluate(() => ({ outcome: gameState.run.outcome, artifactRewardStep: artifactRewardStep, dieActionStep: dieActionStep }));
    assert.notStrictEqual(afterAct2Boss.outcome, 'won', 'act 2 boss win must not end the run either');
    assert.ok(afterAct2Boss.artifactRewardStep !== null || afterAct2Boss.dieActionStep !== null, 'act 2 boss win must also open a reward panel');
    await skipThroughRewardFlow();
    const afterAct2Flow = await page.evaluate(() => gameState.run.actNumber);
    assert.strictEqual(afterAct2Flow, 3, "closing act 2's boss reward flow must start act 3, the final act");

    // Act 3 boss — the final one: true VICTORY, no reward panel at all.
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const afterAct3Boss = await page.evaluate(() => ({ outcome: gameState.run.outcome, dieActionStep: dieActionStep, cardRewardStep: cardRewardStep }));
    assert.strictEqual(afterAct3Boss.outcome, 'won', "act 3 boss win must be the run's true VICTORY (D-22)");
    assert.strictEqual(afterAct3Boss.dieActionStep, null, 'act 3 boss win grants no die reward (D-22)');
    assert.strictEqual(afterAct3Boss.cardRewardStep, null, 'act 3 boss win grants no card reward (D-22)');

    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 126 (D-54), revised at BUILD 127: pool exhaustion stopgap. Once
  // fewer than three unloaded, non-anchor mods remain, a real 3-mod Load
  // offer can no longer be built — the die action panel's 'choose' step
  // now simply never renders a Load button in that state (only Strengthen
  // and Skip), so Load can never be reached through the real UI at all.
  // (BUILD 126's first version instead let dieActionChooseLoad() convert to
  // Strengthen at click time — technically correct but never surfaced to a
  // player as "Load is gone," and the bot, which calls functions directly
  // rather than clicking DOM buttons, had no way to know the conversion had
  // silently happened; fixed here to hide the button as the single source
  // of truth, with the bot's own policy — tests/autoplay.js — updated to
  // check the identical eligibleLoadModIds() count before ever calling
  // dieActionChooseLoad(), the same real crash this exact gap caused during
  // BUILD 127's three-act baseline run.)
  // Checkpoint 3, the remaining Bound pieces (BUILD 134): twenty-four
  // loadable mods now (up from twenty-two — two new: Concord, Herald), so
  // twenty-two of them must be loaded directly (updateDie(), Law
  // A3-compliant — not through the real Load flow, which would itself be
  // blocked by this same fix once the pool got this low) to leave exactly
  // two unloaded (penance, vigil) — one short of the
  // eligibleLoadModIds().length < 3 trigger. Only seventeen faces exist to
  // carry a modId (2-9, 11-19), so five of them also carry a modId2 (a face
  // can hold up to two mods — MULTI-MOD FACES, CLAUDE.md) to fit all
  // twenty-two loaded mods.
  // ---------------------------------------------------------------
  await runTest('D-54: with fewer than three unloaded mods left, the die action panel shows Strengthen, not Load', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page); // #dieActionPanel/dieActionStep exist regardless of screen, but this matches every other die-action test's setup
    const seventeenLoadedMods = ['fervour', 'sanctuary', 'virulence', 'smite', 'blight', 'elevation', 'zeal', 'offering', 'anthem', 'ordain', 'largesse', 'tithe', 'congregation', 'cope', 'anathema', 'thurible', 'magnificat'];
    const secondSlotMods = ['unison', 'accord', 'kinship', 'concord', 'herald', 'dread', 'genuflect'];
    await page.evaluate(({ modIds, secondSlotModIds }) => {
      const newFaces = gameState.die.faces.slice();
      // Faces 2-9, 11-19 (0-indexed 1-8, 10-18) — seventeen blank faces,
      // every face except 1 (NAT_ONE), 10 (consecrate, the anchor) and 20
      // (NAT_TWENTY). The first seven of those also take a modId2, to fit
      // all twenty-four loaded mods onto seventeen faces.
      const targetIndices = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18];
      targetIndices.forEach(function(idx, i) {
        newFaces[idx] = Object.assign({}, newFaces[idx], { modId: modIds[i] });
      });
      secondSlotModIds.forEach(function(modId, i) {
        const idx = targetIndices[i];
        newFaces[idx] = Object.assign({}, newFaces[idx], { modId2: modId });
      });
      updateDie({ faces: newFaces });
    }, { modIds: seventeenLoadedMods, secondSlotModIds: secondSlotMods });

    const eligibleBefore = await page.evaluate(() => eligibleLoadModIds());
    assert.deepStrictEqual(eligibleBefore.sort(), ['penance', 'vigil'], 'test setup: exactly two loadable mods (penance, vigil) must remain unloaded');

    const buttons = await page.evaluate(() => {
      openDieActionScreen('reward');
      return Array.from(document.querySelectorAll('#dieActionPanel button')).map(function(b) { return b.textContent; });
    });
    assert.strictEqual(buttons.indexOf('Load'), -1, 'the Load button must not render at all once fewer than 3 unloaded mods remain: ' + JSON.stringify(buttons));
    assert.ok(buttons.indexOf('Strengthen') !== -1, 'Strengthen must still render: ' + JSON.stringify(buttons));
    assert.ok(buttons.indexOf('Skip') !== -1, 'Skip must still render: ' + JSON.stringify(buttons));

    // Defence in depth: dieActionChooseLoad() itself must still refuse to
    // build a short offer even if something calls it directly (the button
    // is hidden, but nothing stops a stale caller reaching the function) —
    // converts to Strengthen exactly like the hidden button's absence
    // implies it should.
    const afterDirectCall = await page.evaluate(() => { dieActionChooseLoad(); return { dieActionStep: dieActionStep, dieActionMods: dieActionMods.slice() }; });
    assert.strictEqual(afterDirectCall.dieActionStep, 'strengthen_pick_face', 'dieActionChooseLoad() called directly with fewer than 3 unloaded mods must still convert to Strengthen: ' + JSON.stringify(afterDirectCall));
    assert.deepStrictEqual(afterDirectCall.dieActionMods, [], 'no Load offer (short or otherwise) may be built even on a direct call: ' + JSON.stringify(afterDirectCall));

    await liveBrowser.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' facts tests passed.');
  // BUILD 112 (KI-14): the pass count above includes SPEC-ONLY assertions —
  // ones whose only check is a documented FACTS number against GAME_CONFIG
  // (or a value one-to-one derived from it), never against anything the
  // running game actually does. Reported separately so a clean pass count
  // is never read as "every fact was behaviourally verified."
  const specOnlyTests = Array.from(new Set(specOnlyChecks.map(c => c.test)));
  console.log(specOnlyChecks.length + ' assertion(s) across ' + specOnlyTests.length + ' test(s) are SPEC-ONLY (comment/config comparison only, no independent behavioural check):');
  specOnlyTests.forEach(t => console.log('  - ' + t));
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
    process.exit(1);
  }
  process.exit(0);
})();
