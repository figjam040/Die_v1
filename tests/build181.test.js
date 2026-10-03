// Standing regression suite for BUILD 181: Halo gates Strengthen on face 20
// (D-132) and every artifact carries its own tier (D-133).
// Run: node tests/build181.test.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createRunner, freshPage } = require('./shared-constants');

const ROOT = path.resolve(__dirname, '..');
const HALO_TEXT = 'While you hold this, Strengthen may target face 20.';
const ELITE_OFFER_COUNT = 200;
const BOSS_OFFER_COUNT = 200;
const OFFER_SIZE = 3;
const FACE_TWENTY = 20;
const EXPECTED_TIERS = {
  basic: ['gilded_die', 'tithe_box', 'merchants_seal'],
  uncommon: ['bone_counter', 'alms', 'plague_bell', 'second_chance', 'hourglass', 'third_eye'],
  rare: ['tolling_bell', 'loaded_die', 'leaden_face', 'reliquary_chain', 'halo', 'rosary']
};
const EXPECTED_TIER_COUNTS = { basic: 3, uncommon: 6, rare: 6 };
const EXPECTED_ARTIFACT_COUNT = 15;

const { runTest, report } = createRunner();

const configSrc = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8').replace(/\r/g, '');
const configHeader = configSrc.slice(0, configSrc.indexOf('const GAME_CONFIG'));
const headerLines = function(prefix) {
  return configHeader.split('\n').filter(function(l) { return l.indexOf('// ' + prefix + ' ') === 0; });
};

// Seeds Math.random inside the page so an offer run repeats exactly.
function seedPage(page, seed) {
  return page.evaluate((s0) => {
    let s = s0 >>> 0;
    Math.random = function() {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

// Runs `count` artifact offers against the slot the current run is in and
// returns every offer as an array of { id, tier }.
function drawOffers(page, count) {
  return page.evaluate((n) => {
    const offers = [];
    for (let i = 0; i < n; i++) {
      openArtifactRewardScreen();
      offers.push(artifactRewardOptions.map(function(id) { return { id: id, tier: gameState.config.artifacts[id].tier }; }));
      artifactRewardStep = null;
      dieActionStep = null;
    }
    return offers;
  }, count);
}

function setSlot(page, slot) {
  return page.evaluate((s) => { updateRun({ currentSlot: s }); }, slot);
}

function face20Eligible(page) {
  return page.evaluate(() => currentPlayerDiePickConfig().isEligible(getPlayerFace(20)));
}

function face20Weight(page) {
  return page.evaluate(() => getPlayerFace(20).weight);
}

(async () => {
  const browser = await chromium.launch();

  await runTest('without Halo the Strengthen picker offers neither face 1 nor face 20, and a loaded face stays offered', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseStrengthen(); });
    const v = await page.evaluate(() => {
      const cfg = currentPlayerDiePickConfig();
      return { step: dieActionStep, face1: cfg.isEligible(getPlayerFace(1)), face10: cfg.isEligible(getPlayerFace(10)), face20: cfg.isEligible(getPlayerFace(20)) };
    });
    assert.strictEqual(v.step, 'strengthen_pick_face');
    assert.strictEqual(v.face1, false, 'face 1');
    assert.strictEqual(v.face10, true, 'the loaded anchor face');
    assert.strictEqual(v.face20, false, 'face 20 without Halo');
    await page.close();
  });

  await runTest('without Halo strengthenFace(20) returns false, leaves face 20 at weight 1 and logs the refusal', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const before = { weight: getPlayerFace(20).weight, added: gameState.run.weightAdded };
      const returned = strengthenFace(20);
      return {
        returned: returned, before: before,
        weight: getPlayerFace(20).weight, added: gameState.run.weightAdded,
        logged: document.getElementById('log').textContent.indexOf('Strengthen refused: face 20 needs Halo') !== -1
      };
    });
    assert.strictEqual(v.returned, false);
    assert.strictEqual(v.before.weight, 1);
    assert.strictEqual(v.weight, 1, 'face 20 weight');
    assert.strictEqual(v.added, v.before.added, 'run.weightAdded');
    assert.strictEqual(v.logged, true, 'refusal log line');
    await page.close();
  });

  await runTest('canStrengthenFace() is false for face 1, false for face 20 without Halo, true for face 20 with Halo, true for face 10', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const out = { face1: canStrengthenFace(1), face10: canStrengthenFace(10), face20Without: canStrengthenFace(20) };
      updateRun({ artifacts: ['halo'] });
      out.face20With = canStrengthenFace(20);
      out.face1With = canStrengthenFace(1);
      return out;
    });
    assert.deepStrictEqual(v, { face1: false, face10: true, face20Without: false, face20With: true, face1With: false });
    await page.close();
  });

  await runTest('with Halo held the Strengthen picker offers face 20 and strengthenFace(20) raises its weight to 2', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['halo'] }); openDieActionScreen('reward'); dieActionChooseStrengthen(); });
    assert.strictEqual(await face20Eligible(page), true, 'face 20 eligible with Halo');
    const returned = await page.evaluate(() => strengthenFace(20));
    assert.strictEqual(returned, 2, 'returned weight');
    assert.strictEqual(await face20Weight(page), 2, 'face 20 weight');
    await page.close();
  });

  await runTest('with Halo and face 20 at weight 5 strengthenFace(20) refuses, the weight stays 5 and the picker marks face 20 inert', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ artifacts: ['halo'] });
      updateDie({ faces: gameState.die.faces.map(f => f.number === 20 ? Object.assign({}, f, { weight: GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT }) : f) });
      openDieActionScreen('reward');
      dieActionChooseStrengthen();
      const returned = strengthenFace(20);
      return { returned: returned, weight: getPlayerFace(20).weight, eligible: currentPlayerDiePickConfig().isEligible(getPlayerFace(20)) };
    });
    assert.strictEqual(v.returned, 5, 'returned weight is the unchanged cap');
    assert.strictEqual(v.weight, 5);
    assert.strictEqual(v.eligible, false);
    await page.close();
  });

  await runTest('Leaden Face without Halo cannot Strengthen face 20 at all; with Halo it adds 2 weight to face 20', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ artifacts: ['leaden_face'] }); openDieActionScreen('reward'); dieActionChooseStrengthen(); });
    await page.evaluate(() => { dieActionPickStrengthenFace(20); });
    assert.strictEqual(await face20Weight(page), 1, 'face 20 weight without Halo');
    await page.evaluate(() => { updateRun({ artifacts: ['leaden_face', 'halo'] }); dieActionPickStrengthenFace(20); });
    assert.strictEqual(await face20Weight(page), 3, 'face 20 weight with Halo and Leaden Face');
    await page.close();
  });

  await runTest("the shop's Strengthen without Halo offers no face 20; with Halo it does", async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ gold: 500 });
      openShopScreen();
      shopBuyStrengthen();
      const step = dieActionStep;
      const without = currentPlayerDiePickConfig().isEligible(getPlayerFace(20));
      updateRun({ artifacts: ['halo'] });
      const withHalo = currentPlayerDiePickConfig().isEligible(getPlayerFace(20));
      return { step: step, without: without, withHalo: withHalo };
    });
    assert.strictEqual(v.step, 'strengthen_pick_face');
    assert.strictEqual(v.without, false, 'face 20 in the shop picker without Halo');
    assert.strictEqual(v.withHalo, true, 'face 20 in the shop picker with Halo');
    await page.close();
  });

  await runTest('Halo is defined with the exact text, tier rare and the name Halo', async () => {
    const page = await freshPage(browser);
    const halo = await page.evaluate(() => gameState.config.artifacts.halo);
    assert.strictEqual(halo.text, HALO_TEXT);
    assert.strictEqual(halo.tier, 'rare');
    assert.strictEqual(halo.name, 'Halo');
    await page.close();
  });

  await runTest('there are ' + EXPECTED_ARTIFACT_COUNT + ' artifacts, every one with a tier, split ' + JSON.stringify(EXPECTED_TIER_COUNTS), async () => {
    const page = await freshPage(browser);
    const byTier = await page.evaluate(() => {
      const out = { basic: [], uncommon: [], rare: [], other: [] };
      Object.keys(gameState.config.artifacts).forEach(function(id) {
        const tier = gameState.config.artifacts[id].tier;
        (out[tier] || out.other).push(id);
      });
      return out;
    });
    assert.deepStrictEqual(byTier.other, [], 'artifacts with a missing or unknown tier');
    assert.deepStrictEqual({ basic: byTier.basic.length, uncommon: byTier.uncommon.length, rare: byTier.rare.length }, EXPECTED_TIER_COUNTS);
    Object.keys(EXPECTED_TIERS).forEach(function(tier) {
      assert.deepStrictEqual(byTier[tier].slice().sort(), EXPECTED_TIERS[tier].slice().sort(), tier + ' artifacts');
    });
    assert.strictEqual(byTier.basic.length + byTier.uncommon.length + byTier.rare.length, EXPECTED_ARTIFACT_COUNT);
    await page.close();
  });

  await runTest(ELITE_OFFER_COUNT + ' seeded elite artifact offers: each is ' + OFFER_SIZE + ' distinct artifacts, and all three tiers show up', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 181);
    await setSlot(page, { lane: 'upper', index: 3 });
    const offers = await drawOffers(page, ELITE_OFFER_COUNT);
    const seenTiers = new Set();
    offers.forEach(function(offer, i) {
      assert.strictEqual(offer.length, OFFER_SIZE, 'offer ' + i + ' size');
      assert.strictEqual(new Set(offer.map(o => o.id)).size, OFFER_SIZE, 'offer ' + i + ' repeats an artifact: ' + offer.map(o => o.id));
      offer.forEach(o => seenTiers.add(o.tier));
    });
    assert.deepStrictEqual(Array.from(seenTiers).sort(), ['basic', 'rare', 'uncommon']);
    await page.close();
  });

  await runTest('elite offers with the 3 basic artifacts held: still ' + OFFER_SIZE + ' distinct, only tiers the pool holds, none held', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1813);
    await setSlot(page, { lane: 'upper', index: 3 });
    await page.evaluate((ids) => { updateRun({ artifacts: ids }); }, EXPECTED_TIERS.basic);
    const offers = await drawOffers(page, ELITE_OFFER_COUNT);
    offers.forEach(function(offer, i) {
      assert.strictEqual(new Set(offer.map(o => o.id)).size, OFFER_SIZE, 'offer ' + i + ' size or repeat');
      offer.forEach(function(o) {
        assert.ok(o.tier === 'uncommon' || o.tier === 'rare', 'offer ' + i + ' drew a tier the pool does not hold: ' + o.tier);
        assert.strictEqual(EXPECTED_TIERS.basic.indexOf(o.id), -1, 'a held artifact was offered: ' + o.id);
      });
    });
    await page.close();
  });

  await runTest(BOSS_OFFER_COUNT + ' seeded boss artifact offers never contain a basic artifact (boss split 0/70/30)', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1811);
    await setSlot(page, 'boss');
    const offers = await drawOffers(page, BOSS_OFFER_COUNT);
    const basicDrawn = offers.reduce((n, offer) => n + offer.filter(o => o.tier === 'basic').length, 0);
    const rareDrawn = offers.reduce((n, offer) => n + offer.filter(o => o.tier === 'rare').length, 0);
    assert.strictEqual(basicDrawn, 0, 'basic artifacts drawn in boss offers');
    assert.ok(rareDrawn > 0, 'rare artifacts drawn in boss offers');
    await page.close();
  });

  await runTest("an artifact offer's rarity word and colour match each artifact's own tier", async () => {
    const page = await freshPage(browser);
    await setSlot(page, { lane: 'upper', index: 3 });
    await page.evaluate(() => { openArtifactRewardScreen(); });
    const v = await page.evaluate(() => Array.from(document.querySelectorAll('#artifactRewardPanel .offer-symbol')).map(function(el) {
      const line = el.querySelector('.hover-tip').children[1];
      const tier = gameState.config.artifacts[el.dataset.offerId].tier;
      return { id: el.dataset.offerId, word: line.textContent, tier: tier, colour: line.style.color, wanted: GAME_CONFIG.TIER_COLOURS[tier] };
    }));
    assert.strictEqual(v.length, OFFER_SIZE, 'offered symbols');
    v.forEach(function(row) {
      assert.strictEqual(row.word, row.tier.toUpperCase(), row.id + ' rarity word');
      assert.ok(row.colour !== '', row.id + ' rarity colour is set');
    });
    await page.close();
  });

  await runTest("the top bar hover and the ARTIFACTS layer show each held artifact's tier word in its tier colour", async () => {
    const page = await freshPage(browser);
    const held = ['gilded_die', 'alms', 'halo'];
    await page.evaluate((ids) => { updateRun({ artifacts: ids }); updateUi({ artifactsInfoOpen: true }); refreshInspector(); }, held);
    const v = await page.evaluate(() => ({
      tips: Array.from(document.querySelectorAll('#artifactRow .artifact-slot .hover-tip')).map(t => ({ word: t.children[1].textContent, colour: t.children[1].style.color })),
      rows: Array.from(document.querySelectorAll('#artifactsInfoContent .info-list-row')).map(r => ({ text: r.textContent, word: r.querySelector('span').textContent, colour: r.querySelector('span').style.color })),
      tiers: ['gilded_die', 'alms', 'halo'].map(id => gameState.config.artifacts[id].tier)
    }));
    assert.strictEqual(v.tips.length, held.length, 'top bar hover boxes');
    assert.strictEqual(v.rows.length, held.length, 'ARTIFACTS layer rows');
    v.tiers.forEach(function(tier, i) {
      assert.strictEqual(v.tips[i].word, tier.toUpperCase(), 'top bar tier word ' + i);
      assert.strictEqual(v.rows[i].word, tier.toUpperCase(), 'layer tier word ' + i);
      assert.ok(v.tips[i].colour !== '' && v.rows[i].colour !== '', 'tier colour ' + i);
    });
    assert.ok(v.rows[2].text.indexOf(HALO_TEXT) !== -1, 'the layer row still carries the text');
    await page.close();
  });

  await runTest('every mod, card and artifact has non-empty on-screen text and a name', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      mods: Object.keys(gameState.config.mods).map(id => [id, MOD_DESCRIPTION[id], gameState.config.mods[id].name]),
      cards: Object.keys(gameState.config.cards).map(id => [id, getCardEffectText(id), gameState.config.cards[id].name]),
      artifacts: Object.keys(gameState.config.artifacts).map(id => [id, gameState.config.artifacts[id].text, gameState.config.artifacts[id].name])
    }));
    const empty = v.mods.concat(v.cards, v.artifacts).filter(t => !t[1] || !t[1].trim() || !t[2]);
    assert.deepStrictEqual(empty, [], 'pieces with empty text or name');
    assert.strictEqual(v.artifacts.length, EXPECTED_ARTIFACT_COUNT);
    await page.close();
  });

  await runTest('config.js header has one F12, one F45 and one F51 line with the D-132 wording', async () => {
    const f12 = headerLines('F12');
    const f45 = headerLines('F45');
    const f51 = headerLines('F51');
    assert.strictEqual(f12.length, 1, 'F12 lines');
    assert.strictEqual(f45.length, 1, 'F45 lines');
    assert.strictEqual(f51.length, 1, 'F51 lines');
    assert.ok(f12[0].indexOf('// F12 Strengthen targets any loaded face, and face 20 only while Halo is held (D-132); never face 1') === 0, f12[0]);
    assert.ok(f45[0].indexOf('artifacts 15 (Halo 181, Rosary 182)') !== -1, f45[0]);
    assert.ok(f51[0] === '// F51 (BUILD 164) face 20 weight cap FACE_TWENTY_MAX_WEIGHT 5 with Halo held (D-108, D-132)', f51[0]);
  });

  await browser.close();
  process.exit(report('build181') > 0 ? 1 : 0);
})();
