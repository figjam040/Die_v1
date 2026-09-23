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

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

const results = [];
let currentTestName = null;
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
async function runTest(name, fn) {
  currentTestName = name;
  try {
    await fn();
    results.push({ name, pass: true });
    console.log('PASS — ' + name);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log('FAIL — ' + name + ': ' + err.message);
  }
  currentTestName = null;
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

  await runTest('F16 lanes 2, slots per lane 8, three rites per lane, elite at slot 4 of the upper lane', async () => {
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
      upperRiteLabels: GAME_CONFIG.RITE_SLOT_INDICES.map(function(i) { return gameState.run.act.upper[i].label; }),
      lowerRiteLabels: GAME_CONFIG.RITE_SLOT_INDICES.map(function(i) { return gameState.run.act.lower[i].label; }),
      upperFightCount: gameState.run.act.upper.filter(function(s) { return s.type === 'fight'; }).length,
      lowerFightCount: gameState.run.act.lower.filter(function(s) { return s.type === 'fight'; }).length,
      lowerEventCount: gameState.run.act.lower.filter(function(s) { return s.type === 'event'; }).length,
      upperLabels: gameState.run.act.upper.map(function(s) { return s.label; }),
      lowerLabels: gameState.run.act.lower.map(function(s) { return s.label; })
    }));
    specOnlyEqual(v.laneCount, 2, 'F16: GAME_CONFIG.LANE_COUNT === 2 (documented fact, no independent oracle)');
    specOnlyEqual(v.slotsPerLane, 8, 'F16: GAME_CONFIG.SLOTS_PER_LANE === 8 (documented fact, no independent oracle)');
    assert.strictEqual(v.upperLen, 8);
    assert.strictEqual(v.lowerLen, 8);
    assert.deepStrictEqual(v.allowed, [3], 'F16: the elite is slot 4 of the upper lane (0-based index 3), not a range');
    assert.strictEqual(v.eliteIndex, 3);
    assert.strictEqual(v.upperEliteLabel, 'Elite');
    assert.strictEqual(v.lowerHasElite, false, 'the elite sits on one lane only, per D-23');
    assert.deepStrictEqual(v.riteIndices, [1, 4, 7], 'F16: three rites per lane, at slots 2, 5 and 8 (1-based)');
    assert.deepStrictEqual(v.upperRiteLabels, ['Rite', 'Rite', 'Rite']);
    assert.deepStrictEqual(v.lowerRiteLabels, ['Rite', 'Rite', 'Rite']);
    // BUILD 151 (F44): the upper lane is still 7 fights — the opening
    // fight, 5 fights/elite in the lane (8 slots minus 3 rites), the boss.
    // The lower lane's slot index 3 is now the event (The Font), so its
    // lane holds 4 fights, 6 through that lane's own path.
    assert.strictEqual(v.upperFightCount, 5);
    assert.strictEqual(v.lowerFightCount, 4);
    assert.strictEqual(v.lowerEventCount, 1);
    assert.deepStrictEqual(v.upperLabels, ['Fight', 'Rite', 'Fight', 'Elite', 'Rite', 'Fight', 'Fight', 'Rite']);
    assert.deepStrictEqual(v.lowerLabels, ['Fight', 'Rite', 'Fight', 'Event', 'Rite', 'Fight', 'Fight', 'Rite']);
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

  await runTest('BUILD 151 (F44): the upper path is still 7 fights an act (21 a run); the lower path, through the event slot, is 6 (18 a run)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      function fightsInPath(lane) {
        return 1 /* opening */ + gameState.run.act[lane].filter(function(s) { return s.type === 'fight'; }).length + 1 /* boss */;
      }
      return { upper: fightsInPath('upper'), lower: fightsInPath('lower'), acts: GAME_CONFIG.ACTS };
    });
    assert.strictEqual(v.upper, 7);
    assert.strictEqual(v.lower, 6);
    assert.strictEqual(v.upper * v.acts, 21);
    assert.strictEqual(v.lower * v.acts, 18);
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
    specOnlyDeepEqual(cfg.ACT1_LANE_FIGHT_HP, [58, 65, 72, 78, 85], 'F17: GAME_CONFIG.ACT1_LANE_FIGHT_HP === [58,65,72,78,85] (documented fact, no independent oracle)');
    assert.strictEqual(act.upper[0].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[0]);
    assert.strictEqual(act.upper[2].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[1]);
    assert.strictEqual(act.lower[0].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[0]);
    assert.strictEqual(act.lower[2].enemy.hp, cfg.ACT1_LANE_FIGHT_HP[1]);
    // BUILD 151 (F44): lower[3] is now the event slot (The Font), not a
    // fight — ACT1_LANE_FIGHT_HP[2] (72) is no longer consumed anywhere.
    assert.strictEqual(act.lower[3].type, 'event');
    assert.strictEqual(act.lower[3].label, 'Event');
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
    specOnlyEqual(v.riteCost, 2, 'F08: rite soulCost === 2 (documented fact, no independent oracle)'); assert.strictEqual(v.riteDamage, 5, 'rite.effect() must actually deal 5 damage'); assert.strictEqual(v.riteBlock, 6, 'rite.effect() must actually grant 6 block');
    await page.close();
  });

  await runTest('F09 poison decays N then N-1, ticked at START_OF_TURN', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ poisonStacks: 6 }); });
    await advanceUntilPhase(page, 'CHECK_WIN_LOSS');
    const before = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { nextPhase(); }); // CHECK_WIN_LOSS -> START_OF_TURN, poison ticks inline
    await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN' || gameState.turn.phase === 'ROLL_PHASE');
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
    await page.evaluate(() => { openDieActionScreen(); dieActionChooseStrengthen(); });
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
      openDieActionScreen();
      dieActionChooseLoad();
      return dieActionMods.slice();
    });
    assert.strictEqual(v.length, 3);
    assert.strictEqual(v.indexOf('consecrate'), -1, 'the anchor must never appear in a Load offer');
    await page.close();
  });

  // ---------------------------------------------------------------
  // BUILD 116 — the second-slot gate removed. A Load offer may now target
  // an already-loaded (non-Nat, not-yet-full) face at any point in a run,
  // not only once no blank face remains.
  // ---------------------------------------------------------------

  await runTest('BUILD 116: Load offer includes an already-loaded face while blank faces still exist', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' }); // face 2 — one slot loaded, one free
      updateDie({ faces: newFaces });
      const blankExists = gameState.die.faces.some(function(f) { return f.modId === null; });
      openDieActionScreen();
      dieActionChooseLoad();
      dieActionPickMod(dieActionMods[0]);
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const face2Row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      return { blankExists: blankExists, face2Classes: face2Row ? face2Row.className : null };
    });
    assert.ok(v.blankExists, 'test assumes blank faces remain elsewhere on the die (only face 2 and the anchor are loaded)');
    assert.ok(v.face2Classes && v.face2Classes.indexOf('die-row-pickable') !== -1, 'an already-loaded, non-full face must be a valid Load target while blanks remain: ' + v.face2Classes);
    await page.close();
  });

  await runTest('BUILD 116: the cap still refuses a third mod (a full face is never a Load target)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight' }); // face 2 — both slots full
      updateDie({ faces: newFaces });
      openDieActionScreen();
      dieActionChooseLoad();
      dieActionPickMod(dieActionMods[0]);
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const face2Row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      return face2Row ? face2Row.className : null;
    });
    assert.ok(v && v.indexOf('die-row-pick-inert') !== -1, 'a face already holding two mods must never be Load-eligible: ' + v);
    await page.close();
  });

  await runTest('BUILD 116: the Load offer still excludes the anchor, gate removed or not', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // Load a couple of mods first so the die is a realistic mid-run mix
      // of loaded/blank faces, not just the fresh starting die.
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' });
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'blight' });
      updateDie({ faces: newFaces });
      openDieActionScreen();
      dieActionChooseLoad();
      return dieActionMods.slice();
    });
    assert.strictEqual(v.indexOf('consecrate'), -1, 'the anchor must never appear in a Load offer, regardless of how many faces are already loaded');
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

  await runTest('F22 enemy Nat 20 repeatable — every loaded buff triggers each time', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const before1 = await page.evaluate(() => gameState.player.poisonStacks);
    await page.evaluate(() => { forceEnemyRoll(20); }); // boss face 20 = ENEMY_NAT_TWENTY
    const after1 = await page.evaluate(() => gameState.player.poisonStacks);
    assert.strictEqual(after1 - before1, 9, 'three loaded poison faces (3 stacks each, act 1) must all trigger once, ascending');

    await page.evaluate(() => { nextPhase(); }); // ENEMY_ROLL_PHASE -> ENEMY_ACT_PHASE
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const before2 = await page.evaluate(() => gameState.player.poisonStacks);
    await page.evaluate(() => { forceEnemyRoll(20); });
    const after2 = await page.evaluate(() => gameState.player.poisonStacks);
    assert.strictEqual(after2 - before2, 9, 'enemy Nat 20 must trigger the same three faces again next round — repeatable');
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

  // ---------------------------------------------------------------
  // BUILD 139 (enemy readability): the fight panel title/mark — ENEMY (no
  // mark) for a normal fight, ELITE (star) for the elite, BOSS (skull) for
  // the boss — driven from gameState.enemy.id (beginFightFromSlot()).
  // ---------------------------------------------------------------
  await runTest('BUILD 139: fight panel title reads ENEMY/ELITE/BOSS with the right mark for each fight type', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');

    await page.evaluate(() => { devJumpToSlot('upper', 0); }); // upper[0] === 'Fight' (F16)
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const normalTitle = await page.evaluate(() => document.getElementById('enemyPanelTitle').textContent);
    assert.strictEqual(normalTitle, 'ENEMY', 'a normal fight must show ENEMY with no mark');

    await page.evaluate(() => { devJumpToSlot('upper', 3); }); // upper[3] === 'Elite' (F16)
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const eliteTitle = await page.evaluate(() => document.getElementById('enemyPanelTitle').textContent);
    assert.strictEqual(eliteTitle, 'ELITE ★', 'an elite fight must show ELITE with a star mark');

    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const bossTitle = await page.evaluate(() => document.getElementById('enemyPanelTitle').textContent);
    assert.strictEqual(bossTitle, 'BOSS ☠', 'a boss fight must show BOSS with a skull mark');
    await page.close();
  });

  // ---------------------------------------------------------------
  // BUILD 139: the enemy poison face's hover text names the real,
  // act-scaled stack count — read live off buildAct()'s own output, never
  // a second hand-typed copy of the per-act numbers (F31 already covers
  // the numbers themselves; this covers the hover text stating them).
  // ---------------------------------------------------------------
  await runTest('BUILD 139: the poison face hover text names the right stack count in each of the three acts', async () => {
    const page = await freshPage(browser);
    const perAct = await page.evaluate(() => {
      return [1, 2, 3].map(function(actNumber) {
        const act = buildAct(actNumber);
        const poisonFace = act.boss.enemy.die.faces.find(function(f) { return f.modId === 'enemy_buff_poison'; });
        return { actNumber: actNumber, stacks: act.boss.enemy.buffPoisonStacks, text: faceHoverText(poisonFace, act.boss.enemy.buffPoisonStacks) };
      });
    });
    await page.close();
    perAct.forEach(function(v) {
      assert.ok(v.text && v.text.indexOf(String(v.stacks)) !== -1, 'act ' + v.actNumber + ' poison face hover must name ' + v.stacks + ' — got: ' + v.text);
    });
    assert.deepStrictEqual(perAct.map(function(v) { return v.stacks; }), [3, 4, 5], 'the three acts must scale 3/4/5, per F31');
  });

  // ---------------------------------------------------------------
  // BUILD 139: every loaded enemy face (poison + both Nats) has non-empty
  // hover text, both live in a fight (enemyDieList) and on the map's own
  // elite/boss die previews.
  // ---------------------------------------------------------------
  await runTest('BUILD 139: every loaded enemy face has non-empty hover text, in a fight and on the map preview', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const fightHoverEmpty = await page.evaluate(() => {
      // The enemy die column's rows render face 20 down to face 1 (CSS
      // column-reverse), not the ascending order gameState.enemy.die.faces
      // itself is stored in — key off each row's own .face-num text, never
      // its position in the row list.
      const rows = Array.from(document.getElementById('enemyDieList').querySelectorAll('.die-row'));
      const facesByNumber = {};
      gameState.enemy.die.faces.forEach(function(f) { facesByNumber[f.number] = f; });
      const empties = [];
      rows.forEach(function(row) {
        const faceNumber = parseInt(row.querySelector('.face-num').textContent, 10);
        const face = facesByNumber[faceNumber];
        if (face.modId === null) return; // blank faces carry no hover, by design
        const tip = row.querySelector('.hover-tip');
        if (!tip || !tip.textContent) { empties.push(face.number); }
      });
      return empties;
    });
    assert.deepStrictEqual(fightHoverEmpty, [], 'every loaded boss face must show non-empty hover text in the fight panel');

    // D-98 (BUILD 156): the map no longer draws the elite/boss die out in
    // full — hovering the Elite/Boss node itself shows the same summary
    // (name, HP, pattern, loaded faces) as one hover-tip on that node.
    const mapHoverText = await page.evaluate(() => {
      const eliteNode = Array.from(document.querySelectorAll('#mapScreen .map-node-choice, #mapScreen .map-node-inert, #mapScreen .map-node-completed, #mapScreen .map-node-current'))
        .find(function(n) { return n.childNodes[0] && n.childNodes[0].textContent === 'Elite'; });
      const bossNode = document.querySelector('#mapScreen .map-node-boss');
      return {
        elite: eliteNode ? (eliteNode.querySelector('.hover-tip') || {}).textContent : null,
        boss: bossNode ? (bossNode.querySelector('.hover-tip') || {}).textContent : null
      };
    });
    assert.ok(mapHoverText.elite, 'the Elite node must carry non-empty hover text');
    assert.ok(mapHoverText.boss, 'the Boss node must carry non-empty hover text');
    await page.close();
  });

  // ---------------------------------------------------------------
  // BUILD 109 — the run record. Not an F-number (nothing on the Notion
  // page names this), so these are named descriptively rather than F-NN,
  // matching this file's own convention for non-fact behavioural checks.
  // ---------------------------------------------------------------

  await runTest('Run record: a Load offer and its pick are both recorded', async () => {
    const page = await freshPage(browser);
    const result = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad();
      const offeredMods = dieActionMods.slice();
      const chosenMod = offeredMods[0];
      dieActionPickMod(chosenMod);
      dieActionPickLoadFace(2); // face 2 is blank on a fresh die
      return { events: gameState.runRecord.dieActionEvents.slice(), offeredMods, chosenMod };
    });
    assert.strictEqual(result.events.length, 1, 'expected exactly one recorded die-action event');
    assert.strictEqual(result.events[0].type, 'load');
    assert.deepStrictEqual(result.events[0].offered, result.offeredMods, 'the offer itself must be recorded verbatim');
    assert.strictEqual(result.events[0].picked, result.chosenMod, 'the pick must be recorded against that same offer');
    await page.close();
  });

  await runTest('Run record: a Skip is recorded as a skip', async () => {
    const page = await freshPage(browser);
    const events = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseSkip();
      return gameState.runRecord.dieActionEvents.slice();
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'skip');
    await page.close();
  });

  await runTest('Run record: a mod in a second slot records its own trigger count', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page, 'CARD_PHASE');
    const counts = await page.evaluate(() => collectTriggerCountsByMod());
    assert.strictEqual(counts.smite, 1, 'expected the first-slot mod (smite) to have its own count');
    assert.strictEqual(counts.blight, 1, 'expected the second-slot mod (blight) to have its own, independent count');
    await page.close();
  });

  // ---------------------------------------------------------------
  // BUILD 118 (KI-19 fix) — collectTriggerCountsByMod() used to OVERWRITE
  // a mod's count with whichever face was processed last instead of
  // summing across every face carrying it. The real Load flow can never
  // produce a die with the same mod on two faces (it excludes any mod
  // already on the die), but devLoadMod() (the dev tool) has no such
  // guard, so these tests build that shape directly via updateDie(), the
  // same way a real test die reached it.
  // ---------------------------------------------------------------

  await runTest('BUILD 118: a mod on more than one face sums across those faces', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      // Blight on three faces (2, 3, 4), each with a different trigger
      // count — must sum to 1+2+4=7, not report just one face's value.
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'blight', modData: { triggerCount: 1 } });
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'blight', modData: { triggerCount: 2 } });
      newFaces[3] = Object.assign({}, newFaces[3], { modId: 'blight', modData: { triggerCount: 4 } });
      updateDie({ faces: newFaces });
      return collectTriggerCountsByMod();
    });
    assert.strictEqual(counts.blight, 7, 'expected 1 + 2 + 4 = 7, summed across all three faces, not just the last one processed');
    await page.close();
  });

  await runTest('BUILD 118: a mod in a second slot is counted toward the same sum as the first slot', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      // Consecrate (the anchor, always modId on face 10) plus a second
      // face where consecrate sits in the SECOND slot (modId2) — both
      // must add into the one consecrate total.
      newFaces[9] = Object.assign({}, newFaces[9], { modData: { triggerCount: 3 } }); // face 10, consecrate already modId
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite', modId2: 'consecrate', modData: { triggerCount: 0, triggerCount2: 5 } }); // face 5
      updateDie({ faces: newFaces });
      return collectTriggerCountsByMod();
    });
    assert.strictEqual(counts.consecrate, 8, 'expected 3 (first-slot, face 10) + 5 (second-slot, face 5) = 8');
    await page.close();
  });

  await runTest('BUILD 118: a mod on no face records zero rather than being omitted', async () => {
    const page = await freshPage(browser);
    const counts = await page.evaluate(() => collectTriggerCountsByMod());
    // A fresh die carries only the anchor (consecrate, face 10) — every
    // other real mod is on no face at all this run.
    assert.strictEqual(counts.elevation, 0, 'a mod never loaded this run must still appear, at 0, not be missing from the object');
    assert.ok(Object.prototype.hasOwnProperty.call(counts, 'elevation'), 'the key itself must exist, not just read as undefined');
    assert.strictEqual(Object.keys(counts).length, 27, 'expected all twenty-seven real mods present, every one of them, loaded or not');
    await page.close();
  });

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

  await runTest('Run record: an abandoned run keeps its offers', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // marks started:true, node:'opening'
    await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad(); // offer shown, never resolved
    });
    // BUILD 136: #startGameBtn now works even while a die-action panel is
    // open (its own click handler dismisses the panel, bootstrap.js) — this
    // test still calls flushRunRecord()/startNewRun() directly rather than
    // a UI click, since the realistic way this abandon shape happens is a
    // closed tab (beforeunload), not a New Run click; see the BUILD 136
    // tests below for New Run's own mid-panel behaviour.
    await page.evaluate(() => { flushRunRecord('abandoned'); startNewRun(); });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dieRunRecordLines') || '[]'));
    assert.strictEqual(stored.length, 1, 'expected exactly one flushed line');
    const cols = stored[0].split(',');
    // source,node,arrivalHpAtBoss,outcome,fightRounds,totalRounds,dieActionEvents,triggerCounts
    assert.strictEqual(cols[1], 'opening', 'node reached must be preserved');
    assert.strictEqual(cols[3], 'abandoned', 'outcome must read abandoned');
    assert.ok(cols[6].indexOf('load:') === 0, 'the shown-but-unresolved offer must survive the abandon flush: ' + cols[6]);
    await page.close();
  });

  await runTest('Run record: round counts are captured per fight and for the run', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Two full rounds (7 phases each, cycling back to ROLL_PHASE) driven
    // via the real nextPhase() — no shortcut.
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => { nextPhase(); });
    }
    const roundBeforeWin = await page.evaluate(() => gameState.turn.round);
    // Force the win directly (Law 3-compliant, via updateEnemy) rather than
    // grinding out real damage — nextPhase() then hits runPhase()'s own
    // top-of-function win guard, the exact same real code path a genuine
    // kill uses, on whichever phase happens to come next.
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const fightRounds = await page.evaluate(() => gameState.runRecord.fightRounds.slice());
    assert.strictEqual(fightRounds.length, 1, 'expected exactly one completed-fight entry');
    assert.strictEqual(fightRounds[0].rounds, roundBeforeWin, 'the completed fight\'s own round count must match turn.round at the moment it ended');
    const line = await page.evaluate(() => buildRunRecordLine());
    const totalRoundsCol = Number(line.split(',')[5]);
    assert.strictEqual(totalRoundsCol, roundBeforeWin, 'total rounds (one fight so far) must equal that fight\'s own round count');
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

  // ---------------------------------------------------------------
  // BUILD 117 — two-mod row (side by side, not stacked), full mod-pool
  // hover coverage, and the twenty-row column with a two-mod face present.
  // ---------------------------------------------------------------

  await runTest('BUILD 117: a two-mod row renders both names and both counts', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // #playerDieList sits inside #fightScreen, hidden (display:none) on the map
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight', modData: { triggerCount: 4, triggerCount2: 9 } }); // face 2
      updateDie({ faces: newFaces });
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const row = rows.find(function(r) { return r.querySelector('.face-btn') && r.querySelector('.face-btn').textContent === '2'; });
      const names = Array.from(row.querySelectorAll('.die-mod')).map(function(el) { return el.textContent; });
      const counts = Array.from(row.querySelectorAll('.die-trigger-count-inline')).map(function(el) { return el.textContent; });
      // Both mods must be on the SAME line — one .die-mod-stack (the old,
      // now-removed vertical layout) would mean this build's fix regressed.
      const hasStack = !!row.querySelector('.die-mod-stack');
      return { names: names, counts: counts, hasStack: hasStack };
    });
    assert.deepStrictEqual(v.names, ['Smite', 'Blight'], 'both mod names must render, in load order');
    assert.deepStrictEqual(v.counts, ['#4', '#9'], 'each mod\'s own trigger count must render beside its own name');
    assert.strictEqual(v.hasStack, false, 'must not use the old vertical .die-mod-stack layout');
    await page.close();
  });

  await runTest('BUILD 117: every mod in the pool has a hover description', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const modIds = Object.keys(gameState.config.mods);
      const missing = modIds.filter(function(id) { return !MOD_DESCRIPTION[id]; });
      return { total: modIds.length, missing: missing };
    });
    assert.strictEqual(v.total, 27, 'expected twenty-seven real mods');
    assert.deepStrictEqual(v.missing, [], 'every mod must have a MOD_DESCRIPTION entry: missing ' + JSON.stringify(v.missing));
    await page.close();
  });

  await runTest('BUILD 117: the die column is still twenty rows with a two-mod face present, all rows the same height', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // #playerDieList sits inside #fightScreen, hidden (display:none) on the map
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId2: 'virulence', modData: { triggerCount: 15, triggerCount2: 27 } }); // face 10 (already Consecrate)
      updateDie({ faces: newFaces });
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const heights = rows.map(function(r) { return Math.round(r.getBoundingClientRect().height); });
      return { rowCount: rows.length, uniqueHeights: Array.from(new Set(heights)), heights: heights };
    });
    assert.strictEqual(v.rowCount, 20, 'die column must still be exactly twenty rows');
    assert.strictEqual(v.uniqueHeights.length, 1, 'every row must measure the same height, two-mod face included: ' + JSON.stringify(v.heights));
    await page.close();
  });

  await browser.close();

  // ---------------------------------------------------------------
  // F26 — files under /js/: eleven, in the documented order. Filesystem
  // fact, checked from Node directly rather than through a page.
  // ---------------------------------------------------------------
  await runTest('F26 eleven files under /js/, in load order', async () => {
    const expected = ['config', 'state', 'listener-registry', 'audio', 'pipeline', 'cards-mods', 'run-and-map', 'phase-machine', 'rendering', 'dev-tools', 'bootstrap'];
    const actual = fs.readdirSync(path.resolve(__dirname, '..', 'js')).filter(function(f) { return f.endsWith('.js'); }).map(function(f) { return f.replace(/\.js$/, ''); });
    assert.strictEqual(actual.length, 11);
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
  // BUILD 123 (checkpoint 1, OQ-13): tests/autoplay.js's LOAD_PRIORITY must
  // rank every loadable mod (every real entry in gameState.config.mods
  // except the anchor, 'consecrate') exactly once, no more, no fewer, no
  // duplicates. tests/autoplay.js's own CLI already runs this check before
  // any batch (assertEveryLoadableModIsRanked) — added here too so a mod
  // added later without updating LOAD_PRIORITY fails the standing
  // regression suite immediately, not only a manual autoplay.js invocation.
  // The exact BUILD 105 gap this checkpoint closed: Anthem and Elevation
  // were built at 113/114 and never added to the old hand-tuned list.
  // ---------------------------------------------------------------
  await runTest('BUILD 123: LOAD_PRIORITY ranks every loadable mod exactly once', async () => {
    const { LOAD_PRIORITY } = require('./autoplay.js');
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const loadableModIds = await page.evaluate(() => Object.keys(gameState.config.mods).filter(id => id !== 'consecrate').sort());
    await liveBrowser.close();
    assert.strictEqual(LOAD_PRIORITY.length, new Set(LOAD_PRIORITY).size, 'LOAD_PRIORITY must not contain duplicates: ' + JSON.stringify(LOAD_PRIORITY));
    assert.deepStrictEqual(LOAD_PRIORITY.slice().sort(), loadableModIds, 'LOAD_PRIORITY must rank exactly the loadable mods — found ' + loadableModIds.length + ' loadable mods, LOAD_PRIORITY has ' + LOAD_PRIORITY.length);
  });

  // ---------------------------------------------------------------
  // BUILD 124: tests/autoplay.js used to stamp its CSV output's `build`
  // column from its own hand-typed `const BUILD = 105`, never bumped since
  // the file was written — the same stale-stamp bug KI-18 closed for the
  // on-screen build stamp, found in this file's CSV column instead (flagged
  // by BUILD 123, fixed here). Closed by deleting the constant outright and
  // reading GAME_CONFIG.BUILD live off the page at row-build time instead.
  // Two checks: the source no longer declares its own BUILD constant (a
  // static-source check, so a future reintroduction fails immediately even
  // if no batch is ever run against it), and a real one-run batch's CSV
  // output actually carries GAME_CONFIG.BUILD in its `build` column.
  // ---------------------------------------------------------------
  await runTest('BUILD 124: autoplay.js has no own BUILD constant and stamps its CSV from GAME_CONFIG.BUILD', async () => {
    const autoplaySrc = fs.readFileSync(path.resolve(__dirname, 'autoplay.js'), 'utf8');
    assert.ok(!/const\s+BUILD\s*=/.test(autoplaySrc), 'tests/autoplay.js must not declare its own BUILD constant — the CSV build column must come from GAME_CONFIG.BUILD instead');

    const { playRun } = require('./autoplay.js');
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const configBuild = await page.evaluate(() => GAME_CONFIG.BUILD);
    await liveBrowser.close();

    const runBrowser = await chromium.launch();
    const row = await playRun(runBrowser, 1, 'asBuilt', 20);
    await runBrowser.close();
    assert.strictEqual(row.build, configBuild, 'tests/autoplay.js CSV row `build` column (' + row.build + ') must equal GAME_CONFIG.BUILD (' + configBuild + ')');
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
      openDieActionScreen();
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

  // ---------------------------------------------------------------
  // BUILD 129 — checkpoint 3 tiers. Every offerable mod and card carries a
  // tier field; card rewards and Load offers each roll a tier per choice
  // off a per-slot split (fight/rite 65/30/5, elite 40/40/20, boss
  // 0/70/30); Consecrate and the three starters carry no tier and are
  // never offered.
  // ---------------------------------------------------------------

  await runTest('BUILD 129: every mod carries its checkpoint 3 tier', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tiers = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.mods).forEach(function(id) { out[id] = gameState.config.mods[id].tier || null; });
      return out;
    });
    assert.deepStrictEqual(tiers, {
      consecrate: null,
      smite: 'common', sanctuary: 'common', penance: 'common', blight: 'common', offering: 'common', anthem: 'common',
      vigil: 'uncommon', ordain: 'uncommon', zeal: 'uncommon', elevation: 'uncommon',
      virulence: 'rare', fervour: 'rare',
      // Checkpoint 3 tags/mods build — six new mods, added after prompt A's
      // tier map was written.
      largesse: 'common', cope: 'common', thurible: 'common',
      tithe: 'uncommon', congregation: 'uncommon', anathema: 'uncommon',
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      magnificat: 'rare',
      // BUILD 133 — checkpoint 3, Bound engine.
      unison: 'common', accord: 'common', kinship: 'common',
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      concord: 'uncommon', herald: 'rare',
      // BUILD 149 — the awe cluster.
      dread: 'common', genuflect: 'uncommon'
    });
    await liveBrowser.close();
  });

  await runTest('BUILD 129: every reward-pool card carries its checkpoint 3 tier', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tiers = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.cardPool).forEach(function(id) { out[id] = gameState.config.cardPool[id].tier || null; });
      return out;
    });
    assert.deepStrictEqual(tiers, {
      rebuke: 'common', censure: 'common', vestment: 'common', litany: 'common', scripture: 'common',
      interdict: 'common', orison: 'common', censer: 'common', purge: 'common',
      judgement: 'uncommon', reckoning: 'uncommon', communion: 'uncommon', rapture: 'uncommon',
      covenant: 'uncommon', retribution: 'uncommon',
      // BUILD 131 — checkpoint 3 cards, sixteen new cards.
      chastise: 'common', cloister: 'common', psalm: 'common', reliquary: 'common',
      vacancy: 'common', lauds: 'common', hosanna: 'common', tabernacle: 'common',
      tenet: 'uncommon', gradual: 'uncommon', myrrh: 'uncommon', gloria: 'uncommon',
      vindication: 'rare', exequy: 'rare', oblation: 'rare', jubilee: 'rare',
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      threnody: 'uncommon', reverberation: 'rare',
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      kyrie: 'common', canticle: 'uncommon', novena: 'rare',
      // BUILD 149 — the awe cluster.
      kneel: 'common', compline: 'common', tremendum: 'uncommon', mysterium: 'rare',
      // BUILD 150 — Bulwark.
      bulwark: 'common',
      // BUILD 153 — seven cards beside the artifact pass.
      venom: 'common', ballast: 'common', cadence: 'common', watchword: 'common',
      refrain: 'uncommon', second_sight: 'uncommon', blight_weight: 'uncommon'
    });
    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 134 — checkpoint 3, the remaining Bound pieces: the mod count
  // goes from 23 to 25 (24 offerable plus Consecrate) and the reward card
  // count from 33 to 36; both grow by exactly one tier bucket in each of
  // the three tiers relative to the totals the BUILD 129 tier maps above
  // already imply (12/7/3 mods -> 12/8/4; 17/11/5 cards -> 18/12/6).
  // ---------------------------------------------------------------
  await runTest('BUILD 134: offerable mod and reward card tier totals', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const totals = await page.evaluate(() => {
      function tally(ids, getTier) {
        const out = { common: 0, uncommon: 0, rare: 0 };
        ids.forEach(function(id) {
          const tier = getTier(id);
          if (tier) out[tier] += 1;
        });
        return out;
      }
      const modTotals = tally(Object.keys(gameState.config.mods), function(id) { return gameState.config.mods[id].tier || null; });
      const cardTotals = tally(Object.keys(gameState.config.cardPool), function(id) { return gameState.config.cardPool[id].tier || null; });
      return { modTotals: modTotals, cardTotals: cardTotals };
    });
    assert.deepStrictEqual(totals.modTotals, { common: 13, uncommon: 9, rare: 4 }, 'offerable mods must be 13 common, 9 uncommon, 4 rare (Consecrate excluded, it carries no tier)');
    assert.deepStrictEqual(totals.cardTotals, { common: 25, uncommon: 16, rare: 7 }, 'reward cards must be 25 common, 16 uncommon, 7 rare');
    await liveBrowser.close();
  });

  await runTest('BUILD 129: Consecrate, Strike, Ward and Rite are never offered', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const starterTiers = ['strike', 'ward', 'rite'].map(function(id) { return gameState.config.cards[id].tier || null; });
      const consecrateTier = gameState.config.mods['consecrate'].tier || null;
      const cardPoolHasStarters = ['strike', 'ward', 'rite'].some(function(id) {
        return Object.prototype.hasOwnProperty.call(gameState.config.cardPool, id);
      });
      let sawConsecrate = false;
      for (let i = 0; i < 500; i++) {
        dieActionChooseLoad();
        if (dieActionMods.indexOf('consecrate') !== -1) sawConsecrate = true;
      }
      let sawStarter = false;
      for (let i = 0; i < 500; i++) {
        openCardRewardScreen();
        if (cardRewardOptions.some(function(id) { return id === 'strike' || id === 'ward' || id === 'rite'; })) sawStarter = true;
      }
      return { starterTiers: starterTiers, consecrateTier: consecrateTier, cardPoolHasStarters: cardPoolHasStarters, sawConsecrate: sawConsecrate, sawStarter: sawStarter };
    });
    assert.deepStrictEqual(v.starterTiers, [null, null, null], 'Strike/Ward/Rite must carry no tier');
    assert.strictEqual(v.consecrateTier, null, 'Consecrate must carry no tier');
    assert.strictEqual(v.cardPoolHasStarters, false, 'the reward pool must never contain a starter card');
    assert.strictEqual(v.sawConsecrate, false, '500 Load offers must never include Consecrate');
    assert.strictEqual(v.sawStarter, false, '500 card rewards must never include a starter');
    await liveBrowser.close();
  });

  await runTest('BUILD 129: a seeded 10,000-choice fight sample lands within 2 points of 65/30/5 (fallbacks counted separately)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await liveBrowser.newPage();
    page.on('dialog', function(d) { d.accept(); });
    await page.addInitScript(function(seed) {
      let s = seed >>> 0;
      if (s === 0) s = 0x9e3779b9;
      function mulberry32() {
        s |= 0;
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
      Math.random = mulberry32;
    }, 12345);
    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
    const v = await page.evaluate(() => {
      const pool = Object.keys(gameState.config.mods)
        .filter(function(id) { return gameState.config.mods[id].tier != null; })
        .map(function(id) { return { id: id, tier: gameState.config.mods[id].tier }; });
      const tally = { common: 0, uncommon: 0, rare: 0 };
      let fallbacks = 0;
      let rolls = 0;
      for (let i = 0; i < 10000; i++) {
        const offer = pickTieredOffer(pool, GAME_CONFIG.TIER_SPLIT.fight, 3);
        offer.forEach(function(o) {
          tally[o.rolledTier] += 1;
          rolls += 1;
          if (o.fallback) fallbacks += 1;
        });
      }
      return { tally: tally, rolls: rolls, fallbacks: fallbacks };
    });
    const pctCommon = v.tally.common / v.rolls;
    const pctUncommon = v.tally.uncommon / v.rolls;
    const pctRare = v.tally.rare / v.rolls;
    assert.ok(Math.abs(pctCommon - 0.65) <= 0.02, 'common ' + pctCommon.toFixed(4) + ' not within 2 points of 0.65');
    assert.ok(Math.abs(pctUncommon - 0.30) <= 0.02, 'uncommon ' + pctUncommon.toFixed(4) + ' not within 2 points of 0.30');
    assert.ok(Math.abs(pctRare - 0.05) <= 0.02, 'rare ' + pctRare.toFixed(4) + ' not within 2 points of 0.05');
    console.log('  [BUILD 129] fight split sample: ' + v.rolls + ' rolls (common ' + pctCommon.toFixed(4) + ', uncommon ' + pctUncommon.toFixed(4) + ', rare ' + pctRare.toFixed(4) + '), ' + v.fallbacks + ' fallback substitution(s) counted separately (not folded into the rolled-tier percentages above)');
    await liveBrowser.close();
  });

  await runTest('BUILD 129: an offer never repeats a piece', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const modPool = Object.keys(gameState.config.mods)
        .filter(function(id) { return gameState.config.mods[id].tier != null; })
        .map(function(id) { return { id: id, tier: gameState.config.mods[id].tier }; });
      const cardPoolEntries = Object.keys(gameState.config.cardPool)
        .map(function(id) { return { id: id, tier: gameState.config.cardPool[id].tier }; });
      const splits = [GAME_CONFIG.TIER_SPLIT.fight, GAME_CONFIG.TIER_SPLIT.elite, GAME_CONFIG.TIER_SPLIT.boss];
      let dupes = 0;
      let offersChecked = 0;
      for (let i = 0; i < 2000; i++) {
        splits.forEach(function(split) {
          [modPool, cardPoolEntries].forEach(function(pool) {
            const offer = pickTieredOffer(pool, split, 3).map(function(o) { return o.id; });
            offersChecked += 1;
            if (new Set(offer).size !== offer.length) dupes += 1;
          });
        });
      }
      return { dupes: dupes, offersChecked: offersChecked };
    });
    assert.strictEqual(v.dupes, 0, 'no offer, across ' + v.offersChecked + ' samples over both pools and all three splits, may repeat a piece: ' + v.dupes + ' duplicate offer(s) found');
    await liveBrowser.close();
  });

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
      vigil: ['bastion'],
      zeal: ['mass', 'growth'],
      fervour: ['mass'],
      ordain: ['mass', 'growth'],
      anthem: ['mass'],
      elevation: ['mass', 'growth'],
      // The six new mods.
      largesse: ['soul'],
      tithe: ['soul'],
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
      interdict: [], orison: [],
      censer: ['poison'], purge: ['poison'], reckoning: ['poison'],
      communion: ['soul'], rapture: ['soul'],
      retribution: ['bastion'],
      covenant: ['mass'],
      judgement: [],
      // BUILD 131 — checkpoint 3 cards, sixteen new cards.
      chastise: [], cloister: [], psalm: [],
      tenet: ['growth', 'mass'], jubilee: ['growth', 'mass'],
      gradual: ['mass'], vacancy: ['mass'], tabernacle: ['mass'],
      lauds: ['growth'],
      reliquary: ['bastion'], vindication: ['bastion'],
      myrrh: ['poison'], exequy: ['poison'],
      hosanna: [], gloria: ['soul'], oblation: ['soul'],
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      threnody: ['growth'], reverberation: ['mass'],
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

  await runTest('BUILD 130: Tithe — 5 damage per soul at end of round, capped at 20', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'tithe' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ soul: 6 }); }); // 5*6=30, must cap at 20
    const hpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'END_PLAYER_TURN');
    const hpAfter = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore - hpAfter, 20, 'expected damage capped at 20 despite 30 raw (5 x 6 soul)');
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

  // ---------------------------------------------------------------
  // BUILD 131 — checkpoint 3, sixteen new cards, no new engine code. One
  // test per card, each playing the real card through playCard() (never
  // calling card.effect() directly) and checking its numbers, its own
  // condition, and its cap where it has one — same style Tithe/Anathema/
  // Retribution already established for a capped card: pick inputs that
  // push the raw value past the cap so the cap is actually exercised, not
  // just declared.
  // ---------------------------------------------------------------

  await runTest('BUILD 139: Tenet — 6 damage +1 per run-scoped trigger on the rolled face, no cap', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); }); // face 3 is blank by default — rolledFaceNumber becomes 3
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modData: { triggerCount: 47 } }); // 6 + 47 = 53
      updateDie({ faces: newFaces });
      updatePlayer({ hand: ['tenet'], soul: 5 });
    });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 53, 'expected 53 damage (6 + 47 triggers), no cap');
    await liveBrowser.close();
  });

  await runTest('BUILD 139: Tenet — a Nat 1 face rolled 3 times deals 9', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await advanceUntilPhase(page, 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await advanceUntilPhase(page, 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['tenet'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 9, 'expected 9 damage (6 + 3 rolls of face 1)');
    await liveBrowser.close();
  });

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

  await runTest('BUILD 139: Gradual — 3 damage +1 per weight of the heaviest loaded face, no cap', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite', weight: 18 }); // face 5, weight 18: 3 + 18 = 21
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['gradual'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 21, 'expected 21 damage (3 + 18 heaviest loaded weight), no cap');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Vacancy — 1 damage per blank face among faces 2-19, capped at 16', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const blanksBefore = await page.evaluate(() => gameState.die.faces.filter(function(f) { return f.number >= 2 && f.number <= 19 && f.modId === null; }).length);
    const expectedBefore = Math.min(blanksBefore, 16);
    await page.evaluate(() => { updatePlayer({ hand: ['vacancy'], soul: 5 }); });
    const hpBefore1 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const hpAfter1 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore1 - hpAfter1, expectedBefore, 'expected min(' + blanksBefore + ' blank faces, 16) = ' + expectedBefore + ' damage');

    // Load faces down under the cap and confirm the raw count is used, not always 16.
    const blanksAfter = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      for (let n = 2; n <= 9; n++) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); }
      updateDie({ faces: newFaces });
      updatePlayer({ hand: ['vacancy'], soul: 5 });
      return gameState.die.faces.filter(function(f) { return f.number >= 2 && f.number <= 19 && f.modId === null; }).length;
    });
    assert.ok(blanksAfter < 16, 'test setup: expected fewer than 16 blank faces after loading, got ' + blanksAfter);
    const hpBefore2 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const hpAfter2 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBefore2 - hpAfter2, blanksAfter, 'expected exactly ' + blanksAfter + ' damage, uncapped');
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

  await runTest('BUILD 142: Hosanna — 6 damage against an Attack, 12 against anything else', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    // The opening fight's own enemy is mid-Attack by default (its pattern
    // is a single repeating Attack entry) — base 6 damage.
    await page.evaluate(() => { updatePlayer({ hand: ['hosanna'], soul: 5 }); });
    const beforeAttack = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const afterAttack = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(beforeAttack - afterAttack, 6, 'expected base 6 damage while the enemy intent is an Attack');

    // Queue an Afflict for next round via the dev drawer, then end the
    // round through the normal auto-advance chain so START_OF_TURN
    // actually consumes the forced entry before the next CARD_PHASE.
    await page.evaluate(() => { devSetNextIntent({ kind: 'afflict', stacks: 4 }); });
    await page.evaluate(() => { autoAdvance(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE' && gameState.enemy.currentEntry && gameState.enemy.currentEntry.kind === 'afflict');
    await page.evaluate(() => { updatePlayer({ hand: ['hosanna'], soul: 5 }); });
    const beforeAfflict = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const afterAfflict = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(beforeAfflict - afterAfflict, 12, 'expected empowered 12 damage while the enemy intent is an Afflict');
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

  await runTest('BUILD 131: Tabernacle — 3 block +3 per weight of the rolled face, capped at 12', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { weight: 4 }); // face 3, weight 4: 3 + 3*4 = 15, caps at 12
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['tabernacle'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 12, 'expected block capped at 12 despite 15 raw (3 + 3x4 rolled face weight)');
    await liveBrowser.close();
  });

  await runTest('BUILD 131: Jubilee — 4 damage +2 per weight added to the die this run, capped at 24', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      // Six faces at weight 3 each add (3-1)*6 = 12 weight: 4 + 2*12 = 28, caps at 24.
      [2, 3, 4, 5, 6, 7].forEach(function(n) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { weight: 3 }); });
      updateDie({ faces: newFaces });
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

  // ---------------------------------------------------------------
  // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
  // Threnody and Reverberation both go through triggerFaceOutsideRoll()
  // (pipeline.js, tested directly in tests/mods.test.js); these two tests
  // check each card's own targeting/condition logic, playing the real card
  // through playCard() as every other card test in this file does.
  // ---------------------------------------------------------------

  await runTest('BUILD 142: Threnody — always triggers gameState.run.threnodyFace, whatever is loaded there', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const faceNumber = gameState.run.threnodyFace;
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNumber - 1] = Object.assign({}, newFaces[faceNumber - 1], { modId: 'smite' });
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(9 === gameState.run.threnodyFace ? 8 : 9); }); // roll a different face, untouched, stays blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['threnody'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 16, 'expected Threnody\'s own fixed face (loaded with smite) to trigger regardless of which face was rolled');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Reverberation — a loaded rolled face triggers again', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); }); // triggers smite once, normally
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 16, 'expected smite (face 2, already rolled and triggered once this round) to trigger a second time via Reverberation');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Reverberation — a blank rolled face gives its 2 block again', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 2, 'expected the blank face\'s 2 block again');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Reverberation — a Nat roll gives 6 block instead of a re-trigger attempt', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    // Face 1 (Nat 1), not face 20: a Nat 20 roll sweeps every loaded face,
    // including the anchor (Consecrate, face 10), whose own effect
    // registers a turn-scoped 3-block-per-card-played listener that would
    // then also fire when Reverberation itself is played, confounding the
    // block delta this test reads. Nat 1's onNatOne registers no such
    // listener, so it isolates the branch cleanly; the card's own check
    // (face 1 OR face 20) is unaffected by which one triggers it.
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['reverberation'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(after - before, 6, 'expected 6 block on a Nat roll (triggerFaceOutsideRoll() always refuses faces 1 and 20)');
    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 134 — checkpoint 3, the remaining Bound pieces: Kyrie, Novena,
  // Canticle (cards; Concord and Herald, the two new mods, are tested
  // directly in tests/mods.test.js like every other mod). All three read
  // isBoundFace()/call grantBoundToFace()/triggerFaceOutsideRoll()
  // (pipeline.js, the Bound engine, BUILD 133) — no second copy of any of
  // them here, playing the real card through playCard() as every other
  // card test in this file does.
  // ---------------------------------------------------------------

  await runTest('BUILD 134: Kyrie — 5 damage on a non-Bound rolled face', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, an ordinary blank, not Bound
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['kyrie'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before - after, 5, 'expected plain 5 damage on a non-Bound rolled face');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Kyrie — 10 damage if the rolled face has Bound', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'unison' }); // face 3, Bound (via the 'bound' tag)
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); }); // triggers Unison (6 damage) too
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['kyrie'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.hp);
    // Isolates Kyrie's own play — Unison's 6 damage already landed above.
    assert.strictEqual(before - after, 10, 'expected empowered 10 damage when the rolled face is Bound');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Novena — every loaded Bound face triggers, each through triggerFaceOutsideRoll()', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2, Bound (6 damage)
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3, Bound (10 block)
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5, not Bound (16 damage) — must not trigger
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(9); }); // face 9, untouched, stays blank
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['novena'], soul: 5 }); });
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block }));
    await page.evaluate(() => { playCard(0); });
    // playSweep() paces multi-face playback via setTimeout — give both Bound
    // faces (2 and 3) time to land before reading the result.
    await page.waitForFunction(() => gameState.die.faces[1].modData && gameState.die.faces[1].modData.triggerCount === 1 &&
      gameState.die.faces[2].modData && gameState.die.faces[2].modData.triggerCount === 1, { timeout: 5000 });
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, block: gameState.player.block, smiteTriggerCount: gameState.die.faces[4].modData ? (gameState.die.faces[4].modData.triggerCount || 0) : 0 }));
    assert.strictEqual(before.hp - after.hp, 6, 'expected only Unison (Bound, face 2) to deal damage — 6');
    assert.strictEqual(after.block - before.block, 10, 'expected only Accord (Bound, face 3) to generate block — 10');
    assert.strictEqual(after.smiteTriggerCount, 0, 'expected Smite (face 5, not Bound) to never trigger');
    await liveBrowser.close();
  });

  await runTest('BUILD 134: Canticle — 6 block; if the rolled face is loaded, it gains Bound for this fight (never face 1 or 20)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'smite' }); // face 3, loaded
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['canticle'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { playCard(0); });
    const v = await page.evaluate(() => ({ block: gameState.player.block, face3Bound: !!(gameState.die.faces[2].modData && gameState.die.faces[2].modData.boundGranted) }));
    assert.strictEqual(v.block - before, 6, 'expected 6 block');
    assert.strictEqual(v.face3Bound, true, 'expected the loaded rolled face (3) to be granted Bound for the fight');

    // A Nat roll (face 1) must never be granted Bound — grantBoundToFace()
    // itself refuses both Nat faces, and the "loaded" check here already
    // excludes them (Nat faces are not real mods), so nothing is granted.
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['canticle'], soul: 5 }); });
    await page.evaluate(() => { playCard(0); });
    const face1Bound = await page.evaluate(() => !!(gameState.die.faces[0].modData && gameState.die.faces[0].modData.boundGranted));
    assert.strictEqual(face1Bound, false, 'face 1 must never be granted Bound');
    await liveBrowser.close();
  });

  await runTest('BUILD 132: Magnificat is offerable through Load (ARCH-CF6: weight changes only via strengthenFace())', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const seen = await page.evaluate(() => {
      let sawMagnificat = false;
      for (let i = 0; i < 1000 && !sawMagnificat; i++) {
        dieActionChooseLoad();
        if (dieActionMods.indexOf('magnificat') !== -1) sawMagnificat = true;
      }
      // ARCH-CF6 spot-check: Magnificat's own effect (cards-mods.js) never
      // writes face.weight anywhere — the only weight it reads is off the
      // candidate faces it scans, never mutated.
      return sawMagnificat;
    });
    assert.ok(seen, 'expected magnificat to appear in a Load offer within 1000 samples');
    await liveBrowser.close();
  });

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

  // ---------------------------------------------------------------
  // BUILD 136 — on-screen text for every checkpoint 3 piece, plus New Run
  // working while a fight-won panel is open.
  // ---------------------------------------------------------------

  // BUILD 136: the shared `browser` was already closed above (line 936) —
  // every test from here on launches and closes its own browser, same
  // pattern the BUILD 135 tests just above already use.

  await runTest('BUILD 136: every reward-pool card has non-empty on-screen text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const poolIds = Object.keys(gameState.config.cardPool).filter(function(id) {
        return gameState.config.cardPool[id].tier != null;
      });
      const missing = poolIds.filter(function(id) { return !CARD_EFFECT_TEXT[id]; });
      return { total: poolIds.length, missing: missing };
    });
    assert.strictEqual(v.total, 48, 'expected forty-eight reward-pool cards');
    assert.deepStrictEqual(v.missing, [], 'every reward-pool card must have a CARD_EFFECT_TEXT entry: missing ' + JSON.stringify(v.missing));
    await liveBrowser.close();
  });

  await runTest('BUILD 136: every offerable mod has non-empty on-screen text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const offerableIds = Object.keys(gameState.config.mods).filter(function(id) {
        return gameState.config.mods[id].tier != null && DIE_ACTION_EXCLUDED_MOD_IDS.indexOf(id) === -1;
      });
      const missing = offerableIds.filter(function(id) { return !MOD_DESCRIPTION[id]; });
      return { total: offerableIds.length, missing: missing };
    });
    assert.ok(v.total > 0, 'expected at least one offerable mod');
    assert.deepStrictEqual(v.missing, [], 'every offerable mod must have a MOD_DESCRIPTION entry: missing ' + JSON.stringify(v.missing));
    await liveBrowser.close();
  });

  await runTest('BUILD 136: a new card in hand renders its text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      updatePlayer({ hand: ['gloria'] });
      const effectEl = document.querySelector('#handRow .hand-card-effect');
      return effectEl ? effectEl.textContent : null;
    });
    assert.strictEqual(v, '30 damage', 'Gloria in hand must render its own hand text');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: the reward hover for a new card is not empty', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      cardRewardOptions = ['gloria'];
      cardRewardStep = 'choose';
      dieActionOrigin = 'reward';
      refreshInspector();
      // BUILD 154: the reward panel shows each card's effect text on the
      // card itself, and keeps it on hover as the card's own title.
      const card = document.querySelector('#cardRewardPanel .offer-card');
      const text = card ? card.querySelector('.offer-card-text') : null;
      return { text: text ? text.textContent : null, title: card ? card.title : null };
    });
    assert.strictEqual(v.text, '30 damage', 'the reward text for a new card must not be empty');
    assert.ok(v.title && v.title.indexOf('30 damage') !== -1, 'the reward hover for a new card must not be empty');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: New Run works while a fight-won panel (die action) is open', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { document.getElementById('devSkipToDieActionBtn').click(); });
    await page.waitForFunction(() => dieActionStep === 'choose');
    const before = await page.evaluate(() => document.getElementById('startGameBtn').disabled);
    await page.click('#startGameBtn');
    await page.waitForFunction(() => gameState.run.screen === 'map' && gameState.run.currentSlot === 'opening');
    const v = await page.evaluate(() => ({
      dieActionStep: dieActionStep,
      panelDisplay: document.getElementById('dieActionPanel').style.display,
      hp: gameState.player.hp
    }));
    assert.strictEqual(before, false, 'New Run must not be disabled while the die action panel is open');
    assert.strictEqual(v.dieActionStep, null, 'the open die action panel must be dismissed by New Run');
    assert.strictEqual(v.panelDisplay, 'none', 'the die action panel must no longer be shown after New Run');
    assert.strictEqual(v.hp, 70, 'a fresh New Run must land back at full player HP');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: New Run works while a fight-won panel (card reward) is open', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { document.getElementById('devSkipToCardRewardBtn').click(); });
    await page.waitForFunction(() => cardRewardStep === 'choose');
    const before = await page.evaluate(() => document.getElementById('startGameBtn').disabled);
    await page.click('#startGameBtn');
    await page.waitForFunction(() => gameState.run.screen === 'map' && gameState.run.currentSlot === 'opening');
    const v = await page.evaluate(() => ({
      cardRewardStep: cardRewardStep,
      panelDisplay: document.getElementById('cardRewardPanel').style.display
    }));
    assert.strictEqual(before, false, 'New Run must not be disabled while the card reward panel is open');
    assert.strictEqual(v.cardRewardStep, null, 'the open card reward panel must be dismissed by New Run');
    assert.strictEqual(v.panelDisplay, 'none', 'the card reward panel must no longer be shown after New Run');
    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 137 (playtest readiness): Bound badge, two-mod name truncation,
  // and the round-trigger-cap log line printing at most once per round.
  // ---------------------------------------------------------------
  await runTest('BUILD 137: a printed-Bound face (Unison) shows the Bound badge', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'unison' }); // face 10
      updateDie({ faces: newFaces });
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10]; // rows render NAT 20 -> NAT 1, face 10 is the 10th from the bottom
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, text: badge ? badge.textContent : null };
    });
    assert.strictEqual(v.found, true, 'a face carrying a printed-Bound mod must show a .die-bound-badge on its die row');
    assert.strictEqual(v.text, 'Bound', 'the badge must read exactly "Bound"');
    await liveBrowser.close();
  });

  await runTest('BUILD 137: a face granted Bound for the fight shows the badge, then loses it at fight end', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const during = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'smite' }); // face 10, not printed-Bound
      updateDie({ faces: newFaces });
      grantBoundToFace(10);
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10];
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, text: badge ? badge.textContent : null };
    });
    assert.strictEqual(during.found, true, 'a face granted Bound for the fight must show the badge the moment it is granted');
    assert.strictEqual(during.text, 'Bound', 'the granted badge must also read exactly "Bound"');

    // Fight end — same resetFight()-based real code path the existing
    // mods.test.js "grantBoundToFace: the grant clears at fight end" test
    // uses (resetFight() -> clearFightScopedState(), run-and-map.js, which
    // strips modData.boundGranted but leaves the rest of the face alone).
    await page.evaluate(() => { resetFight(); });
    const after = await page.evaluate(() => {
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10];
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, faceModId: gameState.die.faces[9].modId, boundGranted: !!(gameState.die.faces[9].modData && gameState.die.faces[9].modData.boundGranted) };
    });
    assert.strictEqual(after.boundGranted, false, 'modData.boundGranted must be cleared at fight end');
    assert.strictEqual(after.found, false, 'the Bound badge must be gone once the fight has ended, even though face 10 still carries smite');
    assert.strictEqual(after.faceModId, 'smite', 'the mod itself (not just the grant) must survive the fight, since only boundGranted is fight-scoped');
    await liveBrowser.close();
  });

  await runTest("BUILD 137: a two-mod face's row shows the start of both names with no ellipsis, full names on hover", async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'congregation', modId2: 'magnificat' });
      updateDie({ faces: newFaces });
      const pair = document.querySelector('#playerDieList .die-mod-pair');
      const names = Array.from(pair.querySelectorAll('.die-mod'));
      return { names: names.map(n => ({ text: n.textContent, title: n.title })), charCount: TWO_MOD_NAME_CHARS };
    });
    assert.strictEqual(v.names.length, 2, 'a two-mod face must render exactly two name spans');
    assert.strictEqual(v.names[0].text, 'Congregation'.slice(0, v.charCount), 'the first mod name must show its own truncated prefix, no ellipsis');
    assert.strictEqual(v.names[1].text, 'Magnificat'.slice(0, v.charCount), 'the second mod name must show its own truncated prefix, no ellipsis');
    assert.ok(v.names[0].text.indexOf('…') === -1 && v.names[1].text.indexOf('…') === -1, 'neither truncated name may contain an ellipsis character');
    assert.strictEqual(v.names[0].title, 'Congregation', 'the full first name must be available via hover (title)');
    assert.strictEqual(v.names[1].title, 'Magnificat', 'the full second name must be available via hover (title)');
    await liveBrowser.close();
  });

  await runTest('BUILD 137: the round-trigger-cap log line appears once even when the cap is hit many times in one round', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      for (let n = 2; n <= 19; n++) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); }
      updateDie({ faces: newFaces });
      const results = [];
      for (let n = 2; n <= 19; n++) { results.push(triggerFaceOutsideRoll(n)); }
      const capLines = Array.from(document.querySelectorAll('#log > div')).filter(function(d) {
        return d.textContent.indexOf('round trigger cap (' + GAME_CONFIG.ROUND_TRIGGER_CAP + ') reached') !== -1;
      });
      return { refusedCount: results.filter(function(r) { return r === false; }).length, capLineCount: capLines.length, cap: GAME_CONFIG.ROUND_TRIGGER_CAP };
    });
    assert.ok(v.refusedCount > 1, 'this batch must refuse the cap more than once, or the test proves nothing (got ' + v.refusedCount + ')');
    assert.strictEqual(v.capLineCount, 1, 'the cap-reached log line must appear exactly once despite ' + v.refusedCount + ' refusals this round');
    await liveBrowser.close();
  });

  // ---------------------------------------------------------------
  // BUILD 138 (die feedback): the hop — a face that fires without being
  // the rolled face (Nat 20 sweep, Bound scan, outside-roll trigger) moves
  // to the rolled-face look too — plus faces 1/20's own run-scoped roll
  // counts.
  // ---------------------------------------------------------------
  await runTest('BUILD 138: after a Bound scan, every fired face carries the rolled-face look until the next round starts', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'unison' }); // face 2
      newFaces[2] = Object.assign({}, newFaces[2], { modId: 'accord' }); // face 3
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); }); // rolls Unison (Bound) -> scan fires Accord (face 3)
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const during = await page.evaluate(() => {
      function rowFor(n) { return document.querySelectorAll('#playerDieList .die-row')[GAME_CONFIG.DIE_SIZE.PLAYER - n]; }
      const rolledRow = rowFor(2);
      const hoppedRow = rowFor(3);
      const hasLook = function(row) { return row.classList.contains('die-row-rolled') || row.classList.contains('die-row-rolled-flash'); };
      return {
        hoppedFaces: gameState.turn.hoppedFaces.slice(),
        rolledHasLook: hasLook(rolledRow),
        hoppedHasLook: hasLook(hoppedRow)
      };
    });
    assert.deepStrictEqual(during.hoppedFaces, [3], 'the Bound scan must record only the other Bound face (3) as hopped, not the rolled face itself');
    assert.strictEqual(during.rolledHasLook, true, 'the rolled face (2) must carry the rolled-face look, exactly as before this build');
    assert.strictEqual(during.hoppedHasLook, true, 'the scanned face (3) must carry the same rolled-face look once it has fired');

    // Advance into the next round's START_OF_TURN/ROLL_PHASE and confirm
    // the look clears at the same site rolledFaceNumber itself clears at.
    await page.evaluate(() => { nextPhase(); }); // CARD_PHASE -> END_PLAYER_TURN
    await advanceUntilPhase(page, 'ROLL_PHASE');
    const after = await page.evaluate(() => {
      const hoppedRow = document.querySelectorAll('#playerDieList .die-row')[GAME_CONFIG.DIE_SIZE.PLAYER - 3];
      const hasLook = hoppedRow.classList.contains('die-row-rolled') || hoppedRow.classList.contains('die-row-rolled-flash');
      return { hoppedFaces: gameState.turn.hoppedFaces.slice(), hoppedHasLook: hasLook };
    });
    assert.deepStrictEqual(after.hoppedFaces, [], 'hoppedFaces must be cleared once the next round starts');
    assert.strictEqual(after.hoppedHasLook, false, 'face 3 must lose the rolled-face look once the next round starts');
    await liveBrowser.close();
  });

  await runTest('BUILD 138: hopped faces are recorded in firing order', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5
      newFaces[14] = Object.assign({}, newFaces[14], { modId: 'sanctuary' }); // face 15
      updateDie({ faces: newFaces }); // face 10 already carries the starting anchor, consecrate
    });
    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // Nat 20 sweep
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hoppedFaces = await page.evaluate(() => gameState.turn.hoppedFaces.slice());
    assert.deepStrictEqual(hoppedFaces, [5, 10, 15], 'hopped faces must be recorded in the same ascending order the Nat 20 sweep fires them in');
    await liveBrowser.close();
  });

  await runTest("BUILD 138: a Nat 20 roll raises face 20's count, a Nat 1 roll raises face 1's, both reset on a new run", async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const before = await page.evaluate(() => ({
      face20: (gameState.die.faces[19].modData && gameState.die.faces[19].modData.triggerCount) || 0,
      face1: (gameState.die.faces[0].modData && gameState.die.faces[0].modData.triggerCount) || 0
    }));
    assert.strictEqual(before.face20, 0, 'face 20 must start this fight with no roll count yet');
    assert.strictEqual(before.face1, 0, 'face 1 must start this fight with no roll count yet');

    await page.evaluate(() => { forcePlayerRoll(GAME_CONFIG.DIE_SIZE.PLAYER); }); // Nat 20
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { nextPhase(); }); // CARD_PHASE -> END_PLAYER_TURN
    await advanceUntilPhase(page, 'ROLL_PHASE');
    // No leftover autoAdvance() timer is pending here (round 1's chain died
    // the moment it reached CARD_PHASE — see F10 Penitence's own identical
    // note above), so this round's ROLL_PHASE -> CARD_PHASE step needs an
    // explicit nextPhase() alongside the forced roll, unlike round 1's.
    await page.evaluate(() => { forcePlayerRoll(1); }); // Nat 1
    await page.evaluate(() => { nextPhase(); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');

    const afterRolls = await page.evaluate(() => ({
      face20: (gameState.die.faces[19].modData && gameState.die.faces[19].modData.triggerCount) || 0,
      face1: (gameState.die.faces[0].modData && gameState.die.faces[0].modData.triggerCount) || 0,
      badge20: document.querySelectorAll('#playerDieList .die-row')[0].querySelector('.die-trigger-count').textContent,
      badge1: document.querySelectorAll('#playerDieList .die-row')[19].querySelector('.die-trigger-count').textContent
    }));
    assert.strictEqual(afterRolls.face20, 1, 'one Nat 20 roll must raise face 20\'s own count by exactly one');
    assert.strictEqual(afterRolls.face1, 1, 'one Nat 1 roll must raise face 1\'s own count by exactly one');
    assert.strictEqual(afterRolls.badge20, '#1', 'face 20 must show the same #N count badge every other face uses');
    assert.strictEqual(afterRolls.badge1, '#1', 'face 1 must show the same #N count badge every other face uses');

    await page.evaluate(() => { startNewRun(); });
    const afterNewRun = await page.evaluate(() => ({
      face20: gameState.die.faces[19].modData,
      face1: gameState.die.faces[0].modData
    }));
    assert.strictEqual(afterNewRun.face20, undefined, 'a brand new run must wipe face 20\'s roll count, same as every other face\'s modData');
    assert.strictEqual(afterNewRun.face1, undefined, 'a brand new run must wipe face 1\'s roll count, same as every other face\'s modData');
    await liveBrowser.close();
  });

  await runTest('BUILD 139: reworded on-screen text matches word for word', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const texts = await page.evaluate(() => ({
      tenet: CARD_EFFECT_TEXT['tenet'],
      gradual: CARD_EFFECT_TEXT['gradual'],
      magnificat: MOD_DESCRIPTION['magnificat'],
      reverberation: CARD_EFFECT_TEXT['reverberation'],
      canticle: CARD_EFFECT_TEXT['canticle'],
      herald: MOD_DESCRIPTION['herald'],
      congregation: MOD_DESCRIPTION['congregation'],
      lauds: CARD_EFFECT_TEXT['lauds'],
      reliquary: CARD_EFFECT_TEXT['reliquary'],
      vindication: CARD_EFFECT_TEXT['vindication'],
      exequy: CARD_EFFECT_TEXT['exequy'],
      oblation: CARD_EFFECT_TEXT['oblation'],
      tithe: MOD_DESCRIPTION['tithe'],
      anathema: MOD_DESCRIPTION['anathema']
    }));
    assert.strictEqual(texts.tenet, '6 damage, +1 for each time the rolled face has triggered this run');
    assert.strictEqual(texts.gradual, '3 damage, +1 per weight of your heaviest face');
    assert.strictEqual(texts.magnificat, 'Triggers your heaviest other face');
    // BUILD 142: Threnody's own text assertion moved to tests/build142.test.js
    // (item F) — it now names the live, run-fixed threnodyFace number via
    // getCardEffectText() (rendering.js), not a fixed string this shared
    // batch of raw CARD_EFFECT_TEXT/MOD_DESCRIPTION lookups can check.
    assert.strictEqual(texts.reverberation, 'The face you rolled triggers again. On a 1 or 20: 6 block instead');
    assert.strictEqual(texts.canticle, '6 block. The face you rolled gains Bound for this fight');
    assert.strictEqual(texts.herald, '6 damage. One other random loaded face gains Bound for this fight. Bound');
    assert.strictEqual(texts.congregation, '8 damage. 16 if another mod on your die has Growth. Growth');
    assert.strictEqual(texts.lauds, '4 damage, +3 per Growth mod on your die, max 13');
    assert.strictEqual(texts.reliquary, '6 block. If you already had 10+ block, also 5 damage');
    assert.strictEqual(texts.vindication, 'Deal damage equal to twice your block, max 24');
    assert.strictEqual(texts.exequy, "Deal damage equal to the enemy's stacks of poison, max 12");
    assert.strictEqual(texts.oblation, 'Spend all your soul. 7 damage per soul spent, max 42');
    assert.strictEqual(texts.tithe, 'End of round: 5 damage per soul you have left, max 20');
    assert.strictEqual(texts.anathema, 'End of round: deal damage equal to your block, max 16');
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
