// ============================================================
// TESTS/BUILD149.TEST.JS
// Standing regression suite for BUILD 149: the awe status (gameState.enemy.aweStacks,
// applyAwe(), the START_OF_TURN decay, an Attack's damage lowered by it), the six
// awe pieces (Dread, Genuflect, Kneel, Compline, Tremendum, Mysterium), and card
// art loading. Same shape as tests/build148.test.js: plain Node script, playwright
// launched directly, node:assert. Run: node tests/build149.test.js
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

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push({ text: msg.text(), url: msg.location().url || '' }); });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  page._pageErrors = pageErrors;
  page._consoleErrors = consoleErrors;
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

function realErrors(page) {
  return page._consoleErrors.filter((m) => !(m.text.indexOf('Failed to load resource') !== -1 && m.url.indexOf('art/') !== -1)).map((m) => m.text);
}

async function logLines(page) {
  return page.evaluate(() => Array.from(document.getElementById('log').children).map((el) => el.textContent));
}

// Loads modId onto TEST_FACE (face 2), then forces that face's roll through
// the real resolvePlayerRoll() dispatch — same shape as tests/mods.test.js.
const TEST_FACE = 2;
async function triggerMod(page, modId) {
  await page.evaluate(({ modId, faceNum }) => {
    devChromeOpen = true;
    const newFaces = gameState.die.faces.slice();
    newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: modId });
    updateDie({ faces: newFaces });
  }, { modId, faceNum: TEST_FACE });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM (a) — applyAwe(), the badge, and the START_OF_TURN decay
  // ---------------------------------------------------------------

  await runTest('Item a: applyAwe(4) sets aweStacks to 4, the badge shows A4, and after one START_OF_TURN it reads 3', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { applyAwe(4); refreshInspector(); });
    const afterApply = await page.evaluate(() => gameState.enemy.aweStacks);
    assert.strictEqual(afterApply, 4, 'expected aweStacks to be 4');
    const badge = await page.evaluate(() => {
      const el = document.getElementById('enemyStatusRow');
      const match = Array.from(el.children).find((c) => c.textContent.indexOf('A4') === 0);
      return match ? match.textContent : null;
    });
    assert.strictEqual(badge, 'A4', 'expected the enemy status row to show an A4 badge');
    await page.evaluate(() => { runPhase('START_OF_TURN'); });
    const afterTick = await page.evaluate(() => gameState.enemy.aweStacks);
    assert.strictEqual(afterTick, 3, 'expected aweStacks to decay to 3 after one START_OF_TURN');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (b) — awe lowers an Attack's damage, Charge/Wrath interaction
  // ---------------------------------------------------------------

  await runTest('Item b: an Attack of 10 with 4 stacks of awe and no block deals 6, and the log carries the lowered line', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'attack', min: 10, max: 10 }], patternIndex: 0 });
      updatePlayer({ block: 0 });
      runPhase('START_OF_TURN');
    });
    // Set after START_OF_TURN so its own decay does not consume a stack
    // before the round's Attack resolves.
    await page.evaluate(() => { updateEnemy({ aweStacks: 4 }); });
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore - hpAfter, 6, 'expected max(0, 10 - 4) = 6 damage, got ' + (hpBefore - hpAfter));
    const lines = await logLines(page);
    assert.ok(lines.some((l) => l.indexOf('lowered by 4 stacks of awe') !== -1), 'expected a log line naming the lowered attack, got: ' + JSON.stringify(lines.slice(-10)));
    await page.close();
  });

  await runTest('Item b: a Charge release with awe above 0 lands in full', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 24, breakAt: 999 }], patternIndex: 0, aweStacks: 5 });
      updatePlayer({ block: 0 });
      runPhase('START_OF_TURN'); // wind-up begins
    });
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); }); // wind-up round, no damage
    await page.evaluate(() => { runPhase('START_OF_TURN'); }); // release round begins
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore - hpAfter, 24, 'expected the full release (24) to land, awe must not touch a Charge release');
    await page.close();
  });

  await runTest('Item b: Wrath W and awe M on an Attack deal V + W - M', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'attack', min: 10, max: 10 }], patternIndex: 0, wrath: 3 });
      updatePlayer({ block: 0 });
      runPhase('START_OF_TURN');
    });
    await page.evaluate(() => { updateEnemy({ aweStacks: 4 }); });
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate(() => { runPhase('ENEMY_ACT_PHASE'); });
    const hpAfter = await page.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpBefore - hpAfter, 9, 'expected 10 + 3 - 4 = 9 damage, got ' + (hpBefore - hpAfter));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (c) — Dread and Genuflect, through mod_dispatch
  // ---------------------------------------------------------------

  await runTest('Item c: Dread\'s trigger applies 4 stacks of awe', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const before = await page.evaluate(() => gameState.enemy.aweStacks);
    await triggerMod(page, 'dread');
    const after = await page.evaluate(() => gameState.enemy.aweStacks);
    assert.strictEqual(after - before, 4, 'expected exactly +4 stacks of awe');
    await page.close();
  });

  await runTest('Item c: Genuflect\'s trigger gives 6 block and 3 stacks of awe', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const before = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    await triggerMod(page, 'genuflect');
    const after = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    assert.strictEqual(after.block - before.block, 6, 'expected exactly +6 block');
    assert.strictEqual(after.awe - before.awe, 3, 'expected exactly +3 stacks of awe');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (d) — Kneel, Compline, Tremendum, Mysterium
  // ---------------------------------------------------------------

  await runTest('Item d: Kneel applies 3 stacks of awe', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['kneel'], soul: 5 }); });
    const before = await page.evaluate(() => gameState.enemy.aweStacks);
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => gameState.enemy.aweStacks);
    assert.strictEqual(after - before, 3, 'expected exactly +3 stacks of awe');
    await page.close();
  });

  await runTest('Item d: Compline gives 4 block and applies 2 stacks of awe', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updatePlayer({ hand: ['compline'], soul: 5 }); });
    const before = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    await page.evaluate(() => { playCard(0); });
    const after = await page.evaluate(() => ({ block: gameState.player.block, awe: gameState.enemy.aweStacks }));
    assert.strictEqual(after.block - before.block, 4, 'expected exactly +4 block');
    assert.strictEqual(after.awe - before.awe, 2, 'expected exactly +2 stacks of awe');
    await page.close();
  });

  await runTest('Item d: Tremendum with 3 stacks of awe deals 10, with 6 stacks deals 12 (capped)', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updateEnemy({ aweStacks: 3 }); updatePlayer({ hand: ['tremendum'], soul: 5 }); });
    const before1 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after1 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before1 - after1, 10, 'expected 4 + 2*3 = 10 damage');

    await page.evaluate(() => { updateEnemy({ aweStacks: 6 }); updatePlayer({ hand: ['tremendum'], soul: 5 }); });
    const before2 = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    const after2 = await page.evaluate(() => gameState.enemy.hp);
    assert.strictEqual(before2 - after2, 12, 'expected 4 + 2*6 = 16 capped to 12 damage');
    await page.close();
  });

  await runTest('Item d: Mysterium with 2 stacks deals 6, with 5 stacks deals 12 (capped), stacks of awe unchanged', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { updateEnemy({ aweStacks: 2 }); updatePlayer({ hand: ['mysterium'], soul: 5 }); });
    const before1 = await page.evaluate(() => ({ hp: gameState.enemy.hp, awe: gameState.enemy.aweStacks }));
    await page.evaluate(() => { playCard(0); });
    const after1 = await page.evaluate(() => ({ hp: gameState.enemy.hp, awe: gameState.enemy.aweStacks }));
    assert.strictEqual(before1.hp - after1.hp, 6, 'expected 3*2 = 6 damage');
    assert.strictEqual(after1.awe, before1.awe, 'expected stacks of awe unchanged');

    await page.evaluate(() => { updateEnemy({ aweStacks: 5 }); updatePlayer({ hand: ['mysterium'], soul: 5 }); });
    const before2 = await page.evaluate(() => ({ hp: gameState.enemy.hp, awe: gameState.enemy.aweStacks }));
    await page.evaluate(() => { playCard(0); });
    const after2 = await page.evaluate(() => ({ hp: gameState.enemy.hp, awe: gameState.enemy.aweStacks }));
    assert.strictEqual(before2.hp - after2.hp, 12, 'expected 3*5 = 15 capped to 12 damage');
    assert.strictEqual(after2.awe, before2.awe, 'expected stacks of awe unchanged');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (e) — pool sizes, tags, Load offer eligibility
  // ---------------------------------------------------------------

  await runTest('Item e: the mod pool has 27 entries and the card pool has at least 40, both awe pieces carry the awe tag, Load offers can contain Dread', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      modCount: Object.keys(gameState.config.mods).length,
      cardCount: Object.keys(gameState.config.cardPool).length,
      modTags: {
        dread: gameState.config.mods.dread.tags,
        genuflect: gameState.config.mods.genuflect.tags
      },
      cardTags: {
        kneel: gameState.config.cardPool.kneel.tags,
        compline: gameState.config.cardPool.compline.tags,
        tremendum: gameState.config.cardPool.tremendum.tags,
        mysterium: gameState.config.cardPool.mysterium.tags
      }
    }));
    assert.strictEqual(v.modCount, 27, 'expected 27 mods');
    assert.ok(v.cardCount >= 40, 'expected at least 40 reward-pool cards, got ' + v.cardCount);
    assert.deepStrictEqual(v.modTags.dread, ['awe']);
    assert.deepStrictEqual(v.modTags.genuflect, ['awe']);
    assert.deepStrictEqual(v.cardTags.kneel, ['awe']);
    assert.deepStrictEqual(v.cardTags.compline, ['awe']);
    assert.deepStrictEqual(v.cardTags.tremendum, ['awe']);
    assert.deepStrictEqual(v.cardTags.mysterium, ['awe']);

    // Every other common-tier mod already loaded leaves Dread the only
    // common candidate — a fixed roll of 0 (always 'common', always the
    // first remaining match) then deterministically offers it.
    const offer = await page.evaluate(() => {
      const commonModIds = Object.keys(gameState.config.mods).filter(function(id) {
        return gameState.config.mods[id].tier === 'common' && id !== 'dread';
      });
      const blankFaces = gameState.die.faces.filter(function(f) { return f.modId === null; });
      const newFaces = gameState.die.faces.slice();
      commonModIds.forEach(function(modId, i) {
        const face = blankFaces[i];
        newFaces[face.number - 1] = Object.assign({}, newFaces[face.number - 1], { modId: modId });
      });
      updateDie({ faces: newFaces });
      Math.random = function() { return 0; };
      dieActionChooseLoad();
      return dieActionMods.slice();
    });
    assert.ok(offer.indexOf('dread') !== -1, 'expected Dread to be reachable through a Load offer, got: ' + JSON.stringify(offer));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (f) — card art loading
  // ---------------------------------------------------------------

  await runTest('Item f: a hand card has an img child whose src ends with art/cards/<id>.png, hidden with an empty box on load failure', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.waitForTimeout(200); // let the (missing) image's error event fire
    const v = await page.evaluate(() => {
      const firstCard = document.querySelector('#handRow .hand-card-el');
      const artBox = firstCard.querySelector('.hand-card-art');
      const img = artBox.querySelector('img');
      const cardId = gameState.player.hand[0];
      return {
        src: img ? img.getAttribute('src') : null,
        cardId: cardId,
        display: img ? getComputedStyle(img).display : null,
        boxText: artBox.textContent
      };
    });
    assert.ok(v.src, 'expected the hand card art box to hold an img');
    assert.strictEqual(v.src, 'art/cards/' + v.cardId + '.png', 'expected the img src to be art/cards/<id>.png');
    assert.strictEqual(v.display, 'none', 'expected the img to be hidden once the missing file fails to load');
    assert.strictEqual(v.boxText, '', 'expected the art box to carry no text label');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM (g) — no errors
  // ---------------------------------------------------------------

  await runTest('Item g: no page errors and no console errors (art excluded) on the fight screen', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the fight screen: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors on the fight screen: ' + realErrors(page).join('; '));
    await page.close();
  });

  await runTest('Item g: no page errors and no console errors (art excluded) on the map', async () => {
    const page = await freshPage(browser);
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the map: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors on the map: ' + realErrors(page).join('; '));
    await page.close();
  });

  await runTest('Item g: no page errors and no console errors (art excluded) on the card reward panel', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    await page.waitForTimeout(200);
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.waitForTimeout(300);
    assert.deepStrictEqual(page._pageErrors, [], 'page errors on the card reward panel: ' + page._pageErrors.join('; '));
    assert.deepStrictEqual(realErrors(page), [], 'console errors on the card reward panel: ' + realErrors(page).join('; '));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build149 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
