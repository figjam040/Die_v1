// ============================================================
// TESTS/BUILD169.TEST.JS
// Standing regression suite for BUILD 169: D-111 rarity scheme, D-112 the
// one card component, KI-45 odds totalling 100.0, KI-46 hover boxes kept
// inside the window, D-116's HP line on the rite screen, D-121 Rite 6/6,
// D-122 the boss heal, D-123 act 1's ninth slot, KI-47 HP floored at 0.
// Run: node tests/build169.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
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

// Any wait on ROLL_PHASE needs the dev drawer's flag first (D-113).
async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function freshFight(browser) {
  const page = await freshPage(browser);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// A colour string as the browser computes it, for comparing hex to rgb().
async function computedColour(page, colour) {
  return page.evaluate((c) => {
    const probe = document.createElement('span');
    probe.style.color = c;
    document.body.appendChild(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, colour);
}

// Moves the mouse onto every element owning a hover tip that is on screen,
// and returns every showing tip whose box leaves the viewport.
async function hoverEveryTip(page, label) {
  const targets = await page.evaluate(() => {
    const owners = [];
    document.querySelectorAll('.hover-tip').forEach(function(tip) {
      const el = tip.parentElement;
      if (!el || owners.indexOf(el) !== -1) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) return;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(hit === el || el.contains(hit))) return;
      owners.push(el);
    });
    return owners.map(function(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: (el.id || el.className || el.tagName) + '' };
    });
  });
  const failures = [];
  let shown = 0;
  for (const t of targets) {
    await page.mouse.move(t.x, t.y);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    const boxes = await page.evaluate(() => Array.from(document.querySelectorAll('.hover-tip'))
      .filter((tip) => getComputedStyle(tip).visibility === 'visible')
      .map((tip) => { const r = tip.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight, text: tip.textContent.slice(0, 40) }; }));
    shown += boxes.length;
    boxes.forEach(function(b) {
      if (b.l < -0.5 || b.t < -0.5 || b.r > b.vw + 0.5 || b.b > b.vh + 0.5) {
        failures.push(label + ' ' + t.name + ' "' + b.text + '" ' + JSON.stringify([Math.round(b.l), Math.round(b.t), Math.round(b.r), Math.round(b.b)]));
      }
    });
  }
  await page.mouse.move(1, 1);
  return { hovered: targets.length, shown: shown, failures: failures };
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — D-111 rarity scheme
  // ---------------------------------------------------------------

  await runTest('Item A: TIER_ORDER is the five tiers, TIER_SPLIT gives mythic and void weight 0, TIER_COLOURS holds the five values', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({ order: GAME_CONFIG.TIER_ORDER, split: GAME_CONFIG.TIER_SPLIT, colours: GAME_CONFIG.TIER_COLOURS }));
    assert.deepStrictEqual(v.order, ['basic', 'uncommon', 'rare', 'mythic', 'void']);
    assert.deepStrictEqual(v.split, { fight: [0.65, 0.30, 0.05, 0, 0], elite: [0.40, 0.40, 0.20, 0, 0], boss: [0.0, 0.70, 0.30, 0, 0] });
    assert.deepStrictEqual(v.colours, { basic: '#4a4a4a', uncommon: '#b8b8b8', rare: '#60a5fa', mythic: '#fbbf24', void: '#8b5cf6' });
    await page.close();
  });

  await runTest("Item A: no piece carries the tier 'common' and no player-facing text reads COMMON", async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const tiers = [];
      Object.keys(gameState.config.cardPool).forEach(function(id) { tiers.push(gameState.config.cardPool[id].tier); });
      Object.keys(gameState.config.mods).forEach(function(id) { tiers.push(gameState.config.mods[id].tier); });
      Object.keys(gameState.config.artifacts).forEach(function(id) { tiers.push(gameState.config.artifacts[id].tier); });
      const texts = [];
      openCardRewardScreen();
      texts.push(document.getElementById('cardRewardPanel').textContent);
      cardRewardStep = null;
      openArtifactRewardScreen();
      texts.push(document.getElementById('artifactRewardPanel').textContent);
      artifactRewardStep = null;
      openDieActionScreen();
      dieActionChooseLoad();
      texts.push(document.getElementById('dieActionPanel').textContent);
      dieActionStep = null;
      updateRun({ gold: 500 });
      openShopScreen();
      texts.push(document.getElementById('shopPanel').textContent);
      updatePlayer({ ownedCards: gameState.player.ownedCards.concat(Object.keys(gameState.config.cardPool)) });
      updateUi({ cardsInfoOpen: true });
      texts.push(document.getElementById('cardsInfoLayer').textContent);
      texts.push(document.getElementById('handRow').textContent);
      return { tiers: tiers, texts: texts.join(' ') };
    });
    assert.strictEqual(v.tiers.indexOf('common'), -1, "a piece still carries tier 'common'");
    v.tiers.filter(Boolean).forEach(function(t) { assert.ok(['basic', 'uncommon', 'rare', 'mythic', 'void'].indexOf(t) !== -1, 'unknown tier ' + t); });
    assert.ok(!/\bcommon\b/i.test(v.texts), 'a player-facing panel still reads COMMON');
    const sources = ['config.js', 'cards-mods.js', 'rendering.js', 'state.js'].map(function(f) { return fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'); }).join('\n');
    assert.ok(!/['"]common['"]/.test(sources), "a 'common' string literal remains in js/");
    await page.close();
  });

  await runTest("Item A: artifacts carry a tier and the artifact offer's rarity line reads it in that tier's colour", async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      openArtifactRewardScreen();
      const el = document.querySelector('#artifactRewardPanel .offer-symbol');
      const tier = gameState.config.artifacts[el.dataset.offerId].tier;
      const line = el.querySelector('.hover-tip').children[1];
      return { tier: tier, text: line.textContent, colour: getComputedStyle(line).color };
    });
    assert.strictEqual(v.text, v.tier.toUpperCase());
    assert.strictEqual(v.colour, await computedColour(page, (await page.evaluate((t) => GAME_CONFIG.TIER_COLOURS[t], v.tier))));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — D-112 the one card component
  // ---------------------------------------------------------------

  await runTest('Item B: every card border and rarity line reads its tier colour, at offer, hand and mini size', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      // applyScale()'s zoom would report 2px as 1.818px at 1600 wide.
      document.documentElement.style.zoom = '1';
      const ids = ['strike', 'ward', 'rite'].concat(Object.keys(gameState.config.cardPool));
      const out = [];
      ['offer', 'hand', 'mini'].forEach(function(size) {
        ids.forEach(function(id) {
          const el = renderCard(id, { size: size });
          document.body.appendChild(el);
          const probe = document.createElement('span');
          probe.style.color = GAME_CONFIG.TIER_COLOURS[cardTier(getCard(id))];
          document.body.appendChild(probe);
          out.push({
            id: id, size: size,
            border: getComputedStyle(el).borderTopColor,
            width: getComputedStyle(el).borderTopWidth,
            line: getComputedStyle(el.querySelector('.offer-card-tier')).color,
            lineText: el.querySelector('.offer-card-tier').textContent,
            expected: getComputedStyle(probe).color,
            tier: cardTier(getCard(id))
          });
          el.remove();
          probe.remove();
        });
      });
      return out;
    });
    assert.ok(v.length > 100, 'expected every card at three sizes, got ' + v.length);
    v.forEach(function(c) {
      assert.strictEqual(c.border, c.expected, c.id + ' (' + c.size + ') border ' + c.border + ' is not its tier colour ' + c.expected);
      assert.strictEqual(c.width, '2px', c.id + ' (' + c.size + ') border must be 2px');
      assert.strictEqual(c.line, c.expected, c.id + ' rarity line colour');
      assert.strictEqual(c.lineText, c.tier.toUpperCase(), c.id + ' rarity line text');
    });
    assert.ok(v.filter(c => c.id === 'strike').every(c => c.tier === 'basic'), 'the Ring 0 cards read basic');
    await page.close();
  });

  await runTest('Item B: soul dots equal the cost on a 0, 1 and 2 cost card, and no name carries a cost in parentheses', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const count = function(id, size) {
        const el = renderCard(id, { size: size });
        return { dots: el.querySelectorAll('.offer-card-cost .offer-card-dot').length, name: el.querySelector('.offer-card-name').textContent, cost: getCardCost(getCard(id)) };
      };
      openCardRewardScreen();
      const offerNames = Array.from(document.querySelectorAll('#cardRewardPanel .offer-card-name')).map(e => e.textContent);
      return { rebuke: count('rebuke', 'offer'), strike: count('strike', 'hand'), rite: count('rite', 'mini'), offerNames: offerNames };
    });
    assert.strictEqual(v.rebuke.cost, 0);
    assert.strictEqual(v.rebuke.dots, 0, 'a zero-cost card shows no dots');
    assert.strictEqual(v.strike.cost, 1);
    assert.strictEqual(v.strike.dots, 1);
    assert.strictEqual(v.rite.cost, 2);
    assert.strictEqual(v.rite.dots, 2);
    [v.rebuke.name, v.strike.name, v.rite.name].concat(v.offerNames).forEach(function(n) {
      assert.ok(n.indexOf('(') === -1, 'a card name carries a cost in parentheses: ' + n);
    });
    await page.close();
  });

  await runTest('Item B: hand, card reward, shop, CARDS layer and both removal pickers all draw the one card', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => { forcePlayerRoll(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => {
      const out = {};
      const cardsIn = function(sel) { return document.querySelectorAll(sel + ' .offer-card').length; };
      out.hand = cardsIn('#handRow');
      out.handSize = document.querySelectorAll('#handRow .offer-card-hand').length;
      openCardRewardScreen();
      out.reward = cardsIn('#cardRewardPanel');
      out.rewardWidth = document.querySelector('#cardRewardPanel .offer-card').getBoundingClientRect().width / (parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
      cardRewardStep = null;
      updateRun({ gold: 500 });
      openShopScreen();
      out.shop = cardsIn('#shopPanel');
      shopBuyRemoval();
      out.shopRemoval = cardsIn('#shopPanel');
      shopStep = null; shopRemovingCard = false;
      riteStep = 'remove_pick_card';
      refreshInspector();
      out.riteRemoval = cardsIn('#riteScreenPanel');
      riteStep = null;
      updateUi({ cardsInfoOpen: true });
      out.cardsLayer = cardsIn('#cardsInfoLayer');
      out.distinct = new Set(gameState.player.ownedCards).size;
      return out;
    });
    assert.strictEqual(v.hand, v.handSize, 'every hand card is the component at hand size');
    assert.ok(v.hand >= 1, 'the hand shows cards');
    assert.strictEqual(v.reward, 3);
    assert.ok(Math.abs(v.rewardWidth - 304) < 1, 'offer card must be 304px wide (20 percent under 380), got ' + v.rewardWidth);
    assert.strictEqual(v.shop, 3);
    assert.strictEqual(v.shopRemoval, v.distinct, 'shop removal shows one card per owned id');
    assert.strictEqual(v.riteRemoval, v.distinct, 'rite removal shows one card per owned id');
    assert.strictEqual(v.cardsLayer, v.distinct, 'the CARDS layer shows one card per owned id');
    await page.close();
  });

  await runTest('Item B: a rite removal pick removes exactly one copy of that card', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      devJumpToSlot('upper', 1);
      riteChooseRemoveCard();
      const strike = Array.from(document.querySelectorAll('#riteScreenPanel .offer-card')).find(c => c.dataset.offerId === 'strike');
      const count = strike.querySelector('.offer-card-count').textContent;
      strike.click();
      return new Promise((res) => setTimeout(() => res({ count: count, strikes: gameState.player.ownedCards.filter(id => id === 'strike').length, total: gameState.player.ownedCards.length }), GAME_CONFIG.OFFER_PICK_HIGHLIGHT_MS + 100));
    });
    assert.strictEqual(v.count, '×5');
    assert.strictEqual(v.strikes, 4);
    assert.strictEqual(v.total, 9);
    await page.close();
  });

  await runTest('Item B: nothing scrolls at 1600 by 900 on the fight, card reward, shop and removal screens', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const fits = function() { return document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight; };
      const out = { fight: fits() };
      openCardRewardScreen(); out.reward = fits(); cardRewardStep = null;
      updateRun({ gold: 500 }); openShopScreen(); out.shop = fits();
      shopBuyRemoval(); out.removal = fits();
      return out;
    });
    assert.deepStrictEqual(v, { fight: true, reward: true, shop: true, removal: true });
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — KI-45 odds total 100.0
  // ---------------------------------------------------------------

  await runTest('Item C: the percents under the faces total 100.0 on a 20-face, a 19-face and a weighted die', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const sum = function() {
        const caps = Array.from(document.querySelectorAll('#playerDieList .die-face-caption')).map(c => c.textContent);
        const tenths = caps.map(t => { const m = t.match(/(\d+)\.(\d)%/); return m ? parseInt(m[1], 10) * 10 + parseInt(m[2], 10) : NaN; });
        return { n: caps.length, total: tenths.reduce((a, b) => a + b, 0), oneDecimal: caps.every(t => /\d+\.\d%/.test(t)) };
      };
      const out = { d20: sum() };
      updateDie({ faces: gameState.die.faces.filter(f => f.number !== 7) });
      out.d19 = sum();
      strengthenFace(5); strengthenFace(5); strengthenFace(20); strengthenFace(10);
      out.weighted = sum();
      updateTurn({ gildedFace: { faceNumber: 3, weight: 2 } });
      out.gilded = sum();
      out.raw = Object.values(rollOdds(gameState.die.faces)).reduce((a, o) => a + Math.round(o.pct * 10), 0);
      return out;
    });
    assert.strictEqual(v.d20.n, 20);
    assert.strictEqual(v.d20.total, 1000, '20-face total ' + v.d20.total / 10);
    assert.strictEqual(v.d19.n, 19);
    assert.strictEqual(v.d19.total, 1000, '19-face total ' + v.d19.total / 10);
    assert.strictEqual(v.weighted.total, 1000, 'weighted total ' + v.weighted.total / 10);
    assert.strictEqual(v.gilded.total, 1000, 'Gilded total ' + v.gilded.total / 10);
    assert.strictEqual(v.raw, 1000, 'rollOdds() pct total');
    assert.ok(v.d19.oneDecimal && v.weighted.oneDecimal, 'every caption keeps one decimal');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — KI-46 hover boxes inside the window
  // ---------------------------------------------------------------

  await runTest('Item D: every hover box on the map, fight, rite, die action and card reward screens lies inside the 1600x900 viewport', async () => {
    const all = [];
    let hovered = 0;
    let shown = 0;
    const tally = function(r) { hovered += r.hovered; shown += r.shown; all.push.apply(all, r.failures); };

    let page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ gold: 40, artifacts: ['third_eye', 'loaded_die', 'tithe_box', 'alms', 'hourglass', 'second_chance', 'gilded_die', 'bone_counter'] }); });
    tally(await hoverEveryTip(page, 'map'));
    await page.evaluate(() => { enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
    await page.evaluate(() => { forcePlayerRoll(10); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.waitForTimeout(400);
    tally(await hoverEveryTip(page, 'fight'));
    await page.evaluate(() => { openCardRewardScreen(); });
    tally(await hoverEveryTip(page, 'card reward'));
    await page.evaluate(() => { cardRewardStep = null; openDieActionScreen(); dieActionChooseLoad(); });
    tally(await hoverEveryTip(page, 'die action'));
    await page.close();

    page = await freshPage(browser);
    await page.evaluate(() => { devJumpToSlot('upper', 1); });
    tally(await hoverEveryTip(page, 'rite'));
    await page.evaluate(() => { riteChooseRemoveCard(); });
    tally(await hoverEveryTip(page, 'rite removal'));
    await page.close();

    console.log('  hovered ' + hovered + ' elements, ' + shown + ' boxes shown');
    assert.ok(hovered > 40, 'expected to hover many elements, got ' + hovered);
    assert.ok(shown > 40, 'expected many boxes to show, got ' + shown);
    assert.deepStrictEqual(all, [], 'hover boxes outside the viewport:\n' + all.join('\n'));
  });

  await runTest("Item D: the gold coin's hover box, the known failure, is inside the window", async () => {
    const page = await freshPage(browser);
    const r = await page.evaluate(() => { const b = document.getElementById('goldValue').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
    await page.mouse.move(r.x, r.y);
    await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
    const box = await page.evaluate(() => { const t = document.querySelector('#goldValue .hover-tip'); const b = t.getBoundingClientRect(); return { vis: getComputedStyle(t).visibility, l: b.left, t: b.top, r: b.right, b: b.bottom }; });
    assert.strictEqual(box.vis, 'visible', "the coin's hover box must show");
    assert.ok(box.l >= 0 && box.t >= 0 && box.r <= 1600 && box.b <= 900, 'coin box ' + JSON.stringify(box));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM E — D-116 amended: HP on the rite screen
  // ---------------------------------------------------------------

  await runTest("Item E: the rite screen shows '20 / 70' under Rite, in the HP red", async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      updatePlayer({ hp: 20 });
      devJumpToSlot('upper', 1);
      const panel = document.getElementById('riteScreenPanel');
      const title = panel.querySelector('.die-action-title');
      const hp = panel.querySelector('.rite-hp');
      return {
        title: title.textContent,
        next: title.nextElementSibling === hp,
        text: hp.textContent,
        colour: getComputedStyle(hp).color,
        hpRed: getComputedStyle(document.getElementById('playerHpValue')).color
      };
    });
    assert.strictEqual(v.title, 'Rite');
    assert.ok(v.next, 'the HP line sits directly under the title');
    assert.strictEqual(v.text, '20 / 70');
    assert.strictEqual(v.colour, v.hpRed, 'the HP line is the HP readout red');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM F — D-121 Rite 6 damage, 6 block
  // ---------------------------------------------------------------

  await runTest('Item F: Rite deals 6 damage and 6 block, and its text says so', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      updateEnemy({ hp: 100 });
      updatePlayer({ block: 0 });
      gameState.config.cards['rite'].effect(gameState);
      return { damage: 100 - gameState.enemy.hp, block: gameState.player.block, text: getCardEffectText('rite') };
    });
    assert.strictEqual(v.damage, 6);
    assert.strictEqual(v.block, 6);
    assert.strictEqual(v.text, '6 damage 6 block');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM G — D-122 boss heal
  // ---------------------------------------------------------------

  async function winBossAt(page, actNumber, hp) {
    return page.evaluate(({ actNumber, hp }) => {
      if (actNumber > 1) updateRun({ act: buildAct(actNumber), actNumber: actNumber });
      devJumpToSlot('boss', null);
      return new Promise((res) => {
        const wait = function() {
          if (gameState.turn.phase !== 'ROLL_PHASE') { setTimeout(wait, 20); return; }
          updatePlayer({ hp: hp });
          updateEnemy({ hp: 0 });
          runPhase('CARD_PHASE');
          res({
            hp: gameState.player.hp,
            outcome: gameState.run.outcome,
            artifactStep: artifactRewardStep,
            transcript: gameState.run.transcript.filter(l => l.indexOf('BOSS HEAL') === 0),
            logLines: Array.from(document.querySelectorAll('#log div')).map(d => d.textContent).filter(t => t.indexOf('[HEAL]') === 0)
          });
        };
        wait();
      });
    }, { actNumber, hp });
  }

  await runTest('Item G: beating the act 1 boss heals 14 (20 percent of 70, rounded down) before the artifact offer', async () => {
    const page = await freshPage(browser);
    const v = await winBossAt(page, 1, 10);
    assert.strictEqual(v.hp, 24);
    assert.deepStrictEqual(v.logLines, ['[HEAL] boss heal 14: HP 10 to 24']);
    assert.deepStrictEqual(v.transcript, ['BOSS HEAL 14 | you 24/70']);
    assert.strictEqual(v.artifactStep, 'choose', 'the artifact offer opens after the heal');
    await page.close();
  });

  await runTest('Item G: beating the act 2 boss heals too', async () => {
    const page = await freshPage(browser);
    const v = await winBossAt(page, 2, 30);
    assert.strictEqual(v.hp, 44);
    assert.deepStrictEqual(v.transcript, ['BOSS HEAL 14 | you 44/70']);
    await page.close();
  });

  await runTest('Item G: the heal caps at max HP', async () => {
    const page = await freshPage(browser);
    const v = await winBossAt(page, 1, 65);
    assert.strictEqual(v.hp, 70);
    assert.deepStrictEqual(v.logLines, ['[HEAL] boss heal 5: HP 65 to 70']);
    assert.deepStrictEqual(v.transcript, ['BOSS HEAL 5 | you 70/70']);
    await page.close();
  });

  await runTest('Item G: the final boss grants no heal', async () => {
    const page = await freshPage(browser);
    const v = await winBossAt(page, 3, 10);
    assert.strictEqual(v.hp, 10);
    assert.strictEqual(v.outcome, 'won');
    assert.deepStrictEqual(v.transcript, []);
    assert.deepStrictEqual(v.logLines, []);
    await page.close();
  });

  await runTest('Item G: BOSS_HEAL_PERCENT is 20', async () => {
    const page = await freshPage(browser);
    assert.strictEqual(await page.evaluate(() => GAME_CONFIG.BOSS_HEAL_PERCENT), 20);
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM H — D-123 act 1 ninth slot
  // ---------------------------------------------------------------

  await runTest('Item H: act 1 lanes have 9 slots, rites at 2, 6, 9 and a Fight at 5; acts 2 and 3 have 8', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const shape = function(act) {
        return ['upper', 'lower'].map(function(l) { return act[l].map(function(s) { return s.label + (s.enemy && s.label === 'Fight' ? ':' + s.enemy.name : ''); }); });
      };
      return {
        cfg: { slots: GAME_CONFIG.SLOTS_PER_LANE, rites: GAME_CONFIG.RITE_SLOT_INDICES },
        act1: shape(gameState.run.act),
        act2: shape(buildAct(2)),
        act3: shape(buildAct(3)),
        ninthHp: gameState.run.act.upper[4].enemy.hp
      };
    });
    assert.deepStrictEqual(v.cfg, { slots: [9, 8, 8], rites: [[1, 5, 8], [1, 4, 7], [1, 4, 7]] });
    assert.deepStrictEqual(v.act1[0], ['Fight:Thurifer', 'Rite', 'Fight:Asperser', 'Elite', 'Fight:Verger', 'Rite', 'Fight:Thurifer', 'Fight:Asperser', 'Rite']);
    assert.deepStrictEqual(v.act1[1], ['Fight:Thurifer', 'Rite', 'Fight:Asperser', 'Anomaly', 'Fight:Verger', 'Rite', 'Fight:Thurifer', 'Fight:Asperser', 'Rite']);
    assert.strictEqual(v.ninthHp, 50, 'the ninth slot is a Verger at the opening HP');
    [v.act2, v.act3].forEach(function(act) {
      assert.strictEqual(act[0].length, 8);
      assert.strictEqual(act[1].length, 8);
      assert.deepStrictEqual(act[0].map(s => s.split(':')[0]), ['Fight', 'Rite', 'Fight', 'Elite', 'Rite', 'Fight', 'Fight', 'Rite']);
    });
    await page.close();
  });

  for (const vp of [{ width: 1600, height: 900 }, { width: 1920, height: 1080 }]) {
    await runTest('Item H: act 1 map draws nine nodes a lane inside the map panel with no scroll at ' + vp.width + 'x' + vp.height, async () => {
      const page = await freshPage(browser, vp);
      const v = await page.evaluate(() => {
        const lanes = Array.from(document.querySelectorAll('#mapScreen .map-lane')).map(l => l.querySelectorAll('.map-node').length);
        const nodes = Array.from(document.querySelectorAll('#mapScreen .map-node')).map(n => n.getBoundingClientRect());
        const panel = document.getElementById('mapScreen').getBoundingClientRect();
        return {
          lanes: lanes,
          inside: nodes.every(r => r.left >= panel.left && r.right <= panel.right && r.top >= panel.top && r.bottom <= panel.bottom),
          scroll: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight
        };
      });
      assert.deepStrictEqual(v.lanes, [9, 9]);
      assert.ok(v.inside, 'every node sits inside the map panel');
      assert.strictEqual(v.scroll, false, 'the page must not scroll');
      await page.close();
    });
  }

  await runTest('Item H: the run record and transcript name the ninth slot upper-4', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      devJumpToSlot('upper', 4);
      return { node: gameState.runRecord.node, fight: gameState.run.transcript.filter(l => l.indexOf('FIGHT') === 0).pop() };
    });
    assert.strictEqual(v.node, 'upper-4');
    assert.ok(v.fight.indexOf('FIGHT act 1 upper-4 Verger 50') === 0, 'transcript FIGHT line: ' + v.fight);
    await page.close();
  });

  await runTest('Item H: after the ninth lane slot the run moves to the boss', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      devJumpToSlot('upper', 8);
      riteStep = null;
      advanceRun();
      return gameState.run.currentSlot;
    });
    assert.strictEqual(v, 'boss');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM I — KI-47 HP floored at 0
  // ---------------------------------------------------------------

  await runTest('Item I: a loss shows HP 0, not negative, on the panel, the DIE layer and the transcript', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      updatePlayer({ hp: -7 });
      runPhase('CARD_PHASE');
      updateUi({ dieInfoOpen: true });
      return {
        status: gameState.run.status,
        panel: document.getElementById('playerHpValue').textContent,
        layer: document.querySelector('#dieInfoContent .info-list-row').textContent,
        lost: gameState.run.transcript.filter(l => l.indexOf('LOST') === 0).pop()
      };
    });
    assert.strictEqual(v.status, 'loss');
    assert.strictEqual(v.panel, '0 / 70');
    assert.strictEqual(v.layer, 'HP 0 / 70');
    assert.ok(/\| you 0\/70$/.test(v.lost), 'LOST line: ' + v.lost);
    await page.close();
  });

  await runTest("Item I: an overkilled enemy reads 0 on its panel and on the round's transcript line", async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      updateEnemy({ hp: -12 });
      appendRoundTranscript('test');
      return { panel: document.getElementById('enemyHpValue').textContent, line: gameState.run.transcript[gameState.run.transcript.length - 1] };
    });
    assert.strictEqual(v.panel, '0 / 50');
    assert.ok(v.line.indexOf('Verger 0/50') !== -1, 'R line: ' + v.line);
    await page.close();
  });

  await browser.close();

  const failed = results.filter(function(r) { return !r.pass; });
  if (failed.length > 0) {
    console.log('\nFAILURES:');
    failed.forEach(function(r) { console.log('  ' + r.name + ': ' + r.error); });
    process.exit(1);
  }
  console.log('\n' + results.length + '/' + results.length + ' build169 tests passed.');
})();
