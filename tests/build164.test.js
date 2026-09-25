// ============================================================
// TESTS/BUILD164.TEST.JS
// Standing regression suite for BUILD 164 (D-108): face 20's weight is
// capped at GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT on every weight path.
// Run: node tests/build164.test.js
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

async function freshPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  return page;
}

async function setFace20Weight(page, weight) {
  await page.evaluate((w) => {
    const faces = gameState.die.faces.slice();
    faces[19] = Object.assign({}, faces[19], { weight: w });
    updateDie({ faces: faces });
  }, weight);
}

async function openChoose(page) {
  await page.evaluate(() => { devJumpToSlot('opening', null); });
  await page.evaluate(() => { openDieActionScreen(); });
  await page.waitForFunction(() => dieActionStep === 'choose');
}

(async () => {
  const browser = await chromium.launch();

  await runTest('GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT is 5', async () => {
    const page = await freshPage(browser);
    assert.strictEqual(await page.evaluate(() => GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT), 5);
    await page.close();
  });

  await runTest('strengthenFace(20) at weight 5 returns 5 and leaves the weight at 5; at 4 it reaches 5', async () => {
    const page = await freshPage(browser);
    await setFace20Weight(page, 4);
    const up = await page.evaluate(() => strengthenFace(20));
    assert.strictEqual(up, 5);
    const r = await page.evaluate(() => [strengthenFace(20), gameState.die.faces[19].weight]);
    assert.deepStrictEqual(r, [5, 5]);
    await page.close();
  });

  await runTest('Strengthen picker: face 20 at 5 is inert while another loaded face is pickable', async () => {
    const page = await freshPage(browser);
    await setFace20Weight(page, 5);
    await openChoose(page);
    await page.evaluate(() => { dieActionChooseStrengthen(); });
    const r = await page.evaluate(() => {
      const cfg = currentPlayerDiePickConfig();
      return [cfg.isEligible(gameState.die.faces[19]), cfg.isEligible(gameState.die.faces[9])];
    });
    assert.deepStrictEqual(r, [false, true]);
    await page.close();
  });

  await runTest('die action layer shows no Strengthen button when face 20 at 5 is the only eligible face', async () => {
    const page = await freshPage(browser);
    await setFace20Weight(page, 5);
    await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[9] = Object.assign({}, faces[9], { modId: null, modData: undefined });
      updateDie({ faces: faces });
    });
    await openChoose(page);
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll('#dieActionPanel button')).map((b) => b.textContent));
    assert.ok(!labels.includes('Strengthen'), 'Strengthen offered: ' + labels.join('|'));
    assert.ok(labels.includes('Skip'), 'Skip missing');
    await page.close();
  });

  await runTest('Leaden Face with face 20 at weight 4: one Strengthen leaves 5 and logs the cap line', async () => {
    const page = await freshPage(browser);
    await setFace20Weight(page, 4);
    await page.evaluate(() => { updateRun({ artifacts: ['leaden_face'] }); });
    await openChoose(page);
    await page.evaluate(() => { dieActionChooseStrengthen(); dieActionPickStrengthenFace(20); });
    const r = await page.evaluate(() => [gameState.die.faces[19].weight, document.getElementById('log').textContent.includes('[ARTIFACT] Leaden Face: face 20 at the cap')]);
    assert.deepStrictEqual(r, [5, true]);
    await page.close();
  });

  await runTest('Font roll on face 20 at weight 5 adds BLANK_GOLD gold and leaves the weight 5', async () => {
    const page = await freshPage(browser);
    await setFace20Weight(page, 5);
    await page.evaluate(() => { devJumpToSlot('lower', 3); });
    await page.waitForFunction(() => eventStep === 'open');
    // face 20 is NAT_TWENTY, so the cap branch is reached by a rolled loaded-face path only when
    // the rolled face is 20 and loaded; force that shape by giving the rolled face a mod stub.
    const r = await page.evaluate(() => {
      const before = gameState.run.gold;
      const faces = gameState.die.faces.slice();
      faces[19] = Object.assign({}, faces[19], { modId: 'x_loaded' });
      updateDie({ faces: faces });
      const realRoll = rollWithArtifacts;
      rollWithArtifacts = function() { return gameState.die.faces[19]; };
      eventRoll();
      rollWithArtifacts = realRoll;
      return [gameState.run.gold - before, gameState.die.faces[19].weight, document.getElementById('log').textContent.includes('face 20 at the cap')];
    });
    assert.deepStrictEqual(r, [20, 5, true]);
    await page.close();
  });

  await runTest('face 20 caption contains MAX at weight 5 and not at weight 4', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const caption = () => page.evaluate(() => {
      const rows = document.querySelectorAll('#playerDieList .die-face-caption');
      return Array.from(rows).map((c) => c.textContent).filter((t) => t.indexOf('NAT') === 0 && t.indexOf('20') !== -1).join('|');
    });
    await setFace20Weight(page, 4);
    assert.ok(!(await caption()).includes('MAX'), 'MAX at weight 4');
    await setFace20Weight(page, 5);
    assert.ok((await caption()).includes('MAX'), 'no MAX at weight 5');
    await page.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) process.exit(1);
  console.log('\n' + results.length + '/' + results.length + ' build164 tests passed.');
})();
