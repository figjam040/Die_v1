// ============================================================
// TESTS/BUILD145.TEST.JS
// Standing regression suite for the layout pass: the fight screen's four
// bands (item 4), the Load/Strengthen picker's own horizontal die (item
// 5), the map's square nodes and preview text (item 6), plus the titles
// every square, status icon and hand card must carry and the full element
// id inventory the previous build shipped. Same shape as
// tests/build144.test.js: plain Node script, playwright launched
// directly, node:assert. Run: node tests/build145.test.js
// ============================================================

const { chromium } = require('playwright');
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

// Every element id present in index.html at the previous build (head
// d5d52bd) — `git show d5d52bd:index.html | grep -oE 'id="[^"]+"'`.
const PREVIOUS_BUILD_IDS = [
  'actStamp', 'buildStamp', 'buildStampNumber', 'cardRewardPanel', 'copyRunRecordBtn',
  'devApplyPoisonBtn', 'devBeginRollBtn', 'devChrome', 'devChromeToggleBtn', 'devClearFaceBtn',
  'devFaceInput', 'devIntentBreakInput', 'devIntentKindSelect', 'devIntentMaxInput',
  'devIntentMinInput', 'devIntentReleaseInput', 'devIntentStacksInput', 'devLoadAllBtn',
  'devLoadModBtn', 'devModLoader', 'devModSelect', 'devMuteAudioCheckbox', 'devNextPhaseBtn',
  'devPauseBeforeRollCheckbox', 'devPauseControl', 'devPoisonApplier', 'devPoisonInput',
  'devPoisonTargetSelect', 'devRestartFightBtn', 'devSetIntent', 'devSetIntentBtn',
  'devSetTestDieBtn', 'devSkipToCardRewardBtn', 'devSkipToDieActionBtn', 'devStepControl',
  'devTestDie', 'devTestDieBuffSelect', 'devTestDieSizeSelect', 'dieActionPanel', 'endTurnBtn',
  'enemyActiveValue', 'enemyBuffsValue', 'enemyDieList', 'enemyHpValue', 'enemyIntentLabel',
  'enemyIntentValue', 'enemyNameLine', 'enemyNameValue', 'enemyPanel', 'enemyPanelTitle',
  'enemyPoisonValue', 'enemyReadLine', 'enemyReadValue', 'enemyWrathLine', 'enemyWrathValue',
  'fightScreen', 'handRow', 'inspector', 'inspectorContent', 'inspectorToggleBtn', 'log',
  'logToggleBtn', 'mapScreen', 'phaseBadge', 'playerBlockValue', 'playerDebuffsValue',
  'playerDeckValue', 'playerDieList', 'playerDiscardValue', 'playerDrainLine', 'playerDrainValue',
  'playerHpValue', 'playerPanel', 'playerSoulValue', 'registryInspector',
  'registryInspectorContent', 'registryInspectorToggleBtn', 'resultBanner', 'riteScreenPanel',
  'rollHero', 'rollResultLabel', 'rollResultNumber', 'roundValue', 'startGameBtn'
];

const INTENT_KIND_WORDS = ['ATTACK', 'CHARGE', 'RELEASE', 'AFFLICT', 'BROKEN'];

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM 4 — the fight screen's four bands
  // ---------------------------------------------------------------

  await runTest('Item 4: #playerDieList holds exactly 20 .face-btn squares, face 1 leftmost and face 20 rightmost', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#playerDieList .face-btn'));
      const byLeft = btns.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      return {
        count: btns.length,
        leftMost: byLeft[0].textContent,
        rightMost: byLeft[byLeft.length - 1].textContent
      };
    });
    assert.strictEqual(v.count, 20, 'expected exactly 20 face squares, got ' + v.count);
    assert.strictEqual(v.leftMost, '1', 'the leftmost square must read 1');
    assert.strictEqual(v.rightMost, '20', 'the rightmost square must read 20');
    await page.close();
  });

  await runTest('Item 4: the face squares are square and each carries its own caption', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const btn = document.querySelector('#playerDieList .face-btn');
      const r = btn.getBoundingClientRect();
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        captions: document.querySelectorAll('#playerDieList .die-face-caption').length
      };
    });
    assert.strictEqual(v.w, v.h, 'a face square must be as tall as it is wide, got ' + v.w + 'x' + v.h);
    assert.strictEqual(v.captions, 20, 'every face must carry a caption under its square');
    await page.close();
  });

  await runTest('Item 4: #playerDieIcon and #enemyDieIcon both exist and hold an outline', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => ({
      player: !!document.getElementById('playerDieIcon'),
      enemy: !!document.getElementById('enemyDieIcon'),
      playerSvgs: document.querySelectorAll('#playerDieIcon svg').length,
      // The opening enemy carries no die (D-29) — an empty outline, never a fake die.
      enemyHasDie: gameState.enemy.hasDie,
      enemyMark: document.querySelectorAll('#enemyDieIcon svg, #enemyDieIcon .die-icon-empty').length
    }));
    assert.strictEqual(v.player, true, '#playerDieIcon must exist');
    assert.strictEqual(v.enemy, true, '#enemyDieIcon must exist');
    assert.strictEqual(v.playerSvgs, 1, 'the player die icon must hold one inline SVG');
    assert.strictEqual(v.enemyMark, 1, 'the enemy die icon must hold either an SVG or an empty outline');
    await page.close();
  });

  await runTest('Item 4: the enemy die icon follows the enemy die size (d20 for the boss, d12 for a 12-face test die)', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    let text = await page.evaluate(() => document.getElementById('enemyDieIcon').textContent);
    assert.ok(text.indexOf('d20') !== -1, 'the boss die icon must name d20, got: ' + text);
    await page.evaluate(() => { devSetTestDie(12, 'enemy_buff_wrath'); refreshInspector(); });
    text = await page.evaluate(() => document.getElementById('enemyDieIcon').textContent);
    assert.ok(text.indexOf('d12') !== -1, 'a 12-face test die must read d12, got: ' + text);
    await page.close();
  });

  await runTest('Item 4: the first hand card is taller than it is wide', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const r = document.querySelector('#handRow .hand-card-el').getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    assert.ok(v.h > v.w, 'a hand card must be portrait, got ' + v.w + 'x' + v.h);
    await page.close();
  });

  await runTest('Item 4: the fight screen fits 1600 by 900 without a scrollbar', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = false; });
    await enterOpeningFight(page);
    const v = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight
    }));
    assert.ok(v.scrollHeight <= v.innerHeight, 'scrollHeight ' + v.scrollHeight + ' must be at most innerHeight ' + v.innerHeight);
    await page.close();
  });

  await runTest('Item 4: every element id from the previous build still exists', async () => {
    const page = await freshPage(browser);
    const missing = await page.evaluate((ids) => ids.filter(id => !document.getElementById(id)), PREVIOUS_BUILD_IDS);
    assert.deepStrictEqual(missing, [], 'these ids are missing: ' + missing.join(', '));
    await page.close();
  });

  await runTest('Item 4: #enemyBuffsValue names exactly as many buffs as the enemy die has loaded faces', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const v = await page.evaluate(() => {
      const text = document.getElementById('enemyBuffsValue').textContent;
      return {
        hasDie: gameState.enemy.hasDie,
        loaded: gameState.enemy.die.faces.filter(f => f.modId !== null).length,
        named: text === '—' ? 0 : text.split(', ').length,
        text: text
      };
    });
    assert.strictEqual(v.hasDie, true, 'the boss must carry a die for this assertion to mean anything');
    assert.strictEqual(v.named, v.loaded, 'expected ' + v.loaded + ' buff names, got "' + v.text + '"');
    await page.close();
  });

  await runTest("Item 4: #enemyIntentIcon's aria-label is one of ATTACK, CHARGE, RELEASE, AFFLICT, BROKEN", async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const label = await page.evaluate(() => document.getElementById('enemyIntentIcon').getAttribute('aria-label'));
    assert.ok(INTENT_KIND_WORDS.indexOf(label) !== -1, 'aria-label must be an intent kind word, got: ' + label);
    await page.close();
  });

  await runTest('Item 4: a Charge wind-up shows its break counter in #enemyIntentLabel and its release value alone in #enemyIntentValue', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      updateEnemy({ pattern: [{ kind: 'charge', release: 27, breakAt: 15 }], patternIndex: 0, forcedNextIntent: null });
      runPhase('START_OF_TURN');
      // BUILD 147 nests a .hover-tip child inside #enemyIntentValue, so
      // textContent alone now includes that sentence too — read only the
      // element's own direct text nodes, the visible number.
      const visibleValue = Array.from(document.getElementById('enemyIntentValue').childNodes)
        .filter((n) => n.nodeType === 3).map((n) => n.textContent).join('');
      return {
        value: visibleValue,
        label: document.getElementById('enemyIntentLabel').textContent,
        aria: document.getElementById('enemyIntentIcon').getAttribute('aria-label')
      };
    });
    assert.strictEqual(v.value, '27', '#enemyIntentValue must carry the release number alone, got: ' + v.value);
    assert.ok(/^break \d+ \/ 15$/.test(v.label), '#enemyIntentLabel must read "break N / 15", got: ' + v.label);
    assert.strictEqual(v.aria, 'CHARGE');
    await page.close();
  });

  await runTest('Item 4: #goldValue exists and #artifactRow holds eight slots', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      gold: document.getElementById('goldValue') ? document.getElementById('goldValue').textContent : null,
      artifacts: document.getElementById('artifactRow') ? document.getElementById('artifactRow').children.length : -1
    }));
    assert.ok(v.gold && v.gold.indexOf('GOLD') === 0, '#goldValue must read GOLD then the value, got: ' + v.gold);
    assert.strictEqual(v.artifacts, 8, '#artifactRow must hold eight slots');
    await page.close();
  });

  await runTest('Item 4: #playerArtBox and #enemyArtBox exist, the enemy box naming the live enemy', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // BUILD 146's art loading gives each box an img plus a text label
    // child (#playerArtLabel/#enemyArtLabel) instead of raw box text —
    // read the label directly rather than the box's whole textContent.
    const v = await page.evaluate(() => ({
      player: document.getElementById('playerArtLabel').textContent,
      enemy: document.getElementById('enemyArtLabel').textContent,
      name: gameState.enemy.name
    }));
    assert.ok(v.player.indexOf('ART') !== -1, '#playerArtBox must read as an art placeholder, got: ' + v.player);
    assert.ok(v.enemy.indexOf(v.name.toUpperCase()) === 0, '#enemyArtBox must name the enemy, got: ' + v.enemy);
    await page.close();
  });

  await runTest('Item 4: the roll stage names the mod and its run trigger count after a real trigger', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Face 10 carries the Ordained's own anchor, Consecrate, on a fresh die.
    await page.evaluate(() => { forcePlayerRoll(10); });
    await page.waitForFunction(() => gameState.turn.rolledFaceNumber === 10);
    const v = await page.evaluate(() => ({
      hero: document.getElementById('rollHero').textContent.replace(/\s+/g, ' ').trim(),
      // BUILD 161: the icon's own hover tip is now a sibling span inside
      // it too, so read the rolled number's own element, not the whole
      // icon's textContent.
      icon: (document.querySelector('#playerDieIcon .die-icon-number-text') || {}).textContent || ''
    }));
    assert.ok(v.hero.indexOf('CONSECRATE') !== -1, 'the roll stage must name the mod, got: ' + v.hero);
    assert.ok(v.hero.indexOf('↻') !== -1, 'the roll stage must show the run trigger count, got: ' + v.hero);
    // D-105 (BUILD 161): the strip is name-only now, no '+N' value line.
    assert.ok(v.hero.indexOf('+') === -1, 'the roll stage must carry no +N value, got: ' + v.hero);
    assert.strictEqual(v.icon, '10', 'the player die icon must show the rolled face number');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 5 — panels over the play area
  // ---------------------------------------------------------------

  await runTest('Item 5: Skip to Die Action opens a panel holding a 20-square row, every square titled', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.click('#devChromeToggleBtn');
    await page.click('#devSkipToDieActionBtn');
    await page.waitForFunction(() => dieActionStep !== null);
    const v = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#playerDieList .face-btn'));
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const byLeft = btns.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      return {
        visible: document.getElementById('dieActionPanel').offsetParent !== null,
        count: btns.length,
        // BUILD 161 (D-104/KI-41): the hover tip lives on the row now, not
        // the square's own native title.
        untitled: rows.filter(r => !(r.querySelector('.hover-tip') || {}).textContent).length,
        leftMost: byLeft.length ? byLeft[0].textContent : null,
        rightMost: byLeft.length ? byLeft[byLeft.length - 1].textContent : null
      };
    });
    assert.strictEqual(v.visible, true, '#dieActionPanel must be visible');
    assert.strictEqual(v.count, 20, 'the picker must show all twenty squares, got ' + v.count);
    assert.strictEqual(v.untitled, 0, v.untitled + ' square(s) in the picker carry no hover tip');
    assert.strictEqual(v.leftMost, '1', 'the picker must read face 1 at the left');
    assert.strictEqual(v.rightMost, '20', 'the picker must read face 20 at the right');
    await page.close();
  });

  await runTest('Item 5: the Strengthen picker still marks eligible faces and keeps its hover text', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { openDieActionScreen(); dieActionChooseStrengthen(); });
    const v = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      return {
        pickable: rows.filter(r => r.classList.contains('die-row-pickable')).length,
        tips: rows.filter(r => r.querySelector('.hover-tip')).length
      };
    });
    // A fresh die: face 20 plus the one loaded anchor face are strengthenable.
    assert.strictEqual(v.pickable, 2, 'expected two strengthenable faces on a fresh die, got ' + v.pickable);
    assert.ok(v.tips >= 2, 'the picker rows must keep their hover text');
    await page.close();
  });

  await runTest('Item 5: the card reward and rite panels still open and carry their ids', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.click('#devChromeToggleBtn');
    await page.click('#devSkipToCardRewardBtn');
    await page.waitForFunction(() => cardRewardStep !== null);
    let visible = await page.evaluate(() => document.getElementById('cardRewardPanel').offsetParent !== null);
    assert.strictEqual(visible, true, '#cardRewardPanel must be visible once opened');
    await page.evaluate(() => { cardRewardStep = null; openRiteScreen(); });
    visible = await page.evaluate(() => document.getElementById('riteScreenPanel').offsetParent !== null);
    assert.strictEqual(visible, true, '#riteScreenPanel must be visible once opened');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM 6 — the map screen
  // ---------------------------------------------------------------

  await runTest('Item 6: after New Run the map shows sixteen lane nodes plus Start, the opening Fight and Boss', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // D-98 (BUILD 156): a map node's own label text is its first child
      // (set via textContent before any hover-tip span is appended) — read
      // that, not the button's full textContent, which now also carries
      // the Elite/Boss node's own hover summary text.
      const labels = Array.from(document.querySelectorAll('#mapScreen .map-node')).map(n => n.childNodes[0] ? n.childNodes[0].textContent : n.textContent);
      return {
        total: labels.length,
        lane: gameState.run.act.upper.length + gameState.run.act.lower.length,
        hasStart: labels.indexOf('Start') !== -1,
        hasBoss: labels.indexOf('Boss') !== -1,
        opening: gameState.run.act.opening.label
      };
    });
    assert.strictEqual(v.lane, 16, 'both lanes together must hold sixteen slots');
    assert.strictEqual(v.total, 19, 'the map must draw sixteen lane nodes plus Start, the opening fight and Boss');
    assert.strictEqual(v.hasStart, true, 'the map must draw a Start node');
    assert.strictEqual(v.hasBoss, true, 'the map must draw a Boss node');
    assert.strictEqual(v.opening, 'Fight', "the opening slot's own label must read Fight");
    await page.close();
  });

  await runTest('Item 6: map nodes are square and outlined 2px', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const node = document.querySelector('#mapScreen .map-node');
      const cs = getComputedStyle(node);
      const r = node.getBoundingClientRect();
      // BUILD 146's window-scaling zoom (applyScale(), rendering.js) is a
      // known Chromium quirk for the legacy `zoom` property: descendant
      // border-width readings via getComputedStyle come back divided by
      // the active zoom, even though the border itself renders at its
      // declared size — compensate before comparing.
      const zoom = parseFloat(document.documentElement.style.zoom) || 1;
      return { w: Math.round(r.width), h: Math.round(r.height), border: parseFloat(cs.borderTopWidth) * zoom, font: cs.fontSize };
    });
    assert.strictEqual(v.w, v.h, 'a map node must be square, got ' + v.w + 'x' + v.h);
    // D-98 (BUILD 156) nests a second zoom (.map-composition) inside the
    // page's own applyScale() zoom — the two don't compound linearly under
    // getComputedStyle's own quirky border-width reporting, so the
    // tolerance here is widened rather than chasing an exact compensation
    // formula for a value that already renders correctly on screen.
    assert.ok(Math.abs(v.border - 2) < 0.2, 'a map node must carry a 2px outline, got ' + v.border + 'px');
    // D-98 (BUILD 156): node labels dropped one size, 11px -> 10px, as
    // part of the map's own 1.5x-larger redraw.
    assert.strictEqual(v.font, '10px', 'a map node label must render at 10px, got ' + v.font);
    await page.close();
  });

  await runTest('Item 6: the elite and boss nodes carry a hover summary naming their own die definition', async () => {
    // D-98 (BUILD 156): ELITE PREVIEW/ELITE DIE and BOSS PREVIEW/BOSS DIE
    // no longer draw inline — the same information (name, HP, pattern,
    // loaded faces) is now that node's own hover-tip text.
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      function loadedNumbers(faces) {
        return faces.filter(f => f.modId !== null).map(f => f.number).sort((a, b) => a - b);
      }
      const eliteNode = Array.from(document.querySelectorAll('#mapScreen .map-node'))
        .find(n => n.childNodes[0] && n.childNodes[0].textContent === 'Elite');
      const bossNode = document.querySelector('#mapScreen .map-node-boss');
      const elite = gameState.run.act.upper.find(s => s.label === 'Elite').enemy;
      const boss = gameState.run.act.boss.enemy;
      return {
        eliteTip: eliteNode.querySelector('.hover-tip').textContent,
        bossTip: bossNode.querySelector('.hover-tip').textContent,
        eliteDefined: loadedNumbers(elite.die.faces),
        bossDefined: loadedNumbers(boss.die.faces),
        eliteHp: elite.hp,
        bossHp: boss.hp
      };
    });
    assert.ok(v.eliteTip.indexOf('HP ' + v.eliteHp) !== -1, 'the Elite hover must name its HP');
    assert.ok(v.bossTip.indexOf('HP ' + v.bossHp) !== -1, 'the Boss hover must name its HP');
    assert.ok(v.bossDefined.length > 0, 'the boss die must carry loaded faces for this assertion to mean anything');
    v.eliteDefined.forEach(n => assert.ok(v.eliteTip.indexOf(' ' + n) !== -1 || v.eliteTip.indexOf(' ' + n + ',') !== -1, 'Elite hover must name loaded face ' + n));
    v.bossDefined.forEach(n => assert.ok(v.bossTip.indexOf(' ' + n) !== -1 || v.bossTip.indexOf(' ' + n + ',') !== -1, 'Boss hover must name loaded face ' + n));
    await page.close();
  });

  // ---------------------------------------------------------------
  // TITLES — every square, status icon and hand card reads on hover
  // ---------------------------------------------------------------

  await runTest('Titles: every .face-btn on the fight screen has a non-empty hover tip naming its weight', async () => {
    // BUILD 161 (D-104/KI-41): the hover tip lives on the row, not the square.
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
      const titles = rows.map(r => (r.querySelector('.hover-tip') || {}).textContent || '');
      return {
        count: titles.length,
        untitled: titles.filter(t => !t).length,
        withoutWeight: titles.filter(t => t.indexOf('weight ') === -1).length
      };
    });
    assert.strictEqual(v.untitled, 0, v.untitled + ' face square(s) carry no hover tip');
    assert.strictEqual(v.withoutWeight, 0, v.withoutWeight + ' face square hover tip(s) do not name a weight');
    await page.close();
  });

  await runTest('Titles: a loaded face hover tip names its mod, weight and run trigger count', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const title = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'blight', modData: { triggerCount: 2 } });
      updateDie({ faces: newFaces });
      const btn = Array.from(document.querySelectorAll('#playerDieList .face-btn')).find(b => b.textContent === '5');
      return btn.closest('.die-row').querySelector('.hover-tip').textContent;
    });
    assert.ok(title.indexOf('Blight') === 0, 'the hover tip must lead with the mod name, got: ' + title);
    assert.ok(title.indexOf('weight 1') !== -1, 'the hover tip must name the weight, got: ' + title);
    assert.ok(title.indexOf('triggered 2 times this run') !== -1, 'the hover tip must name the run trigger count, got: ' + title);
    await page.close();
  });

  await runTest('Titles: every status icon shown carries a non-empty hover tip', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      updatePlayer({ poisonStacks: 4, penitenceActive: true, penitenceTurnsRemaining: 3, drainNextRound: 1 });
      updateEnemy({ poisonStacks: 3, wrath: 2 });
      refreshInspector();
      const icons = Array.from(document.querySelectorAll('#playerStatusRow .status-icon, #enemyStatusRow .status-icon'));
      return {
        count: icons.length,
        untitled: icons.filter(i => !(i.querySelector('.hover-tip') || {}).textContent).length,
        texts: icons.map(i => i.firstChild ? i.firstChild.textContent : '')
      };
    });
    assert.ok(v.count >= 5, 'expected at least five status icons, got ' + v.count + ': ' + v.texts.join(' '));
    assert.strictEqual(v.untitled, 0, v.untitled + ' status icon(s) carry no hover tip');
    await page.close();
  });

  await runTest('Titles: every hand card has a non-empty hover tip', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#handRow .hand-card-el'));
      return { count: cards.length, untitled: cards.filter(c => !(c.querySelector('.hover-tip') || {}).textContent).length };
    });
    assert.ok(v.count > 0, 'expected at least one card in hand');
    assert.strictEqual(v.untitled, 0, v.untitled + ' hand card(s) carry no hover tip');
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build145 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
