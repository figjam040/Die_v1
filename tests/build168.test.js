// ============================================================
// TESTS/BUILD168.TEST.JS
// Standing regression suite for BUILD 168, D-120: poison ticks at the end
// of the poisoned side's own turn (the player's at END_PLAYER_TURN, the
// enemy's at CHECK_WIN_LOSS), never at START_OF_TURN. Every timing test
// drives the real phase machine (End Turn, forced rolls, the enemy's own
// Afflict/Charge); a spy on runPhase() records both sides' HP and stacks
// as each phase is entered. Run: node tests/build168.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').split(String.fromCharCode(92)).join('/');

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

// Any wait on ROLL_PHASE needs the dev drawer's flag first (D-113).
async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function freshFight(browser) {
  const page = await freshPage(browser);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

async function rollFace(page, faceNumber) {
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

async function loadFaces(page, pairs) {
  await page.evaluate((list) => {
    const newFaces = gameState.die.faces.slice();
    list.forEach(function(p) {
      const i = newFaces.findIndex(function(f) { return f.number === p[0]; });
      newFaces[i] = Object.assign({}, newFaces[i], { modId: p[1], modId2: null });
    });
    updateDie({ faces: newFaces });
  }, pairs);
}

// This round's enemy intent, replaced by a fixed one (the Verger's own
// attack is random). rolledValue 0 is a harmless Attack.
async function setIntent(page, entry) {
  await page.evaluate((e) => { updateEnemy({ currentEntry: e }); }, entry);
}

const HARMLESS = { kind: 'attack', min: 0, max: 0, rolledValue: 0 };

// Blank roll (face 2), block back to 0, intent as given.
async function blankRound(page, entry) {
  await rollFace(page, 2);
  await page.evaluate(() => { updatePlayer({ block: 0 }); });
  if (entry) { await setIntent(page, entry); }
}

// Wraps runPhase() so every entry, recursive re-entries included, records
// both sides' HP and stacks as the phase is entered.
async function installSpy(page) {
  await page.evaluate(() => {
    window.__seq = [];
    if (!window.__origRunPhase) { window.__origRunPhase = runPhase; }
    window.runPhase = function(phase) {
      window.__seq.push({
        phase: phase, status: gameState.run.status,
        pHp: gameState.player.hp, pStacks: gameState.player.poisonStacks, pBlock: gameState.player.block,
        eHp: gameState.enemy.hp, eStacks: gameState.enemy.poisonStacks
      });
      return window.__origRunPhase(phase);
    };
  });
}

async function getSeq(page) { return page.evaluate(() => window.__seq); }

// Clicks End Turn and waits for the next round's ROLL_PHASE, or for the
// fight to end.
async function endTurn(page, nextRound) {
  await page.evaluate(() => { document.getElementById('endTurnBtn').click(); });
  await page.waitForFunction((r) => {
    return gameState.run.status !== 'active' || (gameState.turn.phase === 'ROLL_PHASE' && gameState.turn.round === r);
  }, nextRound, { timeout: 10000 });
}

function first(seq, phase) { return seq.findIndex(function(e) { return e.phase === phase; }); }

(async () => {
  const browser = await chromium.launch();

  await runTest('(a) an enemy poisoned by a Blight trigger on round 1 loses that HP at the end of round 1, before round 2 starts', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[5, 'blight']]);
    await rollFace(page, 5);
    await setIntent(page, HARMLESS);
    const before = await page.evaluate(() => ({ hp: gameState.enemy.hp, stacks: gameState.enemy.poisonStacks }));
    assert.strictEqual(before.stacks, 6, 'Blight must have applied 6 stacks of poison, got ' + before.stacks);
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const act = seq[first(seq, 'ENEMY_ACT_PHASE')];
    const cw = seq[first(seq, 'CHECK_WIN_LOSS')];
    const s2 = seq[first(seq, 'START_OF_TURN')];
    assert.ok(first(seq, 'CHECK_WIN_LOSS') < first(seq, 'START_OF_TURN'), 'CHECK_WIN_LOSS must come before the next START_OF_TURN');
    assert.strictEqual(act.eHp, before.hp, 'no tick before the enemy has acted');
    assert.strictEqual(cw.eHp, before.hp, 'no tick on entering CHECK_WIN_LOSS');
    assert.strictEqual(cw.eStacks, 6, 'stacks still 6 on entering CHECK_WIN_LOSS');
    assert.strictEqual(s2.eHp, before.hp - 6, 'the tick (6) must already have landed when round 2\'s START_OF_TURN is entered, got ' + s2.eHp);
    assert.strictEqual(s2.eStacks, 5, 'stacks read 5 on entering round 2');
    const after = await page.evaluate(() => ({ hp: gameState.enemy.hp, stacks: gameState.enemy.poisonStacks, round: gameState.turn.round }));
    assert.strictEqual(after.round, 2);
    assert.strictEqual(after.hp, before.hp - 6, 'exactly one tick, none at START_OF_TURN');
    assert.strictEqual(after.stacks, 5);
    await page.close();
  });

  await runTest('(b) a player afflicted 4 on round 1 takes nothing then, takes 4 at the end of round 2\'s player turn before the enemy acts, and reads 3 stacks', async () => {
    const page = await freshFight(browser);
    await blankRound(page, { kind: 'afflict', stacks: 4 });
    const hp0 = await page.evaluate(() => gameState.player.hp);
    await installSpy(page);
    await endTurn(page, 2);
    const r1 = await page.evaluate(() => ({ hp: gameState.player.hp, stacks: gameState.player.poisonStacks }));
    assert.strictEqual(r1.stacks, 4, 'Afflict must have applied 4 stacks, got ' + r1.stacks);
    assert.strictEqual(r1.hp, hp0, 'no damage in round 1 (Afflict deals none, nothing ticks at START_OF_TURN)');

    await blankRound(page, { kind: 'attack', min: 3, max: 3, rolledValue: 3 });
    await installSpy(page);
    await endTurn(page, 3);
    const seq = await getSeq(page);
    const endT = seq[first(seq, 'END_PLAYER_TURN')];
    const roll = seq[first(seq, 'ENEMY_ROLL_PHASE')];
    const act = seq[first(seq, 'ENEMY_ACT_PHASE')];
    const s3 = seq[first(seq, 'START_OF_TURN')];
    assert.strictEqual(endT.pHp, hp0, 'no tick before END_PLAYER_TURN');
    assert.strictEqual(endT.pStacks, 4);
    assert.strictEqual(roll.pHp, hp0 - 4, 'the 4 must land before the enemy rolls, got ' + roll.pHp);
    assert.strictEqual(roll.pStacks, 3);
    assert.strictEqual(act.pHp, hp0 - 4, 'the enemy acts after the tick');
    assert.strictEqual(s3.pHp, hp0 - 4 - 3, 'the enemy\'s Attack (3) lands after the tick, nothing at START_OF_TURN');
    const r2 = await page.evaluate(() => ({ hp: gameState.player.hp, stacks: gameState.player.poisonStacks }));
    assert.strictEqual(r2.stacks, 3, 'stacks read 3 after the tick');
    assert.strictEqual(r2.hp, hp0 - 7);
    await page.close();
  });

  await runTest('(c) block reduces neither tick, and is not spent by the player\'s', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 2);
    await setIntent(page, HARMLESS);
    // 4 block is under the poison answer's 5-per-stack, so only the tick acts.
    await page.evaluate(() => { updatePlayer({ block: 4, poisonStacks: 4 }); updateEnemy({ poisonStacks: 3 }); });
    const before = await page.evaluate(() => ({ p: gameState.player.hp, e: gameState.enemy.hp, enemyHasBlock: gameState.enemy.block !== undefined }));
    assert.strictEqual(before.enemyHasBlock, false, 'enemies have no block field');
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const roll = seq[first(seq, 'ENEMY_ROLL_PHASE')];
    assert.strictEqual(roll.pHp, before.p - 4, 'the full 4 lands despite 4 block, got ' + (before.p - roll.pHp));
    assert.strictEqual(roll.pBlock, 4, 'block is read, not spent');
    const s2 = seq[first(seq, 'START_OF_TURN')];
    assert.strictEqual(s2.eHp, before.e - 3, 'the enemy\'s tick lands in full');
    await page.close();
  });

  await runTest('(d) an enemy at 3 HP with 3 stacks dies from its tick and the fight is won before round 2 starts', async () => {
    const page = await freshFight(browser);
    await blankRound(page, HARMLESS);
    await page.evaluate(() => { updateEnemy({ hp: 3, poisonStacks: 3 }); });
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const v = await page.evaluate(() => ({ status: gameState.run.status, hp: gameState.enemy.hp, round: gameState.turn.round, outcome: gameState.run.outcome }));
    assert.strictEqual(v.status, 'win', 'the fight must be won, got ' + v.status);
    assert.ok(v.hp <= 0, 'enemy HP at or below 0, got ' + v.hp);
    assert.strictEqual(v.round, 1, 'round 2 never started');
    assert.strictEqual(first(seq, 'START_OF_TURN'), -1, 'START_OF_TURN must never be entered again');
    assert.ok(first(seq, 'CHECK_WIN_LOSS') !== -1, 'the kill came at CHECK_WIN_LOSS');
    await page.close();
  });

  await runTest('(e) a player at 4 HP with 4 stacks dies from their tick and the enemy never rolls or acts', async () => {
    const page = await freshFight(browser);
    await blankRound(page, { kind: 'attack', min: 5, max: 5, rolledValue: 5 });
    await page.evaluate(() => { updatePlayer({ hp: 4, poisonStacks: 4, block: 0 }); });
    const idx0 = await page.evaluate(() => gameState.enemy.patternIndex);
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const v = await page.evaluate(() => ({ status: gameState.run.status, outcome: gameState.run.outcome, hp: gameState.player.hp, idx: gameState.enemy.patternIndex, round: gameState.turn.round }));
    assert.strictEqual(v.status, 'loss', 'the fight must be lost, got ' + v.status);
    assert.strictEqual(v.outcome, 'lost');
    assert.ok(v.hp <= 0 && v.hp >= 0, 'HP exactly 0 (the enemy\'s Attack never landed), got ' + v.hp);
    assert.strictEqual(first(seq, 'ENEMY_ROLL_PHASE'), -1, 'the enemy must not roll');
    assert.strictEqual(first(seq, 'ENEMY_ACT_PHASE'), -1, 'the enemy must not act');
    assert.strictEqual(v.idx, idx0, 'the enemy\'s pattern never advanced');
    assert.strictEqual(v.round, 1);
    await page.close();
  });

  // A Charge started on round 1's END is winding up in round 2; only the
  // tick that ends round 2 can push HP lost past the break number.
  async function chargeCase(stacks, breakAt) {
    const page = await freshFight(browser);
    await blankRound(page, HARMLESS);
    await page.evaluate((b) => { devSetNextIntent({ kind: 'charge', release: 24, breakAt: b }); }, breakAt);
    await endTurn(page, 2);
    const wind = await page.evaluate(() => ({ stage: gameState.enemy.chargeStage, startHp: gameState.enemy.windupStartHp, hp: gameState.enemy.hp }));
    assert.strictEqual(wind.stage, 'windup', 'round 2 must open with the wind-up');
    await rollFace(page, 2);
    await page.evaluate((s) => { updateEnemy({ poisonStacks: s }); }, stacks);
    await installSpy(page);
    await endTurn(page, 3);
    const seq = await getSeq(page);
    const s3 = seq[first(seq, 'START_OF_TURN')];
    assert.strictEqual(s3.eHp, wind.startHp - stacks, 'the round 2 tick must land before round 3 starts');
    const v = await page.evaluate(() => ({ stage: gameState.enemy.chargeStage, broken: gameState.enemy.chargeBroken }));
    assert.strictEqual(v.stage, 'release');
    await page.close();
    return v.broken;
  }

  await runTest('(f) a Charge breaks when the wind-up round\'s own tick reaches the break number, and only then', async () => {
    assert.strictEqual(await chargeCase(6, 6), true, '6 stacks ticking for 6 against breakAt 6 must break');
    assert.strictEqual(await chargeCase(5, 6), false, '5 stacks ticking for 5 against breakAt 6 must not break');
  });

  await runTest('the poison answer still runs first: 12 block, 4 stacks removes 2, the tick then deals 2', async () => {
    const page = await freshFight(browser);
    await blankRound(page, HARMLESS);
    await page.evaluate(() => { updatePlayer({ block: 12, poisonStacks: 4 }); });
    const hp0 = await page.evaluate(() => gameState.player.hp);
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const roll = seq[first(seq, 'ENEMY_ROLL_PHASE')];
    assert.strictEqual(roll.pHp, hp0 - 2, 'the tick must deal 2 (stacks after the answer), got ' + (hp0 - roll.pHp));
    assert.strictEqual(roll.pStacks, 1, 'stacks 4 - 2 (answer) - 1 (tick decay) = 1');
    await page.close();
  });

  await runTest('round order as built: player tick between END_PLAYER_TURN and ENEMY_ROLL_PHASE, enemy tick between CHECK_WIN_LOSS and START_OF_TURN', async () => {
    const page = await freshFight(browser);
    await blankRound(page, HARMLESS);
    await page.evaluate(() => { updatePlayer({ poisonStacks: 3 }); updateEnemy({ poisonStacks: 3 }); });
    await installSpy(page);
    await endTurn(page, 2);
    const seq = await getSeq(page);
    const phases = seq.map(function(e) { return e.phase; });
    assert.deepStrictEqual(phases, ['END_PLAYER_TURN', 'ENEMY_ROLL_PHASE', 'ENEMY_ACT_PHASE', 'CHECK_WIN_LOSS', 'START_OF_TURN', 'ROLL_PHASE']);
    const changes = function(key) {
      const at = [];
      for (let i = 1; i < seq.length; i++) { if (seq[i][key] !== seq[i - 1][key]) { at.push(seq[i].phase); } }
      return at;
    };
    assert.deepStrictEqual(changes('pStacks'), ['ENEMY_ROLL_PHASE'], 'the player\'s stacks only change on the way into ENEMY_ROLL_PHASE');
    assert.deepStrictEqual(changes('eStacks'), ['START_OF_TURN'], 'the enemy\'s stacks only change on the way into START_OF_TURN');
    await page.close();
  });

  await runTest('(g) no poison write remains in phase-machine.js\'s START_OF_TURN branch; the ticks sit in END_PLAYER_TURN and CHECK_WIN_LOSS; the answer listens on END_PLAYER_TURN', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'phase-machine.js'), 'utf8');
    const branch = function(from, to) {
      const a = src.indexOf("if (phase === '" + from + "') {");
      const b = src.indexOf("if (phase === '" + to + "') {");
      assert.ok(a !== -1 && b > a, 'branch ' + from + ' not found');
      return src.slice(a, b);
    };
    const sot = branch('START_OF_TURN', 'ROLL_PHASE');
    assert.ok(!/poisonStacks|tickPlayerPoison|tickEnemyPoison|\[POISON\]/.test(sot), 'START_OF_TURN must not touch poison');
    assert.ok(/tickPlayerPoison\(\)/.test(branch('END_PLAYER_TURN', 'ENEMY_ROLL_PHASE')), 'END_PLAYER_TURN must tick the player');
    const cw = src.slice(src.indexOf("if (phase === 'CHECK_WIN_LOSS') {"));
    assert.ok(/tickEnemyPoison\(\)/.test(cw), 'CHECK_WIN_LOSS must tick the enemy');
    assert.strictEqual((src.match(/tickPlayerPoison\(\)/g) || []).length, 2, 'one definition, one call');
    assert.strictEqual((src.match(/tickEnemyPoison\(\)/g) || []).length, 2, 'one definition, one call');
    const cards = fs.readFileSync(path.join(ROOT, 'js', 'cards-mods.js'), 'utf8');
    assert.ok(/registerListener\('END_PLAYER_TURN', 'poison_answer_passive'/.test(cards), 'the poison answer must listen on END_PLAYER_TURN');
    assert.ok(!/registerListener\('START_OF_TURN', 'poison_answer_passive'/.test(cards), 'and no longer on START_OF_TURN');
    const page = await freshPage(browser);
    const ids = await page.evaluate(() => {
      const l = gameState.registry.listeners;
      const idsOf = function(h) { return (l[h] || []).map(function(x) { return x.id; }); };
      return { start: idsOf('START_OF_TURN'), end: idsOf('END_PLAYER_TURN') };
    });
    assert.ok(ids.end.indexOf('poison_answer_passive') !== -1, 'registered on END_PLAYER_TURN');
    assert.strictEqual(ids.start.indexOf('poison_answer_passive'), -1, 'absent from START_OF_TURN');
    await page.close();
  });

  await runTest('(h) no player-facing string, doc line or header line puts poison at the start of a turn', async () => {
    const page = await freshFight(browser);
    const tips = await page.evaluate(() => {
      updatePlayer({ poisonStacks: 2 });
      updateEnemy({ poisonStacks: 2 });
      refreshInspector();
      const playerTip = document.getElementById('playerDebuffsValue').querySelector('.hover-tip');
      const playerIcon = document.querySelector('#playerStatusRow .status-poison');
      const enemyIcon = document.querySelector('#enemyStatusRow .status-poison');
      return {
        playerDebuff: playerTip ? playerTip.textContent : '',
        playerIcon: playerIcon ? playerIcon.textContent : '',
        enemyIcon: enemyIcon ? enemyIcon.textContent : ''
      };
    });
    assert.ok(/end of your turn/i.test(tips.playerDebuff), 'player poison tip must say end of your turn: ' + tips.playerDebuff);
    assert.ok(/end of its turn/i.test(tips.enemyIcon), 'enemy poison icon tip must say end of its turn: ' + tips.enemyIcon);
    [tips.playerDebuff, tips.playerIcon, tips.enemyIcon].forEach(function(t) {
      assert.ok(!/start of/i.test(t), 'a poison tip must not say start of: ' + t);
    });
    await page.close();

    const bad = /start of (?:(?:your|the|each|its|every|next) )?(?:turn|round)/i;
    const badHook = /(?:at|on|each|every) START_OF_TURN/;
    const files = fs.readdirSync(path.join(ROOT, 'js')).map(function(f) { return path.join('js', f); }).concat(['index.html', 'CLAUDE.md']);
    const offenders = [];
    files.forEach(function(rel) {
      fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach(function(line, i) {
        const re = /poison/gi;
        let m;
        while ((m = re.exec(line)) !== null) {
          const near = line.slice(Math.max(0, m.index - 100), m.index + 100);
          if (bad.test(near) || badHook.test(near)) { offenders.push(rel + ':' + (i + 1) + ': ' + near.trim()); break; }
        }
      });
    });
    assert.deepStrictEqual(offenders, [], 'poison timing wording left at the start of a turn:\n' + offenders.join('\n'));
  });

  await browser.close();

  const passed = results.filter(function(r) { return r.pass; }).length;
  console.log('\n' + passed + '/' + results.length + ' build168 tests passed.');
  if (passed !== results.length) {
    console.log('FAILURES:');
    results.filter(function(r) { return !r.pass; }).forEach(function(r) { console.log(' - ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
})();
