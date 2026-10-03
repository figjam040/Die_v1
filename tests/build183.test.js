// ============================================================
// TESTS/BUILD183.TEST.JS
// Standing regression suite for BUILD 183 (D-135): the caps pass on the
// card pool — Reckoning, Covenant and Gradual cap at 12; Tenet is rare;
// Exequy, Vindication and Jubilee lose their caps; Exequy costs 1 and
// Vindication 3 — plus four reconciled CLAUDE.md lines.
// Run: node tests/build183.test.js
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

async function freshFight(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => {
    devChromeOpen = true;
    enterSlot('opening', null);
    updateEnemy({ hp: 1000, maxHp: 1000 });
  });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

async function rollFace(page, faceNumber) {
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
}

// Plays one card through playCard() and returns the enemy HP it took.
async function playAndMeasure(page, cardId) {
  await page.evaluate((id) => { updatePlayer({ hand: [id], soul: 5 }); }, cardId);
  const before = await page.evaluate(() => gameState.enemy.hp);
  await page.evaluate(() => { playCard(0); });
  return before - await page.evaluate(() => gameState.enemy.hp);
}

function setFace(page, faceNumber, changes) {
  return page.evaluate((a) => {
    const faces = gameState.die.faces.slice();
    const i = faces.findIndex(function(f) { return f.number === a.faceNumber; });
    faces[i] = Object.assign({}, faces[i], a.changes);
    updateDie({ faces: faces });
  }, { faceNumber, changes });
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Reckoning at 26 enemy stacks of poison deals 12', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 3);
    await page.evaluate(() => { updateEnemy({ poisonStacks: 26 }); });
    assert.strictEqual(await playAndMeasure(page, 'reckoning'), 12);
    await page.close();
  });

  await runTest('Reckoning at 2 stacks still deals 7, under its cap', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 3);
    await page.evaluate(() => { updateEnemy({ poisonStacks: 2 }); });
    assert.strictEqual(await playAndMeasure(page, 'reckoning'), 7);
    await page.close();
  });

  await runTest('Covenant on a rolled face of weight 18 deals 12', async () => {
    const page = await freshFight(browser);
    await setFace(page, 3, { weight: 18 });
    await rollFace(page, 3);
    assert.strictEqual(await page.evaluate(() => gameState.turn.rolledFaceWeight), 18);
    assert.strictEqual(await playAndMeasure(page, 'covenant'), 12);
    await page.close();
  });

  await runTest('Gradual with a heaviest loaded face of weight 18 deals 12', async () => {
    const page = await freshFight(browser);
    await setFace(page, 5, { modId: 'smite', weight: 18 });
    await rollFace(page, 3);
    assert.strictEqual(await playAndMeasure(page, 'gradual'), 12);
    await page.close();
  });

  await runTest('Tenet is rare and a rolled face triggered 40 times deals 46', async () => {
    const page = await freshFight(browser);
    assert.strictEqual(await page.evaluate(() => gameState.config.cards['tenet'].tier), 'rare');
    await rollFace(page, 3);
    await setFace(page, 3, { modData: { triggerCount: 40 } });
    assert.strictEqual(await playAndMeasure(page, 'tenet'), 46);
    await page.close();
  });

  await runTest('Exequy at 26 enemy stacks deals 26, costs 1 and leaves the stacks at 26', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 3);
    assert.strictEqual(await page.evaluate(() => gameState.config.cards['exequy'].soulCost), 1);
    await page.evaluate(() => { updateEnemy({ poisonStacks: 26 }); });
    assert.strictEqual(await playAndMeasure(page, 'exequy'), 26);
    assert.strictEqual(await page.evaluate(() => gameState.enemy.poisonStacks), 26);
    assert.strictEqual(await page.evaluate(() => gameState.player.soul), 4);
    await page.close();
  });

  await runTest('Vindication at 107 block deals 214 and costs 3', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 3);
    assert.strictEqual(await page.evaluate(() => gameState.config.cards['vindication'].soulCost), 3);
    await page.evaluate(() => { updatePlayer({ hand: ['vindication'], soul: 5, block: 107 }); });
    const before = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { playCard(0); });
    assert.strictEqual(before - await page.evaluate(() => gameState.enemy.hp), 214);
    assert.strictEqual(await page.evaluate(() => gameState.player.soul), 2);
    await page.close();
  });

  await runTest('Jubilee with 15 weight added to the die this run deals 34', async () => {
    const page = await freshFight(browser);
    await rollFace(page, 3);
    await page.evaluate(() => { updateRun({ weightAdded: 15 }); });
    assert.strictEqual(await playAndMeasure(page, 'jubilee'), 34);
    await page.close();
  });

  await runTest('reward-pool card tiers count 24 basic, 14 uncommon, 10 rare', async () => {
    const page = await freshFight(browser);
    const poolTierCounts = await page.evaluate(() => {
      const out = { basic: 0, uncommon: 0, rare: 0 };
      Object.keys(gameState.config.cardPool).forEach(function(id) { out[gameState.config.cardPool[id].tier] += 1; });
      return out;
    });
    assert.deepStrictEqual(poolTierCounts, { basic: 24, uncommon: 14, rare: 10 });
    await page.close();
  });

  await runTest('the seven card texts are exact and no mod, card or artifact has empty on-screen text', async () => {
    const page = await freshFight(browser);
    const r = await page.evaluate(() => ({
      texts: {
        reckoning: getCardEffectText('reckoning'),
        covenant: getCardEffectText('covenant'),
        gradual: getCardEffectText('gradual'),
        tenet: getCardEffectText('tenet'),
        exequy: getCardEffectText('exequy'),
        vindication: getCardEffectText('vindication'),
        jubilee: getCardEffectText('jubilee')
      },
      emptyMods: Object.keys(gameState.config.mods).filter(id => !MOD_DESCRIPTION[id] || !MOD_DESCRIPTION[id].trim()),
      emptyCards: Object.keys(gameState.config.cards).filter(id => !getCardEffectText(id) || !getCardEffectText(id).trim()),
      emptyArtifacts: Object.keys(gameState.config.artifacts).filter(id => !gameState.config.artifacts[id].text || !gameState.config.artifacts[id].text.trim())
    }));
    assert.deepStrictEqual(r.texts, {
      reckoning: 'Deal 3 damage, plus 2 per stack of poison on the enemy, up to 12.',
      covenant: 'Deal 2 damage, plus 3 per weight of the rolled face, up to 12.',
      gradual: 'Deal 3 damage, plus 1 per weight of your heaviest loaded face, up to 12.',
      tenet: 'Deal 6 damage, plus 1 for each time the rolled face has triggered.',
      exequy: "Deal damage equal to the enemy's stacks of poison.",
      vindication: 'Deal damage equal to twice your block.',
      jubilee: 'Deal 4 damage, plus 2 per weight added to your die.'
    });
    assert.deepStrictEqual(r.emptyMods, []);
    assert.deepStrictEqual(r.emptyCards, []);
    assert.deepStrictEqual(r.emptyArtifacts, []);
    await page.close();
  });

  await runTest('CLAUDE.md carries the four reconciled lines and none of the stale ones', async () => {
    const md = fs.readFileSync(path.resolve(ROOT, 'CLAUDE.md'), 'utf8');
    assert.strictEqual(md.indexOf('F01-F39+'), -1);
    assert.ok(md.indexOf('F01-F52') !== -1);
    assert.strictEqual(md.indexOf('Enchant and Expand are deferred'), -1);
    assert.ok(md.indexOf('Expand is deferred; Enchant is a dead word for Strengthen.') !== -1);
    assert.strictEqual(md.indexOf('×N in the die rows'), -1);
    assert.ok(md.indexOf('Weight shows as the D-130 line under the face and in the DIE table; the hidden .die-mod-wrap keeps the ×N text.') !== -1);
    assert.strictEqual(md.indexOf('FACTS block on the Notion page'), -1);
    assert.ok(md.indexOf('and the F-row on 2 Register') !== -1);
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build183 tests passed.');
})();
