// ============================================================
// TESTS/BUILD129.TEST.JS — BUILD 129
// Regression tests for BUILD 129, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build129.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 129 — checkpoint 3 tiers. Every offerable mod and card carries a
  // tier field; card rewards and Load offers each roll a tier per choice
  // off a per-slot split (fight/rite 65/30/5, elite 40/40/20, boss
  // 0/70/30); Consecrate and the three starters carry no tier and are
  // never offered.
  // ---------------------------------------------------------------

  await runTest('BUILD 129: every mod carries its checkpoint 3 tier', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tiers = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.mods).forEach(function(id) { out[id] = gameState.config.mods[id].tier || null; });
      return out;
    });
    assert.deepStrictEqual(tiers, {
      consecrate: null,
      smite: 'basic', sanctuary: 'basic', penance: 'basic', blight: 'basic', offering: 'basic', anthem: 'basic',
      vigil: 'uncommon', ordain: 'uncommon', zeal: 'uncommon', elevation: 'uncommon',
      virulence: 'rare', fervour: 'rare',
      // Checkpoint 3 tags/mods build — six new mods, added after prompt A's
      // tier map was written.
      largesse: 'basic', cope: 'basic', thurible: 'basic',
      tithe: 'uncommon', congregation: 'uncommon', anathema: 'uncommon',
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      magnificat: 'rare',
      // BUILD 133 — checkpoint 3, Bound engine.
      unison: 'basic', accord: 'basic', kinship: 'basic',
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      concord: 'uncommon', herald: 'rare',
      // BUILD 149 — the awe cluster.
      dread: 'basic', genuflect: 'uncommon'
    });
    await liveBrowser.close();
  });

  await runTest('BUILD 129: every reward-pool card carries its checkpoint 3 tier', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const tiers = await page.evaluate(() => {
      const out = {};
      Object.keys(gameState.config.cardPool).forEach(function(id) { out[id] = gameState.config.cardPool[id].tier || null; });
      return out;
    });
    assert.deepStrictEqual(tiers, {
      rebuke: 'basic', censure: 'basic', vestment: 'basic', litany: 'basic', scripture: 'basic',
      interdict: 'basic', orison: 'basic', censer: 'basic', purge: 'basic',
      judgement: 'uncommon', reckoning: 'uncommon', communion: 'uncommon', rapture: 'uncommon',
      covenant: 'uncommon', retribution: 'uncommon',
      // BUILD 131 — checkpoint 3 cards, sixteen new cards.
      chastise: 'basic', cloister: 'basic', psalm: 'basic', reliquary: 'basic',
      vacancy: 'rare', lauds: 'basic', hosanna: 'basic', tabernacle: 'basic',
      tenet: 'uncommon', gradual: 'uncommon', myrrh: 'uncommon', gloria: 'uncommon',
      vindication: 'rare', exequy: 'rare', oblation: 'rare', jubilee: 'rare',
      // BUILD 132 — checkpoint 3, trigger a face outside a roll (prompt D).
      threnody: 'uncommon', reverberation: 'rare',
      // BUILD 134 — checkpoint 3, the remaining Bound pieces.
      kyrie: 'basic', canticle: 'uncommon', novena: 'rare',
      // BUILD 149 — the awe cluster.
      kneel: 'basic', compline: 'basic', tremendum: 'uncommon', mysterium: 'rare',
      // BUILD 150 — Bulwark.
      bulwark: 'basic',
      // BUILD 153 — seven cards beside the artifact pass.
      venom: 'basic', ballast: 'basic', cadence: 'basic', watchword: 'basic',
      refrain: 'uncommon', second_sight: 'uncommon', blight_weight: 'uncommon'
    });
    await liveBrowser.close();
  });

  await runTest('BUILD 129: Consecrate, Strike, Ward and Rite are never offered', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const starterTiers = ['strike', 'ward', 'rite'].map(function(id) { return gameState.config.cards[id].tier || null; });
      const consecrateTier = gameState.config.mods['consecrate'].tier || null;
      const cardPoolHasStarters = ['strike', 'ward', 'rite'].some(function(id) {
        return Object.prototype.hasOwnProperty.call(gameState.config.cardPool, id);
      });
      let sawConsecrate = false;
      for (let i = 0; i < 500; i++) {
        dieActionChooseLoad();
        if (dieActionMods.indexOf('consecrate') !== -1) sawConsecrate = true;
      }
      let sawStarter = false;
      for (let i = 0; i < 500; i++) {
        openCardRewardScreen();
        if (cardRewardOptions.some(function(id) { return id === 'strike' || id === 'ward' || id === 'rite'; })) sawStarter = true;
      }
      return { starterTiers: starterTiers, consecrateTier: consecrateTier, cardPoolHasStarters: cardPoolHasStarters, sawConsecrate: sawConsecrate, sawStarter: sawStarter };
    });
    assert.deepStrictEqual(v.starterTiers, [null, null, null], 'Strike/Ward/Rite must carry no tier');
    assert.strictEqual(v.consecrateTier, null, 'Consecrate must carry no tier');
    assert.strictEqual(v.cardPoolHasStarters, false, 'the reward pool must never contain a starter card');
    assert.strictEqual(v.sawConsecrate, false, '500 Load offers must never include Consecrate');
    assert.strictEqual(v.sawStarter, false, '500 card rewards must never include a starter');
    await liveBrowser.close();
  });

  await runTest('BUILD 129: a seeded 10,000-choice fight sample lands within 2 points of 65/30/5 (fallbacks counted separately)', async () => {
    const liveBrowser = await chromium.launch();
    const page = await liveBrowser.newPage();
    page.on('dialog', function(d) { d.accept(); });
    await page.addInitScript(function(seed) {
      let s = seed >>> 0;
      if (s === 0) s = 0x9e3779b9;
      function mulberry32() {
        s |= 0;
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      }
      Math.random = mulberry32;
    }, 12345);
    await page.goto(FILE_URL);
    await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
    const v = await page.evaluate(() => {
      const pool = Object.keys(gameState.config.mods)
        .filter(function(id) { return gameState.config.mods[id].tier != null; })
        .map(function(id) { return { id: id, tier: gameState.config.mods[id].tier }; });
      const tally = { basic: 0, uncommon: 0, rare: 0, mythic: 0, void: 0 };
      let fallbacks = 0;
      let rolls = 0;
      for (let i = 0; i < 10000; i++) {
        const offer = pickTieredOffer(pool, GAME_CONFIG.TIER_SPLIT.fight, 3);
        offer.forEach(function(o) {
          tally[o.rolledTier] += 1;
          rolls += 1;
          if (o.fallback) fallbacks += 1;
        });
      }
      return { tally: tally, rolls: rolls, fallbacks: fallbacks };
    });
    assert.strictEqual(v.tally.mythic + v.tally.void, 0, 'mythic and void carry weight 0 and are never rolled (D-111)');
    const pctCommon = v.tally.basic / v.rolls;
    const pctUncommon = v.tally.uncommon / v.rolls;
    const pctRare = v.tally.rare / v.rolls;
    assert.ok(Math.abs(pctCommon - 0.65) <= 0.02, 'common ' + pctCommon.toFixed(4) + ' not within 2 points of 0.65');
    assert.ok(Math.abs(pctUncommon - 0.30) <= 0.02, 'uncommon ' + pctUncommon.toFixed(4) + ' not within 2 points of 0.30');
    assert.ok(Math.abs(pctRare - 0.05) <= 0.02, 'rare ' + pctRare.toFixed(4) + ' not within 2 points of 0.05');
    console.log('  [BUILD 129] fight split sample: ' + v.rolls + ' rolls (common ' + pctCommon.toFixed(4) + ', uncommon ' + pctUncommon.toFixed(4) + ', rare ' + pctRare.toFixed(4) + '), ' + v.fallbacks + ' fallback substitution(s) counted separately (not folded into the rolled-tier percentages above)');
    await liveBrowser.close();
  });

  await runTest('BUILD 129: an offer never repeats a piece', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    const v = await page.evaluate(() => {
      const modPool = Object.keys(gameState.config.mods)
        .filter(function(id) { return gameState.config.mods[id].tier != null; })
        .map(function(id) { return { id: id, tier: gameState.config.mods[id].tier }; });
      const cardPoolEntries = Object.keys(gameState.config.cardPool)
        .map(function(id) { return { id: id, tier: gameState.config.cardPool[id].tier }; });
      const splits = [GAME_CONFIG.TIER_SPLIT.fight, GAME_CONFIG.TIER_SPLIT.elite, GAME_CONFIG.TIER_SPLIT.boss];
      let dupes = 0;
      let offersChecked = 0;
      for (let i = 0; i < 2000; i++) {
        splits.forEach(function(split) {
          [modPool, cardPoolEntries].forEach(function(pool) {
            const offer = pickTieredOffer(pool, split, 3).map(function(o) { return o.id; });
            offersChecked += 1;
            if (new Set(offer).size !== offer.length) dupes += 1;
          });
        });
      }
      return { dupes: dupes, offersChecked: offersChecked };
    });
    assert.strictEqual(v.dupes, 0, 'no offer, across ' + v.offersChecked + ' samples over both pools and all three splits, may repeat a piece: ' + v.dupes + ' duplicate offer(s) found');
    await liveBrowser.close();
  });

  process.exit(report('build129') > 0 ? 1 : 0);
})();
