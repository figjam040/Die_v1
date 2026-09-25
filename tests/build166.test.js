// ============================================================
// TESTS/BUILD166.TEST.JS
// Standing regression suite for BUILD 166: D-110 (the Load and artifact
// offers as bare symbols with a hover box, the dev mod dropdown's
// description) and D-113 (the ROLL_PHASE pause dev-only, the roll
// animation halved).
// Run: node tests/build166.test.js
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

async function openLoadOffer(page) {
  await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseLoad(); });
  await page.waitForFunction(() => document.querySelectorAll('#dieActionPanel .offer-symbol').length === 3);
}

async function openArtifactOffer(page) {
  await page.evaluate(() => { openArtifactRewardScreen(); });
  await page.waitForFunction(() => document.querySelectorAll('#artifactRewardPanel .offer-symbol').length === 3);
}

// Hovers the first symbol in the selector and reads what the box shows.
async function hoverFirst(page, selector) {
  await page.hover(selector + ' .offer-symbol');
  await page.waitForTimeout(250);
  return page.evaluate((sel) => {
    const el = document.querySelector(sel + ' .offer-symbol');
    const tip = el.querySelector('.hover-tip');
    const lines = Array.from(tip.children).map((d) => d.textContent);
    return {
      id: el.dataset.offerId,
      opacity: parseFloat(getComputedStyle(tip).opacity),
      lines: lines,
      tierColour: getComputedStyle(tip.children[1]).color
    };
  }, selector);
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Load offer: three symbol elements each holding an art/mods img, no .offer-card or .offer-die-card', async () => {
    const page = await freshPage(browser);
    await openLoadOffer(page);
    const r = await page.evaluate(() => ({
      symbols: Array.from(document.querySelectorAll('#dieActionPanel .offer-symbol')).map((el) => ({
        id: el.dataset.offerId,
        src: (el.querySelector('img') || {}).src || ''
      })),
      cardFrames: document.querySelectorAll('#dieActionPanel .offer-card').length,
      dieFrames: document.querySelectorAll('#dieActionPanel .offer-die-card').length
    }));
    assert.strictEqual(r.symbols.length, 3, 'three symbols');
    r.symbols.forEach((s) => assert.ok(s.src.endsWith('art/mods/' + s.id + '.png'), 'src ' + s.src + ' for ' + s.id));
    assert.strictEqual(r.cardFrames, 0, '.offer-card count');
    assert.strictEqual(r.dieFrames, 0, '.offer-die-card count');
    await page.close();
  });

  await runTest('Load offer: the symbol is 160px, and hovering shows a .hover-tip with the mod name, its tier word and the tier colour', async () => {
    const page = await freshPage(browser);
    await openLoadOffer(page);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#dieActionPanel .offer-symbol img')).every((i) => i.complete));
    const size = await page.evaluate(() => {
      const c = getComputedStyle(document.querySelector('#dieActionPanel .offer-symbol img'));
      return { w: parseFloat(c.width), h: parseFloat(c.height) };
    });
    assert.strictEqual(size.w, 160, 'symbol width (CSS px)');
    assert.strictEqual(size.h, 160, 'symbol height');
    const r = await hoverFirst(page, '#dieActionPanel');
    const mod = await page.evaluate((id) => ({ name: gameState.config.mods[id].name, tier: gameState.config.mods[id].tier }), r.id);
    assert.strictEqual(r.opacity, 1, 'tip visible on hover');
    assert.strictEqual(r.lines[0], mod.name, 'first line is the name');
    assert.strictEqual(r.lines[1], mod.tier.toUpperCase(), 'second line is the tier word');
    const expected = await page.evaluate((t) => {
      const probe = document.createElement('span');
      probe.style.color = GAME_CONFIG.TIER_COLOURS[t];
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    }, mod.tier);
    assert.strictEqual(r.tierColour, expected, 'tier line colour');
    assert.ok(r.lines.length >= 4 && r.lines[3].length > 0, 'tag and text follow');
    await page.close();
  });

  await runTest('Load offer: a missing art file falls back to the mod name in the same place', async () => {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      const el = renderOfferSymbol({ id: 'fake_mod', name: 'Fake Mod', tierText: 'BASIC', artPath: 'art/mods/fake_mod.png', tagText: 'NONE', text: 'Nothing.', onClick: function() {} });
      document.body.appendChild(el);
      return new Promise((res) => setTimeout(() => {
        res({ imgHidden: el.querySelector('img').style.display === 'none', label: el.querySelector('.offer-symbol-label').textContent, labelShown: el.querySelector('.offer-symbol-label').style.display !== 'none' });
        el.remove();
      }, 300));
    });
    assert.strictEqual(r.imgHidden, true, 'broken img hidden');
    assert.strictEqual(r.label, 'Fake Mod', 'label is the name');
    assert.strictEqual(r.labelShown, true, 'label visible');
    await page.close();
  });

  await runTest('Artifact offer: three symbol elements each holding an art/artifacts img, and hovering shows the name and its tier', async () => {
    const page = await freshPage(browser);
    await openArtifactOffer(page);
    const r = await page.evaluate(() => ({
      symbols: Array.from(document.querySelectorAll('#artifactRewardPanel .offer-symbol')).map((el) => ({ id: el.dataset.offerId, src: el.querySelector('img').src })),
      cardFrames: document.querySelectorAll('#artifactRewardPanel .offer-card').length
    }));
    assert.strictEqual(r.symbols.length, 3, 'three symbols');
    r.symbols.forEach((s) => assert.ok(s.src.endsWith('art/artifacts/' + s.id + '.png'), 'src ' + s.src));
    assert.strictEqual(r.cardFrames, 0, '.offer-card count');
    const h = await hoverFirst(page, '#artifactRewardPanel');
    const name = await page.evaluate((id) => gameState.config.artifacts[id].name, h.id);
    assert.strictEqual(h.opacity, 1, 'tip visible on hover');
    assert.strictEqual(h.lines[0], name, 'first line is the name');
    // D-111 (BUILD 169): artifacts carry a tier; the line reads it.
    const tier = await page.evaluate((id) => gameState.config.artifacts[id].tier, h.id);
    assert.strictEqual(h.lines[1], tier.toUpperCase(), 'second line is the rarity word');
    await page.close();
  });

  await runTest('clicking a symbol gives it the gold outline and dims the other two', async () => {
    const page = await freshPage(browser);
    await openLoadOffer(page);
    await page.click('#dieActionPanel .offer-symbol >> nth=1');
    const r = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('#dieActionPanel .offer-symbol'));
      return {
        picked: els.map((e) => e.classList.contains('offer-card-picked')),
        dimmed: els.map((e) => e.classList.contains('offer-card-dimmed')),
        outline: getComputedStyle(els[1]).outlineColor
      };
    });
    assert.deepStrictEqual(r.picked, [false, true, false], 'picked flags');
    assert.deepStrictEqual(r.dimmed, [true, false, true], 'dimmed flags');
    assert.strictEqual(r.outline, 'rgb(251, 191, 36)', 'outline colour');
    await page.close();
  });

  await runTest('with the dev drawer closed the first ROLL_PHASE resolves at once (under 300 ms)', async () => {
    const page = await freshPage(browser);
    const ms = await page.evaluate(() => new Promise((res) => {
      devChromeOpen = false;
      const t = performance.now();
      enterSlot('opening', null);
      (function poll() {
        if (gameState.turn.phase === 'CARD_PHASE') { res(performance.now() - t); } else { setTimeout(poll, 5); }
      })();
    }));
    assert.ok(ms < 300, 'roll took ' + ms + ' ms');
    await page.close();
  });

  await runTest('with the dev drawer open the 1800 ms ROLL_PHASE pause still applies', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
    await page.waitForTimeout(900);
    const early = await page.evaluate(() => gameState.turn.phase);
    assert.strictEqual(early, 'ROLL_PHASE', 'still waiting at 900 ms');
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE', null, { timeout: 4000 });
    await page.close();
  });

  await runTest('a held Third Eye keeps the ROLL_PHASE pause with the drawer closed', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = false; updateRun({ artifacts: ['third_eye'] }); enterSlot('opening', null); });
    await page.waitForTimeout(600);
    const phase = await page.evaluate(() => gameState.turn.phase);
    assert.strictEqual(phase, 'ROLL_PHASE', 'pre-roll control still has its window');
    await page.close();
  });

  await runTest('DIE_ROLL_ANIMATION FRAME_COUNT is 3 and DURATION_MS is 200', async () => {
    const page = await freshPage(browser);
    const cfg = await page.evaluate(() => GAME_CONFIG.DIE_ROLL_ANIMATION);
    assert.strictEqual(cfg.FRAME_COUNT, 3, 'FRAME_COUNT');
    assert.strictEqual(cfg.DURATION_MS, 200, 'DURATION_MS');
    await page.close();
  });

  await runTest("the dev dropdown's span reads Smite's description when Smite is selected, and follows a change", async () => {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => {
      const sel = document.getElementById('devModSelect');
      sel.value = 'smite';
      sel.dispatchEvent(new Event('change'));
      const smite = document.getElementById('devModDescription').textContent;
      sel.value = 'zeal';
      sel.dispatchEvent(new Event('change'));
      return { smite: smite, expectedSmite: MOD_DESCRIPTION.smite, zeal: document.getElementById('devModDescription').textContent, expectedZeal: MOD_DESCRIPTION.zeal };
    });
    assert.ok(r.expectedSmite.length > 0, 'Smite has a description');
    assert.strictEqual(r.smite, r.expectedSmite, 'Smite');
    assert.strictEqual(r.zeal, r.expectedZeal, 'Zeal');
    await page.close();
  });

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(passed + '/' + results.length + ' build166 tests passed.');
  if (passed !== results.length) { process.exit(1); }
})();
