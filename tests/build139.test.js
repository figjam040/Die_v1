// ============================================================
// TESTS/BUILD139.TEST.JS — BUILD 139
// Regression tests for BUILD 139, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build139.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

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
    assert.strictEqual(texts.tenet, 'Deal 6 damage, plus 1 for each time the rolled face has triggered.');
    assert.strictEqual(texts.gradual, "Deal 3 damage, plus 1 per weight on your heaviest face that isn't blank.");
    assert.strictEqual(texts.magnificat, 'Trigger your heaviest other loaded face.');
    // BUILD 142: Threnody's own text assertion moved to tests/build142.test.js
    // (item F) — it now names the live, run-fixed threnodyFace number via
    // getCardEffectText() (rendering.js), not a fixed string this shared
    // batch of raw CARD_EFFECT_TEXT/MOD_DESCRIPTION lookups can check.
    assert.strictEqual(texts.reverberation, 'Trigger every blank face on your die.');
    assert.strictEqual(texts.canticle, 'Gain 6 block. If the rolled face is loaded, it gains Bound for this fight.');
    assert.strictEqual(texts.herald, 'Deal 6 damage. Another random loaded face without Bound gains Bound for this fight.');
    assert.strictEqual(texts.congregation, 'Deal 8 damage. If another mod on your die has Growth, deal 16 instead.');
    assert.strictEqual(texts.lauds, 'Deal 4 damage, plus 3 per Growth mod on your die, up to 13.');
    assert.strictEqual(texts.reliquary, 'If you have 10 or more block, deal 5 damage. Gain 6 block.');
    assert.strictEqual(texts.vindication, 'Deal damage equal to twice your block, up to 24.');
    assert.strictEqual(texts.exequy, "Deal damage equal to the enemy's stacks of poison, up to 12.");
    assert.strictEqual(texts.oblation, 'Spend all your soul. Deal 7 damage per soul spent, up to 42.');
    assert.strictEqual(texts.tithe, 'Gain 1 block per blank face on your die.');
    assert.strictEqual(texts.anathema, 'When this turn ends, deal damage equal to your block, up to 16.');
    await liveBrowser.close();
  });

  await browser.close();
  process.exit(report('build139') > 0 ? 1 : 0);
})();
