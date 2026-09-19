// ============================================================
// DEV-TOOLS.JS — BUILD 090 file split
// devChromeOpen/devPauseBeforeFirstRoll, force-roll, the dev mod loader,
// and the dev poison applier. Every function here is DEV ONLY — remove
// this whole file before any real release, exactly as each section's own
// original comment already said. Depends on state.js (gameState,
// updateDie/updatePlayer/updateEnemy), pipeline.js (resolvePlayerRoll/
// resolveEnemyRoll), and phase-machine.js (playerRollResolved/
// enemyRollResolved — read and written here, and also by phase-machine.js
// itself; genuinely shared between the two, not owned exclusively by
// either). rendering.js's renderDieList()/attachDevJumpIfEligible() read
// devChromeOpen — a forward reference from a file loaded earlier, safe per
// state.js's header note.
// ============================================================

// ---------- DEV ONLY — DEV CHROME VISIBILITY (BUILD 083) ----------
// Two flags, both off on every page load, both owned exclusively by the two
// controls in #devChrome. Remove this whole section before any real release.
//
// devChromeOpen mirrors the .expanded class on #devChrome. The container's
// own contents are hidden by CSS when it is closed, so this flag exists only
// for the two dev inputs that live OUTSIDE that container and therefore
// cannot be hidden with it: the force-roll click on the twenty die face rows
// (renderDieList()/forcePlayerRoll()) and the BUILD 076 map dev-jump nodes
// (attachDevJumpIfEligible()). Both read this flag and go inert when closed.
let devChromeOpen = false;

// devPauseBeforeFirstRoll gates the BUILD 036/037 setup pause. Unchecked (the
// default) a fight proceeds from START_OF_TURN into ROLL_PHASE with no click;
// checked restores BUILD 037 exactly. Read in one place only —
// startFreshTurnPaused(), still the single shared entry path.
let devPauseBeforeFirstRoll = false;

// ---------- DEV ONLY — FORCE ROLL ----------
// Testing tool. Lets the twenty face buttons force that face as the roll
// result for the current ROLL_PHASE / ENEMY_ROLL_PHASE, running through the
// exact same resolvePlayerRoll/resolveEnemyRoll code path a natural roll
// uses. Remove this whole section before any real release.

function forcePlayerRoll(faceNumber) {
  // BUILD 083: force-roll is dev chrome that lives outside #devChrome and so
  // cannot be hidden with it — it goes inert instead whenever the dev chrome
  // is closed. renderDieList() already skips wiring the click; this guard
  // covers every other way in (console, a future dev-tool tweak).
  if (!devChromeOpen) { return; }
  if (gameState.turn.phase !== 'ROLL_PHASE') {
    log('[DEV] cannot force roll outside ROLL_PHASE');
    return;
  }
  if (playerRollResolved) { return; }
  playerRollResolved = true;
  const face = gameState.die.faces[faceNumber - 1];
  log('[DEV] forced roll: face ' + faceNumber);
  resolvePlayerRoll(face);
}

function forceEnemyRoll(faceNumber) {
  // BUILD 083: same closed-dev-chrome guard as forcePlayerRoll() above.
  if (!devChromeOpen) { return; }
  if (gameState.turn.phase !== 'ENEMY_ROLL_PHASE') {
    log('[DEV] cannot force roll outside ENEMY_ROLL_PHASE');
    return;
  }
  // BUILD 075: no die panel is rendered for a dieless enemy, so this
  // can't be reached via a real click — this guard only matters if it's
  // ever called some other way (console, a future dev-tool tweak).
  if (!gameState.enemy.hasDie) { return; }
  if (enemyRollResolved) { return; }
  enemyRollResolved = true;
  const face = gameState.enemy.die.faces[faceNumber - 1];
  log('[DEV] forced roll: face ' + faceNumber);
  resolveEnemyRoll(face);
}

// ---------- DEV ONLY — LOAD MOD ----------
// Testing tool. Loads/clears any config.mods entry onto a player die face at
// runtime, through the same updateDie() helper init() uses, so a loaded mod
// behaves identically to one placed at init (same MOD_TRIGGER dispatch, same
// listener registration on trigger). Faces 1 and 20 are NAT_ONE/NAT_TWENTY
// and cannot change, per the die face law — refused here too.
// Remove this whole section before any real release.

function renderDevModOptions() {
  const select = document.getElementById('devModSelect');
  if (!select) return;
  select.innerHTML = '';
  Object.keys(gameState.config.mods).forEach(function(modId) {
    const option = document.createElement('option');
    option.value = modId;
    option.textContent = gameState.config.mods[modId].name;
    select.appendChild(option);
  });
}

// BUILD 115: caps at two mods per face, never three. If the face is blank,
// this fills modId (unchanged from before). If modId is already set and
// modId2 is still empty, this fills modId2 instead of overwriting modId —
// the dev-tool mirror of the real Load flow's "second mod onto an
// already-loaded face" case. If both slots are full, refuses and logs why;
// no write happens.
function devLoadMod() {
  const modId = document.getElementById('devModSelect').value;
  const faceNumber = parseInt(document.getElementById('devFaceInput').value, 10);
  if (!modId || !gameState.config.mods[modId]) return;
  if (!(faceNumber >= 2 && faceNumber <= GAME_CONFIG.DIE_SIZE.PLAYER - 1)) {
    log('[DEV] cannot modify face 1 or face 20 (NAT faces)');
    return;
  }
  const newFaces = gameState.die.faces.slice();
  const face = newFaces[faceNumber - 1];
  if (face.modId === null) {
    newFaces[faceNumber - 1] = Object.assign({}, face, { modId: modId });
    updateDie({ faces: newFaces });
    log('[DEV] loaded ' + gameState.config.mods[modId].name + ' onto face ' + faceNumber);
  } else if (!face.modId2) {
    newFaces[faceNumber - 1] = Object.assign({}, face, { modId2: modId });
    updateDie({ faces: newFaces });
    log('[DEV] loaded ' + gameState.config.mods[modId].name + ' onto face ' + faceNumber + ' as a second mod');
  } else {
    log('[DEV] face ' + faceNumber + ' already holds two mods, refused');
  }
}

// BUILD 118: fills every available slot on the player die with whichever
// mod #devModSelect currently has selected — a dev-only stress tool built
// specifically to reach the "same mod on many faces" die shape the KI-19
// fix (collectTriggerCountsByMod(), run-and-map.js) needs to be tested
// against, since the real in-game Load flow never produces that shape
// (DIE_ACTION_EXCLUDED_MOD_IDS + the "already on the die" check refuse a
// mod that's already loaded anywhere) but this dev tool deliberately does
// not enforce that. Same face-1/face-20 exclusion as devLoadMod() above.
// A dev action, not a player one: never touches gameState.runRecord (no
// updateRunRecord call anywhere in this function), so it never counts
// toward the run the way a real Load does. Blank face -> fills modId
// (first slot). Already-one-mod face -> fills modId2 (second slot).
// Already-two-mod face -> skipped, no write. Logs "dev-load", never
// "load", per the prompt's own instruction, and reports how many faces
// were filled and how many were skipped; if nothing was available to fill
// it says so and writes nothing at all.
function devLoadAll() {
  const modId = document.getElementById('devModSelect').value;
  if (!modId || !gameState.config.mods[modId]) return;
  const newFaces = gameState.die.faces.slice();
  let filled = 0;
  let skipped = 0;
  for (let faceNumber = 2; faceNumber <= GAME_CONFIG.DIE_SIZE.PLAYER - 1; faceNumber++) {
    const face = newFaces[faceNumber - 1];
    if (face.modId === null) {
      newFaces[faceNumber - 1] = Object.assign({}, face, { modId: modId });
      filled++;
    } else if (!face.modId2) {
      newFaces[faceNumber - 1] = Object.assign({}, face, { modId2: modId });
      filled++;
    } else {
      skipped++;
    }
  }
  if (filled === 0) {
    log('[DEV] dev-load all: nothing available to fill (' + skipped + ' face(s) already holding two mods)');
    return;
  }
  updateDie({ faces: newFaces });
  log('[DEV] dev-load all: ' + gameState.config.mods[modId].name + ' filled onto ' + filled + ' face(s), ' + skipped + ' face(s) skipped (already holding two mods)');
}

function devClearFace() {
  const faceNumber = parseInt(document.getElementById('devFaceInput').value, 10);
  if (!(faceNumber >= 2 && faceNumber <= GAME_CONFIG.DIE_SIZE.PLAYER - 1)) {
    log('[DEV] cannot modify face 1 or face 20 (NAT faces)');
    return;
  }
  const newFaces = gameState.die.faces.slice();
  newFaces[faceNumber - 1] = Object.assign({}, newFaces[faceNumber - 1], { modId: null, modId2: null });
  updateDie({ faces: newFaces });
  log('[DEV] cleared face ' + faceNumber);
}

// ---------- DEV ONLY — APPLY POISON ----------
// Testing tool. Applies N poison stacks to either combatant through the
// same state helper every other mutation of that combatant already uses
// (updateEnemy()/updatePlayer()), so the START_OF_TURN poison tick can be
// exercised before any mod actually applies poison. Enemy path is
// byte-for-byte the same as before the target selector was added.
// Remove this whole section before any real release.

function devApplyPoison() {
  const amount = parseInt(document.getElementById('devPoisonInput').value, 10);
  if (!amount || amount <= 0) return;
  // DEV ONLY
  const target = document.getElementById('devPoisonTargetSelect').value;
  if (target === 'player') {
    // DEV ONLY
    updatePlayer({ poisonStacks: gameState.player.poisonStacks + amount });
    log('[DEV] applied ' + amount + ' poison to player');
  } else {
    updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + amount });
    log('[DEV] applied ' + amount + ' poison to enemy');
  }
}
