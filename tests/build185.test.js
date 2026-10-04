// ============================================================
// TESTS/BUILD185.TEST.JS
// Standing regression suite for BUILD 185: KI-58 (the last roll clears on a
// win), KI-59 (the reward layer waits for the round's pops), KI-60 (Bound
// badge and hover line), KI-61 (the Third Eye icon), D-137 (Penitence 2
// rounds), D-139 (Retribution), D-138 (keyboard play).
// Run: node tests/build185.test.js
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

async function mapPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  page.errors = [];
  page.on('pageerror', function(e) { page.errors.push(e.message); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  return page;
}

async function freshFight(browser, artifacts) {
  const page = await mapPage(browser);
  await page.evaluate((a) => {
    devChromeOpen = true;
    if (a) { updateRun({ artifacts: a }); }
    enterSlot('opening', null);
    updateEnemy({ hp: 1000, maxHp: 1000 });
  }, artifacts || null);
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

async function rollFace(page, faceNumber) {
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
}

function rewardOpenExpr() {
  return 'dieActionStep !== null || cardRewardStep !== null || artifactRewardStep !== null || riteStep !== null || shopStep !== null || eventStep !== null';
}

function clickFace(page, number) {
  return page.evaluate((n) => {
    const btn = Array.from(document.querySelectorAll('#playerDieList .face-btn')).find(function(b) {
      return b.querySelector('.face-num').textContent === String(n);
    });
    btn.click();
  }, number);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // KI-58
  // ---------------------------------------------------------------
  await runTest('KI-58: a win clears the rolled number, the roll strip and the die icon', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    const before = await page.evaluate(() => document.getElementById('rollResultNumber').textContent + '|' + document.getElementById('rollResultLabel').textContent);
    assert.ok(before.indexOf('AWAITING') === -1, 'expected a live roll strip before the win, got: ' + before);
    await page.evaluate(() => { updateEnemy({ hp: 1 }); updatePlayer({ hand: ['strike'], soul: 5 }); playCard(0); });
    const after = await page.evaluate(() => ({
      status: gameState.run.status,
      rolled: gameState.turn.rolledFaceNumber,
      outcome: gameState.turn.rollOutcome,
      number: document.getElementById('rollResultNumber').textContent,
      label: document.getElementById('rollResultLabel').textContent,
      icon: (document.querySelector('#playerDieIcon .die-icon-number-text') || { textContent: '' }).textContent.trim()
    }));
    assert.strictEqual(after.status, 'win');
    assert.strictEqual(after.rolled, null);
    assert.strictEqual(after.outcome, null);
    assert.strictEqual(after.number, '');
    assert.strictEqual(after.label, 'AWAITING ROLL');
    assert.strictEqual(after.icon, '');
    await page.close();
  });

  // ---------------------------------------------------------------
  // KI-59
  // ---------------------------------------------------------------
  await runTest('KI-59: the reward layer opens only after the round\'s pops have finished', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    const atKill = await page.evaluate((expr) => {
      updateEnemy({ hp: 1 });
      updatePlayer({ hand: ['strike'], soul: 5 });
      playCard(0);
      return { status: gameState.run.status, settled: fightFxSettled(), open: eval(expr) };
    }, rewardOpenExpr());
    assert.strictEqual(atKill.status, 'win');
    assert.strictEqual(atKill.settled, false, 'the killing hit\'s damage number must still be on screen');
    assert.strictEqual(atKill.open, false, 'the reward layer must not open while a number is still showing');
    await page.waitForFunction((expr) => eval(expr), rewardOpenExpr(), { timeout: 8000 });
    // The gold pop is the reward's own number, granted as the layer opens.
    const live = () => page.evaluate(() => ({
      pops: Object.keys(fxLivePops).filter(function(k) { return k !== 'goldValue|gold'; }),
      held: heldFxNumbers.length,
      icons: dieRollHolding('player') || dieRollHolding('enemy')
    }));
    assert.deepStrictEqual(await live(), { pops: [], held: 0, icons: false }, 'every round pop must be finished when the layer opens');
    await page.waitForTimeout(300);
    assert.deepStrictEqual(await live(), { pops: [], held: 0, icons: false }, 'no number may start after the layer opens');
    await page.close();
  });

  await runTest('KI-59: the enemy still acts before its poison tick (D-120)', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.evaluate(() => { updateEnemy({ hp: 3, poisonStacks: 3 }); });
    await page.click('#endTurnBtn');
    await page.waitForFunction(() => gameState.run.status === 'win', null, { timeout: 8000 });
    const r = await page.evaluate(() => ({ playerHp: gameState.player.hp, enemyHp: gameState.enemy.hp }));
    assert.ok(r.playerHp < 70, 'the enemy must have attacked before its poison tick killed it, player HP ' + r.playerHp);
    assert.ok(r.enemyHp <= 0, 'the poison tick must have killed the enemy');
    await page.close();
  });

  // ---------------------------------------------------------------
  // KI-60
  // ---------------------------------------------------------------
  await runTest('KI-60: a printed Bound face shows the badge and the "Bound" hover line', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      const i = playerFaceIndex(7);
      faces[i] = Object.assign({}, faces[i], { modId: 'unison' });
      updateDie({ faces: faces });
    });
    const r = await page.evaluate(() => {
      refreshInspector();
      const badges = Array.from(document.querySelectorAll('#playerDieList .face-bound-badge'));
      const tips = Array.from(document.querySelectorAll('#playerDieList .face-tip-bound')).map(function(t) { return t.textContent; });
      return { count: badges.length, text: badges.map(function(b) { return b.textContent; }), visible: badges.map(function(b) { return b.offsetWidth > 0 && getComputedStyle(b).display !== 'none'; }), tips: tips };
    });
    assert.strictEqual(r.count, 1);
    assert.deepStrictEqual(r.text, ['BOUND']);
    assert.deepStrictEqual(r.visible, [true]);
    assert.deepStrictEqual(r.tips, ['Bound']);
    await page.close();
  });

  await runTest('KI-60: a Canticle/Herald-granted face shows the badge and "Bound this fight", and both clear when the fight ends', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      const i = playerFaceIndex(8);
      faces[i] = Object.assign({}, faces[i], { modId: 'smite' });
      updateDie({ faces: faces });
      grantBoundToFace(8);
      refreshInspector();
    });
    const granted = await page.evaluate(() => ({
      badges: document.querySelectorAll('#playerDieList .face-bound-badge').length,
      tips: Array.from(document.querySelectorAll('#playerDieList .face-tip-bound')).map(function(t) { return t.textContent; })
    }));
    assert.strictEqual(granted.badges, 1);
    assert.deepStrictEqual(granted.tips, ['Bound this fight']);
    await rollFace(page, 5);
    await page.evaluate(() => { updateEnemy({ hp: 1 }); updatePlayer({ hand: ['strike'], soul: 5 }); playCard(0); });
    const ended = await page.evaluate(() => {
      const face = getPlayerFace(8);
      return {
        granted: !!(face.modData && face.modData.boundGranted),
        bound: isBoundFace(face),
        badges: document.querySelectorAll('#playerDieList .face-bound-badge').length
      };
    });
    assert.deepStrictEqual(ended, { granted: false, bound: false, badges: 0 });
    await page.close();
  });

  // ---------------------------------------------------------------
  // KI-61
  // ---------------------------------------------------------------
  await runTest('KI-61: the icon shows only while Third Eye is held, with the art when the file exists', async () => {
    const page = await freshFight(browser);
    const none = await page.evaluate(() => getComputedStyle(document.getElementById('thirdEyeIcon')).display);
    assert.strictEqual(none, 'none', 'no icon without the artifact');
    await page.evaluate(() => { updateRun({ artifacts: ['third_eye'] }); });
    await page.waitForTimeout(300);
    const held = await page.evaluate(() => {
      const el = document.getElementById('thirdEyeIcon');
      const img = el.querySelector('.third-eye-img');
      const label = el.querySelector('.third-eye-label');
      return {
        display: getComputedStyle(el).display,
        imgShown: getComputedStyle(img).display !== 'none' && img.naturalWidth > 0,
        labelShown: getComputedStyle(label).display !== 'none',
        text: gameState.config.artifacts.third_eye.text,
        tip: (el.querySelector('.hover-tip') || { textContent: '' }).textContent,
        underHp: el.getBoundingClientRect().top > document.getElementById('playerHpValue').getBoundingClientRect().top
      };
    });
    assert.notStrictEqual(held.display, 'none');
    const artExists = fs.existsSync(path.resolve(ROOT, 'art', 'artifacts', 'third_eye.png'));
    assert.strictEqual(held.imgShown, artExists, 'the art shows exactly when art/artifacts/third_eye.png exists');
    assert.strictEqual(held.labelShown, !artExists, 'the EYE text shows only without the art');
    assert.ok(held.tip.indexOf(held.text) !== -1, 'the hover box carries the artifact text, got: ' + held.tip);
    assert.strictEqual(held.underHp, true, 'the icon sits under the HP line');
    await page.close();
  });

  await runTest('KI-61: arming in a fight holds the roll untimed, the chosen face is the roll, then the icon dims', async () => {
    const page = await freshFight(browser, ['third_eye']);
    await page.click('#thirdEyeIcon');
    const armed = await page.evaluate(() => ({
      armed: gameState.run.thirdEyeArmed,
      lit: document.getElementById('thirdEyeIcon').classList.contains('third-eye-armed'),
      instruction: document.getElementById('thirdEyeInstruction').textContent.trim(),
      shown: getComputedStyle(document.getElementById('thirdEyeInstruction')).display !== 'none'
    }));
    assert.deepStrictEqual(armed, { armed: true, lit: true, instruction: 'Choose a face', shown: true });
    await page.waitForTimeout(2600);
    const waiting = await page.evaluate(() => ({ phase: gameState.turn.phase, rolled: gameState.turn.rolledFaceNumber }));
    assert.deepStrictEqual(waiting, { phase: 'ROLL_PHASE', rolled: null }, 'the roll must wait past the old window');
    await clickFace(page, 9);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const done = await page.evaluate(() => ({
      rolled: gameState.turn.rolledFaceNumber,
      used: gameState.run.thirdEyeUsedThisAct,
      armed: gameState.run.thirdEyeArmed,
      spent: document.getElementById('thirdEyeIcon').classList.contains('third-eye-spent'),
      lit: document.getElementById('thirdEyeIcon').classList.contains('third-eye-armed'),
      instructionShown: getComputedStyle(document.getElementById('thirdEyeInstruction')).display !== 'none',
      rearm: armThirdEye()
    }));
    assert.deepStrictEqual(done, { rolled: 9, used: true, armed: false, spent: true, lit: false, instructionShown: false, rearm: false });
    await page.close();
  });

  await runTest('KI-61: armed on the map, the fight\'s first roll waits for the choice', async () => {
    const page = await mapPage(browser);
    await page.evaluate(() => { devChromeOpen = true; updateRun({ artifacts: ['third_eye'] }); });
    await page.waitForSelector('#thirdEyeMapIcon');
    await page.click('#thirdEyeMapIcon');
    assert.strictEqual(await page.evaluate(() => gameState.run.thirdEyeArmed), true);
    assert.strictEqual(await page.evaluate(() => document.getElementById('thirdEyeMapIcon').classList.contains('third-eye-armed')), true);
    await page.evaluate(() => { enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.waitForTimeout(2600);
    const waiting = await page.evaluate(() => ({ phase: gameState.turn.phase, rolled: gameState.turn.rolledFaceNumber, choosing: thirdEyeChoosingNow() }));
    assert.deepStrictEqual(waiting, { phase: 'ROLL_PHASE', rolled: null, choosing: true });
    await clickFace(page, 12);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    assert.strictEqual(await page.evaluate(() => gameState.turn.rolledFaceNumber), 12);
    await page.close();
  });

  await runTest('KI-61: an unarmed Third Eye changes nothing about rolls', async () => {
    const page = await mapPage(browser);
    await page.evaluate(() => { devChromeOpen = false; updateRun({ artifacts: ['third_eye'] }); enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE', null, { timeout: 8000 });
    assert.strictEqual(await page.evaluate(() => gameState.run.thirdEyeUsedThisAct), false);
    await page.close();
  });

  // ---------------------------------------------------------------
  // D-137
  // ---------------------------------------------------------------
  await runTest('D-137: Penitence lasts 2 rounds, the text says 2, once per fight', async () => {
    const page = await freshFight(browser);
    const cfg = await page.evaluate(() => ({ turns: GAME_CONFIG.PENITENCE_TURNS, text: NAT_DESCRIPTION.NAT_ONE }));
    assert.strictEqual(cfg.turns, 2);
    assert.ok(cfg.text.indexOf('next 2 turns') !== -1 && cfg.text.indexOf('3') === -1, 'text must name 2 turns, got: ' + cfg.text);
    await rollFace(page, 1);
    const onset = await page.evaluate(() => ({ active: gameState.player.penitenceActive, remaining: gameState.player.penitenceTurnsRemaining, fired: gameState.player.natOneFiredThisFight }));
    assert.deepStrictEqual(onset, { active: true, remaining: 2, fired: true });
    const souls = [];
    for (let round = 2; round <= 4; round++) {
      await page.click('#endTurnBtn');
      await page.waitForFunction((r) => gameState.turn.round === r && gameState.turn.phase === 'ROLL_PHASE', round);
      await rollFace(page, 5);
      souls.push(await page.evaluate(() => gameState.player.soul));
    }
    assert.deepStrictEqual(souls, [2, 2, 3], 'one soul lost at each of exactly two turn starts');
    assert.strictEqual(await page.evaluate(() => gameState.player.penitenceActive), false);
    await page.close();
  });

  // ---------------------------------------------------------------
  // D-139
  // ---------------------------------------------------------------
  await runTest('D-139: Retribution costs 2, is rare, reads "Deal damage equal to your block." and has no cap', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    const def = await page.evaluate(() => {
      const c = gameState.config.cards.retribution;
      return { cost: getCardCost(c), tier: c.tier, text: getCardEffectText('retribution') };
    });
    assert.deepStrictEqual(def, { cost: 2, tier: 'rare', text: 'Deal damage equal to your block.' });
    const hit = await page.evaluate(() => {
      updatePlayer({ hand: ['retribution'], soul: 3, block: 40 });
      const before = gameState.enemy.hp;
      playCard(0);
      return { dealt: before - gameState.enemy.hp, soul: gameState.player.soul };
    });
    assert.deepStrictEqual(hit, { dealt: 40, soul: 1 });
    await page.close();
  });

  await runTest('D-139, D-147: the reward pool tiers are 24 basic, 15 uncommon, 11 rare', async () => {
    const page = await mapPage(browser);
    const counts = await page.evaluate(() => {
      const out = { basic: 0, uncommon: 0, rare: 0 };
      Object.keys(gameState.config.cardPool).forEach(function(id) { out[gameState.config.cardPool[id].tier] += 1; });
      return out;
    });
    assert.deepStrictEqual(counts, { basic: 24, uncommon: 15, rare: 11 });
    await page.close();
  });

  // ---------------------------------------------------------------
  // D-138
  // ---------------------------------------------------------------
  await runTest('D-138: keys 1-9 play the card at that position, counted from the left', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.evaluate(() => { updatePlayer({ hand: ['ward', 'strike', 'strike'], soul: 3, block: 0 }); updateEnemy({ hp: 1000 }); });
    await page.keyboard.press('2');
    const r = await page.evaluate(() => ({ hand: gameState.player.hand.slice(), hp: gameState.enemy.hp, block: gameState.player.block, soul: gameState.player.soul }));
    assert.deepStrictEqual(r, { hand: ['ward', 'strike'], hp: 995, block: 0, soul: 2 });
    await page.keyboard.press('9');
    assert.deepStrictEqual(await page.evaluate(() => gameState.player.hand.length), 2, 'a key past the hand does nothing');
    await page.close();
  });

  await runTest('D-138: an unaffordable card does what clicking it does (nothing played)', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.evaluate(() => { updatePlayer({ hand: ['strike'], soul: 0 }); });
    await page.keyboard.press('1');
    assert.deepStrictEqual(await page.evaluate(() => ({ hand: gameState.player.hand.slice(), soul: gameState.player.soul })), { hand: ['strike'], soul: 0 });
    await page.close();
  });

  await runTest('D-138: Enter ends the turn like End Turn', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => gameState.turn.round === 2 && gameState.turn.phase === 'ROLL_PHASE', null, { timeout: 8000 });
    await page.close();
  });

  await runTest('D-138: the keys do nothing outside CARD_PHASE', async () => {
    const page = await freshFight(browser);
    const before = await page.evaluate(() => ({ hand: gameState.player.hand.slice(), soul: gameState.player.soul, phase: gameState.turn.phase }));
    assert.strictEqual(before.phase, 'ROLL_PHASE');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    const after = await page.evaluate(() => ({ hand: gameState.player.hand.slice(), soul: gameState.player.soul, phase: gameState.turn.phase }));
    assert.deepStrictEqual(after, before);
    await page.close();
  });

  await runTest('D-138: the keys do nothing while a layer is open or on the map', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.evaluate(() => { updatePlayer({ hand: ['strike', 'ward'], soul: 3 }); dieActionsRemaining = 1; openDieActionScreen('dev'); });
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    const layer = await page.evaluate(() => ({ hand: gameState.player.hand.slice(), phase: gameState.turn.phase, round: gameState.turn.round }));
    assert.deepStrictEqual(layer, { hand: ['strike', 'ward'], phase: 'CARD_PHASE', round: 1 });
    await page.close();
    const mp = await mapPage(browser);
    const before = await mp.evaluate(() => JSON.stringify([gameState.turn, gameState.player.hand]));
    await mp.keyboard.press('1');
    await mp.keyboard.press('Enter');
    assert.strictEqual(await mp.evaluate(() => JSON.stringify([gameState.turn, gameState.player.hand])), before);
    assert.deepStrictEqual(mp.errors, []);
    await mp.close();
  });

  await runTest('D-138: the keys do nothing while focus is in a dev drawer dropdown', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 5);
    await page.evaluate(() => { updatePlayer({ hand: ['strike', 'ward'], soul: 3 }); });
    if (!(await page.isVisible('#devAddCardSelect'))) { await page.click('#devChromeToggleBtn'); }
    await page.focus('#devAddCardSelect');
    await page.keyboard.press('1');
    await page.keyboard.press('Enter');
    const r = await page.evaluate(() => ({ hand: gameState.player.hand.slice(), phase: gameState.turn.phase }));
    assert.deepStrictEqual(r, { hand: ['strike', 'ward'], phase: 'CARD_PHASE' });
    await page.close();
  });

  // ---------------------------------------------------------------
  // Text
  // ---------------------------------------------------------------
  await runTest('no mod, card, artifact or Nat face has empty on-screen text', async () => {
    const page = await mapPage(browser);
    const r = await page.evaluate(() => ({
      mods: Object.keys(gameState.config.mods).filter(id => !MOD_DESCRIPTION[id] || !MOD_DESCRIPTION[id].trim()),
      cards: Object.keys(gameState.config.cards).filter(id => !getCardEffectText(id) || !getCardEffectText(id).trim()),
      artifacts: Object.keys(gameState.config.artifacts).filter(id => !gameState.config.artifacts[id].text || !gameState.config.artifacts[id].text.trim()),
      nats: Object.keys(NAT_DESCRIPTION).filter(id => !NAT_DESCRIPTION[id] || !NAT_DESCRIPTION[id].trim())
    }));
    assert.deepStrictEqual(r, { mods: [], cards: [], artifacts: [], nats: [] });
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build185 tests passed.');
})();
