// ============================================================
// TESTS/BUILD154.TEST.JS
// Standing regression suite for the second UI pass: the one reward panel
// shape (D-86), the pop numbers (D-87) and the build stamp. Same shape as
// tests/build153.test.js: plain Node script, playwright launched directly,
// node:assert. Run: node tests/build154.test.js
// ============================================================

const { chromium } = require('playwright');
const fs = require('fs');
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
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  return page;
}

// The opening fight, paused in ROLL_PHASE with dev chrome open so
// forcePlayerRoll() is live.
async function enterPausedFight(page) {
  await page.evaluate(() => { devChromeOpen = true; devPauseBeforeFirstRoll = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN');
  await page.evaluate(() => { nextPhase(); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — one reward panel shape
  // ---------------------------------------------------------------

  await runTest('Item A: the card reward panel shows three cards with name, tier, tag and text, and no face row', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openCardRewardScreen();
      const cards = Array.from(document.querySelectorAll('#cardRewardPanel .offer-card'));
      return {
        count: cards.length,
        names: cards.map(c => (c.querySelector('.offer-card-name') || {}).textContent || ''),
        tiers: cards.map(c => (c.querySelector('.offer-card-tier') || {}).textContent || ''),
        tags: cards.map(c => (c.querySelector('.offer-card-tag') || {}).textContent || ''),
        texts: cards.map(c => (c.querySelector('.offer-card-text') || {}).textContent || ''),
        feet: cards.map(c => (c.querySelector('.offer-card-foot') || {}).textContent || ''),
        rows: document.querySelectorAll('#cardRewardPanel .die-row').length,
        skip: (document.querySelector('#cardRewardPanel .offer-skip') || {}).textContent || ''
      };
    });
    assert.strictEqual(v.count, 3, 'the card reward must show three cards, got ' + v.count);
    ['names', 'tiers', 'tags', 'texts', 'feet'].forEach(function(field) {
      v[field].forEach(function(s, i) {
        assert.ok(s.length > 0, 'card ' + i + ' has an empty ' + field);
      });
    });
    assert.deepStrictEqual(v.tiers.map(t => ['COMMON', 'UNCOMMON', 'RARE'].indexOf(t) !== -1), [true, true, true],
      'every card reward tier line must read a real tier: ' + JSON.stringify(v.tiers));
    assert.strictEqual(v.rows, 0, 'the card reward must show no face row');
    assert.strictEqual(v.skip, 'SKIP', 'the card reward must keep a SKIP button');
    await page.close();
  });

  await runTest('Item A: the Load offer shows three die frames; a pick marks one gold and opens the face row', async () => {
    // D-102/KI-37 (BUILD 158): the Load offer renders wireframe die frames
    // (.offer-die-card), not the card frame (.offer-card) — see build158.test.js.
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad();
      const before = {
        cards: document.querySelectorAll('#dieActionPanel .offer-die-card').length,
        chosen: document.querySelectorAll('#dieActionPanel .offer-card-chosen').length,
        pickable: document.querySelectorAll('#playerDieList .die-row-pickable').length
      };
      dieActionPickMod(dieActionMods[0]);
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const pickableNumbers = rows.filter(r => r.classList.contains('die-row-pickable'))
        .map(r => parseInt(r.querySelector('.face-btn').textContent, 10));
      const blankNumbers = gameState.die.faces
        .filter(f => f.modId === null && f.number >= 2 && f.number <= 19)
        .map(f => f.number);
      return {
        before: before,
        cards: document.querySelectorAll('#dieActionPanel .offer-die-card').length,
        chosen: document.querySelectorAll('#dieActionPanel .offer-card-chosen').length,
        chosenFoot: (document.querySelector('#dieActionPanel .offer-card-chosen .offer-card-foot') || {}).textContent || '',
        instruction: (document.querySelector('#dieActionPanel .offer-instruction') || {}).textContent || '',
        pickableNumbers: pickableNumbers,
        blankNumbers: blankNumbers
      };
    });
    assert.strictEqual(v.before.cards, 3, 'the Load offer must show three die frames, got ' + v.before.cards);
    assert.strictEqual(v.before.chosen, 0, 'no card is chosen before a pick');
    assert.strictEqual(v.before.pickable, 0, 'no face is selectable before a mod is picked');
    assert.strictEqual(v.cards, 3, 'the three die frames stay on screen after a pick');
    assert.strictEqual(v.chosen, 1, 'exactly one card turns gold after a pick, got ' + v.chosen);
    assert.ok(v.chosenFoot.indexOf('CHOSEN') === 0, 'the chosen card must read CHOSEN..., got "' + v.chosenFoot + '"');
    assert.ok(v.instruction.length > 0, 'the face row must carry a one-line instruction');
    // Every blank face 2-19 must be selectable, and faces 1 and 20 never.
    v.blankNumbers.forEach(function(n) {
      assert.ok(v.pickableNumbers.indexOf(n) !== -1, 'blank face ' + n + ' must be selectable in the Load picker');
    });
    assert.strictEqual(v.pickableNumbers.indexOf(1), -1, 'face 1 must never be a Load target');
    assert.strictEqual(v.pickableNumbers.indexOf(20), -1, 'face 20 must never be a Load target');
    await page.close();
  });

  await runTest('Item A: Strengthen shows the face row and no cards', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseStrengthen();
      return {
        cards: document.querySelectorAll('#dieActionPanel .offer-card').length,
        rows: document.querySelectorAll('#playerDieList .die-row').length,
        pickable: document.querySelectorAll('#playerDieList .die-row-pickable').length,
        instruction: (document.querySelector('#dieActionPanel .offer-instruction') || {}).textContent || ''
      };
    });
    assert.strictEqual(v.cards, 0, 'Strengthen must show no cards, got ' + v.cards);
    assert.strictEqual(v.rows, 20, 'Strengthen must show all twenty faces, got ' + v.rows);
    assert.strictEqual(v.pickable, 2, 'a fresh die has two strengthenable faces, got ' + v.pickable);
    assert.ok(v.instruction.length > 0, 'Strengthen must carry its one-line instruction');
    await page.close();
  });

  await runTest('Item A: the artifact panel shows three artifact cards', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openArtifactRewardScreen();
      const cards = Array.from(document.querySelectorAll('#artifactRewardPanel .offer-card'));
      return {
        count: cards.length,
        names: cards.map(c => c.querySelector('.offer-card-name').textContent),
        texts: cards.map(c => c.querySelector('.offer-card-text').textContent),
        rows: document.querySelectorAll('#artifactRewardPanel .die-row').length,
        skip: (document.querySelector('#artifactRewardPanel .offer-skip') || {}).textContent || '',
        ids: cards.map(c => c.dataset.offerId)
      };
    });
    assert.strictEqual(v.count, 3, 'the artifact reward must show three cards, got ' + v.count);
    v.names.forEach(n => assert.ok(n.length > 0, 'an artifact card has no name'));
    v.texts.forEach(t => assert.ok(t.length > 0, 'an artifact card has no text'));
    assert.strictEqual(new Set(v.ids).size, 3, 'the three artifacts offered must be distinct');
    assert.strictEqual(v.rows, 0, 'the artifact reward must show no face row');
    assert.strictEqual(v.skip, 'SKIP', 'the artifact reward must keep a SKIP button');
    await page.close();
  });

  await runTest('Item A: the shop shows prices on its cards and a second row, with LEAVE in place of SKIP', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ gold: 500 });
      openShopScreen();
      const cards = Array.from(document.querySelectorAll('#shopPanel .offer-card'));
      return {
        count: cards.length,
        tiers: cards.map(c => c.querySelector('.offer-card-tier').textContent),
        small: Array.from(document.querySelectorAll('#shopPanel .offer-small')).map(b => b.textContent),
        leave: (document.querySelector('#shopPanel .offer-skip') || {}).textContent || ''
      };
    });
    assert.strictEqual(v.count, 3, 'the shop must show three cards, got ' + v.count);
    v.tiers.forEach(function(t) {
      assert.ok(/^\d+g$/.test(t), 'the shop must show a price in place of the tier, got "' + t + '"');
    });
    assert.strictEqual(v.small.length, 3, 'the shop must show a second row of three entries, got ' + v.small.length);
    v.small.forEach(function(label) {
      assert.ok(label.indexOf('g') !== -1, 'every second-row entry must show its price: "' + label + '"');
    });
    assert.strictEqual(v.leave, 'LEAVE', 'the shop must read LEAVE in place of SKIP');
    await page.close();
  });

  await runTest("Item A: The Font's panel shows ROLL, then CONTINUE, over the face row", async () => {
    const page = await freshPage(browser);
    const before = await page.evaluate(() => {
      devChromeOpen = true;
      devJumpToSlot('lower', 3);
      return {
        title: (document.querySelector('#eventScreenPanel .die-action-title') || {}).textContent || '',
        buttons: Array.from(document.querySelectorAll('#eventScreenPanel button')).map(b => b.textContent),
        rows: document.querySelectorAll('#playerDieList .die-row').length
      };
    });
    assert.ok(before.title.length > 0, "The Font's flavour must sit where the title goes");
    assert.ok(before.buttons.indexOf('ROLL') !== -1, 'The Font must offer ROLL, got ' + JSON.stringify(before.buttons));
    assert.strictEqual(before.rows, 20, 'The Font must show the face row beneath, got ' + before.rows);

    const after = await page.evaluate(() => {
      Math.random = function() { return (3 - 0.5) / 20; }; // face 3, a blank
      eventRoll();
      return {
        buttons: Array.from(document.querySelectorAll('#eventScreenPanel button')).map(b => b.textContent),
        outcome: (document.querySelector('#eventScreenPanel .die-action-empty') || {}).textContent || '',
        rolled: gameState.turn.rolledFaceNumber
      };
    });
    assert.ok(after.buttons.indexOf('CONTINUE') !== -1, 'The Font must offer CONTINUE after a roll, got ' + JSON.stringify(after.buttons));
    assert.ok(after.outcome.length > 0, "The Font's outcome text must not be empty");
    assert.strictEqual(after.rolled, 3, 'the rolled face must light on the row');
    await page.close();
  });

  await runTest('Item A: every panel renders from state — changing gold changes the shop with no click', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ gold: 0 });
      openShopScreen();
      const poor = Array.from(document.querySelectorAll('#shopPanel .offer-card')).map(c => c.className);
      updateRun({ gold: 500 });
      const rich = Array.from(document.querySelectorAll('#shopPanel .offer-card')).map(c => c.className);
      return { poor: poor, rich: rich };
    });
    assert.ok(v.poor.every(c => c.indexOf('offer-card-disabled') !== -1), 'with no gold every shop card must read as unaffordable');
    assert.ok(v.rich.every(c => c.indexOf('offer-card-disabled') === -1), 'raising gold alone must re-render the shop as affordable');
    await page.close();
  });

  await runTest('Item A: the numbers and hovers the BUILD 153 panels showed are all still present', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // Card reward: soul cost in the name, effect text on the card and in
      // its title (the BUILD 153 hover).
      openCardRewardScreen();
      const rewardCard = document.querySelector('#cardRewardPanel .offer-card');
      const rewardId = rewardCard.dataset.offerId;
      const out = {
        rewardName: rewardCard.querySelector('.offer-card-name').textContent,
        rewardCost: getCardCost(gameState.config.cardPool[rewardId]),
        rewardText: rewardCard.querySelector('.offer-card-text').textContent,
        rewardEffect: getCardEffectText(rewardId),
        rewardTitle: rewardCard.title
      };
      cardRewardSkip();

      // Load: every mod card carries its MOD_DESCRIPTION text.
      openDieActionScreen();
      dieActionChooseLoad();
      const modCard = document.querySelector('#dieActionPanel .offer-die-card');
      out.modId = modCard.dataset.offerId;
      out.modText = modCard.querySelector('.offer-card-text').textContent;
      out.modTitle = modCard.title;

      // The die action menu keeps PURIFY's own hover sentence.
      const newFaces = gameState.die.faces.slice();
      newFaces[6] = Object.assign({}, newFaces[6], { modId: 'smite' });
      updateDie({ faces: newFaces });
      openDieActionScreen();
      const purify = Array.from(document.querySelectorAll('#dieActionPanel button')).find(b => b.textContent === 'PURIFY');
      out.purifyTitle = purify ? purify.title : '';
      // Every face square keeps its own title, weight line and hover tip.
      const squares = Array.from(document.querySelectorAll('#playerDieList .face-btn'));
      out.squares = squares.length;
      out.untitledSquares = squares.filter(b => !b.title).length;
      // A blank face has never carried a hover tip — the rule is one tip
      // per loaded or Nat face, exactly as before BUILD 154.
      out.tips = document.querySelectorAll('#playerDieList .die-row .hover-tip').length;
      out.tippableFaces = gameState.die.faces.filter(f => f.modId !== null).length;
      dieActionChooseSkip();
      cardRewardSkip();

      // Shop: every second-row entry keeps its hover sentence.
      updateRun({ gold: 500 });
      openShopScreen();
      out.smallTips = Array.from(document.querySelectorAll('#shopPanel .offer-small'))
        .map(b => (b.querySelector('.hover-tip') || {}).textContent || '');
      return out;
    });
    assert.ok(v.rewardName.indexOf('(' + v.rewardCost + ')') !== -1, 'a reward card must still show its soul cost: ' + v.rewardName);
    assert.strictEqual(v.rewardText, v.rewardEffect, 'a reward card must show its full effect text');
    assert.ok(v.rewardTitle.indexOf(v.rewardEffect) !== -1, 'a reward card must keep its effect text on hover');
    assert.ok(v.modText.length > 0, 'a mod card must show its description');
    assert.ok(v.modTitle.indexOf(v.modText) !== -1, 'a mod card must keep its description on hover');
    assert.ok(v.purifyTitle.length > 0, 'PURIFY must keep its hover sentence');
    assert.strictEqual(v.squares, 20, 'the face row must still show twenty squares');
    assert.strictEqual(v.untitledSquares, 0, v.untitledSquares + ' face square(s) lost their title');
    assert.strictEqual(v.tips, v.tippableFaces, 'every loaded/Nat face must keep its hover tip, got ' + v.tips + ' for ' + v.tippableFaces + ' faces');
    assert.strictEqual(v.smallTips.length, 3, 'the shop second row must have three entries');
    v.smallTips.forEach(t => assert.ok(t.length > 0, 'a shop second-row entry lost its hover sentence'));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — pop numbers (D-87)
  // ---------------------------------------------------------------

  await runTest('Item B: a forced 16-damage hit pops one damage number, in #f87171, on the enemy art', async () => {
    const page = await freshPage(browser);
    await enterPausedFight(page);
    const v = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[1] = Object.assign({}, faces[1], { modId: 'smite' }); // 16 damage
      updateDie({ faces: faces });
      const hpBefore = gameState.enemy.hp;
      forcePlayerRoll(2);
      const pops = Array.from(document.querySelectorAll('.fx-number'));
      const art = document.getElementById('enemyArtBox').getBoundingClientRect();
      const damage = pops.filter(e => e.dataset.fxKind === 'damage');
      const r = damage.length ? damage[0].getBoundingClientRect() : null;
      return {
        dealt: hpBefore - gameState.enemy.hp,
        damageCount: damage.length,
        text: damage.length ? damage[0].textContent : '',
        colour: damage.length ? damage[0].style.color : '',
        onArt: !!r && r.left >= art.left - 60 && r.right <= art.right + 60 && r.top >= art.top - 60 && r.bottom <= art.bottom + 60,
        cfg: GAME_CONFIG.DAMAGE_NUMBERS
      };
    });
    assert.strictEqual(v.dealt, 16, 'the forced roll must deal 16, got ' + v.dealt);
    assert.strictEqual(v.damageCount, 1, 'exactly one damage number must pop, got ' + v.damageCount);
    assert.strictEqual(v.text, '-16', 'the pop must read -16, got "' + v.text + '"');
    assert.strictEqual(v.colour, 'rgb(248, 113, 113)', 'damage must pop in #f87171, got ' + v.colour);
    assert.strictEqual(v.onArt, true, 'the damage number must pop over the enemy art box');
    assert.strictEqual(v.cfg.RISE_PX, 40);
    assert.strictEqual(v.cfg.FADE_MS, 600);
    assert.strictEqual(v.cfg.STEPS, 5);
    assert.deepStrictEqual(v.cfg.COLOURS, {
      damage: '#f87171', block: '#60a5fa', poison: '#4ade80',
      soul: '#fbbf24', gold: '#d4a017', healing: '#e8e4d0'
    }, 'the six D-87 colours must live in GAME_CONFIG.DAMAGE_NUMBERS');
    await page.close();
  });

  await runTest('Item B: a forced Nat 20 over three loaded faces pops one climbing total, not three numbers', async () => {
    const page = await freshPage(browser);
    await enterPausedFight(page);
    await page.evaluate(() => {
      // Three damage-only mods, on faces 2, 3 and 4. The anchor on face 10
      // is cleared so the sweep's damage is exactly these three.
      const faces = gameState.die.faces.slice();
      faces[1] = Object.assign({}, faces[1], { modId: 'smite' });   // 16
      faces[2] = Object.assign({}, faces[2], { modId: 'zeal' });    // 10
      faces[3] = Object.assign({}, faces[3], { modId: 'unison' });  // 6
      faces[9] = { number: 10, modId: null, modId2: null, weight: faces[9].weight };
      updateDie({ faces: faces });
      updateEnemy({ hp: 999, maxHp: 999 }); // no win mid-sweep
      forcePlayerRoll(20);
    });
    await page.waitForFunction(() => gameState.enemy.hp <= 999 - 32);
    const v = await page.evaluate(() => {
      const damage = Array.from(document.querySelectorAll('.fx-number')).filter(e => e.dataset.fxKind === 'damage');
      return {
        dealt: 999 - gameState.enemy.hp,
        count: damage.length,
        text: damage.length ? damage[0].textContent : ''
      };
    });
    assert.strictEqual(v.dealt, 32, 'the sweep must deal 16+10+6, got ' + v.dealt);
    assert.strictEqual(v.count, 1, 'a Nat 20 sweep must pop one climbing total, got ' + v.count + ' numbers');
    assert.strictEqual(v.text, '-32', 'the climbing total must read the sum, got "' + v.text + '"');
    await page.close();
  });

  await runTest('Item B: block, poison, soul and gold each pop in their own colour, on their own readout', async () => {
    const page = await freshPage(browser);
    await enterPausedFight(page);
    const v = await page.evaluate(() => {
      function popsAfter(fn) {
        document.querySelectorAll('.fx-number').forEach(e => e.remove());
        Object.keys(fxLivePops).forEach(k => delete fxLivePops[k]);
        fn();
        return Array.from(document.querySelectorAll('.fx-number')).map(function(e) {
          const anchorFor = { block: 'playerBlockValue', poison: 'enemyStatusRow', soul: 'playerSoulValue', gold: 'goldValue' };
          const a = document.getElementById(anchorFor[e.dataset.fxKind]);
          const ar = a ? a.getBoundingClientRect() : null;
          const r = e.getBoundingClientRect();
          return {
            kind: e.dataset.fxKind,
            text: e.textContent,
            colour: e.style.color,
            near: !!ar && Math.abs((r.left + r.right) / 2 - (ar.left + ar.right) / 2) < 80
          };
        });
      }
      return {
        block: popsAfter(() => dealBlock(5, 'test')),
        poison: popsAfter(() => updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + 4 })),
        soul: popsAfter(() => updatePlayer({ soul: gameState.player.soul - 1 })),
        gold: popsAfter(() => updateRun({ gold: gameState.run.gold + 12 }))
      };
    });
    assert.strictEqual(v.block.length, 1, 'block must pop exactly one number');
    assert.strictEqual(v.block[0].colour, 'rgb(96, 165, 250)', 'block must pop in #60a5fa');
    assert.strictEqual(v.block[0].text, '+5');
    assert.strictEqual(v.block[0].near, true, 'block must pop on the BL readout');
    assert.strictEqual(v.poison[0].colour, 'rgb(74, 222, 128)', 'poison must pop in #4ade80');
    assert.strictEqual(v.poison[0].text, '+4');
    assert.strictEqual(v.poison[0].near, true, "poison must pop on the enemy's status row");
    assert.strictEqual(v.soul[0].colour, 'rgb(251, 191, 36)', 'soul must pop in #fbbf24');
    assert.strictEqual(v.soul[0].text, '-1');
    assert.strictEqual(v.soul[0].near, true, 'soul must pop on the SOUL readout');
    assert.strictEqual(v.gold[0].colour, 'rgb(212, 160, 23)', 'gold must pop in #d4a017');
    assert.strictEqual(v.gold[0].text, '+12');
    assert.strictEqual(v.gold[0].near, true, 'gold must pop on the GOLD readout');
    await page.close();
  });

  await runTest('Item B: a fight reset and a new run pop nothing', async () => {
    const page = await freshPage(browser);
    await enterPausedFight(page);
    const v = await page.evaluate(() => {
      updatePlayer({ hp: 40, block: 9, poisonStacks: 3 });
      document.querySelectorAll('.fx-number').forEach(e => e.remove());
      Object.keys(fxLivePops).forEach(k => delete fxLivePops[k]);
      resetFight();
      const afterReset = document.querySelectorAll('.fx-number').length;
      startNewRun();
      return { afterReset: afterReset, afterNewRun: document.querySelectorAll('.fx-number').length };
    });
    assert.strictEqual(v.afterReset, 0, 'a fight reset must pop nothing, got ' + v.afterReset);
    assert.strictEqual(v.afterNewRun, 0, 'a new run must pop nothing, got ' + v.afterNewRun);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — the stamp
  // ---------------------------------------------------------------

  await runTest('Item C: the on-screen stamp reads DIE V1 — BUILD N from GAME_CONFIG.BUILD, with no stage number', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      stamp: document.getElementById('buildStamp').textContent.trim(),
      build: GAME_CONFIG.BUILD
    }));
    assert.strictEqual(v.stamp, 'DIE V1 — BUILD ' + v.build, 'the stamp must read "DIE V1 — BUILD ' + v.build + '", got "' + v.stamp + '"');
    assert.strictEqual(/stage/i.test(v.stamp), false, 'the on-screen stamp must carry no stage number');
    await page.close();
  });

  await runTest('Item C: index.html carries no hand-typed stage number in the stamp', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const stampLine = html.split('\n').find(function(l) { return l.indexOf('id="buildStamp"') !== -1; });
    assert.ok(stampLine, 'the #buildStamp line must exist in index.html');
    assert.strictEqual(/STAGE/i.test(stampLine), false, 'the #buildStamp line must not name a stage: ' + stampLine.trim());
    assert.ok(stampLine.indexOf('buildStampNumber') !== -1, 'the stamp must still read its number from #buildStampNumber');
    await Promise.resolve();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build154 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
