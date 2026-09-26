// Standing regression suite for BUILD 179: the D-125 wording pass over every
// mod, card and artifact text, the symbol hover boxes staying inside the
// viewport, and the Strengthen picker's Now / Becomes pair.
// Run: node tests/build179.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL } = require('./shared-constants');

const { runTest, report } = createRunner();

const EXPECTED_MOD_COUNT = 27;
const EXPECTED_CARD_COUNT = 51;
const EXPECTED_ARTIFACT_COUNT = 13;

async function freshFight(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => {
    devChromeOpen = true;
    enterSlot('opening', null);
  });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Every piece's on-screen text, read the way the game reads it.
function allTexts(page) {
  return page.evaluate(() => {
    const out = [];
    Object.keys(gameState.config.mods).forEach(id => out.push({ kind: 'mod', id, text: MOD_DESCRIPTION[id] }));
    Object.keys(gameState.config.cards).forEach(id => out.push({ kind: 'card', id, text: getCardEffectText(id) }));
    Object.keys(gameState.config.artifacts).forEach(id => out.push({ kind: 'artifact', id, text: gameState.config.artifacts[id].text }));
    return out;
  });
}

const rowOf = (n) => '#playerDieList .die-row:has(.face-num:text-is("' + n + '"))';

// Loads Smite then Blight on one face through the real dev loader.
function loadTwoMods(page, faceNumber) {
  return page.evaluate((n) => {
    document.getElementById('devModSelect').value = 'smite';
    document.getElementById('devFaceInput').value = String(n);
    devLoadMod();
    document.getElementById('devModSelect').value = 'blight';
    devLoadMod();
  }, faceNumber);
}

(async () => {
  const browser = await chromium.launch();

  await runTest('the text tables hold ' + EXPECTED_MOD_COUNT + ' mods, ' + EXPECTED_CARD_COUNT + ' cards and ' + EXPECTED_ARTIFACT_COUNT + ' artifacts, none with empty text', async () => {
    const page = await freshFight(browser);
    const texts = await allTexts(page);
    const count = kind => texts.filter(t => t.kind === kind).length;
    assert.strictEqual(count('mod'), EXPECTED_MOD_COUNT);
    assert.strictEqual(count('card'), EXPECTED_CARD_COUNT);
    assert.strictEqual(count('artifact'), EXPECTED_ARTIFACT_COUNT);
    const empty = texts.filter(t => typeof t.text !== 'string' || t.text.trim() === '').map(t => t.kind + ':' + t.id);
    assert.deepStrictEqual(empty, []);
    await page.close();
  });

  await runTest('no text contains applied, gained, dealt, a parenthesis, or this run (Vigil alone may say this run)', async () => {
    const page = await freshFight(browser);
    const texts = await allTexts(page);
    const offenders = [];
    texts.forEach(t => {
      if (/\b(applied|gained|dealt)\b/i.test(t.text)) offenders.push(t.kind + ':' + t.id + ' has a banned verb form');
      if (/[()]/.test(t.text)) offenders.push(t.kind + ':' + t.id + ' has a parenthesis');
      if (/this run/i.test(t.text) && !(t.kind === 'mod' && t.id === 'vigil')) offenders.push(t.kind + ':' + t.id + ' says this run');
    });
    assert.deepStrictEqual(offenders, []);
    await page.close();
  });

  await runTest('every text is at most two sentences', async () => {
    const page = await freshFight(browser);
    const texts = await allTexts(page);
    const tooLong = texts.filter(t => t.text.split(/(?<=[.!?])\s+/).filter(s => s.trim() !== '').length > 2).map(t => t.kind + ':' + t.id);
    assert.deepStrictEqual(tooLong, []);
    await page.close();
  });

  await runTest('the three reworded texts read as written', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => ({
      consecrate: MOD_DESCRIPTION.consecrate,
      reliquary: getCardEffectText('reliquary'),
      leaden: gameState.config.artifacts.leaden_face.text
    }));
    assert.strictEqual(v.consecrate, 'Gain 2 soul. This turn, when you play a card, gain 3 block.');
    assert.strictEqual(v.reliquary, 'If you have 10 or more block, deal 5 damage. Gain 6 block.');
    assert.strictEqual(v.leaden, 'When you Strengthen a face, add 2 weight instead of 1.');
    await page.close();
  });

  const VIEWPORTS = [{ width: 1600, height: 900 }, { width: 1280, height: 720 }];
  for (const viewport of VIEWPORTS) {
    for (const faceNumber of [2, 19]) {
      await runTest('both symbol hover boxes of a two-mod face ' + faceNumber + ' lie inside the ' + viewport.width + 'x' + viewport.height + ' viewport', async () => {
        const page = await freshFight(browser, viewport);
        await loadTwoMods(page, faceNumber);
        const symbols = page.locator(rowOf(faceNumber) + ' .face-symbol');
        assert.strictEqual(await symbols.count(), 2);
        for (let i = 0; i < 2; i++) {
          await symbols.nth(i).hover();
          await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
          const v = await page.evaluate(([n, index]) => {
            const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
            const tip = row.querySelectorAll('.face-symbol')[index].querySelector('.hover-tip');
            const r = tip.getBoundingClientRect();
            return {
              showing: getComputedStyle(tip).visibility === 'visible',
              inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
            };
          }, [faceNumber, i]);
          assert.ok(v.showing, 'symbol ' + i + ' box shows on hover');
          assert.ok(v.inside, 'symbol ' + i + ' box lies inside the viewport');
        }
        await page.close();
      });
    }
  }

  async function openStrengthenPicker(page) {
    await page.evaluate(() => {
      openDieActionScreen('dev');
      dieActionChooseStrengthen();
    });
  }

  function readPair(page, faceNumber) {
    return page.evaluate((n) => {
      const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
      const now = row.querySelector('.face-tip-now');
      const becomes = row.querySelector('.face-tip-becomes');
      const brightness = el => getComputedStyle(el).color.match(/\d+/g).slice(0, 3).reduce((a, b) => a + Number(b), 0);
      return {
        now: now ? now.textContent : null,
        becomes: becomes ? becomes.textContent : null,
        nowBrightness: now ? brightness(now) : null,
        becomesBrightness: becomes ? brightness(becomes) : null
      };
    }, faceNumber);
  }

  await runTest('the Strengthen picker on a loaded face shows Now and Becomes with odds, Becomes brighter and different', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'smite';
      document.getElementById('devFaceInput').value = '2';
      devLoadMod();
    });
    await openStrengthenPicker(page);
    await page.hover(rowOf(2) + ' .face-btn');
    const v = await readPair(page, 2);
    assert.strictEqual(v.now, 'Now: weight 1 · 5.0%');
    assert.strictEqual(v.becomes, 'Becomes: weight 2 · 9.5%');
    assert.notStrictEqual(v.now, v.becomes);
    assert.ok(v.becomesBrightness > v.nowBrightness, 'Becomes is one step brighter than Now');
    await page.close();
  });

  await runTest('the Strengthen picker on face 20 shows the same Now and Becomes pair', async () => {
    const page = await freshFight(browser);
    await openStrengthenPicker(page);
    await page.hover(rowOf(20) + ' .face-btn');
    const v = await readPair(page, 20);
    assert.strictEqual(v.now, 'Now: weight 1 · 5.0%');
    assert.strictEqual(v.becomes, 'Becomes: weight 2 · 9.5%');
    assert.ok(v.becomesBrightness > v.nowBrightness);
    await page.close();
  });

  await runTest('outside the Strengthen picker a face hover carries no Now or Becomes line', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => document.querySelectorAll('#playerDieList .face-tip-now, #playerDieList .face-tip-becomes').length);
    assert.strictEqual(v, 0);
    await page.close();
  });

  await browser.close();
  process.exit(report('build179') > 0 ? 1 : 0);
})();
