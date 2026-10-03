// ============================================================
// TESTS/BUILD184.TEST.JS
// Standing regression suite for BUILD 184 (D-136): two boss counters.
// Cardinal reads the player's blanks and gains Wrath; Pontifex carries
// Absolve on faces 6 and 14, which sheds half its stacks of poison, rounded up.
// Run: node tests/build184.test.js
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

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function openingFight(browser) {
  const page = await freshPage(browser);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate(() => { updateEnemy({ hp: 100000, maxHp: 100000 }); updatePlayer({ hp: 900, maxHp: 900 }); });
  return page;
}

// Act 2's boss is Cardinal, act 3's is Pontifex.
async function bossFight(browser, actNumber) {
  const page = await freshPage(browser);
  await page.evaluate((n) => { updateRun({ act: buildAct(n) }); }, actNumber);
  await page.evaluate(() => { devJumpToSlot('boss', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate(() => { updateEnemy({ hp: 100000, maxHp: 100000 }); updatePlayer({ hp: 900, maxHp: 900 }); });
  return page;
}

async function rollFace(page, faceNumber) {
  await page.evaluate((n) => { forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
}

async function advanceUntilPhase(page, targetPhase) {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate(() => gameState.turn.phase) === targetPhase) return;
    await page.evaluate(() => { nextPhase(); });
  }
  throw new Error('did not reach phase ' + targetPhase);
}

// Wrath already moved into play plus Wrath still queued.
function totalWrath(page) {
  return page.evaluate(() => gameState.enemy.wrath + gameState.enemy.wrathPending);
}

// Rolls face 2 (blank on a fresh die), then lets the real round play out
// with the enemy forced onto its own blank face 2.
async function playRound(page, playerFace) {
  const round = await page.evaluate(() => gameState.turn.round);
  await page.evaluate((n) => { forcePlayerRoll(n); }, playerFace);
  await page.waitForFunction(() => dieRollAnimationsIdle());
  await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
  await page.evaluate(() => { forceEnemyRoll(2); });
  await advanceUntilPhase(page, 'ROLL_PHASE');
  assert.ok(await page.evaluate((r) => gameState.turn.round > r, round), 'the round counter must have advanced');
}

// Rolls a player face, then runs the enemy-reads step on that roll.
async function rollAndRead(page, playerFace) {
  await rollFace(page, playerFace);
  const before = await page.evaluate(() => gameState.enemy.wrathPending);
  await page.evaluate(() => { applyEnemyReads(); });
  return (await page.evaluate(() => gameState.enemy.wrathPending)) - before;
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Item A-a: against Cardinal one blank roll adds CARDINAL_WRATH_PER_BLANK Wrath, three blank rounds add three times that', async () => {
    const page = await bossFight(browser, 2);
    assert.strictEqual(await page.evaluate(() => gameState.enemy.name), 'Cardinal');
    const per = await page.evaluate(() => GAME_CONFIG.CARDINAL_WRATH_PER_BLANK);
    assert.strictEqual(per, 1);
    assert.strictEqual(await totalWrath(page), 0);
    assert.strictEqual(await rollAndRead(page, 2), per, 'one blank roll must raise wrathPending by exactly the constant');
    await page.close();

    const page2 = await bossFight(browser, 2);
    for (let i = 0; i < 3; i++) { await playRound(page2, 2); }
    assert.strictEqual(await totalWrath(page2), 3 * per, 'three blank rounds must add three times the constant');
    await page2.close();
  });

  await runTest('Item A-b: against Cardinal a mod roll, a Nat 20 and a first Nat 1 leave wrathPending unchanged', async () => {
    for (const face of [10, 20, 1]) {
      const page = await bossFight(browser, 2);
      assert.strictEqual(await rollAndRead(page, face), 0, 'face ' + face + ' must not add Wrath');
      await page.close();
    }
  });

  await runTest('Item A-b2: a spent Nat 1 (rolls as blank) and a Sealed loaded face both count as blanks for Cardinal', async () => {
    const page = await bossFight(browser, 2);
    await page.evaluate(() => { updatePlayer({ natOneFiredThisFight: true }); });
    assert.strictEqual(await rollAndRead(page, 1), 1, 'a spent Nat 1 rolls as blank and must count');
    assert.strictEqual(await page.evaluate(() => gameState.turn.rollOutcome), 'blank');
    await page.close();

    const page2 = await bossFight(browser, 2);
    await page2.evaluate(() => { updateTurn({ sealedFaces: [10] }); });
    assert.strictEqual(await rollAndRead(page2, 10), 1, 'a Sealed loaded face must count as a blank');
    await page2.close();
  });

  await runTest('Item A-c: against an enemy that is not Cardinal a blank roll leaves wrathPending unchanged', async () => {
    const page = await openingFight(browser);
    assert.notStrictEqual(await page.evaluate(() => gameState.enemy.name), 'Cardinal');
    assert.strictEqual(await rollAndRead(page, 2), 0);
    await page.close();

    const page2 = await bossFight(browser, 3);
    assert.strictEqual(await page2.evaluate(() => gameState.enemy.name), 'Pontifex');
    assert.strictEqual(await rollAndRead(page2, 2), 0, 'Pontifex reads the heaviest face, not blanks');
    await page2.close();
  });

  await runTest('Item B-d: Absolve leaves 3 of 7 stacks of poison, 0 of 1 and 0 of 0, never negative', async () => {
    const page = await bossFight(browser, 3);
    for (const pair of [[7, 3], [1, 0], [0, 0]]) {
      const after = await page.evaluate((stacks) => {
        updateEnemy({ poisonStacks: stacks });
        callListeners('ENEMY_BUFF_TRIGGER', { buffId: 'enemy_buff_absolve', faceNumber: 6 });
        return gameState.enemy.poisonStacks;
      }, pair[0]);
      assert.strictEqual(after, pair[1], pair[0] + ' stacks must leave ' + pair[1]);
    }
    await page.close();
  });

  await runTest('Item B-d2: Pontifex rolling face 6 or 14 sheds half its poison, rounded up, through the real enemy roll', async () => {
    for (const face of [6, 14]) {
      const page = await bossFight(browser, 3);
      await page.evaluate(() => { updateEnemy({ poisonStacks: 7 }); });
      await rollFace(page, 2);
      await advanceUntilPhase(page, 'ENEMY_ROLL_PHASE');
      await page.evaluate((n) => { forceEnemyRoll(n); }, face);
      assert.strictEqual(await page.evaluate(() => gameState.enemy.poisonStacks), 3, 'face ' + face + ' must shed 4 of 7');
      await page.close();
    }
  });

  await runTest('Item B-e: Pontifex\'s dieSpec has absolve on 6 and 14, poison on 4 and 16, seal on 8 and 19, wrath on 12, nats true', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const spec = GAME_CONFIG.ENEMIES.pontifex.dieSpec;
      const faces = buildAct(3).boss.enemy.die.faces;
      return { faces: spec.faces, nats: spec.nats, built: faces.map(function(f) { return f.modId; }) };
    });
    assert.deepStrictEqual(v.faces, {
      4: 'enemy_buff_poison', 16: 'enemy_buff_poison',
      6: 'enemy_buff_absolve', 14: 'enemy_buff_absolve',
      8: 'enemy_buff_seal', 19: 'enemy_buff_seal',
      12: 'enemy_buff_wrath'
    });
    assert.strictEqual(v.nats, true);
    const expected = new Array(20).fill(null);
    expected[0] = 'ENEMY_NAT_ONE';
    expected[19] = 'ENEMY_NAT_TWENTY';
    Object.keys(v.faces).forEach(function(n) { expected[Number(n) - 1] = v.faces[n]; });
    assert.deepStrictEqual(v.built, expected, 'the built die must match the spec, Nats on 1 and 20');
    await page.close();
  });

  await runTest('Item B-f: ENEMY_BUFF_DISPLAY_NAME maps absolve to ABSOLVE and faceHoverText returns the Absolve sentence', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      name: ENEMY_BUFF_DISPLAY_NAME.enemy_buff_absolve,
      shown: modDisplayName('enemy_buff_absolve'),
      hover: faceHoverText({ number: 6, modId: 'enemy_buff_absolve', modId2: null, weight: 1 }, 5, 'Pontifex', 3)
    }));
    assert.strictEqual(v.name, 'ABSOLVE');
    assert.strictEqual(v.shown, 'ABSOLVE');
    assert.strictEqual(v.hover, 'It sheds half its stacks of poison, rounded up.');
    await page.close();
  });

  await runTest('Item C-g: the F35 header line names Absolve and the F47 line says Cardinal reads blanks', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
    const header = src.slice(0, src.indexOf('const GAME_CONFIG'));
    const line = (n) => header.split('\n').filter((l) => new RegExp('^// F' + n + ' ').test(l));
    assert.strictEqual(line(35).length, 1);
    assert.strictEqual(line(37).length, 1);
    assert.strictEqual(line(47).length, 1);
    assert.ok(line(35)[0].includes('Absolve'), 'F35 lacks Absolve');
    assert.ok(line(47)[0].includes('Cardinal reads blanks'), 'F47 lacks Cardinal reads blanks');
    assert.ok(line(47)[0].includes('Hierophant'), 'F47 must keep Hierophant');
  });

  await runTest('Item D-h: the panel read line shows for Cardinal and Pontifex with their own text, and stays hidden for others', async () => {
    const readLine = (page) => page.evaluate(() => {
      renderStats();
      const el = document.getElementById('enemyReadValue');
      return {
        display: document.getElementById('enemyReadLine').style.display,
        text: el.textContent,
        tip: (el.querySelector('.hover-tip') || {}).textContent || ''
      };
    });
    const cardinal = await bossFight(browser, 2);
    const c = await readLine(cardinal);
    assert.notStrictEqual(c.display, 'none');
    assert.ok(c.text.includes('Reads blanks'), 'Cardinal read line: ' + c.text);
    assert.ok(c.text.includes('Wrath +1 when the player rolls a blank.'), 'Cardinal read line: ' + c.text);
    assert.ok(c.tip.includes('Every blank the player rolls adds Wrath from next round. No cap.'), 'Cardinal tip: ' + c.tip);
    await cardinal.close();

    const pontifex = await bossFight(browser, 3);
    const p = await readLine(pontifex);
    assert.notStrictEqual(p.display, 'none');
    assert.ok(p.text.includes('Reads the heaviest face'), 'Pontifex read line: ' + p.text);
    await pontifex.close();

    const verger = await openingFight(browser);
    assert.strictEqual((await readLine(verger)).display, 'none');
    await verger.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build184 tests passed.');
})();
