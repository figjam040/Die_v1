// ============================================================
// TESTS/BUILD141.TEST.JS — BUILD 141
// Standing regression suite for BUILD 141's three items: the poison answer
// (item A), enemy intent patterns/Attack-Charge-Afflict (item B), and
// enemy dice of any size plus Wrath/Drain/Seal (item C). Same shape as
// tests/facts.test.js: plain Node script, playwright launched directly,
// node:assert. Run: node tests/build141.test.js
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

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — the poison answer
  // ---------------------------------------------------------------

  await runTest('Item A-a: 12 block and 4 poison stacks removes 2 stacks, then the tick deals 2, leaving 1 stack and 0 block', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ block: 12, poisonStacks: 4 }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const v = await page.evaluate(() => ({ poison: gameState.player.poisonStacks, block: gameState.player.block }));
    assert.strictEqual(v.poison, 1, 'expected 1 stack of poison left, got ' + v.poison);
    assert.strictEqual(v.block, 0, 'expected 0 block left, got ' + v.block);
    await page.close();
  });

  await runTest('Item A-b: 4 block and 4 poison stacks removes nothing, tick deals 4, leaving 3 stacks', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updatePlayer({ block: 4, poisonStacks: 4 }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const v = await page.evaluate(() => gameState.player.poisonStacks);
    assert.strictEqual(v, 3, 'expected 3 stacks of poison left, got ' + v);
    await page.close();
  });

  await runTest('Item A-c: 25 block and 3 stacks removes all 3, no poison damage, 0 stacks left', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { updatePlayer({ block: 25, poisonStacks: 3 }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const v = await page.evaluate(() => ({ poison: gameState.player.poisonStacks, hp: gameState.player.hp }));
    assert.strictEqual(v.poison, 0, 'expected 0 stacks of poison left, got ' + v.poison);
    assert.strictEqual(v.hp, hpBefore, 'expected no poison damage, hp changed from ' + hpBefore + ' to ' + v.hp);
    await page.close();
  });

  await runTest('Item A-d: an enemy with poison stacks is unaffected by the poison answer', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ poisonStacks: 5 }); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const v = await page.evaluate(() => gameState.enemy.poisonStacks);
    assert.strictEqual(v, 4, 'expected the enemy poison tick to still just decay by 1 (5 -> 4), got ' + v);
    await page.close();
  });

  await runTest('Item A-e: the player poison hover text is not empty', async () => {
    const page = await freshPage(browser);
    const title = await page.evaluate(() => { renderStats(); return document.getElementById('playerDebuffsValue').title; });
    assert.ok(title && title.length > 0, 'expected non-empty poison hover text');
    assert.ok(title.indexOf('block') !== -1 && title.indexOf('poison') !== -1, 'hover text should mention block and poison');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — enemy intent patterns (Attack/Charge/Afflict)
  // ---------------------------------------------------------------

  await runTest('Item B-a: every built enemy has a non-empty pattern', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ act: buildAct(1) }); });
    const patterns = await page.evaluate(() => {
      const act = gameState.run.act;
      const list = [act.opening.enemy.pattern, act.boss.enemy.pattern];
      act.upper.concat(act.lower).forEach(function(s) { if (s.enemy) list.push(s.enemy.pattern); });
      return list;
    });
    patterns.forEach(function(p, i) { assert.ok(Array.isArray(p) && p.length >= 1, 'pattern ' + i + ' must be a non-empty array'); });
    await page.close();
  });

  await runTest('Item B-b: Attack 10-10 against 4 block deals 6', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ pattern: [{ kind: 'attack', min: 10, max: 10 }], patternIndex: 0 }); runPhase('START_OF_TURN'); });
    await page.evaluate(() => { updatePlayer({ block: 4 }); });
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore - hpAfter, 6, 'expected 6 damage, got ' + (hpBefore - hpAfter));
    await page.close();
  });

  await runTest('Item B-c: Charge 24/breakAt 15 — 14 damage in wind-up lets release deal 24 minus block; 15 breaks it', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Not broken: deal 14 damage during the wind-up round.
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 15 }], patternIndex: 0 });
      runPhase('START_OF_TURN'); // wind-up begins
    });
    const stage1 = await page.evaluate(() => gameState.enemy.chargeStage);
    assert.strictEqual(stage1, 'windup', 'expected windup stage');
    await page.evaluate(() => { updateEnemy({ hp: gameState.enemy.hp - 14 }); });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); }); // no damage this round, stays windup
    await page.evaluate(() => { runPhase('START_OF_TURN'); }); // release begins, break check
    const v1 = await page.evaluate(() => ({ broken: gameState.enemy.chargeBroken, stage: gameState.enemy.chargeStage }));
    assert.strictEqual(v1.broken, false, 'expected NOT broken at 14 damage');
    assert.strictEqual(v1.stage, 'release');
    const hpBefore1 = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { updatePlayer({ block: 4 }); runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter1 = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore1 - hpAfter1, 20, 'expected release of 24 minus 4 block = 20 damage, got ' + (hpBefore1 - hpAfter1));

    // Broken: fresh fight, deal 15 damage during wind-up.
    const page2 = await freshPage(browser);
    await enterOpeningFight(page2);
    await page2.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 15 }], patternIndex: 0 });
      runPhase('START_OF_TURN');
    });
    await page2.evaluate(() => { updateEnemy({ hp: gameState.enemy.hp - 15 }); });
    await page2.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    await page2.evaluate(() => { runPhase('START_OF_TURN'); });
    const v2 = await page2.evaluate(() => gameState.enemy.chargeBroken);
    assert.strictEqual(v2, true, 'expected broken at 15 damage');
    const hpBefore2 = await page2.evaluate(() => gameState.player.hp);
    await page2.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter2 = await page2.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore2, hpAfter2, 'expected 0 damage from a broken release');
    await page.close();
    await page2.close();
  });

  await runTest('Item B-d: a poison tick during the wind-up round counts toward the break', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 3 }], patternIndex: 0, poisonStacks: 3 });
      runPhase('START_OF_TURN'); // wind-up begins, poison ticks for 3 (this same call)
    });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    await page.evaluate(() => { runPhase('START_OF_TURN'); }); // release begins, break check
    const broken = await page.evaluate(() => gameState.enemy.chargeBroken);
    assert.strictEqual(broken, true, 'expected the wind-up round\'s own poison tick to count toward the break');
    await page.close();
  });

  await runTest('Item B-e: Afflict 4 adds 4 stacks of poison to the player and deals no damage', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'afflict', stacks: 4 }], patternIndex: 0 });
      runPhase('START_OF_TURN');
    });
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const v = await page.evaluate(() => ({ hp: gameState.player.hp, poison: gameState.player.poisonStacks }));
    assert.strictEqual(v.hp, hpBefore, 'expected no damage from Afflict');
    assert.strictEqual(v.poison, 4, 'expected 4 stacks of poison, got ' + v.poison);
    await page.close();
  });

  await runTest('Item B-f: an enemy Nat 1 on a wind-up round cancels the release', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 15 }], patternIndex: 0 });
      runPhase('START_OF_TURN'); // wind-up begins
      updateTurn({ enemyAttackCancelledThisTurn: true });
    });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); }); // cancels, should skip past the whole charge
    const v = await page.evaluate(() => ({ chargeStage: gameState.enemy.chargeStage, patternIndex: gameState.enemy.patternIndex }));
    assert.strictEqual(v.chargeStage, null, 'expected the whole charge to be cancelled (chargeStage null)');
    // Verify no release happens even after another START_OF_TURN + ENEMY_ACT_PHASE (single-entry pattern loops back to a fresh charge windup, not a release).
    await page.evaluate(() => { updateTurn({ enemyAttackCancelledThisTurn: false }); runPhase('START_OF_TURN'); });
    const stage2 = await page.evaluate(() => gameState.enemy.chargeStage);
    assert.strictEqual(stage2, 'windup', 'expected the pattern to have moved past the cancelled charge back to a fresh wind-up, not a release');
    await page.close();
  });

  await runTest('Item B-g: Interdict gives 10 block against a release of 24 and 5 against a wind-up', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 15 }], patternIndex: 0 });
      runPhase('START_OF_TURN'); // wind-up
    });
    await page.evaluate(() => { updatePlayer({ hand: ['interdict'], block: 0 }); updateTurn({ phase: 'CARD_PHASE' }); });
    await page.evaluate(() => { playCard(0); });
    const blockDuringWindup = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockDuringWindup, 5, 'expected 5 block during a wind-up, got ' + blockDuringWindup);

    await page.evaluate(() => { updateTurn({ phase: 'ENEMY_ACT_PHASE' }); runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); }); // move to release
    const stage = await page.evaluate(() => gameState.enemy.chargeStage);
    assert.strictEqual(stage, 'release');
    await page.evaluate(() => { updatePlayer({ hand: ['interdict'], block: 0 }); updateTurn({ phase: 'CARD_PHASE' }); });
    await page.evaluate(() => { playCard(0); });
    const blockDuringRelease = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockDuringRelease, 10, 'expected 10 block against a release of 24, got ' + blockDuringRelease);
    await page.close();
  });

  await runTest('Item B-h: every intent label and hover is not empty', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const kinds = [
      { kind: 'attack', min: 10, max: 10 },
      { kind: 'charge', release: 24, breakAt: 15 },
      { kind: 'afflict', stacks: 4 }
    ];
    for (const k of kinds) {
      await page.evaluate((kk) => { updateEnemy({ pattern: [kk], patternIndex: 0 }); runPhase('START_OF_TURN'); }, k);
      const v = await page.evaluate(() => ({ value: document.getElementById('enemyIntentValue').textContent, title: document.getElementById('enemyIntentValue').title }));
      assert.ok(v.value && v.value.length > 0, 'label must not be empty for ' + k.kind);
      assert.ok(v.title && v.title.length > 0, 'hover must not be empty for ' + k.kind);
      if (k.kind === 'charge') {
        // also check the release/broken labels
        await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); });
        const v2 = await page.evaluate(() => ({ value: document.getElementById('enemyIntentValue').textContent, title: document.getElementById('enemyIntentValue').title }));
        assert.ok(v2.value && v2.value.length > 0, 'release/broken label must not be empty');
        assert.ok(v2.title && v2.title.length > 0, 'release/broken hover must not be empty');
      }
    }
    await page.close();
  });

  // BUILD 142 (item B) deliberately changes what this test was checking:
  // the opening enemy (Verger) no longer rolls a flat intentMin/intentMax
  // band (4-12) — it now acts from its own literal, final-numbers pattern
  // ([attack 6-9, attack 6-9], GAME_CONFIG.ENEMIES.verger_opening), so the
  // exact per-round numbers captured in the BUILD 140 baseline file no
  // longer apply. Updated under BUILD 142's own test rule: the strict
  // baseline comparison is dropped (the file itself is BUILD-140-shaped
  // and would now fail by design), replaced with a check that every
  // sampled value actually falls inside Verger's new attack range — still
  // a real behavioural assertion, not a spec-only one.
  await runTest('Item B-i (BUILD 142 update): seeded run — first 8 opening-fight intent values fall inside Verger\'s new 6-9 attack range', async () => {
    const page = await browser.newPage();
    page.on('dialog', function(d) { d.accept(); });
    // Same seeding approach used for the BUILD 140 baseline capture (see
    // tests/build141_capture_baseline.js): page.addInitScript() installs a
    // seeded PRNG before any js/ file runs, so every Math.random() call
    // (including the intent roll and every shuffle) is reproducible.
    await page.addInitScript(() => {
      let seed = 12345;
      Math.random = function() {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
    });
    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
    await page.evaluate(() => { devChromeOpen = true; });
    await enterOpeningFight(page);
    const values = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE' || gameState.turn.phase === 'CARD_PHASE');
      const v = await page.evaluate(() => gameState.enemy.currentEntry.rolledValue);
      values.push(v);
      // End the round with no cards played: advance from wherever we are
      // (CARD_PHASE once the auto-advance chain reaches it) straight
      // through to the next round's own ROLL_PHASE/CARD_PHASE.
      await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
      await page.evaluate(() => { autoAdvance(); });
      await page.waitForFunction((round) => gameState.turn.round > round || gameState.run.status !== 'active', i + 1, { timeout: 15000 }).catch(() => {});
    }
    console.log('  live intent sequence: ' + JSON.stringify(values));
    values.forEach(function(v) {
      assert.ok(v >= 6 && v <= 9, 'expected every opening-fight Attack value inside Verger\'s new 6-9 range, got ' + v);
    });
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — enemy dice of any size, Wrath, Drain, Seal
  // ---------------------------------------------------------------

  await runTest('Item C-a: 6-row and 12-row test dice render with the right number of rows', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    for (const size of [6, 12]) {
      await page.evaluate((s) => { devSetTestDie(s, 'enemy_buff_poison'); refreshInspector(); }, size);
      const rowCount = await page.evaluate(() => document.getElementById('enemyDieList').querySelectorAll('.die-row').length);
      assert.strictEqual(rowCount, size, 'expected ' + size + ' rows, got ' + rowCount);
    }
    await page.close();
  });

  await runTest('Item C-b: Wrath +2 leaves this round\'s shown Attack unchanged, adds 2 next round', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'attack', min: 10, max: 10 }], patternIndex: 0 });
      runPhase('START_OF_TURN');
    });
    const valueBefore = await page.evaluate(() => gameState.enemy.currentEntry.rolledValue);
    assert.strictEqual(valueBefore, 10, 'expected the unmodified Attack value 10');
    await page.evaluate(() => { callListeners('ENEMY_BUFF_TRIGGER', { buffId: 'enemy_buff_wrath', faceNumber: 5 }); });
    const stillSameRound = await page.evaluate(() => gameState.enemy.currentEntry.rolledValue);
    assert.strictEqual(stillSameRound, 10, 'Wrath triggered mid-round must not change this round\'s already-shown value');
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); });
    const valueAfter = await page.evaluate(() => gameState.enemy.currentEntry.rolledValue);
    assert.strictEqual(valueAfter, 12, 'expected next round\'s Attack to be 10+2=12, got ' + valueAfter);
    await page.close();
  });

  await runTest('Item C-c: Drain gives 2 soul at the next round start, then 3 the round after', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { callListeners('ENEMY_BUFF_TRIGGER', { buffId: 'enemy_buff_drain', faceNumber: 5 }); });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); });
    const soul1 = await page.evaluate(() => gameState.player.soul);
    assert.strictEqual(soul1, 2, 'expected 2 soul the round after Drain triggers, got ' + soul1);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); });
    const soul2 = await page.evaluate(() => gameState.player.soul);
    assert.strictEqual(soul2, 3, 'expected soul back to 3 the round after that, got ' + soul2);
    await page.close();
  });

  await runTest('Item C-d: Seal picks the heaviest face (ties to lowest number), never 1/20, and a Sealed face rolled gives 2 block', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Load two mods of equal weight on faces 5 and 8 (tie -> lowest, 5), a heavier one on face 12.
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite', weight: 2 });
      newFaces[7] = Object.assign({}, newFaces[7], { modId: 'sanctuary', weight: 2 });
      newFaces[11] = Object.assign({}, newFaces[11], { modId: 'penance', weight: 3 });
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { callListeners('ENEMY_BUFF_TRIGGER', { buffId: 'enemy_buff_seal', faceNumber: 5 }); });
    const queued = await page.evaluate(() => gameState.player.sealNextRound);
    assert.deepStrictEqual(queued, [12], 'expected the heaviest face (12, weight 3) to be queued, got ' + JSON.stringify(queued));

    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); runPhase('START_OF_TURN'); });
    const sealed = await page.evaluate(() => gameState.turn.sealedFaces);
    assert.deepStrictEqual(sealed, [12], 'expected face 12 to be active-sealed this round');

    const before = await page.evaluate(() => ({ block: gameState.player.block, expected: GAME_CONFIG.BLANK_ROLL_BLOCK }));
    await page.evaluate(() => { resolvePlayerRoll(gameState.die.faces[11]); });
    const blockAfter = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockAfter - before.block, before.expected, 'expected a Sealed face rolled to give the plain blank block');
    await page.close();
  });

  await runTest('Item C-e: a Sealed Bound face is skipped by the Bound scan and by a Nat 20 sweep', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'unison' });  // Bound (printed tag)
      newFaces[6] = Object.assign({}, newFaces[6], { modId: 'accord' });  // Bound (printed tag), rolled face
      updateDie({ faces: newFaces });
      updateTurn({ sealedFaces: [5] });
    });
    const hpBeforeScan = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { resolvePlayerRoll(gameState.die.faces[6]); });
    await page.waitForTimeout(1200);
    const hpAfterScan = await page.evaluate(() => gameState.enemy.hp);
    // Accord (10 block) alone triggers; Unison (6 damage) on the Sealed
    // face 5 must NOT — so no enemy damage happens from this scan.
    assert.strictEqual(hpBeforeScan, hpAfterScan, 'a Sealed Bound face must not fire in the Bound scan');

    // Nat 20 sweep: face 20 rolled, sealed face 5 (loaded, Bound) must not trigger either.
    const hpBeforeNat = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { resolvePlayerRoll(gameState.die.faces[19]); });
    await page.waitForTimeout(1500);
    const hpAfterNat = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(hpBeforeNat, hpAfterNat, 'a Sealed loaded face must not fire in a Nat 20 sweep');
    await page.close();
  });

  await runTest('Item C-f: Reverberation on a Sealed face gives 2 block', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' });
      updateDie({ faces: newFaces });
      updateTurn({ sealedFaces: [5], rolledFaceNumber: 5, rollOutcome: 'blank' });
    });
    const blockBefore = await page.evaluate(() => gameState.player.block);
    await page.evaluate(() => { triggerFaceOutsideRoll(5); });
    const blockAfter = await page.evaluate(() => gameState.player.block);
    assert.strictEqual(blockAfter - blockBefore, 2, 'expected a Sealed face outside-triggered (Reverberation\'s own path) to give 2 block, got ' + (blockAfter - blockBefore));
    await page.close();
  });

  await runTest('Item C-g: every buff hover and label is not empty', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    for (const buffId of ['enemy_buff_wrath', 'enemy_buff_drain', 'enemy_buff_seal']) {
      const title = await page.evaluate((id) => faceHoverText({ number: 5, modId: id, modId2: null, weight: 1 }, 0), buffId);
      assert.ok(title && title.length > 0, 'expected non-empty hover for ' + buffId);
    }
    // WRATH/DRAIN panel stats
    await page.evaluate(() => { updateEnemy({ wrath: 4 }); updatePlayer({ drainNextRound: 1 }); renderStats(); });
    const v = await page.evaluate(() => ({
      wrathText: document.getElementById('enemyWrathValue').textContent,
      wrathTitle: document.getElementById('enemyWrathValue').title,
      drainText: document.getElementById('playerDrainValue').textContent,
      drainTitle: document.getElementById('playerDrainValue').title
    }));
    assert.ok(v.wrathText && v.wrathText.length > 0);
    assert.ok(v.wrathTitle && v.wrathTitle.length > 0);
    assert.ok(v.drainText && v.drainText.length > 0);
    assert.ok(v.drainTitle && v.drainTitle.length > 0);
    await page.close();
  });

  // BUILD 142 (item B.e) deliberately lowers DIE_SIZE.ELITE from 20 to 12
  // and gives the act 1 elite (now the named Lector) its own die layout —
  // updated here under BUILD 142's own test rule (named explicitly in its
  // prompt: "the existing elite and boss dice behave as in BUILD 140" no
  // longer holds for the elite half, only the boss half, which item B.f
  // leaves untouched).
  await runTest('Item C-h: the boss die behaves as in BUILD 140; the elite die is now Lector\'s own 12-sided layout (BUILD 142)', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const act = gameState.run.act;
      return {
        eliteFaces: act.upper[GAME_CONFIG.ELITE_SLOT_INDEX].enemy.die.faces.map(f => f.modId),
        bossFaces: act.boss.enemy.die.faces.map(f => f.modId)
      };
    });
    const eliteExpected = new Array(12).fill(null);
    eliteExpected[2] = 'enemy_buff_poison'; // face 3
    eliteExpected[5] = 'enemy_buff_drain';  // face 6
    eliteExpected[8] = 'enemy_buff_poison'; // face 9
    eliteExpected[11] = 'enemy_buff_wrath'; // face 12
    assert.deepStrictEqual(v.eliteFaces, eliteExpected, 'Lector\'s own die layout (12-sided, poison/drain/wrath)');
    const bossExpected = new Array(20).fill(null);
    bossExpected[0] = 'ENEMY_NAT_ONE';
    bossExpected[4] = 'enemy_buff_poison';
    bossExpected[9] = 'enemy_buff_poison';
    bossExpected[14] = 'enemy_buff_poison';
    bossExpected[19] = 'ENEMY_NAT_TWENTY';
    assert.deepStrictEqual(v.bossFaces, bossExpected, 'boss die layout must be unchanged (Hierophant reuses the exact BUILD 140 boss die)');
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build141 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
