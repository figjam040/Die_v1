// Every addEventListener wiring block, plus the single kickoff:
// window.addEventListener('DOMContentLoaded', init) — the one and only
// eager trigger in the whole codebase.

// Permadeath, so a native confirm() gates New Run while the run is
// still 'active'; after a win or loss there's nothing left to lose.
document.getElementById('startGameBtn').addEventListener('click', function() {
  if (gameState.run.outcome === 'active' && !confirm('Abandon this run and start a new one?')) {
    log('[CLICK] New Run — cancelled at confirm');
    return;
  }
  log('[CLICK] New Run');
  // These three flow variables live outside gameState, so nothing else
  // clears them, and a stale panel would otherwise stay rendered.
  riteStep = null;
  dieActionStep = null;
  cardRewardStep = null;
  relicRewardStep = null;
  shopStep = null;
  shopRemovingCard = false;
  thirdEyeChoosing = false;
  flushRunRecord('abandoned');
  startNewRun();
});

// Third Eye — toggles face-choosing mode; a face-btn click on the real
// player die (renderDieList()) while this is on calls thirdEyeChooseFace().
document.getElementById('thirdEyeBtn').addEventListener('click', function() {
  thirdEyeChoosing = !thirdEyeChoosing;
  log('[CLICK] Third Eye' + (thirdEyeChoosing ? ' — choose a face' : ' — cancelled'));
  refreshInspector();
});

// DEV ONLY — "Restart Fight". Never player-facing: must not undo a loss.
document.getElementById('devRestartFightBtn').addEventListener('click', function() {
  if (gameState.run.status !== 'active' || gameState.run.outcome !== 'active') { return; }
  log('[CLICK] Restart Fight (dev)');
  resetFight();
  startFreshTurnPaused();
});

document.getElementById('endTurnBtn').addEventListener('click', function() {
  log('[CLICK] End Turn');
  playAudioEvent('end_turn');
  autoAdvance();
});

// DEV ONLY — single-step phase control.
document.getElementById('devNextPhaseBtn').addEventListener('click', function() {
  log('[CLICK] Next Phase (dev)');
  nextPhase();
});

// DEV ONLY — resumes into ROLL_PHASE via autoAdvance(), not nextPhase(),
// so the normal force-roll pause and timeout still arm.
document.getElementById('devBeginRollBtn').addEventListener('click', function() {
  log('[CLICK] Begin Roll (dev)');
  autoAdvance();
});

// DEV ONLY — jumps to the die action screen through the real
// openDieActionScreen() path, without a fight actually being won.
document.getElementById('devSkipToDieActionBtn').addEventListener('click', function() {
  if (gameState.run.status !== 'active' || gameState.run.outcome !== 'active') { return; }
  log('[DEV] skip to die action');
  dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
  openDieActionScreen();
});

// DEV ONLY — jumps to the card reward screen through the real
// openCardRewardScreen() path.
document.getElementById('devSkipToCardRewardBtn').addEventListener('click', function() {
  log('[DEV] skip to card reward');
  openCardRewardScreen();
});

// DEV ONLY — the master toggle; also sets devChromeOpen, read by the two
// out-of-container dev inputs.
document.getElementById('devChromeToggleBtn').addEventListener('click', function() {
  log('[CLICK] Dev Tools');
  const chromeEl = document.getElementById('devChrome');
  const toggleBtn = document.getElementById('devChromeToggleBtn');
  devChromeOpen = chromeEl.classList.toggle('expanded');
  toggleBtn.textContent = devChromeOpen ? 'Dev Tools ▾' : 'Dev Tools ▸';
  refreshInspector();
});

// Player-facing display toggle for the log panel; gameState.ui.logOpen is
// a display flag only, never part of the run record.
document.getElementById('logToggleBtn').addEventListener('click', function() {
  log('[CLICK] LOG toggle');
  updateUi({ logOpen: !gameState.ui.logOpen });
});

// Player-facing Play/All filter; gameState.ui.logView is a display flag
// only, never part of the run record — every line still writes to the DOM.
document.getElementById('logViewToggleBtn').addEventListener('click', function() {
  log('[CLICK] LOG view toggle');
  updateUi({ logView: gameState.ui.logView === 'all' ? 'play' : 'all' });
});

document.getElementById('logCloseBtn').addEventListener('click', function() {
  log('[CLICK] LOG close');
  updateUi({ logOpen: false });
});

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

document.getElementById('registryInspectorToggleBtn').addEventListener('click', function() {
  log('[CLICK] Listener Registry');
  const contentEl = document.getElementById('registryInspectorContent');
  const toggleBtn = document.getElementById('registryInspectorToggleBtn');
  const expanded = contentEl.classList.toggle('expanded');
  toggleBtn.textContent = expanded ? 'Listener Registry ▾' : 'Listener Registry ▸';
});

document.getElementById('devLoadModBtn').addEventListener('click', function() {
  log('[CLICK] Load Mod');
  devLoadMod();
});

document.getElementById('devClearFaceBtn').addEventListener('click', function() {
  log('[CLICK] Clear Face');
  devClearFace();
});

document.getElementById('devLoadAllBtn').addEventListener('click', function() {
  log('[CLICK] Load All');
  devLoadAll();
});

document.getElementById('devApplyPoisonBtn').addEventListener('click', function() {
  log('[CLICK] Apply Poison');
  devApplyPoison();
});

// DEV ONLY — builds the intent spec from whichever input group matches
// #devIntentKindSelect's current value.
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

// DEV ONLY
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

document.getElementById('devMuteAudioCheckbox').addEventListener('change', function() {
  audioMuted = this.checked;
  log('[DEV] audio muted: ' + (audioMuted ? 'on' : 'off'));
});

// An AudioContext built before any user gesture starts 'suspended' per
// browser autoplay policy; { once: true } resumes it on the page's first
// pointerdown, wherever it lands.
document.addEventListener('pointerdown', unlockAudioOnce, { once: true });

// Run record — player-facing, not a dev tool (see RUN RECORD, CLAUDE.md).
document.getElementById('copyRunRecordBtn').addEventListener('click', function() {
  log('[CLICK] Copy Run Record');
  const text = collectAllRunRecordLines();
  if (text === null) {
    log('[RUN RECORD] nothing stored yet — nothing copied');
    return;
  }
  const transcriptLines = gameState.run.transcript;
  const fullText = text + '\n\nTRANSCRIPT\n' + transcriptLines.join('\n');
  copyTextToClipboard(fullText);
  const recordLineCount = text.split('\n').length - 1;
  log('[RUN RECORD] copied ' + recordLineCount + ' record line(s) and ' + transcriptLines.length + ' transcript line(s)');
});

window.addEventListener('beforeunload', function() {
  flushRunRecord('abandoned');
});

window.addEventListener('DOMContentLoaded', init);
