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
  artifactRewardStep = null;
  shopStep = null;
  shopRemovingCard = false;
  thirdEyeChoosing = false;
  gildedDieChoosing = false;
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

// Second Chance — one reroll a fight, taken before the roll resolves.
document.getElementById('secondChanceBtn').addEventListener('click', function() {
  log('[CLICK] Second Chance');
  secondChanceReroll();
  refreshInspector();
});

// Gilded Die — same face-choosing pattern Third Eye uses; the click on a
// face row pays the gold and weights that face for the coming roll.
document.getElementById('gildedDieBtn').addEventListener('click', function() {
  gildedDieChoosing = !gildedDieChoosing;
  log('[CLICK] Gilded Die' + (gildedDieChoosing ? ' — choose a face' : ' — cancelled'));
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

// D-98 — DIE/ARTIFACTS/CARDS info layers. Same buttons on the top bar
// work from the map screen and the fight screen alike.
document.getElementById('dieInfoBtn').addEventListener('click', function() {
  log('[CLICK] DIE info');
  updateUi({ dieInfoOpen: true });
});
document.getElementById('dieInfoCloseBtn').addEventListener('click', function() {
  updateUi({ dieInfoOpen: false });
});
document.getElementById('artifactsInfoBtn').addEventListener('click', function() {
  log('[CLICK] ARTIFACTS info');
  updateUi({ artifactsInfoOpen: true });
});
document.getElementById('artifactsInfoCloseBtn').addEventListener('click', function() {
  updateUi({ artifactsInfoOpen: false });
});
document.getElementById('cardsInfoBtn').addEventListener('click', function() {
  log('[CLICK] CARDS info');
  updateUi({ cardsInfoOpen: true });
});
document.getElementById('cardsInfoCloseBtn').addEventListener('click', function() {
  updateUi({ cardsInfoOpen: false });
});
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  if (gameState.ui.dieInfoOpen || gameState.ui.artifactsInfoOpen || gameState.ui.cardsInfoOpen) {
    updateUi({ dieInfoOpen: false, artifactsInfoOpen: false, cardsInfoOpen: false });
  }
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

document.getElementById('devModSelect').addEventListener('change', renderDevModDescription);

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

// Mutes only rolling, landing, blank and trigger (ROLL_SOUND_EVENTS).
document.getElementById('devMuteRollSoundsCheckbox').addEventListener('change', function() {
  rollSoundsMuted = this.checked;
  log('[DEV] roll sounds muted: ' + (rollSoundsMuted ? 'on' : 'off'));
});

// An AudioContext built before any user gesture starts 'suspended' per
// browser autoplay policy; { once: true } resumes it on the page's first
// pointerdown, wherever it lands.
document.addEventListener('pointerdown', unlockAudioOnce, { once: true });

// KI-46: a hover box that opens is kept inside the window. Once now, once
// on the next frame, in case :hover lands after the event.
document.addEventListener('mouseover', function() {
  clampHoverTips();
  requestAnimationFrame(clampHoverTips);
});

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
