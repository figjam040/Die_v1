// ============================================================
// TESTS/BUILD165.TEST.JS
// Standing regression suite for BUILD 165 (D-109): artifact and mod art in
// the top-bar artifact slots, the ARTIFACTS layer and the DIE layer.
// Run: node tests/build165.test.js
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

// Waits until every img matching the selector has finished loading or failing.
async function imagesSettled(page, selector) {
  await page.waitForFunction((sel) => {
    const imgs = document.querySelectorAll(sel);
    return imgs.length > 0 && Array.from(imgs).every((i) => i.complete);
  }, selector);
}

(async () => {
  const browser = await chromium.launch();

  await runTest("top-bar slot holds Merchant's Seal art, loaded, with the name in the hover text", async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['merchants_seal'] }); });
    await imagesSettled(page, '#artifactRow .artifact-slot img');
    const r = await page.evaluate(() => {
      const slot = document.querySelector('#artifactRow .artifact-slot');
      const img = slot.querySelector('img');
      return {
        srcEnds: img.src.endsWith('art/artifacts/merchants_seal.png'),
        loaded: img.naturalWidth > 0,
        tip: slot.querySelector('.hover-tip').textContent,
        slotText: slot.textContent.includes("Merchant's Seal")
      };
    });
    assert.strictEqual(r.srcEnds, true, 'img src');
    assert.strictEqual(r.loaded, true, 'img naturalWidth above 0');
    assert.ok(r.tip.includes("Merchant's Seal"), 'hover text names the artifact');
    assert.strictEqual(r.slotText, true, 'name text still in the slot');
    await page.close();
  });

  await runTest('ARTIFACTS layer row has a loaded 48px icon and still carries the name and text', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['merchants_seal'] }); updateUi({ artifactsInfoOpen: true }); });
    await imagesSettled(page, '#artifactsInfoContent img');
    const r = await page.evaluate(() => {
      const row = document.querySelector('#artifactsInfoContent .info-list-row');
      const img = row.querySelector('img');
      return {
        srcEnds: img.src.endsWith('art/artifacts/merchants_seal.png'),
        loaded: img.naturalWidth > 0,
        width: img.style.width,
        text: row.textContent
      };
    });
    assert.strictEqual(r.srcEnds, true);
    assert.strictEqual(r.loaded, true);
    assert.strictEqual(r.width, '48px');
    assert.ok(r.text.includes("Merchant's Seal") && r.text.includes('Pay a quarter less for everything in the shop'), r.text);
    await page.close();
  });

  await runTest('DIE layer: Smite on face 3 shows a loaded 32px icon plus its text and weight; faces 1, 20 and a blank have no img', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'smite';
      document.getElementById('devFaceInput').value = '3';
      devLoadMod();
      updateUi({ dieInfoOpen: true });
    });
    await imagesSettled(page, '#dieInfoContent img');
    const r = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#dieInfoContent .info-table-row'));
      const find = (n) => rows.find((x) => x.cells[0].textContent === String(n));
      const row3 = find(3);
      const img = row3.querySelector('img');
      return {
        srcEnds: img.src.endsWith('art/mods/smite.png'),
        loaded: img.naturalWidth > 0,
        width: img.style.width,
        imgCountFace3: row3.querySelectorAll('img').length,
        text: row3.cells[2].textContent,
        weight: row3.cells[1].textContent,
        face1Imgs: find(1).querySelectorAll('img').length,
        face20Imgs: find(20).querySelectorAll('img').length,
        blankImgs: find(4).querySelectorAll('img').length
      };
    });
    assert.strictEqual(r.srcEnds, true);
    assert.strictEqual(r.loaded, true);
    assert.strictEqual(r.width, '32px');
    assert.strictEqual(r.imgCountFace3, 1);
    assert.ok(r.text.includes('Smite') && r.weight === '1', r.text + ' / ' + r.weight);
    assert.strictEqual(r.face1Imgs, 0, 'face 1 has no img');
    assert.strictEqual(r.face20Imgs, 0, 'face 20 has no img');
    assert.strictEqual(r.blankImgs, 0, 'blank face has no img');
    await page.close();
  });

  await runTest('DIE layer: a two-mod face shows two symbols in load order', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      document.getElementById('devFaceInput').value = '3';
      document.getElementById('devModSelect').value = 'smite';
      devLoadMod();
      document.getElementById('devModSelect').value = 'unison';
      devLoadMod();
      updateUi({ dieInfoOpen: true });
    });
    await imagesSettled(page, '#dieInfoContent img');
    const srcs = await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('#dieInfoContent .info-table-row')).find((x) => x.cells[0].textContent === '3');
      return Array.from(row.querySelectorAll('img')).map((i) => i.src.split('/').pop());
    });
    assert.deepStrictEqual(srcs, ['smite.png', 'unison.png']);
    await page.close();
  });

  await runTest('an artifact id with no art file keeps the text fallback and shows no broken image', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => {
      gameState.config.artifacts.fake_charm = { id: 'fake_charm', name: 'Fake Charm', text: 'Does nothing.' };
      updateRun({ artifacts: ['fake_charm'] });
      updateUi({ artifactsInfoOpen: true });
    });
    await imagesSettled(page, '#artifactRow .artifact-slot img');
    await imagesSettled(page, '#artifactsInfoContent img');
    const r = await page.evaluate(() => {
      const slot = document.querySelector('#artifactRow .artifact-slot');
      const slotImg = slot.querySelector('img');
      const nameSpan = slot.querySelector('.artifact-slot-name');
      const row = document.querySelector('#artifactsInfoContent .info-list-row');
      const rowImg = row.querySelector('img');
      return {
        slotImgHidden: slotImg.style.display === 'none',
        nameVisible: nameSpan.style.visibility !== 'hidden' && nameSpan.textContent === 'Fake Charm',
        rowImgHidden: rowImg.style.display === 'none',
        rowText: row.textContent
      };
    });
    assert.strictEqual(r.slotImgHidden, true, 'slot img hidden');
    assert.strictEqual(r.nameVisible, true, 'slot name text visible');
    assert.strictEqual(r.rowImgHidden, true, 'layer row img hidden');
    assert.ok(r.rowText.includes('Fake Charm — Does nothing.'), r.rowText);
    await page.close();
  });

  await browser.close();
  const failed = results.filter((r) => !r.pass);
  if (failed.length > 0) process.exit(1);
  console.log('\n' + results.length + '/' + results.length + ' build165 tests passed.');
})();
