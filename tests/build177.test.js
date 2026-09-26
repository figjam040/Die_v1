// Standing regression suite for BUILD 177: the DIE layer's trigger count is
// per run (KI-50), the dev drawer's Load All skips the anchor (KI-23), every
// openDieActionScreen() caller names its origin and a dev open returns to the
// fight (KI-21), and the DIE layer joins the screenshot set.
// Run: node tests/build177.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRunner, FILE_URL } = require('./shared-constants');

const { runTest, report } = createRunner();

const ROOT = path.resolve(__dirname, '..');

async function freshFight(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => {
    window.rowFor = n => [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
    devChromeOpen = true;
    enterSlot('opening', null);
  });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

function devLoad(page, modId, faceNumber) {
  return page.evaluate(([m, n]) => {
    document.getElementById('devModSelect').value = m;
    document.getElementById('devFaceInput').value = String(n);
    devLoadMod();
  }, [modId, faceNumber]);
}

// Ends the fight as a win and walks the real reward flow back to the map.
async function winAndReturnToMap(page) {
  await page.waitForFunction(() => dieRollAnimationsIdle());
  await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
  await page.waitForFunction(() => dieActionStep !== null);
  await page.evaluate(() => dieActionChooseSkip());
  await page.waitForFunction(() => cardRewardStep !== null);
  await page.evaluate(() => cardRewardSkip());
  await page.waitForFunction(() => gameState.run.screen === 'map');
}

(async () => {
  const browser = await chromium.launch();

  await runTest('the trigger count on a face survives a win and the next fight, shows in the DIE table, and only startNewRun() zeroes it', async () => {
    const page = await freshFight(browser);
    await devLoad(page, 'smite', 2);
    await page.evaluate(() => forcePlayerRoll(2));
    const countAfterRoll = await page.evaluate(() => getPlayerFace(2).modData.triggerCount);
    assert.ok(countAfterRoll >= 1, 'face 2 triggerCount after its roll: ' + countAfterRoll);

    await winAndReturnToMap(page);
    const countAfterWin = await page.evaluate(() => getPlayerFace(2).modData.triggerCount);
    assert.strictEqual(countAfterWin, countAfterRoll, 'face 2 triggerCount after the fight ended');

    await page.evaluate(() => { devPauseBeforeFirstRoll = true; chooseLane('upper'); enterSlot('upper', 0); });
    await page.waitForFunction(() => gameState.run.screen === 'fight' && gameState.turn.phase === 'START_OF_TURN');
    const nextFight = await page.evaluate(() => ({ round: gameState.turn.round, lane: gameState.run.currentSlot.lane, count: getPlayerFace(2).modData.triggerCount }));
    assert.strictEqual(nextFight.lane, 'upper', 'the next fight is the upper lane slot');
    assert.strictEqual(nextFight.round, 1, 'the next fight is at its round ' + nextFight.round);
    assert.strictEqual(nextFight.count, countAfterRoll, 'face 2 triggerCount at the start of the next fight');

    await page.click('#dieInfoBtn');
    const tableCell = await page.evaluate(() => {
      const row = [...document.querySelectorAll('#dieInfoContent .info-table-row')].find(r => r.cells[0].textContent === '2');
      return row.cells[3].textContent;
    });
    assert.strictEqual(tableCell, String(countAfterRoll), 'DIE table Triggered cell for face 2');
    await page.click('#dieInfoCloseBtn');

    const afterNewRun = await page.evaluate(() => { startNewRun(); const f = getPlayerFace(2); return { modId: f.modId, count: (f.modData && f.modData.triggerCount) || 0 }; });
    assert.strictEqual(afterNewRun.modId, null, 'face 2 mod after startNewRun()');
    assert.strictEqual(afterNewRun.count, 0, 'face 2 triggerCount after startNewRun()');
    await page.close();
  });

  await runTest('Load All fills every open slot on faces 2-19 but face 10, leaves faces 1, 10 and 20 alone, keeps a two-mod face, and writes no run record event', async () => {
    const page = await freshFight(browser);
    await devLoad(page, 'smite', 2);
    await devLoad(page, 'blight', 2);
    const before = await page.evaluate(() => ({ faces: JSON.parse(JSON.stringify(gameState.die.faces)), events: gameState.runRecord.dieActionEvents.length }));
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'fervour';
      document.getElementById('devLoadAllBtn').click();
    });
    const after = await page.evaluate(() => ({ faces: JSON.parse(JSON.stringify(gameState.die.faces)), events: gameState.runRecord.dieActionEvents.length }));
    const byNumber = (faces, n) => faces.find(f => f.number === n);
    [1, 10, 20].forEach(n => assert.deepStrictEqual(byNumber(after.faces, n), byNumber(before.faces, n), 'face ' + n + ' after Load All'));
    assert.deepStrictEqual(byNumber(after.faces, 2), byNumber(before.faces, 2), 'face 2 (two mods already) after Load All');
    let facesFilledByLoadAll = 0;
    after.faces.forEach(f => {
      if ([1, 2, 10, 20].indexOf(f.number) !== -1) return;
      const b = byNumber(before.faces, f.number);
      assert.strictEqual(b.modId, null, 'face ' + f.number + ' was blank before');
      assert.strictEqual(f.modId, 'fervour', 'face ' + f.number + ' modId after Load All');
      facesFilledByLoadAll++;
    });
    assert.strictEqual(facesFilledByLoadAll, 16, 'faces 3-9 and 11-19 filled: ' + facesFilledByLoadAll);
    assert.strictEqual(after.events, before.events, 'run record die action events after Load All');
    const rowText = await page.evaluate(() => rowFor(3).textContent.toLowerCase());
    assert.ok(rowText.indexOf('fervour') !== -1, 'face 3 row after the re-render: ' + rowText);
    await page.close();
  });

  await runTest('Load All puts the mod in the second slot of a face that holds one, never a third', async () => {
    const page = await freshFight(browser);
    await devLoad(page, 'smite', 3);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'fervour';
      document.getElementById('devLoadAllBtn').click();
      document.getElementById('devLoadAllBtn').click();
    });
    const face3 = await page.evaluate(() => { const f = getPlayerFace(3); return { modId: f.modId, modId2: f.modId2 }; });
    assert.deepStrictEqual(face3, { modId: 'smite', modId2: 'fervour' });
    await page.close();
  });

  await runTest('opening the die action panel from the dev drawer and closing it leaves the fight running with no card reward layer', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => document.getElementById('devSkipToDieActionBtn').click());
    const opened = await page.evaluate(() => ({ step: dieActionStep, origin: dieActionOrigin }));
    assert.strictEqual(opened.step, 'choose');
    assert.strictEqual(opened.origin, 'dev');
    await page.evaluate(() => dieActionChooseSkip());
    const v = await page.evaluate(() => ({
      dieActionStep: dieActionStep,
      cardRewardStep: cardRewardStep,
      screen: gameState.run.screen,
      status: gameState.run.status,
      phase: gameState.turn.phase,
      layerActive: document.getElementById('fightScreen').classList.contains('reward-layer-active')
    }));
    assert.strictEqual(v.dieActionStep, null);
    assert.strictEqual(v.cardRewardStep, null, 'card reward step after the dev close');
    assert.strictEqual(v.screen, 'fight');
    assert.strictEqual(v.status, 'active');
    assert.ok(['ROLL_PHASE', 'CARD_PHASE'].indexOf(v.phase) !== -1, 'phase after the dev close: ' + v.phase);
    assert.strictEqual(v.layerActive, false, 'reward layer showing after the dev close');
    await page.close();
  });

  await runTest('opening the die action panel from a fight win and closing it opens the card reward', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    await page.waitForFunction(() => dieActionStep !== null);
    assert.strictEqual(await page.evaluate(() => dieActionOrigin), 'reward');
    await page.evaluate(() => dieActionChooseSkip());
    await page.waitForFunction(() => cardRewardStep !== null);
    assert.strictEqual(await page.evaluate(() => document.getElementById('fightScreen').classList.contains('reward-layer-active')), true);
    await page.close();
  });

  await runTest('openDieActionScreen() with no origin, or an unknown one, throws and opens nothing', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const messages = [];
      [undefined, 'bogus'].forEach(o => { try { openDieActionScreen(o); } catch (e) { messages.push(e.message); } });
      return { messages: messages, step: dieActionStep, origin: dieActionOrigin };
    });
    assert.strictEqual(v.messages.length, 2, 'calls that threw: ' + v.messages.length);
    assert.strictEqual(v.step, null);
    assert.strictEqual(v.origin, null);
    await page.close();
  });

  await runTest('no call to openDieActionScreen() in js/ or index.html names no origin', async () => {
    const files = fs.readdirSync(path.join(ROOT, 'js')).map(f => path.join(ROOT, 'js', f)).concat([path.join(ROOT, 'index.html')]);
    const bare = [];
    files.forEach(f => {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*\/\//.test(line) || /function openDieActionScreen|throw new Error/.test(line)) return;
        if (/openDieActionScreen\(\s*\)/.test(line)) bare.push(path.basename(f) + ':' + (i + 1));
      });
    });
    assert.deepStrictEqual(bare, []);
  });

  await runTest('the die_layer shot is in the screenshot set, and the DIE layer shows 20 table rows after the same seeded steps', async () => {
    const src = fs.readFileSync(path.join(__dirname, 'screenshots.js'), 'utf8');
    const set = src.match(/const SCREENS = \[([^\]]*)\]/)[1].split(',').map(s => s.trim().replace(/'/g, ''));
    assert.ok(set.indexOf('die_layer') !== -1, 'screens in the set: ' + set.join(' '));
    assert.ok(set.indexOf('die_layer') > set.indexOf('fight'), 'die_layer comes after fight');

    const page = await freshFight(browser);
    await devLoad(page, 'smite', 2);
    await devLoad(page, 'blight', 2);
    await page.evaluate(() => strengthenFace(10));
    await page.click('#dieInfoBtn');
    const tableRows = await page.evaluate(() => document.querySelectorAll('#dieInfoContent .info-table-row').length);
    assert.strictEqual(tableRows, 20, 'DIE layer table rows');
    const shot = path.join(os.tmpdir(), 'die_v1_build177_die_layer.png');
    await page.screenshot({ path: shot });
    assert.ok(fs.statSync(shot).size > 1000, 'die_layer shot bytes: ' + fs.statSync(shot).size);
    fs.unlinkSync(shot);
    await page.close();
  });

  await runTest('no piece has empty on-screen text: DIE layer cells and lines, dev drawer buttons, the dev-opened die action panel', async () => {
    const page = await freshFight(browser);
    await devLoad(page, 'smite', 2);
    await page.click('#dieInfoBtn');
    const layer = await page.evaluate(() => {
      const cells = [...document.querySelectorAll('#dieInfoContent th, #dieInfoContent .info-list-row, #dieInfoContent .info-table-row td')];
      const modCells = [...document.querySelectorAll('#dieInfoContent .info-table-row')].map(r => r.cells[2].textContent.trim());
      return { emptyCells: cells.filter(c => !c.textContent.trim() && !c.matches('td:last-child')).length, checked: cells.length, emptyModCells: modCells.filter(t => !t).length };
    });
    assert.strictEqual(layer.emptyCells, 0, 'DIE layer face, weight, header and line elements with no text, of ' + layer.checked);
    assert.strictEqual(layer.emptyModCells, 0, 'DIE table Mod cells with no text');
    await page.click('#dieInfoCloseBtn');

    const drawer = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#devChrome button')].map(b => b.textContent.trim());
      return { emptyLabels: labels.filter(t => !t).length, checked: labels.length, hasLoadAll: labels.indexOf('Load All') !== -1 };
    });
    assert.strictEqual(drawer.emptyLabels, 0, 'dev drawer buttons with no label, of ' + drawer.checked);
    assert.ok(drawer.hasLoadAll, 'Load All button label');

    await page.evaluate(() => document.getElementById('devSkipToDieActionBtn').click());
    const panel = await page.evaluate(() => {
      const els = [...document.querySelectorAll('#dieActionPanel .die-action-title, #dieActionPanel button')];
      return { emptyTexts: els.filter(e => !e.textContent.trim()).length, checked: els.length };
    });
    assert.ok(panel.checked >= 3, 'die action panel title and buttons checked: ' + panel.checked);
    assert.strictEqual(panel.emptyTexts, 0, 'die action panel title and buttons with no text, of ' + panel.checked);
    await page.close();
  });

  await browser.close();
  process.exit(report('build177') > 0 ? 1 : 0);
})();
