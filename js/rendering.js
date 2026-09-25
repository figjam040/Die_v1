// log(), refreshInspector() and every render* function, the three
// screen-flow state machines (die action / card reward / rite — their
// flow variables are UI-flow bookkeeping, not game state), the map
// renderer, and the text lookup tables consumed only by render functions.
// Forward-references dev-tools.js's devChromeOpen/forcePlayerRoll/
// forceEnemyRoll — safe per state.js's header note; the map/screen code
// here calls back into run-and-map.js's enterSlot()/chooseLane()/
// devJumpToSlot()/advanceRun() in turn.

// ---------- LOGGING ----------

const LOG_PREFIX_CLASSES = [
  ['[PHASE]', 'log-phase'],
  ['[ROLL]', 'log-roll'],
  ['[MOD]', 'log-mod'],
  ['[CARD]', 'log-card'],
  ['[DRAW]', 'log-draw'],
  ['[START]', 'log-start'],
  ['[END]', 'log-end'],
  ['[LISTENER]', 'log-listener'],
  ['[STATE]', 'log-state'],
  ['[INIT COMPLETE]', 'log-init-complete'],
  ['[INIT]', 'log-init'],
  ['[ENEMY]', 'log-enemy'],
  ['[POISON]', 'log-poison'],
  ['[WIN]', 'log-win'],
  ['[LOSS]', 'log-loss'],
  ['[CLICK]', 'log-click'],
  ['[DEV]', 'log-dev']
];

function log(message) {
  const logEl = document.getElementById('log');
  const entry = document.createElement('div');
  entry.textContent = message;

  let matchedClass = 'log-default';
  for (let i = 0; i < LOG_PREFIX_CLASSES.length; i++) {
    if (message.indexOf(LOG_PREFIX_CLASSES[i][0]) === 0) {
      matchedClass = LOG_PREFIX_CLASSES[i][1];
      break;
    }
  }
  entry.className = matchedClass;

  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;

  if (message === '[PHASE] START_OF_TURN') {
    resetRollHero();
  } else if (message.indexOf('[ROLL] face: ') === 0) {
    const match = message.match(/^\[ROLL\] face: (\d+) modId: (.+)$/);
    if (match) { renderRollResult(match[1], match[2]); }
  } else if (message.indexOf('[CARD] played ') === 0) {
    const cardMatch = message.match(/^\[CARD\] played (.+) \(cost \d+\)$/);
    if (cardMatch) { triggerCardFx(cardMatch[1]); }
  } else if (message.indexOf('[MOD] ') === 0) {
    noteRollHeroValue(message);
  }
}

// ---------- HOVER TIPS ----------
// D-104/KI-41 — no element in the game carries a native `title` tooltip;
// every hover sentence lives in a `.hover-tip` child instead, shown by the
// generic `.hover-parent:hover .hover-tip` rule (index.html) unless the
// element already has its own more specific `:hover .hover-tip` rule (a
// die row, a die-action button) — adding `hover-parent` alongside one of
// those is harmless, both rules just agree.
function setHoverTip(el, text) {
  if (!el) return;
  el.classList.add('hover-parent');
  let tip = el.querySelector('.hover-tip');
  if (!tip) {
    tip = document.createElement('span');
    tip.className = 'hover-tip';
    el.appendChild(tip);
  }
  tip.innerHTML = '';
  (Array.isArray(text) ? text : [text]).forEach(function(line) {
    const div = document.createElement('div');
    div.textContent = line;
    tip.appendChild(div);
  });
}

// KI-46 — every showing hover box is shifted inward until it sits fully
// inside the window, via the CSS `translate` property so each tip's own
// `transform` placement is untouched. The pixel ratio between a translate
// and the box's on-screen move is measured, not assumed: <html> is zoomed
// (applyScale()) and the map composition zooms again on top of that.
const HOVER_TIP_EDGE_PX = 4;

function clampHoverTips() {
  const tips = document.querySelectorAll('.hover-tip');
  for (let i = 0; i < tips.length; i++) {
    const tip = tips[i];
    tip.style.translate = '';
    if (getComputedStyle(tip).visibility !== 'visible') continue;
    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let dx = 0;
    let dy = 0;
    if (r.left < HOVER_TIP_EDGE_PX) dx = HOVER_TIP_EDGE_PX - r.left;
    else if (r.right > vw - HOVER_TIP_EDGE_PX) dx = vw - HOVER_TIP_EDGE_PX - r.right;
    if (r.top < HOVER_TIP_EDGE_PX) dy = HOVER_TIP_EDGE_PX - r.top;
    else if (r.bottom > vh - HOVER_TIP_EDGE_PX) dy = vh - HOVER_TIP_EDGE_PX - r.bottom;
    if (dx === 0 && dy === 0) continue;
    tip.style.translate = '100px 0px';
    const ratio = (tip.getBoundingClientRect().left - r.left) / 100 || 1;
    tip.style.translate = (dx / ratio) + 'px ' + (dy / ratio) + 'px';
  }
}

// ---------- STATE INSPECTOR ----------

function refreshInspector() {
  const contentEl = document.getElementById('inspectorContent');
  if (!contentEl) return;
  contentEl.textContent = JSON.stringify(gameState, null, 2);
  // Before any face row renders, so a fresh roll is held back from the
  // row on the very render that first sees it (D-107).
  noteDieRollsForAnimation();
  const actStampEl = document.getElementById('actStamp');
  if (actStampEl) { actStampEl.textContent = 'ACT ' + gameState.run.actNumber; }
  const appEl = document.querySelector('.app');
  const logToggleBtn = document.getElementById('logToggleBtn');
  if (appEl && logToggleBtn) {
    appEl.classList.toggle('log-open', gameState.ui.logOpen);
    logToggleBtn.textContent = gameState.ui.logOpen ? 'LOG ▾' : 'LOG ▸';
  }
  const logEl = document.getElementById('log');
  const logViewToggleBtn = document.getElementById('logViewToggleBtn');
  const logCloseBtn = document.getElementById('logCloseBtn');
  if (logEl && logViewToggleBtn) {
    logEl.classList.toggle('log-view-all', gameState.ui.logView === 'all');
    logViewToggleBtn.textContent = gameState.ui.logView === 'all' ? 'LOG: ALL' : 'LOG: PLAY';
  }
  if (logCloseBtn) { logCloseBtn.style.display = gameState.ui.logOpen ? 'inline-block' : 'none'; }
  renderRegistryInspector();
  renderStats();
  renderCardButtons();
  // the fight's own face row is the only face row on screen:
  // a die-action face-picking step wires directly onto it (no second row),
  // so its own pickConfig disables the dev force-roll click for that render.
  const playerDiePickConfig = currentPlayerDiePickConfig();
  renderDieList('playerDieList', gameState.die.faces, playerDiePickConfig ? null : forcePlayerRoll, playerDiePickConfig);
  const enemyTitleEl = document.getElementById('enemyPanelTitle');
  if (enemyTitleEl) {
    if (gameState.enemy.id === 'Boss') {
      enemyTitleEl.textContent = 'BOSS ☠';
    } else if (gameState.enemy.id === 'Elite') {
      enemyTitleEl.textContent = 'ELITE ★';
    } else {
      enemyTitleEl.textContent = 'ENEMY';
    }
  }
  // D-103 — the enemy's own face row under its art; a dieless enemy's
  // empty row collapses by CSS (:empty).
  const enemyFaces = gameState.enemy.hasDie ? gameState.enemy.die.faces : [];
  document.getElementById('enemyDieList').classList.toggle('enemy-face-row-d20', enemyFaces.length > GAME_CONFIG.DIE_SIZE.ELITE);
  renderDieList('enemyDieList', enemyFaces, forceEnemyRoll, null, gameState.enemy.buffPoisonStacks, gameState.enemy.name, gameState.enemy.wrathPerTrigger);
  renderDieIcons();
  renderArtBoxes();
  renderActBackground();
  renderTopBarTokens();
  renderThirdEyeButton();
  renderPhaseBadge();
  renderResultBanner();
  renderDieActionPanel();
  renderCardRewardPanel();
  renderArtifactRewardPanel();
  renderRiteScreen();
  renderEventScreen();
  renderShopPanel();
  renderMapScreen();
  renderInfoLayers();

  // the reward layer (die action/card/artifact/shop/The Font/the rite)
  // always shows over the fight screen, even when it was opened from the
  // map (a rite, its shop, an elite's artifact reward, The Font): the fight
  // screen carries the one face row these all share (D-116).
  const rewardLayerActive = dieActionStep !== null || cardRewardStep !== null ||
    artifactRewardStep !== null || shopStep !== null || eventStep !== null || riteStep !== null;
  document.getElementById('fightScreen').style.display = (gameState.run.screen === 'fight' || rewardLayerActive) ? 'flex' : 'none';
  document.getElementById('fightScreen').classList.toggle('reward-layer-active', rewardLayerActive);
  document.getElementById('mapScreen').style.display = (gameState.run.screen === 'map' && !rewardLayerActive) ? 'flex' : 'none';

  document.getElementById('devNextPhaseBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active');
  document.getElementById('devBeginRollBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.turn.phase === 'START_OF_TURN');
  document.getElementById('devRestartFightBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.run.outcome === 'active');
  document.getElementById('devSkipToDieActionBtn').disabled = !(gameState.run.status === 'active' && gameState.run.outcome === 'active');
  document.getElementById('endTurnBtn').disabled = !(gameState.run.status === 'active' && gameState.turn.phase === 'CARD_PHASE' && dieActionStep === null && cardRewardStep === null && riteStep === null && artifactRewardStep === null && shopStep === null);
  // End Turn belongs to the fight screen only — hidden entirely on the
  // map, not just disabled-but-visible.
  document.getElementById('endTurnBtn').style.display = (gameState.run.screen === 'fight') ? '' : 'none';
  // New Run works at any time, including while a panel is open — the
  // click handler dismisses it before resetting, so it isn't gated on
  // dieActionStep/cardRewardStep/riteStep the way endTurnBtn is.
  document.getElementById('startGameBtn').disabled = false;
  // A re-render replaces the hovered element's tip with a fresh, unshifted one.
  clampHoverTips();
}

// The listener registry inspector. Read-only — only reads
// gameState.registry.listeners and writes DOM text. Grouped by hook, then
// within each hook by clearOn ('permanent' first, then 'turn').
function renderRegistryInspector() {
  const contentEl = document.getElementById('registryInspectorContent');
  if (!contentEl) return;
  const hooks = Object.keys(gameState.registry.listeners);
  if (hooks.length === 0) {
    contentEl.innerHTML = '<div class="registry-empty">no hooks registered</div>';
    return;
  }
  const html = hooks.map(function(hook) {
    const listeners = gameState.registry.listeners[hook];
    const permanent = listeners.filter(function(l) { return l.clearOn === 'permanent'; });
    const turn = listeners.filter(function(l) { return l.clearOn === 'turn'; });
    const other = listeners.filter(function(l) { return l.clearOn !== 'permanent' && l.clearOn !== 'turn'; });
    function idList(group) {
      return group.length
        ? group.map(function(l) { return '<div class="registry-listener-id">' + l.id + '</div>'; }).join('')
        : '<div class="registry-listener-id registry-empty">(none)</div>';
    }
    return '<div class="registry-hook-group">' +
      '<div class="registry-hook-name">' + hook + ' (' + listeners.length + ')</div>' +
      '<div class="registry-clear-group">permanent (' + permanent.length + ')' + idList(permanent) + '</div>' +
      '<div class="registry-clear-group">turn (' + turn.length + ')' + idList(turn) + '</div>' +
      (other.length ? '<div class="registry-clear-group">other/unrecognised clearOn (' + other.length + ')' + idList(other) + '</div>' : '') +
      '</div>';
  }).join('');
  contentEl.innerHTML = html;
}

// ---------- UI RENDERING ----------

function renderPhaseBadge() {
  const badge = document.getElementById('phaseBadge');
  if (!badge) return;
  const phase = gameState.turn.phase;
  badge.textContent = phase.replace(/_/g, ' ');
  badge.className = 'phase-badge phase-' + phase.toLowerCase();
}

// The roll stage's own segments for the face just rolled: one per mod on
// that face, in load order. Each segment's `value` is filled in from that
// mod's own log line (see noteRollHeroValue) — nothing is recomputed here.
let rollHeroSegments = [];

// The first number a mod's own log line reports for its trigger, read in
// the four shapes every mod already logs. Returns null when that line
// carries no such number (a "registered" line, say).
function rollHeroValueFromLogLine(message) {
  const patterns = [/(\d+) damage/, /(\d+) block/, /\+(\d+) soul/, /(\d+) stacks of poison/];
  for (let i = 0; i < patterns.length; i++) {
    const m = message.match(patterns[i]);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

function noteRollHeroValue(message) {
  const match = message.match(/^\[MOD\] ([a-z_]+): (.+)$/);
  if (!match) return;
  const seg = rollHeroSegments.find(function(s) { return s.modId === match[1] && s.value === null; });
  if (!seg) return;
  const value = rollHeroValueFromLogLine(match[2]);
  if (value === null) return;
  seg.value = value;
  paintRollHero();
}

// D-105 — the strip shows the name only: PENITENCE, BLANK, or the mod
// name(s) in trigger order, each with its own trigger badge. No '+N'
// value (the number still pops on the art/stat it lands on, D-87, and
// stays in the log) and no 'NAT 1' prefix — Penitence reads as itself.
// A Nat 20 still reads NAT 20, its segment carrying no other name.
function paintRollHero() {
  const hero = document.getElementById('rollHero');
  const numEl = document.getElementById('rollResultNumber');
  const labelEl = document.getElementById('rollResultLabel');
  if (!hero || !numEl || !labelEl) return;

  labelEl.innerHTML = '';
  numEl.textContent = '';
  // D-107: the strip follows the icon — nothing until it stops spinning.
  if (rollHeroSegments.length === 0 || dieRollHolding('player')) {
    hero.classList.add('roll-hero-empty');
    numEl.classList.remove('roll-hero-nat');
    labelEl.classList.remove('roll-hero-nat');
    labelEl.textContent = 'AWAITING ROLL';
    return;
  }

  hero.classList.remove('roll-hero-empty');
  const isNat = rollHeroSegments[0].isNat;
  numEl.classList.toggle('roll-hero-nat', isNat);
  labelEl.classList.toggle('roll-hero-nat', isNat);

  rollHeroSegments.forEach(function(seg, idx) {
    // seg.name wins when it says something (Penitence, Blank, a mod's own
    // name) — seg.natText (NAT 20) is only the fallback for the segment
    // that carries no name of its own.
    const nameText = seg.name || seg.natText;
    if (nameText) {
      const nameEl = document.createElement('span');
      nameEl.textContent = (idx > 0 ? ' ' : '') + nameText.toUpperCase();
      labelEl.appendChild(nameEl);
    }
    const count = rollHeroTriggerCount(seg);
    if (count > 0) {
      const countEl = document.createElement('span');
      countEl.className = 'roll-hero-count';
      countEl.textContent = '↻' + count;
      labelEl.appendChild(countEl);
    }
  });
}

// Read live at paint time, not captured when the roll landed, so the count
// shown already includes this trigger.
function rollHeroTriggerCount(seg) {
  if (seg.modId === null || seg.faceNumber == null) return 0;
  const face = getPlayerFace(seg.faceNumber);
  const modData = (face && face.modData) || {};
  return (seg.slot === 2 ? modData.triggerCount2 : modData.triggerCount) || 0;
}

function renderRollResult(faceNumberText, modIdRaw) {
  const hero = document.getElementById('rollHero');
  if (!hero) return;

  const modId = (modIdRaw === 'null') ? null : modIdRaw;
  const faceNumber = parseInt(faceNumberText, 10);
  const face = getPlayerFace(faceNumber);

  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') {
    rollHeroSegments = [{ modId: null, name: 'Penitence', value: null, isNat: true, natText: 'NAT 1' }];
  } else if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') {
    rollHeroSegments = [{ modId: null, name: '', value: null, isNat: true, natText: 'NAT 20' }];
  } else if (modId === null) {
    rollHeroSegments = [{ modId: null, name: 'Blank', value: GAME_CONFIG.BLANK_ROLL_BLOCK, isNat: false }];
  } else {
    rollHeroSegments = [{ modId: modId, faceNumber: faceNumber, slot: 1, name: modDisplayName(modId), value: null, isNat: false }];
    if (face && face.modId2) {
      rollHeroSegments.push({ modId: face.modId2, faceNumber: faceNumber, slot: 2, name: modDisplayName(face.modId2), value: null, isNat: false });
    }
  }
  paintRollHero();

  hero.classList.remove('roll-pulse');
  void hero.offsetWidth;
  hero.classList.add('roll-pulse');
}

function resetRollHero() {
  rollHeroSegments = [];
  paintRollHero();
}

function renderResultBanner() {
  const banner = document.getElementById('resultBanner');
  if (!banner) return;
  if (gameState.run.status === 'win') {
    banner.textContent = 'VICTORY';
    banner.className = 'result-banner result-win';
    banner.style.display = 'inline-block';
  } else if (gameState.run.status === 'loss') {
    banner.textContent = 'DEFEAT';
    banner.className = 'result-banner result-loss';
    banner.style.display = 'inline-block';
  } else {
    banner.style.display = 'none';
  }
}

// How many letters of each mod's name a two-mod face's row shows, before
// the full name (via title). Drop to 5 if a future name stops fitting.
const TWO_MOD_NAME_CHARS = 6;

const ENEMY_BUFF_DISPLAY_NAME = {
  enemy_buff_poison: 'POISON',
  enemy_buff_wrath: 'WRATH',
  enemy_buff_drain: 'DRAIN',
  enemy_buff_seal: 'SEAL'
};

function modDisplayName(modId) {
  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') return 'NAT 1';
  if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') return 'NAT 20';
  if (ENEMY_BUFF_DISPLAY_NAME[modId]) return ENEMY_BUFF_DISPLAY_NAME[modId];
  const mod = gameState.config.mods[modId];
  return mod ? mod.name : modId;
}

// Resolves a face to its hover description, or null if none exists —
// never invents one. Blank faces return null on purpose; the weight sits
// on faceTitleText()'s line, not here. buffPoisonStacks/enemyName/
// wrathAmount are the calling enemy's own act-scaled/per-enemy numbers,
// threaded through by renderDieList() rather than read from gameState
// here, so a map preview (a different enemy object) still shows correct text.
function faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount) {
  let text = null;
  if (face.modId === 'NAT_TWENTY' || face.modId === 'NAT_ONE') {
    text = NAT_DESCRIPTION[face.modId] || null;
    if (text && face.modId === 'NAT_TWENTY') text += ' Its weight caps at ' + GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT + '.';
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    text = (enemyName || 'The boss') + ' starts its Charge next round.';
  } else if (face.modId === 'ENEMY_NAT_ONE') {
    if (enemyName === 'Cardinal') {
      text = 'Your heaviest loaded face triggers. Once per fight.';
    } else if (enemyName === 'Pontifex') {
      text = 'It loses all its Wrath. Once per fight.';
    } else if (enemyName === 'Hierophant') {
      text = 'Its attack is cancelled and it takes ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison, once per fight. This also happens when you roll a Nat 1.';
    } else {
      text = 'Its attack this round is cancelled and it takes ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison. Once per fight.';
    }
  } else if (face.modId === 'enemy_buff_poison') {
    text = 'You take ' + buffPoisonStacks + ' stacks of poison.';
  } else if (face.modId === 'enemy_buff_wrath') {
    text = 'From next round, every Attack deals ' + (wrathAmount || GAME_CONFIG.ENEMY_WRATH_AMOUNT) + ' more damage for the rest of the fight. Each trigger adds more.';
  } else if (face.modId === 'enemy_buff_drain') {
    text = 'You start next round with 1 less soul.';
    if (enemyName === 'Lector' && face.number === 6) {
      text += ' This also triggers when you roll a 6.';
    }
  } else if (face.modId === 'enemy_buff_seal') {
    text = 'Your heaviest loaded face counts as blank next round.';
  } else if (face.modId && MOD_DESCRIPTION[face.modId]) {
    text = MOD_DESCRIPTION[face.modId];
  }
  // A second mod (never possible on a Nat face) follows the first's text.
  if (face.modId2 && MOD_DESCRIPTION[face.modId2]) {
    text = (text ? text + ' / ' : '') + MOD_DESCRIPTION[face.modId2];
  }
  return text;
}

// The square's own name / weight / trigger count / Bound line, the hover
// box's first line above faceHoverText()'s. Reads state only.
function faceTitleText(face, showTriggerCounts, isPlayerDie) {
  const parts = [];
  if (face.modId === null) {
    parts.push('Blank');
  } else if (face.modId2) {
    parts.push(modDisplayName(face.modId) + ' + ' + modDisplayName(face.modId2));
  } else {
    parts.push(modDisplayName(face.modId));
  }
  // Enemy faces never gain weight, so their tips don't print it (D-103).
  if (isPlayerDie) parts.push('weight ' + face.weight + (isFaceTwentyAtCap(face.number) ? ' MAX' : ''));
  if (showTriggerCounts && face.modId !== null) {
    const modData = face.modData || {};
    const count1 = modData.triggerCount || 0;
    parts.push(face.modId2
      ? 'triggered ' + count1 + ' / ' + (modData.triggerCount2 || 0) + ' times'
      : 'triggered ' + count1 + ' times');
  }
  if (isBoundFace(face)) parts.push('Bound');
  if (isPlayerDie && isFaceSealed(face.number)) parts.push('Sealed');
  return parts.join(' · ');
}

// D-124: the mod ids whose symbols sit under a face, load order. Blank and
// Nat faces carry none.
const FACE_SYMBOL_PX = 24;

function faceSymbolModIds(face) {
  if (face.modId === null || face.modId === 'NAT_ONE' || face.modId === 'NAT_TWENTY') return [];
  return face.modId2 ? [face.modId, face.modId2] : [face.modId];
}

// Per-container "committed" roll signature — lets a re-render triggered
// by something other than an actual new roll redraw the rolled row
// without restarting its flash animation. Commit is deferred to a
// microtask so the whole synchronous cascade one roll triggers is seen
// as one render, not many, before the next separate event (a click).
const lastSeenRollSignatureByContainer = {};

// Same per-container "already seen" idiom as above, for hopped faces —
// see renderDieList()'s hop block below.
const lastSeenHoppedFacesByContainer = {};

// Optional 4th arg — { isEligible(face), onPick(faceNumber), showBecomes }
// — turns the die rows themselves into the Load/Strengthen face picker.
// Optional 5th arg, buffPoisonStacks — the enemy's own act-scaled
// poison amount, passed straight through to faceHoverText() so an enemy
// die's poison/Nat faces can name the real number for the current act.
// Optional 6th/7th args, enemyName/wrathAmount, thread through the same
// way for Cardinal/Pontifex/Hierophant/Lector's own hover overrides.
function renderDieList(containerId, faces, forceRollFn, pickConfig, buffPoisonStacks, enemyName, wrathAmount) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const title = container.querySelector('.panel-title');
  container.innerHTML = '';
  if (title) container.appendChild(title);
  // An empty faces array (a dieless enemy) still clears out whatever rows
  // a previous fight's die left behind, leaving just the title.
  if (!faces.length) return;

  // Reference equality with the player's own live die, not a containerId
  // allowlist — true for playerDieList/dieActionDieList/the map's own
  // preview, false for the enemy die and the map's static previews.
  const showTriggerBadges = (faces === gameState.die.faces);

  // Sealed display, player die only: a face currently sealed dims and
  // shows "SEALED"; one queued to seal next round shows "SEALED NEXT
  // ROUND" with no dimming (still fully loaded/rollable this round).
  const isPlayerDie = showTriggerBadges;

  // this roll's own odds, read straight off rollDie()'s own
  // bag (pipeline.js) so Gilded Die's extra tickets show for the roll they
  // apply to. Player die only — nothing else needs it.
  const oddsByFace = isPlayerDie ? rollOdds(faces) : null;

  // The player's own die reads as one horizontal row of squares, face 1 at
  // the left; every other container keeps the vertical row list
  // — this is the only face row on screen; the die action/event reward
  // layer picks/lights faces on this same row instead of a row of its own.
  const isHorizontal = (containerId === 'playerDieList');

  const tracksRolledFace = (containerId === 'playerDieList' || containerId === 'enemyDieList');
  const isEnemyContainer = containerId === 'enemyDieList';
  // D-107: a face row lights its rolled face only once that side's die
  // icon stops spinning; the enemy's reads its held display roll, since
  // the state's own copy clears the instant the next round starts.
  const shownRoll = isEnemyContainer ? shownEnemyRoll() : shownPlayerRoll();
  const trackedRolledFaceNumber = shownRoll.faceNumber;
  const trackedRollOutcome = shownRoll.outcome;
  let isNewRollThisRender = false;
  if (tracksRolledFace) {
    const currentRollSignature = trackedRolledFaceNumber !== null
      ? trackedRolledFaceNumber + ':' + trackedRollOutcome
      : null;
    isNewRollThisRender = currentRollSignature !== null && currentRollSignature !== lastSeenRollSignatureByContainer[containerId];
    if (isNewRollThisRender) {
      // Commit after the current synchronous cascade unwinds — see the
      // comment above lastSeenRollSignatureByContainer's declaration.
      queueMicrotask(function() {
        lastSeenRollSignatureByContainer[containerId] = currentRollSignature;
      });
    } else {
      lastSeenRollSignatureByContainer[containerId] = currentRollSignature;
    }
  }

  // A face that fires WITHOUT being the rolled face (a Nat 20 sweep, a
  // Bound scan, an outside-roll trigger) hops to the same rolled-face
  // look, player die only. Same flash-once-then-sustained split.
  const tracksHoppedFaces = tracksRolledFace && !isEnemyContainer;
  const trackedHoppedFaces = (tracksHoppedFaces && !dieRollHolding('player')) ? gameState.turn.hoppedFaces : [];
  if (!lastSeenHoppedFacesByContainer[containerId]) { lastSeenHoppedFacesByContainer[containerId] = []; }
  const committedHoppedFaces = lastSeenHoppedFacesByContainer[containerId];
  const newlyHoppedThisRender = trackedHoppedFaces.filter(function(n) { return committedHoppedFaces.indexOf(n) === -1; });
  if (tracksHoppedFaces) {
    if (newlyHoppedThisRender.length > 0) {
      queueMicrotask(function() {
        lastSeenHoppedFacesByContainer[containerId] = trackedHoppedFaces.slice();
      });
    } else {
      lastSeenHoppedFacesByContainer[containerId] = trackedHoppedFaces.slice();
    }
  }

  // Display order flipped — NAT 20 at the top, descending to NAT 1.
  // Purely a rendering change: only a REVERSED COPY is iterated; the real
  // faces array is never mutated or reordered.
  faces.slice().reverse().forEach(function(face) {
    const row = document.createElement('div');
    row.className = 'die-row';
    if (face.modId === 'NAT_ONE' || face.modId === 'ENEMY_NAT_ONE') {
      row.classList.add('nat-one');
    } else if (face.modId === 'NAT_TWENTY' || face.modId === 'ENEMY_NAT_TWENTY') {
      row.classList.add('nat-twenty');
    } else if (face.modId !== null) {
      row.classList.add('loaded');
    }
    if (isPlayerDie && isFaceSealed(face.number)) {
      row.classList.add('die-row-sealed');
    }

    // The rolled-face highlight. isNewRollThisRender picks the animated
    // -flash class only on the render right after an actual new roll;
    // later re-renders of the same roll get the plain sustained class.
    // A blank rolled face holds the same way a loaded one does (D-10):
    // its own flash class on the new-roll render, then die-row-rolled
    // on every later render of that round.
    if (tracksRolledFace && trackedRolledFaceNumber === face.number) {
      if (trackedRollOutcome === 'blank') {
        row.classList.add(isNewRollThisRender ? 'die-row-rolled-blank-flash' : 'die-row-rolled');
      } else {
        row.classList.add(isNewRollThisRender ? 'die-row-rolled-flash' : 'die-row-rolled');
      }
    } else if (tracksHoppedFaces && trackedHoppedFaces.indexOf(face.number) !== -1) {
      row.classList.add(newlyHoppedThisRender.indexOf(face.number) !== -1 ? 'die-row-rolled-flash' : 'die-row-rolled');
    }

    // A genuine enemy Nat pulses its rolled row three times, on top of
    // whatever look it already has above.
    if (isEnemyContainer && trackedRolledFaceNumber === face.number && isNewRollThisRender && (trackedRollOutcome === 'nat_twenty' || trackedRollOutcome === 'nat_one')) {
      row.classList.add('die-row-enemy-nat-pulse');
    }

    const btn = document.createElement('button');
    btn.className = 'face-btn';

    // A weight-2+ face gets a fill bar inside its own face-btn,
    // bottom-anchored, height scaled to weight, capped at weight 5.
    // Uses `background: currentColor` — reuses face-btn's own per-row
    // identity colour rather than introducing a new one.
    if (face.weight > 1) {
      const fill = document.createElement('div');
      fill.className = 'face-weight-fill';
      const fillPct = Math.min(100, 40 + (face.weight - 2) * 20);
      fill.style.height = fillPct + '%';
      btn.appendChild(fill);
    }
    const numSpan = document.createElement('span');
    numSpan.className = 'face-num';
    numSpan.textContent = face.number;
    btn.appendChild(numSpan);

    // DEV ONLY — force-roll click handler, only wired while dev chrome is
    // open. The Load/Strengthen picker is untouched: it passes forceRollFn
    // null and wires its click via pickConfig below instead. Remove before any real release.
    if (forceRollFn && devChromeOpen) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        forceRollFn(faceNumber);
      });
    }

    // Third Eye — while choosing, a click on the real player die's own
    // row picks that face for the roll instead of the dev force-roll path.
    if (containerId === 'playerDieList' && thirdEyeChoosing) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        thirdEyeChoosing = false;
        thirdEyeChooseFace(faceNumber);
      });
    }

    // Gilded Die — the same click-a-face-row pattern, buying that face
    // extra weight for the coming roll instead of choosing it outright.
    if (containerId === 'playerDieList' && gildedDieChoosing) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        gildedDieChoosing = false;
        gildedDiePayForFace(faceNumber);
        refreshInspector();
      });
    }

    const modWrap = document.createElement('div');
    modWrap.className = 'die-mod-wrap';

    // A face holding two mods shows both names side by side on one line,
    // each with its own trigger count beside it. Single-mod and blank
    // faces are unchanged: one .die-mod span, then weight, then trigger badge.
    const isTwoMod = face.modId !== null && !!face.modId2;

    if (isTwoMod) {
      const modPair = document.createElement('span');
      modPair.className = 'die-mod-pair';
      const modData = face.modData || {};
      [
        { id: face.modId, count: modData.triggerCount || 0 },
        { id: face.modId2, count: modData.triggerCount2 || 0 }
      ].forEach(function(m, idx) {
        const nameSpan = document.createElement('span');
        // idx 1 (the second mod) gets its own class for the gap-before-it
        // CSS rule — :nth-of-type doesn't work since the first mod's own
        // trigger count is also a <span> and can sit between the two names.
        nameSpan.className = idx === 1 ? 'die-mod die-mod-second' : 'die-mod';
        // Truncated to an exact character count, no ellipsis — the full
        // name is still available on the row's own hover tip below
        // (faceTitleText() names both mods in full).
        const fullName = modDisplayName(m.id);
        nameSpan.textContent = fullName.slice(0, TWO_MOD_NAME_CHARS);
        modPair.appendChild(nameSpan);
        if (showTriggerBadges && m.count > 0) {
          const trig = document.createElement('span');
          trig.className = 'die-trigger-count die-trigger-count-inline';
          trig.textContent = '#' + m.count;
          modPair.appendChild(trig);
        }
      });
      modWrap.appendChild(modPair);
    } else {
      const modSpan = document.createElement('span');
      modSpan.className = 'die-mod';
      modSpan.textContent = face.modId === null ? '—' : modDisplayName(face.modId);
      modWrap.appendChild(modSpan);
    }

    if (face.weight > 1) {
      const weightSpan = document.createElement('span');
      weightSpan.className = 'die-weight';
      weightSpan.textContent = '×' + face.weight;
      modWrap.appendChild(weightSpan);
    }

    // Shown on every die-row container, not gated by showTriggerBadges —
    // a printed-Bound mod's badge is part of what the mod IS.
    if (isBoundFace(face)) {
      const boundSpan = document.createElement('span');
      boundSpan.className = 'die-weight die-bound-badge';
      boundSpan.textContent = 'Bound';
      modWrap.appendChild(boundSpan);
    }

    // Player die only. Zero triggers appends nothing. Single-mod faces
    // only — a two-mod face's counts render inline beside their own name above.
    if (!isTwoMod && showTriggerBadges && face.modId !== null) {
      const modData = face.modData || {};
      const count1 = modData.triggerCount || 0;
      if (count1 > 0) {
        const triggerSpan = document.createElement('span');
        triggerSpan.className = 'die-trigger-count';
        triggerSpan.textContent = '#' + count1;
        modWrap.appendChild(triggerSpan);
      }
    }

    if (isPlayerDie && isFaceSealed(face.number)) {
      const sealedSpan = document.createElement('span');
      sealedSpan.className = 'die-weight die-sealed-badge';
      sealedSpan.textContent = 'SEALED';
      modWrap.appendChild(sealedSpan);
    } else if (isPlayerDie && gameState.player.sealNextRound.indexOf(face.number) !== -1) {
      const sealedSpan = document.createElement('span');
      sealedSpan.className = 'die-weight die-sealed-badge';
      sealedSpan.textContent = 'SEALED NEXT ROUND';
      modWrap.appendChild(sealedSpan);
    }

    row.appendChild(btn);
    row.appendChild(modWrap);

    // The horizontal face row's own one-line caption under each square.
    // this roll's odds replace the bare weight number; the
    // weight itself moved into the square's own title (faceTitleText()
    // already prints "weight N"). NAT 1/NAT 20 keep their labels, with the
    // percent beside them.
    if (isHorizontal) {
      const caption = document.createElement('div');
      caption.className = 'die-face-caption';
      const pctText = oddsByFace ? oddsByFace[face.number].pct.toFixed(1) + '%' : '';
      if (isPlayerDie && isFaceSealed(face.number)) {
        caption.textContent = 'SEALED';
      } else if (isPlayerDie && gameState.player.sealNextRound.indexOf(face.number) !== -1) {
        caption.textContent = 'SEALED NEXT ROUND';
      } else if (face.modId === 'NAT_ONE' || face.modId === 'ENEMY_NAT_ONE') {
        // KI-34: a non-breaking space keeps "NAT 1" from splitting mid-label;
        // the forced line break (white-space: pre-line) puts the percent on
        // its own line so neither clips inside the 56px column.
        caption.classList.add('die-face-caption-nat');
        caption.textContent = 'NAT 1' + (pctText ? '\n' + pctText : '');
      } else if (face.modId === 'NAT_TWENTY' || face.modId === 'ENEMY_NAT_TWENTY') {
        caption.classList.add('die-face-caption-nat');
        caption.textContent = 'NAT 20' + (pctText ? '\n' + pctText : '');
        if (isPlayerDie && isFaceTwentyAtCap(face.number)) caption.textContent += ' MAX';
      } else {
        caption.textContent = pctText;
        // ODDS_EMPHASIS (GAME_CONFIG) — a weight-above-1 face's percent
        // drops and grows, for as long as the weight stays above 1.
        // Re-renders from state on every refreshInspector(), a Strengthen
        // included.
        if (face.weight > 1) {
          caption.classList.add('die-face-caption-emphasis');
          caption.style.transform = 'translateY(' + GAME_CONFIG.ODDS_EMPHASIS.DROP_PX + 'px)';
          caption.style.color = GAME_CONFIG.ODDS_EMPHASIS.COLOUR;
        }
      }
      row.appendChild(caption);

      // D-124: the loaded face's mod symbol(s) in a strip under the caption,
      // absolutely placed so the square and caption above never move.
      const symbolStrip = document.createElement('div');
      symbolStrip.className = 'face-symbol-strip';
      faceSymbolModIds(face).forEach(function(modId) {
        attachArtIcon(symbolStrip, 'mods', modId, FACE_SYMBOL_PX, 'face-symbol-img');
      });
      row.appendChild(symbolStrip);
    }

    let pickEligible = false;
    if (pickConfig) {
      pickEligible = !!pickConfig.isEligible(face);
      row.classList.add(pickEligible ? 'die-row-pickable' : 'die-row-pick-inert');
      if (pickEligible) {
        const faceNumber = face.number;
        row.addEventListener('click', function() { pickConfig.onPick(faceNumber); });
      }
    }

    // A currently-Sealed face's hover replaces its usual mod description
    // entirely — that's the one true thing about it right now.
    const hoverText = (isPlayerDie && isFaceSealed(face.number))
      ? 'Counts as blank this round.'
      : faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount);
    // During the Strengthen picker, an eligible row's hover also shows
    // what the face becomes.
    // The text never names the weight, so what a face becomes is its
    // first line again at one more weight.
    let becomesText = null;
    if (pickConfig && pickConfig.showBecomes && pickEligible) {
      becomesText = faceTitleText(Object.assign({}, face, { weight: face.weight + 1 }), false, isPlayerDie);
    }
    // D-104/KI-41 — no native title anywhere: this row's own .hover-tip
    // carries everything the old title used to, on every row, blank faces
    // included. D-125: two lines — name, weight and trigger count, then
    // the text.
    const titleText = faceTitleText(face, showTriggerBadges, isPlayerDie);
    const blankText = isPlayerDie ? 'Gain ' + GAME_CONFIG.BLANK_ROLL_BLOCK + ' block.' : 'Nothing happens.';
    const baseHoverText = hoverText || blankText;
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    const titleLine = document.createElement('div');
    titleLine.className = 'face-tip-title';
    titleLine.textContent = titleText;
    tip.appendChild(titleLine);
    const currentLine = document.createElement('div');
    currentLine.className = 'face-tip-text';
    currentLine.textContent = baseHoverText;
    tip.appendChild(currentLine);
    if (becomesText) {
      const becomesLine = document.createElement('div');
      becomesLine.textContent = 'Becomes: ' + becomesText;
      tip.appendChild(becomesLine);
    }
    row.appendChild(tip);

    container.appendChild(row);
  });
}

function flashElement(id, className) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}

let lastEnemyHp = null;
let lastPlayerHp = null;

// Plain-text intent display for every pattern kind. #enemyIntentValue
// carries the primary label, #enemyIntentLabel the wind-up round's own
// live "damage taken / breakAt" counter (recomputed fresh every render
// from windupStartHp vs current hp) — empty for every other kind.
// One inline SVG per intent kind, 40px, stroke only. The kind word itself
// is the icon's title and aria-label — the panel prints only the number.
const INTENT_ICON_SHAPES = {
  ATTACK: '<line x1="50" y1="8" x2="50" y2="88"/><line x1="26" y1="62" x2="74" y2="62"/><line x1="40" y1="84" x2="60" y2="84"/>',
  CHARGE: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/>',
  RELEASE: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/><line x1="12" y1="50" x2="88" y2="50"/>',
  AFFLICT: '<path d="M50 8 C 70 40 80 56 80 66 A 30 30 0 0 1 20 66 C 20 56 30 40 50 8 Z"/>',
  BROKEN: '<polyline points="60,8 34,50 50,50 40,92 68,46 52,46 60,8"/>'
};

function renderIntentIcon(kindWord, sentence) {
  const el = document.getElementById('enemyIntentIcon');
  if (!el) return;
  if (!kindWord || !INTENT_ICON_SHAPES[kindWord]) {
    el.innerHTML = '';
    el.removeAttribute('aria-label');
    return;
  }
  const tipText = sentence || kindWord;
  el.setAttribute('aria-label', kindWord);
  el.innerHTML = '<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="7" ' +
    'stroke-linecap="square" stroke-linejoin="miter">' +
    INTENT_ICON_SHAPES[kindWord] + '</svg>' +
    '<span class="hover-tip">' + tipText + '</span>';
}

// Which icon this round's intent wears, independent of whatever text a
// genuine enemy Nat puts in #enemyIntentValue.
function intentKindWord(enemy) {
  const entry = enemy.currentEntry;
  if (!entry) return null;
  if (entry.kind === 'attack') return 'ATTACK';
  if (entry.kind === 'afflict') return 'AFFLICT';
  if (entry.kind === 'charge') {
    if (enemy.chargeStage === 'windup') return 'CHARGE';
    if (enemy.chargeBroken) return 'BROKEN';
    return 'RELEASE';
  }
  return null;
}

function renderEnemyIntent() {
  const enemy = gameState.enemy;
  const entry = enemy.currentEntry;
  const valueEl = document.getElementById('enemyIntentValue');
  const labelEl = document.getElementById('enemyIntentLabel');
  const kindWord = intentKindWord(enemy);
  // Both the number's own hover box and the icon's hover box carry the
  // same sentence — the game-font .hover-tip box, never a native title.
  function setValue(text, sentence) {
    valueEl.innerHTML = String(text) + '<span class="hover-tip">' + (sentence || '') + '</span>';
    renderIntentIcon(kindWord, sentence);
  }
  // A genuine enemy Nat this round overrides whatever the pattern's own
  // intent text would otherwise show, for the rest of this round.
  if (gameState.turn.enemyRollOutcome === 'nat_twenty') {
    labelEl.textContent = '';
    setValue('NAT 20', 'Nat 20: forces the boss\'s Charge next round; loaded buff faces trigger only when rolled.');
    return;
  }
  if (gameState.turn.enemyRollOutcome === 'nat_one') {
    // Cardinal and Pontifex's own Nat 1 does not cancel the attack (see
    // GAME_CONFIG.ENEMIES/cards-mods.js) — showing "CANCELLED" for either
    // would be wrong, so only the cancelling (default/Hierophant) case
    // gets that wording.
    const cancels = gameState.enemy.name !== 'Cardinal' && gameState.enemy.name !== 'Pontifex';
    labelEl.textContent = '';
    setValue(cancels ? 'CANCELLED — NAT 1' : 'NAT 1', 'Nat 1: a designed effect happens instead of this round\'s own intent.');
    return;
  }
  if (!entry) {
    labelEl.textContent = '';
    setValue('—', '');
    return;
  }
  if (entry.kind === 'attack') {
    labelEl.textContent = '';
    const aweStacks = gameState.enemy.aweStacks;
    const aweNote = aweStacks > 0 ? ', lowered by ' + aweStacks + ' stacks of awe' : '';
    setValue(entry.rolledValue, 'Attack: deals ' + entry.rolledValue + ' damage this round' + aweNote + '. Block lowers it.');
  } else if (entry.kind === 'charge') {
    if (enemy.chargeStage === 'windup') {
      const taken = Math.max(0, enemy.windupStartHp - enemy.hp);
      labelEl.textContent = 'break ' + taken + ' / ' + entry.breakAt;
      setValue(entry.release, 'Charge: deals no damage this round. Next round the release deals ' + entry.release + '. If it takes ' + entry.breakAt + ' damage this round, the Charge breaks and the release deals nothing.');
    } else if (enemy.chargeBroken) {
      labelEl.textContent = '';
      setValue('BROKEN', 'The Charge broke this round. The release deals nothing.');
    } else {
      labelEl.textContent = '';
      setValue(entry.release, 'Release: deals ' + entry.release + ' damage this round. Block lowers it.');
    }
  } else if (entry.kind === 'afflict') {
    labelEl.textContent = '';
    setValue(entry.stacks, 'Afflict: deals no damage. Applies ' + entry.stacks + ' stacks of poison to the player.');
  }
}

function renderStats() {
  // A kill can leave gameState.enemy.hp negative (overkill is never
  // clamped in state) — displayed HP is clamped to 0 here, at render time only.
  document.getElementById('enemyHpValue').textContent = shownHp(gameState.enemy.hp) + ' / ' + gameState.enemy.maxHp;
  const nameEl = document.getElementById('enemyNameValue');
  if (nameEl) { nameEl.textContent = gameState.enemy.name || '—'; }
  // Pontifex's own panel line: reads the player's heaviest loaded face.
  const readLine = document.getElementById('enemyReadLine');
  if (readLine) {
    if (gameState.enemy.name === 'Pontifex') {
      readLine.style.display = '';
      const readValueEl = document.getElementById('enemyReadValue');
      readValueEl.textContent = 'Reads the heaviest face: Wrath +' + gameState.enemy.wrathPerTrigger + ' when the player rolls it.';
      setHoverTip(readValueEl, 'When the player rolls their heaviest loaded face, Wrath triggers.');
    } else {
      readLine.style.display = 'none';
    }
  }
  renderEnemyIntent();
  document.getElementById('enemyPoisonValue').textContent = gameState.enemy.poisonStacks;
  // Every loaded face on this enemy's own die, named with its face number.
  const loadedBuffs = gameState.enemy.die.faces
    .filter(function(f) { return f.modId !== null; })
    .map(function(f) { return modDisplayName(f.modId) + ' ' + f.number; });
  document.getElementById('enemyBuffsValue').textContent = loadedBuffs.length ? loadedBuffs.join(', ') : '—';
  document.getElementById('enemyActiveValue').textContent = gameState.enemy.activeBuffs.length ? gameState.enemy.activeBuffs.join(', ') : '—';
  // D-104/KI-41 — the enemy panel no longer prints "Loaded buffs"/"Active
  // this turn" as its own lines; hovering the enemy art shows the same
  // information instead, one loaded face per line, then a blank line,
  // then what's active this turn.
  const enemyArtBox = document.getElementById('enemyArtBox');
  if (enemyArtBox) {
    const activeText = 'Active this turn: ' + (gameState.enemy.activeBuffs.length ? gameState.enemy.activeBuffs.join(', ') : '—');
    setHoverTip(enemyArtBox, (loadedBuffs.length ? loadedBuffs : ['—']).concat([' ', activeText]));
  }
  const wrathLine = document.getElementById('enemyWrathLine');
  if (wrathLine) {
    if (gameState.enemy.wrath > 0) {
      wrathLine.style.display = '';
      document.getElementById('enemyWrathValue').textContent = '+' + gameState.enemy.wrath;
      setHoverTip(document.getElementById('enemyWrathValue'), 'Wrath: each Attack deals this much more.');
    } else {
      wrathLine.style.display = 'none';
    }
  }
  const drainLine = document.getElementById('playerDrainLine');
  if (drainLine) {
    if (gameState.player.drainNextRound > 0) {
      drainLine.style.display = '';
      document.getElementById('playerDrainValue').textContent = 'DRAIN −' + gameState.player.drainNextRound + ' SOUL';
      setHoverTip(document.getElementById('playerDrainValue'), 'Drain: ' + gameState.player.drainNextRound + ' less soul at the start of next round.');
    } else {
      drainLine.style.display = 'none';
    }
  }

  document.getElementById('playerBlockValue').textContent = gameState.player.block;
  document.getElementById('playerHpValue').textContent = shownHp(gameState.player.hp) + ' / ' + gameState.player.maxHp;
  document.getElementById('playerSoulValue').textContent = gameState.player.soul + ' / ' + gameState.player.maxSoul;
  const playerDebuffs = [];
  if (gameState.player.poisonStacks) playerDebuffs.push('poison x' + gameState.player.poisonStacks);
  if (gameState.player.penitenceActive) playerDebuffs.push('penitence');
  const playerDebuffsEl = document.getElementById('playerDebuffsValue');
  playerDebuffsEl.textContent = playerDebuffs.length ? playerDebuffs.join(', ') : '—';
  const poisonTip = 'Poison: at the end of your turn, every ' + GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK + ' block you hold removes 1 stack of poison. Then poison deals 1 damage per stack, ignoring block, and loses 1 stack.';
  setHoverTip(playerDebuffsEl, poisonTip);
  renderStatusRows(poisonTip);
  document.getElementById('playerDeckValue').textContent = gameState.player.deck.length;
  document.getElementById('playerDiscardValue').textContent = gameState.player.discard.length;

  document.getElementById('roundValue').textContent = gameState.turn.round;

  if (lastEnemyHp !== null && gameState.enemy.hp !== lastEnemyHp) {
    flashElement('enemyHpValue', 'fx-pop-red');
  }
  lastEnemyHp = gameState.enemy.hp;

  if (lastPlayerHp !== null && gameState.player.hp !== lastPlayerHp) {
    flashElement('playerHpValue', 'fx-pop-red');
  }
  lastPlayerHp = gameState.player.hp;
}

// One 28px square per state present on that side, each carrying the same
// sentence its own stat line already uses on its own hover tip.
function renderStatusRows(poisonTitle) {
  function icon(row, text, className, title) {
    const el = document.createElement('div');
    el.className = 'status-icon ' + className;
    el.textContent = text;
    setHoverTip(el, title);
    row.appendChild(el);
  }

  const playerRow = document.getElementById('playerStatusRow');
  if (playerRow) {
    playerRow.innerHTML = '';
    if (gameState.player.poisonStacks > 0) {
      icon(playerRow, 'P' + gameState.player.poisonStacks, 'status-poison', poisonTitle);
    }
    if (gameState.player.penitenceActive) {
      const turnsLeft = gameState.player.penitenceTurnsRemaining;
      icon(playerRow, 'PN', 'status-penitence', 'Penitence: lose 1 soul at the start of your turn. ' + turnsLeft + (turnsLeft === 1 ? ' turn left.' : ' turns left.'));
    }
    if (gameState.player.drainNextRound > 0) {
      icon(playerRow, 'D' + gameState.player.drainNextRound, 'status-drain', 'Drain: ' + gameState.player.drainNextRound + ' less soul at the start of next round.');
    }
    if (gameState.turn.sealedFaces.length > 0) {
      icon(playerRow, 'S', 'status-seal', 'Sealed: face ' + gameState.turn.sealedFaces.join(', ') + ' counts as blank this round.');
    }
  }

  const enemyRow = document.getElementById('enemyStatusRow');
  if (enemyRow) {
    enemyRow.innerHTML = '';
    if (gameState.enemy.poisonStacks > 0) {
      icon(enemyRow, 'P' + gameState.enemy.poisonStacks, 'status-poison', 'Poison: deals 1 damage per stack at the end of its turn, then loses 1 stack.');
    }
    if (gameState.enemy.wrath > 0) {
      icon(enemyRow, 'W' + gameState.enemy.wrath, 'status-wrath', 'Wrath: each Attack deals this much more.');
    }
    if (gameState.enemy.aweStacks > 0) {
      icon(enemyRow, 'A' + gameState.enemy.aweStacks, 'status-awe', 'Awe: lowers this enemy\'s next Attack by this many stacks, then loses 1 stack at the start of its round.');
    }
  }
}

// Placeholders for art that does not exist yet — /art/ is empty.
// A loaded image hides its box's text label; a failed load (onerror —
// no art files ship in this build) hides the image and shows the label.
function setArtImage(imgId, labelId, src, labelText) {
  const img = document.getElementById(imgId);
  const label = document.getElementById(labelId);
  if (!img || !label) return;
  label.textContent = labelText;
  if (img.getAttribute('data-art-src') !== src) {
    img.setAttribute('data-art-src', src);
    img.onload = function() { img.style.display = 'block'; label.style.display = 'none'; };
    img.onerror = function() { img.style.display = 'none'; label.style.display = ''; };
    img.src = src;
  }
}

// Card art — art/cards/ is empty, no image files ship in this build. A
// missing file leaves the img hidden and the box empty, no label, since a
// card's own name/text already sit outside this box.
function attachCardArtImg(container, cardId) {
  const img = document.createElement('img');
  img.className = 'card-art-img';
  img.alt = '';
  img.onerror = function() { img.style.display = 'none'; };
  img.src = 'art/cards/' + cardId + '.png';
  container.appendChild(img);
  return img;
}

// Mod/artifact icon at a fixed pixel size; a missing file hides the img and
// leaves the row's own text as it was.
function attachArtIcon(container, folder, id, px, className) {
  const img = document.createElement('img');
  img.className = className;
  img.alt = '';
  img.style.width = px + 'px';
  img.style.height = px + 'px';
  img.onerror = function() { img.style.display = 'none'; };
  img.src = 'art/' + folder + '/' + id + '.png';
  container.appendChild(img);
  return img;
}

// ---------- POP NUMBERS — the drawing primitive only (F46) ----------
// Never called from a render function: state.js announces, beside the
// [STATE] log line for the same change. Keyed anchorId|kind so several
// hits on one target climb one total instead of stacking numbers.

const fxLivePops = {};

function fxLayer() {
  let layer = document.getElementById('fxLayer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fxLayer';
    document.body.appendChild(layer);
  }
  return layer;
}

function spawnFxNumber(anchorId, kind, delta) {
  // D-107: pops follow a spinning die icon — held, then replayed in order
  // the moment it stops (releaseDieRollDisplay()).
  if (dieRollHolding('player') || dieRollHolding('enemy')) {
    heldFxNumbers.push([anchorId, kind, delta]);
    return;
  }
  const anchor = document.getElementById(anchorId);
  if (!anchor) { return; }
  const cfg = GAME_CONFIG.DAMAGE_NUMBERS;
  const key = anchorId + '|' + kind;
  const live = fxLivePops[key];
  const total = (live ? live.total : 0) + delta;

  const el = live ? live.el : document.createElement('div');
  if (!live) {
    el.className = 'fx-number';
    el.dataset.fxKind = kind;
    fxLayer().appendChild(el);
  }
  el.style.color = cfg.COLOURS[kind] || 'var(--text)';
  el.textContent = (total > 0 ? '+' : '') + total;

  // applyScale() zooms <html>, so a rect comes back already multiplied by
  // that zoom while style.left is read in the zoomed context's own pixels
  // — divide back out or every pop lands off its readout.
  const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const rect = anchor.getBoundingClientRect();
  el.style.left = ((rect.left + rect.width / 2) / zoom) + 'px';
  el.style.top = ((rect.top + rect.height / 2) / zoom) + 'px';
  el.style.setProperty('--fx-rise', cfg.RISE_PX + 'px');

  // Restarts the rise from the top on every update, so a climbing total
  // fades FADE_MS after its last hit, not its first.
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'fxRise ' + cfg.FADE_MS + 'ms steps(' + cfg.STEPS + ') forwards';

  if (live) clearTimeout(live.timer);
  fxLivePops[key] = {
    el: el,
    total: total,
    timer: setTimeout(function() {
      if (el.parentNode) el.parentNode.removeChild(el);
      delete fxLivePops[key];
    }, cfg.FADE_MS)
  };
}

// ---------- THE ONE OFFER PANEL (D-86) ----------
// Die action, card reward, artifact reward, shop and The Font all render
// through renderOfferPanel(). Nothing here is static HTML — every panel
// is built from gameState on every refreshInspector() (KI-3).

// ---------- THE ONE CARD (D-112) ----------
// Every card the player sees — hand, card reward, shop, CARDS layer, both
// removal pickers — is renderCard() at one of three sizes: 'offer', 'hand',
// 'mini'. A 2 px border and the rarity line in its tier's colour (D-111),
// the soul cost as filled dots top right (none at zero cost), never a cost
// in the name. The Ring 0 cards carry no tier and read basic.

function cardTier(card) {
  return (card && card.tier) || 'basic';
}

// opts: { size, button, footText, disabled, unaffordable, count, onClick }.
// onClick runs through offerCardHandleClick() (D-106) except on the hand,
// where a play is immediate.
function renderCard(cardId, opts) {
  const card = gameState.config.cardPool[cardId] || getCard(cardId);
  const size = opts.size || 'offer';
  const tier = cardTier(card);
  const colour = GAME_CONFIG.TIER_COLOURS[tier];
  const text = getCardEffectText(cardId);

  const el = document.createElement(opts.button ? 'button' : 'div');
  el.className = 'offer-card offer-card-' + size + (size === 'hand' ? ' hand-card-el' : '') +
    (opts.disabled ? ' offer-card-disabled' : '') + (opts.unaffordable ? ' unaffordable' : '');
  el.dataset.offerId = cardId;
  el.dataset.tier = tier;
  el.style.borderColor = colour;
  setHoverTip(el, card.name + ' — ' + text);

  const cost = document.createElement('div');
  cost.className = 'offer-card-cost';
  for (let i = 0; i < getCardCost(card); i++) {
    const dot = document.createElement('span');
    dot.className = 'offer-card-dot';
    cost.appendChild(dot);
  }
  el.appendChild(cost);

  if (opts.count > 1) {
    const count = document.createElement('span');
    count.className = 'offer-card-count';
    count.textContent = '×' + opts.count;
    el.appendChild(count);
  }

  const name = document.createElement('div');
  name.className = 'offer-card-name';
  name.textContent = card.name;
  el.appendChild(name);

  const tierLine = document.createElement('div');
  tierLine.className = 'offer-card-tier';
  tierLine.textContent = tier.toUpperCase();
  tierLine.style.color = colour;
  el.appendChild(tierLine);

  const art = document.createElement('div');
  art.className = 'offer-card-art';
  if (size === 'offer') {
    const label = document.createElement('span');
    label.className = 'offer-card-art-label';
    label.textContent = card.name.toUpperCase() + ' ART';
    art.appendChild(label);
    attachCardArtImg(art, cardId).addEventListener('load', function() { label.style.display = 'none'; });
  } else {
    attachCardArtImg(art, cardId);
  }
  el.appendChild(art);

  const tag = document.createElement('div');
  tag.className = 'offer-card-tag';
  tag.textContent = offerTagText(card.tags);
  el.appendChild(tag);

  const textEl = document.createElement('div');
  textEl.className = 'offer-card-text';
  textEl.textContent = text;
  el.appendChild(textEl);

  if (opts.footText) {
    const foot = document.createElement('div');
    foot.className = 'offer-card-foot';
    foot.textContent = opts.footText;
    el.appendChild(foot);
  }

  if (opts.onClick && !opts.disabled) {
    el.addEventListener('click', size === 'hand' ? opts.onClick : function() { offerCardHandleClick(el, opts.onClick); });
  } else if (!opts.onClick) {
    el.style.cursor = 'default';
  }
  return el;
}

// A card offer's spec (offerCardSpecForCard()) drawn as the one card.
function renderOfferCard(spec) {
  return renderCard(spec.id, { size: 'offer', footText: spec.footText, disabled: spec.disabled, onClick: spec.onClick });
}

// The owned deck as one card per distinct id, each with its copy count —
// the removal pickers and the CARDS layer. onPick gets the id's first index
// in ownedCards, the same copy a list of every copy would remove first.
function renderOwnedCardGrid(onPick) {
  const grid = document.createElement('div');
  grid.className = 'card-grid';
  const owned = gameState.player.ownedCards;
  const ids = [];
  owned.forEach(function(id) { if (ids.indexOf(id) === -1) ids.push(id); });
  ids.forEach(function(id) {
    const count = owned.filter(function(o) { return o === id; }).length;
    grid.appendChild(renderCard(id, {
      size: 'mini',
      count: count,
      onClick: onPick ? function() { log('[CLICK] ' + getCard(id).name); onPick(owned.indexOf(id)); } : null
    }));
  });
  return grid;
}

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

function renderArtBoxes() {
  setArtImage('playerArtImg', 'playerArtLabel', 'art/ordained.png', 'ORDAINED ART');
  const enemyName = gameState.enemy.name;
  setArtImage('enemyArtImg', 'enemyArtLabel', 'art/' + (enemyName || '').toLowerCase() + '.png',
    (enemyName ? enemyName.toUpperCase() + ' ' : '') + 'ART');
}

// D-97 — no art ships this build (/art/ stays empty), so this stays
// hidden; the moment art/background_act<N>.png exists it draws itself,
// same load/error pattern setArtImage() already uses for character art.
function renderActBackground() {
  const img = document.getElementById('actBackgroundImg');
  if (!img) return;
  const src = 'art/background_act' + gameState.run.actNumber + '.png';
  if (img.getAttribute('data-bg-src') !== src) {
    img.setAttribute('data-bg-src', src);
    img.onload = function() { img.style.display = 'block'; };
    img.onerror = function() { img.style.display = 'none'; };
    img.src = src;
  }
}

// No gold mechanic exists in V1; the field is read if it is ever added.
// Shown only while Third Eye is held, unused this act, and a roll is
// actually pending — the one window thirdEyeChooseFace() itself accepts.
function renderThirdEyeButton() {
  const btn = document.getElementById('thirdEyeBtn');
  if (!btn) return;
  const eligible = hasArtifact('third_eye') && !gameState.run.thirdEyeUsedThisAct &&
    gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved;
  btn.style.display = eligible ? '' : 'none';
  btn.classList.toggle('choosing', thirdEyeChoosing);
  if (!eligible) { thirdEyeChoosing = false; }

  const rerollBtn = document.getElementById('secondChanceBtn');
  if (rerollBtn) {
    rerollBtn.style.display = (hasArtifact('second_chance') && !gameState.turn.secondChanceUsedThisFight &&
      gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved) ? '' : 'none';
  }

  const gildedBtn = document.getElementById('gildedDieBtn');
  if (!gildedBtn) return;
  const gildedEligible = hasArtifact('gilded_die') && gameState.run.gold >= GAME_CONFIG.ARTIFACTS.GILDED_DIE_PRICE &&
    !gameState.turn.gildedFace && gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved;
  gildedBtn.style.display = gildedEligible ? '' : 'none';
  gildedBtn.classList.toggle('choosing', gildedDieChoosing);
  if (!gildedEligible) { gildedDieChoosing = false; }
}

// D-114 — the coin icon beside the amount; the amount is the only part
// that ever changes, so the icon element is never rebuilt.
function renderTopBarTokens() {
  const goldEl = document.getElementById('goldValue');
  if (!goldEl) return;
  const goldIcon = document.getElementById('goldIcon');
  if (goldIcon && !goldIcon.dataset.wired) {
    goldIcon.dataset.wired = '1';
    const showFallback = function() {
      goldIcon.style.display = 'none';
      document.getElementById('goldFallback').style.display = '';
    };
    goldIcon.onerror = showFallback;
    if (goldIcon.complete && goldIcon.naturalWidth === 0) showFallback();
  }
  document.getElementById('goldAmount').textContent = gameState.run.gold === undefined ? '—' : gameState.run.gold;
  setHoverTip(goldEl, 'Gold: ' + (gameState.run.gold === undefined ? '—' : gameState.run.gold) + '. Spent in the shop after every rite.');

  const artifactRow = document.getElementById('artifactRow');
  if (!artifactRow) return;
  const slots = artifactRow.querySelectorAll('.artifact-slot');
  slots.forEach(function(slot, index) {
    const artifactId = gameState.run.artifacts[index];
    if (artifactId && gameState.config.artifacts[artifactId]) {
      const artifact = gameState.config.artifacts[artifactId];
      // The visible name lives in its own child span — slot.textContent
      // stays exactly the held artifact's name — with the hover tip as a
      // sibling span, appended after (setHoverTip), never inside it. The
      // icon is kept between renders so it never reloads; the name span is
      // hidden only once the icon has loaded.
      if (slot.dataset.artifactId !== artifactId) {
        slot.innerHTML = '';
        slot.dataset.artifactId = artifactId;
        const nameSpan = document.createElement('span');
        nameSpan.className = 'artifact-slot-name';
        nameSpan.textContent = artifact.name;
        slot.appendChild(nameSpan);
        const img = document.createElement('img');
        img.className = 'artifact-slot-img';
        img.alt = '';
        img.onload = function() { nameSpan.style.visibility = 'hidden'; };
        img.onerror = function() { img.style.display = 'none'; };
        img.src = 'art/artifacts/' + artifactId + '.png';
        slot.appendChild(img);
      }
      setHoverTip(slot, artifact.name + ' — ' + artifact.text);
    } else {
      slot.innerHTML = '';
      delete slot.dataset.artifactId;
      slot.classList.remove('hover-parent');
    }
  });
}

// ---------- DIE ICONS ----------
// One outline per die size: 20 faces a hexagon d20, 12 a pentagon, 6 a
// square. Shape follows GAME_CONFIG.DIE_SIZE, never a bare literal.

const DIE_ICON_SHAPES = {
  20: '<polygon points="50,6 88,28 88,72 50,94 12,72 12,28"/>' +
      '<polygon points="50,26 76,70 24,70"/>' +
      '<line x1="50" y1="6" x2="50" y2="26"/><line x1="88" y1="28" x2="50" y2="26"/>' +
      '<line x1="12" y1="28" x2="50" y2="26"/><line x1="88" y1="72" x2="76" y2="70"/>' +
      '<line x1="12" y1="72" x2="24" y2="70"/><line x1="50" y1="94" x2="50" y2="70"/>',
  12: '<polygon points="50,8 91,38 76,88 24,88 9,38"/>' +
      '<polygon points="50,30 71,45 63,70 37,70 29,45"/>' +
      '<line x1="50" y1="8" x2="50" y2="30"/><line x1="91" y1="38" x2="71" y2="45"/>' +
      '<line x1="76" y1="88" x2="63" y2="70"/><line x1="24" y1="88" x2="37" y2="70"/>' +
      '<line x1="9" y1="38" x2="29" y2="45"/>',
  6: '<rect x="12" y="12" width="76" height="76"/><rect x="32" y="32" width="36" height="36"/>' +
     '<line x1="12" y1="12" x2="32" y2="32"/><line x1="88" y1="12" x2="68" y2="32"/>' +
     '<line x1="88" y1="88" x2="68" y2="68"/><line x1="12" y1="88" x2="32" y2="68"/>'
};

function dieIconSvg(dieSize, colourVar) {
  const shape = DIE_ICON_SHAPES[dieSize] || DIE_ICON_SHAPES[20];
  return '<svg viewBox="0 0 100 100" fill="none" stroke="' + colourVar + '" stroke-width="3">' + shape + '</svg>';
}

// Which identity colour the number inside the player's own d20 wears.
function playerDieIconColour() {
  const outcome = gameState.turn.rollOutcome;
  if (outcome === 'nat_twenty' || outcome === 'nat_one') return 'var(--nat)';
  if (outcome === 'mod') return 'var(--player-mod)';
  return 'var(--blank)';
}

// ---------- DIE ROLL ANIMATION (D-107) ----------
// Display only: the phase machine never waits on it. refreshInspector()
// spots a fresh roll on the render it lands; that side's icon then steps
// through DIE_ROLL_ANIMATION's frames while its face row, the roll strip
// and every pop hold, all released together as the icon snaps upright.
// Frame numbers come from a display-only generator so gameplay's own
// Math.random sequence (seeded by tests/autoplay.js) is never consumed.

const dieRollAnims = { player: null, enemy: null };
const lastSeenRollSignatures = { player: null, enemy: null };
const heldFxNumbers = [];
let enemyRollDisplay = null;
let dieRollAnimSeed = (Date.now() % 2147483646) + 1;

function dieRollAnimRandom(dieSize, avoid) {
  let n;
  do {
    dieRollAnimSeed = (dieRollAnimSeed * 48271) % 2147483647;
    n = 1 + (dieRollAnimSeed % dieSize);
  } while (n === avoid && dieSize > 1);
  return n;
}

function dieRollHolding(side) {
  const anim = dieRollAnims[side];
  return !!anim && anim.stage === 'spin';
}

function shownPlayerRoll() {
  if (dieRollHolding('player')) return { faceNumber: null, outcome: null };
  return { faceNumber: gameState.turn.rolledFaceNumber, outcome: gameState.turn.rollOutcome };
}

// The enemy rolls at a round's end and the next START_OF_TURN clears the
// state's own copy at once, so its roll holds here through the round that
// follows — the round its Wrath/Drain/Seal land in — until it rolls again.
function shownEnemyRoll() {
  if (!enemyRollDisplay || dieRollHolding('enemy')) return { faceNumber: null, outcome: null };
  return { faceNumber: enemyRollDisplay.faceNumber, outcome: enemyRollDisplay.outcome };
}

function noteDieRollsForAnimation() {
  const turn = gameState.turn;
  const held = enemyRollDisplay;
  if (turn.round === 0 || (held && (held.die !== gameState.enemy.die || turn.round > held.round + 1))) {
    enemyRollDisplay = null;
  }
  const playerSig = turn.rolledFaceNumber === null ? null : turn.round + ':' + turn.rolledFaceNumber + ':' + turn.rollOutcome;
  const enemySig = turn.enemyRolledFaceNumber === null ? null : turn.round + ':' + turn.enemyRolledFaceNumber + ':' + turn.enemyRollOutcome;
  const inFight = gameState.run.screen === 'fight';
  if (playerSig !== null && playerSig !== lastSeenRollSignatures.player && inFight) {
    startDieRollAnimation('player', GAME_CONFIG.DIE_SIZE.PLAYER, turn.rolledFaceNumber);
  }
  if (enemySig !== null && enemySig !== lastSeenRollSignatures.enemy) {
    enemyRollDisplay = { faceNumber: turn.enemyRolledFaceNumber, outcome: turn.enemyRollOutcome, round: turn.round, die: gameState.enemy.die };
    if (inFight) { startDieRollAnimation('enemy', gameState.enemy.die.faces.length, turn.enemyRolledFaceNumber); }
  }
  lastSeenRollSignatures.player = playerSig;
  lastSeenRollSignatures.enemy = enemySig;
}

// FRAME_COUNT frames over DURATION_MS, each a new number, rotated a step
// further; then upright on the rolled number (the release), one flash to
// --text for FLASH_MS, and SHAKE_CYCLES left-right shakes of SHAKE_PX.
function startDieRollAnimation(side, dieSize, rolledNumber) {
  const cfg = GAME_CONFIG.DIE_ROLL_ANIMATION;
  const frameMs = cfg.DURATION_MS / cfg.FRAME_COUNT;
  if (dieRollAnims[side]) { clearTimeout(dieRollAnims[side].timer); }
  const anim = { stage: 'spin', frame: 1, number: dieRollAnimRandom(dieSize, rolledNumber), rotation: cfg.ROTATE_STEP_DEG, shiftX: 0, flash: false, shakeStep: 0, timer: null };
  dieRollAnims[side] = anim;
  if (side === 'player') { playAudioEvent('die_rolling'); }
  function step() {
    if (dieRollAnims[side] !== anim) return;
    if (anim.stage === 'spin' && anim.frame < cfg.FRAME_COUNT) {
      anim.frame++;
      anim.number = dieRollAnimRandom(dieSize, anim.number);
      anim.rotation = anim.frame * cfg.ROTATE_STEP_DEG;
      anim.timer = setTimeout(step, frameMs);
      renderDieIcons();
    } else if (anim.stage === 'spin') {
      Object.assign(anim, { stage: 'flash', rotation: 0, flash: true });
      anim.timer = setTimeout(step, cfg.FLASH_MS);
      releaseDieRollDisplay(side);
    } else if (anim.shakeStep < cfg.SHAKE_CYCLES * 2) {
      Object.assign(anim, { stage: 'shake', flash: false, shiftX: (anim.shakeStep % 2 === 0 ? -1 : 1) * cfg.SHAKE_PX });
      anim.shakeStep++;
      anim.timer = setTimeout(step, cfg.SHAKE_STEP_MS);
      renderDieIcons();
    } else {
      dieRollAnims[side] = null;
      renderDieIcons();
    }
  }
  anim.timer = setTimeout(step, frameMs);
}

// The icon has stopped: the face row, roll strip and held pops catch up.
function releaseDieRollDisplay(side) {
  refreshInspector();
  if (side === 'player') {
    releaseHeldAudioEvents();
    paintRollHero();
    const hero = document.getElementById('rollHero');
    if (hero) { hero.classList.remove('roll-pulse'); void hero.offsetWidth; hero.classList.add('roll-pulse'); }
  }
  if (!dieRollHolding('player') && !dieRollHolding('enemy')) {
    // A pop whose readout a reward layer has since hidden is dropped, not
    // drawn at the page corner.
    heldFxNumbers.splice(0).forEach(function(a) {
      const anchor = document.getElementById(a[0]);
      if (anchor && anchor.getClientRects().length) { spawnFxNumber(a[0], a[1], a[2]); }
    });
  }
}

// Test/dev read: true once neither die icon is mid-animation.
function dieRollAnimationsIdle() {
  return !dieRollAnims.player && !dieRollAnims.enemy;
}

// One icon's current look: the spinning frame's number and turn, or the
// resting number (null pre-roll) upright, plus any flash or shake.
function dieIconFrame(side, restingNumber, restingColour) {
  const anim = dieRollAnims[side];
  if (!anim) return { number: restingNumber, colour: restingColour, stroke: null, transform: 'none', stage: 'idle' };
  const parts = [];
  if (anim.rotation) parts.push('rotate(' + anim.rotation + 'deg)');
  if (anim.shiftX) parts.push('translateX(' + anim.shiftX + 'px)');
  const spinning = anim.stage === 'spin';
  return {
    number: spinning ? anim.number : restingNumber,
    colour: (spinning || anim.flash) ? 'var(--text)' : restingColour,
    stroke: anim.flash ? 'var(--text)' : null,
    transform: parts.length ? parts.join(' ') : 'none',
    stage: anim.stage
  };
}

function dieIconWrapHtml(frame, dieSize, strokeColour) {
  return '<div class="die-icon-wrap" data-roll-anim="' + frame.stage + '" style="transform:' + frame.transform + '">' +
    dieIconSvg(dieSize, frame.stroke || strokeColour) +
    '<div class="die-icon-number" style="color:' + frame.colour + '">' +
    (frame.number === null ? '' : '<span class="die-icon-number-text">' + frame.number + '</span>') + '</div></div>';
}

function renderDieIcons() {
  const playerEl = document.getElementById('playerDieIcon');
  if (playerEl) {
    const rolled = shownPlayerRoll().faceNumber;
    const frame = dieIconFrame('player', rolled, playerDieIconColour());
    playerEl.innerHTML = dieIconWrapHtml(frame, GAME_CONFIG.DIE_SIZE.PLAYER, 'var(--text)');
    setHoverTip(playerEl, 'Your die: d' + GAME_CONFIG.DIE_SIZE.PLAYER +
      (frame.stage === 'spin' ? ', rolling.' : rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.'));
  }

  const enemyEl = document.getElementById('enemyDieIcon');
  if (!enemyEl) return;
  // D-29 — a normal with no die shows an empty outline, never a fake die.
  if (!gameState.enemy.hasDie || !gameState.enemy.die.faces.length) {
    enemyEl.innerHTML = '<div class="die-icon-empty"></div>';
    setHoverTip(enemyEl, 'This enemy carries no die.');
    return;
  }
  const size = gameState.enemy.die.faces.length;
  const shown = shownEnemyRoll();
  const rolled = shown.faceNumber;
  const outcome = shown.outcome;
  let word = '';
  let wordColour = 'var(--enemy-mod)';
  if (outcome === 'nat_twenty') { word = 'NAT 20'; wordColour = 'var(--nat)'; }
  else if (outcome === 'nat_one') { word = 'NAT 1'; wordColour = 'var(--nat)'; }
  else if (rolled !== null) {
    const face = gameState.enemy.die.faces[rolled - 1];
    if (face && face.modId !== null) word = modDisplayName(face.modId);
  }
  const frame = dieIconFrame('enemy', rolled, 'var(--enemy-mod)');
  enemyEl.innerHTML = dieIconWrapHtml(frame, size, 'var(--enemy-mod)') +
    '<div class="die-icon-side"><div style="color:' + wordColour + '">' + word + '</div>' +
    '<div style="color:var(--muted)">d' + size + '</div></div>';
  setHoverTip(enemyEl, 'Enemy die: d' + size + (frame.stage === 'spin' ? ', rolling.' : rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.'));
}

// D-125: every player-read text is one or two short imperative sentences —
// a number before its noun, conditions at the front, no parentheses, never
// 'applied' or 'this run'. Tags (Bound, Growth) live on the tag line.
const CARD_EFFECT_TEXT = {
  strike: 'Deal 5 damage.',
  ward: 'Gain 5 block.',
  rite: 'Deal 6 damage. Gain 6 block.',
  rebuke: 'Deal 4 damage.',
  censure: 'Deal 14 damage.',
  judgement: 'Deal 20 damage.',
  vestment: 'Gain 13 block.',
  litany: 'Deal 7 damage. Gain 7 block.',
  scripture: 'Draw 2 cards.',
  communion: 'Gain 2 soul.',
  censer: 'Apply 4 stacks of poison.',
  purge: 'Deal 6 damage. If the enemy has poison, deal 10 instead.',
  interdict: "Gain 5 block. If the enemy's intent deals 12 or more damage this round, gain 10 instead.",
  bulwark: 'Gain 6 block. If the enemy is winding up or releasing, gain 16 instead.',
  reckoning: 'Deal 3 damage, plus 2 per stack of poison on the enemy.',
  retribution: 'Deal damage equal to your block, up to 12.',
  covenant: 'Deal 2 damage, plus 3 per weight on the rolled face.',
  rapture: 'Deal 12 damage. If a mod has triggered this turn, this costs 0 soul.',
  orison: 'Deal 5 damage. If you rolled a blank, deal 9 instead.',
  tenet: 'Deal 6 damage, plus 1 for each time the rolled face has triggered.',
  gradual: "Deal 3 damage, plus 1 per weight on your heaviest face that isn't blank.",
  vacancy: 'Deal 1 damage per blank face on your die, up to 16.',
  lauds: 'Deal 4 damage, plus 3 per Growth mod on your die, up to 13.',
  chastise: 'Deal 7 damage.',
  cloister: 'Gain 7 block.',
  psalm: 'Draw 1 card.',
  reliquary: 'Gain 6 block. If you already had 10 or more block, deal 5 damage.',
  vindication: 'Deal damage equal to twice your block, up to 24.',
  myrrh: 'Gain 6 block, plus 1 per stack of poison on the enemy, up to 12.',
  exequy: "Deal damage equal to the enemy's stacks of poison, up to 12.",
  hosanna: "Deal 6 damage. If the enemy's intent this round is not an Attack, deal 12 instead.",
  gloria: 'Deal 30 damage.',
  oblation: 'Spend all your soul. Deal 7 damage per soul spent, up to 42.',
  tabernacle: 'Gain 3 block, plus 3 per weight on the rolled face, up to 12.',
  jubilee: 'Deal 4 damage, plus 2 per weight added to your die, up to 24.',
  // Fallback only — getCardEffectText() below overrides this with the
  // live threnodyFace number; no real caller reads this map directly.
  threnody: 'Trigger the same face every time. If it is blank, gain 2 block.',
  reverberation: 'Trigger the rolled face again. If you rolled a 1 or 20, gain 6 block instead.',
  kyrie: 'Deal 5 damage. If the rolled face has Bound, deal 10 instead.',
  novena: 'Trigger every loaded Bound face.',
  canticle: 'Gain 6 block. If the rolled face is loaded, it gains Bound for this fight.',
  kneel: 'Apply 3 stacks of awe.',
  compline: 'Gain 4 block. Apply 2 stacks of awe.',
  tremendum: 'Deal 4 damage, plus 2 per stack of awe on the enemy, up to 12.',
  mysterium: 'Deal 3 damage per stack of awe on the enemy, up to 12. The stacks of awe stay.',
  venom: 'Apply 2 stacks of poison. If the enemy has poison, apply 4 instead.',
  ballast: 'Deal 3 damage per weight on your heaviest face, up to 12.',
  refrain: 'Trigger the rolled face again.',
  second_sight: 'Roll your die again. The new face resolves as a roll.',
  cadence: 'Deal damage equal to twice the round number, up to 12.',
  watchword: 'Gain 5 block. If a Bound face triggered this round, gain 12 instead.',
  blight_weight: 'Apply 2 stacks of poison per weight on the rolled face, up to 8.'
};

// Every site that draws a card's effect text calls this instead of
// reading CARD_EFFECT_TEXT[cardId] directly, so Threnody's real,
// run-fixed face number shows everywhere.
function getCardEffectText(cardId) {
  if (cardId === 'threnody' && gameState.run.threnodyFace !== null) {
    return 'Trigger face ' + gameState.run.threnodyFace + ', the same face every time. If it is blank, gain 2 block.';
  }
  return CARD_EFFECT_TEXT[cardId] || '';
}

// Hover text for mods and Nat faces, written to what each mod's code does.
const MOD_DESCRIPTION = {
  consecrate: 'Gain 2 soul. Cards you play this turn give 3 block.',
  smite: 'Deal 16 damage.',
  penance: 'Deal 8 damage. Gain 8 block.',
  offering: 'Gain 2 soul. Draw 1 card.',
  blight: 'Apply 6 stacks of poison.',
  virulence: "Apply 3 stacks of poison. Double the enemy's stacks of poison.",
  sanctuary: 'Gain 16 block.',
  vigil: 'When this turn ends, gain 5 block per card in your hand.',
  zeal: 'Deal 10 damage, plus 4 for each earlier trigger of this face.',
  fervour: 'Double your attack damage this turn.',
  ordain: 'Deal 10 damage. Add 1 weight to this face.',
  anthem: 'Deal 6 damage, plus 4 per weight on this face.',
  elevation: 'Deal 10 damage. If the next face up holds a mod, add 1 weight to it.',
  largesse: 'Gain 2 soul and 4 block.',
  tithe: 'When this turn ends, deal 5 damage per soul you have left, up to 20.',
  congregation: 'Deal 8 damage. If another mod on your die has Growth, deal 16 instead.',
  cope: 'Gain 8 block, plus 2 for each earlier trigger of this face.',
  anathema: 'When this turn ends, deal damage equal to your block, up to 16.',
  thurible: 'Deal 8 damage. Apply 3 stacks of poison.',
  magnificat: 'Trigger your heaviest other loaded face.',
  unison: 'Deal 6 damage.',
  accord: 'Gain 10 block.',
  kinship: 'Apply 4 stacks of poison.',
  concord: 'Gain 1 soul and 3 block.',
  herald: 'Deal 6 damage. Another random loaded face without Bound gains Bound for this fight.',
  dread: 'Apply 4 stacks of awe.',
  genuflect: 'Gain 6 block. Apply 3 stacks of awe.'
};

const NAT_DESCRIPTION = {
  NAT_TWENTY: 'Trigger every loaded face, lowest first.',
  NAT_ONE: 'Lose 1 soul at the start of each of your next 3 turns. Once per fight, then a 1 is blank.'
  // ENEMY_NAT_ONE/ENEMY_NAT_TWENTY intentionally absent — their text needs
  // the current act's buffPoisonStacks number; faceHoverText() builds it inline.
};

const CARD_FX_TYPE = {
  strike: 'attack',
  ward: 'block',
  rite: 'both'
};

function triggerCardFx(cardName) {
  let cardId = null;
  for (const id in gameState.config.cards) {
    if (gameState.config.cards[id].name === cardName) { cardId = id; break; }
  }
  const fxType = CARD_FX_TYPE[cardId];
  if (!fxType) return;

  if (fxType === 'attack' || fxType === 'both') {
    flashElement('enemyPanel', 'fx-shake');
    flashElement('enemyHpValue', 'fx-pop-red');
  }
  if (fxType === 'block' || fxType === 'both') {
    flashElement('playerPanel', 'fx-pulse-blue');
    flashElement('playerBlockValue', 'fx-pop-blue');
  }
}

function renderCardButtons() {
  const handRow = document.getElementById('handRow');
  if (!handRow) return;
  handRow.innerHTML = '';
  const active = gameState.run.status === 'active';
  gameState.player.hand.forEach(function(cardId, index) {
    const card = getCard(cardId);
    const affordable = gameState.player.soul >= getCardCost(card);
    const btn = renderCard(cardId, {
      size: 'hand',
      button: true,
      unaffordable: !affordable,
      onClick: function() {
        log('[CLICK] ' + card.name);
        playCard(index);
      }
    });
    btn.disabled = !active;
    handRow.appendChild(btn);
  });
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

// Gilded Die's own flag, the same shape as thirdEyeChoosing.
let gildedDieChoosing = false;

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

// Artifacts carry no tags — the tag line reads NONE so the shape stays
// identical across every offer; the rarity line is the artifact's tier.
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

// ---------- MAP SCREEN ----------
// Shown between slots. Renders both lanes full-length (completed ones
// marked, the current position marked, the next available choice(s)
// clickable, everything else inert) plus the boss node and its preview —
// die reused from the real enemy die structure, HP/intent band read from
// the boss slot's own static config, never gameState.enemy's live values.

// Four node states, reusing the existing colour vocabulary only:
// completed (--blank), current (--nat, solid border — the single next
// slot on a chosen lane), choice (--nat, dashed border — the fork's two
// options before a lane is picked), inert (--muted, dim — unreachable:
// the abandoned lane, or a not-yet-unlocked slot on the chosen one).
// KI-31: a slot already entered (enterSlot() opened it, e.g. a Rite whose
// panel is still open) reads as visited, not current — it must not be
// re-entered by a second click while its own panel sits on top of the map.
function mapNodeStateClass(slot, isCurrent, isChoice) {
  if (isCurrent && !slot.entered) { return 'map-node-current'; }
  if (isChoice) { return 'map-node-choice'; }
  if (slot.completed || slot.entered) { return 'map-node-completed'; }
  return 'map-node-inert';
}

// Wires dev-jump onto a node that isn't the real current/choice click
// target. Does nothing once the run is won or lost, or while any reward
// panel (shop/artifact/card/die action) sits over the map (KI-31) — the
// map must not accept any click, dev-jump included, while one is open.
function attachDevJumpIfEligible(node, laneName, index, rewardPanelOpen) {
  // Lives outside #devChrome, so a closed dev chrome disables these nodes directly.
  if (!devChromeOpen || gameState.run.outcome !== 'active' || rewardPanelOpen) {
    node.disabled = true;
    return;
  }
  node.disabled = false;
  node.classList.add('map-node-dev-jump');
  const devText = 'Dev: jump here — skips earlier slots, grants no rewards';
  // The Elite/Boss node may already carry its own preview hover-tip
  // (enemyPreviewHoverText()) — append to it rather than laying a second
  // absolutely positioned tip over the same spot.
  const existingTip = node.querySelector('.hover-tip');
  if (existingTip) {
    existingTip.textContent += ' ' + devText;
  } else {
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    tip.textContent = devText;
    node.appendChild(tip);
  }
  node.addEventListener('click', function() { devJumpToSlot(laneName, index); });
}

// A lane row's own connectors/stubs read as committed (--nat, the chosen
// lane), abandoned (--muted, the other lane once one is picked), or
// neutral (--line, before either is picked — both still open).
function mapLaneStateClass(laneName) {
  if (gameState.run.lane === null) { return ''; }
  return (gameState.run.lane === laneName) ? 'map-lane-committed' : 'map-lane-abandoned';
}

// Names an enemy's pattern in plain words (e.g. "Attack 13–17, Afflict 4,
// Charge 27"). A Charge shows only its release value — the wind-up round
// deals no damage.
function formatPatternWords(pattern) {
  return pattern.map(function(entry) {
    if (entry.kind === 'attack') { return 'Attack ' + entry.min + '–' + entry.max; }
    if (entry.kind === 'charge') { return 'Charge ' + entry.release; }
    if (entry.kind === 'afflict') { return 'Afflict ' + entry.stacks; }
    return '';
  }).join(', ');
}

// D-98 — the same summary ELITE PREVIEW/ELITE DIE and BOSS PREVIEW/BOSS
// DIE used to print inline, now a hover-tip on that node instead. Reuses
// the same loaded-face naming #enemyBuffsValue already shows (renderStats()).
function enemyPreviewHoverText(enemy) {
  const loaded = enemy.die.faces
    .filter(function(f) { return f.modId !== null; })
    .map(function(f) { return modDisplayName(f.modId) + ' ' + f.number; });
  return enemy.name + ' — HP ' + enemy.hp + '. ' + formatPatternWords(enemy.pattern) +
    '. Loaded: ' + (loaded.length ? loaded.join(', ') : 'none') + '.';
}

function renderMapScreen() {
  const container = document.getElementById('mapScreen');
  if (!container) return;
  // startNewRun() calls several state helpers (each of which triggers its
  // own refreshInspector()) before it finally sets gameState.run.act itself
  // — guard against rendering mid-setup, same early-return shape
  // renderDieList() already uses for its own not-ready-yet case.
  if (!gameState.run.act) { container.innerHTML = ''; return; }
  container.innerHTML = '';

  // KI-31: while any of these sits over the map, no node accepts a click —
  // otherwise the still-current node underneath (a Rite mid-panel, most of
  // all) can be entered a second time.
  const rewardPanelOpen = dieActionStep !== null || cardRewardStep !== null
    || artifactRewardStep !== null || shopStep !== null || riteStep !== null || eventStep !== null;

  // D-98 — the map screen shows the top bar and the map only; the act
  // number already reads on the top bar's own #actStamp.
  const composition = document.createElement('div');
  // D-123: act 1's nine-slot lanes draw with shorter connectors.
  composition.className = 'map-composition' + (gameState.run.act.upper.length > 8 ? ' map-composition-long' : '');

  // START — a marker, not a clickable slot; reads 'current' until the
  // shared opening fight is done and 'completed' once it is.
  const openingSlot = gameState.run.act.opening;
  const startNode = document.createElement('div');
  startNode.className = 'map-node map-start-node ' + (openingSlot.completed ? 'map-node-completed' : 'map-node-current');
  startNode.textContent = 'Start';
  composition.appendChild(startNode);

  // OPENING — the shared fight both lanes pass through before the fork,
  // reusing the plain 'fight' slot type/dispatch exactly like every other
  // fight node (enterSlot('opening', null) mirrors enterSlot('boss', null)).
  const openingConnector = document.createElement('div');
  openingConnector.className = 'map-connector';
  composition.appendChild(openingConnector);

  const openingIsCurrent = gameState.run.currentSlot === 'opening';
  const openingNode = document.createElement('button');
  openingNode.className = 'map-node map-node-opening ' + mapNodeStateClass(openingSlot, openingIsCurrent, false);
  openingNode.textContent = openingSlot.label;
  if (openingIsCurrent && !openingSlot.entered && !rewardPanelOpen) {
    openingNode.addEventListener('click', function() { enterSlot('opening', null); });
  } else {
    attachDevJumpIfEligible(openingNode, 'opening', null, rewardPanelOpen);
  }
  composition.appendChild(openingNode);

  const fork = document.createElement('div');
  fork.className = 'map-fork';
  composition.appendChild(fork);

  const lanesWrap = document.createElement('div');
  lanesWrap.className = 'map-lanes';

  ['upper', 'lower'].forEach(function(laneName) {
    const laneRow = document.createElement('div');
    const laneStateClass = mapLaneStateClass(laneName);
    laneRow.className = 'map-lane' + (laneStateClass ? ' ' + laneStateClass : '');

    gameState.run.act[laneName].forEach(function(slot, index) {
      if (index > 0) {
        const connector = document.createElement('div');
        connector.className = 'map-connector' + (laneStateClass ? ' ' + (laneStateClass === 'map-lane-committed' ? 'map-connector-committed' : 'map-connector-abandoned') : '');
        laneRow.appendChild(connector);
      }

      const node = document.createElement('button');
      node.textContent = slot.label;

      // The fork is only a real choice once the shared opening fight is
      // behind the player.
      const isForkChoice = gameState.run.lane === null && index === 0 && openingSlot.completed;
      const cs = gameState.run.currentSlot;
      const isCurrent = cs && cs !== 'boss' && cs.lane === laneName && cs.index === index;

      node.className = 'map-node ' + mapNodeStateClass(slot, isCurrent, isForkChoice);

      // D-98 — the Elite node carries the same summary ELITE PREVIEW/ELITE
      // DIE used to print inline, now a hover-tip instead. Reads the
      // slot's own static enemy, never the live gameState.enemy (that
      // would go stale once any other fight is entered).
      if (slot.label === 'Elite' && slot.enemy) {
        const tip = document.createElement('span');
        tip.className = 'hover-tip';
        tip.textContent = enemyPreviewHoverText(slot.enemy);
        node.appendChild(tip);
      }

      if ((isCurrent || isForkChoice) && !slot.entered && !rewardPanelOpen) {
        node.addEventListener('click', function() {
          // A single click at the divergence both picks the lane and
          // enters that lane's first slot — there is no separate
          // "confirm the lane" step, since the two lanes' first slots are
          // the only choice a fork click could ever mean.
          if (isForkChoice) { chooseLane(laneName); enterSlot(laneName, index); }
          else { enterSlot(laneName, index); }
        });
      } else {
        attachDevJumpIfEligible(node, laneName, index, rewardPanelOpen);
      }

      laneRow.appendChild(node);
    });

    lanesWrap.appendChild(laneRow);
  });

  composition.appendChild(lanesWrap);

  const merge = document.createElement('div');
  merge.className = 'map-merge';
  composition.appendChild(merge);

  const bossBtn = document.createElement('button');
  const bossIsCurrent = gameState.run.currentSlot === 'boss';
  bossBtn.className = 'map-node map-node-boss ' + mapNodeStateClass(gameState.run.act.boss, bossIsCurrent, false);
  bossBtn.textContent = gameState.run.act.boss.label;
  // D-98 — same hover-tip treatment as the Elite node above.
  const bossTip = document.createElement('span');
  bossTip.className = 'hover-tip';
  bossTip.textContent = enemyPreviewHoverText(gameState.run.act.boss.enemy);
  bossBtn.appendChild(bossTip);
  if (bossIsCurrent && !gameState.run.act.boss.entered && !rewardPanelOpen) {
    bossBtn.addEventListener('click', function() { enterSlot('boss', null); });
  } else {
    attachDevJumpIfEligible(bossBtn, 'boss', null, rewardPanelOpen);
  }
  composition.appendChild(bossBtn);

  container.appendChild(composition);
}

// ---------- INFO LAYERS (D-98) ----------
// What the map screen used to print inline (PLAYER DIE/ARTIFACTS/CARDS)
// now lives behind the top bar's DIE/ARTIFACTS/CARDS buttons — available
// on the map and the fight screen alike. Each renders straight from
// gameState (KI-3), every refreshInspector() call, gated only on the
// matching gameState.ui.*InfoOpen flag.

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
    let html = '<div class="info-list-row">HP ' + shownHp(gameState.player.hp) + ' / ' + gameState.player.maxHp + '</div>';
    content.innerHTML = html;
    gameState.die.faces.forEach(function(face) {
      const row = document.createElement('div');
      row.className = 'info-list-row';
      [face.modId, face.modId2].forEach(function(modId) {
        if (modId && gameState.config.mods[modId]) attachArtIcon(row, 'mods', modId, 32, 'info-row-icon');
      });
      row.appendChild(document.createTextNode('Face ' + face.number + ' — ' + faceTitleText(face, true, true)));
      content.appendChild(row);
    });
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

// Fits the fight/map screen to the window: shrinks below the 1600x900
// design size, grows above it, capped at 2x so a very large monitor
// doesn't blow up text past readable size.
function applyScale() {
  const scale = Math.min(2, Math.max(1, 1.1 * Math.min(window.innerWidth / 1600, window.innerHeight / 900)));
  document.documentElement.style.zoom = String(scale);
}
