// ============================================================
// TESTS/BUILD173.TEST.JS
// Standing regression suite for BUILD 173, the blank face synergy (D-126,
// D-127): Vacancy, Tabernacle and Tithe count blank faces, Vigil grows with
// blanks rolled and triggers on a blank roll, Reverberation triggers every
// blank face, Tolling Bell pays for blanks rolled this fight, Gilded Die pays
// gold on a blank roll, and the nine pieces carry the Blank tag.
// Run: node tests/build173.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
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

async function freshFight(browser, artifacts) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate((held) => { devChromeOpen = true; updateRun({ artifacts: held || [], gold: 0 }); enterSlot('opening', null); }, artifacts || []);
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Loads [faceNumber, modId] pairs straight onto the die.
function loadFaces(page, pairs) {
  return page.evaluate((list) => {
    const faces = gameState.die.faces.slice();
    list.forEach(function(p) { faces[p[0] - 1] = Object.assign({}, faces[p[0] - 1], { modId: p[1] }); });
    updateDie({ faces: faces });
  }, pairs);
}

// Loads Smite onto the highest blank faces until exactly n blank faces remain.
function leaveBlanks(page, n) {
  return page.evaluate((target) => {
    const faces = gameState.die.faces.slice();
    let blanks = blankFaceNumbers();
    const load = blanks.slice(target).reverse();
    load.forEach(function(num) { faces[num - 1] = Object.assign({}, faces[num - 1], { modId: 'smite' }); });
    updateDie({ faces: faces });
    return blankFaceNumbers().length;
  }, n);
}

async function rollTo(page, faceNumber) {
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

async function playFromHand(page, cardId) {
  await page.evaluate((id) => { updatePlayer({ hand: [id], soul: 5 }); }, cardId);
  await page.evaluate(() => { playCard(0); });
}

function snapshot(page) {
  return page.evaluate(() => ({
    hp: gameState.enemy.hp,
    block: gameState.player.block,
    soul: gameState.player.soul,
    gold: gameState.run.gold,
    runBlanks: gameState.run.blanksRolled,
    fightBlanks: gameState.fight.blanksRolled,
    roundTriggers: gameState.turn.roundTriggerCount,
    modsTriggered: gameState.turn.modsTriggered.slice()
  }));
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Item C: Vacancy deals 1 damage per blank face, uncapped: 15 blanks 15, 5 blanks 5', async () => {
    for (const blanks of [15, 5]) {
      const page = await freshFight(browser);
      await loadFaces(page, [[3, 'smite']]);
      assert.strictEqual(await leaveBlanks(page, blanks), blanks);
      await rollTo(page, 3);
      const before = await snapshot(page);
      await playFromHand(page, 'vacancy');
      const after = await snapshot(page);
      assert.strictEqual(before.hp - after.hp, blanks, blanks + ' blank faces must deal ' + blanks);
      await page.close();
    }
  });

  await runTest('Item C: Tabernacle gains 2 block per blank face, uncapped: 15 blanks 30, 5 blanks 10', async () => {
    for (const blanks of [15, 5]) {
      const page = await freshFight(browser);
      await loadFaces(page, [[3, 'smite']]);
      assert.strictEqual(await leaveBlanks(page, blanks), blanks);
      await rollTo(page, 3);
      const before = await snapshot(page);
      await playFromHand(page, 'tabernacle');
      const after = await snapshot(page);
      assert.strictEqual(after.block - before.block, blanks * 2, blanks + ' blank faces must give ' + blanks * 2);
      await page.close();
    }
  });

  await runTest('Item C: a Sealed loaded face counts as a blank face, faces 1 and 20 never do', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[3, 'smite']]);
    const v = await page.evaluate(() => {
      const plain = blankFaceNumbers();
      updateTurn({ sealedFaces: [3] });
      const sealed = blankFaceNumbers();
      return { plain: plain, sealed: sealed };
    });
    assert.strictEqual(v.plain.length, 16);
    assert.strictEqual(v.sealed.length, 17);
    assert.ok(v.sealed.indexOf(3) !== -1 && v.sealed.indexOf(1) === -1 && v.sealed.indexOf(20) === -1);
    await page.close();
  });

  await runTest('Item B: Tithe gains 1 block per blank face: 12 blanks give 12 block', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[2, 'tithe']]);
    assert.strictEqual(await leaveBlanks(page, 12), 12);
    const before = await snapshot(page);
    await rollTo(page, 2);
    const after = await snapshot(page);
    assert.strictEqual(after.block - before.block, 12);
    await page.close();
  });

  await runTest('Item B: Vigil deals 4 at 0 blanks rolled, 7 at 9, 7 at 10, on the rolled Vigil face', async () => {
    for (const [rolled, expected] of [[0, 4], [9, 7], [10, 7]]) {
      const page = await freshFight(browser);
      await loadFaces(page, [[2, 'vigil']]);
      await page.evaluate((n) => { updateRun({ blanksRolled: n }); }, rolled);
      const before = await snapshot(page);
      await rollTo(page, 2);
      const after = await snapshot(page);
      assert.strictEqual(before.hp - after.hp, expected, 'blanksRolled ' + rolled + ' must deal ' + expected);
      assert.deepStrictEqual(after.modsTriggered, ['Vigil'], 'the rolled Vigil face triggers once');
      assert.strictEqual(after.roundTriggers, 1);
      const count = await page.evaluate(() => getPlayerFace(2).modData.triggerCount);
      assert.strictEqual(count, 1);
      await page.close();
    }
  });

  await runTest('Item B: a blank roll with Vigil loaded triggers Vigil once, counted against the cap, and the face count rises by 1', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[2, 'vigil']]);
    const before = await snapshot(page);
    await rollTo(page, 5);
    const after = await snapshot(page);
    const v = await page.evaluate(() => ({ count: getPlayerFace(2).modData.triggerCount, outcome: gameState.turn.rollOutcome, runBlanks: gameState.run.blanksRolled }));
    assert.strictEqual(v.outcome, 'blank');
    assert.strictEqual(before.hp - after.hp, 4, 'one blank rolled: 4 plus 0 whole points = 4 damage');
    assert.deepStrictEqual(after.modsTriggered, ['Vigil']);
    assert.strictEqual(after.roundTriggers, 1, 'the Vigil trigger counts against the round cap');
    assert.strictEqual(v.count, 1);
    assert.strictEqual(after.block - before.block, 2, 'the blank payout still pays');
    assert.strictEqual(v.runBlanks, 1);
    await page.close();
  });

  await runTest('Item B: the blank that triggers Vigil is already counted: a third blank deals 5', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[2, 'vigil']]);
    await page.evaluate(() => { updateRun({ blanksRolled: 2 }); });
    const before = await snapshot(page);
    await rollTo(page, 5);
    const after = await snapshot(page);
    assert.strictEqual(before.hp - after.hp, 5);
    await page.close();
  });

  await runTest('Item B: a blank roll without Vigil loaded triggers nothing', async () => {
    const page = await freshFight(browser);
    const before = await snapshot(page);
    await rollTo(page, 5);
    const after = await snapshot(page);
    assert.strictEqual(before.hp, after.hp);
    assert.deepStrictEqual(after.modsTriggered, []);
    assert.strictEqual(after.roundTriggers, 0);
    assert.strictEqual(await page.evaluate(() => gameState.turn.modTriggeredThisTurn), false);
    await page.close();
  });

  await runTest('Item B: a spent Nat 1 is a blank roll: it counts and triggers Vigil', async () => {
    const page = await freshFight(browser);
    await loadFaces(page, [[2, 'vigil']]);
    await page.evaluate(() => { updatePlayer({ natOneFiredThisFight: true }); });
    const before = await snapshot(page);
    await rollTo(page, 1);
    const after = await snapshot(page);
    assert.strictEqual(after.runBlanks, 1);
    assert.strictEqual(before.hp - after.hp, 4);
    await page.close();
  });

  await runTest('Item A: Tolling Bell pays 2, 3, 4 block on the first three blanks of a fight, and a new fight starts at 2', async () => {
    const page = await freshFight(browser, ['tolling_bell']);
    const v = await page.evaluate(() => {
      const blank = gameState.die.faces[4];
      const deltas = [];
      const roll = function() { const b = gameState.player.block; resolvePlayerRoll(blank); deltas.push(gameState.player.block - b); };
      roll(); roll(); roll();
      const midFight = gameState.fight.blanksRolled;
      clearFightScopedState();
      const afterReset = gameState.fight.blanksRolled;
      roll();
      return { deltas: deltas, midFight: midFight, afterReset: afterReset, fight: gameState.fight.blanksRolled, run: gameState.run.blanksRolled };
    });
    assert.deepStrictEqual(v.deltas, [2, 3, 4, 2]);
    assert.strictEqual(v.midFight, 3);
    assert.strictEqual(v.afterReset, 0);
    assert.strictEqual(v.fight, 1);
    assert.strictEqual(v.run, 4, 'the run count is not a fight count');
    await page.close();
  });

  await runTest('Item A: Alms with Tolling Bell on the third blank gives 1 soul and 2 block', async () => {
    const page = await freshFight(browser, ['alms', 'tolling_bell']);
    const v = await page.evaluate(() => {
      const blank = gameState.die.faces[4];
      resolvePlayerRoll(blank);
      resolvePlayerRoll(blank);
      const soul = gameState.player.soul;
      const block = gameState.player.block;
      resolvePlayerRoll(blank);
      return { soul: gameState.player.soul - soul, block: gameState.player.block - block };
    });
    assert.deepStrictEqual(v, { soul: 1, block: 2 });
    await page.close();
  });

  await runTest('Item A: Gilded Die adds 3 gold on a blank roll and none on a loaded roll', async () => {
    const page = await freshFight(browser, ['gilded_die']);
    await loadFaces(page, [[3, 'smite']]);
    const v = await page.evaluate(() => {
      resolvePlayerRoll(gameState.die.faces[4]);
      const afterBlank = gameState.run.gold;
      resolvePlayerRoll(gameState.die.faces[2]);
      return { afterBlank: afterBlank, afterLoaded: gameState.run.gold, config: GAME_CONFIG.BLANK_GOLD };
    });
    assert.deepStrictEqual(v, { afterBlank: 3, afterLoaded: 3, config: 3 });
    await page.close();
  });

  await runTest('Item C: Reverberation with 15 blanks gives 30 block, 30 with Tolling Bell after zero blanks rolled, and counts nothing as a roll', async () => {
    const plain = await freshFight(browser);
    await loadFaces(plain, [[3, 'smite']]);
    assert.strictEqual(await leaveBlanks(plain, 15), 15);
    await rollTo(plain, 3);
    const p0 = await snapshot(plain);
    await playFromHand(plain, 'reverberation');
    const p1 = await snapshot(plain);
    assert.strictEqual(p1.block - p0.block, 30);
    assert.strictEqual(p1.runBlanks, 0, 'blanksRolled does not change');
    assert.strictEqual(p1.fightBlanks, 0);
    await plain.close();

    const bell = await freshFight(browser, ['tolling_bell']);
    await loadFaces(bell, [[3, 'smite']]);
    assert.strictEqual(await leaveBlanks(bell, 15), 15);
    await rollTo(bell, 3);
    const b0 = await snapshot(bell);
    await playFromHand(bell, 'reverberation');
    const b1 = await snapshot(bell);
    assert.strictEqual(b1.block - b0.block, 30, 'Tolling Bell adds 0 after zero blanks rolled, and never climbs per triggered face');
    assert.strictEqual(b1.runBlanks, 0);
    assert.strictEqual(b1.fightBlanks, 0);
    await bell.close();

    const rung = await freshFight(browser, ['tolling_bell']);
    await loadFaces(rung, [[3, 'smite']]);
    assert.strictEqual(await leaveBlanks(rung, 15), 15);
    await rollTo(rung, 3);
    await rung.evaluate(() => { updateFight({ blanksRolled: 3 }); });
    const r0 = await snapshot(rung);
    await playFromHand(rung, 'reverberation');
    const r1 = await snapshot(rung);
    assert.strictEqual(r1.block - r0.block, 75, '15 blanks at 2 + 3 earlier blanks each');
    assert.strictEqual(r1.fightBlanks, 3);
    await rung.close();
  });

  await runTest('Item C: Reverberation leaves Alms, Vigil and Gilded Die alone, and is exempt from the round trigger cap', async () => {
    const page = await freshFight(browser, ['alms', 'gilded_die']);
    await loadFaces(page, [[2, 'vigil'], [3, 'smite']]);
    assert.strictEqual(await leaveBlanks(page, 15), 15);
    await rollTo(page, 3);
    await page.evaluate(() => { updateTurn({ roundTriggerCount: GAME_CONFIG.ROUND_TRIGGER_CAP }); });
    const before = await snapshot(page);
    await playFromHand(page, 'reverberation');
    const after = await snapshot(page);
    assert.strictEqual(after.block - before.block, 30, 'all 15 blanks pay even at the cap');
    assert.strictEqual(after.soul, 3, 'no Alms soul: soul 5 less the card cost of 2');
    assert.strictEqual(after.gold, before.gold, 'no Gilded Die gold');
    assert.strictEqual(after.hp, before.hp, 'Vigil does not trigger');
    assert.deepStrictEqual(after.modsTriggered, before.modsTriggered);
    assert.strictEqual(after.roundTriggers, before.roundTriggers, 'the cap counter did not move');
    await page.close();
  });

  await runTest('Item D: a new run zeroes run.blanksRolled, a fight start zeroes fight.blanksRolled', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      updateRun({ blanksRolled: 7 });
      updateFight({ blanksRolled: 5 });
      clearFightScopedState();
      const afterFight = { run: gameState.run.blanksRolled, fight: gameState.fight.blanksRolled };
      startNewRun();
      return { afterFight: afterFight, afterRun: { run: gameState.run.blanksRolled, fight: gameState.fight.blanksRolled } };
    });
    assert.deepStrictEqual(v.afterFight, { run: 7, fight: 0 });
    assert.strictEqual(v.afterRun.run, 0);
    await page.close();
  });

  await runTest('Item D: nine pieces carry the Blank tag, and no other piece does', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const tagged = [];
      Object.keys(gameState.config.mods).forEach(id => { if ((gameState.config.mods[id].tags || []).indexOf('blank') !== -1) tagged.push('mod ' + id); });
      Object.keys(gameState.config.cardPool).forEach(id => { if ((gameState.config.cardPool[id].tags || []).indexOf('blank') !== -1) tagged.push('card ' + id); });
      Object.keys(gameState.config.artifacts).forEach(id => { if ((gameState.config.artifacts[id].tags || []).indexOf('blank') !== -1) tagged.push('artifact ' + id); });
      return tagged.sort();
    });
    assert.deepStrictEqual(v, ['artifact alms', 'artifact gilded_die', 'artifact tolling_bell', 'card orison', 'card reverberation', 'card tabernacle', 'card vacancy', 'mod tithe', 'mod vigil']);
    await page.close();
  });

  await runTest('Item C: Vacancy and Reverberation are rare, Tabernacle stays basic, costs unchanged', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const c = gameState.config.cards;
      return {
        vacancy: [c.vacancy.tier, c.vacancy.soulCost], tabernacle: [c.tabernacle.tier, c.tabernacle.soulCost],
        reverberation: [c.reverberation.tier, c.reverberation.soulCost],
        vigil: gameState.config.mods.vigil.tier, tithe: gameState.config.mods.tithe.tier,
        tolling: gameState.config.artifacts.tolling_bell.tier, gilded: gameState.config.artifacts.gilded_die.tier
      };
    });
    assert.deepStrictEqual(v, {
      vacancy: ['rare', 2], tabernacle: ['basic', 1], reverberation: ['rare', 2],
      vigil: 'uncommon', tithe: 'uncommon', tolling: 'rare', gilded: 'rare'
    });
    await page.close();
  });

  await runTest('Item A/B/C: the seven texts match exactly, Alms and Orison are unchanged', async () => {
    const page = await freshFight(browser);
    const t = await page.evaluate(() => ({
      tolling: gameState.config.artifacts.tolling_bell.text,
      gilded: gameState.config.artifacts.gilded_die.text,
      alms: gameState.config.artifacts.alms.text,
      vigil: MOD_DESCRIPTION.vigil,
      tithe: MOD_DESCRIPTION.tithe,
      vacancy: getCardEffectText('vacancy'),
      tabernacle: getCardEffectText('tabernacle'),
      reverberation: getCardEffectText('reverberation'),
      orison: getCardEffectText('orison')
    }));
    assert.deepStrictEqual(t, {
      tolling: 'When a blank triggers, gain 2 block, plus 1 for every blank you have rolled this fight.',
      gilded: 'When you roll a blank, gain 3 gold.',
      alms: 'When you roll a blank, gain 1 soul instead of 2 block.',
      vigil: 'Deal 4 damage, plus 1 for every 3 blanks you have rolled this run. Also triggers whenever you roll a blank.',
      tithe: 'Gain 1 block per blank face on your die.',
      vacancy: 'Deal 1 damage per blank face on your die.',
      tabernacle: 'Gain 2 block per blank face on your die.',
      reverberation: 'Trigger every blank face on your die.',
      orison: 'Deal 5 damage. If you rolled a blank, deal 9 instead.'
    });
    await page.close();
  });

  await runTest('no piece has empty on-screen text: dev description, face hover and DIE layer for the nine pieces', async () => {
    const page = await freshFight(browser, ['tolling_bell', 'gilded_die', 'alms']);
    await loadFaces(page, [[2, 'vigil'], [3, 'tithe']]);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'vigil';
      renderDevModDescription();
    });
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => {
      const ids = ['vacancy', 'tabernacle', 'reverberation', 'orison'];
      const cardTexts = ids.map(id => getCardEffectText(id));
      const artifactTexts = ['alms', 'tolling_bell', 'gilded_die'].map(id => gameState.config.artifacts[id].text);
      const row = n => [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
      return {
        cardTexts: cardTexts, artifactTexts: artifactTexts,
        dev: document.getElementById('devModDescription').textContent.trim(),
        tips: [2, 3].map(n => [...row(n).querySelectorAll('.hover-tip > .face-mod-box > div')].map(d => d.textContent.trim())),
        rows: [...document.querySelectorAll('#dieInfoContent .info-list-row')].map(r => r.textContent.trim())
      };
    });
    v.cardTexts.concat(v.artifactTexts, [v.dev]).forEach(text => assert.ok(text.length > 0));
    assert.strictEqual(v.dev, 'Deal 4 damage, plus 1 for every 3 blanks you have rolled this run. Also triggers whenever you roll a blank.');
    v.tips.forEach(lines => { assert.strictEqual(lines.length, 5); lines.forEach(l => assert.ok(l.length > 0)); });
    assert.strictEqual(v.tips[0][3], 'Deal 4 damage, plus 1 for every 3 blanks you have rolled this run. Also triggers whenever you roll a blank.');
    assert.strictEqual(v.tips[1][3], 'Gain 1 block per blank face on your die.');
    v.rows.forEach(t => assert.ok(t.length > 0));
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build173 tests passed.');
})();
