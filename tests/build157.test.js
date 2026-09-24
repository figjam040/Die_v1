// ============================================================
// TESTS/BUILD157.TEST.JS
// Standing regression suite for KI-34 (face-row NAT caption clipping),
// KI-35 (artifact slot text fallback clipping) and KI-36 (run record
// build column, shop-opened log/transcript line).
// Same shape as tests/build156.test.js: plain Node script, playwright
// launched directly, node:assert. Run: node tests/build157.test.js
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
  const page = await browser.newPage({ viewport: viewport });
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

const VIEWPORTS = [
  { width: 1600, height: 900 },
  { width: 2520, height: 1400 }
];

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — KI-34
  // ---------------------------------------------------------------

  for (const vp of VIEWPORTS) {
    await runTest('KI-34: face 1 and face 20 captions never overflow their column at ' + vp.width + 'x' + vp.height, async () => {
      const page = await freshPage(browser, vp);
      await enterOpeningFight(page);
      const v = await page.evaluate(() => {
        const one = document.querySelector('#playerDieList .nat-one .die-face-caption');
        const twenty = document.querySelector('#playerDieList .nat-twenty .die-face-caption');
        return {
          oneText: one.textContent,
          oneOverflow: one.scrollWidth - one.clientWidth,
          twentyText: twenty.textContent,
          twentyOverflow: twenty.scrollWidth - twenty.clientWidth
        };
      });
      assert.ok(v.oneOverflow <= 0, 'face 1 caption overflows by ' + v.oneOverflow + 'px, text: ' + JSON.stringify(v.oneText));
      assert.ok(v.twentyOverflow <= 0, 'face 20 caption overflows by ' + v.twentyOverflow + 'px, text: ' + JSON.stringify(v.twentyText));
      assert.ok(v.oneText.indexOf('NAT') !== -1 && v.oneText.indexOf('1') !== -1, 'face 1 caption must still read NAT 1, got: ' + JSON.stringify(v.oneText));
      assert.ok(v.twentyText.indexOf('NAT') !== -1 && v.twentyText.indexOf('20') !== -1, 'face 20 caption must still read NAT 20, got: ' + JSON.stringify(v.twentyText));
      assert.ok(v.twentyText.indexOf('%') !== -1, 'face 20 caption must still show its percent, got: ' + JSON.stringify(v.twentyText));
      await page.close();
    });
  }

  // ---------------------------------------------------------------
  // ITEM B — KI-35
  // ---------------------------------------------------------------

  for (const vp of VIEWPORTS) {
    await runTest('KI-35: a held artifact\'s slot text never overflows the slot at ' + vp.width + 'x' + vp.height, async () => {
      const page = await freshPage(browser, vp);
      await page.evaluate(() => { updateRun({ artifacts: ['merchants_seal'] }); refreshInspector(); });
      const v = await page.evaluate(() => {
        const slot = document.querySelectorAll('.artifact-slot')[0];
        // BUILD 161 (D-104/KI-41): the visible name lives in its own
        // .artifact-slot-name child now, the hover tip a sibling span —
        // slot.textContent would concatenate both.
        const nameEl = slot.querySelector('.artifact-slot-name');
        const tip = slot.querySelector('.hover-tip');
        return {
          text: nameEl ? nameEl.textContent : slot.textContent,
          title: tip ? tip.textContent : '',
          // The hover tip is deliberately wider than the 26px slot (it
          // only shows on hover) — check the clamped name span's own
          // overflow, not the slot's, which now also contains that tip.
          overflowX: nameEl ? nameEl.scrollWidth - nameEl.clientWidth : slot.scrollWidth - slot.clientWidth
        };
      });
      assert.strictEqual(v.text, "Merchant's Seal", 'the slot must still hold the full name in the DOM, got: ' + JSON.stringify(v.text));
      assert.ok(v.overflowX <= 0, 'the artifact slot overflows horizontally by ' + v.overflowX + 'px');
      assert.ok(v.title.indexOf("Merchant's Seal") !== -1, 'hover tip must still carry the full name, got: ' + v.title);
      await page.close();
    });
  }

  // ---------------------------------------------------------------
  // ITEM C — KI-36
  // ---------------------------------------------------------------

  await runTest('KI-36(i): RUN_RECORD_CSV_HEADER ends with build, and a flushed line ends with the current build number', async () => {
    const page = await freshPage(browser, VIEWPORTS[0]);
    const v = await page.evaluate(() => {
      startNewRun();
      updateRunRecord({ started: true, node: 'opening' });
      flushRunRecord('abandoned');
      const lines = JSON.parse(localStorage.getItem('dieRunRecordLines') || '[]');
      return { header: RUN_RECORD_CSV_HEADER, lastLine: lines[lines.length - 1], build: GAME_CONFIG.BUILD };
    });
    assert.ok(v.header.split(',').pop() === 'build', 'header must end with build, got: ' + v.header);
    assert.ok(v.lastLine.split(',').pop() === String(v.build), 'flushed line must end with the build number, got: ' + v.lastLine);
    await page.close();
  });

  await runTest('KI-36(ii): opening the shop logs [SHOP] opened: naming three cards, an artifact, Strengthen and Removal, and a matching transcript line', async () => {
    const page = await freshPage(browser, VIEWPORTS[0]);
    const v = await page.evaluate(() => {
      openShopScreen();
      const logLines = Array.from(document.getElementById('log').children).map(function(e) { return e.textContent; });
      const shopLogLine = logLines.filter(function(l) { return l.indexOf('[SHOP] opened:') === 0; }).pop();
      const transcriptLine = gameState.run.transcript.filter(function(l) { return l.indexOf('SHOP stock') === 0; }).pop();
      return {
        shopLogLine: shopLogLine,
        transcriptLine: transcriptLine,
        cardNames: gameState.run.shop.cards.map(function(id) { return gameState.config.cardPool[id].name; }),
        artifactName: gameState.run.shop.artifact ? gameState.config.artifacts[gameState.run.shop.artifact].name : null
      };
    });
    assert.ok(v.shopLogLine, 'opening the shop must log a line starting [SHOP] opened:');
    assert.strictEqual(v.cardNames.length, 3, 'the shop stock must offer three cards');
    v.cardNames.forEach(function(name) {
      assert.ok(v.shopLogLine.indexOf(name) !== -1, '[SHOP] opened: line must name card ' + name + ', got: ' + v.shopLogLine);
    });
    if (v.artifactName) {
      assert.ok(v.shopLogLine.indexOf(v.artifactName) !== -1, '[SHOP] opened: line must name the artifact ' + v.artifactName + ', got: ' + v.shopLogLine);
    }
    assert.ok(v.shopLogLine.indexOf('Strengthen') !== -1, '[SHOP] opened: line must name Strengthen, got: ' + v.shopLogLine);
    assert.ok(v.shopLogLine.indexOf('Removal') !== -1, '[SHOP] opened: line must name Removal, got: ' + v.shopLogLine);
    assert.ok(v.transcriptLine, 'opening the shop must append a transcript line starting SHOP stock');
    assert.strictEqual(v.transcriptLine.replace('SHOP stock ', ''), v.shopLogLine.replace('[SHOP] opened: ', ''), 'the transcript line must match the log line\'s own summary');
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build157 tests passed.');
})();
