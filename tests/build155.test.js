// ============================================================
// TESTS/BUILD155.TEST.JS
// Standing regression suite for KI-31 (node re-entry), roll odds under
// each face, the reward layer over the fight's own face row, and the
// CLAUDE.md headroom trim. Same shape as tests/build154.test.js: plain
// Node script, playwright launched directly, node:assert.
// Run: node tests/build155.test.js
// ============================================================

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { CLAUDE_MD_MAX_BYTES } = require('./shared-constants');

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

async function freshFightPage(browser, artifacts) {
  const page = await freshPage(browser);
  await page.evaluate((held) => {
    devChromeOpen = true;
    updateRun({ artifacts: held || [] });
  }, artifacts);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

function faceRow(page, faceNumber) {
  return page.evaluate((n) => {
    const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
    const row = rows.find(function(r) { return parseInt(r.querySelector('.face-num').textContent, 10) === n; });
    const caption = row.querySelector('.die-face-caption');
    return {
      captionText: caption.textContent,
      emphasis: caption.classList.contains('die-face-caption-emphasis'),
      // BUILD 161 (D-104/KI-41): the hover tip lives on the row now.
      title: (row.querySelector('.hover-tip') || {}).textContent || ''
    };
  }, faceNumber);
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — KI-31 node re-entry
  // ---------------------------------------------------------------

  await runTest('KI-31: an entered Rite node has no click handler, and a second enterSlot() on it is refused and logged', async () => {
    const page = await freshPage(browser);
    // Dev chrome stays closed (the default) — this checks the real click
    // path, not the separate dev-jump override.
    const v = await page.evaluate(() => {
      devJumpToSlot('upper', 1); // upper lane's rite slot (RITE_SLOT_INDICES includes 1)
      const riteBtn = Array.from(document.querySelectorAll('#mapScreen .map-node'))
        .find(function(b) { return b.textContent.indexOf('Rite') === 0 && b.classList.contains('map-node-completed'); });
      return {
        entered: gameState.run.act.upper[1].entered,
        riteFound: !!riteBtn,
        riteDisabled: riteBtn ? riteBtn.disabled : null
      };
    });
    assert.strictEqual(v.entered, true, 'entering a slot must mark it entered');
    assert.strictEqual(v.riteFound, true, 'the entered Rite node must render as completed, not current');
    assert.strictEqual(v.riteDisabled, true, 'an entered node must carry no click handler (disabled)');

    // Mirrors the exact scenario KI-31 was written for: Rite -> die action ->
    // Strengthen -> shop, then a second click on the same still-visible node.
    const v2 = await page.evaluate(() => {
      riteChooseDieAction();
      dieActionChooseStrengthen();
      dieActionPickStrengthenFace(5);
      const shopStepBefore = shopStep;
      const logCountBefore = document.getElementById('log').children.length;
      enterSlot('upper', 1);
      const logLines = Array.from(document.getElementById('log').children).map(function(c) { return c.textContent; });
      return {
        shopStepBefore: shopStepBefore,
        shopStepAfter: shopStep,
        logGrew: document.getElementById('log').children.length > logCountBefore,
        lastLog: logLines[logLines.length - 1]
      };
    });
    assert.strictEqual(v2.shopStepBefore, 'open', 'strengthening from a Rite must land on the shop');
    assert.strictEqual(v2.shopStepAfter, 'open', 'a second enterSlot() on the same Rite must not reopen it — shop must stay open');
    assert.ok(v2.logGrew, 'the refusal must log a line');
    assert.ok(v2.lastLog.indexOf('entry refused') !== -1, 'the refusal log line must say so: "' + v2.lastLog + '"');
    await page.close();
  });

  await runTest('KI-31: with the shop panel open, no map node accepts a click', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      devChromeOpen = true;
      devJumpToSlot('upper', 1);
      riteChooseDieAction();
      dieActionChooseStrengthen();
      dieActionPickStrengthenFace(5);
      const buttons = Array.from(document.querySelectorAll('#mapScreen button.map-node'));
      return {
        shopStep: shopStep,
        buttonCount: buttons.length,
        allDisabled: buttons.every(function(b) { return b.disabled; })
      };
    });
    assert.strictEqual(v.shopStep, 'open', 'the shop must be open for this check to mean anything');
    assert.ok(v.buttonCount > 0, 'the map must render at least one node button');
    assert.ok(v.allDisabled, 'every map node must be disabled while the shop is open');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — roll odds under each face
  // ---------------------------------------------------------------

  await runTest('Item B: a fresh die shows 5.0% under every face', async () => {
    // D-99 (BUILD 158): rollOdds() reads to one decimal, rounded, not floored.
    const page = await freshPage(browser);
    const captions = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#playerDieList .die-face-caption')).map(function(c) { return c.textContent; })
    );
    assert.strictEqual(captions.length, 20, 'expected twenty face captions, got ' + captions.length);
    captions.forEach(function(text) {
      assert.ok(/(^|\s)5\.0%$/.test(text), 'every fresh face must read 5.0%, got "' + text + '"');
    });
    await page.close();
  });

  await runTest('Item B: strengthening face 5 to weight 2 shows 9.5% under it (2 of 21), dropped and larger; 5.0% elsewhere becomes 4.8%', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { strengthenFace(5); });
    const face5 = await faceRow(page, 5);
    const face6 = await faceRow(page, 6);
    assert.strictEqual(face5.captionText, '9.5%', 'face 5 at weight 2 of 21 total must read 9.5%, got "' + face5.captionText + '"');
    assert.ok(face5.emphasis, 'a weight-above-1 face must carry the ODDS_EMPHASIS class');
    assert.ok(face5.title.indexOf('weight 2') !== -1, 'face 5\'s own weight must still read in its title: "' + face5.title + '"');
    assert.strictEqual(face6.captionText, '4.8%', 'an untouched face must drop to 4.8% once the bag grows to 21, got "' + face6.captionText + '"');
    assert.strictEqual(face6.emphasis, false, 'a weight-1 face must not carry the emphasis class');
    await page.close();
  });

  await runTest('Item B: the ODDS_EMPHASIS drop and colour are read from GAME_CONFIG', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      strengthenFace(5);
      const row = Array.from(document.querySelectorAll('#playerDieList .die-row'))
        .find(function(r) { return parseInt(r.querySelector('.face-num').textContent, 10) === 5; });
      const caption = row.querySelector('.die-face-caption');
      return {
        transform: caption.style.transform,
        color: caption.style.color,
        dropPx: GAME_CONFIG.ODDS_EMPHASIS.DROP_PX,
        colour: GAME_CONFIG.ODDS_EMPHASIS.COLOUR
      };
    });
    assert.ok(v.transform.indexOf(v.dropPx + 'px') !== -1, 'the drop must come from GAME_CONFIG.ODDS_EMPHASIS.DROP_PX: "' + v.transform + '"');
    assert.ok(v.color.length > 0, 'the emphasis colour must be set');
    await page.close();
  });

  await runTest('Item B: holding Gilded Die leaves every percent alone, face 7 stays at 5.0%', async () => {
    const page = await freshFightPage(browser, ['gilded_die']);
    await page.evaluate(() => { updateRun({ gold: 50 }); });
    const row = await faceRow(page, 7);
    assert.strictEqual(row.captionText, '5.0%', 'face 7 must read 5.0% with Gilded Die held, got "' + row.captionText + '"');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — the reward layer fits above the fold
  // ---------------------------------------------------------------

  await runTest('Item C: with a die action open (Load, three cards), the layer sits above the face row, only one face row exists, and nothing scrolls at 1600x900', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad();
      const panelRect = document.getElementById('dieActionPanel').getBoundingClientRect();
      const rowRect = document.getElementById('playerDieList').getBoundingClientRect();
      return {
        cardsShown: document.querySelectorAll('#dieActionPanel .offer-symbol').length,
        panelBottom: panelRect.bottom,
        rowTop: rowRect.top,
        bandBDisplay: getComputedStyle(document.querySelector('.band-b')).display,
        bandCDisplay: getComputedStyle(document.querySelector('.band-c')).display,
        rollHeroDisplay: getComputedStyle(document.querySelector('.roll-hero')).display,
        faceRowCount: document.querySelectorAll('.die-col-h').length,
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight
      };
    });
    assert.strictEqual(v.cardsShown, 3, 'the Load step must show three die frames, got ' + v.cardsShown);
    assert.ok(v.panelBottom <= v.rowTop + 1, 'the reward layer (bottom ' + v.panelBottom + ') must sit above the face row (top ' + v.rowTop + ')');
    assert.strictEqual(v.bandBDisplay, 'none', 'the art band must be hidden while the reward layer is open');
    assert.strictEqual(v.bandCDisplay, 'none', 'the stats/hand band must be hidden while the reward layer is open');
    assert.strictEqual(v.rollHeroDisplay, 'none', 'the roll stage must be hidden while the reward layer is open');
    assert.strictEqual(v.faceRowCount, 1, 'only one element with the face row\'s class may exist, found ' + v.faceRowCount);
    assert.ok(v.scrollHeight <= v.innerHeight, 'nothing may scroll at 1600x900: scrollHeight ' + v.scrollHeight + ' vs innerHeight ' + v.innerHeight);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — CLAUDE.md headroom
  // ---------------------------------------------------------------

  await runTest('Item D: CLAUDE.md is at most 72,000 bytes', async () => {
    const bytes = Buffer.byteLength(fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8'), 'utf8');
    assert.ok(bytes <= CLAUDE_MD_MAX_BYTES, 'CLAUDE.md is ' + bytes + ' bytes, over the ' + CLAUDE_MD_MAX_BYTES + ' byte ceiling');
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build155 tests passed.');
})();
