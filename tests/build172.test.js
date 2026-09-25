// ============================================================
// TESTS/BUILD172.TEST.JS
// Standing regression suite for BUILD 172: the face hover carries no trigger
// count (the DIE layer alone shows it), a mod symbol under a face opens the
// hover box for its own mod, die_rolling is quieter and lower, die_blank
// louder.
// Run: node tests/build172.test.js
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

async function freshFight(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Face 2 holds Smite then Blight, through the real dev loader.
async function loadTwoModFace(page) {
  await page.evaluate(() => {
    document.getElementById('devModSelect').value = 'smite';
    document.getElementById('devFaceInput').value = '2';
    devLoadMod();
    document.getElementById('devModSelect').value = 'blight';
    devLoadMod();
  });
}

function rowTip(page, faceNumber) {
  return page.evaluate((n) => {
    const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
    return [...row.querySelector('.hover-tip').children].map(d => d.textContent);
  }, faceNumber);
}

// D-128: a loaded face's hover is one box per mod; each box's line texts.
function faceBoxes(page, faceNumber) {
  return page.evaluate((n) => {
    const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
    return [...row.querySelectorAll(':scope > .hover-tip > .face-mod-box')].map(b => [...b.children].filter(c => c.tagName === 'DIV').map(d => d.textContent));
  }, faceNumber);
}

// Hovers the nth symbol under a face with the real mouse and returns the
// lines of the one hover box showing, plus how many boxes show at all.
async function hoverSymbol(page, faceNumber, index) {
  const sel = '#playerDieList .die-row:has(.face-num:text-is("' + faceNumber + '")) .face-symbol';
  await page.locator(sel).nth(index).hover();
  return page.evaluate(() => {
    const showing = [...document.querySelectorAll('#playerDieList .hover-tip')].filter(t => getComputedStyle(t).visibility === 'visible');
    const r = showing[0] ? showing[0].getBoundingClientRect() : null;
    return {
      count: showing.length,
      lines: showing[0] ? [...showing[0].children].map(d => d.textContent) : [],
      insideWindow: r ? r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight : false
    };
  });
}

(async () => {
  const browser = await chromium.launch();

  await runTest('Item A: a loaded face hover names its mod and weight and never says triggered, even after triggers', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[4] = Object.assign({}, faces[4], { modId: 'blight', modData: { triggerCount: 3 } });
      updateDie({ faces });
    });
    const boxes = await faceBoxes(page, 5);
    const desc = await page.evaluate(() => MOD_DESCRIPTION.blight);
    assert.strictEqual(boxes.length, 1);
    assert.strictEqual(boxes[0][0], 'Blight');
    assert.strictEqual(boxes[0][3], desc);
    assert.strictEqual(boxes[0][4], 'weight 1');
    assert.ok(boxes[0].join(' ').indexOf('triggered') === -1, boxes[0].join(' '));
    await page.close();
  });

  await runTest('Item A: face 20 at weight 5 reads MAX on line 1, and a blank reads BLANK', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      const faces = gameState.die.faces.map(f => f.number === 20 ? Object.assign({}, f, { weight: GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT }) : f);
      updateDie({ faces });
    });
    assert.strictEqual((await rowTip(page, 20))[0], 'NAT 20 · weight 5 MAX');
    assert.strictEqual((await rowTip(page, 3))[0], 'BLANK · weight 1');
    assert.strictEqual((await rowTip(page, 1))[0], 'NAT 1 · weight 1');
    await page.close();
  });

  await runTest('Item A: a two-mod face opens two boxes, its mods in load order', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    const boxes = await faceBoxes(page, 2);
    assert.deepStrictEqual(boxes.map(b => b[0]), ['Smite', 'Blight']);
    await page.close();
  });

  await runTest('Item A: the Strengthen Becomes line is line 1 at one more weight', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[4] = Object.assign({}, faces[4], { modId: 'blight' });
      updateDie({ faces });
      return faceTitleText(Object.assign({}, getPlayerFace(5), { weight: 2 }), true);
    });
    assert.strictEqual(v, 'Blight · weight 2');
    await page.close();
  });

  await runTest('Item A: the DIE layer shows the trigger count in its own column for a face that has triggered', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[4] = Object.assign({}, faces[4], { modId: 'blight', modData: { triggerCount: 4 } });
      faces[1] = Object.assign({}, faces[1], { modData: { triggerCount: 2, triggerCount2: 1 } });
      updateDie({ faces });
    });
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => {
      const rowFor = n => [...document.querySelectorAll('#dieInfoContent .info-table-row')].find(r => r.cells[0].textContent === String(n));
      const five = rowFor(5);
      const two = rowFor(2);
      const three = rowFor(3);
      return {
        five: five.cells[3].textContent,
        fiveMod: five.cells[2].textContent,
        two: two.cells[3].textContent,
        three: three.cells[3].textContent,
        font: getComputedStyle(five.cells[3]).fontFamily === getComputedStyle(document.querySelector('.die-face-caption')).fontFamily
      };
    });
    assert.strictEqual(v.five, '4');
    assert.ok(v.fiveMod.indexOf('triggered') === -1, v.fiveMod);
    assert.strictEqual(v.two, '2 / 1');
    assert.strictEqual(v.three, '', 'a blank face shows no count');
    assert.ok(v.font, 'the count uses the odds font');
    await page.close();
  });

  await runTest('Item B: hovering a symbol opens a box with that mod name and text, and only that box shows', async () => {
    const page = await freshFight(browser);
    const desc = await page.evaluate(() => MOD_DESCRIPTION.consecrate);
    const h = await hoverSymbol(page, 10, 0);
    assert.strictEqual(h.count, 1, 'boxes showing: ' + h.count);
    assert.deepStrictEqual(h.lines, ['Consecrate · weight 1', desc]);
    assert.ok(h.insideWindow, 'the box must sit inside the window');
    await page.close();
  });

  await runTest('Item B: on a two-mod face the two symbols open different texts, each for its own mod only', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    const d = await page.evaluate(() => ({ smite: MOD_DESCRIPTION.smite, blight: MOD_DESCRIPTION.blight }));
    const first = await hoverSymbol(page, 2, 0);
    const second = await hoverSymbol(page, 2, 1);
    assert.deepStrictEqual(first.lines, ['Smite · weight 1', d.smite]);
    assert.deepStrictEqual(second.lines, ['Blight · weight 1', d.blight]);
    assert.strictEqual(first.count, 1);
    assert.strictEqual(second.count, 1);
    await page.close();
  });

  await runTest('Item B: every symbol box is a setHoverTip box (a .hover-tip child, no title attribute)', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    const v = await page.evaluate(() => [...document.querySelectorAll('#playerDieList .face-symbol')].map(s => ({
      tip: !!s.querySelector(':scope > .hover-tip'), parent: s.classList.contains('hover-parent'), title: s.hasAttribute('title')
    })));
    assert.strictEqual(v.length, 3);
    v.forEach(s => assert.deepStrictEqual(s, { tip: true, parent: true, title: false }));
    await page.close();
  });

  await runTest('Item C: die_rolling is 0.04 gain at one flat 644 Hz, die_blank 0.084, the rest unchanged', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const realTimeout = window.setTimeout;
      const realTone = window.playTone;
      const calls = [];
      window.setTimeout = function(fn) { fn(); return 0; };
      window.playTone = function(w, a, b, ms, gain) { calls.push({ w, a, b, ms, gain }); };
      const grab = name => { calls.length = 0; SOUND_TABLE[name](0); return calls.slice(); };
      const out = { rolling: grab('die_rolling'), blank: grab('die_blank'), landing: grab('die_landing') };
      window.setTimeout = realTimeout;
      window.playTone = realTone;
      return out;
    });
    const near = (x, y) => Math.abs(x - y) < 1e-9;
    assert.strictEqual(v.rolling.length, 4);
    [644, 644, 644, 644].forEach((hz, i) => {
      assert.ok(near(v.rolling[i].a, hz) && near(v.rolling[i].b, hz), 'tick ' + i + ' freq ' + v.rolling[i].a);
      assert.ok(near(v.rolling[i].gain, 0.04), 'tick ' + i + ' gain ' + v.rolling[i].gain);
      assert.strictEqual(v.rolling[i].ms, 30);
    });
    assert.strictEqual(v.blank.length, 1);
    assert.ok(near(v.blank[0].gain, 0.084), 'blank gain ' + v.blank[0].gain);
    assert.strictEqual(v.blank[0].a, 300);
    assert.strictEqual(v.blank[0].b, 260);
    assert.deepStrictEqual(v.landing.map(c => [c.a, c.b, c.gain]), [[620, 620, 0.13], [180, 120, 0.10]]);
    await page.close();
  });

  await runTest('Item C: the dev mute checkbox still silences all four roll sounds', async () => {
    const page = await freshFight(browser);
    await page.click('#devChromeToggleBtn');
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
    await page.check('#devMuteRollSoundsCheckbox');
    const counts = await page.evaluate(() => {
      const realTone = window.playTone;
      const realTimeout = window.setTimeout;
      let n = 0;
      window.setTimeout = function(fn) { fn(); return 0; };
      window.playTone = function() { n++; };
      const per = ['die_rolling', 'die_landing', 'die_blank', 'mod_trigger'].map(name => { const b = n; playAudioEvent(name); return n - b; });
      window.playTone = realTone;
      window.setTimeout = realTimeout;
      return per;
    });
    assert.deepStrictEqual(counts, [0, 0, 0, 0]);
    await page.close();
  });

  await runTest('no piece has empty on-screen text: every face and symbol hover line, every DIE layer row', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => ({
      tips: [...document.querySelectorAll('#playerDieList .hover-tip')].map(t => t.classList.contains('face-tip-boxes')
        ? [...t.querySelectorAll('.face-mod-box > div')].map(d => d.textContent.trim())
        : [...t.children].map(d => d.textContent.trim())),
      rows: [...document.querySelectorAll('#dieInfoContent .info-list-row')].map(r => r.textContent.trim()),
      heads: [...document.querySelectorAll('#dieInfoContent th')].map(r => r.textContent.trim())
    }));
    assert.ok(v.tips.length >= 23, 'twenty face boxes plus three symbol boxes, got ' + v.tips.length);
    v.tips.forEach(lines => { assert.ok(lines.length >= 2); lines.forEach(l => assert.ok(l.length > 0)); });
    v.rows.concat(v.heads).forEach(t => assert.ok(t.length > 0));
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build172 tests passed.');
})();
