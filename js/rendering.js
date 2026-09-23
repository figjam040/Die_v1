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

// ---------- STATE INSPECTOR ----------

function refreshInspector() {
  const contentEl = document.getElementById('inspectorContent');
  if (!contentEl) return;
  contentEl.textContent = JSON.stringify(gameState, null, 2);
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
  renderDieList('playerDieList', gameState.die.faces, forcePlayerRoll);
  // Kept rendered but never shown: the enemy's own faces read off
  // #enemyBuffsValue and #enemyDieIcon instead.
  document.getElementById('enemyDieList').style.display = 'none';
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
  renderDieList('enemyDieList', gameState.enemy.die.faces, forceEnemyRoll, null, gameState.enemy.buffPoisonStacks, gameState.enemy.name, gameState.enemy.wrathPerTrigger);
  renderDieIcons();
  renderArtBoxes();
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

  // dieActionPanel/cardRewardPanel/riteScreenPanel are siblings of both
  // screens and stay governed by their own step variables regardless of
  // screen, since a rite's die action panel is reached from the map.
  document.getElementById('fightScreen').style.display = (gameState.run.screen === 'fight') ? 'flex' : 'none';
  document.getElementById('mapScreen').style.display = (gameState.run.screen === 'map') ? 'flex' : 'none';

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

function paintRollHero() {
  const hero = document.getElementById('rollHero');
  const numEl = document.getElementById('rollResultNumber');
  const labelEl = document.getElementById('rollResultLabel');
  if (!hero || !numEl || !labelEl) return;

  labelEl.innerHTML = '';
  if (rollHeroSegments.length === 0) {
    hero.classList.add('roll-hero-empty');
    numEl.classList.remove('roll-hero-nat');
    labelEl.classList.remove('roll-hero-nat');
    numEl.textContent = '';
    labelEl.textContent = 'AWAITING ROLL';
    return;
  }

  hero.classList.remove('roll-hero-empty');
  const isNat = rollHeroSegments[0].isNat;
  numEl.classList.toggle('roll-hero-nat', isNat);
  labelEl.classList.toggle('roll-hero-nat', isNat);

  const first = rollHeroSegments[0];
  numEl.textContent = first.natText || (first.value === null ? '' : '+' + first.value);

  rollHeroSegments.forEach(function(seg, idx) {
    // Every segment past the first prints its own value beside its name,
    // so a two-mod face shows both names and both numbers.
    if (idx > 0 && seg.value !== null) {
      const v = document.createElement('span');
      v.className = 'roll-hero-number';
      v.textContent = ' +' + seg.value;
      labelEl.appendChild(v);
    }
    if (seg.name) {
      const nameEl = document.createElement('span');
      nameEl.textContent = (idx > 0 ? ' ' : '') + seg.name.toUpperCase();
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
  const face = gameState.die.faces[seg.faceNumber - 1];
  const modData = (face && face.modData) || {};
  return (seg.slot === 2 ? modData.triggerCount2 : modData.triggerCount) || 0;
}

function renderRollResult(faceNumber, modIdRaw) {
  const hero = document.getElementById('rollHero');
  if (!hero) return;

  const modId = (modIdRaw === 'null') ? null : modIdRaw;
  const face = gameState.die.faces[faceNumber - 1];

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
// never invents one. Blank faces return null on purpose. Appends the
// face's own ×N when weight is above 1. buffPoisonStacks/enemyName/
// wrathAmount are the calling enemy's own act-scaled/per-enemy numbers,
// threaded through by renderDieList() rather than read from gameState
// here, so a map preview (a different enemy object) still shows correct text.
function faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount) {
  let text = null;
  if (face.modId === 'NAT_TWENTY' || face.modId === 'NAT_ONE') {
    text = NAT_DESCRIPTION[face.modId] || null;
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    if (enemyName === 'Cardinal') {
      text = "the player's two heaviest loaded faces, other than 1 and 20, count as blank next round.";
    } else if (enemyName === 'Pontifex') {
      text = 'an Attack this round resolves twice.';
    } else if (enemyName === 'Hierophant') {
      text = 'Nat 20: every loaded buff triggers, in ascending order.';
    } else {
      text = 'fires every loaded poison face this turn, ascending face order, each applying ' + buffPoisonStacks + ' stacks of poison to you';
    }
  } else if (face.modId === 'ENEMY_NAT_ONE') {
    if (enemyName === 'Cardinal') {
      text = "the player's heaviest loaded face triggers. Once per fight.";
    } else if (enemyName === 'Pontifex') {
      text = 'it loses all its Wrath. Once per fight.';
    } else if (enemyName === 'Hierophant') {
      text = 'Nat 1: its attack is cancelled and it takes ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison, once per fight. Also happens when the player rolls a Nat 1.';
    } else {
      text = 'cancels the enemy’s attack this turn (once per fight), applies ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison to itself';
    }
  } else if (face.modId === 'enemy_buff_poison') {
    text = 'applies ' + buffPoisonStacks + ' stacks of poison to you';
  } else if (face.modId === 'enemy_buff_wrath') {
    text = 'Wrath: every Attack after this round deals ' + (wrathAmount || GAME_CONFIG.ENEMY_WRATH_AMOUNT) + ' more, for the rest of the fight. Each trigger adds again.';
  } else if (face.modId === 'enemy_buff_drain') {
    text = 'Drain: the player starts next round with 1 less soul.';
    if (enemyName === 'Lector' && face.number === 6) {
      text += ' Also triggers when the player rolls a 6.';
    }
  } else if (face.modId === 'enemy_buff_seal') {
    text = "Seal: the player's heaviest loaded face, other than 1 and 20, counts as blank next round.";
  } else if (face.modId && MOD_DESCRIPTION[face.modId]) {
    text = MOD_DESCRIPTION[face.modId];
  }
  // A second mod (never possible on a Nat face) appends its own description.
  if (face.modId2 && MOD_DESCRIPTION[face.modId2]) {
    text = (text ? text + ' + ' : '') + MOD_DESCRIPTION[face.modId2];
  }
  if (!text) return null;
  if (face.weight > 1) { text += ' (×' + face.weight + ')'; }
  return text;
}

// The square's own name / weight / trigger count / Bound line, in front of
// whatever faceHoverText() already says. Reads state only.
function faceTitleText(face, showTriggerCounts, isPlayerDie) {
  const parts = [];
  if (face.modId === null) {
    parts.push('Blank');
  } else if (face.modId2) {
    parts.push(modDisplayName(face.modId) + ' + ' + modDisplayName(face.modId2));
  } else {
    parts.push(modDisplayName(face.modId));
  }
  parts.push('weight ' + face.weight);
  if (showTriggerCounts && face.modId !== null) {
    const modData = face.modData || {};
    const count1 = modData.triggerCount || 0;
    parts.push(face.modId2
      ? 'triggered ' + count1 + ' / ' + (modData.triggerCount2 || 0) + ' times this run'
      : 'triggered ' + count1 + ' times this run');
  }
  if (isBoundFace(face)) parts.push('Bound');
  if (isPlayerDie && isFaceSealed(face.number)) parts.push('Sealed');
  return parts.join(' · ');
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

  // The player's own die reads as one horizontal row of squares, face 1 at
  // the left; every other container keeps the vertical row list.
  const isHorizontal = (containerId === 'playerDieList' || containerId === 'dieActionDieList' || containerId === 'eventDieList');

  const tracksRolledFace = (containerId === 'playerDieList' || containerId === 'dieActionDieList' || containerId === 'enemyDieList' || containerId === 'eventDieList');
  const isEnemyContainer = containerId === 'enemyDieList';
  const trackedRolledFaceNumber = isEnemyContainer ? gameState.turn.enemyRolledFaceNumber : gameState.turn.rolledFaceNumber;
  const trackedRollOutcome = isEnemyContainer ? gameState.turn.enemyRollOutcome : gameState.turn.rollOutcome;
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
  const trackedHoppedFaces = tracksHoppedFaces ? gameState.turn.hoppedFaces : [];
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
        // name is still available via the native title tooltip.
        const fullName = modDisplayName(m.id);
        nameSpan.textContent = fullName.slice(0, TWO_MOD_NAME_CHARS);
        nameSpan.title = fullName;
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
    // Everything it does not have room for is in the square's title.
    if (isHorizontal) {
      const caption = document.createElement('div');
      caption.className = 'die-face-caption';
      if (isPlayerDie && isFaceSealed(face.number)) {
        caption.textContent = 'SEALED';
      } else if (isPlayerDie && gameState.player.sealNextRound.indexOf(face.number) !== -1) {
        caption.textContent = 'SEALED NEXT ROUND';
      } else if (face.modId === 'NAT_ONE' || face.modId === 'ENEMY_NAT_ONE') {
        caption.textContent = 'NAT 1';
      } else if (face.modId === 'NAT_TWENTY' || face.modId === 'ENEMY_NAT_TWENTY') {
        caption.textContent = 'NAT 20';
      } else {
        caption.textContent = face.weight;
      }
      row.appendChild(caption);
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
      ? 'Sealed: counts as blank this round.'
      : faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount);
    // During the Strengthen picker, an eligible row's hover also shows
    // what the face becomes.
    let becomesText = null;
    if (pickConfig && pickConfig.showBecomes && pickEligible) {
      becomesText = faceHoverText(Object.assign({}, face, { weight: face.weight + 1 }), buffPoisonStacks, enemyName, wrathAmount);
    }
    if (hoverText || becomesText) {
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      if (becomesText) {
        const currentLine = document.createElement('div');
        currentLine.textContent = hoverText;
        tip.appendChild(currentLine);
        const becomesLine = document.createElement('div');
        becomesLine.textContent = becomesText;
        tip.appendChild(becomesLine);
      } else {
        tip.textContent = hoverText;
      }
      row.appendChild(tip);
    }

    // Native title, in addition to the .hover-tip above — every face-btn
    // carries one, so a blank still reads on hover even with no mod. This
    // is where the name, weight, trigger count and Bound badge stay
    // readable once the horizontal row stops printing them beside the square.
    btn.title = faceTitleText(face, showTriggerBadges, isPlayerDie) +
      ' — ' + (hoverText || ('Blank: rolls for ' + GAME_CONFIG.BLANK_ROLL_BLOCK + ' block.'));

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
    setValue('NAT 20', 'Nat 20: every loaded buff triggers this round.');
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
  document.getElementById('enemyHpValue').textContent = Math.max(0, gameState.enemy.hp) + ' / ' + gameState.enemy.maxHp;
  const nameEl = document.getElementById('enemyNameValue');
  if (nameEl) { nameEl.textContent = gameState.enemy.name || '—'; }
  // Pontifex's own panel line: reads the player's heaviest loaded face.
  const readLine = document.getElementById('enemyReadLine');
  if (readLine) {
    if (gameState.enemy.name === 'Pontifex') {
      readLine.style.display = '';
      const readValueEl = document.getElementById('enemyReadValue');
      readValueEl.textContent = 'Reads the heaviest face: Wrath +' + gameState.enemy.wrathPerTrigger + ' when the player rolls it.';
      readValueEl.title = 'When the player rolls their heaviest loaded face, Wrath triggers.';
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
  const wrathLine = document.getElementById('enemyWrathLine');
  if (wrathLine) {
    if (gameState.enemy.wrath > 0) {
      wrathLine.style.display = '';
      document.getElementById('enemyWrathValue').textContent = '+' + gameState.enemy.wrath;
      document.getElementById('enemyWrathValue').title = 'Wrath: each Attack deals this much more.';
    } else {
      wrathLine.style.display = 'none';
    }
  }
  const drainLine = document.getElementById('playerDrainLine');
  if (drainLine) {
    if (gameState.player.drainNextRound > 0) {
      drainLine.style.display = '';
      document.getElementById('playerDrainValue').textContent = 'DRAIN −' + gameState.player.drainNextRound + ' SOUL';
      document.getElementById('playerDrainValue').title = 'Drain: ' + gameState.player.drainNextRound + ' less soul at the start of next round.';
    } else {
      drainLine.style.display = 'none';
    }
  }

  document.getElementById('playerBlockValue').textContent = gameState.player.block;
  document.getElementById('playerHpValue').textContent = gameState.player.hp + ' / ' + gameState.player.maxHp;
  document.getElementById('playerSoulValue').textContent = gameState.player.soul + ' / ' + gameState.player.maxSoul;
  const playerDebuffs = [];
  if (gameState.player.poisonStacks) playerDebuffs.push('poison x' + gameState.player.poisonStacks);
  if (gameState.player.penitenceActive) playerDebuffs.push('penitence');
  const playerDebuffsEl = document.getElementById('playerDebuffsValue');
  playerDebuffsEl.textContent = playerDebuffs.length ? playerDebuffs.join(', ') : '—';
  playerDebuffsEl.title = 'Poison: at the start of each round, every ' + GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK + ' block still held removes 1 stack of poison. Then poison deals 1 damage per stack, ignoring block, and loses 1 stack.';
  renderStatusRows(playerDebuffsEl.title);
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
// sentence its own stat line already uses as a title.
function renderStatusRows(poisonTitle) {
  function icon(row, text, className, title) {
    const el = document.createElement('div');
    el.className = 'status-icon ' + className;
    el.textContent = text;
    el.title = title;
    row.appendChild(el);
  }

  const playerRow = document.getElementById('playerStatusRow');
  if (playerRow) {
    playerRow.innerHTML = '';
    if (gameState.player.poisonStacks > 0) {
      icon(playerRow, 'P' + gameState.player.poisonStacks, 'status-poison', poisonTitle);
    }
    if (gameState.player.penitenceActive) {
      icon(playerRow, 'PN', 'status-penitence', NAT_DESCRIPTION.NAT_ONE + ' (' + gameState.player.penitenceTurnsRemaining + ' turn(s) left)');
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
      icon(enemyRow, 'P' + gameState.enemy.poisonStacks, 'status-poison', 'Poison: deals 1 damage per stack at the start of its round, then loses 1 stack.');
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

function renderArtBoxes() {
  setArtImage('playerArtImg', 'playerArtLabel', 'art/ordained.png', 'ORDAINED ART');
  const enemyName = gameState.enemy.name;
  setArtImage('enemyArtImg', 'enemyArtLabel', 'art/' + (enemyName || '').toLowerCase() + '.png',
    (enemyName ? enemyName.toUpperCase() + ' ' : '') + 'ART');
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

function renderTopBarTokens() {
  const goldEl = document.getElementById('goldValue');
  if (!goldEl) return;
  goldEl.textContent = 'GOLD ' + (gameState.run.gold === undefined ? '—' : gameState.run.gold);

  const artifactRow = document.getElementById('artifactRow');
  if (!artifactRow) return;
  const slots = artifactRow.querySelectorAll('.artifact-slot');
  slots.forEach(function(slot, index) {
    const artifactId = gameState.run.artifacts[index];
    if (artifactId && gameState.config.artifacts[artifactId]) {
      const artifact = gameState.config.artifacts[artifactId];
      slot.textContent = artifact.name;
      slot.title = artifact.name + ' — ' + artifact.text;
    } else {
      slot.textContent = '';
      slot.title = '';
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

function renderDieIcons() {
  const playerEl = document.getElementById('playerDieIcon');
  if (playerEl) {
    const rolled = gameState.turn.rolledFaceNumber;
    playerEl.innerHTML = '<div class="die-icon-wrap">' + dieIconSvg(GAME_CONFIG.DIE_SIZE.PLAYER, 'var(--text)') +
      '<div class="die-icon-number" style="color:' + playerDieIconColour() + '">' +
      (rolled === null ? '' : '<span class="die-icon-number-text">' + rolled + '</span>') + '</div></div>';
    playerEl.title = 'Your die: d' + GAME_CONFIG.DIE_SIZE.PLAYER +
      (rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.');
  }

  const enemyEl = document.getElementById('enemyDieIcon');
  if (!enemyEl) return;
  // D-29 — a normal with no die shows an empty outline, never a fake die.
  if (!gameState.enemy.hasDie || !gameState.enemy.die.faces.length) {
    enemyEl.innerHTML = '<div class="die-icon-empty"></div>';
    enemyEl.title = 'This enemy carries no die.';
    return;
  }
  const size = gameState.enemy.die.faces.length;
  const rolled = gameState.turn.enemyRolledFaceNumber;
  const outcome = gameState.turn.enemyRollOutcome;
  let word = '';
  let wordColour = 'var(--enemy-mod)';
  if (outcome === 'nat_twenty') { word = 'NAT 20'; wordColour = 'var(--nat)'; }
  else if (outcome === 'nat_one') { word = 'NAT 1'; wordColour = 'var(--nat)'; }
  else if (rolled !== null) {
    const face = gameState.enemy.die.faces[rolled - 1];
    if (face && face.modId !== null) word = modDisplayName(face.modId);
  }
  enemyEl.innerHTML = '<div class="die-icon-wrap">' + dieIconSvg(size, 'var(--enemy-mod)') +
    '<div class="die-icon-number" style="color:var(--enemy-mod)">' + (rolled === null ? '' : '<span class="die-icon-number-text">' + rolled + '</span>') + '</div></div>' +
    '<div class="die-icon-side"><div style="color:' + wordColour + '">' + word + '</div>' +
    '<div style="color:var(--muted)">d' + size + '</div></div>';
  enemyEl.title = 'Enemy die: d' + size + (rolled === null ? ', not yet rolled this round.' : ', rolled ' + rolled + ' this round.');
}

const CARD_EFFECT_TEXT = {
  strike: '5 damage',
  ward: '5 block',
  rite: '5 damage 6 block',
  rebuke: '4 damage',
  censure: '14 damage',
  judgement: '20 damage',
  vestment: '13 block',
  litany: '7 damage 7 block',
  scripture: 'draw 2',
  communion: '2 soul',
  censer: '4 poison',
  purge: '6 damage, 10 if enemy poisoned',
  interdict: "5 block. 10 if the enemy's intent deals 12 or more damage this round.",
  bulwark: '6 block. 16 block if the enemy is winding up or releasing this round.',
  reckoning: '3 damage + 2 per poison stack',
  retribution: 'damage = block, capped at 12',
  covenant: '2 damage + 3 per face weight',
  rapture: '12 damage, free on a mod turn',
  orison: '5 damage, 9 on a blank roll',
  tenet: '6 damage, +1 for each time the rolled face has triggered this run',
  gradual: '3 damage, +1 per weight of your heaviest face',
  vacancy: '1 damage per blank face, max 16',
  lauds: '4 damage, +3 per Growth mod on your die, max 13',
  chastise: '7 damage',
  cloister: '7 block',
  psalm: 'draw 1',
  reliquary: '6 block. If you already had 10+ block, also 5 damage',
  vindication: 'Deal damage equal to twice your block, max 24',
  myrrh: '6 block, +1 per stack of poison on the enemy, max 12',
  exequy: "Deal damage equal to the enemy's stacks of poison, max 12",
  hosanna: "6 damage. 12 if the enemy's intent this round is not an Attack.",
  gloria: '30 damage',
  oblation: 'Spend all your soul. 7 damage per soul spent, max 42',
  tabernacle: '3 block, +3 per weight of the rolled face, max 12',
  jubilee: '4 damage, +2 per weight added to the die this run, max 24',
  // Fallback only — getCardEffectText() below overrides this with the
  // live threnodyFace number; no real caller reads this map directly.
  threnody: 'Face triggers. The face is set once per run. A blank face gives 2 block.',
  reverberation: 'The face you rolled triggers again. On a 1 or 20: 6 block instead',
  kyrie: '5 damage, 10 if the rolled face has Bound',
  novena: 'every Bound face triggers',
  canticle: '6 block. The face you rolled gains Bound for this fight',
  kneel: 'applied 3 stacks of awe',
  compline: '4 block, applied 2 stacks of awe',
  tremendum: '4 damage + 2 per stack of awe on the enemy, max 12',
  mysterium: '3 damage per stack of awe on the enemy, max 12, stacks of awe unchanged',
  venom: '2 stacks of poison. 4 if the enemy already has poison.',
  ballast: "Damage 3 times your heaviest face's weight, cap 12.",
  refrain: 'Trigger the face you rolled this round again.',
  second_sight: 'Roll the die again now. The new face triggers as a roll.',
  cadence: 'Damage 2 times the round number, cap 12.',
  watchword: '5 block. 12 if a Bound face triggered this round.',
  blight_weight: "Stacks of poison equal to twice the rolled face's weight, cap 8."
};

// Every site that draws a card's effect text calls this instead of
// reading CARD_EFFECT_TEXT[cardId] directly, so Threnody's real,
// run-fixed face number shows everywhere.
function getCardEffectText(cardId) {
  if (cardId === 'threnody' && gameState.run.threnodyFace !== null) {
    return 'Face ' + gameState.run.threnodyFace + ' triggers. The face is set once per run. A blank face gives 2 block.';
  }
  return CARD_EFFECT_TEXT[cardId] || '';
}

// Hover text for mods and Nat faces, derived from each mod's own log()
// lines. No wording invented beyond what each mod's code already says.
const MOD_DESCRIPTION = {
  consecrate: '+2 soul this turn, 3 block per card played this turn',
  smite: '16 damage',
  penance: '8 damage, 8 block',
  offering: '+2 soul this turn, draw 1',
  blight: 'applied 6 poison',
  virulence: 'applied 3 poison, doubled',
  sanctuary: '16 block',
  vigil: 'block scales with cards held at end of turn (5 block per card)',
  zeal: '10 damage, permanently gains +4 damage per trigger. Growth',
  fervour: 'attacks double damage this turn',
  ordain: '10 damage, +1 weight to the triggering face. Growth',
  anthem: '6 damage, +4 per point of weight on its own face',
  elevation: '10 damage, +1 weight to the face above (if loaded and not face 20). Growth',
  largesse: '+2 soul, 4 block',
  tithe: 'End of round: 5 damage per soul you have left, max 20',
  congregation: '8 damage. 16 if another mod on your die has Growth. Growth',
  cope: '8 block, permanently gains +2 block per trigger. Growth',
  anathema: 'End of round: deal damage equal to your block, max 16',
  thurible: '8 damage, applied 3 stacks of poison',
  magnificat: 'Triggers your heaviest other face',
  unison: '6 damage. Bound',
  accord: '10 block. Bound',
  kinship: 'applied 4 stacks of poison. Bound',
  concord: '+1 soul, 3 block. Bound',
  herald: '6 damage. One other random loaded face gains Bound for this fight. Bound',
  dread: 'applied 4 stacks of awe',
  genuflect: '6 block, applied 3 stacks of awe'
};

const NAT_DESCRIPTION = {
  NAT_TWENTY: 'fires every loaded face on the die this turn, ascending face order',
  NAT_ONE: 'Penitence: lose 1 soul at the start of every turn for the next 3 turns'
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
    const cost = getCardCost(card);
    const affordable = gameState.player.soul >= cost;

    const btn = document.createElement('button');
    btn.className = 'hand-card-el' + (affordable ? '' : ' unaffordable');
    btn.disabled = !active;
    btn.title = card.name + ' — ' + getCardEffectText(cardId);

    const costEl = document.createElement('span');
    costEl.className = 'hand-card-cost';
    costEl.textContent = cost;

    // Placeholder for card art that does not exist yet — /art/ is empty.
    const artEl = document.createElement('span');
    artEl.className = 'hand-card-art';
    attachCardArtImg(artEl, cardId);

    const nameEl = document.createElement('span');
    nameEl.className = 'hand-card-name';
    nameEl.textContent = card.name;

    const effectEl = document.createElement('span');
    effectEl.className = 'hand-card-effect';
    effectEl.textContent = getCardEffectText(cardId);

    btn.appendChild(costEl);
    btn.appendChild(artEl);
    btn.appendChild(nameEl);
    btn.appendChild(effectEl);

    btn.addEventListener('click', function() {
      log('[CLICK] ' + card.name);
      playCard(index);
    });
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

let dieActionStep = null; // null | 'choose' | 'load_pick_mod' | 'load_pick_face' | 'strengthen_pick_face' | 'purify_pick_face'
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

// Which [common, uncommon, rare] GAME_CONFIG.TIER_SPLIT table a
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
  const face = newFaces[faceNumber - 1];
  // A blank face fills modId; an already-loaded face fills modId2. Both
  // slots full is a defensive refusal — the picker's own eligibility
  // should never offer such a face. Cap two, never three.
  if (face.modId === null) {
    newFaces[faceNumber - 1] = Object.assign({}, face, { modId: dieActionChosenModId });
    updateDie({ faces: newFaces });
    log('[DIE ACTION] loaded ' + modName + ' onto face ' + faceNumber);
  } else if (!face.modId2) {
    newFaces[faceNumber - 1] = Object.assign({}, face, { modId2: dieActionChosenModId });
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
    for (let i = 1; i < GAME_CONFIG.ARTIFACTS.LEADEN_FACE_STRENGTHEN; i++) {
      newWeight = strengthenFace(faceNumber);
    }
    log('[ARTIFACT] Leaden Face: Strengthen added ' + GAME_CONFIG.ARTIFACTS.LEADEN_FACE_STRENGTHEN + ' weight');
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
  const face = gameState.die.faces[faceNumber - 1];
  const removedIds = [face.modId];
  if (face.modId2) removedIds.push(face.modId2);
  const removedNames = removedIds.map(function(id) { return gameState.config.mods[id].name; });

  const newFaces = gameState.die.faces.slice();
  newFaces[faceNumber - 1] = { number: face.number, modId: null, modId2: null, weight: face.weight };
  updateDie({ faces: newFaces });

  log('[DIE] purify face ' + faceNumber + ': ' + removedNames.join(', ') + ' removed');
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'purify', faceNumber: faceNumber, removed: removedIds.slice() }]) });
  playAudioEvent('die_action_strengthen');
  appendTranscript('PURIFY ' + faceNumber + ' > ' + removedNames.join(','));
  closeDieActionScreen();
}

function renderDieActionPanel() {
  const panel = document.getElementById('dieActionPanel');
  if (!panel) return;

  if (dieActionStep === null) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = 'flex';
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'die-action-title';

  const row = document.createElement('div');
  row.className = 'die-action-row';

  // Set only for load_pick_face/strengthen_pick_face — passed to
  // renderDieList() below so the die rows themselves become the picker.
  let pickConfig = null;

  if (dieActionStep === 'choose') {
    title.textContent = 'Fight won — choose a die action';

    // Load shows whenever a blank face exists among faces 2-19 AND the
    // pool hasn't run dry (D-54) — a real 3-mod offer must be buildable.
    const blankFaceExists = gameState.die.faces.slice(1, 19).some(function(f) { return f.modId === null; });
    if (blankFaceExists && eligibleLoadModIds().length >= 3) {
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', function() { log('[CLICK] Load'); dieActionChooseLoad(); });
      row.appendChild(loadBtn);
    }

    const strengthenBtn = document.createElement('button');
    strengthenBtn.textContent = 'Strengthen';
    strengthenBtn.addEventListener('click', function() { log('[CLICK] Strengthen'); dieActionChooseStrengthen(); });

    row.appendChild(strengthenBtn);

    // Purify offers only when a purifiable face exists (D-54-style hide).
    if (purifiableFaceExists()) {
      const purifyBtn = document.createElement('button');
      purifyBtn.textContent = 'PURIFY';
      purifyBtn.title = 'Take every mod off one face. The face stays as heavy as it was.';
      purifyBtn.addEventListener('click', function() { log('[CLICK] Purify'); dieActionChoosePurify(); });
      row.appendChild(purifyBtn);
    }

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', function() { log('[CLICK] Skip'); dieActionChooseSkip(); });

    row.appendChild(skipBtn);

  } else if (dieActionStep === 'load_pick_mod') {
    title.textContent = 'Choose a mod to load';

    if (dieActionMods.length === 0) {
      const none = document.createElement('div');
      none.className = 'die-action-empty';
      none.textContent = 'No eligible mods to offer.';
      row.appendChild(none);
    }

    dieActionMods.forEach(function(modId) {
      const mod = gameState.config.mods[modId];
      const btn = document.createElement('button');
      btn.textContent = mod.name;
      if (MOD_DESCRIPTION[modId]) {
        const tip = document.createElement('span');
        tip.className = 'hover-tip';
        tip.textContent = MOD_DESCRIPTION[modId];
        btn.appendChild(tip);
      }
      btn.addEventListener('click', function() { log('[CLICK] ' + mod.name); dieActionPickMod(modId); });
      row.appendChild(btn);
    });

  } else if (dieActionStep === 'load_pick_face') {
    // Any loaded, non-Nat face that isn't already holding two mods is a
    // valid target — blank faces and already-loaded faces are both
    // eligible together, always.
    title.textContent = 'Choose a face for ' + gameState.config.mods[dieActionChosenModId].name;
    pickConfig = {
      isEligible: function(f) {
        return f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2;
      },
      onPick: dieActionPickLoadFace,
      showBecomes: false
    };

  } else if (dieActionStep === 'strengthen_pick_face') {
    title.textContent = 'Choose a face to strengthen';
    pickConfig = {
      isEligible: function(f) {
        if (f.number === 1) return false;
        if (f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return true;
        return f.modId !== null;
      },
      onPick: dieActionPickStrengthenFace,
      showBecomes: true
    };

  } else if (dieActionStep === 'purify_pick_face') {
    title.textContent = 'Choose a face to purify';
    pickConfig = {
      isEligible: function(f) {
        if (f.number === 1 || f.number === 10 || f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return false;
        return f.modId !== null;
      },
      onPick: dieActionPickPurifyFace,
      showBecomes: false
    };
  }

  panel.appendChild(title);

  // The player sees one die at every step of this panel, the opening
  // Load/Strengthen/Skip menu included.
  const dieContainer = document.createElement('div');
  dieContainer.className = 'die-col player-die die-col-h';
  dieContainer.id = 'dieActionDieList';

  const dieWrap = document.createElement('div');
  dieWrap.className = 'die-action-die-preview';
  dieWrap.appendChild(dieContainer);
  panel.appendChild(dieWrap);

  // Must run after dieContainer is attached to the live document
  // (renderDieList looks it up by id).
  renderDieList('dieActionDieList', gameState.die.faces, null, pickConfig);

  panel.appendChild(row);
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

  panel.style.display = 'flex';
  panel.innerHTML = '';

  // Reuses the die action panel's own CSS classes verbatim (same place and
  // style, per the prompt), on this panel's own separate DOM element —
  // #dieActionPanel and its rendering/state are never touched.
  const title = document.createElement('div');
  title.className = 'die-action-title';
  title.textContent = 'Fight won — choose a card';

  const row = document.createElement('div');
  row.className = 'die-action-row';

  cardRewardOptions.forEach(function(cardId) {
    const card = gameState.config.cardPool[cardId];
    const btn = document.createElement('button');
    btn.textContent = card.name + ' (' + card.soulCost + ')';
    const artEl = document.createElement('span');
    artEl.className = 'card-reward-art';
    attachCardArtImg(artEl, cardId);
    btn.appendChild(artEl);
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    tip.textContent = getCardEffectText(cardId);
    btn.appendChild(tip);
    btn.addEventListener('click', function() { log('[CLICK] ' + card.name); cardRewardPickCard(cardId); });
    row.appendChild(btn);
  });

  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('click', function() { log('[CLICK] Skip'); cardRewardSkip(); });
  row.appendChild(skipBtn);

  panel.appendChild(title);
  panel.appendChild(row);
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

  panel.style.display = 'flex';
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'die-action-title';
  title.textContent = 'Choose an artifact';

  const row = document.createElement('div');
  row.className = 'die-action-row';

  artifactRewardOptions.forEach(function(artifactId) {
    const artifact = gameState.config.artifacts[artifactId];
    const btn = document.createElement('button');
    btn.textContent = artifact.name;
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    tip.textContent = artifact.text;
    btn.appendChild(tip);
    btn.addEventListener('click', function() { log('[CLICK] ' + artifact.name); artifactRewardPick(artifactId); });
    row.appendChild(btn);
  });

  const skipBtn = document.createElement('button');
  skipBtn.textContent = 'Skip';
  skipBtn.addEventListener('click', function() { log('[CLICK] Skip'); artifactRewardSkip(); });
  row.appendChild(skipBtn);

  panel.appendChild(title);
  panel.appendChild(row);
}

// ---------- RITE SCREEN ----------
// A rite slot offers a choice of heal, take a die action, or remove a
// card, then returns to the map.

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
  appendTranscript('RITE heal ' + healedAmount + ' | you ' + after + '/' + gameState.player.maxHp);
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

  panel.style.display = 'flex';
  panel.innerHTML = '';

  // Same CSS classes the die action / card reward panels already reuse.
  const title = document.createElement('div');
  title.className = 'die-action-title';

  const row = document.createElement('div');
  row.className = 'die-action-row';

  if (riteStep === 'remove_pick_card') {
    title.textContent = 'Choose a card to remove';

    gameState.player.ownedCards.forEach(function(cardId, index) {
      const card = getCard(cardId);
      const btn = document.createElement('button');
      btn.textContent = card.name + ' (' + getCardCost(card) + ')';

      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = getCardEffectText(cardId);
      btn.appendChild(tip);

      btn.addEventListener('click', function() { log('[CLICK] ' + card.name); riteRemoveCard(index); });
      row.appendChild(btn);
    });
  } else {
    title.textContent = 'Rite — choose one';

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

  panel.appendChild(title);
  panel.appendChild(row);
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
    log('[EVENT] font: rolled ' + face.number + ', outcome nat twenty, +' + GAME_CONFIG.EVENT.NAT_TWENTY_GOLD + ' gold, Load offered');
    appendTranscript('EVENT font: rolled ' + face.number + ' NAT 20, +' + GAME_CONFIG.EVENT.NAT_TWENTY_GOLD + ' gold');
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
    log('[EVENT] font: rolled ' + face.number + ', outcome nat one, hp ' + before + ' to ' + newHp);
    appendTranscript('EVENT font: rolled ' + face.number + ' NAT 1, hp ' + before + ' to ' + newHp);
  } else if (face.modId !== null) {
    const newWeight = strengthenFace(face.number);
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'mod' });
    eventOutcomeText = 'The rolled face comes up heavier.';
    log('[EVENT] font: rolled ' + face.number + ', outcome loaded face, weight now ' + newWeight);
    appendTranscript('EVENT font: rolled ' + face.number + ' loaded, weight now ' + newWeight);
  } else {
    updateRun({ gold: gameState.run.gold + GAME_CONFIG.EVENT.BLANK_GOLD });
    updateTurn({ rolledFaceNumber: face.number, rollOutcome: 'blank' });
    eventOutcomeText = 'Coins lie on the bottom.';
    log('[EVENT] font: rolled ' + face.number + ', outcome blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold');
    appendTranscript('EVENT font: rolled ' + face.number + ' blank, +' + GAME_CONFIG.EVENT.BLANK_GOLD + ' gold');
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

  panel.style.display = 'flex';
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'die-action-title';
  title.textContent = 'A font of black water stands where the road bends. Nothing moves in it. The die goes in.';
  panel.appendChild(title);

  const row = document.createElement('div');
  row.className = 'die-action-row';

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

  panel.appendChild(row);

  const dieContainer = document.createElement('div');
  dieContainer.className = 'die-col player-die die-col-h';
  dieContainer.id = 'eventDieList';

  const dieWrap = document.createElement('div');
  dieWrap.className = 'die-action-die-preview';
  dieWrap.appendChild(dieContainer);
  panel.appendChild(dieWrap);

  // Must run after dieContainer is attached to the live document
  // (renderDieList looks it up by id).
  renderDieList('eventDieList', gameState.die.faces, null, null);
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

function openShopScreen() {
  shopRemovingCard = false;
  updateRun({ shop: buildShopStock() });
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

  panel.style.display = 'flex';
  panel.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'die-action-title';

  const row = document.createElement('div');
  row.className = 'die-action-row';

  const shop = gameState.run.shop;

  if (shopRemovingCard) {
    title.textContent = 'Choose a card to remove';
    gameState.player.ownedCards.forEach(function(cardId, index) {
      const card = getCard(cardId);
      const btn = document.createElement('button');
      btn.textContent = card.name + ' (' + getCardCost(card) + ')';
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = getCardEffectText(cardId);
      btn.appendChild(tip);
      btn.addEventListener('click', function() { log('[CLICK] ' + card.name); shopRemoveCard(index); });
      row.appendChild(btn);
    });
  } else {
    title.textContent = 'SHOP';

    shop.cards.forEach(function(cardId) {
      if (shop.boughtCards.indexOf(cardId) !== -1) { return; }
      const card = gameState.config.cardPool[cardId];
      const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.CARD_PRICE[card.tier]);
      const btn = document.createElement('button');
      btn.textContent = card.name + ' — ' + price + 'g';
      btn.disabled = gameState.run.gold < price;
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = getCardEffectText(cardId);
      btn.appendChild(tip);
      btn.addEventListener('click', function() { log('[CLICK] ' + card.name); shopBuyCard(cardId); });
      row.appendChild(btn);
    });

    if (shop.artifact && !shop.artifactBought) {
      const artifact = gameState.config.artifacts[shop.artifact];
      const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.ARTIFACT_PRICE);
      const btn = document.createElement('button');
      btn.textContent = artifact.name + ' — ' + price + 'g';
      btn.disabled = gameState.run.gold < price;
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = artifact.text;
      btn.appendChild(tip);
      btn.addEventListener('click', function() { log('[CLICK] ' + artifact.name); shopBuyArtifact(); });
      row.appendChild(btn);
    }

    if (!shop.strengthenBought) {
      const price = shopPriceWithArtifacts(GAME_CONFIG.SHOP.STRENGTHEN_PRICE);
      const btn = document.createElement('button');
      btn.textContent = 'Strengthen — ' + price + 'g';
      btn.disabled = gameState.run.gold < price;
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = 'Add 1 weight to a face of your choice.';
      btn.appendChild(tip);
      btn.addEventListener('click', function() { log('[CLICK] Strengthen'); shopBuyStrengthen(); });
      row.appendChild(btn);
    }

    if (!shop.removalBought) {
      const price = shopRemovalPrice();
      const btn = document.createElement('button');
      btn.textContent = 'Remove a card — ' + price + 'g';
      btn.disabled = gameState.run.gold < price;
      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = 'Remove a card of your choice from your deck.';
      btn.appendChild(tip);
      btn.addEventListener('click', function() { log('[CLICK] Remove a card'); shopBuyRemoval(); });
      row.appendChild(btn);
    }

    const leaveBtn = document.createElement('button');
    leaveBtn.textContent = 'LEAVE';
    leaveBtn.addEventListener('click', function() { log('[CLICK] Leave'); closeShopScreen(); });
    row.appendChild(leaveBtn);
  }

  panel.appendChild(title);
  panel.appendChild(row);
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
function mapNodeStateClass(slot, isCurrent, isChoice) {
  if (isCurrent) { return 'map-node-current'; }
  if (isChoice) { return 'map-node-choice'; }
  if (slot.completed) { return 'map-node-completed'; }
  return 'map-node-inert';
}

// Wires dev-jump onto a node that isn't the real current/choice click
// target. Does nothing once the run is won or lost.
function attachDevJumpIfEligible(node, laneName, index) {
  // Lives outside #devChrome, so a closed dev chrome disables these nodes directly.
  if (!devChromeOpen || gameState.run.outcome !== 'active') {
    node.disabled = true;
    return;
  }
  node.disabled = false;
  node.classList.add('map-node-dev-jump');
  const tip = document.createElement('span');
  tip.className = 'hover-tip';
  tip.textContent = 'Dev: jump here — skips earlier slots, grants no rewards';
  node.appendChild(tip);
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

function renderMapScreen() {
  const container = document.getElementById('mapScreen');
  if (!container) return;
  // startNewRun() calls several state helpers (each of which triggers its
  // own refreshInspector()) before it finally sets gameState.run.act itself
  // — guard against rendering mid-setup, same early-return shape
  // renderDieList() already uses for its own not-ready-yet case.
  if (!gameState.run.act) { container.innerHTML = ''; return; }
  container.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'ACT ' + gameState.run.actNumber + ' MAP';
  container.appendChild(title);

  const composition = document.createElement('div');
  composition.className = 'map-composition';

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
  if (openingIsCurrent) {
    openingNode.addEventListener('click', function() { enterSlot('opening', null); });
  } else {
    attachDevJumpIfEligible(openingNode, 'opening', null);
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

      if (isCurrent || isForkChoice) {
        node.addEventListener('click', function() {
          // A single click at the divergence both picks the lane and
          // enters that lane's first slot — there is no separate
          // "confirm the lane" step, since the two lanes' first slots are
          // the only choice a fork click could ever mean.
          if (isForkChoice) { chooseLane(laneName); enterSlot(laneName, index); }
          else { enterSlot(laneName, index); }
        });
      } else {
        attachDevJumpIfEligible(node, laneName, index);
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
  if (bossIsCurrent) {
    bossBtn.addEventListener('click', function() { enterSlot('boss', null); });
  } else {
    attachDevJumpIfEligible(bossBtn, 'boss', null);
  }
  composition.appendChild(bossBtn);

  container.appendChild(composition);

  // Die preview row — the player's own current die alongside the boss
  // die, so the map reads as a comparison. Both halves reuse renderDieList().
  const previewRow = document.createElement('div');
  previewRow.className = 'map-die-preview-row';

  const playerPreview = document.createElement('div');
  playerPreview.id = 'mapPlayerPreview';
  playerPreview.innerHTML =
    '<div class="panel-title">YOUR DIE</div>' +
    '<div>HP ' + gameState.player.hp + ' / ' + gameState.player.maxHp + '</div>';
  previewRow.appendChild(playerPreview);

  const playerDieContainer = document.createElement('div');
  playerDieContainer.className = 'die-col player-die';
  playerDieContainer.id = 'mapPlayerDieList';
  const playerDieTitle = document.createElement('div');
  playerDieTitle.className = 'panel-title';
  playerDieTitle.textContent = 'PLAYER DIE';
  playerDieContainer.appendChild(playerDieTitle);
  previewRow.appendChild(playerDieContainer);

  const dividerBeforeElite = document.createElement('div');
  dividerBeforeElite.className = 'map-die-preview-divider';
  previewRow.appendChild(dividerBeforeElite);

  // Reads the elite slot's own static enemy.die.faces, never
  // gameState.enemy — the live die only reflects whichever fight was most
  // recently entered, so a preview reading it would go stale.
  const eliteSlot = gameState.run.act.upper.find(function(s) { return s.label === 'Elite'; });
  const eliteEnemy = eliteSlot.enemy;
  const elitePreview = document.createElement('div');
  elitePreview.id = 'elitePreview';
  elitePreview.innerHTML =
    '<div class="panel-title">ELITE PREVIEW</div>' +
    '<div>HP ' + eliteEnemy.hp + '</div>' +
    '<div>' + eliteEnemy.name + ' — ' + formatPatternWords(eliteEnemy.pattern) + '</div>';
  previewRow.appendChild(elitePreview);

  const eliteDieContainer = document.createElement('div');
  eliteDieContainer.className = 'die-col enemy-die';
  eliteDieContainer.id = 'eliteDiePreviewList';
  const eliteDieTitle = document.createElement('div');
  eliteDieTitle.className = 'panel-title';
  eliteDieTitle.textContent = 'ELITE DIE';
  eliteDieContainer.appendChild(eliteDieTitle);
  previewRow.appendChild(eliteDieContainer);

  const dividerBeforeBoss = document.createElement('div');
  dividerBeforeBoss.className = 'map-die-preview-divider';
  previewRow.appendChild(dividerBeforeBoss);

  const bossEnemy = gameState.run.act.boss.enemy;
  const bossPreview = document.createElement('div');
  bossPreview.id = 'bossPreview';
  bossPreview.innerHTML =
    '<div class="panel-title">BOSS PREVIEW</div>' +
    '<div>HP ' + bossEnemy.hp + '</div>' +
    '<div>' + bossEnemy.name + ' — ' + formatPatternWords(bossEnemy.pattern) + '</div>';
  previewRow.appendChild(bossPreview);

  const bossDieContainer = document.createElement('div');
  bossDieContainer.className = 'die-col enemy-die';
  bossDieContainer.id = 'bossDiePreviewList';
  const bossDieTitle = document.createElement('div');
  bossDieTitle.className = 'panel-title';
  bossDieTitle.textContent = 'BOSS DIE';
  bossDieContainer.appendChild(bossDieTitle);
  previewRow.appendChild(bossDieContainer);

  container.appendChild(previewRow);

  // Must run after each container is attached to the live document
  // (renderDieList looks it up by id). No forceRollFn — all three are
  // previews, not clickable dice.
  renderDieList('mapPlayerDieList', gameState.die.faces, null);
  // Each slot's own act-scaled buffPoisonStacks, so the preview's hover
  // text names the real number too.
  renderDieList('eliteDiePreviewList', eliteEnemy.die.faces, null, null, eliteEnemy.buffPoisonStacks, eliteEnemy.name, eliteEnemy.wrathPerTrigger);
  renderDieList('bossDiePreviewList', bossEnemy.die.faces, null, null, bossEnemy.buffPoisonStacks, bossEnemy.name, bossEnemy.wrathPerTrigger);
}

// Fits the fight/map screen to the window: shrinks below the 1600x900
// design size, grows above it, capped at 2x so a very large monitor
// doesn't blow up text past readable size.
function applyScale() {
  const scale = Math.min(2, Math.max(1, 1.1 * Math.min(window.innerWidth / 1600, window.innerHeight / 900)));
  document.documentElement.style.zoom = String(scale);
}
