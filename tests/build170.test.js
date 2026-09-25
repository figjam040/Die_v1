// ============================================================
// TESTS/BUILD170.TEST.JS
// Standing regression suite for BUILD 170: D-124 mod symbols under the
// fight's face row, D-125 card-style text for every mod, card and artifact
// (and the two-line face hover box), D-113 the four roll sounds and the
// dev drawer's mute for them.
// Run: node tests/build170.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').split(String.fromCharCode(92)).join('/');

// BUILD 169's face square on the opening fight, measured on that build:
// { viewport width: [left, top, width] } in screen pixels.
const BUILD169_SQUARE = {
  1600: [1326.390625, 778.546875, 49.21875],
  1920: [1591.671875, 934.578125, 59.0625]
};

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

// Any wait on ROLL_PHASE needs the dev drawer's flag first (D-113).
async function freshFight(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
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

function symbolsOn(page, faceNumber) {
  return page.evaluate((n) => {
    const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
    return [...row.querySelectorAll('.face-symbol-strip img')].map(i => ({ src: i.getAttribute('src'), w: i.getBoundingClientRect().width / parseFloat(document.documentElement.style.zoom || '1') }));
  }, faceNumber);
}

// Sentences in a text: split after a full stop, question or exclamation mark.
function sentenceCount(text) {
  return text.split(/[.!?](?:\s|$)/).filter(function(s) { return s.trim().length > 0; }).length;
}

const BANNED = [/applied/i, /applies/i, /this run/i, /[()]/];

(async () => {
  const browser = await chromium.launch();

  await runTest('Item A: a loaded face shows one 24px symbol, a two-mod face two, a blank face and faces 1 and 20 none', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    const one = await symbolsOn(page, 10);
    const two = await symbolsOn(page, 2);
    const blank = await symbolsOn(page, 3);
    const natOne = await symbolsOn(page, 1);
    const natTwenty = await symbolsOn(page, 20);
    assert.deepStrictEqual(one.map(s => s.src), ['art/mods/consecrate.png']);
    assert.deepStrictEqual(two.map(s => s.src), ['art/mods/smite.png', 'art/mods/blight.png']);
    one.concat(two).forEach(s => assert.ok(Math.abs(s.w - 24) < 0.01, 'symbol width ' + s.w));
    assert.strictEqual(blank.length, 0);
    assert.strictEqual(natOne.length, 0);
    assert.strictEqual(natTwenty.length, 0);
    await page.close();
  });

  await runTest("Item A: the face square keeps BUILD 169's size and place, the strip shows, nothing scrolls at 1600x900 and 1920x1080", async () => {
    for (const w of [1600, 1920]) {
      const vp = w === 1600 ? { width: 1600, height: 900 } : { width: 1920, height: 1080 };
      const page = await freshFight(browser, vp);
      await loadTwoModFace(page);
      const v = await page.evaluate(() => {
        const b = document.querySelector('#playerDieList .face-btn').getBoundingClientRect();
        const strips = [...document.querySelectorAll('#playerDieList .face-symbol-strip img')].map(i => i.getBoundingClientRect());
        return {
          sq: [b.left, b.top, b.width],
          maxBottom: Math.max.apply(null, strips.map(r => r.bottom)),
          stripCount: strips.length,
          scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight,
          innerW: innerWidth, innerH: innerHeight
        };
      });
      assert.deepStrictEqual(v.sq, BUILD169_SQUARE[w], w + ': face square moved or resized: ' + JSON.stringify(v.sq));
      assert.strictEqual(v.stripCount, 3, w + ': three symbols on the die');
      assert.ok(v.maxBottom <= v.innerH, w + ': a symbol hangs off the window, bottom ' + v.maxBottom);
      assert.ok(v.scrollW <= v.innerW && v.scrollH <= v.innerH, w + ': page scrolls ' + v.scrollW + 'x' + v.scrollH);
      await page.close();
    }
  });

  await runTest('Item A: a symbol whose file is missing hides itself', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      const strip = document.querySelector('#playerDieList .face-symbol-strip');
      window.__probe = attachArtIcon(strip, 'mods', 'no_such_mod', FACE_SYMBOL_PX, 'face-symbol-img');
    });
    await page.waitForFunction(() => window.__probe.style.display === 'none', null, { timeout: 5000 });
    await page.close();
  });

  await runTest("Item B: no mod, card, artifact or face hover text contains 'applied', 'applies', 'this run' or a parenthesis", async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.evaluate(() => { forcePlayerRoll(10); });
    await page.waitForFunction(() => dieRollAnimationsIdle());
    const texts = await page.evaluate(() => {
      const out = [];
      Object.keys(gameState.config.mods).forEach(id => out.push(['mod ' + id, MOD_DESCRIPTION[id]]));
      Object.keys(gameState.config.cards).forEach(id => out.push(['card ' + id, getCardEffectText(id)]));
      out.push(['card threnody fallback', CARD_EFFECT_TEXT.threnody]);
      Object.keys(gameState.config.artifacts).forEach(id => out.push(['artifact ' + id, gameState.config.artifacts[id].text]));
      Object.keys(NAT_DESCRIPTION).forEach(id => out.push(['nat ' + id, NAT_DESCRIPTION[id]]));
      document.querySelectorAll('#playerDieList .hover-tip, #enemyDieList .hover-tip').forEach((t, i) => out.push(['live tip ' + i, t.textContent]));
      const ids = ['ENEMY_NAT_ONE', 'ENEMY_NAT_TWENTY', 'enemy_buff_poison', 'enemy_buff_wrath', 'enemy_buff_drain', 'enemy_buff_seal', null];
      ['Verger', 'Lector', 'Hierophant', 'Cardinal', 'Pontifex'].forEach(name => ids.forEach(id => {
        out.push(['enemy ' + name + ' ' + id, faceHoverText({ number: 6, modId: id, modId2: null, weight: 1 }, 3, name, 2) || '']);
      }));
      const capped = Object.assign({}, getPlayerFace(20), { weight: GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT });
      out.push(['title face 20 at cap', faceTitleText(capped, true, true)]);
      out.push(['title face 2', faceTitleText(getPlayerFace(2), true, true)]);
      return out;
    });
    const bad = texts.filter(t => BANNED.some(re => re.test(t[1])));
    assert.deepStrictEqual(bad, [], 'banned wording: ' + JSON.stringify(bad));
    await page.close();
  });

  await runTest('Item B: all 27 mod, 51 card and 13 artifact texts are one or two sentences, each ending in a full stop', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => ({
      mods: Object.keys(gameState.config.mods).map(id => [id, MOD_DESCRIPTION[id]]),
      cards: Object.keys(gameState.config.cards).map(id => [id, getCardEffectText(id)]).concat([['threnody fallback', CARD_EFFECT_TEXT.threnody]]),
      artifacts: Object.keys(gameState.config.artifacts).map(id => [id, gameState.config.artifacts[id].text])
    }));
    assert.strictEqual(v.mods.length, 27);
    assert.strictEqual(v.cards.length, 52);
    assert.strictEqual(v.artifacts.length, 13);
    const bad = v.mods.concat(v.cards, v.artifacts).filter(t => !t[1] || sentenceCount(t[1]) < 1 || sentenceCount(t[1]) > 2 || !/\.$/.test(t[1]));
    assert.deepStrictEqual(bad, [], 'not one or two sentences: ' + JSON.stringify(bad));
    await page.close();
  });

  await runTest('Item B: the face hover box reads two lines — name, weight and trigger count, then the text', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.evaluate(() => { forcePlayerRoll(10); });
    await page.waitForFunction(() => dieRollAnimationsIdle());
    const v = await page.evaluate(() => {
      const tipFor = n => {
        const row = [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
        return [...row.querySelector('.hover-tip').children].map(d => d.textContent);
      };
      return { ten: tipFor(10), two: tipFor(2), three: tipFor(3), smite: MOD_DESCRIPTION.smite, blight: MOD_DESCRIPTION.blight, consecrate: MOD_DESCRIPTION.consecrate };
    });
    assert.deepStrictEqual(v.ten, ['Consecrate · weight 1 · triggered 1 times', v.consecrate]);
    assert.deepStrictEqual(v.two, ['Smite + Blight · weight 1 · triggered 0 / 0 times', v.smite + ' / ' + v.blight]);
    assert.deepStrictEqual(v.three, ['Blank · weight 1', 'Gain 2 block.']);
    await page.close();
  });

  await runTest('Item C: die_rolling, die_landing, die_blank and mod_trigger exist, roll_blank is gone, each at 200ms or under', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const names = ['die_rolling', 'die_landing', 'die_blank', 'mod_trigger'];
      const calls = [];
      let delayNow = 0;
      const realTimeout = window.setTimeout;
      const realTone = window.playTone;
      window.setTimeout = function(fn, d) { const prev = delayNow; delayNow = d; fn(); delayNow = prev; return 0; };
      window.playTone = function(w, a, b, ms) { calls.push(delayNow + ms); };
      const out = {};
      names.forEach(n => { calls.length = 0; out[n] = typeof SOUND_TABLE[n] === 'function' ? (SOUND_TABLE[n](0), Math.max.apply(null, calls)) : null; });
      window.setTimeout = realTimeout;
      window.playTone = realTone;
      return { out, rollBlank: 'roll_blank' in SOUND_TABLE, events: ROLL_SOUND_EVENTS };
    });
    Object.keys(v.out).forEach(n => assert.ok(v.out[n] > 0 && v.out[n] <= 200, n + ' measured ' + v.out[n]));
    assert.strictEqual(v.rollBlank, false, 'roll_blank must be gone');
    assert.deepStrictEqual(v.events, ['die_rolling', 'die_landing', 'die_blank', 'mod_trigger']);
    await page.close();
  });

  await runTest('Item C: rolling starts with the animation; landing and trigger, blank, or a Nat sound follow on the stop', async () => {
    const outcomes = [[10, ['die_rolling', 'die_landing', 'mod_trigger']], [3, ['die_rolling', 'die_blank']], [20, ['die_rolling', 'nat_20']], [1, ['die_rolling', 'nat_1']]];
    for (const [face, expected] of outcomes) {
      const page = await freshFight(browser);
      const v = await page.evaluate((n) => {
        window.__heard = [];
        Object.keys(SOUND_TABLE).forEach(name => {
          const real = SOUND_TABLE[name];
          SOUND_TABLE[name] = function(step) { window.__heard.push({ name, t: performance.now() }); return real(step); };
        });
        window.__t0 = performance.now();
        forcePlayerRoll(n);
        return window.__heard.map(h => h.name);
      }, face);
      assert.deepStrictEqual(v, ['die_rolling'], 'face ' + face + ': only the rattle plays before the stop, heard ' + JSON.stringify(v));
      await page.waitForFunction(() => dieRollAnimationsIdle());
      const heard = await page.evaluate(() => window.__heard.map(h => ({ name: h.name, dt: h.t - window.__t0 })));
      const names = heard.map(h => h.name).filter(n => expected.indexOf(n) !== -1 || n === 'die_landing' || n === 'die_blank');
      assert.deepStrictEqual(names, expected, 'face ' + face + ' heard ' + JSON.stringify(heard));
      const landed = heard.find(h => h.name === expected[1]);
      assert.ok(landed.dt >= 150, 'face ' + face + ': ' + expected[1] + ' played ' + landed.dt + 'ms in, before the stop');
      await page.close();
    }
  });

  await runTest('Item C: the dev drawer checkbox mutes the four roll sounds and nothing else', async () => {
    const page = await freshFight(browser);
    await page.click('#devChromeToggleBtn');
    const count = (names) => page.evaluate((list) => {
      let n = 0;
      const realTone = window.playTone;
      const realTimeout = window.setTimeout;
      window.setTimeout = function(fn) { fn(); return 0; };
      window.playTone = function() { n++; };
      const per = list.map(name => { const before = n; playAudioEvent(name); return n - before; });
      window.playTone = realTone;
      window.setTimeout = realTimeout;
      return per;
    }, names);
    // Roll now, so the drawer's own pause can't start a roll mid-count.
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => dieRollAnimationsIdle() && gameState.turn.phase === 'CARD_PHASE');
    const four =['die_rolling', 'die_landing', 'die_blank', 'mod_trigger'];
    await page.check('#devMuteRollSoundsCheckbox');
    const muted = await count(four);
    const others = await count(['nat_20', 'card_attack']);
    await page.uncheck('#devMuteRollSoundsCheckbox');
    const unmuted = await count(four);
    assert.deepStrictEqual(muted, [0, 0, 0, 0], 'muted: ' + muted);
    assert.ok(others.every(c => c > 0), 'other sounds must still play: ' + others);
    assert.ok(unmuted.every(c => c > 0), 'unmuted: ' + unmuted);
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build170 tests passed.');
})();
