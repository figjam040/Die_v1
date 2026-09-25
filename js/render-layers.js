// The reward layer and the info layers: the offer panel, the die action
// (Load, Strengthen, Purify, Remove), card and artifact rewards, the rite,
// The Font, the shop, and the DIE/ARTIFACTS/CARDS layers. Each screen's
// step variables are UI-flow bookkeeping, not game state, so they live
// here as top-level lets rather than in gameState.

// ---------- THE ONE OFFER PANEL (D-86) ----------
// Die action, card reward, artifact reward, shop and The Font all render
// through renderOfferPanel(). Nothing here is static HTML — every panel
// is built from gameState on every refreshInspector() (KI-3).

// D-110 — the Load offer's and the artifact offer's choice: the symbol
// alone (art/mods/<id>.png or art/artifacts/<id>.png), no frame and no
// visible text unless the file is missing, when the name stands in. The
// name, tier (in its tier colour), tag and text live in a .hover-tip.
function renderOfferSymbol(spec) {
  const el = document.createElement('div');
  el.className = 'offer-symbol' + (spec.chosen ? ' offer-card-chosen' : '') + (spec.disabled ? ' offer-card-disabled' : '');
  el.dataset.offerId = spec.id;

  const label = document.createElement('span');
  label.className = 'offer-symbol-label';
  label.textContent = spec.name;
  el.appendChild(label);
  if (spec.artPath) {
    const img = document.createElement('img');
    img.className = 'offer-symbol-img';
    img.alt = '';
    img.onload = function() { label.style.display = 'none'; };
    img.onerror = function() { img.style.display = 'none'; };
    img.src = spec.artPath;
    el.appendChild(img);
  }

  setHoverTip(el, [spec.name, spec.tierText, spec.tagText, spec.text]);
  const tierLine = el.querySelector('.hover-tip').children[1];
  tierLine.style.color = GAME_CONFIG.TIER_COLOURS[(spec.tierText || '').toLowerCase()] || GAME_CONFIG.TIER_COLOURS.basic;

  if (spec.onClick && !spec.disabled) {
    el.addEventListener('click', function() { offerCardHandleClick(el, spec.onClick); });
  }
  return el;
}

// D-106 — every offer card/symbol click gives it a gold outline and
// dims its siblings in the same offer group immediately, then defers the
// real effect (closing the layer, moving to the next step) by
// OFFER_PICK_HIGHLIGHT_MS so the highlight is actually seen before the
// layer moves on.
function offerCardHandleClick(card, onClick) {
  const group = card.parentElement;
  if (group) {
    Array.prototype.forEach.call(group.children, function(sib) {
      sib.classList.toggle('offer-card-picked', sib === card);
      sib.classList.toggle('offer-card-dimmed', sib !== card);
    });
  } else {
    card.classList.add('offer-card-picked');
  }
  setTimeout(onClick, GAME_CONFIG.OFFER_PICK_HIGHLIGHT_MS);
}

// The tag line every card shows — a piece's synergy tags, or NONE.
function offerTagText(tags) {
  return (tags && tags.length) ? tags.join(' ').toUpperCase() : 'NONE';
}

function renderOfferPanel(panel, spec) {
  panel.style.display = 'flex';
  panel.innerHTML = '';

  // Class kept from the pre-154 panels: every panel's title reads from it.
  const title = document.createElement('div');
  title.className = 'die-action-title';
  title.textContent = spec.title;
  panel.appendChild(title);

  (spec.extra || []).forEach(function(el) { panel.appendChild(el); });

  if ((spec.cards && spec.cards.length) || spec.skip) {
    const body = document.createElement('div');
    body.className = 'offer-body';

    const cards = document.createElement('div');
    cards.className = 'offer-cards';
    const cardRenderer = spec.cardRenderer || renderOfferCard;
    const cardEls = (spec.cards || []).map(function(c) {
      const el = cardRenderer(c);
      cards.appendChild(el);
      return el;
    });
    // D-106 — a card already chosen this render (Load's own second step)
    // carries the same gold outline a fresh click gives, its siblings the
    // same dim, with no click needed.
    if ((spec.cards || []).some(function(c) { return c.chosen; })) {
      cardEls.forEach(function(el, i) {
        el.classList.toggle('offer-card-picked', !!spec.cards[i].chosen);
        el.classList.toggle('offer-card-dimmed', !spec.cards[i].chosen);
      });
    }
    body.appendChild(cards);

    if (spec.skip) {
      const skipBtn = document.createElement('button');
      skipBtn.className = 'offer-skip';
      skipBtn.textContent = spec.skip.label;
      skipBtn.addEventListener('click', spec.skip.onClick);
      body.appendChild(skipBtn);
    }
    panel.appendChild(body);
  }

  if (spec.smallRow && spec.smallRow.length) {
    const small = document.createElement('div');
    small.className = 'offer-small-row';
    spec.smallRow.forEach(function(entry) {
      const btn = document.createElement('button');
      btn.className = 'offer-small';
      btn.textContent = entry.label;
      btn.disabled = !!entry.disabled;
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = entry.text;
      btn.appendChild(tip);
      btn.addEventListener('click', entry.onClick);
      small.appendChild(btn);
    });
    panel.appendChild(small);
  }

  // The panel's own button row (the die action menu, the Font's controls)
  // — kept on the class the pre-154 panels used.
  if (spec.buttonRow) panel.appendChild(spec.buttonRow);

  // no second die row: the instruction line is the panel's
  // own content, sitting just above the fight's own face row (#playerDieList,
  // outside this panel entirely), which currentPlayerDiePickConfig() wires
  // as the real picker for a face-picking step.
  if (spec.instruction) {
    const inst = document.createElement('div');
    inst.className = 'offer-instruction';
    inst.textContent = spec.instruction;
    panel.appendChild(inst);
  }
}

// ---------- DIE ACTION SCREEN (post-fight Load / Strengthen / Skip) ----------
// Player-facing — this is the reward loop the whole project has been
// building toward, not a dev tool. Flow state (which step of the screen is
// showing, which mod was offered/picked) is UI-flow bookkeeping, not game
// state affecting win/loss or damage — kept as module-level variables, the
// same convention playerRollResolved/lastEnemyHp already use, rather than
// added to gameState.

let dieActionStep = null; // null | 'choose' | 'load_pick_mod' | 'load_pick_face' | 'strengthen_pick_face' | 'purify_pick_face' | 'remove_pick_face'
let dieActionMods = []; // the (up to) 3 mod ids offered this pass
let dieActionChosenModId = null;

// Third Eye's own UI-flow flag, same convention — true while the button is
// toggled on and the next real player-die face click chooses the roll.
let thirdEyeChoosing = false;

// Consecrate is the class anchor, not a reward, per SCOPE — V1.
const DIE_ACTION_EXCLUDED_MOD_IDS = ['consecrate'];

// Which flow opened the die action panel — 'reward' (a fight win) or
// 'rite'. Read once in closeDieActionScreen() to decide what happens next.
let dieActionOrigin = 'reward';

// How many die actions the current 'reward' flow still owes the player —
// 1 for a normal fight, 2 for the elite's extra action. Set by the caller
// before opening the panel, never reset inside openDieActionScreen()
// itself since it's also called again mid-loop for the elite's second action.
let dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;

function openDieActionScreen(origin) {
  dieActionOrigin = origin || 'reward';
  dieActionStep = 'choose';
  dieActionMods = [];
  dieActionChosenModId = null;
  refreshInspector();
}

function closeDieActionScreen() {
  dieActionStep = null;
  dieActionMods = [];
  dieActionChosenModId = null;
  refreshInspector();
  const origin = dieActionOrigin;
  dieActionOrigin = 'reward';
  if (origin === 'rite') {
    // A rite's die-action choice never offers a card reward — a shop opens instead.
    openShopScreen();
    return;
  }
  if (origin === 'shop') {
    // A shop's own Strengthen purchase returns to the shop, not the map.
    shopStep = 'open';
    refreshInspector();
    return;
  }
  if (origin === 'event') {
    // The Font's own Nat 20 Load offer — no card reward, straight to the map.
    advanceRun();
    return;
  }
  // The elite's extra action — decrement and reopen if any remain.
  dieActionsRemaining -= 1;
  if (dieActionsRemaining > 0) {
    log('[DIE ACTION] elite reward: ' + dieActionsRemaining + ' die action(s) remaining');
    openDieActionScreen();
    return;
  }
  // Stage 1.11: the card reward screen always follows the die action panel
  // once it resolves — Load/Strengthen/Skip all funnel through this same
  // close function, so this is the one place that satisfies "appears...
  // after the Load/Strengthen/Skip die action panel is resolved, not
  // before it" regardless of which path was taken or whether this screen
  // was reached via a real win or the Skip to Die Action dev shortcut.
  openCardRewardScreen();
}

// Every unloaded, non-anchor mod — the exact pool dieActionChooseLoad()
// draws its 3-mod offer from (D-54). Factored out so renderDieActionPanel()'s
// 'choose' step can gate the Load button on the same count.
function eligibleLoadModIds() {
  const loadedModIds = [];
  gameState.die.faces.forEach(function(f) {
    if (f.modId !== null) loadedModIds.push(f.modId);
    if (f.modId2) loadedModIds.push(f.modId2);
  });
  return Object.keys(gameState.config.mods).filter(function(modId) {
    return gameState.config.mods[modId].tier != null &&
      DIE_ACTION_EXCLUDED_MOD_IDS.indexOf(modId) === -1 && loadedModIds.indexOf(modId) === -1;
  });
}

// Which GAME_CONFIG.TIER_SPLIT table (one weight per TIER_ORDER tier) a
// reward/offer should roll against — decided by the slot the win (or
// rite) came from. A rite's Load offer shares the 'fight' split.
function currentOfferTierSplit(origin) {
  if (origin === 'rite') return GAME_CONFIG.TIER_SPLIT.fight;
  const cs = gameState.run.currentSlot;
  if (cs === 'boss') return GAME_CONFIG.TIER_SPLIT.boss;
  if (cs === null || cs === 'opening') return GAME_CONFIG.TIER_SPLIT.fight;
  const wonSlot = gameState.run.act[cs.lane][cs.index];
  return wonSlot.label === 'Elite' ? GAME_CONFIG.TIER_SPLIT.elite : GAME_CONFIG.TIER_SPLIT.fight;
}

function dieActionChooseLoad() {
  const eligible = eligibleLoadModIds();
  // Belt underneath the Load button's own hide-below-3 gate: a stale
  // caller that reaches this function anyway converts to Strengthen
  // instead, silently, rather than building a short or duplicated offer.
  if (eligible.length < 3) {
    dieActionChooseStrengthen();
    return;
  }
  const pool = eligible.map(function(modId) { return { id: modId, tier: gameState.config.mods[modId].tier }; });
  const split = currentOfferTierSplit(dieActionOrigin);
  dieActionMods = pickTieredOffer(pool, split, 3).map(function(o) { return o.id; });
  dieActionStep = 'load_pick_mod';
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'load', offered: dieActionMods.slice(), picked: null }]) });
  refreshInspector();
}

// Face 20 is Strengthen-eligible until it reaches its weight cap; any other
// loaded face always is. Face 1 never is.
function isStrengthenEligibleFace(f) {
  if (f.number === 1) return false;
  if (f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return !isFaceTwentyAtCap(f.number);
  return f.modId !== null;
}

function strengthenFaceExists() {
  return gameState.die.faces.some(isStrengthenEligibleFace);
}

function dieActionChooseStrengthen() {
  dieActionStep = 'strengthen_pick_face';
  refreshInspector();
}

// A face is purifiable if it carries a mod and isn't one of the three
// fixed faces (1 NAT_ONE, 10 the anchor, 20 NAT_TWENTY).
function purifiableFaceExists() {
  return gameState.die.faces.some(function(f) {
    return f.number !== 1 && f.number !== 10 && f.number !== GAME_CONFIG.DIE_SIZE.PLAYER && f.modId !== null;
  });
}

function dieActionChoosePurify() {
  dieActionStep = 'purify_pick_face';
  refreshInspector();
}

function dieActionChooseSkip() {
  log('[DIE ACTION] skipped');
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'skip' }]) });
  appendTranscript('SKIP');
  closeDieActionScreen();
}

function dieActionPickMod(modId) {
  dieActionChosenModId = modId;
  dieActionStep = 'load_pick_face';
  refreshInspector();
}

function dieActionPickLoadFace(faceNumber) {
  const modName = gameState.config.mods[dieActionChosenModId].name;
  const newFaces = gameState.die.faces.slice();
  const index = playerFaceIndex(faceNumber);
  const face = newFaces[index];
  // A blank face fills modId; an already-loaded face fills modId2. Both
  // slots full is a defensive refusal — the picker's own eligibility
  // should never offer such a face. Cap two, never three.
  if (face.modId === null) {
    newFaces[index] = Object.assign({}, face, { modId: dieActionChosenModId });
    updateDie({ faces: newFaces });
    log('[DIE ACTION] loaded ' + modName + ' onto face ' + faceNumber);
  } else if (!face.modId2) {
    newFaces[index] = Object.assign({}, face, { modId2: dieActionChosenModId });
    updateDie({ faces: newFaces });
    log('[DIE ACTION] loaded ' + modName + ' onto face ' + faceNumber + ' as a second mod');
  } else {
    log('[DIE ACTION] cannot load onto face ' + faceNumber + ' — already holds two mods');
    return;
  }
  // Patches the most recent still-unresolved 'load' event with the mod
  // actually picked. Searches from the end so an event pushed between
  // offer and pick can't corrupt the wrong entry.
  const events = gameState.runRecord.dieActionEvents.slice();
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'load' && events[i].picked === null) {
      events[i] = Object.assign({}, events[i], { picked: dieActionChosenModId });
      break;
    }
  }
  updateRunRecord({ dieActionEvents: events });
  playAudioEvent('die_action_load');
  appendTranscript('LOAD ' + dieActionChosenModId + ' > ' + faceNumber);
  closeDieActionScreen();
}

// The one Strengthen action, shared by the post-fight die action panel and
// the shop. Leaden Face buys a second call to strengthenFace() — still the
// only place any face's weight is written.
function dieActionPickStrengthenFace(faceNumber) {
  let newWeight = strengthenFace(faceNumber);
  if (hasArtifact('leaden_face')) {
    if (isFaceTwentyAtCap(faceNumber)) {
      log('[ARTIFACT] Leaden Face: face 20 at the cap');
    } else {
      for (let i = 1; i < GAME_CONFIG.ARTIFACTS.LEADEN_FACE_STRENGTHEN; i++) {
        newWeight = strengthenFace(faceNumber);
      }
      log('[ARTIFACT] Leaden Face: Strengthen added ' + GAME_CONFIG.ARTIFACTS.LEADEN_FACE_STRENGTHEN + ' weight');
    }
  }
  log('[DIE ACTION] strengthened face ' + faceNumber + ' to weight ' + newWeight);
  playAudioEvent('die_action_strengthen');
  appendTranscript('STRENGTHEN ' + faceNumber + ' > ' + newWeight);
  closeDieActionScreen();
}

// Removes every mod on a face, resetting modId/modId2/modData to what a
// fresh blank face holds — weight is untouched. The removed mods need no
// separate pool bookkeeping: eligibleLoadModIds() re-derives its offer
// live off gameState.die.faces, so a purified mod is eligible for Load
// again the instant this returns (D-07).
function dieActionPickPurifyFace(faceNumber) {
  const face = getPlayerFace(faceNumber);
  const removedIds = [face.modId];
  if (face.modId2) removedIds.push(face.modId2);
  const removedNames = removedIds.map(function(id) { return gameState.config.mods[id].name; });

  const newFaces = gameState.die.faces.slice();
  newFaces[playerFaceIndex(faceNumber)] = { number: face.number, modId: null, modId2: null, weight: face.weight };
  updateDie({ faces: newFaces });

  log('[DIE] purify face ' + faceNumber + ': ' + removedNames.join(', ') + ' removed');
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'purify', faceNumber: faceNumber, removed: removedIds.slice() }]) });
  playAudioEvent('die_action_strengthen');
  appendTranscript('PURIFY ' + faceNumber + ' > ' + removedNames.join(','));
  closeDieActionScreen();
}

// D-119 — Remove: a blank face other than 1, 20 and the anchor's own face,
// only while the die still has more than DIE_MIN_FACES faces. A loaded
// face never qualifies; Purify it first.
function isRemoveEligibleFace(f) {
  if (gameState.die.faces.length <= GAME_CONFIG.DIE_MIN_FACES) return false;
  if (f.number === 1 || f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return false;
  if (f.number === 10) return false;
  return f.modId === null && !f.modId2;
}

function removableFaceExists() {
  return gameState.die.faces.some(isRemoveEligibleFace);
}

function dieActionChooseRemove() {
  dieActionStep = 'remove_pick_face';
  refreshInspector();
}

// Deletes the face from the die for the rest of the run: the face row,
// the roll bag, rollOdds() and the DIE layer all read gameState.die.faces,
// so each loses the face the moment this writes.
function dieActionPickRemoveFace(faceNumber) {
  const face = getPlayerFace(faceNumber);
  if (!face || !isRemoveEligibleFace(face)) {
    log('[DIE] remove refused: face ' + faceNumber + ' is not eligible');
    return;
  }
  updateDie({ faces: gameState.die.faces.filter(function(f) { return f.number !== faceNumber; }) });
  log('[DIE] Removed face ' + faceNumber + ', die now ' + gameState.die.faces.length + ' faces');
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'remove', faceNumber: faceNumber }]) });
  playAudioEvent('die_action_remove');
  appendTranscript('Removed face ' + faceNumber);
  closeDieActionScreen();
}

// the one place a die-action face-picking step's isEligible/
// onPick/showBecomes live. Read both by refreshInspector() (to wire the
// fight's own face row, #playerDieList, as the picker) and by
// renderDieActionPanel() (nothing else needs the config itself there, only
// the step check).
function currentPlayerDiePickConfig() {
  if (dieActionStep === 'load_pick_face') {
    return {
      isEligible: function(f) {
        return f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2;
      },
      onPick: dieActionPickLoadFace,
      showBecomes: false
    };
  }
  if (dieActionStep === 'strengthen_pick_face') {
    return {
      isEligible: function(f) {
        if (f.number === 1) return false;
        return isStrengthenEligibleFace(f);
      },
      onPick: dieActionPickStrengthenFace,
      showBecomes: true
    };
  }
  if (dieActionStep === 'purify_pick_face') {
    return {
      isEligible: function(f) {
        if (f.number === 1 || f.number === 10 || f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return false;
        return f.modId !== null;
      },
      onPick: dieActionPickPurifyFace,
      showBecomes: false
    };
  }
  if (dieActionStep === 'remove_pick_face') {
    return { isEligible: isRemoveEligibleFace, onPick: dieActionPickRemoveFace, showBecomes: false };
  }
  return null;
}

function renderDieActionPanel() {
  const panel = document.getElementById('dieActionPanel');
  if (!panel) return;

  if (dieActionStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  let titleText = '';
  let instruction = null;
  let buttonRow = null;
  let cards = [];

  const row = document.createElement('div');
  row.className = 'die-action-row';

  // D-115 — every step of this layer is titled Choose; what to choose
  // rides the instruction line (a face-picking step) or the choices themselves.
  titleText = 'Choose';

  if (dieActionStep === 'choose') {
    buttonRow = row;

    // Load shows whenever a blank face exists among faces 2-19 AND the
    // pool hasn't run dry (D-54) — a real 3-mod offer must be buildable.
    const blankFaceExists = gameState.die.faces.some(function(f) {
      return f.number !== 1 && f.number !== GAME_CONFIG.DIE_SIZE.PLAYER && f.modId === null;
    });
    if (blankFaceExists && eligibleLoadModIds().length >= 3) {
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', function() { log('[CLICK] Load'); dieActionChooseLoad(); });
      row.appendChild(loadBtn);
    }

    if (strengthenFaceExists()) {
      const strengthenBtn = document.createElement('button');
      strengthenBtn.textContent = 'Strengthen';
      strengthenBtn.addEventListener('click', function() { log('[CLICK] Strengthen'); dieActionChooseStrengthen(); });
      row.appendChild(strengthenBtn);
    }

    // Purify offers only when a purifiable face exists (D-54-style hide).
    if (purifiableFaceExists()) {
      const purifyBtn = document.createElement('button');
      purifyBtn.textContent = 'Purify';
      setHoverTip(purifyBtn, 'Take every mod off one face. The face stays as heavy as it was.');
      purifyBtn.addEventListener('click', function() { log('[CLICK] Purify'); dieActionChoosePurify(); });
      row.appendChild(purifyBtn);
    }

    // D-119 — hidden when no blank face qualifies or the die is at DIE_MIN_FACES.
    if (removableFaceExists()) {
      const removeBtn = document.createElement('button');
      removeBtn.textContent = 'Remove';
      setHoverTip(removeBtn, 'Take one blank face off the die for the rest of the run. The die keeps at least ' + GAME_CONFIG.DIE_MIN_FACES + ' faces.');
      removeBtn.addEventListener('click', function() { log('[CLICK] Remove'); dieActionChooseRemove(); });
      row.appendChild(removeBtn);
    }

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', function() { log('[CLICK] Skip'); dieActionChooseSkip(); });

    row.appendChild(skipBtn);

  } else if (dieActionStep === 'load_pick_mod' || dieActionStep === 'load_pick_face') {
    // Both Load steps show the same three mod cards; the second step adds
    // the face picker and marks the chosen card.
    if (dieActionMods.length === 0) {
      const none = document.createElement('div');
      none.className = 'die-action-empty';
      none.textContent = 'No eligible mods to offer.';
      buttonRow = row;
      row.appendChild(none);
    }

    cards = dieActionMods.map(function(modId) {
      return offerCardSpecForMod(modId, modId === dieActionChosenModId, function() {
        log('[CLICK] ' + gameState.config.mods[modId].name);
        dieActionPickMod(modId);
      });
    });
  }

  if (dieActionStep === 'load_pick_face') {
    // Any loaded, non-Nat face that isn't already holding two mods is a
    // valid target — blank faces and already-loaded faces are both
    // eligible together, always.
    const chosenName = gameState.config.mods[dieActionChosenModId].name.toUpperCase();
    instruction = chosenName + ', CHOOSE A FACE BELOW';

  } else if (dieActionStep === 'strengthen_pick_face') {
    instruction = 'CHOOSE A FACE TO STRENGTHEN';

  } else if (dieActionStep === 'purify_pick_face') {
    instruction = 'CHOOSE A FACE TO PURIFY';

  } else if (dieActionStep === 'remove_pick_face') {
    instruction = 'CHOOSE A BLANK FACE TO REMOVE';
  }

  // no die row of this panel's own: the fight's own face row
  // (#playerDieList) is wired as the picker by refreshInspector(), via
  // currentPlayerDiePickConfig().
  const isLoadStep = dieActionStep === 'load_pick_mod' || dieActionStep === 'load_pick_face';
  renderOfferPanel(panel, {
    title: titleText,
    cards: cards,
    cardRenderer: isLoadStep ? renderOfferSymbol : undefined,
    skip: null,
    buttonRow: buttonRow,
    instruction: instruction
  });
}

// The card spec for one mod — used by the Load offer.
function offerCardSpecForMod(modId, chosen, onClick) {
  const mod = gameState.config.mods[modId];
  return {
    id: modId,
    name: mod.name,
    tierText: (mod.tier || '').toUpperCase() || 'MOD',
    artPath: 'art/mods/' + modId + '.png',
    tagText: offerTagText(mod.tags),
    text: MOD_DESCRIPTION[modId] || '',
    footText: chosen ? 'CHOSEN, PICK A FACE BELOW' : 'CLICK TO CHOOSE',
    chosen: !!chosen,
    onClick: onClick
  };
}

// The card spec for one reward-pool card. In the shop the price leads the
// foot line; the rarity line keeps the tier (D-112).
function offerCardSpecForCard(cardId, priceText, footText, disabled, onClick) {
  const card = gameState.config.cardPool[cardId] || getCard(cardId);
  return {
    id: cardId,
    name: card.name,
    tierText: cardTier(card).toUpperCase(),
    artPath: 'art/cards/' + cardId + '.png',
    tagText: offerTagText(card.tags),
    text: getCardEffectText(cardId),
    footText: priceText !== null && priceText !== undefined ? priceText + ' — ' + footText : footText,
    chosen: false,
    disabled: !!disabled,
    onClick: onClick
  };
}

// ---------- CARD REWARD SCREEN (post-fight, after the die action panel) ----------
// Same non-gameState module-level-variable convention the die action
// screen uses: this is UI-flow state, not game state.

let cardRewardStep = null; // null | 'choose'
let cardRewardOptions = []; // the 3 card ids offered this pass, always distinct

function openCardRewardScreen() {
  const pool = Object.keys(gameState.config.cardPool)
    .filter(function(id) { return gameState.config.cardPool[id].tier != null; })
    .map(function(id) { return { id: id, tier: gameState.config.cardPool[id].tier }; });
  const split = currentOfferTierSplit(dieActionOrigin);
  cardRewardOptions = pickTieredOffer(pool, split, 3).map(function(o) { return o.id; });
  cardRewardStep = 'choose';
  refreshInspector();
}

function closeCardRewardScreen() {
  cardRewardStep = null;
  cardRewardOptions = [];
  refreshInspector();
  advanceRun();
}

function cardRewardSkip() {
  log('[CARD REWARD] skipped, deck still ' + gameState.player.ownedCards.length + ' cards');
  closeCardRewardScreen();
}

function cardRewardPickCard(cardId) {
  const card = gameState.config.cardPool[cardId];
  updatePlayer({
    deck: gameState.player.deck.concat([cardId]),
    ownedCards: gameState.player.ownedCards.concat([cardId])
  });
  log('[CARD REWARD] added ' + card.name + ' to deck, deck now ' + gameState.player.ownedCards.length + ' cards');
  playAudioEvent((cardId === 'strike' || cardId === 'ward') ? 'card_reward_basic' : 'card_reward_rich');
  appendTranscript('CARD ' + cardId);
  closeCardRewardScreen();
}

function renderCardRewardPanel() {
  const panel = document.getElementById('cardRewardPanel');
  if (!panel) return;

  if (cardRewardStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  // Three cards, pick one, no face row (D-86).
  renderOfferPanel(panel, {
    title: 'Choose',
    cards: cardRewardOptions.map(function(cardId) {
      return offerCardSpecForCard(cardId, null, 'CLICK TO CHOOSE', false, function() {
        log('[CLICK] ' + gameState.config.cardPool[cardId].name);
        cardRewardPickCard(cardId);
      });
    }),
    skip: { label: 'SKIP', onClick: function() { log('[CLICK] Skip'); cardRewardSkip(); } }
  });
}

// ---------- ARTIFACT REWARD SCREEN (after an Elite win, and after a
// non-final act's Boss win, before the die reward) ----------

let artifactRewardStep = null; // null | 'choose'
let artifactRewardOptions = []; // up to 3 artifact ids offered this pass

function openArtifactRewardScreen() {
  const available = Object.keys(gameState.config.artifacts).filter(function(id) {
    return gameState.run.artifacts.indexOf(id) === -1;
  });
  if (available.length < 1) {
    openDieActionScreen();
    return;
  }
  const pool = available.slice();
  const options = [];
  while (options.length < 3 && pool.length > 0) {
    options.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  artifactRewardOptions = options;
  artifactRewardStep = 'choose';
  refreshInspector();
}

function closeArtifactRewardScreen() {
  artifactRewardStep = null;
  artifactRewardOptions = [];
  refreshInspector();
  openDieActionScreen();
}

function artifactRewardPick(artifactId) {
  const artifact = gameState.config.artifacts[artifactId];
  updateRun({ artifacts: gameState.run.artifacts.concat([artifactId]).slice(0, GAME_CONFIG.ARTIFACT_MAX) });
  log('[ARTIFACT] gained ' + artifact.name);
  appendTranscript('ARTIFACT ' + artifactId);
  closeArtifactRewardScreen();
}

function artifactRewardSkip() {
  log('[ARTIFACT] reward skipped');
  closeArtifactRewardScreen();
}

function renderArtifactRewardPanel() {
  const panel = document.getElementById('artifactRewardPanel');
  if (!panel) return;

  if (artifactRewardStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  renderOfferPanel(panel, {
    title: 'Choose',
    cardRenderer: renderOfferSymbol,
    cards: artifactRewardOptions.map(function(artifactId) {
      return offerCardSpecForArtifact(artifactId, null, 'CLICK TO CHOOSE', false, function() {
        log('[CLICK] ' + gameState.config.artifacts[artifactId].name);
        artifactRewardPick(artifactId);
      });
    }),
    skip: { label: 'SKIP', onClick: function() { log('[CLICK] Skip'); artifactRewardSkip(); } }
  });
}

// An artifact without a tags list reads NONE on the tag line so the shape
// stays identical across every offer; the rarity line is the artifact's tier.
function offerCardSpecForArtifact(artifactId, priceText, footText, disabled, onClick) {
  const artifact = gameState.config.artifacts[artifactId];
  return {
    id: artifactId,
    name: artifact.name,
    tierText: priceText !== null && priceText !== undefined ? priceText : artifact.tier.toUpperCase(),
    artPath: 'art/artifacts/' + artifactId + '.png',
    tagText: offerTagText(artifact.tags),
    text: artifact.text,
    footText: footText,
    chosen: false,
    disabled: !!disabled,
    onClick: onClick
  };
}

// ---------- RITE SCREEN ----------
// A rite slot offers a choice of heal, take a die action, or remove a
// card; the shop follows, then the map returns.

let riteStep = null; // null | 'choose' | 'remove_pick_card'

function openRiteScreen() {
  riteStep = 'choose';
  refreshInspector();
}

function closeRiteScreen() {
  riteStep = null;
  refreshInspector();
}

function riteChooseHeal() {
  const before = gameState.player.hp;
  const healedAmount = healPlayer(GAME_CONFIG.RITE_HEAL);
  const after = gameState.player.hp;
  log('[RITE] healed ' + healedAmount + ' HP (' + before + ' to ' + after + ')');
  appendTranscript('RITE heal ' + healedAmount + ' | you ' + shownHp(after) + '/' + gameState.player.maxHp);
  closeRiteScreen();
  openShopScreen();
}

function riteChooseDieAction() {
  log('[RITE] taking a die action');
  appendTranscript('RITE die action');
  closeRiteScreen();
  // Only the origin tag differs from the post-fight-win path, so
  // closeDieActionScreen() knows to advance the run rather than open a card reward.
  openDieActionScreen('rite');
}

function riteChooseRemoveCard() {
  riteStep = 'remove_pick_card';
  refreshInspector();
}

// A rite's removal is a deliberate between-fights choice: the class card
// is a valid index here like any other, unlike the in-fight discard rule.
function riteRemoveCard(index) {
  const cardId = gameState.player.ownedCards[index];
  const card = getCard(cardId);

  const newOwnedCards = gameState.player.ownedCards.slice();
  newOwnedCards.splice(index, 1);

  const newDeck = gameState.player.deck.slice();
  const deckIdx = newDeck.indexOf(cardId);
  if (deckIdx !== -1) newDeck.splice(deckIdx, 1);

  const newDiscard = gameState.player.discard.slice();
  const discardIdx = newDiscard.indexOf(cardId);
  if (discardIdx !== -1) newDiscard.splice(discardIdx, 1);

  const newHand = gameState.player.hand.slice();
  const handIdx = newHand.indexOf(cardId);
  if (handIdx !== -1) newHand.splice(handIdx, 1);

  updatePlayer({ ownedCards: newOwnedCards, deck: newDeck, discard: newDiscard, hand: newHand });
  log('[RITE] removed ' + card.name + ' from deck, deck now ' + newOwnedCards.length + ' cards');
  appendTranscript('RITE remove ' + cardId);
  closeRiteScreen();
  openShopScreen();
}

function renderRiteScreen() {
  const panel = document.getElementById('riteScreenPanel');
  if (!panel) return;

  if (riteStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  // D-116 — the rite is its own screen in the reward layer, titled Rite,
  // the fight's face row exposed beneath it like every other layer step;
  // the player's HP sits under the title in the HP red, nothing else.
  const hpLine = document.createElement('div');
  hpLine.className = 'rite-hp';
  hpLine.textContent = shownHp(gameState.player.hp) + ' / ' + gameState.player.maxHp;
  let row = document.createElement('div');
  row.className = 'die-action-row';
  let instruction = null;

  if (riteStep === 'remove_pick_card') {
    instruction = 'CHOOSE A CARD TO REMOVE';
    row = renderOwnedCardGrid(riteRemoveCard);
  } else {
    const healBtn = document.createElement('button');
    healBtn.textContent = 'Heal ' + GAME_CONFIG.RITE_HEAL + ' HP';
    healBtn.addEventListener('click', function() { log('[CLICK] Heal ' + GAME_CONFIG.RITE_HEAL + ' HP'); riteChooseHeal(); });

    const dieBtn = document.createElement('button');
    dieBtn.textContent = 'Take a die action';
    dieBtn.addEventListener('click', function() { log('[CLICK] Take a die action'); riteChooseDieAction(); });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove a card';
    removeBtn.addEventListener('click', function() { log('[CLICK] Remove a card'); riteChooseRemoveCard(); });

    row.appendChild(healBtn);
    row.appendChild(dieBtn);
    row.appendChild(removeBtn);
  }

  renderOfferPanel(panel, { title: 'Rite', extra: [hpLine], cards: [], skip: null, buttonRow: row, instruction: instruction });
}

// ---------- EVENT SCREEN — The Font (slot type 'event', id 'font') ----------
// A roll that resolves nothing: rollWithArtifacts() picks a face the same
// way a fight roll does (D-21), but the face is never passed to
// resolvePlayerRoll() — no listener dispatch, no Bound, no Nat sweep.
// Outcome is read straight off the picked face's own shape.

let eventStep = null; // null | 'open' | 'result'
let eventOutcomeText = '';

function openEventScreen() {
  eventStep = 'open';
  eventOutcomeText = '';
  updateTurn({ rolledFaceNumber: null, rollOutcome: null });
  refreshInspector();
}

function closeEventScreen() {
  eventStep = null;
  eventOutcomeText = '';
  updateTurn({ rolledFaceNumber: null, rollOutcome: null });
  refreshInspector();
  advanceRun();
}

function eventRoll() {
  if (eventStep !== 'open') return;
  const face = rollWithArtifacts(gameState.die.faces);
  playAudioEvent('roll');

  if (face.modId === 'NAT_TWENTY') {
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'nat_twenty' });
    updateRun({ gold: gameState.run.gold + GAME_CONFIG.EVENT.NAT_TWENTY_GOLD });
    log('[ANOMALY] font: rolled ' + face.number + ', outcome nat twenty, +' + GAME_CONFIG.EVENT.NAT_TWENTY_GOLD + ' gold, Load offered');
    appendTranscript('ANOMALY font: rolled ' + face.number + ' NAT 20, +' + GAME_CONFIG.EVENT.NAT_TWENTY_GOLD + ' gold');
    eventStep = null;
    openDieActionScreen('event');
    return;
  }

  if (face.modId === 'NAT_ONE') {
    const before = gameState.player.hp;
    const newHp = Math.max(before - GAME_CONFIG.EVENT.NAT_ONE_HP_LOSS, 1);
    updatePlayer({ hp: newHp });
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'nat_one' });
    eventOutcomeText = 'The water keeps what it is owed.';
    log('[ANOMALY] font: rolled ' + face.number + ', outcome nat one, hp ' + before + ' to ' + newHp);
    appendTranscript('ANOMALY font: rolled ' + face.number + ' NAT 1, hp ' + before + ' to ' + newHp);
  } else if (face.modId !== null && isFaceTwentyAtCap(face.number)) {
    updateRun({ gold: gameState.run.gold + GAME_CONFIG.EVENT.BLANK_GOLD });
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'blank' });
    eventOutcomeText = 'Coins lie on the bottom.';
    log('[ANOMALY] font: rolled ' + face.number + ', outcome blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold, face 20 at the cap');
    appendTranscript('ANOMALY font: rolled ' + face.number + ' blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold, face 20 at the cap');
  } else if (face.modId !== null) {
    const newWeight = strengthenFace(face.number);
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'mod' });
    eventOutcomeText = 'The rolled face comes up heavier.';
    log('[ANOMALY] font: rolled ' + face.number + ', outcome loaded face, weight now ' + newWeight);
    appendTranscript('ANOMALY font: rolled ' + face.number + ' loaded, weight now ' + newWeight);
  } else {
    updateRun({ gold: gameState.run.gold + GAME_CONFIG.EVENT.BLANK_GOLD });
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'blank' });
    eventOutcomeText = 'Coins lie on the bottom.';
    log('[ANOMALY] font: rolled ' + face.number + ', outcome blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold');
    appendTranscript('ANOMALY font: rolled ' + face.number + ' blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold');
  }

  eventStep = 'result';
  refreshInspector();
}

function renderEventScreen() {
  const panel = document.getElementById('eventScreenPanel');
  if (!panel) return;

  if (eventStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  // The Font's flavour goes where a title goes; ROLL, then the outcome
  // and CONTINUE, sit in the card area; the row beneath lights the face.
  const row = document.createElement('div');
  row.className = 'die-action-row offer-card-area';

  if (eventStep === 'open') {
    const rollBtn = document.createElement('button');
    rollBtn.textContent = 'ROLL';
    rollBtn.addEventListener('click', function() { log('[CLICK] ROLL'); eventRoll(); });
    row.appendChild(rollBtn);
  } else if (eventStep === 'result') {
    const outcome = document.createElement('div');
    outcome.className = 'die-action-empty';
    outcome.textContent = eventOutcomeText;
    row.appendChild(outcome);

    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'CONTINUE';
    continueBtn.addEventListener('click', function() { log('[CLICK] CONTINUE'); closeEventScreen(); });
    row.appendChild(continueBtn);
  }

  // the roll lights the fight's own face row (#playerDieList);
  // no die row of this panel's own.
  renderOfferPanel(panel, {
    title: 'A font of black water stands where the road bends. Nothing moves in it. The die goes in.',
    cards: [],
    skip: null,
    buttonRow: row
  });
}

// ---------- SHOP SCREEN (opens after every rite resolves, before the map returns) ----------

let shopStep = null; // null | 'open'
let shopRemovingCard = false; // the shop's own remove-a-card picker

function buildShopStock() {
  const pool = Object.keys(gameState.config.cardPool)
    .filter(function(id) { return gameState.config.cardPool[id].tier != null; })
    .map(function(id) { return { id: id, tier: gameState.config.cardPool[id].tier }; });
  const cards = pickTieredOffer(pool, GAME_CONFIG.TIER_SPLIT.elite, 3).map(function(o) { return o.id; });
  // One artifact slot, always an artifact this run does not already hold.
  const unheld = Object.keys(gameState.config.artifacts).filter(function(id) {
    return gameState.run.artifacts.indexOf(id) === -1;
  });
  const artifact = unheld.length > 0 ? pickRandom(unheld) : null;
  return { cards: cards, artifact: artifact, boughtCards: [], artifactBought: false, strengthenBought: false, removalBought: false };
}

// KI-36: one line, log and transcript, naming exactly what's on the
// shelf and what it costs the player right now — the same prices
// shopBuyCard()/shopBuyArtifact()/shopBuyStrengthen()/shopBuyRemoval() charge.
function logShopOpened(shop) {
  const cardParts = shop.cards.map(function(id) {
    const card = gameState.config.cardPool[id];
    const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.CARD_PRICE[card.tier]);
    return card.name + ' ' + price;
  });
  const artifactPart = shop.artifact
    ? gameState.config.artifacts[shop.artifact].name + ' ' + shopPriceWithArtifacts(GAME_CONFIG.SHOP.ARTIFACT_PRICE)
    : 'none';
  const strengthenPrice = shopPriceWithArtifacts(GAME_CONFIG.SHOP.STRENGTHEN_PRICE);
  const removalPrice = shopRemovalPrice();
  const summary = 'cards ' + cardParts.join(', ') + ' | artifact ' + artifactPart +
    ' | Strengthen ' + strengthenPrice + ' | Removal ' + removalPrice;
  log('[SHOP] opened: ' + summary);
  appendTranscript('SHOP stock ' + summary);
}

function openShopScreen() {
  shopRemovingCard = false;
  const shop = buildShopStock();
  updateRun({ shop: shop });
  logShopOpened(shop);
  shopStep = 'open';
  refreshInspector();
}

function closeShopScreen() {
  shopStep = null;
  shopRemovingCard = false;
  updateRun({ shop: null });
  refreshInspector();
  advanceRun();
}

function shopBuyCard(cardId) {
  const shop = gameState.run.shop;
  if (shop.boughtCards.indexOf(cardId) !== -1) { return; }
  const card = gameState.config.cardPool[cardId];
  const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.CARD_PRICE[card.tier]);
  if (gameState.run.gold < price) { return; }
  updateRun({ gold: gameState.run.gold - price, shop: Object.assign({}, shop, { boughtCards: shop.boughtCards.concat([cardId]) }) });
  updatePlayer({ deck: gameState.player.deck.concat([cardId]), ownedCards: gameState.player.ownedCards.concat([cardId]) });
  log('[SHOP] bought ' + card.name + ' for ' + price + ' gold');
  appendTranscript('SHOP ' + cardId + ' ' + price);
  refreshInspector();
}

// Opens the same die-row Strengthen face picker the post-fight die action
// panel uses — dieActionOrigin 'shop' tells closeDieActionScreen() to
// return to the shop instead of chaining into a card reward.
// Buys the artifact on the shelf, up to ARTIFACT_MAX held.
function shopBuyArtifact() {
  const shop = gameState.run.shop;
  if (!shop.artifact || shop.artifactBought) { return; }
  const artifact = gameState.config.artifacts[shop.artifact];
  const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.ARTIFACT_PRICE);
  if (gameState.run.gold < price) { return; }
  updateRun({
    gold: gameState.run.gold - price,
    artifacts: gameState.run.artifacts.concat([shop.artifact]).slice(0, GAME_CONFIG.ARTIFACT_MAX),
    shop: Object.assign({}, shop, { artifactBought: true })
  });
  log('[SHOP] bought ' + artifact.name + ' for ' + price + ' gold');
  appendTranscript('SHOP ' + shop.artifact + ' ' + price);
  refreshInspector();
}

function shopBuyStrengthen() {
  const shop = gameState.run.shop;
  const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.STRENGTHEN_PRICE);
  if (shop.strengthenBought || gameState.run.gold < price) { return; }
  updateRun({ gold: gameState.run.gold - price, shop: Object.assign({}, shop, { strengthenBought: true }) });
  log('[SHOP] bought Strengthen for ' + price + ' gold');
  appendTranscript('SHOP strengthen ' + price);
  shopStep = null;
  dieActionOrigin = 'shop';
  dieActionMods = [];
  dieActionChosenModId = null;
  dieActionStep = 'strengthen_pick_face';
  refreshInspector();
}

function shopBuyRemoval() {
  const shop = gameState.run.shop;
  const price = shopRemovalPrice();
  if (shop.removalBought || gameState.run.gold < price) { return; }
  shopRemovingCard = true;
  refreshInspector();
}

// Same shape as riteRemoveCard() (run-and-map.js's rite flow), kept
// separate so a shop removal returns to the shop rather than the map.
function shopRemoveCard(index) {
  const shop = gameState.run.shop;
  const price = shopRemovalPrice();
  const cardId = gameState.player.ownedCards[index];
  const card = getCard(cardId);

  const newOwnedCards = gameState.player.ownedCards.slice();
  newOwnedCards.splice(index, 1);
  const newDeck = gameState.player.deck.slice();
  const deckIdx = newDeck.indexOf(cardId);
  if (deckIdx !== -1) newDeck.splice(deckIdx, 1);
  const newDiscard = gameState.player.discard.slice();
  const discardIdx = newDiscard.indexOf(cardId);
  if (discardIdx !== -1) newDiscard.splice(discardIdx, 1);
  const newHand = gameState.player.hand.slice();
  const handIdx = newHand.indexOf(cardId);
  if (handIdx !== -1) newHand.splice(handIdx, 1);

  updatePlayer({ ownedCards: newOwnedCards, deck: newDeck, discard: newDiscard, hand: newHand });
  updateRun({ gold: gameState.run.gold - price, removalPrice: gameState.run.removalPrice + GAME_CONFIG.SHOP.REMOVAL_PRICE_STEP, shop: Object.assign({}, shop, { removalBought: true }) });
  log('[SHOP] bought Removal for ' + price + ' gold, removed ' + card.name);
  appendTranscript('SHOP removal ' + price + ' | removed ' + cardId);
  shopRemovingCard = false;
  refreshInspector();
}

function renderShopPanel() {
  const panel = document.getElementById('shopPanel');
  if (!panel) return;

  if (shopStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  const shop = gameState.run.shop;

  // The removal picker is the whole owned deck as small cards, not a
  // three-card offer.
  if (shopRemovingCard) {
    renderOfferPanel(panel, { title: 'SHOP', cards: [], skip: null, buttonRow: renderOwnedCardGrid(shopRemoveCard), instruction: 'CHOOSE A CARD TO REMOVE' });
    return;
  }

  // Three cards with the price in place of the tier, then a second row of
  // the artifact, Strengthen and removal; LEAVE in place of SKIP (D-86).
  const cards = shop.cards.filter(function(cardId) {
    return shop.boughtCards.indexOf(cardId) === -1;
  }).map(function(cardId) {
    const card = gameState.config.cardPool[cardId];
    const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.CARD_PRICE[card.tier]);
    const tooPoor = gameState.run.gold < price;
    return offerCardSpecForCard(cardId, price + 'g', tooPoor ? 'NOT ENOUGH GOLD' : 'CLICK TO BUY', tooPoor, function() {
      log('[CLICK] ' + card.name);
      shopBuyCard(cardId);
    });
  });

  const smallRow = [];
  if (shop.artifact && !shop.artifactBought) {
    const artifact = gameState.config.artifacts[shop.artifact];
    const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.ARTIFACT_PRICE);
    smallRow.push({
      label: artifact.name + ' — ' + price + 'g',
      text: artifact.text,
      disabled: gameState.run.gold < price,
      onClick: function() { log('[CLICK] ' + artifact.name); shopBuyArtifact(); }
    });
  }
  if (!shop.strengthenBought && strengthenFaceExists()) {
    const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.STRENGTHEN_PRICE);
    smallRow.push({
      label: 'Strengthen — ' + price + 'g',
      text: 'Add 1 weight to a face of your choice.',
      disabled: gameState.run.gold < price,
      onClick: function() { log('[CLICK] Strengthen'); shopBuyStrengthen(); }
    });
  }
  if (!shop.removalBought) {
    const price = shopRemovalPrice();
    smallRow.push({
      label: 'Remove a card — ' + price + 'g',
      text: 'Remove a card of your choice from your deck.',
      disabled: gameState.run.gold < price,
      onClick: function() { log('[CLICK] Remove a card'); shopBuyRemoval(); }
    });
  }

  renderOfferPanel(panel, {
    title: 'SHOP',
    cards: cards,
    skip: { label: 'LEAVE', onClick: function() { log('[CLICK] Leave'); closeShopScreen(); } },
    smallRow: smallRow
  });
}


// ---------- INFO LAYERS (D-98) ----------
// What the map screen used to print inline (PLAYER DIE/ARTIFACTS/CARDS)
// now lives behind the top bar's DIE/ARTIFACTS/CARDS buttons — available
// on the map and the fight screen alike. Each renders straight from
// gameState (KI-3), every refreshInspector() call, gated only on the
// matching gameState.ui.*InfoOpen flag.

// D-129: the DIE layer's one table — face, weight, mod(s), trigger count —
// a row per face still on the die, under a header row printed once.
function buildDieInfoTable() {
  const table = document.createElement('table');
  table.className = 'info-table';
  const cols = document.createElement('colgroup');
  ['info-col-face', 'info-col-weight', '', 'info-col-triggers'].forEach(function(cls) {
    const col = document.createElement('col');
    if (cls) col.className = cls;
    cols.appendChild(col);
  });
  table.appendChild(cols);
  const headRow = table.createTHead().insertRow();
  ['Face', 'Weight', 'Mod', 'Triggered'].forEach(function(label) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  const body = table.createTBody();
  gameState.die.faces.forEach(function(face) {
    const row = body.insertRow();
    row.className = 'info-table-row';
    const modData = face.modData || {};
    const modCell = document.createElement('td');
    [face.modId, face.modId2].forEach(function(modId) {
      if (modId && gameState.config.mods[modId]) attachArtIcon(modCell, 'mods', modId, 32, 'info-row-icon');
    });
    const names = face.modId === null ? 'BLANK' : (face.modId2 ? modDisplayName(face.modId) + ' / ' + modDisplayName(face.modId2) : modDisplayName(face.modId));
    modCell.appendChild(document.createTextNode(names + (isBoundFace(face) ? ' · Bound' : '') + (isFaceSealed(face.number) ? ' · Sealed' : '')));
    const triggers = face.modId === null ? '' : (face.modId2 ? (modData.triggerCount || 0) + ' / ' + (modData.triggerCount2 || 0) : String(modData.triggerCount || 0));
    [String(face.number), face.weight + (isFaceTwentyAtCap(face.number) ? ' MAX' : '')].forEach(function(text) {
      row.insertCell().textContent = text;
    });
    row.appendChild(modCell);
    row.insertCell().textContent = triggers;
  });
  return table;
}

function renderInfoLayers() {
  const dieLayer = document.getElementById('dieInfoLayer');
  const artifactsLayer = document.getElementById('artifactsInfoLayer');
  const cardsLayer = document.getElementById('cardsInfoLayer');
  if (!dieLayer || !artifactsLayer || !cardsLayer) return;

  dieLayer.style.display = gameState.ui.dieInfoOpen ? 'block' : 'none';
  artifactsLayer.style.display = gameState.ui.artifactsInfoOpen ? 'block' : 'none';
  cardsLayer.style.display = gameState.ui.cardsInfoOpen ? 'block' : 'none';

  if (gameState.ui.dieInfoOpen) {
    const content = document.getElementById('dieInfoContent');
    content.innerHTML = '';
    ['HP ' + shownHp(gameState.player.hp) + ' / ' + gameState.player.maxHp,
      'Blanks rolled ' + gameState.runRecord.blanksRolled].forEach(function(text) {
      const line = document.createElement('div');
      line.className = 'info-list-row info-die-line';
      line.textContent = text;
      content.appendChild(line);
    });
    content.appendChild(buildDieInfoTable());
  }

  if (gameState.ui.artifactsInfoOpen) {
    const content = document.getElementById('artifactsInfoContent');
    const artifacts = gameState.run.artifacts;
    content.innerHTML = artifacts.length ? '' : '<div class="info-list-row">No artifacts held.</div>';
    artifacts.forEach(function(id) {
      const artifact = gameState.config.artifacts[id];
      const row = document.createElement('div');
      row.className = 'info-list-row';
      attachArtIcon(row, 'artifacts', id, 48, 'info-row-icon');
      row.appendChild(document.createTextNode(artifact ? artifact.name + ' — ' + artifact.text : id));
      content.appendChild(row);
    });
  }

  if (gameState.ui.cardsInfoOpen) {
    const content = document.getElementById('cardsInfoContent');
    content.innerHTML = gameState.player.ownedCards.length ? '' : '<div class="info-list-row">No cards owned.</div>';
    if (gameState.player.ownedCards.length) content.appendChild(renderOwnedCardGrid(null));
  }
}
