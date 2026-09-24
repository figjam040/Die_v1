// ============================================================
// TESTS/BUILD161.TEST.JS
// Standing regression suite for BUILD 161: KI-39 (Purify's button text),
// KI-40 (The Font centred), D-104/KI-41 (no native title anywhere, the
// enemy panel's Loaded buffs/Active this turn move to a hover tip),
// D-105 (the roll strip shows the name only) and D-106 (a clicked offer
// card/die frame/artifact gets a gold outline, its siblings dim). Same
// shape as tests/build151.test.js: plain Node script, playwright launched
// directly, node:assert.
// Run: node tests/build161.test.js
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

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — KI-39: Purify in title case
  // ---------------------------------------------------------------

  await runTest('KI-39: the Purify button reads Purify, not PURIFY', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[4] = Object.assign({}, newFaces[4], { modId: 'smite' });
      updateDie({ faces: newFaces });
      updateEnemy({ hp: 0 });
      checkWinNow();
    });
    await page.waitForFunction(() => dieActionStep === 'choose');
    const text = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#dieActionPanel button')).find(b => b.textContent.indexOf('Purify') === 0);
      return btn ? btn.textContent.slice(0, 'Purify'.length) : null;
    });
    assert.strictEqual(text, 'Purify', 'expected the button text to read Purify, got: ' + text);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — KI-40: The Font centred
  // ---------------------------------------------------------------

  await runTest('KI-40: #eventScreenPanel sits centred in the play column when The Font is open', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('lower', 3); });
    await page.waitForFunction(() => eventStep === 'open');
    const v = await page.evaluate(() => {
      const panel = document.getElementById('eventScreenPanel');
      const col = document.querySelector('.left-col') || document.querySelector('.app');
      const pRect = panel.getBoundingClientRect();
      const cRect = col.getBoundingClientRect();
      return {
        panelCentreX: pRect.left + pRect.width / 2,
        panelCentreY: pRect.top + pRect.height / 2,
        colCentreX: cRect.left + cRect.width / 2,
        colCentreY: cRect.top + cRect.height / 2
      };
    });
    assert.ok(Math.abs(v.panelCentreX - v.colCentreX) <= 8, 'panel X centre off by ' + Math.abs(v.panelCentreX - v.colCentreX) + 'px');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — D-104/KI-41: no native title anywhere; enemy hover tip
  // ---------------------------------------------------------------

  await runTest('D-104/KI-41: no element on the fight screen, map screen or an open layer has a non-empty title attribute', async () => {
    const page = await freshPage(browser);
    const mapTitled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#mapScreen [title]')).filter(el => el.getAttribute('title')).length
    );
    assert.strictEqual(mapTitled, 0, mapTitled + ' element(s) on the map screen carry a title attribute');

    await enterOpeningFight(page);
    let fightTitled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#fightScreen [title]')).filter(el => el.getAttribute('title')).length
    );
    assert.strictEqual(fightTitled, 0, fightTitled + ' element(s) on the fight screen carry a title attribute');

    // Open every reward layer in turn and check again.
    await page.evaluate(() => { openDieActionScreen(); dieActionChooseLoad(); });
    let layerTitled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#dieActionPanel [title]')).filter(el => el.getAttribute('title')).length
    );
    assert.strictEqual(layerTitled, 0, layerTitled + ' element(s) in the Load offer carry a title attribute');

    await page.evaluate(() => { dieActionChooseSkip(); openCardRewardScreen(); });
    layerTitled = await page.evaluate(() =>
      Array.from(document.querySelectorAll('#cardRewardPanel [title]')).filter(el => el.getAttribute('title')).length
    );
    assert.strictEqual(layerTitled, 0, layerTitled + ' element(s) in the card reward panel carry a title attribute');
    await page.close();
  });

  await runTest('D-104/KI-41: hovering the enemy art on a boss fight lists every loaded buff face; the panel prints no Loaded buffs text', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('boss', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    const v = await page.evaluate(() => {
      const loaded = gameState.enemy.die.faces
        .filter(f => f.modId !== null)
        .map(f => modDisplayName(f.modId) + ' ' + f.number);
      const tip = document.querySelector('#enemyArtBox .hover-tip');
      const panelText = document.getElementById('enemyPanel').innerText || document.getElementById('enemyPanel').textContent;
      return { loaded: loaded, tipText: tip ? tip.textContent : '', panelText: panelText };
    });
    assert.ok(v.loaded.length > 0, 'the boss die must carry loaded faces for this assertion to mean anything');
    v.loaded.forEach(name => assert.ok(v.tipText.indexOf(name) !== -1, 'enemy art hover tip must name loaded buff "' + name + '", got: ' + v.tipText));
    assert.ok(v.tipText.indexOf('Active this turn') !== -1, 'enemy art hover tip must also carry Active this turn, got: ' + v.tipText);
    assert.strictEqual(v.panelText.indexOf('Loaded buffs'), -1, 'the enemy panel must print no visible "Loaded buffs" text');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — D-105: the roll strip shows the name only
  // ---------------------------------------------------------------

  await runTest('D-105: a forced blank roll reads BLANK with no +, a forced Nat 1 reads PENITENCE', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { forcePlayerRoll(2); }); // face 2 is blank on a fresh die
    await page.waitForFunction(() => gameState.turn.rollOutcome === 'blank');
    const hero1 = await page.evaluate(() => document.getElementById('rollHero').textContent);
    assert.ok(hero1.indexOf('BLANK') !== -1, 'expected the roll strip to read BLANK, got: ' + hero1);
    assert.strictEqual(hero1.indexOf('+'), -1, 'the roll strip must carry no +, got: ' + hero1);
    await page.close();

    const page2 = await freshPage(browser);
    await enterOpeningFight(page2);
    await page2.evaluate(() => { forcePlayerRoll(1); }); // face 1 is always NAT_ONE
    await page2.waitForFunction(() => gameState.turn.rollOutcome === 'nat_one');
    const hero2 = await page2.evaluate(() => document.getElementById('rollHero').textContent);
    assert.ok(hero2.indexOf('PENITENCE') !== -1, 'expected the roll strip to read PENITENCE, got: ' + hero2);
    await page2.close();
  });

  // ---------------------------------------------------------------
  // ITEM E — D-106: a clicked offer card gets a gold outline
  // ---------------------------------------------------------------

  await runTest('D-106: clicking an offer card gives it a gold outline and dims its siblings', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => { openCardRewardScreen(); });
    await page.waitForFunction(() => cardRewardStep === 'choose');
    await page.click('#cardRewardPanel .offer-card');
    const v = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('#cardRewardPanel .offer-card'));
      return {
        pickedCount: cards.filter(c => c.classList.contains('offer-card-picked')).length,
        dimmedCount: cards.filter(c => c.classList.contains('offer-card-dimmed')).length,
        dimmedOpacity: cards.filter(c => c.classList.contains('offer-card-dimmed')).map(c => parseFloat(getComputedStyle(c).opacity))
      };
    });
    assert.strictEqual(v.pickedCount, 1, 'exactly one card must carry the picked outline, got ' + v.pickedCount);
    assert.ok(v.dimmedCount >= 1, 'at least one sibling must dim, got ' + v.dimmedCount);
    v.dimmedOpacity.forEach(o => assert.ok(o < 1, 'a dimmed sibling must read below full opacity, got ' + o));
    await page.close();
  });

  const failed = results.filter(r => !r.pass);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' build161 tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(f => console.log('  - ' + f.name + ': ' + f.error));
  }
  await browser.close();
  process.exit(failed.length > 0 ? 1 : 0);
})();
