// ============================================================
// TESTS/BUILD162.TEST.JS
// Standing regression suite for BUILD 162: D-103/KI-42 (the enemy's own
// face row under its art, with a dev force-roll click) and D-107 (the
// stepped die roll animation on both die icons). Same shape as
// tests/build161.test.js: plain Node script, playwright launched
// directly, node:assert.
// Run: node tests/build162.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');

const VIEWPORT = { width: 1600, height: 900 };

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
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterSlotFight(page, fn) {
  await page.evaluate(fn);
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

// Squares in the enemy row, and whether the row draws at all.
function readEnemyRow(page) {
  return page.evaluate(() => {
    const row = document.getElementById('enemyDieList');
    return {
      squares: row.querySelectorAll('.die-row .face-btn').length,
      visible: row.getClientRects().length > 0
    };
  });
}

// The enemy row's own square for one face number (rows are built face N
// first, so key off the printed number, never position).
function enemyFaceSelector(n) {
  return '#enemyDieList .die-row:nth-child(' + n + ') .face-btn';
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — D-103: the enemy's own face row
  // ---------------------------------------------------------------

  await runTest('D-103: enemy row squares — elite 12, boss 20, opening normal none', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { enterSlot('opening', null); });
    const opening = await readEnemyRow(page);
    assert.strictEqual(opening.squares, 0, 'the dieless opening fight must show no enemy squares, got ' + opening.squares);
    assert.strictEqual(opening.visible, false, 'the dieless opening fight must draw no enemy row');
    await page.close();

    const page2 = await freshPage(browser);
    await enterSlotFight(page2, () => { devJumpToSlot('upper', GAME_CONFIG.ELITE_SLOT_INDEX); });
    const elite = await readEnemyRow(page2);
    assert.strictEqual(elite.squares, 12, 'the elite row must hold 12 squares, got ' + elite.squares);
    assert.strictEqual(elite.visible, true, 'the elite row must be visible in the fight');
    await page2.close();

    const page3 = await freshPage(browser);
    await enterSlotFight(page3, () => { devJumpToSlot('boss', null); });
    const boss = await readEnemyRow(page3);
    assert.strictEqual(boss.squares, 20, 'the boss row must hold 20 squares, got ' + boss.squares);
    await page3.close();
  });

  await runTest('D-103: Lector faces 3 and 9 carry the buff class, blank faces do not; face 3\'s hover tip names its poison', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { devJumpToSlot('upper', GAME_CONFIG.ELITE_SLOT_INDEX); });
    const v = await page.evaluate(() => {
      const byNumber = {};
      document.querySelectorAll('#enemyDieList .die-row').forEach(function(row) {
        byNumber[row.querySelector('.face-num').textContent] = row;
      });
      const tip = byNumber['3'].querySelector('.hover-tip');
      return {
        name: gameState.enemy.name,
        three: byNumber['3'].classList.contains('loaded'),
        nine: byNumber['9'].classList.contains('loaded'),
        blankTwo: byNumber['2'].classList.contains('loaded'),
        tipText: tip ? tip.textContent : '',
        captions: document.querySelectorAll('#enemyDieList .die-face-caption').length
      };
    });
    assert.strictEqual(v.name, 'Lector');
    assert.strictEqual(v.three, true, 'face 3 must carry the buff class');
    assert.strictEqual(v.nine, true, 'face 9 must carry the buff class');
    assert.strictEqual(v.blankTwo, false, 'blank face 2 must not carry the buff class');
    assert.ok(v.tipText.indexOf('poison') !== -1, 'face 3 hover must name its poison buff, got: ' + v.tipText);
    assert.strictEqual(v.captions, 0, 'the enemy row must carry no percent captions, got ' + v.captions);
    await page.close();
  });

  await runTest('D-103: under a reward layer the enemy row is hidden and the player row is still visible', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { devJumpToSlot('upper', GAME_CONFIG.ELITE_SLOT_INDEX); });
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    await page.waitForFunction(() => document.getElementById('fightScreen').classList.contains('reward-layer-active'));
    const v = await page.evaluate(() => ({
      enemyRow: document.getElementById('enemyDieList').getClientRects().length > 0,
      playerRow: document.getElementById('playerDieList').getClientRects().length > 0
    }));
    assert.strictEqual(v.enemyRow, false, 'the enemy row must not be visible under the reward layer');
    assert.strictEqual(v.playerRow, true, 'the player row must stay visible under the reward layer');
    await page.close();
  });

  await runTest('D-103: drawer open, clicking boss face 20 in ENEMY_ROLL_PHASE forces it, and the next round is a Charge (D-101)', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const before = await page.evaluate(() => ({ stage: gameState.enemy.chargeStage, name: gameState.enemy.name }));
    assert.strictEqual(before.stage, null, 'no Charge may be running before the click');
    await page.click(enemyFaceSelector(1)); // face 20 is the row's first-built square
    const v = await page.evaluate(() => ({
      logged: document.getElementById('log').textContent.indexOf('[DEV] forced roll: face 20') !== -1,
      rolled: gameState.turn.enemyRolledFaceNumber,
      forced: gameState.enemy.forcedNextIntent
    }));
    assert.strictEqual(v.logged, true, 'the click must log a forced roll of face 20');
    assert.strictEqual(v.rolled, 20, 'the enemy roll must be face 20, got ' + v.rolled);
    await advanceUntilPhase(page, 'CARD_PHASE');
    const next = await page.evaluate(() => ({ kind: gameState.enemy.currentEntry && gameState.enemy.currentEntry.kind, stage: gameState.enemy.chargeStage }));
    assert.strictEqual(next.kind, 'charge', before.name + '\'s next intent must be a Charge, got ' + next.kind);
    await page.close();
  });

  await runTest('D-103: drawer closed, clicking an enemy face does nothing', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    await page.evaluate(() => { devChromeOpen = false; refreshInspector(); });
    await page.click(enemyFaceSelector(1));
    const v = await page.evaluate(() => ({
      phase: gameState.turn.phase,
      rolled: gameState.turn.enemyRolledFaceNumber,
      logged: document.getElementById('log').textContent.indexOf('[DEV] forced roll') !== -1
    }));
    assert.strictEqual(v.phase, 'ENEMY_ROLL_PHASE', 'the phase must not move');
    assert.strictEqual(v.rolled, null, 'no enemy roll may resolve, got ' + v.rolled);
    assert.strictEqual(v.logged, false, 'no forced roll may be logged');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — D-107: the die roll animation
  // ---------------------------------------------------------------

  await runTest('D-107: DIE_ROLL_ANIMATION holds a frame count and a duration', async () => {
    const page = await freshPage(browser);
    const cfg = await page.evaluate(() => GAME_CONFIG.DIE_ROLL_ANIMATION);
    assert.ok(cfg, 'GAME_CONFIG.DIE_ROLL_ANIMATION must exist');
    assert.strictEqual(cfg.FRAME_COUNT, 5, 'FRAME_COUNT must be 5, got ' + cfg.FRAME_COUNT);
    assert.strictEqual(cfg.DURATION_MS, 400, 'DURATION_MS must be 400, got ' + cfg.DURATION_MS);
    await page.close();
  });

  await runTest('D-107: mid-roll the icon spins and the face row is dark; after, the icon shows the rolled number upright and the face lights', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { enterSlot('opening', null); });
    const mid = await page.evaluate(() => {
      forcePlayerRoll(10);
      const wrap = document.querySelector('#playerDieIcon .die-icon-wrap');
      return {
        stage: wrap.dataset.rollAnim,
        transform: wrap.style.transform,
        lit: document.querySelectorAll('#playerDieList .die-row-rolled, #playerDieList .die-row-rolled-flash').length
      };
    });
    assert.strictEqual(mid.stage, 'spin', 'the icon must be spinning right after the roll, got ' + mid.stage);
    assert.ok(mid.transform.indexOf('rotate') !== -1, 'a spinning frame must be rotated, got ' + mid.transform);
    assert.strictEqual(mid.lit, 0, 'the face row must not light before the icon stops, got ' + mid.lit);

    await page.waitForFunction(() => dieRollAnimationsIdle());
    const end = await page.evaluate(() => {
      const wrap = document.querySelector('#playerDieIcon .die-icon-wrap');
      const num = document.querySelector('#playerDieIcon .die-icon-number-text');
      return {
        number: num ? num.textContent : '',
        rolled: gameState.turn.rolledFaceNumber,
        transform: wrap.style.transform,
        lit: document.querySelectorAll('#playerDieList .die-row-rolled, #playerDieList .die-row-rolled-flash').length
      };
    });
    assert.strictEqual(end.number, String(end.rolled), 'the icon must end on the rolled number ' + end.rolled + ', got ' + end.number);
    assert.strictEqual(end.transform, 'none', 'the icon must end upright, got ' + end.transform);
    assert.strictEqual(end.lit, 1, 'the rolled face must light once the icon stops, got ' + end.lit);
    await page.close();
  });

  await runTest('D-107: the enemy icon animates its own roll and the enemy row holds the rolled face after', async () => {
    const page = await freshPage(browser);
    await enterSlotFight(page, () => { devJumpToSlot('upper', GAME_CONFIG.ELITE_SLOT_INDEX); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const stage = await page.evaluate(() => {
      forceEnemyRoll(3);
      return document.querySelector('#enemyDieIcon .die-icon-wrap').dataset.rollAnim;
    });
    assert.strictEqual(stage, 'spin', 'the enemy icon must spin on its roll, got ' + stage);
    await page.waitForFunction(() => dieRollAnimationsIdle());
    const v = await page.evaluate(() => {
      const num = document.querySelector('#enemyDieIcon .die-icon-number-text');
      const lit = Array.from(document.querySelectorAll('#enemyDieList .die-row-rolled, #enemyDieList .die-row-rolled-flash'))
        .map(r => r.querySelector('.face-num').textContent);
      return { number: num ? num.textContent : '', lit: lit };
    });
    assert.strictEqual(v.number, '3', 'the enemy icon must end on 3, got ' + v.number);
    assert.deepStrictEqual(v.lit, ['3'], 'the enemy row must light face 3 alone, got ' + JSON.stringify(v.lit));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build162 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
