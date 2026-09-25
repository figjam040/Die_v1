// ============================================================
// TESTS/BUILD136.TEST.JS — BUILD 136
// Regression tests for BUILD 136, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build136.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {

  // ---------------------------------------------------------------
  // BUILD 136 — on-screen text for every checkpoint 3 piece, plus New Run
  // working while a fight-won panel is open.
  // ---------------------------------------------------------------

  // BUILD 136: the shared `browser` was already closed above (line 936) —
  // every test from here on launches and closes its own browser, same
  // pattern the BUILD 135 tests just above already use.

  await runTest('BUILD 136: every reward-pool card has non-empty on-screen text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const poolIds = Object.keys(gameState.config.cardPool).filter(function(id) {
        return gameState.config.cardPool[id].tier != null;
      });
      const missing = poolIds.filter(function(id) { return !CARD_EFFECT_TEXT[id]; });
      return { total: poolIds.length, missing: missing };
    });
    assert.strictEqual(v.total, 48, 'expected forty-eight reward-pool cards');
    assert.deepStrictEqual(v.missing, [], 'every reward-pool card must have a CARD_EFFECT_TEXT entry: missing ' + JSON.stringify(v.missing));
    await liveBrowser.close();
  });

  await runTest('BUILD 136: every offerable mod has non-empty on-screen text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const offerableIds = Object.keys(gameState.config.mods).filter(function(id) {
        return gameState.config.mods[id].tier != null && DIE_ACTION_EXCLUDED_MOD_IDS.indexOf(id) === -1;
      });
      const missing = offerableIds.filter(function(id) { return !MOD_DESCRIPTION[id]; });
      return { total: offerableIds.length, missing: missing };
    });
    assert.ok(v.total > 0, 'expected at least one offerable mod');
    assert.deepStrictEqual(v.missing, [], 'every offerable mod must have a MOD_DESCRIPTION entry: missing ' + JSON.stringify(v.missing));
    await liveBrowser.close();
  });

  await runTest('BUILD 136: a new card in hand renders its text', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      updatePlayer({ hand: ['gloria'] });
      // D-112 (BUILD 169): the hand card is the one card; its text is .offer-card-text.
      const effectEl = document.querySelector('#handRow .offer-card-text');
      return effectEl ? effectEl.textContent : null;
    });
    assert.strictEqual(v, 'Deal 30 damage.', 'Gloria in hand must render its own hand text');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: the reward hover for a new card is not empty', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      cardRewardOptions = ['gloria'];
      cardRewardStep = 'choose';
      dieActionOrigin = 'reward';
      refreshInspector();
      // BUILD 154: the reward panel shows each card's effect text on the
      // card itself, and keeps it on hover as its own .hover-tip (BUILD
      // 161 replaced the native title tooltip, D-104/KI-41).
      const card = document.querySelector('#cardRewardPanel .offer-card');
      const text = card ? card.querySelector('.offer-card-text') : null;
      const tip = card ? card.querySelector('.hover-tip') : null;
      return { text: text ? text.textContent : null, title: tip ? tip.textContent : null };
    });
    assert.strictEqual(v.text, 'Deal 30 damage.', 'the reward text for a new card must not be empty');
    assert.ok(v.title && v.title.indexOf('Deal 30 damage.') !== -1, 'the reward hover for a new card must not be empty');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: New Run works while a fight-won panel (die action) is open', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { document.getElementById('devSkipToDieActionBtn').click(); });
    await page.waitForFunction(() => dieActionStep === 'choose');
    const before = await page.evaluate(() => document.getElementById('startGameBtn').disabled);
    await page.click('#startGameBtn');
    await page.waitForFunction(() => gameState.run.screen === 'map' && gameState.run.currentSlot === 'opening');
    const v = await page.evaluate(() => ({
      dieActionStep: dieActionStep,
      panelDisplay: document.getElementById('dieActionPanel').style.display,
      hp: gameState.player.hp
    }));
    assert.strictEqual(before, false, 'New Run must not be disabled while the die action panel is open');
    assert.strictEqual(v.dieActionStep, null, 'the open die action panel must be dismissed by New Run');
    assert.strictEqual(v.panelDisplay, 'none', 'the die action panel must no longer be shown after New Run');
    assert.strictEqual(v.hp, 70, 'a fresh New Run must land back at full player HP');
    await liveBrowser.close();
  });

  await runTest('BUILD 136: New Run works while a fight-won panel (card reward) is open', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    await page.evaluate(() => { document.getElementById('devSkipToCardRewardBtn').click(); });
    await page.waitForFunction(() => cardRewardStep === 'choose');
    const before = await page.evaluate(() => document.getElementById('startGameBtn').disabled);
    await page.click('#startGameBtn');
    await page.waitForFunction(() => gameState.run.screen === 'map' && gameState.run.currentSlot === 'opening');
    const v = await page.evaluate(() => ({
      cardRewardStep: cardRewardStep,
      panelDisplay: document.getElementById('cardRewardPanel').style.display
    }));
    assert.strictEqual(before, false, 'New Run must not be disabled while the card reward panel is open');
    assert.strictEqual(v.cardRewardStep, null, 'the open card reward panel must be dismissed by New Run');
    assert.strictEqual(v.panelDisplay, 'none', 'the card reward panel must no longer be shown after New Run');
    await liveBrowser.close();
  });

  process.exit(report('build136') > 0 ? 1 : 0);
})();
