// ============================================================
// TESTS/BUILD171.TEST.JS
// Standing regression suite for BUILD 171: KI-48 Anthem reads the weight
// of the face carrying it, KI-49 Jubilee counts weight added through
// strengthenFace() (gameState.run.weightAdded), not total die weight.
// Run: node tests/build171.test.js
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

async function freshFight(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => {
    devChromeOpen = true;
    enterSlot('opening', null);
    updateEnemy({ hp: 500, maxHp: 500 });
  });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

function loadMod(page, modId, faceNumber) {
  return page.evaluate((a) => {
    document.getElementById('devModSelect').value = a.modId;
    document.getElementById('devFaceInput').value = String(a.faceNumber);
    devLoadMod();
  }, { modId, faceNumber });
}

// Rolls a face and returns the enemy HP lost once the roll and any sweep
// have fully resolved.
async function rollAndMeasure(page, faceNumber, mustTrigger) {
  const before = await page.evaluate(() => gameState.enemy.hp);
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction((name) => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE' &&
    gameState.turn.modsTriggered.indexOf(name) !== -1, mustTrigger);
  return before - await page.evaluate(() => gameState.enemy.hp);
}

async function playJubilee(page) {
  await page.evaluate(() => { updateEnemy({ hp: 500, maxHp: 500 }); updatePlayer({ hand: ['jubilee'], soul: 5 }); });
  const before = await page.evaluate(() => gameState.enemy.hp);
  await page.evaluate(() => { playCard(0); });
  return before - await page.evaluate(() => gameState.enemy.hp);
}

async function reachCardPhase(page) {
  await page.evaluate(() => { forcePlayerRoll(9); });
  await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Item A: Anthem on face 7 at weight 2, rolled directly, deals 14', async () => {
    const page = await freshFight(browser);
    await loadMod(page, 'anthem', 7);
    await page.evaluate(() => { strengthenFace(7); });
    assert.strictEqual(await rollAndMeasure(page, 7, 'Anthem'), 14);
    await page.close();
  });

  await runTest('Item A: in a Nat 20 sweep Anthem reads its own face (14), not the rolled face 20 at weight 5 (26)', async () => {
    const page = await freshFight(browser);
    await loadMod(page, 'anthem', 7);
    await page.evaluate(() => { strengthenFace(7); for (let i = 0; i < 4; i++) { strengthenFace(20); } });
    assert.strictEqual(await page.evaluate(() => getPlayerFace(20).weight), 5);
    assert.strictEqual(await rollAndMeasure(page, 20, 'Anthem'), 14);
    await page.close();
  });

  await runTest('Item A: Magnificat on face 4 triggers Anthem on face 7 at weight 3 for 18', async () => {
    const page = await freshFight(browser);
    await loadMod(page, 'anthem', 7);
    await loadMod(page, 'magnificat', 4);
    await page.evaluate(() => { strengthenFace(7); strengthenFace(7); });
    assert.strictEqual(await rollAndMeasure(page, 4, 'Anthem'), 18);
    await page.close();
  });

  await runTest('Item A: Anthem text is exact and no mod, card or artifact has empty text', async () => {
    const page = await freshFight(browser);
    const r = await page.evaluate(() => ({
      anthem: MOD_DESCRIPTION.anthem,
      emptyMods: Object.keys(gameState.config.mods).filter(id => !MOD_DESCRIPTION[id] || !MOD_DESCRIPTION[id].trim()),
      emptyCards: Object.keys(gameState.config.cards).filter(id => !getCardEffectText(id) || !getCardEffectText(id).trim()),
      emptyArtifacts: Object.keys(gameState.config.artifacts).filter(id => !gameState.config.artifacts[id].text || !gameState.config.artifacts[id].text.trim())
    }));
    assert.strictEqual(r.anthem, 'Deal 6 damage, plus 4 per weight on this face.');
    assert.deepStrictEqual(r.emptyMods, []);
    assert.deepStrictEqual(r.emptyCards, []);
    assert.deepStrictEqual(r.emptyArtifacts, []);
    await page.close();
  });

  await runTest('Item B: Jubilee counts weight added, unchanged by Remove', async () => {
    const page = await freshFight(browser);
    await reachCardPhase(page);
    assert.strictEqual(await page.evaluate(() => gameState.run.weightAdded), 0);
    assert.strictEqual(await playJubilee(page), 4);
    await page.evaluate(() => { strengthenFace(5); strengthenFace(5); });
    assert.strictEqual(await page.evaluate(() => gameState.run.weightAdded), 2);
    assert.strictEqual(await playJubilee(page), 8);
    await page.evaluate(() => { dieActionPickRemoveFace(7); });
    assert.strictEqual(await page.evaluate(() => gameState.die.faces.length), 19);
    assert.strictEqual(await page.evaluate(() => gameState.run.weightAdded), 2);
    assert.strictEqual(await playJubilee(page), 8);
    await page.close();
  });

  await runTest('Item B: Leaden Face makes one Strengthen count 2', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['leaden_face'] }); dieActionPickStrengthenFace(5); });
    assert.strictEqual(await page.evaluate(() => gameState.run.weightAdded), 2);
    assert.strictEqual(await page.evaluate(() => getPlayerFace(5).weight), 3);
    await page.close();
  });

  await runTest('Item B: Jubilee caps at 24 from weightAdded 12 and 13', async () => {
    const page = await freshFight(browser);
    await reachCardPhase(page);
    await page.evaluate(() => { updateRun({ weightAdded: 12 }); });
    assert.strictEqual(await playJubilee(page), 24);
    await page.evaluate(() => { updateRun({ weightAdded: 13 }); });
    assert.strictEqual(await playJubilee(page), 24);
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build171 tests passed.');
})();
