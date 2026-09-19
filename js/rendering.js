// ============================================================
// RENDERING.JS — BUILD 090 file split
// log(), refreshInspector() and every render* function, the three
// screen-flow state machines (die action / card reward / rite — their
// flow variables like dieActionStep/cardRewardStep/riteStep are UI-flow
// bookkeeping, not game state, per the code's own original comments), the
// map renderer, and the text lookup tables consumed only by render
// functions (CARD_EFFECT_TEXT, MOD_DESCRIPTION, NAT_DESCRIPTION,
// CARD_FX_TYPE). Depends on state.js/listener-registry.js/pipeline.js/
// cards-mods.js/run-and-map.js/phase-machine.js (all loaded first) and
// forward-references dev-tools.js's devChromeOpen (renderDieList,
// attachDevJumpIfEligible) and forcePlayerRoll/forceEnemyRoll — safe per
// state.js's header note. Also the other half of the run-and-map.js
// circularity documented there: this file's map/screen code calls back
// into enterSlot()/chooseLane()/devJumpToSlot()/advanceRun().
// ============================================================

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
  }
}

// ---------- STATE INSPECTOR ----------

function refreshInspector() {
  const contentEl = document.getElementById('inspectorContent');
  if (!contentEl) return;
  contentEl.textContent = JSON.stringify(gameState, null, 2);
  // BUILD 125 (F31, checkpoint 2): fight screen's own act number, mirroring
  // the map screen's "ACT N MAP" title (renderMapScreen()).
  const actStampEl = document.getElementById('actStamp');
  if (actStampEl) { actStampEl.textContent = 'ACT ' + gameState.run.actNumber; }
  renderRegistryInspector();
  renderStats();
  renderCardButtons();
  renderDieList('playerDieList', gameState.die.faces, forcePlayerRoll);
  // KI-24 (D-29, checkpoint 3 map): the enemy panel keeps the empty die
  // slot for a dieless enemy (opening/normal — hasDie: false) rather than
  // hiding the die column outright, on every act alike, since the two acts
  // added at BUILD 125 share this exact panel and render function. The
  // boss/elite (hasDie: true) render exactly as before.
  const enemyDieListEl = document.getElementById('enemyDieList');
  const enemyPanelEl = document.getElementById('enemyPanel');
  enemyDieListEl.style.display = '';
  enemyPanelEl.classList.remove('combat-panel-no-die');
  // BUILD 139: fight-type title/mark — gameState.enemy.id is set to the
  // entering slot's own label (beginFightFromSlot(), run-and-map.js):
  // 'Fight' for a normal fight, 'Elite', or 'Boss'. Plain text marks, no
  // new colour/image.
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
  renderDieList('enemyDieList', gameState.enemy.die.faces, forceEnemyRoll, null, gameState.enemy.buffPoisonStacks);
  renderPhaseBadge();
  renderResultBanner();
  renderDieActionPanel();
  renderCardRewardPanel();
  renderRiteScreen();
  renderMapScreen();

  // BUILD 068: which top-level screen is visible. dieActionPanel/
  // cardRewardPanel/riteScreenPanel are siblings of both and stay governed
  // by their own step variables regardless of screen, since a rite's die
  // action panel is reached from the map, not the fight screen.
  document.getElementById('fightScreen').style.display = (gameState.run.screen === 'fight') ? 'flex' : 'none';
  document.getElementById('mapScreen').style.display = (gameState.run.screen === 'map') ? 'flex' : 'none';

  document.getElementById('devNextPhaseBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active');
  document.getElementById('devBeginRollBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.turn.phase === 'START_OF_TURN');
  // BUILD 077: mirrors the click handler's own run-outcome guard so the
  // button reads disabled, not just silently no-ops, once the run is won
  // or lost — same fix BUILD 076 gave Skip to Die Action.
  document.getElementById('devRestartFightBtn').disabled = !(gameState.run.screen === 'fight' && gameState.run.status === 'active' && gameState.run.outcome === 'active');
  // BUILD 076: the other half of the BUILD 074 gap fix — mirrors the
  // click handler's own guard so the button reads disabled, not just
  // silently no-ops, once the run is won or lost.
  document.getElementById('devSkipToDieActionBtn').disabled = !(gameState.run.status === 'active' && gameState.run.outcome === 'active');
  document.getElementById('endTurnBtn').disabled = !(gameState.run.status === 'active' && gameState.turn.phase === 'CARD_PHASE' && dieActionStep === null && cardRewardStep === null && riteStep === null);
  // BUILD 069: End Turn belongs to the fight screen only — hidden
  // entirely on the map, not just disabled-but-visible.
  document.getElementById('endTurnBtn').style.display = (gameState.run.screen === 'fight') ? '' : 'none';
  // BUILD 136: New Run now works at any time, including while a die
  // action/card reward/rite panel is open — the click handler itself
  // (bootstrap.js) dismisses that panel before resetting, so there is no
  // longer a reason to gate the button on dieActionStep/cardRewardStep/
  // riteStep the way endTurnBtn above still correctly does (End Turn must
  // stay blocked mid-panel; New Run must not).
  document.getElementById('startGameBtn').disabled = false;
}

// BUILD 112 (KI-3/REG-E2): the listener registry inspector. Read-only —
// this function only reads gameState.registry.listeners and writes DOM
// text, it never registers or clears a listener. Grouped by hook (the
// object's own keys, in registration order — the registry is a plain
// object, not re-sorted here), then within each hook by clearOn
// ('permanent' first, then 'turn' — 'fight' is dead, see FIGHT RESET, and
// deliberately gets no group of its own since no real registration has
// ever used it). KI-3's own premise is that the registry already lives on
// gameState (listener-registry.js's registerListener()/clearListeners()
// read and write gameState.registry.listeners directly) — this renders
// that live object, not a separate tracked copy of it.
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
  badge.textContent = phase;
  badge.className = 'phase-badge phase-' + phase.toLowerCase();
}

function renderRollResult(faceNumber, modIdRaw) {
  const hero = document.getElementById('rollHero');
  const numEl = document.getElementById('rollResultNumber');
  const labelEl = document.getElementById('rollResultLabel');
  if (!hero || !numEl || !labelEl) return;

  const modId = (modIdRaw === 'null') ? null : modIdRaw;
  let label;
  let isNat = false;
  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') {
    label = 'NAT 1';
    isNat = true;
  } else if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') {
    label = 'NAT 20';
    isNat = true;
  } else if (modId === null) {
    label = 'BLANK';
  } else {
    label = modDisplayName(modId);
  }

  numEl.textContent = faceNumber;
  labelEl.textContent = label;
  hero.classList.remove('roll-hero-empty');
  numEl.classList.toggle('roll-hero-nat', isNat);

  hero.classList.remove('roll-pulse');
  void hero.offsetWidth;
  hero.classList.add('roll-pulse');
}

function resetRollHero() {
  const hero = document.getElementById('rollHero');
  const numEl = document.getElementById('rollResultNumber');
  const labelEl = document.getElementById('rollResultLabel');
  if (!hero || !numEl || !labelEl) return;
  hero.classList.add('roll-hero-empty');
  numEl.classList.remove('roll-hero-nat');
  numEl.textContent = '—';
  labelEl.textContent = 'AWAITING ROLL';
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

// BUILD 137: how many letters of each mod's name a two-mod face's row shows,
// before the full name (via title, see renderDieList()). 6 by default —
// measured (Playwright canvas measureText against the row's real computed
// font, worst-case pairing Congregation+Sanctuary) to fit both names plus
// their inline trigger badges inside #dieActionDieList's own tighter width
// with room to spare; drop to 5 only if a future name addition stops
// fitting at the game's default 1600×1080 window.
const TWO_MOD_NAME_CHARS = 6;

function modDisplayName(modId) {
  if (modId === 'NAT_ONE' || modId === 'ENEMY_NAT_ONE') return 'NAT 1';
  if (modId === 'NAT_TWENTY' || modId === 'ENEMY_NAT_TWENTY') return 'NAT 20';
  if (modId === 'enemy_buff_poison') return 'POISON';
  const mod = gameState.config.mods[modId];
  return mod ? mod.name : modId;
}

// BUILD 071: resolves a face to its hover description, or null if none
// exists — never invents one. Covers loaded mod faces and the player's
// Nat faces (MOD_DESCRIPTION / NAT_DESCRIPTION above); blank faces return
// null on purpose. Appends the face's own ×N when its weight is above 1,
// the same notation the row itself already shows.
// BUILD 139 (enemy readability): the enemy's own poison/Nat faces
// (enemy_buff_poison/ENEMY_NAT_TWENTY/ENEMY_NAT_ONE — real behaviour since
// BUILD 097/098, not stubs) now resolve too, via buffPoisonStacks — that
// act's own scaled poison amount (gameState.enemy.buffPoisonStacks in a
// live fight, or the map preview's own slot.enemy.buffPoisonStacks),
// passed in by renderDieList() rather than read here, so this function
// still never reaches into gameState/act numbers itself.
function faceHoverText(face, buffPoisonStacks) {
  let text = null;
  if (face.modId === 'NAT_TWENTY' || face.modId === 'NAT_ONE') {
    text = NAT_DESCRIPTION[face.modId] || null;
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    text = 'fires every loaded poison face this turn, ascending face order, each applying ' + buffPoisonStacks + ' stacks of poison to you';
  } else if (face.modId === 'ENEMY_NAT_ONE') {
    text = 'cancels the enemy’s attack this turn (once per fight), applies ' + GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON + ' stacks of poison to itself';
  } else if (face.modId === 'enemy_buff_poison') {
    text = 'applies ' + buffPoisonStacks + ' stacks of poison to you';
  } else if (face.modId && MOD_DESCRIPTION[face.modId]) {
    text = MOD_DESCRIPTION[face.modId];
  }
  // BUILD 115: a second mod (never possible on a Nat face — modId2 is only
  // ever written onto an already-loaded, non-Nat face) appends its own
  // description, same stacked-in-one-row idea the die list display uses.
  if (face.modId2 && MOD_DESCRIPTION[face.modId2]) {
    text = (text ? text + ' + ' : '') + MOD_DESCRIPTION[face.modId2];
  }
  if (!text) return null;
  if (face.weight > 1) { text += ' (×' + face.weight + ')'; }
  return text;
}

// BUILD 093: per-container "committed" roll signature — lets a re-render
// triggered by something other than an actual new roll (loading a mod
// mid-turn via the dev tools, e.g. — any updateDie() call re-renders every
// die list) redraw the rolled row without restarting its flash/fade
// animation. Diagnosis confirmed against the code before fixing: every
// render rebuilds every row from scratch (innerHTML = '' + createElement),
// so a freshly created element carrying an animated class always plays
// that animation from 0%, regardless of whether the underlying roll
// actually changed. Same "compare to last render" idiom lastEnemyHp/
// lastPlayerHp already use below for their own pop-animation gating — not
// game state, purely animation-timing bookkeeping — keyed per container id
// (rather than one shared value) because playerDieList and dieActionDieList
// can both render the same held roll in the same refreshInspector() pass
// (a fight won mid-turn carries rolledFaceNumber into the post-win Load/
// Strengthen picker — see BUILD 090's own coexistence note above), and
// must not interfere with each other's flash timing.
//
// The commit is deferred to a microtask rather than written synchronously
// inside the render call itself. Resolving one roll is not one render:
// resolvePlayerRoll() (pipeline.js) triggers a whole synchronous cascade of
// them (its own updateTurn(), then a mod's effect() calling updatePlayer()
// again, e.g. Consecrate's own soul grant, each one a fresh
// refreshInspector() -> renderDieList() pass) — a first version of this fix
// committed the signature synchronously on the very first of those
// cascaded renders, so every later render in that SAME cascade (including
// the last one, the one actually left on screen once the cascade settles)
// already read as "seen" and got the held class instead of ever flashing
// at all. Deferring the commit to a microtask means every render that
// happens synchronously within one roll's resolution — however many there
// are — still sees the previous roll's signature and correctly flashes;
// the commit only lands once that whole synchronous burst has finished,
// which is always before the next genuinely separate event (a button
// click is its own task, queued behind any pending microtasks) gets a
// chance to render again.
const lastSeenRollSignatureByContainer = {};

// BUILD 138 — die feedback: same per-container "already seen" bookkeeping
// as lastSeenRollSignatureByContainer above, one array of committed face
// numbers per container instead of one signature, so a face already shown
// hopped (flashed) in an earlier render doesn't restart its flash animation
// on a later, unrelated re-render. See renderDieList()'s hop block below.
const lastSeenHoppedFacesByContainer = {};

// BUILD 079: optional 4th arg — { isEligible(face), onPick(faceNumber),
// showBecomes } — turns the die rows themselves into the Load/Strengthen
// face picker, replacing the old separate face-button screens. Every other
// caller passes nothing and gets the exact unchanged render this function
// already produced.
// BUILD 139: optional 5th arg, buffPoisonStacks — the enemy's own act-scaled
// poison amount, passed straight through to faceHoverText() so an enemy
// die's poison/Nat faces can name the real number for the current act.
// Callers rendering the player's own die pass nothing; harmless, since no
// player face ever carries an enemy modId.
function renderDieList(containerId, faces, forceRollFn, pickConfig, buffPoisonStacks) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const title = container.querySelector('.panel-title');
  container.innerHTML = '';
  if (title) container.appendChild(title);
  // KI-24: an empty faces array (a dieless enemy) still clears out
  // whatever rows a previous fight's die left behind, leaving just the
  // title — the "empty die slot" D-29 asks for, not a stale die.
  if (!faces.length) return;

  // BUILD 093: computed once per render call, not per row — only the
  // containers that ever show a live die track this at all (same gate
  // renderDieList already used for the highlight itself). BUILD 101: added
  // enemyDieList, reading the enemy-side mirror fields (enemyRollOutcome/
  // enemyRolledFaceNumber, pipeline.js's resolveEnemyRoll()) instead of the
  // player's own — same mechanism, separate state, since both dice can hold
  // a rolled face at once.
  // BUILD 103: reference equality with the player's own live die, not a
  // containerId allowlist — true for every container that happens to
  // render gameState.die.faces itself (playerDieList, dieActionDieList,
  // the map's mapPlayerDieList preview), false for the enemy die and the
  // map's static elite/boss previews (different arrays entirely). This is
  // what "player die only, not the enemy die" reduces to — BUILD 108: the
  // trigger counts themselves now live per-face in modData rather than in a
  // second top-level array, but this gate is unchanged: the enemy die's
  // faces (and the map's static previews) never carry modData at all.
  const showTriggerBadges = (faces === gameState.die.faces);

  const tracksRolledFace = (containerId === 'playerDieList' || containerId === 'dieActionDieList' || containerId === 'enemyDieList');
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

  // BUILD 138 — die feedback: a face that fires WITHOUT being the rolled
  // face (a Nat 20 sweep, a Bound scan, an outside-roll trigger — see
  // gameState.turn.hoppedFaces, pipeline.js's markFaceHopped()) hops to the
  // exact same rolled-face look (die-row-rolled/-flash) below, player die
  // only (never the enemy die — the mechanics that populate hoppedFaces are
  // all player-die-only). Same flash-once-then-sustained split as the
  // rolled face's own highlight above, tracked per container so a face
  // already seen hopped in an earlier render of this same round doesn't
  // restart its flash animation.
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

  // BUILD 093: display order flipped — NAT 20 at the top, descending to
  // NAT 1 at the bottom. Purely a rendering change: faces (and the real
  // gameState.die.faces array it was passed) are never mutated or
  // reordered, only a REVERSED COPY is iterated to decide DOM append
  // order. Every row still closes over its own real `face` object from
  // that copy, so face.number and the pickConfig.onPick(faceNumber) click
  // handler below are completely unaffected by which position the row is
  // drawn in — a click always targets the face whose number is printed on
  // it, never "whatever used to be at this row's old position." Applies
  // to every caller (fight screen, the Load/Strengthen picker, the map's
  // static previews) since they all funnel through this one function.
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

    // BUILD 090: the rolled-face highlight — only the containers that ever
    // show a live die (the fight screen's own player list, the post-win
    // Load/Strengthen picker, which renders the same gameState.die.faces
    // mid-flow before rolledFaceNumber is next cleared, and — BUILD 101 —
    // the fight screen's enemy list). Never the map's own static preview
    // list — this is fight-roll feedback, not a persistent die display.
    // classList.add() only, alongside whatever else this row already
    // carries (loaded/nat-one/nat-twenty, and pickable/pick-inert below),
    // so neither state is lost when both apply to the same row.
    // BUILD 093: isNewRollThisRender (computed once above, per container,
    // per render) picks the animated -flash class only on the render right
    // after an actual new roll; every later re-render of that same roll
    // (a mod loaded mid-turn, e.g.) gets the plain, non-animated
    // .die-row-rolled instead — the sustained hold survives re-renders
    // without restarting. Blanks have no sustained class at all: once
    // flashed, a re-render adds nothing here, matching "fades once, never
    // reappears."
    if (tracksRolledFace && trackedRolledFaceNumber === face.number) {
      if (trackedRollOutcome === 'blank') {
        if (isNewRollThisRender) { row.classList.add('die-row-rolled-blank-flash'); }
      } else {
        row.classList.add(isNewRollThisRender ? 'die-row-rolled-flash' : 'die-row-rolled');
      }
    } else if (tracksHoppedFaces && trackedHoppedFaces.indexOf(face.number) !== -1) {
      // BUILD 138: this face fired without being the rolled face — same
      // sustained/flash look, keyed off whether THIS face's own hop is new
      // this render (not the rolled face's roll signature above).
      row.classList.add(newlyHoppedThisRender.indexOf(face.number) !== -1 ? 'die-row-rolled-flash' : 'die-row-rolled');
    }

    const btn = document.createElement('button');
    btn.className = 'face-btn';

    // BUILD 116: weight visible on the face itself — the thesis mechanic
    // (the distribution the player has built) was previously only readable
    // via the small ×N badge in modWrap, invisible without reading every
    // row closely. A weight-2+ face now gets a fill bar inside its own
    // face-btn, bottom-anchored, height scaled to weight and capped at
    // weight 5 (25%/50%/75%/100% for weight 2/3/4/5+) — weight 1 (the vast
    // majority of faces, untouched) gets no fill element at all, same
    // "nothing extra at the default" convention the ×N badge and #N
    // trigger badge both already use. Uses `background: currentColor` —
    // face-btn's own `color` is already set per row identity (--blank/
    // --nat/--player-mod/--enemy-mod, index.html) by the existing
    // .die-row.* selectors, so this reuses whatever colour already governs
    // that face rather than introducing a new one; only its opacity (set in
    // CSS) makes it read as emphasis rather than a second layer of colour.
    // Purely an absolutely-positioned child inside face-btn's own existing
    // 34px×row-height box (face-btn already gets position:relative +
    // overflow:hidden in CSS for this) — no row grows, no column widens.
    // BUILD 117: weight 2 measurably looked identical to weight 1 in real
    // play — a 25%-tall fill at 0.32 opacity is a ~5px sliver at the very
    // bottom of a 19px button, easy to miss entirely at a glance. Fixed
    // two ways, both confirmed via Playwright pixel sampling (see CURRENT
    // SUBSTAGE), neither a new colour: (1) weight 2 now starts at a much
    // more substantial 40% fill instead of 25%, so the FIRST point of
    // Strengthen already reads as "visibly more" rather than "barely
    // anything" — the curve still grows with weight (40/60/80/100% for
    // weight 2/3/4/5+), so higher weight still reads as heavier than
    // weight 2, just off a higher floor; (2) opacity raised from 0.32 to
    // 0.5 (CSS) so the same colour reads more strongly at every weight,
    // low weight included, without changing which colour it is.
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

    // DEV ONLY — force-roll click handler. Remove before any real release.
    // BUILD 083: only wired while the dev chrome is open. Closed, the twenty
    // face rows are not a dev input at all — the button renders identically,
    // it simply carries no listener. The BUILD 079 Load/Strengthen picker is
    // untouched by this: it is player-facing, passes forceRollFn null, and
    // wires its click on the row via pickConfig below, not on this button.
    if (forceRollFn && devChromeOpen) {
      const faceNumber = face.number;
      btn.addEventListener('click', function() {
        forceRollFn(faceNumber);
      });
    }

    const modWrap = document.createElement('div');
    modWrap.className = 'die-mod-wrap';

    // BUILD 117: a face holding two mods now shows both names SIDE BY SIDE
    // on the row's one line, each with its own trigger count immediately
    // beside it — .die-mod-pair (a row-direction flex, index.html), one
    // .die-mod-entry per mod. Replaces BUILD 115's vertical .die-mod-stack,
    // which put the second mod on its own line and made that one row ~28px
    // tall against every other row's 19px (a real twenty-row-column
    // violation), and BUILD 108's shared far-right "#N1/N2" badge, which
    // put both counts together with no visual link to which mod each
    // belonged to. Both problems shared one root cause — stacking/grouping
    // content that belongs to two different mods as if it were one unit —
    // and both are fixed by the same change: keep each mod's own name and
    // count paired together, and never stack vertically. Single-mod and
    // blank faces are completely unchanged: one .die-mod span, then the
    // weight badge, then the (now always single) trigger badge, exactly as
    // before BUILD 115 ever existed.
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
        // BUILD 117: idx 1 (the second mod) gets its own class for the
        // gap-before-it CSS rule — a plain "second .die-mod" CSS selector
        // (:nth-of-type or the adjacent-sibling combinator) doesn't work
        // here, since :nth-of-type counts by tag name (span), not class,
        // and the first mod's own trigger count (also a <span>) sits
        // between the two names whenever it has triggered — an actual bug
        // this build's own Playwright screenshot caught (the gap vanished
        // silently the moment the first mod had a nonzero count).
        nameSpan.className = idx === 1 ? 'die-mod die-mod-second' : 'die-mod';
        // BUILD 137: a two-mod face used to show each name CSS-ellipsised to
        // whatever fit a fixed 44px box (measured worst case "Congre…"/
        // "San…" — no six full letters ever survived it). Truncation is now
        // done here, in JS, to an exact character count (TWO_MOD_NAME_CHARS,
        // no ellipsis glyph eating into the letter budget) — the full name
        // is still always available via the native title tooltip on hover,
        // same "no information lost, only shortened on-row" intent BUILD
        // 117's own CSS-ellipsis comment already stated.
        const fullName = modDisplayName(m.id);
        nameSpan.textContent = fullName.slice(0, TWO_MOD_NAME_CHARS);
        nameSpan.title = fullName;
        modPair.appendChild(nameSpan);
        // Same "zero triggers shows nothing" convention every badge in
        // this row already uses — a mod that hasn't fired yet just shows
        // its bare name, no "#0" clutter.
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

    // BUILD 137: Bound badge — every Bound face (a printed-Bound mod,
    // Unison/Accord/Kinship, tags-based, permanent; or a face granted Bound
    // for the fight via grantBoundToFace(), modData.boundGranted) shows a
    // small "Bound" badge, same box/font as .die-weight above (D-28's
    // no-new-palette rule). isBoundFace() (pipeline.js) is the one shared
    // check both cases already go through — never a second copy of its
    // tags-vs-modData logic here. Shown on every die-row container (not
    // gated by showTriggerBadges): a printed-Bound mod's badge is part of
    // what the mod IS, visible wherever its name is; a granted badge only
    // ever exists on the live player die (gameState.die.faces) since
    // grantBoundToFace() only ever writes there, so it naturally only shows
    // up on containers rendering that same array.
    if (isBoundFace(face)) {
      const boundSpan = document.createElement('span');
      boundSpan.className = 'die-weight die-bound-badge';
      boundSpan.textContent = 'Bound';
      modWrap.appendChild(boundSpan);
    }

    // BUILD 103: per-face trigger-count badge — player die only (showTriggerBadges,
    // computed once above from reference equality with gameState.die.faces,
    // is false for the enemy die and for the map's static previews). Zero
    // triggers appends nothing, same convention as the weight badge above
    // (weight 1 gets no ×N either) — an untouched face renders identically
    // to before this build.
    // BUILD 108: counts now come from the face's own modData (folded in from
    // the old gameState.die.triggerCounts array — see STATE SCHEMA).
    // BUILD 116: '↻' (a rotation-arrow glyph easily mistaken for a reload
    // icon) replaced with the literal label '#'. Font size bumped so the
    // number itself is legible at a glance without hovering.
    // BUILD 117: this trailing badge is now single-mod faces only — a
    // two-mod face's two counts render inline beside their own mod name
    // above instead (die-mod-entry), never here.
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

    row.appendChild(btn);
    row.appendChild(modWrap);

    // BUILD 079: eligibility/click wiring for the Load/Strengthen face
    // picker — same isEligible() filter each flow's own function already
    // used before this build deleted the separate button screens.
    let pickEligible = false;
    if (pickConfig) {
      pickEligible = !!pickConfig.isEligible(face);
      row.classList.add(pickEligible ? 'die-row-pickable' : 'die-row-pick-inert');
      if (pickEligible) {
        const faceNumber = face.number;
        row.addEventListener('click', function() { pickConfig.onPick(faceNumber); });
      }
    }

    // BUILD 071: same .hover-tip component BUILD 070 built for the card
    // reward panel — only added when there's real text to show.
    const hoverText = faceHoverText(face, buffPoisonStacks);
    // BUILD 079: during the Strengthen picker, an eligible row's hover also
    // shows what the face becomes — same faceHoverText() function, same
    // weight+1 arithmetic dieActionPickStrengthenFace() itself applies, so
    // the ×N figure it prints is the same derived figure the weight badge
    // and hover already show, never new copy.
    let becomesText = null;
    if (pickConfig && pickConfig.showBecomes && pickEligible) {
      becomesText = faceHoverText(Object.assign({}, face, { weight: face.weight + 1 }), buffPoisonStacks);
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

function renderStats() {
  // BUILD 135: a kill can leave gameState.enemy.hp negative (overkill damage
  // is never clamped in state — pipeline.js's calculateDamage()/dealDamage()
  // apply the raw amount) — displayed HP is clamped to 0 here, at render
  // time only, so the underlying state some tests/logs read is untouched.
  document.getElementById('enemyHpValue').textContent = Math.max(0, gameState.enemy.hp) + ' / ' + gameState.enemy.maxHp;
  document.getElementById('enemyIntentValue').textContent = gameState.enemy.intent;
  document.getElementById('enemyIntentLabel').textContent = 'Attacks for ' + gameState.enemy.intent;
  document.getElementById('enemyPoisonValue').textContent = gameState.enemy.poisonStacks;
  document.getElementById('enemyBuffsValue').textContent = gameState.enemy.activeBuffs.length ? gameState.enemy.activeBuffs.join(', ') : '—';
  document.getElementById('enemyActiveValue').textContent = '—';

  document.getElementById('playerBlockValue').textContent = gameState.player.block;
  document.getElementById('playerHpValue').textContent = gameState.player.hp + ' / ' + gameState.player.maxHp;
  document.getElementById('playerSoulValue').textContent = gameState.player.soul + ' / ' + gameState.player.maxSoul;
  // BUILD 067: Active debuffs previously only ever had one possible entry
  // (poison), rendered via a single ternary. Extended to a small array +
  // join(', ') so a second debuff (Penitence) can appear alongside it —
  // same join(', ') shape enemyBuffsValue already uses for its own
  // multi-entry active-effects list, not a new display format.
  const playerDebuffs = [];
  if (gameState.player.poisonStacks) playerDebuffs.push('poison x' + gameState.player.poisonStacks);
  if (gameState.player.penitenceActive) playerDebuffs.push('penitence');
  document.getElementById('playerDebuffsValue').textContent = playerDebuffs.length ? playerDebuffs.join(', ') : '—';
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
  interdict: '5 block, 10 if enemy intent 12+',
  reckoning: '3 damage + 2 per poison stack',
  retribution: 'damage = block, capped at 12',
  covenant: '2 damage + 3 per face weight',
  rapture: '12 damage, free on a mod turn',
  orison: '5 damage, 9 on a blank roll',
  // BUILD 136: checkpoint 3's 21 new cards — same convention as every
  // entry above, no wording invented beyond what each card's own effect
  // does (see CARD_EFFECT_TEXT's own header note and each card's log()
  // line in cards-mods.js).
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
  hosanna: '6 damage, 11 if you have 3+ soul left after paying',
  gloria: '30 damage',
  oblation: 'Spend all your soul. 7 damage per soul spent, max 42',
  tabernacle: '3 block, +3 per weight of the rolled face, max 12',
  jubilee: '4 damage, +2 per weight added to the die this run, max 24',
  threnody: 'Triggers your lowest-numbered loaded face',
  reverberation: 'The face you rolled triggers again. On a 1 or 20: 6 block instead',
  kyrie: '5 damage, 10 if the rolled face has Bound',
  novena: 'every Bound face triggers',
  canticle: '6 block. The face you rolled gains Bound for this fight'
};

// BUILD 071: hover text for mods and Nat faces, derived from each mod's
// own log() lines (stripping the '[MOD] name: ' prefix and, where a
// number is only known at trigger time — Zeal's stacking bonus,
// Virulence's doubled total — substituting the same static base numbers
// already written into that mod's effect() call, e.g. Zeal's base 10 and
// its own +4-per-trigger growth). No wording invented beyond what each
// mod's code already says; every one of the eleven pool mods had a usable
// log line, so none are missing here. Player Nat descriptions reuse the
// NAT 20 AND NAT 1 — THE ORDAINED section's own wording (face 20) and the
// BUILD 067 Penitence onset log line (face 1) almost verbatim.
const MOD_DESCRIPTION = {
  consecrate: '+2 soul this turn, 3 block per card played this turn',
  smite: '16 damage',
  penance: '8 damage, 8 block',
  offering: '+2 soul this turn, draw 1',
  blight: 'applied 6 poison',
  virulence: 'applied 3 poison, doubled',
  sanctuary: '16 block',
  vigil: 'block scales with cards held at end of turn (5 block per card)',
  // BUILD 136: appended ". Growth", same convention as the ". Bound" suffix
  // below — every mod carrying the 'growth' tag (config.mods[id].tags,
  // cards-mods.js) shows the word in its text so the player can see what
  // Lauds/Congregation's own "loaded Growth mod" counts actually count.
  zeal: '10 damage, permanently gains +4 damage per trigger. Growth',
  fervour: 'attacks double damage this turn',
  ordain: '10 damage, +1 weight to the triggering face. Growth',
  // BUILD 117: anthem and elevation (BUILD 113/114) were never added here
  // when they were built — a real gap the prompt's own "check every other
  // mod in the pool" instruction caught, not just Elevation, the one
  // symptom actually reported. Same convention as every entry above:
  // derived from each mod's own log() line (cards-mods.js), no wording
  // invented beyond what the code already says.
  anthem: '6 damage, +4 per point of weight on its own face',
  elevation: '10 damage, +1 weight to the face above (if loaded and not face 20). Growth',
  // Checkpoint 3 tags/mods build — six new mods, same convention: derived
  // from each mod's own log() line, no wording invented beyond it.
  // BUILD 136: largesse's soul gain is permanent (updatePlayer(), no
  // turn-scoped clear) — "this turn" was a real meaning mismatch with the
  // effect, fixed here.
  largesse: '+2 soul, 4 block',
  tithe: 'End of round: 5 damage per soul you have left, max 20',
  congregation: '8 damage. 16 if another mod on your die has Growth. Growth',
  cope: '8 block, permanently gains +2 block per trigger. Growth',
  anathema: 'End of round: deal damage equal to your block, max 16',
  thurible: '8 damage, applied 3 stacks of poison',
  // Checkpoint 3, prompt D — trigger a face outside a roll.
  magnificat: 'Triggers your heaviest other face',
  // Checkpoint 3, Bound engine — three plain Bound mods.
  unison: '6 damage. Bound',
  accord: '10 block. Bound',
  kinship: 'applied 4 stacks of poison. Bound',
  // Checkpoint 3, the remaining Bound pieces (Concord, Herald).
  concord: '+1 soul, 3 block. Bound',
  herald: '6 damage. One other random loaded face gains Bound for this fight. Bound'
};

const NAT_DESCRIPTION = {
  NAT_TWENTY: 'fires every loaded face on the die this turn, ascending face order',
  // BUILD 084: duration reworded from "the rest of the fight" to match the
  // new 3-turn rule — this string is the player-facing hover for face 1 and
  // would otherwise state a duration the game no longer has.
  NAT_ONE: 'Penitence: lose 1 soul at the start of every turn for the next 3 turns'
  // ENEMY_NAT_ONE/ENEMY_NAT_TWENTY intentionally absent from this table —
  // both are real behaviour (BUILD 097/098), not stubs, but their text
  // needs the current act's own buffPoisonStacks number, which this static
  // table has no way to hold; faceHoverText() (BUILD 139) builds their
  // hover text inline instead of reading it from here.
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

    const costEl = document.createElement('span');
    costEl.className = 'hand-card-cost';
    costEl.textContent = cost;

    const nameEl = document.createElement('span');
    nameEl.className = 'hand-card-name';
    nameEl.textContent = card.name;

    const effectEl = document.createElement('span');
    effectEl.className = 'hand-card-effect';
    effectEl.textContent = CARD_EFFECT_TEXT[cardId] || '';

    btn.appendChild(costEl);
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

let dieActionStep = null; // null | 'choose' | 'load_pick_mod' | 'load_pick_face' | 'strengthen_pick_face'
let dieActionMods = []; // the (up to) 3 mod ids offered this pass
let dieActionChosenModId = null;

// Consecrate is the class anchor, not a reward, per SCOPE — V1. Zeal,
// Fervour, and Ordain were all excluded by id here while each didn't exist
// yet (a placeholder so they'd be auto-excluded once built without this
// code needing to change again); now that all three are real pool mods
// (not class anchors), they're removed from this list so they're
// reward-eligible like every other pool mod (Smite, Penance, Offering,
// Blight, Virulence, Sanctuary, Vigil). Fervour and Ordain were left in
// this list through BUILD 046/047 since neither of those prompts asked for
// their removal — this verification pass (BUILD 048) is what closes that
// gap, matching Zeal's own removal in BUILD 044.
const DIE_ACTION_EXCLUDED_MOD_IDS = ['consecrate'];

// BUILD 068: which flow opened the die action panel — 'reward' (a fight
// win, or the Skip to Die Action dev shortcut testing that same path) or
// 'rite' (a rite slot's die-action choice). Read once in closeDieActionScreen()
// to decide what happens next; defaults to 'reward' so every existing call
// site (which passes no argument) is unaffected.
let dieActionOrigin = 'reward';

// BUILD 082: how many die actions the current 'reward' flow still owes the
// player. Every call site that opens the panel for a real reward (fight
// win, the dev shortcut) sets this before calling openDieActionScreen() —
// 1 for a normal fight, 2 for the elite's extra action — never inside
// openDieActionScreen() itself, since that function is also the one
// closeDieActionScreen() calls again mid-loop for the elite's second
// action, and must not reset the count back to 1 when it does. Irrelevant
// for a 'rite' origin (rites always grant exactly one action; closed via
// advanceRun() before this counter is ever consulted), so no rite call
// site needs to touch it — left at whatever a prior reward flow set it to
// is harmless since it's never read on that path.
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
    // BUILD 068: a rite's die-action choice never offers a card reward —
    // it resolves the rite slot and returns to the map.
    advanceRun();
    return;
  }
  // BUILD 082: the elite's extra action — decrement the count this
  // 'reward' flow owes, and if any remain, reopen the same panel instead
  // of moving on to the card reward. Every Load/Strengthen/Skip choice
  // funnels through this one close function (see dieActionChooseSkip/
  // dieActionPickLoadFace/dieActionPickStrengthenFace below), so this is
  // the single place that can loop the panel regardless of which choice
  // was made each time through.
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

// BUILD 126 (D-54): every unloaded, non-anchor mod — the exact pool
// dieActionChooseLoad() draws its 3-mod offer from. Factored out so
// renderDieActionPanel()'s 'choose' step can gate the Load button's very
// existence on the same count Load's own offer logic uses, rather than the
// two drifting apart.
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

// BUILD 129 (checkpoint 3 tiers). Which [common, uncommon, rare]
// GAME_CONFIG.TIER_SPLIT table a reward/offer currently being built should
// roll against — decided by the slot the win (or rite) actually came from,
// not by what's being offered. A rite's die-action Load offer (origin ===
// 'rite') shares the 'fight' split, per the spec ("fights and rites").
// gameState.run.currentSlot stays pointed at the just-won slot for the
// whole reward flow (never advanced until advanceRun(), which only runs
// once the flow closes), so it's safe to read here regardless of whether
// this is the die-action screen or the card-reward screen that follows it.
// A null currentSlot (a test or dev tool opening the panel directly, off
// the map, without ever entering a real fight) falls back to 'fight' —
// the same split 'opening' already gets.
function currentOfferTierSplit(origin) {
  if (origin === 'rite') return GAME_CONFIG.TIER_SPLIT.fight;
  const cs = gameState.run.currentSlot;
  if (cs === 'boss') return GAME_CONFIG.TIER_SPLIT.boss;
  if (cs === null || cs === 'opening') return GAME_CONFIG.TIER_SPLIT.fight;
  const wonSlot = gameState.run.act[cs.lane][cs.index];
  return wonSlot.label === 'Elite' ? GAME_CONFIG.TIER_SPLIT.elite : GAME_CONFIG.TIER_SPLIT.fight;
}

function dieActionChooseLoad() {
  // BUILD 115: a mod already on the die — in either slot — is excluded
  // from the offer, same "excludes any mod already on the die" rule as
  // before, now checking modId2 too.
  const eligible = eligibleLoadModIds();
  // BUILD 126/127 (D-54): the Load button itself is hidden once eligible
  // drops below 3 (renderDieActionPanel()'s 'choose' step, gated on this
  // same eligibleLoadModIds() count) — that's the real fix a player sees.
  // This is the belt underneath it: dieActionChooseLoad() must never build
  // a short or duplicated offer regardless of how it's called, so a stale
  // caller (dev tooling, a future bug) that reaches this function anyway
  // still can't produce one — converts to Strengthen instead, silently,
  // since by construction nothing in the real UI can trigger this branch.
  if (eligible.length < 3) {
    dieActionChooseStrengthen();
    return;
  }
  // BUILD 129: each of the 3 choices rolls its own tier (state.js's
  // pickTieredOffer()) off the split this offer's own slot uses, instead
  // of a flat shuffle-and-slice — the shuffle's own "no repeats" guarantee
  // is kept (pickTieredOffer() never returns the same id twice).
  const pool = eligible.map(function(modId) { return { id: modId, tier: gameState.config.mods[modId].tier }; });
  const split = currentOfferTierSplit(dieActionOrigin);
  dieActionMods = pickTieredOffer(pool, split, 3).map(function(o) { return o.id; });
  dieActionStep = 'load_pick_mod';
  // BUILD 109: run record — every Load offer shown gets its own entry the
  // moment it's shown (write as it happens), patched with its pick once
  // one is made (dieActionPickLoadFace() below) — never built after the
  // fact. picked: null here is what a still-unresolved offer looks like if
  // the run is abandoned mid-pick.
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'load', offered: dieActionMods.slice(), picked: null }]) });
  refreshInspector();
}

function dieActionChooseStrengthen() {
  dieActionStep = 'strengthen_pick_face';
  refreshInspector();
}

function dieActionChooseSkip() {
  log('[DIE ACTION] skipped');
  // BUILD 109: run record — Skip is a distinct outcome from a Load offer
  // (chosen instead of ever opening one), recorded as its own event.
  updateRunRecord({ dieActionEvents: gameState.runRecord.dieActionEvents.concat([{ type: 'skip' }]) });
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
  // BUILD 115: blank face fills modId, exactly as before. An already-loaded
  // face (BUILD 116: offered by load_pick_face's own eligibility at any
  // point in a run, not just once blanks run out — see renderDieActionPanel)
  // fills modId2 instead. Both slots full is a defensive refusal — the
  // picker's own eligibility filter should never offer such a face, but
  // this is the one place a face's modId is ever written for a real Load,
  // so it must not silently overwrite a mod that's already there. Cap two,
  // never three.
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
  // BUILD 109: run record — patches the most recent still-unresolved 'load'
  // event (the one dieActionChooseLoad() pushed with picked: null) with the
  // mod actually picked. Searches from the end rather than assuming "the
  // last entry" so a future event type pushed between offer and pick can't
  // silently corrupt the wrong entry.
  const events = gameState.runRecord.dieActionEvents.slice();
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'load' && events[i].picked === null) {
      events[i] = Object.assign({}, events[i], { picked: dieActionChosenModId });
      break;
    }
  }
  updateRunRecord({ dieActionEvents: events });
  // BUILD 095: Load now has its own distinct (spooky) sound, separate
  // from Strengthen — replaces BUILD 094's shared die_action_confirmed —
  // fired the moment this Load actually commits (updateDie() above).
  playAudioEvent('die_action_load');
  closeDieActionScreen();
}

function dieActionPickStrengthenFace(faceNumber) {
  // BUILD 107: weight write moved into the shared strengthenFace() helper
  // (pipeline.js) — Ordain's effect (cards-mods.js) now goes through the
  // same call instead of duplicating this clone-and-increment logic.
  const newWeight = strengthenFace(faceNumber);
  log('[DIE ACTION] strengthened face ' + faceNumber + ' to weight ' + newWeight);
  // BUILD 095: Strengthen's own distinct sound — Load adds, Strengthen
  // deepens, per the prompt — fired the moment this commits (updateDie()
  // above).
  playAudioEvent('die_action_strengthen');
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

  // BUILD 072: the die action screen is where the die is actually being
  // changed, and was the one screen that never showed it. Shown while
  // choosing a mod to load or a face to strengthen — the two steps named
  // explicitly — not on the initial Load/Strengthen/Skip menu (nothing
  // die-specific is being chosen yet). BUILD 079: also shown for
  // load_pick_face now that it's the face picker, not just a preview.
  let showDiePreview = false;
  // BUILD 079: set only for load_pick_face/strengthen_pick_face — passed
  // to renderDieList() below so the die rows themselves become the picker.
  let pickConfig = null;

  if (dieActionStep === 'choose') {
    title.textContent = 'Fight won — choose a die action';

    // BUILD 129: Load shows whenever a blank face exists among faces 2-19
    // (faces 1/20 are the NAT_ONE/NAT_TWENTY stubs — never loadable, never
    // blank). BUILD 126/127 (D-54)'s pool-exhaustion gate — fewer than
    // three unloaded, non-anchor mods left, so a real 3-mod Load offer
    // could not be built — stays in place underneath this as a last guard:
    // it still hides the button even when a blank face exists, if the pool
    // itself has run dry. Skip and Strengthen are unaffected either way.
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

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', function() { log('[CLICK] Skip'); dieActionChooseSkip(); });

    row.appendChild(strengthenBtn);
    row.appendChild(skipBtn);

  } else if (dieActionStep === 'load_pick_mod') {
    title.textContent = 'Choose a mod to load';
    showDiePreview = true;

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
      // BUILD 071: same hover component as the card reward panel, same
      // MOD_DESCRIPTION source the die rows read.
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
    // BUILD 079: the separate "Choose a blank face" button screen is gone —
    // the die preview below (now shown for this step too) is the picker.
    // BUILD 115 gated a second mod behind "no blank face left anywhere on
    // the die." BUILD 116 removes that gate entirely, per the prompt's
    // explicit instruction: any loaded, non-Nat face that isn't already
    // holding two mods is a valid target at any point in a run, regardless
    // of how many blanks remain — blank faces and already-loaded faces are
    // now simply both eligible, together, always. A blank face (modId
    // null) trivially satisfies every clause below (null !== the two Nat
    // stub ids, and a blank face never carries modId2), so one condition
    // now covers every case the old two-branch version did, with the cap
    // of two mods (!f.modId2) and the anchor's Nat-adjacent exclusion (the
    // anchor itself is never offered by dieActionChooseLoad() in the first
    // place — see DIE_ACTION_EXCLUDED_MOD_IDS) both still enforced exactly
    // as before.
    title.textContent = 'Choose a face for ' + gameState.config.mods[dieActionChosenModId].name;
    showDiePreview = true;
    pickConfig = {
      isEligible: function(f) {
        return f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2;
      },
      onPick: dieActionPickLoadFace,
      showBecomes: false
    };

  } else if (dieActionStep === 'strengthen_pick_face') {
    // BUILD 079: title corrected — face 20 (NAT_TWENTY) has always been a
    // valid target here even though it carries no mod, so "loaded face"
    // was never accurate. Separate face-button screen removed the same way
    // load_pick_face's was; eligibility is the exact filter that screen
    // used to offer buttons for.
    title.textContent = 'Choose a face to strengthen';
    showDiePreview = true;
    pickConfig = {
      isEligible: function(f) {
        if (f.number === 1) return false;
        if (f.number === GAME_CONFIG.DIE_SIZE.PLAYER) return true;
        return f.modId !== null;
      },
      onPick: dieActionPickStrengthenFace,
      showBecomes: true
    };
  }

  panel.appendChild(title);

  if (showDiePreview) {
    const dieContainer = document.createElement('div');
    dieContainer.className = 'die-col player-die';
    dieContainer.id = 'dieActionDieList';
    const dieTitle = document.createElement('div');
    dieTitle.className = 'panel-title';
    dieTitle.textContent = 'YOUR DIE';
    dieContainer.appendChild(dieTitle);

    const dieWrap = document.createElement('div');
    dieWrap.className = 'die-action-die-preview';
    dieWrap.appendChild(dieContainer);
    panel.appendChild(dieWrap);

    // Reuse the existing die renderer verbatim, same as the map's own
    // die previews — no third die renderer. Must run after dieContainer
    // is attached to the live document (renderDieList looks it up by id).
    // No forceRollFn (null) — a reference view while choosing, not a
    // force-roll target. pickConfig (null except during load_pick_face/
    // strengthen_pick_face) is what turns these same rows into the picker.
    renderDieList('dieActionDieList', gameState.die.faces, null, pickConfig);
  }

  panel.appendChild(row);
}

// ---------- CARD REWARD SCREEN (post-fight, after the die action panel) ----------
// Stage 1.11 — screen only, using the placeholder cards from
// config.cardPool (see init()); the real pool design comes later. Same
// non-gameState module-level-variable convention the die action screen
// already uses (dieActionStep etc.), for the same reason: this is
// UI-flow state, not game state affecting win/loss or damage.

let cardRewardStep = null; // null | 'choose'
let cardRewardOptions = []; // the 3 card ids offered this pass, always distinct (BUILD 070)

function openCardRewardScreen() {
  // BUILD 070: was 3 independent Math.random() picks with replacement,
  // which could (and did — observed as Purge, Orison, Purge) offer the
  // same card twice in one reward. Fixed with a shuffle-then-slice draw
  // (no repeats); BUILD 129 (checkpoint 3 tiers) replaces that flat draw
  // with pickTieredOffer() (state.js) — each of the 3 choices rolls its
  // own tier off this reward's own slot split (currentOfferTierSplit()) —
  // while keeping the same no-repeat guarantee.
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
  // BUILD 068: the card reward screen is only ever reached via the
  // fight-win reward flow (never the rite path — rites never open it), so
  // its resolution is always "this slot is fully done" — advance the run
  // and return to the map.
  advanceRun();
}

function cardRewardSkip() {
  // BUILD 054: reports gameState.player.ownedCards.length (the true,
  // persistent collection size), not gameState.player.deck.length (just
  // the current fight's draw pile, which reads a different, misleading
  // number since it fluctuates with draws/discards within the fight).
  log('[CARD REWARD] skipped, deck still ' + gameState.player.ownedCards.length + ' cards');
  closeCardRewardScreen();
}

function cardRewardPickCard(cardId) {
  const card = gameState.config.cardPool[cardId];
  // Written to both deck (this fight's draw pile, so the count reflects
  // the pick immediately) and ownedCards (the permanent collection
  // resetFight() reshuffles from) in the same updatePlayer() call.
  updatePlayer({
    deck: gameState.player.deck.concat([cardId]),
    ownedCards: gameState.player.ownedCards.concat([cardId])
  });
  // BUILD 054: reports ownedCards.length, not deck.length — see cardRewardSkip().
  log('[CARD REWARD] added ' + card.name + ' to deck, deck now ' + gameState.player.ownedCards.length + ' cards');
  // BUILD 095: split reward sound — Strike/Ward get the plain basic click,
  // everything else the richer one. Note for the record: the reward pool
  // (gameState.config.cardPool, built in init()) never actually contains
  // 'strike' or 'ward' — only the fifteen non-starter cards are offered —
  // so this branch is correct as specified but currently unreachable in
  // real play; implemented as asked rather than silently dropped, since
  // the pool's contents are gameplay data this build must not touch.
  playAudioEvent((cardId === 'strike' || cardId === 'ward') ? 'card_reward_basic' : 'card_reward_rich');
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
    // BUILD 070: hover description — reuses CARD_EFFECT_TEXT verbatim, the
    // exact same source renderCardButtons() already reads for hand cards.
    // No new copy written for any card.
    const tip = document.createElement('span');
    tip.className = 'hover-tip';
    tip.textContent = CARD_EFFECT_TEXT[cardId] || '';
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

// ---------- RITE SCREEN (BUILD 068) ----------
// A rite slot offers a choice of heal 20 HP or take a die action, then
// returns to the map. Same null/'choose' step shape as dieActionStep/
// cardRewardStep above (module-level, not gameState — mirroring that
// existing precedent for transient screen-flow state).

let riteStep = null; // null | 'choose' | 'remove_pick_card'

function openRiteScreen() {
  riteStep = 'choose';
  refreshInspector();
}

function closeRiteScreen() {
  riteStep = null;
  refreshInspector();
}

// BUILD 092: routed through healPlayer()/ON_HEAL (pipeline.js) instead of
// a bare updatePlayer({hp:...}) call — same 20 HP, same cap at maxHp, same
// log line and content, now observable/modifiable by anything registered
// on ON_HEAL. before/after are read around the call rather than computed
// inline, since healPlayer() returns only the healed amount (post-cap),
// not the resulting hp value itself.
function riteChooseHeal() {
  const before = gameState.player.hp;
  const healedAmount = healPlayer(GAME_CONFIG.RITE_HEAL);
  const after = gameState.player.hp;
  log('[RITE] healed ' + healedAmount + ' HP (' + before + ' to ' + after + ')');
  closeRiteScreen();
  advanceRun();
}

function riteChooseDieAction() {
  log('[RITE] taking a die action');
  closeRiteScreen();
  // Reuses the existing die action panel completely unchanged — only the
  // origin tag differs from the post-fight-win path, so closeDieActionScreen()
  // knows to advance the run instead of opening a card reward.
  openDieActionScreen('rite');
}

// BUILD 088: third rite option — picking it does not commit the rite by
// itself, since a card still needs to be chosen. Same two-step shape
// dieActionStep already uses ('choose' -> a picker sub-step within the
// same panel) rather than a new pattern.
function riteChooseRemoveCard() {
  riteStep = 'remove_pick_card';
  refreshInspector();
}

// Removes the ownedCards[index] card permanently — the rite's actual
// commit point, exactly as riteChooseHeal()'s updatePlayer() call is.
// BUILD 089: ruling 7 (unique class cards cannot be discarded) governs the
// in-fight discard mechanic only — losing your class card mid-turn by
// accident. A rite's removal is a deliberate between-fights choice, so the
// class card is a valid index here like any other; no restriction check.
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
  closeRiteScreen();
  advanceRun();
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

    // BUILD 088: the full permanent collection, not the current fight's
    // draw pile — ownedCards is what actually persists, and a rite is only
    // ever reached from the map, between fights. Same per-card button
    // shape (name + cost, CARD_EFFECT_TEXT hover-tip) renderCardRewardPanel()
    // already builds — reused verbatim rather than inventing a new render.
    gameState.player.ownedCards.forEach(function(cardId, index) {
      const card = getCard(cardId);
      const btn = document.createElement('button');
      btn.textContent = card.name + ' (' + getCardCost(card) + ')';
      // BUILD 089: ruling 7 only protects the class card from the in-fight
      // discard mechanic — a rite's removal is a deliberate run-defining
      // choice, so every owned card, class card included, renders enabled.

      const tip = document.createElement('span');
      tip.className = 'hover-tip';
      tip.textContent = CARD_EFFECT_TEXT[cardId] || '';
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

// ---------- MAP SCREEN (BUILD 068, restyled BUILD 069) ----------
// Shown between slots (gameState.run.screen === 'map'). Renders both lanes
// full-length (completed ones marked, the current position marked, the
// next available choice(s) clickable, everything else inert) plus the
// boss node and its preview — die reused from the real enemy die
// structure, HP/intent band read from the boss slot's own static config,
// never gameState.enemy's live in-fight values — so the boss stays fully
// legible and unchanging from the very first map screen onward. BUILD 069
// is presentation only: every value read here (slot.completed, run.lane,
// run.currentSlot, the boss's static config) is exactly what BUILD 068
// already read — nothing new is computed, only how it's drawn changed.

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

// BUILD 076: wires dev-jump onto a node that isn't the real current/choice
// click target — every such node (already completed, not yet unlocked, or
// on the lane not committed to) becomes clickable for testing, styled with
// .map-node-dev-jump (added on top of whatever mapNodeStateClass() already
// gave it — the dotted --muted look takes visual priority, so a dev-jump
// node never reads as a genuine choice regardless of its underlying
// completed/inert state). Does nothing once the run is won or lost — same
// guard devJumpToSlot() itself checks, applied here too so the node isn't
// even rendered as clickable in that state.
function attachDevJumpIfEligible(node, laneName, index) {
  // BUILD 083: dev-jump is dev chrome that lives outside #devChrome and so
  // cannot be hidden with it — a closed dev chrome renders these nodes fully
  // disabled, the exact same way a won or lost run already does. One added
  // clause on the existing guard, not a second code path.
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
  // BUILD 125 (F31, checkpoint 2): act number shown on the map screen —
  // gameState.run.actNumber, set by startNewRun()/advanceRun()'s act
  // transition (run-and-map.js), never anything else.
  title.textContent = 'ACT ' + gameState.run.actNumber + ' MAP';
  container.appendChild(title);

  const composition = document.createElement('div');
  composition.className = 'map-composition';

  // START — a marker, not a clickable slot; reads 'current' until the
  // shared opening fight is done (this is where the player stands) and
  // 'completed' once it is (it's already behind them). BUILD 073: this
  // used to be keyed off run.lane (the fork); now it's keyed off the
  // opening fight, since that's the thing directly ahead of Start.
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

      // BUILD 073: the fork is only a real choice once the shared opening
      // fight is behind the player — otherwise run.lane === null would
      // read as "choose a lane" from the very first render, before the
      // opening fight has even happened.
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

  // BUILD 072: die preview row — the player's own current die alongside
  // the boss die, so the map reads as a comparison: the distribution being
  // built (left) against the distribution ahead (right). Boss half is
  // exactly what BUILD 068 showed (HP, intent band, the full die) —
  // nothing removed, only joined by a player half built the same way.
  // Both halves reuse renderDieList() verbatim — no third die renderer.
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

  // BUILD 098: the elite preview — same shape as the boss preview below,
  // reading the elite slot's own static enemy.die.faces (built once by
  // buildAct(), never mutated by a live fight) rather than gameState.enemy,
  // for the identical reason the boss preview already avoids gameState.enemy:
  // once a slot's die can differ from another's (elite: 2 poison faces,
  // boss: 3 poison faces + both Nats — BUILD 098), the single live
  // gameState.enemy.die only ever reflects whichever fight was most
  // recently entered, so a preview reading it would go stale/wrong the
  // moment the other slot's fight had ever been played. Found via .find()
  // on the upper lane rather than a hardcoded index — self-documenting,
  // and correct even if a future build moves the elite's position.
  const eliteSlot = gameState.run.act.upper.find(function(s) { return s.label === 'Elite'; });
  const eliteEnemy = eliteSlot.enemy;
  const elitePreview = document.createElement('div');
  elitePreview.id = 'elitePreview';
  elitePreview.innerHTML =
    '<div class="panel-title">ELITE PREVIEW</div>' +
    '<div>HP ' + eliteEnemy.hp + '</div>' +
    '<div>Intent ' + eliteEnemy.intentMin + '–' + eliteEnemy.intentMax + '</div>';
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
    '<div>Intent ' + bossEnemy.intentMin + '–' + bossEnemy.intentMax + '</div>';
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

  // Reuse the existing die renderer verbatim for all three — same rows/
  // columns/colours/hover-tips a real die gets. Must run after each
  // container is attached to the live document (renderDieList looks it up
  // by id). No forceRollFn (null) for any of them — all three are previews
  // here, not clickable dice. BUILD 098: the elite and boss halves now both
  // read their own slot's static die.faces (see the comment above
  // eliteSlot) instead of gameState.enemy.die.faces, which is what fixes
  // the staleness risk the moment two different slot types can carry
  // different dice.
  renderDieList('mapPlayerDieList', gameState.die.faces, null);
  // BUILD 139: same hover buffPoisonStacks arg the live enemy die passes —
  // each slot's own act-scaled amount (buildAct(), fixed at build time),
  // so the map preview's poison/Nat hover text names the real number too.
  renderDieList('eliteDiePreviewList', eliteEnemy.die.faces, null, null, eliteEnemy.buffPoisonStacks);
  renderDieList('bossDiePreviewList', bossEnemy.die.faces, null, null, bossEnemy.buffPoisonStacks);
}
