// ============================================================
// BOOTSTRAP.JS — BUILD 090 file split
// Every addEventListener wiring block, plus the single kickoff:
// window.addEventListener('DOMContentLoaded', init). Loaded last on
// purpose — not because it's technically required (every callback body
// here only runs later, at click time, by which point all 8 other files
// have already executed regardless of order — see state.js's header
// comment), but because this file IS the app's entry point and reads
// clearest sitting after everything it wires up. This is also the single
// place that proves the whole split is safe: init() is never called
// immediately — it is registered here as a DOMContentLoaded callback, the
// one and only eager trigger in the entire codebase. Every other
// cross-file reference in every other file is a function-body reference
// that resolves no earlier than this callback firing, after the browser
// has finished loading and executing every <script src> tag on the page.
// ============================================================

// BUILD 068: #startGameBtn is now the player-facing "New Run" — the only
// player-facing way to recover from a run-ending win or loss (or to
// abandon an in-progress run). The old single-fight "Restart Fight"
// behaviour moved to #devRestartFightBtn below, dev-only.
// BUILD 087: New Run discards a live run permanently (permadeath), so a
// misclick mid-run is unrecoverable. A native confirm() — the smallest
// possible extra step — now gates the reset whenever run.outcome is
// still 'active'; after a win or loss there's nothing left to lose,
// so it proceeds immediately exactly as before.
document.getElementById('startGameBtn').addEventListener('click', function() {
  if (gameState.run.outcome === 'active' && !confirm('Abandon this run and start a new one?')) {
    log('[CLICK] New Run — cancelled at confirm');
    return;
  }
  log('[CLICK] New Run');
  // BUILD 136: dismiss whatever transient panel (rite choice, die action,
  // card reward) is open before starting over — same module-level reset
  // devJumpToSlot() already applies (BUILD 078, run-and-map.js) for the
  // identical reason: these three flow variables live outside gameState,
  // so nothing else clears them, and refreshInspector() renders purely off
  // them regardless of run.screen/run.status. Without this, New Run's own
  // disabled gate (refreshInspector(), rendering.js) used to just refuse to
  // fire at all while a fight-won panel was open; now it always fires, and
  // this line stops the stale panel it would otherwise leave rendered.
  riteStep = null;
  dieActionStep = null;
  cardRewardStep = null;
  // BUILD 109: run record — a run ended by winning/losing has already been
  // flushed (phase-machine.js's win/loss branches), and flushRunRecord()'s
  // own flushed/started guards make this a no-op in that case. This is the
  // one place a run ended by walking away mid-run gets caught: the node
  // reached and every offer/pick/skip recorded so far are kept, the
  // outcome is 'abandoned', and only then does startNewRun() (which resets
  // the record for the run about to begin) run.
  flushRunRecord('abandoned');
  startNewRun();
});

// DEV ONLY — the pre-BUILD-068 "Restart Fight" behaviour, kept for testing
// a single fight in isolation. Never player-facing (see controls-row
// above, and the STAGE 2.0 prompt's explicit instruction that this must
// not be a way to undo a loss).
document.getElementById('devRestartFightBtn').addEventListener('click', function() {
  // BUILD 077: same run-outcome guard BUILD 076 gave Skip to Die Action —
  // without it, Restart Fight could reset a boss fight to full HP after
  // the run had already been won.
  if (gameState.run.status !== 'active' || gameState.run.outcome !== 'active') { return; }
  log('[CLICK] Restart Fight (dev)');
  resetFight();
  startFreshTurnPaused();
});

document.getElementById('endTurnBtn').addEventListener('click', function() {
  log('[CLICK] End Turn');
  // BUILD 094: the actual player action of ending a turn — this click
  // handler is that event, once per turn, so it's the correct place to
  // announce it rather than any of the several phases autoAdvance() goes
  // on to run through.
  playAudioEvent('end_turn');
  autoAdvance();
});

// DEV ONLY — single-step phase control. Remove before any real release.
document.getElementById('devNextPhaseBtn').addEventListener('click', function() {
  log('[CLICK] Next Phase (dev)');
  nextPhase();
});

// DEV ONLY — proceeds from the post-Restart-Fight START_OF_TURN pause into
// ROLL_PHASE. Calls autoAdvance() (not nextPhase()) so the normal
// ROLL_PHASE force-roll pause and its timeout still apply exactly as they
// do on every other turn — nextPhase() alone would move the phase but never
// arm that pause. Only meaningful right after Restart Fight, so it's gated
// to START_OF_TURN the same way endTurnBtn is gated to CARD_PHASE. Remove
// before any real release.
document.getElementById('devBeginRollBtn').addEventListener('click', function() {
  log('[CLICK] Begin Roll (dev)');
  autoAdvance();
});

// DEV ONLY — jumps straight to the Load/Strengthen/Skip die action screen
// without requiring a fight to actually be won, using the exact same
// openDieActionScreen()/renderDieActionPanel() path the real victory
// trigger in runPhase() uses — so this exercises the real flow, not a
// separate copy of it. Does not touch run.status. Remove before any real
// release.
document.getElementById('devSkipToDieActionBtn').addEventListener('click', function() {
  // BUILD 076: closes the BUILD 074-found gap — this used to fire with no
  // run.status/outcome check at all, which is what produced the phantom
  // "Choose a blank face" panel seen at −10 HP with the run already lost.
  if (gameState.run.status !== 'active' || gameState.run.outcome !== 'active') { return; }
  log('[DEV] skip to die action');
  // BUILD 082: explicit single action — a stale 2 left over from a prior
  // elite win must never leak into this dev shortcut's own panel.
  dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
  openDieActionScreen();
});

// DEV ONLY — jumps straight to the card reward screen without requiring a
// fight to actually be won or the die action panel to be resolved first,
// using the exact same openCardRewardScreen()/renderCardRewardPanel() path
// the real chain (die action screen resolving, via closeDieActionScreen())
// uses — so this exercises the real flow, not a separate copy of it. Does
// not touch run.status. Remove before any real release.
document.getElementById('devSkipToCardRewardBtn').addEventListener('click', function() {
  log('[DEV] skip to card reward');
  openCardRewardScreen();
});

// DEV ONLY — BUILD 083: the master dev-chrome toggle. Structurally the same
// three lines as the State Inspector toggle below (toggle .expanded on the
// container, retitle the button) — the same pattern, not a second one — plus
// the devChromeOpen flag the two out-of-container dev inputs read, and one
// refreshInspector() so the die rows and the map nodes re-render with their
// dev wiring attached or removed. Remove before any real release.
document.getElementById('devChromeToggleBtn').addEventListener('click', function() {
  log('[CLICK] Dev Tools');
  const chromeEl = document.getElementById('devChrome');
  const toggleBtn = document.getElementById('devChromeToggleBtn');
  devChromeOpen = chromeEl.classList.toggle('expanded');
  toggleBtn.textContent = devChromeOpen ? 'Dev Tools ▾' : 'Dev Tools ▸';
  refreshInspector();
});

// DEV ONLY — BUILD 083: the only writer of devPauseBeforeFirstRoll. Read in
// exactly one place, startFreshTurnPaused(). Remove before any real release.
document.getElementById('devPauseBeforeRollCheckbox').addEventListener('change', function() {
  devPauseBeforeFirstRoll = this.checked;
  log('[DEV] pause before first roll: ' + (devPauseBeforeFirstRoll ? 'on' : 'off'));
});

document.getElementById('inspectorToggleBtn').addEventListener('click', function() {
  log('[CLICK] State Inspector');
  const contentEl = document.getElementById('inspectorContent');
  const toggleBtn = document.getElementById('inspectorToggleBtn');
  const expanded = contentEl.classList.toggle('expanded');
  toggleBtn.textContent = expanded ? 'State Inspector ▾' : 'State Inspector ▸';
});

// DEV ONLY — BUILD 112 (KI-3/REG-E2). Same toggle shape as the State
// Inspector above — one class, one button, no second mechanism. Remove
// before any real release.
document.getElementById('registryInspectorToggleBtn').addEventListener('click', function() {
  log('[CLICK] Listener Registry');
  const contentEl = document.getElementById('registryInspectorContent');
  const toggleBtn = document.getElementById('registryInspectorToggleBtn');
  const expanded = contentEl.classList.toggle('expanded');
  toggleBtn.textContent = expanded ? 'Listener Registry ▾' : 'Listener Registry ▸';
});

// DEV ONLY — remove before any real release
document.getElementById('devLoadModBtn').addEventListener('click', function() {
  log('[CLICK] Load Mod');
  devLoadMod();
});

document.getElementById('devClearFaceBtn').addEventListener('click', function() {
  log('[CLICK] Clear Face');
  devClearFace();
});

// DEV ONLY — remove before any real release
document.getElementById('devLoadAllBtn').addEventListener('click', function() {
  log('[CLICK] Load All');
  devLoadAll();
});

// DEV ONLY — remove before any real release
document.getElementById('devApplyPoisonBtn').addEventListener('click', function() {
  log('[CLICK] Apply Poison');
  devApplyPoison();
});

// DEV ONLY — remove before any real release. BUILD 141 (item B): Set Next
// Intent — builds the one intent spec devSetNextIntent() (dev-tools.js)
// expects from whichever of the three kind-specific input groups is
// relevant to #devIntentKindSelect's current value; the other two groups'
// inputs are simply ignored, not hidden (kept plain per the BUILD 143 UI
// pass note).
document.getElementById('devSetIntentBtn').addEventListener('click', function() {
  log('[CLICK] Set Next Intent');
  const kind = document.getElementById('devIntentKindSelect').value;
  let intent;
  if (kind === 'attack') {
    intent = { kind: 'attack', min: parseInt(document.getElementById('devIntentMinInput').value, 10), max: parseInt(document.getElementById('devIntentMaxInput').value, 10) };
  } else if (kind === 'charge') {
    intent = { kind: 'charge', release: parseInt(document.getElementById('devIntentReleaseInput').value, 10), breakAt: parseInt(document.getElementById('devIntentBreakInput').value, 10) };
  } else {
    intent = { kind: 'afflict', stacks: parseInt(document.getElementById('devIntentStacksInput').value, 10) };
  }
  devSetNextIntent(intent);
});

// DEV ONLY — remove before any real release. BUILD 141 (item C): Test Die —
// populates #devTestDieSizeSelect from GAME_CONFIG.DEV_TEST_DIE_SIZES once
// at load (mirrors renderDevModOptions()'s own populate-once shape), then
// gives the current enemy a die of the chosen size with the chosen buff on
// every face, for this fight only (devSetTestDie(), dev-tools.js).
(function populateDevTestDieSizes() {
  const select = document.getElementById('devTestDieSizeSelect');
  GAME_CONFIG.DEV_TEST_DIE_SIZES.forEach(function(size) {
    const option = document.createElement('option');
    option.value = size;
    option.textContent = size;
    select.appendChild(option);
  });
})();

document.getElementById('devSetTestDieBtn').addEventListener('click', function() {
  log('[CLICK] Set Test Die');
  const size = parseInt(document.getElementById('devTestDieSizeSelect').value, 10);
  const buffId = document.getElementById('devTestDieBuffSelect').value;
  devSetTestDie(size, buffId);
});

// BUILD 093: mute toggle for the synthesised roll sounds (js/audio.js).
// Default unmuted — the checkbox starts unchecked in the markup and
// audioMuted starts false in audio.js; this is the only writer of either.
// DEV ONLY — remove before any real release.
document.getElementById('devMuteAudioCheckbox').addEventListener('change', function() {
  audioMuted = this.checked;
  log('[DEV] audio muted: ' + (audioMuted ? 'on' : 'off'));
});

// BUILD 093: the one-time audio unlock. An AudioContext built before any
// user gesture starts 'suspended' per browser autoplay policy; { once:
// true } resumes it on the page's very first pointerdown and then removes
// itself, exactly the "once, then never again" the prompt asks for — no
// manual flag needed. Attached at document level (not any one button) so
// whatever the player clicks first — a map node, the dev chrome toggle,
// anything — is what unlocks it, always before the first real roll can
// happen (a fight can only be entered by clicking into one).
document.addEventListener('pointerdown', unlockAudioOnce, { once: true });

// BUILD 109: run record — player-facing, not a dev tool (see RUN RECORD,
// CLAUDE.md). Dumps every line ever flushed to localStorage this browser
// profile (every run, not just the current one) to the clipboard.
document.getElementById('copyRunRecordBtn').addEventListener('click', function() {
  log('[CLICK] Copy Run Record');
  const text = collectAllRunRecordLines();
  if (text === null) {
    log('[RUN RECORD] nothing stored yet — nothing copied');
    return;
  }
  copyTextToClipboard(text);
  log('[RUN RECORD] copied ' + (text.split('\n').length - 1) + ' line(s) to clipboard');
});

// BUILD 109: a closed tab is caught the same way a New Run click is —
// flushRunRecord()'s own flushed/started guards make this a safe no-op for
// a run that already ended (won/lost) or never began.
window.addEventListener('beforeunload', function() {
  flushRunRecord('abandoned');
});

window.addEventListener('DOMContentLoaded', init);
