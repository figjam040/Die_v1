// Standing regression suite for BUILD 187: the mythic tier (D-142), the
// round line a fight ending in the player's half was missing (KI-62), short
// big numbers and the poison guard (KI-63), and card picks in the run record.
// Run: node tests/build187.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, freshPage, freshFightPage } = require('./shared-constants');

const { runTest, report } = createRunner();

const OFFER_COUNT = 400;
const MYTHIC_IDS = ['reliquary_chain', 'rosary'];
const MYTHIC_GOLD = 'rgb(251, 191, 36)';
const BIG_POISON = 21818442088442;
const CSV_HEADER = 'source,node,arrivalHpAtBoss,outcome,fightRounds,totalRounds,dieActionEvents,triggerCounts,blanksRolled,build,cardRewardEvents';

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

// Every artifact offer drawn against the slot the run is in, as tiers and ids.
function drawArtifactOffers(page, count) {
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

function tiersIn(offers) {
  const seen = {};
  offers.forEach(function(offer) { offer.forEach(function(o) { seen[o.tier] = (seen[o.tier] || 0) + 1; }); });
  return seen;
}

// Plays the current fight's round out through the real phase machine.
async function finishRound(page) {
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE' || gameState.run.status !== 'active');
  await page.evaluate(() => { if (gameState.turn.phase === 'CARD_PHASE') { nextPhase(); continueAutoAdvance(); } });
}

(async () => {
  const browser = await chromium.launch();

  // ---------- ITEM 4 — D-142 MYTHIC ----------

  await runTest('D-142: Rosary and Reliquary Chain are mythic, the rest keep their tiers (3/6/4/2), and only the boss artifact split weighs mythic', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const counts = {};
      Object.keys(gameState.config.artifacts).forEach(function(id) {
        const tier = gameState.config.artifacts[id].tier;
        counts[tier] = (counts[tier] || 0) + 1;
      });
      return {
        counts: counts,
        mythic: Object.keys(gameState.config.artifacts).filter(function(id) { return gameState.config.artifacts[id].tier === 'mythic'; }),
        split: GAME_CONFIG.TIER_SPLIT
      };
    });
    assert.deepStrictEqual(v.counts, { basic: 3, uncommon: 6, rare: 4, mythic: 2 });
    assert.deepStrictEqual(v.mythic.sort(), MYTHIC_IDS);
    assert.deepStrictEqual(v.split.bossArtifact, [0.0, 0.60, 0.30, 0.10, 0]);
    assert.deepStrictEqual(v.split.boss, [0.0, 0.70, 0.30, 0, 0]);
    assert.deepStrictEqual(v.split.elite, [0.40, 0.40, 0.20, 0, 0]);
    assert.deepStrictEqual(v.split.fight, [0.65, 0.30, 0.05, 0, 0]);
    await page.close();
  });

  await runTest('D-142: ' + OFFER_COUNT + ' seeded boss artifact offers produce mythic artifacts and never a basic one', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1871);
    await page.evaluate(() => { updateRun({ currentSlot: 'boss' }); });
    const offers = await drawArtifactOffers(page, OFFER_COUNT);
    const seen = tiersIn(offers);
    assert.ok((seen.mythic || 0) > 0, 'no mythic artifact in ' + OFFER_COUNT + ' boss offers: ' + JSON.stringify(seen));
    assert.ok(!seen.basic, 'basic drawn: ' + JSON.stringify(seen));
    assert.ok(offers.every(function(o) { return o.length === 3 && new Set(o.map(x => x.id)).size === 3; }), 'every offer is three distinct artifacts');
    await page.close();
  });

  await runTest('D-142: elite artifact offers never hold a mythic artifact, even with every rare held so the fallback has to move', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1872);
    await page.evaluate(() => { updateRun({ currentSlot: { lane: 'upper', index: 3 } }); });
    const plain = tiersIn(await drawArtifactOffers(page, OFFER_COUNT));
    await page.evaluate(() => {
      updateRun({ artifacts: Object.keys(gameState.config.artifacts).filter(function(id) { return gameState.config.artifacts[id].tier === 'rare'; }) });
    });
    const rareHeld = tiersIn(await drawArtifactOffers(page, OFFER_COUNT));
    assert.ok(!plain.mythic, 'mythic in elite offers: ' + JSON.stringify(plain));
    assert.ok(!rareHeld.mythic, 'mythic in elite offers with every rare held: ' + JSON.stringify(rareHeld));
    assert.ok(rareHeld.uncommon > 0 && !rareHeld.rare, JSON.stringify(rareHeld));
    await page.close();
  });

  await runTest('D-142: the shop never stocks a mythic artifact, and stocks none once only mythic ones are unheld', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1873);
    const v = await page.evaluate(() => {
      const stocked = [];
      for (let i = 0; i < 300; i++) { stocked.push(buildShopStock().artifact); }
      updateRun({ artifacts: Object.keys(gameState.config.artifacts).filter(function(id) { return gameState.config.artifacts[id].tier !== 'mythic'; }) });
      return { tiers: stocked.map(function(id) { return gameState.config.artifacts[id].tier; }), onlyMythicLeft: buildShopStock().artifact };
    });
    assert.strictEqual(v.tiers.indexOf('mythic'), -1, 'the shop stocked a mythic artifact');
    assert.strictEqual(v.onlyMythicLeft, null);
    await page.close();
  });

  await runTest('D-142: a boss card offer, a Load offer and a rite offer keep their splits, none weighing mythic', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updateRun({ currentSlot: 'boss' });
      const bossCard = currentOfferTierSplit(null);
      const bossLoad = currentOfferTierSplit('reward');
      const rite = currentOfferTierSplit('rite');
      updateRun({ currentSlot: { lane: 'upper', index: 3 } });
      return { bossCard: bossCard, bossLoad: bossLoad, rite: rite, elite: currentOfferTierSplit('artifact') };
    });
    assert.deepStrictEqual(v.bossCard, [0.0, 0.70, 0.30, 0, 0]);
    assert.deepStrictEqual(v.bossLoad, [0.0, 0.70, 0.30, 0, 0]);
    assert.deepStrictEqual(v.rite, [0.65, 0.30, 0.05, 0, 0]);
    assert.deepStrictEqual(v.elite, [0.40, 0.40, 0.20, 0, 0]);
    await page.close();
  });

  await runTest('D-142: a mythic artifact in the boss offer reads MYTHIC in the D-111 gold', async () => {
    const page = await freshPage(browser);
    await page.evaluate((ids) => {
      updateRun({ currentSlot: 'boss', artifacts: Object.keys(gameState.config.artifacts).filter(function(id) { return ids.indexOf(id) === -1; }) });
    }, MYTHIC_IDS);
    const v = await page.evaluate(() => {
      openArtifactRewardScreen();
      return Array.from(document.querySelectorAll('#artifactRewardPanel .offer-symbol')).map(function(el) {
        const line = el.querySelector('.hover-tip').children[1];
        return { id: el.dataset.offerId, word: line.textContent, colour: line.style.color };
      });
    });
    const mythic = v.filter(function(row) { return MYTHIC_IDS.indexOf(row.id) !== -1; });
    assert.ok(mythic.length > 0, 'no mythic artifact offered: ' + JSON.stringify(v));
    mythic.forEach(function(row) {
      assert.strictEqual(row.word, 'MYTHIC');
      assert.strictEqual(row.colour, MYTHIC_GOLD);
    });
    await page.close();
  });

  // ---------- ITEM 5 — KI-62 ----------

  await runTest('KI-62: an enemy won against with ' + BIG_POISON + ' stacks of poison leaves the next enemy at 0 stacks and full HP', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate((p) => { updateEnemy({ poisonStacks: p }); nextPhase(); }, BIG_POISON);
    await finishRound(page);
    await page.waitForFunction(() => gameState.run.status === 'win');
    await page.waitForFunction(() => dieActionStep === 'choose');
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.waitForFunction(() => cardRewardStep === 'choose');
    await page.evaluate(() => { cardRewardSkip(); enterSlot('upper', 0); });
    const v = await page.evaluate(() => ({ p: gameState.enemy.poisonStacks, hp: gameState.enemy.hp, maxHp: gameState.enemy.maxHp, status: gameState.run.status, round: gameState.turn.round }));
    assert.strictEqual(v.p, 0, 'the new enemy starts with stacks of poison');
    assert.strictEqual(v.hp, v.maxHp);
    assert.strictEqual(v.status, 'active');
    assert.strictEqual(v.round, 1);
    await page.close();
  });

  await runTest('KI-62: a round-1 kill by a card writes the R1 line before WON r1', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { forcePlayerRoll(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => {
      updateEnemy({ hp: 3 });
      updatePlayer({ hand: ['strike'].concat(gameState.player.hand.slice(1)) });
      playCard(0);
    });
    const tr = await page.evaluate(() => gameState.run.transcript);
    assert.strictEqual(tr.length, 3, JSON.stringify(tr));
    assert.ok(/^R1 Verger 0\/50 P0 \| roll 5 blank \| Strike \| enemy dead before acting \| you /.test(tr[1]), tr[1]);
    assert.ok(tr[2].indexOf('WON r1') === 0, tr[2]);
    await page.close();
  });

  await runTest('KI-62: a kill by the enemy\'s own poison tick keeps exactly one R1 line', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { updateEnemy({ poisonStacks: 60 }); nextPhase(); });
    await finishRound(page);
    await page.waitForFunction(() => gameState.run.status === 'win');
    const tr = await page.evaluate(() => gameState.run.transcript);
    assert.strictEqual(tr.filter(function(l) { return l.indexOf('R1 ') === 0; }).length, 1, JSON.stringify(tr));
    assert.ok(tr[tr.length - 1].indexOf('WON r1') === 0);
    await page.close();
  });

  // ---------- ITEM 6 — KI-63 ----------

  await runTest('KI-63: shortNumber reads 21818442088442 as 21.8T, 10000 as 10.0K, and leaves 9999 alone', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate((big) => [big, 10000, 9999, 0, 1234567, 1e15, -21818442088392, 4.2e9].map(shortNumber), BIG_POISON);
    assert.deepStrictEqual(v, ['21.8T', '10.0K', '9999', '0', '1.2M', '1.0Q', '-21.8T', '4.2B']);
    await page.close();
  });

  await runTest('KI-63: the status rows, the poison and block values and a pop show the short form', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { forcePlayerRoll(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE' && !dieRollHolding('player') && !dieRollHolding('enemy'));
    const v = await page.evaluate((big) => {
      updateEnemy({ poisonStacks: big, hp: 1e9 });
      updateEnemy({ hp: 1e9 - 50000 });
      updatePlayer({ block: 25000, poisonStacks: 12345 });
      const icons = function(id) { return Array.from(document.querySelectorAll('#' + id + ' .status-icon')).map(function(el) { return el.firstChild.textContent; }); };
      const pop = Array.from(document.querySelectorAll('.fx-number')).map(function(el) { return el.textContent; });
      return {
        enemyIcons: icons('enemyStatusRow'),
        playerIcons: icons('playerStatusRow'),
        enemyPoison: document.getElementById('enemyPoisonValue').textContent,
        block: document.getElementById('playerBlockValue').textContent,
        debuffs: document.getElementById('playerDebuffsValue').firstChild.textContent,
        pops: pop
      };
    }, BIG_POISON);
    assert.ok(v.enemyIcons.indexOf('P21.8T') !== -1, JSON.stringify(v.enemyIcons));
    assert.ok(v.playerIcons.indexOf('P12.3K') !== -1, JSON.stringify(v.playerIcons));
    assert.strictEqual(v.enemyPoison, '21.8T');
    assert.strictEqual(v.block, '25.0K');
    assert.strictEqual(v.debuffs, 'poison x12.3K');
    assert.ok(v.pops.indexOf('-50.0K') !== -1, JSON.stringify(v.pops));
    assert.ok(v.pops.indexOf('+21.8T') !== -1, JSON.stringify(v.pops));
    await page.close();
  });

  await runTest('KI-63: a log line shows big numbers short and small ones unchanged', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate((big) => {
      log('[POISON] ' + big + ' damage, 9999 stacks of poison remaining');
      const entries = document.querySelectorAll('#log > div');
      return entries[entries.length - 1].textContent;
    }, BIG_POISON);
    assert.strictEqual(v, '[POISON] 21.8T damage, 9999 stacks of poison remaining');
    await page.close();
  });

  await runTest('KI-63: POISON_PRECISION_GUARD holds either side at one quadrillion stacks and logs when it fires', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const lines = function() { return Array.from(document.querySelectorAll('#log > div')).map(function(el) { return el.textContent; }).filter(function(t) { return t.indexOf('[GUARD]') === 0; }); };
      updateEnemy({ poisonStacks: 999 });
      const quiet = lines().length;
      updateEnemy({ poisonStacks: 5e17 });
      updatePlayer({ poisonStacks: GAME_CONFIG.POISON_PRECISION_GUARD + 1 });
      return { guard: GAME_CONFIG.POISON_PRECISION_GUARD, enemy: gameState.enemy.poisonStacks, player: gameState.player.poisonStacks, quiet: quiet, lines: lines() };
    });
    assert.strictEqual(v.guard, 1e15);
    assert.strictEqual(v.enemy, 1e15);
    assert.strictEqual(v.player, 1e15);
    assert.strictEqual(v.quiet, 0, 'the guard logged under its limit');
    assert.strictEqual(v.lines.length, 2, JSON.stringify(v.lines));
    assert.ok(v.lines[0].indexOf('[GUARD] enemy stacks of poison held at') === 0, v.lines[0]);
    assert.ok(v.lines[1].indexOf('[GUARD] player stacks of poison held at') === 0, v.lines[1]);
    await page.close();
  });

  // ---------- ITEM 7 — CARD PICKS IN THE RUN RECORD ----------

  await runTest('card picks: a pick, a skip and a shop buy land in cardRewardEvents, the CSV\'s new last column', async () => {
    const page = await freshPage(browser);
    await seedPage(page, 1874);
    const v = await page.evaluate(() => {
      openCardRewardScreen();
      const firstOffer = cardRewardOptions.slice();
      cardRewardPickCard(firstOffer[1]);
      openCardRewardScreen();
      const secondOffer = cardRewardOptions.slice();
      cardRewardSkip();
      updateRun({ screen: 'map', gold: 999 });
      openShopScreen();
      const shopCard = gameState.run.shop.cards[0];
      shopBuyCard(shopCard);
      const line = buildRunRecordLine();
      return { firstOffer: firstOffer, secondOffer: secondOffer, shopCard: shopCard, events: gameState.runRecord.cardRewardEvents, header: RUN_RECORD_CSV_HEADER, cols: line.split(',') };
    });
    assert.strictEqual(v.header, CSV_HEADER);
    assert.strictEqual(v.cols.length, CSV_HEADER.split(',').length, 'columns: ' + v.cols.join(' , '));
    assert.strictEqual(v.events.length, 3);
    const expected = v.firstOffer.join('|') + '>' + v.firstOffer[1] + ';' + v.secondOffer.join('|') + '>skip;shop:' + v.shopCard;
    assert.strictEqual(v.cols[v.cols.length - 1], expected);
    assert.ok(/^[a-z_]+\|[a-z_]+\|[a-z_]+>[a-z_]+$/.test(v.cols[v.cols.length - 1].split(';')[0]));
    await page.close();
  });

  await runTest('card picks: a new run empties cardRewardEvents, and an empty list writes an empty last column', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openCardRewardScreen();
      cardRewardSkip();
      const before = gameState.runRecord.cardRewardEvents.length;
      startNewRun();
      return { before: before, after: gameState.runRecord.cardRewardEvents, last: buildRunRecordLine().split(',').pop() };
    });
    assert.strictEqual(v.before, 1);
    assert.deepStrictEqual(v.after, []);
    assert.strictEqual(v.last, '');
    await page.close();
  });

  await browser.close();
  process.exit(report('build187') > 0 ? 1 : 0);
})();
