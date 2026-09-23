// ============================================================
// TESTS/BUILD158.TEST.JS
// Standing regression suite for D-99 (odds to one decimal), D-100 (dead
// act 1 lane/die constants deleted), D-101 (boss Nat 20 forces a Charge
// instead of sweeping buff faces) and D-102/KI-37 (Load offer as three
// wireframe d20s, fixed card art box height).
// Same shape as tests/build157.test.js: plain Node script, playwright
// launched directly, node:assert. Run: node tests/build158.test.js
// ============================================================

const { chromium } = require('playwright');
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
  const page = await browser.newPage();
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
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
  // ITEM A — D-99, rollOdds() to one decimal
  // ---------------------------------------------------------------

  await runTest('D-99: rollOdds() on a 26-ticket bag returns 3.8 for weight 1 and 19.2 for weight 5', async () => {
    const page = await freshPage(browser);
    const odds = await page.evaluate(() => {
      const faces = [{ number: 1, weight: 1 }, { number: 2, weight: 5 }];
      for (let i = 0; i < 20; i++) { faces.push({ number: 100 + i, weight: 1 }); }
      return rollOdds(faces);
    });
    assert.strictEqual(odds[1].total, 26, 'the constructed bag must total 26 tickets, got ' + odds[1].total);
    assert.strictEqual(odds[1].pct, 3.8, 'weight 1 of 26 must read 3.8, got ' + odds[1].pct);
    assert.strictEqual(odds[2].pct, 19.2, 'weight 5 of 26 must read 19.2, got ' + odds[2].pct);
    await page.close();
  });

  await runTest('D-99: face row caption prints one decimal and a percent sign', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const text = await page.evaluate(() => {
      const row = document.querySelector('#playerDieList .die-row:not(.nat-one):not(.nat-twenty)');
      return row.querySelector('.die-face-caption').textContent;
    });
    assert.ok(/^\d+\.\d%$/.test(text), 'a face caption must read one decimal followed by a percent sign, got: ' + JSON.stringify(text));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — D-100, dead act 1 lane/die constants deleted
  // ---------------------------------------------------------------

  await runTest('D-100: ACT1_LANE_FIGHT_HP has four values; ELITE_DIE, BOSS_DIE and verger_lane no longer exist', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      laneHp: GAME_CONFIG.ACT1_LANE_FIGHT_HP,
      eliteDie: GAME_CONFIG.ELITE_DIE,
      bossDie: GAME_CONFIG.BOSS_DIE,
      vergerLane: GAME_CONFIG.ENEMIES.verger_lane
    }));
    assert.deepStrictEqual(v.laneHp, [58, 65, 78, 85], 'ACT1_LANE_FIGHT_HP must now hold exactly four values');
    assert.strictEqual(v.eliteDie, undefined, 'GAME_CONFIG.ELITE_DIE must be deleted');
    assert.strictEqual(v.bossDie, undefined, 'GAME_CONFIG.BOSS_DIE must be deleted');
    assert.strictEqual(v.vergerLane, undefined, 'GAME_CONFIG.ENEMIES.verger_lane must be deleted');
    await page.close();
  });

  await runTest('D-100: act 1 upper lane positions 1-4 (indices 0,2,5,6) carry HP 58/65/78/85', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const act = buildAct(1);
      return {
        p1: act.upper[0].enemy.hp,
        p2: act.upper[2].enemy.hp,
        p3: act.upper[5].enemy.hp,
        p4: act.upper[6].enemy.hp
      };
    });
    assert.strictEqual(v.p1, 58);
    assert.strictEqual(v.p2, 65);
    assert.strictEqual(v.p3, 78);
    assert.strictEqual(v.p4, 85);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — D-101, boss Nat 20 forces a Charge
  // ---------------------------------------------------------------

  await runTest('D-101: a forced Hierophant Nat 20 with no Charge running sets a charge intent for next round and applies no poison', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    const before = await page.evaluate(() => gameState.player.poisonStacks);
    const chargeEntry = await page.evaluate(() => gameState.enemy.pattern.filter(function(e) { return e.kind === 'charge'; })[0]);
    await page.evaluate(() => { forceEnemyRoll(20); }); // boss face 20 = ENEMY_NAT_TWENTY
    const after = await page.evaluate(() => ({ poison: gameState.player.poisonStacks, forced: gameState.enemy.forcedNextIntent }));
    assert.strictEqual(after.poison, before, 'no poison must be applied to the player');
    assert.deepStrictEqual(after.forced, { kind: 'charge', release: chargeEntry.release, breakAt: chargeEntry.breakAt }, 'forcedNextIntent must be set to the pattern\'s own charge entry');
    await page.close();
  });

  await runTest('D-101: a forced Nat 20 during a wind-up changes nothing', async () => {
    const page = await freshPage(browser);
    await page.click('#startGameBtn');
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
    await page.evaluate(() => {
      updateEnemy({ chargeStage: 'windup' });
    });
    const before = await page.evaluate(() => ({ forced: gameState.enemy.forcedNextIntent, stage: gameState.enemy.chargeStage }));
    await page.evaluate(() => { callListeners('ENEMY_NAT_TWENTY', {}); });
    const after = await page.evaluate(() => ({ forced: gameState.enemy.forcedNextIntent, stage: gameState.enemy.chargeStage }));
    assert.strictEqual(after.forced, null, 'forcedNextIntent must stay untouched while already winding up');
    assert.strictEqual(after.stage, before.stage, 'chargeStage must be unchanged');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — D-102/KI-37
  // ---------------------------------------------------------------

  await runTest('D-102/KI-37: the Load offer renders three wireframe die frames and no .offer-card element', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseLoad(); });
    const v = await page.evaluate(() => ({
      dieCards: document.querySelectorAll('#dieActionPanel .offer-die-card').length,
      cardCards: document.querySelectorAll('#dieActionPanel .offer-card').length
    }));
    assert.strictEqual(v.dieCards, 3, 'the Load offer must render three .offer-die-card frames, got ' + v.dieCards);
    assert.strictEqual(v.cardCards, 0, 'the Load offer must not render any .offer-card element, got ' + v.cardCards);
    await page.close();
  });

  await runTest('KI-37: a card offer with one one-line and one two-line card gets equal art box heights', async () => {
    const page = await freshPage(browser);
    const heights = await page.evaluate(() => {
      const scratch = document.createElement('div');
      scratch.style.position = 'fixed';
      scratch.style.left = '0';
      scratch.style.top = '0';
      document.body.appendChild(scratch);
      const short = offerCardSpecForCard('strike', null, 'CLICK TO CHOOSE', false, function() {});
      const long = offerCardSpecForCard('threnody', null, 'CLICK TO CHOOSE', false, function() {});
      renderOfferPanel(scratch, { title: 'test', cards: [short, long] });
      const arts = Array.from(scratch.querySelectorAll('.offer-card-art'));
      const result = arts.map(function(a) { return a.getBoundingClientRect().height; });
      scratch.remove();
      return result;
    });
    assert.strictEqual(heights.length, 2, 'both cards must render an art box');
    assert.ok(Math.abs(heights[0] - heights[1]) < 1, 'both art boxes must be the same height, got ' + JSON.stringify(heights));
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build158 tests passed.');
})();
