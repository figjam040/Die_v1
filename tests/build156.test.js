// ============================================================
// TESTS/BUILD156.TEST.JS
// Standing regression suite for KI-32 (face row under the reward layer),
// the map screen reduced to the map (D-98), and act backgrounds (D-97).
// Same shape as tests/build155.test.js: plain Node script, playwright
// launched directly, node:assert. Run: node tests/build156.test.js
// ============================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').replace(/\\/g, '/');
const VIEWPORT = { width: 1600, height: 900 };

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
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

// A minimal, valid 1x1 PNG — enough for an <img> to actually load.
const ONE_PX_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — KI-32
  // ---------------------------------------------------------------

  await runTest('KI-32: the face row keeps its full fight-screen width while a Load offer is open', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const before = await page.evaluate(() => document.getElementById('playerDieList').getBoundingClientRect().width);

    await page.evaluate(() => {
      dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
      openDieActionScreen('reward');
      dieActionChooseLoad();
    });
    await page.waitForFunction(() => document.querySelectorAll('#dieActionPanel .offer-symbol').length === 3);

    const during = await page.evaluate(() => {
      const r = document.getElementById('playerDieList').getBoundingClientRect();
      return { width: r.width, top: r.top, bottom: r.bottom };
    });
    assert.ok(Math.abs(during.width - before) < 1, 'face row width must match the fight screen\'s own width, got ' + during.width + ' vs ' + before);
    assert.ok(during.top >= VIEWPORT.height * 0.85, 'the face row must sit in the bottom 15% of the viewport, top was ' + during.top);
    assert.ok(during.bottom <= VIEWPORT.height, 'the face row must not run past the bottom of the viewport');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — the map screen (D-98)
  // ---------------------------------------------------------------

  await runTest('D-98: the map screen contains no PLAYER DIE, ELITE PREVIEW or BOSS PREVIEW element', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const text = document.getElementById('mapScreen').textContent;
      return {
        hasPlayerDie: text.indexOf('PLAYER DIE') !== -1,
        hasElitePreview: text.indexOf('ELITE PREVIEW') !== -1,
        hasBossPreview: text.indexOf('BOSS PREVIEW') !== -1,
        hasActTitle: text.indexOf('ACT ' + gameState.run.actNumber + ' MAP') !== -1
      };
    });
    assert.strictEqual(v.hasPlayerDie, false, 'the map must not show PLAYER DIE');
    assert.strictEqual(v.hasElitePreview, false, 'the map must not show ELITE PREVIEW');
    assert.strictEqual(v.hasBossPreview, false, 'the map must not show BOSS PREVIEW');
    assert.strictEqual(v.hasActTitle, false, 'the map must not repeat the ACT N MAP title — the top bar already shows it');
    await page.close();
  });

  await runTest('D-98: hovering the Boss node shows its name and pattern', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const bossNode = document.querySelector('#mapScreen .map-node-boss');
      const tip = bossNode.querySelector('.hover-tip');
      return {
        text: tip ? tip.textContent : null,
        name: gameState.run.act.boss.enemy.name,
        pattern: formatPatternWords(gameState.run.act.boss.enemy.pattern)
      };
    });
    assert.ok(v.text, 'the Boss node must carry a hover-tip');
    assert.ok(v.text.indexOf(v.name) !== -1, 'the Boss hover must name the boss, got: ' + v.text);
    assert.ok(v.text.indexOf(v.pattern) !== -1, 'the Boss hover must name its pattern, got: ' + v.text);
    await page.close();
  });

  await runTest('D-98: the DIE, ARTIFACTS and CARDS buttons open and close their layers, each reading live state', async () => {
    const page = await freshPage(browser);
    // Load a mod onto a face so the DIE layer has something distinctive to name.
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[6] = Object.assign({}, newFaces[6], { modId: 'smite' });
      updateDie({ faces: newFaces });
      updateRun({ artifacts: ['third_eye'] });
    });

    await page.click('#dieInfoBtn');
    const dieOpen = await page.evaluate(() => getComputedStyle(document.getElementById('dieInfoLayer')).display !== 'none');
    assert.strictEqual(dieOpen, true, 'DIE button must open the die info layer');
    const dieHasMod = await page.evaluate(() => document.getElementById('dieInfoContent').textContent.indexOf('Smite') !== -1);
    assert.strictEqual(dieHasMod, true, 'the DIE layer must list the mod just loaded onto face 7');
    await page.click('#dieInfoCloseBtn');
    const dieClosed = await page.evaluate(() => getComputedStyle(document.getElementById('dieInfoLayer')).display === 'none');
    assert.strictEqual(dieClosed, true, 'CLOSE must close the DIE layer');

    await page.click('#artifactsInfoBtn');
    const artifactsText = await page.evaluate(() => document.getElementById('artifactsInfoContent').textContent);
    assert.ok(artifactsText.indexOf('Third Eye') !== -1, 'the ARTIFACTS layer must list the held artifact, got: ' + artifactsText);
    await page.keyboard.press('Escape');
    const artifactsClosed = await page.evaluate(() => getComputedStyle(document.getElementById('artifactsInfoLayer')).display === 'none');
    assert.strictEqual(artifactsClosed, true, 'Escape must close the ARTIFACTS layer');

    await page.click('#cardsInfoBtn');
    const cardsText = await page.evaluate(() => document.getElementById('cardsInfoContent').textContent);
    assert.ok(cardsText.indexOf('Strike') !== -1, 'the CARDS layer must list starting cards, got: ' + cardsText);
    await page.keyboard.press('Escape');
    const cardsClosed = await page.evaluate(() => getComputedStyle(document.getElementById('cardsInfoLayer')).display === 'none');
    assert.strictEqual(cardsClosed, true, 'Escape must close the CARDS layer');
    await page.close();
  });

  await runTest('D-98: the DIE/ARTIFACTS/CARDS buttons also work on the fight screen', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.click('#dieInfoBtn');
    const dieOpen = await page.evaluate(() => getComputedStyle(document.getElementById('dieInfoLayer')).display !== 'none');
    assert.strictEqual(dieOpen, true, 'DIE button must open the layer from the fight screen too');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — act backgrounds (D-97)
  // ---------------------------------------------------------------

  await runTest('D-97: with no background file, nothing is drawn and the page reports no real error', async () => {
    const page = await freshPage(browser);
    const consoleErrors = [];
    page.on('console', function(msg) {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const isArtFailure = text.indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
      if (!isArtFailure) consoleErrors.push(text);
    });
    const pageErrors = [];
    page.on('pageerror', function(err) { pageErrors.push(err.message); });

    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
    await page.waitForTimeout(200);

    const display = await page.evaluate(() => getComputedStyle(document.getElementById('actBackgroundImg')).display);
    assert.strictEqual(display, 'none', 'the background img must stay hidden when its file is missing');
    assert.deepStrictEqual(consoleErrors, [], 'no non-art console error may appear');
    assert.deepStrictEqual(pageErrors, [], 'no page error may appear');
    await page.close();
  });

  await runTest('D-97: with a background file present, it draws at 40% opacity behind the art band', async () => {
    const bgPath = path.join(ROOT, 'art', 'background_act1.png');
    const existedBefore = fs.existsSync(bgPath);
    fs.writeFileSync(bgPath, ONE_PX_PNG);
    try {
      const page = await freshPage(browser);
      await page.waitForFunction(() => document.getElementById('actBackgroundImg').getAttribute('data-bg-src') !== null);
      await page.waitForFunction(() => getComputedStyle(document.getElementById('actBackgroundImg')).display !== 'none', { timeout: 5000 });
      const v = await page.evaluate(() => {
        const img = document.getElementById('actBackgroundImg');
        const cs = getComputedStyle(img);
        const artBox = document.getElementById('playerArtBox').getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();
        return { opacity: cs.opacity, display: cs.display, imgTop: imgRect.top, artBoxTop: artBox.top };
      });
      assert.strictEqual(v.display, 'block', 'the background must be visible once its file exists');
      assert.strictEqual(v.opacity, '0.4', 'the background must draw at 40% opacity, got ' + v.opacity);
      assert.ok(v.imgTop <= v.artBoxTop, 'the background must sit at or above the art band, i.e. behind it');
      await page.close();
    } finally {
      if (existedBefore) { fs.writeFileSync(bgPath, ONE_PX_PNG); } else { fs.unlinkSync(bgPath); }
    }
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build156 tests passed.');
})();
