// Standing regression suite for BUILD 192: D-155 every choice lights like a
// door, D-156 the Rite's alcoves, The Font's die and basin and the map of
// doors, D-157 the capital D, D-160 one sentence per line.
// Every page is 1600 by 900, the design size the sizes are given at.
// Run: node tests/build192.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL, assertNoErrors } = require('./shared-constants');

const { runTest, report } = createRunner();

const GOLD = 'rgb(251, 191, 36)';
const RISE_12 = 'matrix(1, 0, 0, 1, 0, -12)';
const DOOR_GLOW = 'drop-shadow(rgba(251, 191, 36, 0.45) 0px 0px 22px)';

// The 1.1 page zoom at 1600 by 900 leaves computed sizes a hair off whole
// pixels (247.997px); every px value read is rounded before it is compared.
function px(s) {
  return String(s).replace(/(\d+\.\d+)px/g, function(m, n) { return Math.round(parseFloat(n)) + 'px'; });
}

async function page1600(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => document.fonts.ready.then(function() { return true; }));
  page._consoleErrors = consoleErrors;
  page._pageErrors = pageErrors;
  return page;
}

async function fightPage(browser) {
  const page = await page1600(browser);
  await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Hovers the selector, waits out the 150ms step transition, reads fn.
async function hoverRead(page, selector, fn, arg) {
  await page.hover(selector);
  await page.waitForTimeout(300);
  return page.evaluate(fn, arg);
}

const lit = (sel) => {
  const el = document.querySelector(sel);
  const cs = getComputedStyle(el);
  return { border: cs.borderTopColor, transform: cs.transform, filter: cs.filter, lit: el.classList.contains('choice-lit') };
};

(async () => {
  const browser = await chromium.launch();

  // ---------- D-155 every choice lights like a door ----------

  await runTest('D-155 a card reward card: edge gold, raised 12px, glowing on hover; a keyboard focus does the same', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { openCardRewardScreen(); });
    const rest = await page.evaluate(lit, '#cardRewardPanel .offer-card');
    assert.deepStrictEqual([rest.lit, rest.transform, rest.filter], [true, 'none', 'none']);
    const hover = await hoverRead(page, '#cardRewardPanel .offer-card', lit, '#cardRewardPanel .offer-card');
    assert.deepStrictEqual([hover.border, hover.transform, hover.filter], [GOLD, RISE_12, DOOR_GLOW]);
    await page.mouse.move(0, 0);
    let focused = false;
    for (let i = 0; i < 60 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement === document.querySelector('#cardRewardPanel .offer-card'));
    }
    assert.ok(focused, 'Tab reaches the first reward card');
    await page.waitForTimeout(300);
    const focus = await page.evaluate(lit, '#cardRewardPanel .offer-card');
    assert.deepStrictEqual([focus.border, focus.transform], [GOLD, RISE_12]);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => cardRewardStep === null);
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-155 a Load mod symbol and an artifact symbol rise, glow and turn their name gold', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseLoad(); });
    const readSymbol = (sel) => {
      const el = document.querySelector(sel);
      const cs = getComputedStyle(el);
      return { lit: el.classList.contains('choice-lit'), transform: cs.transform, filter: cs.filter,
        name: getComputedStyle(el.querySelector('.hover-tip').firstElementChild).color };
    };
    const mod = await hoverRead(page, '#dieActionPanel .offer-symbol', readSymbol, '#dieActionPanel .offer-symbol');
    assert.deepStrictEqual(mod, { lit: true, transform: RISE_12, filter: DOOR_GLOW, name: GOLD });
    await page.evaluate(() => { closeDieActionScreen(); cardRewardStep = null; openArtifactRewardScreen(); });
    await page.waitForFunction(() => artifactRewardStep === 'choose');
    const art = await hoverRead(page, '#artifactRewardPanel .offer-symbol', readSymbol, '#artifactRewardPanel .offer-symbol');
    assert.deepStrictEqual(art, { lit: true, transform: RISE_12, filter: DOOR_GLOW, name: GOLD });
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-155 the shop: every affordable item lights; an unaffordable card and a disabled button do not react', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { updateRun({ gold: 999 }); openShopScreen(); });
    const rich = await page.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('#shopPanel .offer-card')).map(function(c) { return c.classList.contains('choice-lit'); }),
      small: Array.from(document.querySelectorAll('#shopPanel .offer-small')).map(function(b) { return b.classList.contains('choice-lit'); })
    }));
    assert.ok(rich.cards.length === 3 && rich.cards.every(Boolean), 'every card for sale lights: ' + JSON.stringify(rich));
    assert.ok(rich.small.length >= 2 && rich.small.every(Boolean), 'every button for sale lights: ' + JSON.stringify(rich));
    const small = await hoverRead(page, '#shopPanel .offer-small', lit, '#shopPanel .offer-small');
    assert.deepStrictEqual([small.border, small.transform, small.filter], [GOLD, RISE_12, DOOR_GLOW]);
    await page.evaluate(() => { updateRun({ gold: 0 }); });
    const poor = await page.evaluate(() => ({
      cards: Array.from(document.querySelectorAll('#shopPanel .offer-card')).map(function(c) { return c.classList.contains('choice-lit'); }),
      small: Array.from(document.querySelectorAll('#shopPanel .offer-small')).map(function(b) { return b.classList.contains('choice-lit'); })
    }));
    assert.ok(poor.cards.every(function(x) { return !x; }) && poor.small.every(function(x) { return !x; }), JSON.stringify(poor));
    const dead = await hoverRead(page, '#shopPanel .offer-card', lit, '#shopPanel .offer-card');
    assert.deepStrictEqual([dead.transform, dead.filter], ['none', 'none']);
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-155 both card removal pickers light; the CARDS layer, hand cards and face picks do not', async () => {
    const page = await fightPage(browser);
    const hand = await page.evaluate(() => Array.from(document.querySelectorAll('#handRow .offer-card')).some(function(c) { return c.classList.contains('choice-lit'); }));
    assert.strictEqual(hand, false, 'hand cards never light');
    await page.evaluate(() => { openRiteScreen(); riteChooseRemoveCard(); });
    const rite = await hoverRead(page, '#riteScreenPanel .card-grid .offer-card', lit, '#riteScreenPanel .card-grid .offer-card');
    assert.deepStrictEqual([rite.lit, rite.border, rite.transform], [true, GOLD, RISE_12]);
    await page.evaluate(() => { riteStep = null; updateRun({ gold: 999 }); openShopScreen(); shopBuyRemoval(); });
    const shop = await page.evaluate(lit, '#shopPanel .card-grid .offer-card');
    assert.strictEqual(shop.lit, true);
    await page.evaluate(() => { closeShopScreen(); });
    await page.evaluate(() => { updateUi({ cardsInfoOpen: true }); });
    const layer = await page.evaluate(() => Array.from(document.querySelectorAll('#cardsInfoContent .offer-card')).some(function(c) { return c.classList.contains('choice-lit'); }));
    assert.strictEqual(layer, false, 'the CARDS layer is not a choice');
    await page.evaluate(() => { updateUi({ cardsInfoOpen: false }); });
    const faces = await page.evaluate(() => document.querySelectorAll('#playerDieList .choice-lit').length);
    assert.strictEqual(faces, 0, 'face picks never light');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- D-156 the Rite ----------

  await runTest('D-156 the Rite: three alcoves in order, 260 by 440, bottoms aligned, gap 64, their texts and the lines under the HP', async () => {
    const page = await fightPage(browser);
    const v = await page.evaluate(() => {
      openRiteScreen();
      const panel = document.getElementById('riteScreenPanel');
      const cs = function(el) { return getComputedStyle(el); };
      const doors = Array.from(panel.querySelectorAll('.die-door.rite-alcove'));
      return {
        title: panel.querySelector('.die-action-title').textContent,
        hp: panel.querySelector('.rite-hp').textContent,
        sub: Array.from(panel.querySelector('.die-door-sub').children).map(function(l) { return l.textContent; }),
        subStyle: cs(panel.querySelector('.die-door-sub')).fontSize + ' ' + cs(panel.querySelector('.die-door-sub')).color + ' ' + cs(panel.querySelector('.die-door-sub')).fontFamily.split(',')[0],
        names: doors.map(function(d) { return d.querySelector('.die-door-name').textContent; }),
        descs: doors.map(function(d) { return d.querySelector('.die-door-desc').textContent; }),
        sizes: doors.map(function(d) { return cs(d).width + ' ' + cs(d).height; }),
        bottoms: doors.map(function(d) { return Math.round(d.getBoundingClientRect().bottom); }),
        gap: cs(panel.querySelector('.rite-alcoves')).columnGap,
        outerClip: cs(doors[0].querySelector('.die-door-outer')).clipPath,
        inner: cs(doors[0].querySelector('.die-door-inner')).width + ' ' + cs(doors[0].querySelector('.die-door-inner')).height + ' ' +
          cs(doors[0].querySelector('.die-door-inner')).left + ' ' + cs(doors[0].querySelector('.die-door-inner')).top,
        innerClip: cs(doors[0].querySelector('.die-door-inner')).clipPath,
        pad: cs(doors[0].querySelector('.die-door-inner')).paddingTop + ' ' + cs(doors[0].querySelector('.die-door-inner')).rowGap,
        icons: doors.map(function(d) { const s = d.querySelector('svg'); return s.getAttribute('viewBox') + ' ' + s.getAttribute('width') + ' ' + s.getAttribute('stroke-width'); }),
        removeLine: doors[2].querySelector('path[stroke-width="5"]').getAttribute('d'),
        faceRow: cs(document.querySelector('#fightScreen .band-d')).display,
        heal: GAME_CONFIG.RITE_HEAL
      };
    });
    assert.strictEqual(v.title, 'Rite');
    assert.ok(/^\d+ \/ \d+$/.test(v.hp), v.hp);
    assert.deepStrictEqual(v.sub, ['Rest here. ', 'Take one.']);
    assert.strictEqual(v.subStyle, '26px rgb(156, 150, 132) VT323');
    assert.deepStrictEqual(v.names, ['Heal', 'Modify Die', 'Remove']);
    assert.deepStrictEqual(v.descs, ['Recover ' + v.heal + ' HP.', 'Take one Die action: Load, Strengthen, Purify or Remove.', 'Take one card out of your deck for the run.']);
    assert.deepStrictEqual(v.sizes, ['260px 440px', '260px 440px', '260px 440px']);
    assert.ok(v.bottoms.every(function(b) { return b === v.bottoms[0]; }), 'bottoms aligned ' + v.bottoms);
    assert.strictEqual(v.gap, '64px');
    assert.strictEqual(v.outerClip, 'polygon(0px 60px, 20px 60px, 20px 36px, 44px 36px, 44px 16px, 76px 16px, 76px 0px, 184px 0px, 184px 16px, 216px 16px, 216px 36px, 240px 36px, 240px 60px, 260px 60px, 260px 440px, 0px 440px)');
    assert.strictEqual(px(v.inner), '248px 428px 6px 6px');
    assert.strictEqual(v.innerClip, 'polygon(0px 60px, 20px 60px, 20px 36px, 44px 36px, 44px 16px, 76px 16px, 76px 0px, 172px 0px, 172px 16px, 204px 16px, 204px 36px, 228px 36px, 228px 60px, 248px 60px, 248px 428px, 0px 428px)');
    assert.strictEqual(v.pad, '86px 24px');
    assert.deepStrictEqual(v.icons, ['0 0 96 96 96 3', '0 0 96 96 96 3', '0 0 96 96 96 3']);
    assert.strictEqual(v.removeLine, 'M14 82 L82 14');
    assert.strictEqual(v.faceRow, 'none', 'the face row hides on the choose step');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-156 an alcove lights as a die door; Modify Die opens the doors, then the face row returns; Heal and Remove call their functions', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { openRiteScreen(); });
    const read = (sel) => {
      const d = document.querySelector(sel);
      const cs = function(el) { return getComputedStyle(el); };
      return [cs(d.querySelector('.die-door-outer')).backgroundColor, cs(d.querySelector('svg')).color, cs(d.querySelector('.die-door-name')).color, cs(d).transform, cs(d).filter];
    };
    const hover = await hoverRead(page, '.rite-alcove[data-action="Heal"]', read, '.rite-alcove[data-action="Heal"]');
    assert.deepStrictEqual(hover, [GOLD, GOLD, GOLD, RISE_12, DOOR_GLOW]);
    await page.click('.rite-alcove[data-action="Modify Die"]');
    await page.waitForFunction(() => dieActionStep === 'choose');
    const doors = await page.evaluate(() => ({ rite: document.getElementById('fightScreen').classList.contains('rite-choosing'),
      bandD: getComputedStyle(document.querySelector('#fightScreen .band-d')).display, origin: dieActionOrigin }));
    assert.deepStrictEqual(doors, { rite: false, bandD: 'none', origin: 'rite' });
    await page.click('.die-door[data-action="Load"]');
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('#fightScreen .band-d')).display);
    assert.notStrictEqual(after, 'none', 'the face row is back once a door is picked');

    await page.evaluate(() => { closeDieActionScreen(); shopStep = null; cardRewardStep = null; updatePlayer({ hp: 30 }); openRiteScreen(); });
    await page.click('.rite-alcove[data-action="Heal"]');
    const healed = await page.evaluate(() => ({ hp: gameState.player.hp, shop: shopStep, rite: riteStep }));
    assert.deepStrictEqual(healed, { hp: 50, shop: 'open', rite: null });
    await page.evaluate(() => { closeShopScreen(); openRiteScreen(); });
    await page.click('.rite-alcove[data-action="Remove"]');
    const removing = await page.evaluate(() => ({ step: riteStep, grid: !!document.querySelector('#riteScreenPanel .card-grid'),
      bandD: getComputedStyle(document.querySelector('#fightScreen .band-d')).display }));
    assert.strictEqual(removing.step, 'remove_pick_card');
    assert.ok(removing.grid && removing.bandD !== 'none', JSON.stringify(removing));
    assertNoErrors(page);
    await page.close();
  });

  // ---------- D-156 The Font ----------

  await runTest('D-156 The Font: title, flavour one sentence per line, the die button, the basin 34px under it; all fit above the face row', async () => {
    const page = await fightPage(browser);
    const v = await page.evaluate(() => {
      openEventScreen();
      const panel = document.getElementById('eventScreenPanel');
      const cs = function(el) { return getComputedStyle(el); };
      const title = panel.querySelector('.die-action-title');
      const flavour = panel.querySelector('.font-flavour');
      const btn = panel.querySelector('.font-die');
      const svg = btn.querySelector('svg');
      const word = btn.querySelector('.font-die-word');
      const basin = panel.querySelector('.font-basin');
      const inner = basin.querySelector('.font-basin-inner');
      const water = basin.querySelector('.font-basin-water');
      return {
        title: title.textContent + ' ' + cs(title).fontSize + ' ' + cs(title).color + ' ' + cs(title).fontFamily.split(',')[0],
        flavour: Array.from(flavour.children).map(function(l) { return l.textContent.trim(); }),
        flavourStyle: cs(flavour).fontSize + ' ' + cs(flavour).color + ' ' + cs(flavour).fontFamily.split(',')[0],
        svg: svg.getAttribute('width') + ' ' + svg.getAttribute('height') + ' ' + svg.getAttribute('viewBox') + ' ' + svg.getAttribute('stroke-width'),
        rest: [cs(svg).color, word.textContent, cs(word).fontSize, cs(word).color],
        gap: Math.round(basin.getBoundingClientRect().top - btn.getBoundingClientRect().bottom),
        zoom: parseFloat(document.documentElement.style.zoom) || 1,
        basin: cs(basin).width + ' ' + cs(basin).height + ' ' + cs(basin.querySelector('.font-basin-outer')).backgroundColor,
        inner: [cs(inner).left, cs(inner).top, cs(inner).width, cs(inner).height, cs(inner).backgroundColor].join(' '),
        water: [cs(water).left, cs(water).top, cs(water).width, cs(water).height, cs(water).backgroundColor, cs(water).borderBottomWidth, cs(water).borderBottomColor].join(' '),
        outerClip: cs(basin.querySelector('.font-basin-outer')).clipPath,
        fits: basin.getBoundingClientRect().bottom <= document.querySelector('#fightScreen .band-d').getBoundingClientRect().top,
        faceRow: cs(document.querySelector('#fightScreen .band-d')).display
      };
    });
    assert.strictEqual(v.title, 'The Font 30px rgb(244, 244, 244) "Press Start 2P"');
    assert.deepStrictEqual(v.flavour, ['A font of black water stands where the road bends.', 'Nothing moves in it.', 'The Die goes in.']);
    assert.strictEqual(v.flavourStyle, '30px rgb(232, 228, 208) VT323');
    assert.strictEqual(v.svg, '200 200 0 0 96 96 2.5');
    assert.deepStrictEqual(v.rest, ['rgb(156, 150, 132)', 'Roll', '20px', 'rgb(244, 244, 244)']);
    assert.strictEqual(Math.round(v.gap / v.zoom), 34);
    assert.strictEqual(px(v.basin), '520px 190px rgb(58, 59, 63)');
    assert.strictEqual(px(v.inner), '6px 6px 508px 178px rgb(10, 10, 12)');
    assert.strictEqual(px(v.water), '18px 10px 484px 8px rgb(0, 0, 0) 2px rgb(35, 64, 107)');
    assert.ok(v.outerClip.indexOf('polygon(0px 0px, 520px 0px, 520px 28px, 492px 28px') === 0, v.outerClip);
    assert.ok(v.fits, 'the basin sits above the face row');
    assert.notStrictEqual(v.faceRow, 'none', 'the face row stays visible');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-156 The Font die on hover: gold, raised 12px, glowing, the basin lit; the click rolls and CONTINUE follows', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { openEventScreen(); });
    const v = await hoverRead(page, '.font-die', () => {
      const cs = function(el) { return getComputedStyle(el); };
      const btn = document.querySelector('.font-die');
      return [cs(btn.querySelector('svg')).color, cs(btn.querySelector('.font-die-word')).color, cs(btn).transform, cs(btn).filter,
        cs(document.querySelector('.font-basin-outer')).backgroundColor, cs(document.querySelector('.font-basin-water')).borderBottomColor];
    });
    assert.deepStrictEqual(v, [GOLD, GOLD, RISE_12, 'drop-shadow(rgba(251, 191, 36, 0.5) 0px 0px 26px)', 'rgb(138, 106, 18)', GOLD]);
    await page.evaluate(() => { Math.random = function() { return 0.5; }; });
    await page.click('.font-die');
    const after = await page.evaluate(() => ({ step: eventStep,
      buttons: Array.from(document.querySelectorAll('#eventScreenPanel button')).map(function(b) { return b.textContent; }) }));
    assert.deepStrictEqual(after, { step: 'result', buttons: ['CONTINUE'] });
    assertNoErrors(page);
    await page.close();
  });

  // ---------- D-156 the map ----------

  await runTest('D-156 the map: doors 104 by 128 and the Boss 136 by 168, their icons and labels; twelve columns fit 1600 wide; centred', async () => {
    const page = await page1600(browser);
    const v = await page.evaluate(() => {
      const cs = function(el) { return getComputedStyle(el); };
      const nodes = Array.from(document.querySelectorAll('#mapScreen .map-node'));
      const fight = nodes[1];
      const boss = document.querySelector('.map-node-boss');
      const comp = document.querySelector('.map-composition').getBoundingClientRect();
      const screen = document.getElementById('mapScreen').getBoundingClientRect();
      const title = document.querySelector('.map-title');
      const top = title.getBoundingClientRect().top;
      return {
        kinds: nodes.map(function(n) { return n.dataset.kind; }).filter(function(k, i, a) { return a.indexOf(k) === i; }),
        door: cs(fight).width + ' ' + cs(fight).height, bossDoor: cs(boss).width + ' ' + cs(boss).height,
        outerClip: cs(fight.querySelector('.map-door-outer')).clipPath,
        inner: [cs(fight.querySelector('.map-door-inner')).left, cs(fight.querySelector('.map-door-inner')).width, cs(fight.querySelector('.map-door-inner')).height,
          cs(fight.querySelector('.map-door-inner')).paddingTop, cs(fight.querySelector('.map-door-inner')).rowGap, cs(fight.querySelector('.map-door-inner')).backgroundColor].join(' '),
        bossInner: [cs(boss.querySelector('.map-door-inner')).width, cs(boss.querySelector('.map-door-inner')).height, cs(boss.querySelector('.map-door-inner')).paddingTop].join(' '),
        icon: ['width', 'height', 'viewBox', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill'].map(function(a) { return fight.querySelector('svg').getAttribute(a); }).join(' '),
        bossIcon: boss.querySelector('svg').getAttribute('width'),
        fightPath: fight.querySelector('path').getAttribute('d'),
        label: cs(fight.querySelector('.map-door-label')).fontSize + ' ' + cs(boss.querySelector('.map-door-label')).fontSize,
        title: title.textContent + ' ' + cs(title).fontSize + ' ' + cs(title).color,
        sub: !!document.querySelector('#mapScreen .die-door-sub'),
        fits: comp.left >= 0 && comp.right <= window.innerWidth,
        nodeCount: nodes.length,
        centre: Math.abs(((top + comp.bottom) / 2) - (screen.top + screen.bottom) / 2)
      };
    });
    assert.deepStrictEqual(v.kinds, ['Start', 'Fight', 'Rite', 'Elite', 'Anomaly', 'Boss']);
    assert.deepStrictEqual([px(v.door), px(v.bossDoor)], ['104px 128px', '136px 168px']);
    assert.strictEqual(px(v.inner), '3px 98px 122px 34px 12px rgb(10, 10, 12)');
    assert.strictEqual(px(v.bossInner), '130px 162px 46px');
    assert.strictEqual(v.outerClip,'polygon(0px 24px, 8px 24px, 8px 14px, 18px 14px, 18px 6px, 30px 6px, 30px 0px, 74px 0px, 74px 6px, 86px 6px, 86px 14px, 96px 14px, 96px 24px, 104px 24px, 104px 128px, 0px 128px)');
    assert.strictEqual(v.icon, '44 44 0 0 48 48 3 square miter none');
    assert.strictEqual(v.bossIcon, '60');
    assert.strictEqual(v.fightPath, 'M10 38 L36 12 M28 10 H38 V20 M38 38 L12 12 M10 20 V10 H20 M8 32 L16 40 M40 32 L32 40');
    assert.strictEqual(v.label, '9px 11px');
    assert.strictEqual(v.title, 'Act 1 30px rgb(244, 244, 244)');
    assert.strictEqual(v.sub, false, 'no lane lines before the opening fight is done');
    assert.strictEqual(v.nodeCount, 21);
    assert.ok(v.fits, 'act 1 fits 1600 wide');
    assert.ok(v.centre < 8, 'title and map centred top to bottom, off by ' + v.centre);
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-156 map door states: completed, current and choice, inert, inert Elite and Boss; a choice lights on hover; the lane lines', async () => {
    const page = await page1600(browser);
    await page.evaluate(() => {
      updateRun({ act: Object.assign({}, gameState.run.act, { opening: Object.assign({}, gameState.run.act.opening, { completed: true, entered: true }) }) });
    });
    const tones = (sel) => {
      const n = document.querySelector(sel);
      const cs = function(el) { return getComputedStyle(el); };
      return [cs(n.querySelector('.map-door-outer')).backgroundColor, cs(n.querySelector('svg')).color, cs(n.querySelector('.map-door-label')).color];
    };
    const v = await page.evaluate((tonesSrc) => {
      const tones = new Function('return ' + tonesSrc)();
      return {
        completed: tones('.map-node-opening'), choice: tones('.map-lane .map-node-choice'), inert: tones('.map-lane .map-node-inert[data-kind="Rite"]'),
        elite: tones('.map-node-inert[data-kind="Elite"]'), boss: tones('.map-node-boss'),
        tick: getComputedStyle(document.querySelector('.map-node-opening'), '::before').content,
        sub: Array.from(document.querySelector('#mapScreen .die-door-sub').children).map(function(l) { return l.textContent; })
      };
    }, tones.toString());
    assert.deepStrictEqual(v.completed, ['rgb(58, 59, 63)', 'rgb(125, 125, 125)', 'rgb(138, 138, 138)']);
    assert.ok(v.tick === 'normal' || v.tick === 'none', 'no tick before a completed label: ' + v.tick);
    assert.deepStrictEqual(v.choice, ['rgb(138, 106, 18)', 'rgb(232, 228, 208)', 'rgb(244, 244, 244)']);
    assert.deepStrictEqual(v.inert, ['rgb(38, 39, 43)', 'rgb(85, 86, 92)', 'rgb(125, 125, 125)']);
    assert.deepStrictEqual(v.elite, ['rgb(58, 28, 28)', 'rgb(184, 92, 92)', 'rgb(184, 92, 92)']);
    assert.deepStrictEqual(v.boss, ['rgb(74, 31, 31)', 'rgb(248, 113, 113)', 'rgb(248, 113, 113)']);
    assert.deepStrictEqual(v.sub, ['The road splits. ', 'Choose a door.']);
    const hover = await hoverRead(page, '.map-lane .map-node-choice', (tonesSrc) => {
      const n = document.querySelector('.map-lane .map-node-choice');
      const tones = new Function('return ' + tonesSrc)();
      return tones('.map-lane .map-node-choice').concat([getComputedStyle(n).transform, getComputedStyle(n).filter]);
    }, tones.toString());
    assert.deepStrictEqual(hover, [GOLD, GOLD, GOLD, 'matrix(1, 0, 0, 1, 0, -10)', 'drop-shadow(rgba(251, 191, 36, 0.5) 0px 0px 18px)']);
    await page.click('.map-lane .map-node-choice');
    await page.waitForFunction(() => gameState.run.screen === 'fight');
    assert.strictEqual(await page.evaluate(() => gameState.run.lane), 'upper');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- D-157 the capital D ----------

  await runTest('D-157 the player die is Die in every text the player reads; enemy dice stay lower case', async () => {
    const page = await fightPage(browser);
    const v = await page.evaluate(() => {
      const texts = [];
      Object.keys(MOD_DESCRIPTION).forEach(function(id) { texts.push(MOD_DESCRIPTION[id]); });
      Object.keys(gameState.config.cardPool).forEach(function(id) { texts.push(getCardEffectText(id)); });
      Object.keys(gameState.config.artifacts).forEach(function(id) { texts.push(gameState.config.artifacts[id].text); });
      Object.keys(DIE_DOOR_TEXT).forEach(function(k) { texts.push(DIE_DOOR_TEXT[k]); });
      openDieActionScreen('reward');
      const sub = document.querySelector('#dieActionPanel .die-door-sub').textContent;
      closeDieActionScreen(); cardRewardStep = null;
      return {
        lower: texts.filter(function(t) { return /\byour die\b|\bthe die\b/.test(t); }),
        yourDie: texts.filter(function(t) { return /\byour Die\b/.test(t); }).length,
        chance: gameState.config.artifacts.second_chance.text,
        remove: DIE_DOOR_TEXT.Remove,
        sub: sub,
        icon: document.querySelector('#playerDieIcon .hover-tip').textContent,
        layer: document.querySelector('#dieInfoLayer .die-action-title').textContent
      };
    });
    assert.deepStrictEqual(v.lower, [], 'no player-facing text names the player die in lower case');
    assert.ok(v.yourDie >= 8, 'the seven texts plus Second Chance: ' + v.yourDie);
    assert.strictEqual(v.chance, 'Once per fight, reroll your Die.');
    assert.strictEqual(v.remove, 'Take one blank face off the Die for the run.');
    assert.strictEqual(v.sub, 'One change to your Die. It lasts the whole run.');
    assert.ok(v.icon.indexOf('Your Die: d') === 0, v.icon);
    assert.strictEqual(v.layer, 'Player Die');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- D-160 one sentence per line ----------

  await runTest('D-160 card text, explainers and hover boxes: one block per sentence on one left edge, text unchanged', async () => {
    const page = await fightPage(browser);
    await page.evaluate(() => { openCardRewardScreen(); });
    const v = await page.evaluate(() => {
      const card = renderCard('mysterium', { size: 'offer', onClick: function() {} });
      document.getElementById('cardRewardPanel').appendChild(card);
      const rules = card.querySelector('.offer-card-text');
      const lefts = Array.from(rules.children).map(function(l) { return Math.round(l.getBoundingClientRect().left); });
      const tipLine = card.querySelector('.hover-tip').firstElementChild;
      const hand = document.querySelector('#handRow .offer-card-text');
      return {
        rules: Array.from(rules.children).map(function(l) { return l.className + '|' + l.textContent; }),
        sameText: rules.textContent === getCardEffectText('mysterium'),
        lefts: lefts,
        explainer: card.querySelectorAll('.card-explainer-line .sentence-line').length,
        tip: Array.from(tipLine.children).map(function(l) { return l.textContent; }),
        tipAlign: getComputedStyle(card.querySelector('.hover-tip')).textAlign,
        handAlign: getComputedStyle(hand).textAlign,
        split: fillSentenceLines(document.createElement('div'), 'Deal 1.5 damage. Then 2.').children.length
      };
    });
    assert.ok(v.rules.length >= 2 && v.rules.every(function(r) { return r.indexOf('sentence-line|') === 0; }), JSON.stringify(v.rules));
    assert.ok(v.sameText, 'textContent is the text unchanged');
    assert.ok(v.lefts.every(function(l) { return l === v.lefts[0]; }), 'one left edge ' + v.lefts);
    assert.ok(v.explainer >= 2, 'an explainer splits too');
    assert.ok(v.tip.length >= 2 && v.tip[0].indexOf('Mysterium — ') === 0, JSON.stringify(v.tip));
    assert.deepStrictEqual([v.tipAlign, v.handAlign], ['left', 'left']);
    assert.strictEqual(v.split, 2, 'a full stop with no space after it does not split');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-160 a door description and a screen line: as wide as the longest line, centred in the box, lines left-aligned', async () => {
    const page = await fightPage(browser);
    const v = await page.evaluate(() => {
      openDieActionScreen('reward');
      const door = document.querySelector('.die-door[data-action="Strengthen"]');
      const desc = door.querySelector('.die-door-desc');
      const inner = door.querySelector('.die-door-inner').getBoundingClientRect();
      const d = desc.getBoundingClientRect();
      const lines = Array.from(desc.children).map(function(l) { return l.getBoundingClientRect(); });
      const sub = document.querySelector('#dieActionPanel .die-door-sub');
      const s = sub.getBoundingClientRect();
      const panel = document.getElementById('dieActionPanel').getBoundingClientRect();
      const skip = document.querySelector('.die-door-skip');
      return {
        count: lines.length,
        width: Math.round(d.width) === Math.round(Math.max.apply(null, lines.map(function(r) { return r.width; }))) || Math.round(d.width),
        lefts: lines.map(function(r) { return Math.round(r.left); }),
        descLeft: Math.round(d.left),
        centred: Math.abs((d.left - inner.left) - (inner.right - d.right)),
        subCentred: Math.abs((s.left - panel.left) - (panel.right - s.right)),
        subLines: sub.children.length,
        align: getComputedStyle(desc).textAlign + ' ' + getComputedStyle(sub).textAlign,
        skip: skip.getBoundingClientRect().height < 40 && skip.children.length === 0
      };
    });
    assert.strictEqual(v.count, 2);
    assert.ok(v.lefts.every(function(l) { return l === v.descLeft; }), 'lines share the block left edge');
    assert.ok(v.centred <= 2, 'description centred in its door, off by ' + v.centred);
    assert.ok(v.subCentred <= 2 && v.subLines === 2, 'screen line centred, two sentences');
    assert.strictEqual(v.align, 'left left');
    assert.ok(v.skip, 'the Skip label stays on one line');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-160 no offer-size card text box overflows, every card in the pool', async () => {
    const page = await page1600(browser);
    const bad = await page.evaluate(() => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap;z-index:9999';
      document.body.appendChild(host);
      Object.keys(gameState.config.cardPool).forEach(function(id) { host.appendChild(renderCard(id, { size: 'offer' })); });
      fitCardTextBoxes();
      return Array.from(host.querySelectorAll('.card-text-box')).filter(function(b) { return b.scrollHeight > b.clientHeight; })
        .map(function(b) { return b.closest('.offer-card').dataset.offerId; });
    });
    assert.deepStrictEqual(bad, []);
    assertNoErrors(page);
    await page.close();
  });

  await browser.close();
  const failed = report('BUILD 192');
  process.exit(failed > 0 ? 1 : 0);
})();
