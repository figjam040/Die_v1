// Standing regression suite for BUILD 182: D-131 no trigger cap (the freeze
// guard and the trigger queue), sweep pacing, and D-134 the chains
// (Reliquary Chain on any Bound trigger, Rosary its mirror).
// Run: node tests/build182.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL } = require('./shared-constants');

const { runTest, report } = createRunner();

const GUARD = 500;
const OLD_CAP = 10;
const EXPECTED_ARTIFACT_COUNT = 15;
const RELIQUARY_TEXT = 'When a Bound face triggers and the face above it is loaded, trigger that face too.';
const ROSARY_TEXT = 'When a Bound face triggers and the face below it is loaded, trigger that face too.';

// The opening fight with the given artifacts held, faces loaded by number
// and, when given, the enemy's HP (and max) set before the first roll.
async function freshFight(browser, setup) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  page._pageErrors = [];
  page.on('pageerror', function(err) { page._pageErrors.push(err.message); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate((s) => {
    devChromeOpen = true;
    updateRun({ artifacts: s.artifacts || [] });
    enterSlot('opening', null);
    const newFaces = gameState.die.faces.slice();
    (s.faces || []).forEach(function(p) {
      const i = newFaces.findIndex(function(f) { return f.number === p[0]; });
      newFaces[i] = Object.assign({}, newFaces[i], { modId: p[1], modId2: null });
    });
    updateDie({ faces: newFaces });
    if (s.enemyHp) { updateEnemy({ hp: s.enemyHp, maxHp: s.enemyHp }); }
  }, setup || {});
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

function logCount(page, needle) {
  return page.evaluate((n) => Array.from(document.querySelectorAll('#log > div')).filter(function(d) {
    return d.textContent.indexOf(n) !== -1;
  }).length, needle);
}

function playFromHand(page, cardId) {
  return page.evaluate((id) => { playCard(gameState.player.hand.indexOf(id)); }, cardId);
}

(async () => {
  const browser = await chromium.launch();

  await runTest('loop: Reliquary Chain + Rosary, Unison 7 and Accord 8, forcing face 7 kills a 100 HP enemy in the same round, more than ' + OLD_CAP + ' triggers', async () => {
    const page = await freshFight(browser, { artifacts: ['reliquary_chain', 'rosary'], faces: [[7, 'unison'], [8, 'accord']], enemyHp: 100 });
    const atRoll = await page.evaluate(() => {
      forcePlayerRoll(7);
      return { triggersThisRound: gameState.turn.roundTriggerCount, enemyHp: gameState.enemy.hp, round: gameState.turn.round };
    });
    await page.waitForFunction(() => gameState.run.status === 'win');
    const end = await page.evaluate(() => ({ round: gameState.turn.round, status: gameState.run.status }));
    console.log('  loop: ' + atRoll.triggersThisRound + ' triggers this round, fight won in round ' + end.round);
    assert.ok(atRoll.enemyHp <= 0, 'the enemy must be dead after the roll, HP ' + atRoll.enemyHp);
    assert.ok(atRoll.triggersThisRound > OLD_CAP, 'triggers this round must pass the old cap of ' + OLD_CAP + ', got ' + atRoll.triggersThisRound);
    assert.ok(atRoll.triggersThisRound < GUARD, 'the enemy dying must end the loop before the guard');
    assert.strictEqual(end.round, atRoll.round, 'the fight ends in the round of the roll');
    assert.strictEqual(end.status, 'win');
    assert.deepStrictEqual(page._pageErrors, []);
    await page.close();
  });

  await runTest('guard: the same loop against a 100,000 HP enemy stops at exactly ' + GUARD + ' triggers, one [GUARD] line, round continues to CARD_PHASE', async () => {
    const page = await freshFight(browser, { artifacts: ['reliquary_chain', 'rosary'], faces: [[7, 'unison'], [8, 'accord']], enemyHp: 100000 });
    const started = Date.now();
    await page.evaluate(() => { forcePlayerRoll(7); });
    const syncMs = Date.now() - started;
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({
      triggersThisRound: gameState.turn.roundTriggerCount,
      enemyHpLost: gameState.enemy.maxHp - gameState.enemy.hp,
      status: gameState.run.status,
      transcriptGuardLines: gameState.run.transcript.filter(function(l) { return l === 'GUARD 500 triggers'; }).length
    }));
    console.log('  guard: ' + v.triggersThisRound + ' triggers this round, enemy HP lost ' + v.enemyHpLost + ', roll resolved in ' + syncMs + ' ms');
    assert.strictEqual(v.triggersThisRound, GUARD);
    assert.strictEqual(await logCount(page, '[GUARD] 500 triggers this round, stopped'), 1, 'the [GUARD] log line prints once');
    assert.strictEqual(v.transcriptGuardLines, 1, 'the GUARD transcript line prints once');
    assert.strictEqual(v.enemyHpLost, (GUARD / 2) * 6, 'every Unison of the 250 played landed its 6');
    assert.strictEqual(v.status, 'active');
    assert.deepStrictEqual(page._pageErrors, []);
    await page.close();
  });

  await runTest('Refrain then Reverberation in one round both fire on the same blank face, no refusal', async () => {
    const page = await freshFight(browser, {});
    await page.evaluate(() => { forcePlayerRoll(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const blanks = await page.evaluate(() => { updatePlayer({ hand: ['refrain', 'reverberation'], soul: 5 }); return blankFaceNumbers(); });
    const blockBefore = await page.evaluate(() => gameState.player.block);
    await playFromHand(page, 'refrain');
    await playFromHand(page, 'reverberation');
    const blockGained = (await page.evaluate(() => gameState.player.block)) - blockBefore;
    assert.ok(blanks.indexOf(5) !== -1, 'face 5 is blank');
    assert.strictEqual(await logCount(page, '[TRIGGER] face 5 triggered outside a roll (blank)'), 2, 'face 5 fires for Refrain and again for Reverberation');
    assert.strictEqual(await logCount(page, 'outside-roll trigger refused'), 0, 'no refusal');
    assert.strictEqual(blockGained, 2 + 2 * blanks.length, 'Refrain 2 block, then 2 for each of ' + blanks.length + ' blanks');
    await page.close();
  });

  await runTest('Novena triggering a Bound face with Reliquary Chain held triggers the loaded face above', async () => {
    const page = await freshFight(browser, { artifacts: ['reliquary_chain'], faces: [[5, 'unison'], [6, 'smite']], enemyHp: 1000 });
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const hpBefore = await page.evaluate(() => { updatePlayer({ hand: ['novena'], soul: 5 }); return gameState.enemy.hp; });
    await playFromHand(page, 'novena');
    await page.waitForFunction(() => gameState.turn.hoppedFaces.indexOf(6) !== -1);
    const v = await page.evaluate(() => ({ hp: gameState.enemy.hp, hopped: gameState.turn.hoppedFaces.slice() }));
    assert.deepStrictEqual(v.hopped, [5, 6], 'Novena fires face 5, the chain face 6');
    assert.strictEqual(hpBefore - v.hp, 6 + 16, 'Unison 6 plus the chained Smite 16');
    assert.strictEqual(await logCount(page, '[ARTIFACT] Reliquary Chain: face 6 triggers too'), 1);
    await page.close();
  });

  await runTest('Rosary on a Bound face 2 does not trigger face 1; on a Bound face 3 it triggers loaded face 2', async () => {
    const page = await freshFight(browser, { artifacts: ['rosary'], faces: [[2, 'unison']] });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({
      hopped: gameState.turn.hoppedFaces.slice(),
      natOneFired: gameState.player.natOneFiredThisFight,
      face1Rolls: (getPlayerFace(1).modData || {}).triggerCount || 0
    }));
    assert.strictEqual(v.hopped.indexOf(1), -1, 'face 1 never hops');
    assert.strictEqual(v.natOneFired, false, 'face 1 never triggers Penitence');
    assert.strictEqual(v.face1Rolls, 0, 'face 1 records no roll');
    assert.strictEqual(await logCount(page, 'Rosary: face'), 0, 'Rosary chains nothing from face 2');
    assert.strictEqual(await logCount(page, 'refused: face 1'), 0, 'no attempt reaches face 1');
    await page.close();

    const page2 = await freshFight(browser, { artifacts: ['rosary'], faces: [[3, 'unison'], [2, 'smite']], enemyHp: 1000 });
    await page2.evaluate(() => { forcePlayerRoll(3); });
    await page2.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const w = await page2.evaluate(() => ({ hopped: gameState.turn.hoppedFaces.slice(), hpLost: gameState.enemy.maxHp - gameState.enemy.hp }));
    assert.deepStrictEqual(w.hopped, [2], 'Rosary chains face 2');
    assert.strictEqual(w.hpLost, 6 + 16, 'Unison 6 plus the chained Smite 16');
    await page2.close();
  });

  await runTest('the Bound scan from a rolled Bound face triggers each other Bound face once, and none of them starts a scan', async () => {
    const page = await freshFight(browser, { faces: [[4, 'unison'], [6, 'unison'], [8, 'unison']], enemyHp: 1000 });
    await page.evaluate(() => { forcePlayerRoll(4); });
    await page.waitForFunction(() => gameState.turn.hoppedFaces.length === 2 && gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => ({
      hopped: gameState.turn.hoppedFaces.slice(),
      triggersPerFace: [4, 6, 8].map(function(n) { return getPlayerFace(n).modData.triggerCount; }),
      triggersThisRound: gameState.turn.roundTriggerCount
    }));
    assert.deepStrictEqual(v.hopped, [6, 8]);
    assert.deepStrictEqual(v.triggersPerFace, [1, 1, 1], 'each Bound face triggered once');
    assert.strictEqual(v.triggersThisRound, 3);
    assert.strictEqual(await logCount(page, '[BOUND] scan:'), 1, 'only the rolled face starts a scan');
    await page.close();
  });

  await runTest('pacing: SWEEP_PACING is 200, 50, 10, and the twentieth play of a round uses 10', async () => {
    const page = await freshFight(browser, {});
    const v = await page.evaluate(() => {
      const delays = [];
      const realSetTimeout = window.setTimeout;
      window.setTimeout = function(fn, ms) { delays.push(ms); return 0; };
      updateTurn({ roundSweepPlays: 18 });
      playSweep([5, 6], function() {});
      window.setTimeout = realSetTimeout;
      return {
        pacing: GAME_CONFIG.SWEEP_PACING,
        stepDelays: [0, 2, 3, 18, 19, 40].map(sweepStepDelay),
        nineteenthAndTwentiethAt: delays
      };
    });
    assert.deepStrictEqual(v.pacing, { FIRST_MS: 200, NEXT_MS: 50, LATER_MS: 10 });
    assert.deepStrictEqual(v.stepDelays, [200, 200, 50, 50, 10, 10], 'plays 1-3 200, 4-19 50, 20 on 10');
    assert.deepStrictEqual(v.nineteenthAndTwentiethAt, [0, 10], 'the twentieth play lands 10 ms after the nineteenth');
    await page.close();
  });

  await runTest('no mod, card or artifact has empty on-screen text; the chain texts are exact', async () => {
    const page = await freshFight(browser, {});
    const v = await page.evaluate(() => {
      const out = [];
      Object.keys(gameState.config.mods).forEach(function(id) { out.push({ id: 'mod:' + id, text: MOD_DESCRIPTION[id] }); });
      Object.keys(gameState.config.cards).forEach(function(id) { out.push({ id: 'card:' + id, text: getCardEffectText(id) }); });
      Object.keys(gameState.config.artifacts).forEach(function(id) { out.push({ id: 'artifact:' + id, text: gameState.config.artifacts[id].text }); });
      return { texts: out, reliquary: gameState.config.artifacts.reliquary_chain.text, rosary: gameState.config.artifacts.rosary.text };
    });
    const empty = v.texts.filter(function(t) { return typeof t.text !== 'string' || t.text.trim() === ''; }).map(function(t) { return t.id; });
    assert.deepStrictEqual(empty, []);
    assert.strictEqual(v.reliquary, RELIQUARY_TEXT);
    assert.strictEqual(v.rosary, ROSARY_TEXT);
    await page.close();
  });

  await runTest('artifacts count ' + EXPECTED_ARTIFACT_COUNT + '; Rosary is mythic (D-142), priced 150, and its slot shows its name with no icon', async () => {
    const page = await freshFight(browser, { artifacts: ['rosary'] });
    await page.waitForFunction(() => {
      const img = document.querySelector('#artifactRow .artifact-slot-img');
      return img && img.complete;
    });
    const v = await page.evaluate(() => ({
      count: Object.keys(gameState.config.artifacts).length,
      tier: gameState.config.artifacts.rosary.tier,
      price: shopPriceWithArtifacts(GAME_CONFIG.SHOP.ARTIFACT_PRICE),
      slotName: document.querySelector('#artifactRow .artifact-slot-name').textContent,
      nameVisibility: document.querySelector('#artifactRow .artifact-slot-name').style.visibility
    }));
    assert.strictEqual(v.count, EXPECTED_ARTIFACT_COUNT);
    assert.strictEqual(v.tier, 'mythic');
    assert.strictEqual(v.price, 150);
    assert.strictEqual(v.slotName, 'Rosary');
    assert.notStrictEqual(v.nameVisibility, 'hidden', 'the label stays while art/artifacts/rosary.png is missing');
    await page.close();
  });

  await browser.close();
  process.exit(report('build182') > 0 ? 1 : 0);
})();
