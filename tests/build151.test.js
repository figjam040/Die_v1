// ============================================================
// TESTS/BUILD151.TEST.JS
// Standing regression suite for BUILD 151: the third die action Purify,
// and the event slot (The Font) replacing the lower lane's slot index 3
// in every act. Same shape as tests/build150.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build151.test.js
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
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

// rollDie's pool is the faces array in order (default weight 1 each) —
// this Math.random value lands exactly on pool index n-1, i.e. face n,
// as long as no face's weight has been changed before the roll.
function randomForFace(n) {
  return (n - 0.5) / 20;
}

async function enterEventSlot(page) {
  await page.evaluate(() => { devJumpToSlot('lower', 3); });
  await page.waitForFunction(() => eventStep === 'open');
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — Purify
  // ---------------------------------------------------------------

  await runTest('Item A: Purify is hidden with no purifiable face, shown once one exists', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    await page.waitForFunction(() => dieActionStep === 'choose');

    const beforeHasPurify = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#dieActionPanel button')).some(function(b) { return b.textContent.indexOf('Purify') === 0; });
    });
    assert.strictEqual(beforeHasPurify, false, 'a fresh die (only the anchor on face 10) must not offer Purify');

    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' }); // face 5
      updateDie({ faces: newFaces });
    });
    const afterHasPurify = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('#dieActionPanel button')).some(function(b) { return b.textContent.indexOf('Purify') === 0; });
    });
    assert.strictEqual(afterHasPurify, true, 'a loaded non-anchor face must make Purify appear');
    await page.close();
  });

  await runTest('Item A: purifying a two-mod face at weight 3 leaves it blank at weight 3, both mods reappear in the Load pool', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[6] = Object.assign({}, newFaces[6], { modId: 'smite', modId2: 'blight', weight: 3 }); // face 7
      updateDie({ faces: newFaces });
      dieActionChoosePurify();
      dieActionPickPurifyFace(7);
    });
    const face7 = await page.evaluate(() => gameState.die.faces[6]);
    assert.strictEqual(face7.modId, null, 'modId must be cleared');
    assert.strictEqual(face7.modId2, null, 'modId2 must be cleared');
    assert.strictEqual(face7.weight, 3, 'weight must be untouched by Purify');
    const eligible = await page.evaluate(() => eligibleLoadModIds());
    assert.ok(eligible.indexOf('smite') !== -1, 'smite must be offerable again after Purify');
    assert.ok(eligible.indexOf('blight') !== -1, 'blight must be offerable again after Purify');
    await page.close();
  });

  await runTest('Item A: faces 1, 10 and 20 cannot be purified', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { dieActionChoosePurify(); });
    const before = await page.evaluate(() => JSON.parse(JSON.stringify([gameState.die.faces[0], gameState.die.faces[9], gameState.die.faces[19]])));

    for (const faceNumber of [1, 10, 20]) {
      await page.evaluate((faceNumber) => {
        const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
        const row = rows.find(function(r) {
          const numEl = r.querySelector('.face-num');
          return numEl && parseInt(numEl.textContent, 10) === faceNumber;
        });
        if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }, faceNumber);
    }
    const after = await page.evaluate(() => JSON.parse(JSON.stringify([gameState.die.faces[0], gameState.die.faces[9], gameState.die.faces[19]])));
    assert.deepStrictEqual(after, before, 'clicking face 1, 10 or 20 in the Purify picker must not change the die');
    await page.close();
  });

  await runTest('Item A: dieActionEvents records the purify as purify:X|Y>N', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[7] = Object.assign({}, newFaces[7], { modId: 'smite', modId2: 'blight' }); // face 8
      updateDie({ faces: newFaces });
      dieActionChoosePurify();
      dieActionPickPurifyFace(8);
    });
    const line = await page.evaluate(() => buildRunRecordLine());
    assert.ok(line.indexOf('purify:smite|blight>8') !== -1, 'expected the CSV line to contain purify:smite|blight>8, got: ' + line);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — the event slot
  // ---------------------------------------------------------------

  await runTest('Item B: every act\'s lower lane slot index 3 is an event; the upper lane is unchanged', async () => {
    const page = await freshPage(browser);
    const acts = await page.evaluate(() => ({ a1: buildAct(1), a2: buildAct(2), a3: buildAct(3) }));
    [acts.a1, acts.a2, acts.a3].forEach(function(act, i) {
      assert.strictEqual(act.lower[3].type, 'event', 'act ' + (i + 1) + ' lower[3] must be type event');
      assert.strictEqual(act.lower[3].label, 'Anomaly', 'act ' + (i + 1) + ' lower[3] must be labelled Anomaly (D-117)');
      assert.strictEqual(act.lower[3].id, 'font', 'act ' + (i + 1) + ' lower[3] must carry id font');
      assert.strictEqual(act.upper[3].type, 'fight', 'act ' + (i + 1) + ' upper[3] must remain a fight (the Elite)');
      assert.strictEqual(act.upper[3].label, 'Elite', 'act ' + (i + 1) + ' upper[3] must remain the Elite');
    });
    // The rest of the lower lane is untouched — still Fight/Rite at every other index.
    ['a1', 'a2', 'a3'].forEach(function(key) {
      const act = acts[key];
      assert.strictEqual(act.lower[0].type, 'fight');
      assert.strictEqual(act.lower[1].type, 'rite');
      assert.strictEqual(act.lower[2].type, 'fight');
      assert.strictEqual(act.lower[4].type, 'rite');
      assert.strictEqual(act.lower[5].type, 'fight');
      assert.strictEqual(act.lower[6].type, 'fight');
      assert.strictEqual(act.lower[7].type, 'rite');
    });
    await page.close();
  });

  await runTest('Item B/C: the event roll forced to a blank face grants EVENT.BLANK_GOLD gold', async () => {
    const page = await freshPage(browser);
    await enterEventSlot(page);
    const goldBefore = await page.evaluate(() => gameState.run.gold);
    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(3));
    const v = await page.evaluate(() => ({ gold: gameState.run.gold, step: eventStep, text: eventOutcomeText, rolled: gameState.turn.rolledFaceNumber }));
    assert.strictEqual(v.rolled, 3);
    assert.strictEqual(v.gold - goldBefore, 20, 'expected GAME_CONFIG.EVENT.BLANK_GOLD (20) gold from a blank');
    assert.strictEqual(v.step, 'result');
    assert.strictEqual(v.text, 'Coins lie on the bottom.');
    await page.close();
  });

  await runTest('Item B/C: the event roll forced to a loaded face adds 1 weight there', async () => {
    const page = await freshPage(browser);
    await enterEventSlot(page);
    const weightBefore = await page.evaluate(() => gameState.die.faces[9].weight); // face 10, consecrate
    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(10));
    const v = await page.evaluate(() => ({ weight: gameState.die.faces[9].weight, step: eventStep, text: eventOutcomeText }));
    assert.strictEqual(v.weight - weightBefore, 1, 'expected the rolled loaded face to gain 1 weight');
    assert.strictEqual(v.step, 'result');
    assert.strictEqual(v.text, 'The rolled face comes up heavier.');
    await page.close();
  });

  await runTest('Item B/C: the event roll forced to face 20 (Nat 20) opens a Load offer and grants EVENT.NAT_TWENTY_GOLD gold', async () => {
    const page = await freshPage(browser);
    await enterEventSlot(page);
    const goldBefore = await page.evaluate(() => gameState.run.gold);
    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(20));
    const v = await page.evaluate(() => ({ gold: gameState.run.gold, dieActionStep: dieActionStep, eventStep: eventStep }));
    assert.strictEqual(v.gold - goldBefore, 30, 'expected GAME_CONFIG.EVENT.NAT_TWENTY_GOLD (30) gold from a Nat 20');
    assert.strictEqual(v.dieActionStep, 'choose', 'expected the normal die reward panel to open');
    assert.strictEqual(v.eventStep, null, 'the event panel itself must have closed');
    await page.close();
  });

  await runTest('Item B/C: the event roll forced to face 1 (Nat 1) costs 10 HP, never below 1', async () => {
    const page = await freshPage(browser);
    await enterEventSlot(page);
    const hpBefore = await page.evaluate(() => gameState.player.hp);
    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(1));
    const v = await page.evaluate(() => ({ hp: gameState.player.hp, step: eventStep, text: eventOutcomeText }));
    assert.strictEqual(hpBefore - v.hp, 10, 'expected 10 HP lost from a Nat 1');
    assert.strictEqual(v.step, 'result');
    assert.strictEqual(v.text, 'The water keeps what it is owed.');

    // Floor at 1 — never below.
    const page2 = await freshPage(browser);
    await enterEventSlot(page2);
    await page2.evaluate(() => { updatePlayer({ hp: 5 }); });
    await page2.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(1));
    const hpAfter2 = await page2.evaluate(() => gameState.player.hp);
    assert.strictEqual(hpAfter2, 1, 'HP must floor at 1, never go to or below 0');
    await page.close();
    await page2.close();
  });

  await runTest('Item B/C: no mod trigger (or blank-roll) listener fires from the event roll', async () => {
    const page = await freshPage(browser);
    await enterEventSlot(page);
    await page.evaluate(() => {
      window.__modTriggerCount = 0;
      window.__blankRollCount = 0;
      registerListener('MOD_TRIGGER', 'test_spy_mod', function() { window.__modTriggerCount++; }, 'turn');
      registerListener('BLANK_ROLL', 'test_spy_blank', function() { window.__blankRollCount++; }, 'turn');
    });
    // Roll onto the loaded anchor face (10) — would dispatch MOD_TRIGGER
    // if this were a real resolved roll.
    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(10));
    const afterLoaded = await page.evaluate(() => window.__modTriggerCount);
    assert.strictEqual(afterLoaded, 0, 'a loaded face rolled by the event must not dispatch MOD_TRIGGER');

    const page2 = await freshPage(browser);
    await enterEventSlot(page2);
    await page2.evaluate(() => {
      window.__blankRollCount = 0;
      registerListener('BLANK_ROLL', 'test_spy_blank2', function() { window.__blankRollCount++; }, 'turn');
    });
    await page2.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(3));
    const blankCount = await page2.evaluate(() => window.__blankRollCount);
    assert.strictEqual(blankCount, 0, 'a blank face rolled by the event must not dispatch BLANK_ROLL');
    await page.close();
    await page2.close();
  });

  await runTest('Item A/C: every new on-screen text is non-empty', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' });
      updateDie({ faces: newFaces });
    });
    await enterOpeningFight(page);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); checkWinNow(); });
    await page.waitForFunction(() => dieActionStep === 'choose');
    const purifyBtnText = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#dieActionPanel button')).find(function(b) { return b.textContent.indexOf('Purify') === 0; });
      const tip = btn ? btn.querySelector('.hover-tip') : null;
      return btn ? { text: btn.textContent, title: tip ? tip.textContent : '' } : null;
    });
    assert.ok(purifyBtnText && purifyBtnText.text.length > 0, 'Purify button text must not be empty');
    assert.ok(purifyBtnText && purifyBtnText.title.length > 0, 'Purify button hover text must not be empty');
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.evaluate(() => { cardRewardSkip(); });

    await enterEventSlot(page);
    const eventTexts = await page.evaluate(() => {
      const title = document.querySelector('#eventScreenPanel .die-action-title');
      const rollBtn = Array.from(document.querySelectorAll('#eventScreenPanel button')).find(function(b) { return b.textContent === 'ROLL'; });
      return { title: title ? title.textContent : '', roll: rollBtn ? rollBtn.textContent : '' };
    });
    assert.ok(eventTexts.title.length > 0, 'event flavour text must not be empty');
    assert.ok(eventTexts.roll.length > 0, 'ROLL button text must not be empty');

    await page.evaluate((rand) => { Math.random = function() { return rand; }; eventRoll(); }, randomForFace(3));
    const resultTexts = await page.evaluate(() => {
      const outcome = document.querySelector('#eventScreenPanel .die-action-empty');
      const continueBtn = Array.from(document.querySelectorAll('#eventScreenPanel button')).find(function(b) { return b.textContent === 'CONTINUE'; });
      return { outcome: outcome ? outcome.textContent : '', continueText: continueBtn ? continueBtn.textContent : '' };
    });
    assert.ok(resultTexts.outcome.length > 0, 'event outcome text must not be empty');
    assert.ok(resultTexts.continueText.length > 0, 'CONTINUE button text must not be empty');
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build151 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
