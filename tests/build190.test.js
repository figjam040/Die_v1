// Standing regression suite for BUILD 190: D-152 tier colours and the card
// frame, D-153 the keyword explainers and new texts, D-154 the four doors,
// the offer-size owned-card grid and the white picked outline, D-151 Vigil
// rare, and KI-64 the chain loop drawn once when the trigger queue closes.
// Run: node tests/build190.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL, freshPage, freshFightPage, assertNoErrors } = require('./shared-constants');

const { runTest, report } = createRunner();

const STALL_GOAL_MS = 300;
const EXPLAINERS = {
  weight: 'Weight: each point is one more chance to roll this face.',
  bound: 'Bound: when you roll a Bound face, every other Bound face triggers too.',
  poison: "Poison: at the end of its holder's turn it deals 1 damage per stack, ignoring block, then loses 1 stack.",
  awe: "Awe: each stack lowers the enemy's next Attack by 1. It loses 1 stack at the start of the enemy's round.",
  siphon: 'Siphon: when you deal attack damage to the enemy, gain block equal to half that damage, rounded up. Each hit spends 1 stack.',
  stigma: 'Stigma: every mod that damages the enemy hits again for half, rounded down. It loses 1 at the start of each round.'
};
// Per tier: edge, body, line, label, gem px, corner length px, corner thickness px.
const TONES = {
  basic: ['rgb(58, 59, 63)', 'rgb(27, 28, 31)', 'rgb(74, 74, 74)', 'rgb(154, 154, 154)', 10, null, null],
  uncommon: ['rgb(47, 95, 158)', 'rgb(16, 26, 44)', 'rgb(96, 165, 250)', 'rgb(125, 184, 255)', 10, 6, null],
  rare: ['rgb(138, 106, 18)', 'rgb(42, 33, 16)', 'rgb(251, 191, 36)', 'rgb(251, 191, 36)', 12, 14, 3],
  mythic: ['rgb(109, 63, 192)', 'rgb(29, 18, 48)', 'rgb(159, 107, 255)', 'rgb(183, 148, 255)', 16, 18, 4]
};
const DOOR_TEXT = {
  Load: 'Put a new mod on a face. Pick 1 of 3.',
  Strengthen: 'Add 1 weight to a loaded face. It rolls more often.',
  Purify: 'Take every mod off one face. Its weight stays.',
  Remove: 'Take one blank face off the die for the run.'
};

async function fontsReady(page) {
  await page.evaluate(() => document.fonts.ready);
}

// One offer-size card per tier (mythic by a temporary tier on Stigma), each
// card's measured layers.
function measureTierCards(page) {
  return page.evaluate(() => {
    const ids = { basic: 'rebuke', uncommon: 'siphon', rare: 'stigma', mythic: 'stigma' };
    const holder = document.createElement('div');
    holder.style.cssText = 'position:fixed;left:0;top:0;display:flex;gap:40px;z-index:99';
    document.body.appendChild(holder);
    const out = {};
    Object.keys(ids).forEach(function(tier) {
      const card = gameState.config.cardPool[ids[tier]];
      const was = card.tier;
      if (tier === 'mythic') card.tier = 'mythic';
      const el = renderCard(ids[tier], { size: 'offer' });
      card.tier = was;
      holder.appendChild(el);
      const cs = function(sel) { return getComputedStyle(sel ? el.querySelector(sel) : el); };
      const corner = el.querySelector('.card-corner-tl');
      out[tier] = {
        tierAttr: el.dataset.tier,
        w: parseFloat(cs().width), h: parseFloat(cs().height),
        edge: cs().borderTopColor, body: cs().backgroundColor, padding: cs().paddingTop,
        line: cs('.card-inner').borderTopColor, innerPad: cs('.card-inner').paddingTop,
        columnBorder: cs('.card-column').borderTopColor + ' ' + cs('.card-column').borderTopWidth, columnPad: cs('.card-column').paddingTop,
        plateH: parseFloat(cs('.card-title-plate').height), plateBottom: cs('.card-title-plate').borderBottomWidth,
        nameFont: cs('.offer-card-name').fontSize + ' ' + cs('.offer-card-name').fontFamily.split(',')[0],
        nameColour: cs('.offer-card-name').color,
        artH: parseFloat(cs('.offer-card-art').height), artBorder: cs('.offer-card-art').borderTopWidth + ' ' + cs('.offer-card-art').borderTopColor,
        artOutline: cs('.offer-card-art').outlineColor, artFit: cs('.offer-card-art img').objectFit,
        typeH: parseFloat(cs('.card-type-plate').height), label: cs('.offer-card-tier').color,
        typeKids: Array.from(el.querySelector('.card-type-plate').children).map(function(c) { return c.className; }),
        textPad: cs('.card-text-box').paddingTop + ' ' + cs('.card-text-box').paddingLeft,
        text: cs('.offer-card-text').fontSize + ' ' + cs('.offer-card-text').lineHeight + ' ' + cs('.offer-card-text').color,
        gem: parseFloat(getComputedStyle(el.querySelector('.card-gem-bottom')).width),
        gemTop: el.querySelector('.card-gem-top') ? getComputedStyle(el.querySelector('.card-gem-top')).backgroundColor : null,
        cornerShown: getComputedStyle(corner).display !== 'none',
        cornerLen: parseFloat(getComputedStyle(corner).width),
        cornerThick: getComputedStyle(corner).borderTopWidth,
        shadow: cs().boxShadow
      };
    });
    holder.remove();
    return out;
  });
}

async function fightWithLoop(browser, enemyHp) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page._pageErrors = [];
  page.on('pageerror', function(err) { page._pageErrors.push(err.message); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate((hp) => {
    devChromeOpen = true;
    updateRun({ artifacts: ['reliquary_chain', 'rosary'] });
    enterSlot('opening', null);
    const faces = gameState.die.faces.slice();
    [[7, 'unison'], [8, 'accord']].forEach(function(p) {
      const i = playerFaceIndex(p[0]);
      faces[i] = Object.assign({}, faces[i], { modId: p[1], modId2: null });
    });
    updateDie({ faces: faces });
    updateEnemy({ hp: hp, maxHp: hp });
  }, enemyHp);
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Forces face 7 and times the synchronous stall; counts screen draws (a
// refreshInspector() call with no hold open) and the pops announced to show.
function timeLoop(page) {
  return page.evaluate(() => {
    let draws = 0;
    const shown = [];
    const realRefresh = refreshInspector;
    const realAnnounce = announceFx;
    window.refreshInspector = function() { if (renderHoldDepth === 0) draws++; return realRefresh.apply(this, arguments); };
    window.announceFx = function(a, k, d) { if (renderHoldDepth === 0 && fxSuppressDepth === 0 && d !== 0) shown.push(a + '|' + k + '|' + d); return realAnnounce.apply(this, arguments); };
    const t0 = performance.now();
    forcePlayerRoll(7);
    const ms = performance.now() - t0;
    window.refreshInspector = realRefresh;
    window.announceFx = realAnnounce;
    return {
      ms: ms, draws: draws, shown: shown,
      triggers: gameState.turn.roundTriggerCount, hp: gameState.enemy.hp,
      unisonLines: Array.from(document.querySelectorAll('#log > div')).filter(function(d) { return d.textContent.indexOf('[MOD] unison') === 0; }).length,
      guardLines: Array.from(document.querySelectorAll('#log > div')).filter(function(d) { return d.textContent.indexOf('[GUARD]') === 0; }).length
    };
  });
}

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. D-152 tier colours ----------

  await runTest('D-152 TIER_COLOURS: uncommon 60a5fa, rare fbbf24, mythic 9f6bff, basic and void unchanged', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => GAME_CONFIG.TIER_COLOURS);
    assert.deepStrictEqual(v, { basic: '#4a4a4a', uncommon: '#60a5fa', rare: '#fbbf24', mythic: '#9f6bff', void: '#8b5cf6' });
    await page.close();
  });

  // ---------- 2. D-152 the card frame ----------

  await runTest('D-152 the offer card: 304 by 470, card box, inner box, plate 36, art 170, type line 26, text box, in each tier\'s tones', async () => {
    const page = await freshFightPage(browser);
    await fontsReady(page);
    const v = await measureTierCards(page);
    Object.keys(TONES).forEach(function(tier) {
      const c = v[tier];
      const t = TONES[tier];
      assert.strictEqual(c.tierAttr, tier);
      assert.deepStrictEqual([c.w, c.h], [304, 470], tier + ' size');
      assert.deepStrictEqual([c.edge, c.body, c.line, c.label], t.slice(0, 4), tier + ' edge, body, line, label');
      assert.strictEqual(c.padding, '8px');
      assert.deepStrictEqual([c.plateH, c.artH, c.typeH], [36, 170, 26], tier + ' plate, art, type line');
      assert.strictEqual(c.plateBottom, tier === 'basic' ? '1px' : '2px', tier + ' title plate bottom border');
      assert.strictEqual(c.nameFont, '12px "Press Start 2P"');
      assert.strictEqual(c.nameColour, 'rgb(244, 244, 244)');
      assert.strictEqual(c.artBorder, '2px rgb(0, 0, 0)');
      assert.strictEqual(c.artOutline, t[2], tier + ' art outline in line');
      assert.strictEqual(c.artFit, 'cover');
      assert.strictEqual(c.textPad, '10px 12px');
      assert.strictEqual(c.gem, t[4], tier + ' gem');
      assert.strictEqual(c.cornerShown, t[5] !== null, tier + ' corners');
      if (t[5] !== null) assert.strictEqual(c.cornerLen, t[5], tier + ' corner length');
      if (t[6] !== null) assert.strictEqual(c.cornerThick, t[6] + 'px', tier + ' corner thickness');
    });
    assert.strictEqual(v.basic.text, '23px 24.15px rgb(232, 228, 208)', 'rules text VT323 23px, line-height 1.05');
    assert.strictEqual(v.basic.innerPad, '6px');
    assert.deepStrictEqual([v.mythic.innerPad, v.mythic.columnPad, v.mythic.columnBorder], ['3px', '5px', 'rgb(251, 191, 36) 1px'], 'MYTHIC second inner box');
    assert.strictEqual(v.mythic.gemTop, 'rgb(251, 191, 36)', 'MYTHIC gold gem on the top edge');
    assert.strictEqual(v.rare.gemTop, null);
    assert.strictEqual(v.basic.shadow, 'none');
    assert.strictEqual(v.uncommon.shadow, 'none');
    assert.ok(v.rare.shadow.indexOf('rgba(251, 191, 36, 0.4) 0px 0px 28px') !== -1 && v.rare.shadow.indexOf('rgb(0, 0, 0) 0px 0px 0px 2px') !== -1, v.rare.shadow);
    assert.ok(v.mythic.shadow.indexOf('rgba(159, 107, 255, 0.5) 0px 0px 32px') !== -1, v.mythic.shadow);
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-152 hand cards keep 144 by 216 and their text sizes, with the same layers', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { forcePlayerRoll(5); });
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => {
      updatePlayer({ hand: ['strike', 'stigma'] });
      return Array.from(document.querySelectorAll('#handRow .offer-card-hand')).map(function(el) {
        return {
          size: getComputedStyle(el).width + ' ' + getComputedStyle(el).height,
          layers: ['.card-inner', '.card-title-plate', '.offer-card-art', '.card-type-plate', '.card-text-box', '.card-gem-bottom'].every(function(s) { return !!el.querySelector(s); }),
          name: getComputedStyle(el.querySelector('.offer-card-name')).fontSize,
          text: getComputedStyle(el.querySelector('.offer-card-text')).fontSize,
          explainerInBox: !!el.querySelector('.card-explainer'),
          hoverExplainer: Array.from(el.querySelectorAll('.hover-tip .hover-tip-explainer')).map(function(d) { return d.textContent; })
        };
      });
    });
    assert.strictEqual(v.length, 2);
    v.forEach(function(c) {
      assert.strictEqual(c.size, '144px 216px');
      assert.ok(c.layers, 'every layer present');
      assert.deepStrictEqual([c.name, c.text], ['9px', '15px']);
      assert.strictEqual(c.explainerInBox, false, 'a hand card shows its explainer in the hover box only');
    });
    assert.deepStrictEqual(v[1].hoverExplainer, [EXPLAINERS.stigma]);
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 3. D-152 the type line ----------

  await runTest('D-152 the type line: the tier word alone with no tags, offerTagText never NONE, no empty tag line in hover boxes', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const untaggedMod = Object.keys(gameState.config.mods).find(function(id) { const m = gameState.config.mods[id]; return m.tier && !(m.tags && m.tags.length); });
      const untaggedArtifact = Object.keys(gameState.config.artifacts).find(function(id) { const a = gameState.config.artifacts[id]; return !(a.tags && a.tags.length); });
      const plain = renderCard('strike', { size: 'offer' });
      const tagged = renderCard('blight_weight', { size: 'offer' });
      const tipRows = function(el) { return Array.from(el.querySelector('.hover-tip').children).map(function(d) { return d.textContent; }); };
      const faces = gameState.die.faces.slice();
      faces[playerFaceIndex(5)] = Object.assign({}, faces[playerFaceIndex(5)], { modId: untaggedMod });
      updateDie({ faces: faces });
      return {
        empty: offerTagText([]), none: offerTagText(undefined), some: offerTagText(['poison', 'mass']),
        plainKids: Array.from(plain.querySelector('.card-type-plate').children).map(function(c) { return c.textContent || c.className; }),
        taggedKids: Array.from(tagged.querySelector('.card-type-plate').children).map(function(c) { return c.textContent || c.className; }),
        modTip: tipRows(renderOfferSymbol(offerCardSpecForMod(untaggedMod, false, null))),
        artifactTip: tipRows(renderOfferSymbol(offerCardSpecForArtifact(untaggedArtifact, null, '', false, null))),
        faceBoxTags: faceModBox(getPlayerFace(5), untaggedMod).querySelectorAll('.face-tip-tags').length
      };
    });
    assert.deepStrictEqual([v.empty, v.none, v.some], ['', '', 'POISON MASS']);
    assert.deepStrictEqual(v.plainKids, ['BASIC']);
    assert.deepStrictEqual(v.taggedKids, ['UNCOMMON', 'card-type-pip', 'POISON MASS']);
    assert.ok(v.modTip.indexOf('') === -1 && v.modTip.indexOf('NONE') === -1, JSON.stringify(v.modTip));
    assert.ok(v.artifactTip.indexOf('') === -1 && v.artifactTip.indexOf('NONE') === -1, JSON.stringify(v.artifactTip));
    assert.strictEqual(v.faceBoxTags, 0);
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 4. D-153 the explainer table ----------

  await runTest('D-153 the explainer table: six entries, exact text; whole word, any case, tags, order of appearance, at most two', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({
      table: KEYWORD_EXPLAINERS,
      blightWeight: keywordExplainers(CARD_EFFECT_TEXT.blight_weight, gameState.config.cardPool.blight_weight.tags),
      tagOnly: keywordExplainers('Deal 6 damage.', ['bound']),
      textBeforeTag: keywordExplainers('Gain 1 weight.', ['bound']),
      wholeWord: keywordExplainers('Two weights and an awesome poisoner.', []),
      anyCase: keywordExplainers('AWE first, then STIGMA.', []),
      capped: keywordExplainers('Siphon, then stigma, then poison.', [])
    }));
    assert.deepStrictEqual(v.table, EXPLAINERS);
    assert.deepStrictEqual(v.blightWeight, [EXPLAINERS.poison, EXPLAINERS.weight]);
    assert.deepStrictEqual(v.tagOnly, [EXPLAINERS.bound]);
    assert.deepStrictEqual(v.textBeforeTag, [EXPLAINERS.weight, EXPLAINERS.bound]);
    assert.deepStrictEqual(v.wholeWord, []);
    assert.deepStrictEqual(v.anyCase, [EXPLAINERS.awe, EXPLAINERS.stigma]);
    assert.deepStrictEqual(v.capped, [EXPLAINERS.siphon, EXPLAINERS.stigma]);
    await page.close();
  });

  // ---------- 5. D-153 where the explainer shows ----------

  await runTest('D-153 an offer card shows its explainer in the text box under a 1px rule, 19px VT323 in dim', async () => {
    const page = await freshFightPage(browser);
    await fontsReady(page);
    const v = await page.evaluate(() => {
      openCardRewardScreen();
      cardRewardOptions = ['siphon', 'strike', 'kneel'];
      refreshInspector();
      const el = document.querySelector('#cardRewardPanel .offer-card[data-offer-id="siphon"]');
      const ex = el.querySelector('.card-text-box > .card-explainer');
      const cs = getComputedStyle(ex);
      return {
        lines: Array.from(ex.children).map(function(d) { return d.textContent; }),
        rule: cs.borderTopWidth + ' ' + cs.borderTopColor, space: cs.marginTop + ' ' + cs.paddingTop,
        font: cs.fontFamily.split(',')[0], colour: cs.color,
        strikeHasNone: !document.querySelector('#cardRewardPanel .offer-card[data-offer-id="strike"] .card-explainer')
      };
    });
    assert.deepStrictEqual(v.lines, [EXPLAINERS.siphon]);
    assert.strictEqual(v.rule, '1px rgb(35, 64, 107)', 'the rule in UNCOMMON plate edge');
    assert.strictEqual(v.space, '6px 6px');
    assert.strictEqual(v.font, 'VT323');
    assert.strictEqual(v.colour, 'rgb(157, 180, 209)', 'UNCOMMON dim');
    assert.strictEqual(v.strikeHasNone, true);
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-153 no card in the pool overflows its offer-size text box; sizes step by 2 and never go below 15', async () => {
    const page = await freshFightPage(browser);
    await fontsReady(page);
    const v = await page.evaluate(() => {
      updatePlayer({ ownedCards: Object.keys(gameState.config.cardPool) });
      updateUi({ cardsInfoOpen: true });
      return Array.from(document.querySelectorAll('#cardsInfoContent .offer-card-offer')).map(function(el) {
        const box = el.querySelector('.card-text-box');
        const ex = el.querySelector('.card-explainer');
        return {
          id: el.dataset.offerId, over: box.scrollHeight - box.clientHeight,
          rules: parseFloat(getComputedStyle(el.querySelector('.offer-card-text')).fontSize),
          explainer: ex ? parseFloat(getComputedStyle(ex).fontSize) : null
        };
      });
    });
    assert.strictEqual(v.length, 50, 'every pool card drawn offer-size');
    v.forEach(function(c) {
      assert.ok(c.over <= 0, c.id + ' overflows by ' + c.over + 'px');
      assert.ok(c.rules >= 15 && c.rules <= 23 && (23 - c.rules) % 2 === 0, c.id + ' rules ' + c.rules);
      if (c.explainer !== null) {
        assert.ok(c.explainer >= 15 && c.explainer === Math.max(15, c.rules - 4), c.id + ' explainer ' + c.explainer + ' beside rules ' + c.rules);
      }
    });
    assert.ok(v.some(function(c) { return c.rules < 23; }), 'at least one long card stepped down');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-153 the hover boxes of mods and artifacts carry the explainer as a dim line under the text', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[playerFaceIndex(5)] = Object.assign({}, faces[playerFaceIndex(5)], { modId: 'blight' });
      updateDie({ faces: faces });
      updateRun({ artifacts: ['plague_bell'] });
      const symbolTip = Array.from(document.querySelectorAll('#playerDieList .face-symbol .hover-tip')).find(function(t) { return t.textContent.indexOf('Blight') === 0; });
      const last = function(tip) { const k = tip.lastElementChild; return k.className + ' | ' + k.textContent; };
      return {
        symbol: last(symbolTip),
        box: Array.from(faceModBox(getPlayerFace(5), 'blight').children).map(function(d) { return d.className; }),
        offer: last(renderOfferSymbol(offerCardSpecForMod('blight', false, null)).querySelector('.hover-tip')),
        slotText: gameState.config.artifacts.plague_bell.text,
        slot: Array.from(document.querySelectorAll('.hover-tip-explainer')).map(function(d) { return d.textContent; }),
        colour: getComputedStyle(symbolTip.lastElementChild).color
      };
    });
    assert.strictEqual(v.symbol, 'hover-tip-explainer | ' + EXPLAINERS.poison);
    assert.strictEqual(v.offer, 'hover-tip-explainer | ' + EXPLAINERS.poison);
    assert.ok(v.box.indexOf('hover-tip-explainer') === v.box.indexOf('face-tip-text') + 1, 'faceModBox: explainer right under the text ' + JSON.stringify(v.box));
    assert.strictEqual(v.colour, 'rgb(154, 154, 154)');
    if (/poison/i.test(v.slotText)) assert.ok(v.slot.indexOf(EXPLAINERS.poison) !== -1, 'artifact slot hover');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 6. D-153 texts ----------

  await runTest('D-153 Ordain and Elevation texts', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => [MOD_DESCRIPTION.ordain, MOD_DESCRIPTION.elevation]);
    assert.deepStrictEqual(v, ['Deal 10 damage. This face gains 1 weight.', 'Deal 10 damage. The face above gains 1 weight.']);
    await page.close();
  });

  // ---------- 7. D-153 status icons ----------

  await runTest('D-153 status icons spell the word then the number; the enemy\'s poison, awe, Siphon and Stigma hovers are the explainers', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      updateEnemy({ poisonStacks: 4, wrath: 3, aweStacks: 3, siphonStacks: 3, stigmaStacks: 2 });
      updatePlayer({ poisonStacks: 4, penitenceActive: true, penitenceTurnsRemaining: 2, drainNextRound: 1 });
      updateTurn({ sealedFaces: [5] });
      const read = function(id) {
        return Array.from(document.querySelectorAll('#' + id + ' .status-icon')).map(function(el) {
          return [el.firstChild.textContent, el.querySelector('.hover-tip').textContent];
        });
      };
      return { enemy: read('enemyStatusRow'), player: read('playerStatusRow') };
    });
    assert.deepStrictEqual(v.enemy.map(function(r) { return r[0]; }), ['Poison 4', 'Wrath 3', 'Awe 3', 'Siphon 3', 'Stigma 2']);
    assert.deepStrictEqual(v.player.map(function(r) { return r[0]; }), ['Poison 4', 'Penitence', 'Drain 1', 'Sealed']);
    assert.deepStrictEqual([v.enemy[0][1], v.enemy[2][1], v.enemy[3][1], v.enemy[4][1]], [EXPLAINERS.poison, EXPLAINERS.awe, EXPLAINERS.siphon, EXPLAINERS.stigma]);
    assert.strictEqual(v.enemy[1][1], 'Wrath: each Attack deals this much more.');
    assert.ok(v.player[0][1].indexOf('Poison') === 0 && v.player[0][1] !== EXPLAINERS.poison, 'the player poison hover stays as it was');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 8-10. D-154 the four doors ----------

  await runTest('D-154 the choose step: title, subtitle, a door per available action in order, Skip; the face row hidden', async () => {
    const page = await freshFightPage(browser);
    await fontsReady(page);
    const v = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[playerFaceIndex(4)] = Object.assign({}, faces[playerFaceIndex(4)], { modId: 'smite' });
      updateDie({ faces: faces });
      openDieActionScreen('reward');
      const panel = document.getElementById('dieActionPanel');
      const sub = panel.querySelector('.die-door-sub');
      const doors = Array.from(panel.querySelectorAll('.die-door'));
      const skip = panel.querySelector('.die-door-skip');
      const cs = function(el) { return getComputedStyle(el); };
      return {
        title: panel.querySelector('.die-action-title').textContent,
        sub: sub.textContent, subStyle: cs(sub).fontSize + ' ' + cs(sub).fontFamily.split(',')[0] + ' ' + cs(sub).color,
        actions: Array.from(panel.querySelectorAll('button')).map(function(b) { return b.dataset.action; }),
        doors: doors.map(function(d) {
          return {
            tag: d.tagName, size: cs(d).width + ' ' + cs(d).height, name: d.querySelector('.die-door-name').textContent,
            desc: d.querySelector('.die-door-desc').textContent, tip: !!d.querySelector('.hover-tip'),
            outer: cs(d.querySelector('.die-door-outer')).backgroundColor, inner: cs(d.querySelector('.die-door-inner')).backgroundColor,
            innerSize: cs(d.querySelector('.die-door-inner')).width + ' ' + cs(d.querySelector('.die-door-inner')).height,
            outerClip: cs(d.querySelector('.die-door-outer')).clipPath,
            nameStyle: cs(d.querySelector('.die-door-name')).fontSize + ' ' + cs(d.querySelector('.die-door-name')).color,
            descStyle: cs(d.querySelector('.die-door-desc')).fontSize + ' ' + cs(d.querySelector('.die-door-desc')).color,
            line: cs(d.querySelector('.die-door-line')).height + ' ' + cs(d.querySelector('.die-door-line')).backgroundColor,
            bottom: d.getBoundingClientRect().bottom
          };
        }),
        gap: cs(panel.querySelector('.die-doors')).columnGap,
        skip: skip.textContent + ' | ' + cs(skip).borderTopWidth + ' ' + cs(skip).borderTopColor + ' | ' + cs(skip).fontSize + ' ' + cs(skip).color,
        bandD: cs(document.querySelector('#fightScreen .band-d')).display
      };
    });
    assert.strictEqual(v.title, 'Choose');
    assert.strictEqual(v.sub, 'One change to your die. It lasts the whole run.');
    assert.strictEqual(v.subStyle, '26px VT323 rgb(156, 150, 132)');
    assert.deepStrictEqual(v.actions, ['Load', 'Strengthen', 'Purify', 'Remove', 'Skip']);
    assert.strictEqual(v.gap, '48px');
    v.doors.forEach(function(d) {
      assert.strictEqual(d.tag, 'BUTTON');
      assert.strictEqual(d.size, '260px 500px');
      assert.strictEqual(d.desc, DOOR_TEXT[d.name], d.name + ' description');
      assert.strictEqual(d.tip, false, d.name + ' carries no hover text');
      assert.deepStrictEqual([d.outer, d.inner, d.innerSize], ['rgb(58, 59, 63)', 'rgb(10, 10, 12)', '248px 488px']);
      assert.ok(d.outerClip.indexOf('polygon(0px 60px, 20px 60px, 20px 36px') === 0, d.outerClip);
      assert.deepStrictEqual([d.nameStyle, d.descStyle, d.line], ['18px rgb(244, 244, 244)', '25px rgb(232, 228, 208)', '4px rgb(28, 28, 31)']);
      assert.strictEqual(d.bottom, v.doors[0].bottom, 'bottoms aligned');
    });
    assert.strictEqual(v.skip, 'Skip. Take nothing. | 2px rgb(58, 59, 63) | 24px rgb(184, 178, 160)');
    assert.strictEqual(v.bandD, 'none', 'the face row is hidden while the doors show');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-154 a door on hover and on keyboard focus: gold, raised 12px, glowing; a click calls the same function', async () => {
    const page = await freshFightPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); });
    const read = () => page.evaluate(() => {
      const d = document.querySelector('.die-door[data-action="Strengthen"]');
      const cs = function(el) { return getComputedStyle(el); };
      return { outer: cs(d.querySelector('.die-door-outer')).backgroundColor, icon: cs(d.querySelector('svg')).color,
        name: cs(d.querySelector('.die-door-name')).color, line: cs(d.querySelector('.die-door-line')).backgroundColor,
        transform: cs(d).transform, filter: cs(d).filter };
    });
    const rest = await read();
    assert.deepStrictEqual([rest.outer, rest.icon, rest.transform], ['rgb(58, 59, 63)', 'rgb(156, 150, 132)', 'none']);
    await page.hover('.die-door[data-action="Strengthen"]');
    await page.waitForTimeout(300);
    const hover = await read();
    assert.deepStrictEqual([hover.outer, hover.icon, hover.name, hover.line], ['rgb(251, 191, 36)', 'rgb(251, 191, 36)', 'rgb(251, 191, 36)', 'rgb(251, 191, 36)']);
    assert.strictEqual(hover.transform, 'matrix(1, 0, 0, 1, 0, -12)');
    assert.strictEqual(hover.filter, 'drop-shadow(rgba(251, 191, 36, 0.45) 0px 0px 22px)');
    await page.mouse.move(0, 0);
    let focused = false;
    for (let i = 0; i < 40 && !focused; i++) {
      await page.keyboard.press('Tab');
      focused = await page.evaluate(() => document.activeElement && document.activeElement.dataset.action === 'Strengthen');
    }
    assert.ok(focused, 'Tab reaches the Strengthen door');
    await page.waitForTimeout(300);
    const focus = await read();
    assert.deepStrictEqual([focus.outer, focus.transform], ['rgb(251, 191, 36)', 'matrix(1, 0, 0, 1, 0, -12)']);
    await page.click('.die-door[data-action="Strengthen"]');
    const after = await page.evaluate(() => ({ step: dieActionStep, bandD: getComputedStyle(document.querySelector('#fightScreen .band-d')).display,
      clicked: Array.from(document.querySelectorAll('#log > div')).some(function(d) { return d.textContent === '[CLICK] Strengthen'; }) }));
    assert.deepStrictEqual(after, { step: 'strengthen_pick_face', bandD: 'grid', clicked: true }, 'the face row returns for the next step');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-154 the door icons: inline SVG 96 by 96, stroke 3, square caps, mitre joins; Load mark, Purify dashed, Strengthen bars, Remove broken face', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const faces = gameState.die.faces.slice();
      faces[playerFaceIndex(4)] = Object.assign({}, faces[playerFaceIndex(4)], { modId: 'smite' });
      updateDie({ faces: faces });
      openDieActionScreen('reward');
      const out = {};
      document.querySelectorAll('.die-door').forEach(function(d) {
        const svg = d.querySelector('svg');
        out[d.dataset.action] = {
          attrs: ['width', 'height', 'viewBox', 'fill', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'].map(function(a) { return svg.getAttribute(a); }).join(' '),
          paths: Array.from(svg.querySelectorAll('path')).map(function(p) { return [p.getAttribute('d'), p.getAttribute('fill'), p.getAttribute('stroke-dasharray'), p.getAttribute('stroke-width')]; })
        };
      });
      return out;
    });
    Object.keys(v).forEach(function(k) { assert.strictEqual(v[k].attrs, '96 96 0 0 96 96 none 3 square miter', k); });
    assert.ok(v.Load.paths.some(function(p) { return p[0] === 'M48 40 L60 60 L36 60 Z' && p[1] === 'currentColor'; }), 'Load mark filled');
    assert.ok(v.Purify.paths.some(function(p) { return p[0] === 'M48 24 L72 66 L24 66 Z' && p[2] === '5 7'; }), 'Purify front face dashed');
    assert.ok(!v.Purify.paths.some(function(p) { return p[1] === 'currentColor'; }), 'Purify has no mark');
    assert.ok(v.Strengthen.paths.some(function(p) { return p[0] === 'M48 17 L68 52 L28 52 Z' && p[1] === 'currentColor'; }), 'Strengthen front face filled');
    assert.ok(v.Strengthen.paths.some(function(p) { return p[0] === 'M20 83 H76 M20 92 H76' && p[3] === '5'; }), 'Strengthen bars');
    assert.ok(v.Remove.paths.some(function(p) { return p[0] === 'M54 6 L84 23 L54 21 Z'; }), 'Remove broken-off face');
    assert.ok(v.Remove.paths.some(function(p) { return p[0] === 'M70 37 L70 73 L40 90 L10 73 L10 37 L40 20'; }), 'Remove open outline');
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 11-12. D-154 the owned-card grid and the picked outline ----------

  await runTest('D-154 the CARDS layer and both removal pickers draw offer-size cards in a wrapping, scrolling grid; no mini size', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      updatePlayer({ ownedCards: Object.keys(gameState.config.cardPool) });
      const grid = function(sel) {
        const g = document.querySelector(sel + ' .card-grid');
        return { cards: g.querySelectorAll('.offer-card-offer').length, mini: g.querySelectorAll('[class*="mini"]').length,
          wrap: getComputedStyle(g).flexWrap, scrolls: g.scrollHeight > g.clientHeight };
      };
      updateUi({ cardsInfoOpen: true });
      const layer = grid('#cardsInfoContent');
      const layerScroll = getComputedStyle(document.getElementById('cardsInfoLayer')).overflowY;
      updateUi({ cardsInfoOpen: false });
      openRiteScreen();
      riteChooseRemoveCard();
      const rite = grid('#riteScreenPanel');
      const riteOverflow = getComputedStyle(document.querySelector('#riteScreenPanel .card-grid')).overflowY;
      closeRiteScreen();
      openShopScreen();
      shopRemovingCard = true;
      refreshInspector();
      const shop = grid('#shopPanel');
      const shopOverflow = getComputedStyle(document.querySelector('#shopPanel .card-grid')).overflowY;
      return { layer, layerScroll, rite, riteOverflow, shop, shopOverflow };
    });
    [v.layer, v.rite, v.shop].forEach(function(g) {
      assert.deepStrictEqual([g.cards, g.mini, g.wrap], [50, 0, 'wrap']);
    });
    assert.strictEqual(v.layerScroll, 'auto', 'the CARDS layer scrolls');
    assert.deepStrictEqual([v.riteOverflow, v.shopOverflow], ['auto', 'auto'], 'the pickers scroll in their panel');
    assert.ok(v.rite.scrolls && v.shop.scrolls, 'a full deck overflows and scrolls');
    assertNoErrors(page);
    await page.close();
  });

  await runTest('D-154 a clicked card\'s outline is f4f4f4; a clicked mod symbol keeps gold', async () => {
    const page = await freshFightPage(browser);
    const v = await page.evaluate(() => {
      const holder = document.createElement('div');
      document.body.appendChild(holder);
      const card = renderCard('strike', { size: 'offer', onClick: function() {} });
      const symbol = renderOfferSymbol(offerCardSpecForMod('smite', false, function() {}));
      holder.appendChild(card);
      holder.appendChild(symbol);
      card.click();
      const cardOutline = getComputedStyle(card).outlineColor;
      symbol.click();
      return [cardOutline, getComputedStyle(symbol).outlineColor];
    });
    assert.deepStrictEqual(v, ['rgb(244, 244, 244)', 'rgb(251, 191, 36)']);
    assertNoErrors(page);
    await page.close();
  });

  // ---------- 13. D-151 Vigil ----------

  await runTest('D-151 Vigil is rare, effect unchanged; mod tiers 13/8/5', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const counts = {};
      Object.keys(gameState.config.mods).forEach(function(id) { const t = gameState.config.mods[id].tier; if (t) counts[t] = (counts[t] || 0) + 1; });
      return { tier: gameState.config.mods.vigil.tier, counts: counts, base: GAME_CONFIG.VIGIL_BASE_DAMAGE };
    });
    assert.strictEqual(v.tier, 'rare');
    assert.deepStrictEqual(v.counts, { basic: 13, uncommon: 8, rare: 5 });
    assert.strictEqual(v.base, 4);
    await page.close();
  });

  // ---------- 14. KI-64 the chain-loop freeze ----------

  const loopCases = [[150, 49, 0], [600, 199, 0], [100000, 500, 98500]];
  for (const c of loopCases) {
    await runTest('KI-64 the Rosary + Reliquary Chain loop at enemy HP ' + c[0] + ': ' + c[1] + ' triggers, stall under ' + STALL_GOAL_MS + ' ms, drawn once', async () => {
      const page = await fightWithLoop(browser, c[0]);
      const v = await timeLoop(page);
      console.log('  HP ' + c[0] + ': ' + v.ms.toFixed(1) + ' ms, ' + v.triggers + ' triggers, ' + v.draws + ' draws');
      assert.strictEqual(v.triggers, c[1]);
      assert.strictEqual(Math.max(0, v.hp), c[2], 'enemy HP after the loop');
      assert.ok(v.ms < STALL_GOAL_MS, 'stall ' + v.ms + ' ms');
      assert.ok(v.draws < 20, v.draws + ' screen draws for ' + c[1] + ' triggers');
      assert.strictEqual(v.unisonLines, Math.ceil(c[1] / 2), 'every Unison trigger still logs its line');
      assert.strictEqual(v.guardLines, c[0] === 100000 ? 1 : 0);
      const damagePops = v.shown.filter(function(s) { return s.indexOf('enemyArtBox|damage|') === 0; });
      assert.deepStrictEqual(damagePops, ['enemyArtBox|damage|-' + (c[0] - c[2])], 'one climbing total on the enemy (D-87)');
      assert.deepStrictEqual(page._pageErrors, []);
      await page.close();
    });
  }

  await browser.close();
  const failed = report('BUILD 190');
  process.exit(failed > 0 ? 1 : 0);
})();
