// Every function in this file is DEV ONLY — remove this whole file before
// any real release.

// Mirrors the .expanded class on #devChrome; only needed for the two dev
// inputs outside that container (force-roll clicks, map dev-jump nodes),
// which go inert when this is closed since CSS can't hide them.
let devChromeOpen = false;

let devPauseBeforeFirstRoll = false;

// ---------- DEV ONLY — FORCE ROLL ----------

function forcePlayerRoll(faceNumber) {
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
  if (!devChromeOpen) { return; }
  if (gameState.turn.phase !== 'ENEMY_ROLL_PHASE') {
    log('[DEV] cannot force roll outside ENEMY_ROLL_PHASE');
    return;
  }
  if (!gameState.enemy.hasDie) { return; }
  if (enemyRollResolved) { return; }
  enemyRollResolved = true;
  const face = gameState.enemy.die.faces[faceNumber - 1];
  log('[DEV] forced roll: face ' + faceNumber);
  resolveEnemyRoll(face);
}

// ---------- DEV ONLY — LOAD MOD ----------
// Faces 1 and 20 are NAT_ONE/NAT_TWENTY and cannot change — refused here too.

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

// Caps at two mods per face: fills modId if blank, else modId2, else refuses.
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

// Fills every available slot with the selected mod — deliberately produces
// the "same mod on many faces" shape the real Load flow never allows.
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

// ---------- DEV ONLY — SET NEXT INTENT ----------
// Replaces the NEXT round's intent exactly once; advanceEnemyIntentForRound()
// (pipeline.js) reads this first, if set, then clears it. intent is one of:
//   { kind: 'attack', min, max }
//   { kind: 'charge', release, breakAt }
//   { kind: 'afflict', stacks }
function devSetNextIntent(intent) {
  if (!intent || !intent.kind) return;
  updateEnemy({ forcedNextIntent: intent });
  log('[DEV] next intent forced: ' + JSON.stringify(intent));
}

// Gives the current enemy a die of the given size, buffId on every face,
// for this fight only — not written onto the entering slot's own config.
function devSetTestDie(size, buffId) {
  const faces = [];
  for (let n = 1; n <= size; n++) {
    faces.push({ number: n, modId: buffId, modId2: null, weight: 1 });
  }
  updateEnemy({ hasDie: true, die: { faces: faces } });
  log('[DEV] test die: ' + size + '-face, ' + buffId + ' on every face');
}

function devApplyPoison() {
  const amount = parseInt(document.getElementById('devPoisonInput').value, 10);
  if (!amount || amount <= 0) return;
  const target = document.getElementById('devPoisonTargetSelect').value;
  if (target === 'player') {
    updatePlayer({ poisonStacks: gameState.player.poisonStacks + amount });
    log('[DEV] applied ' + amount + ' poison to player');
  } else {
    updateEnemy({ poisonStacks: gameState.enemy.poisonStacks + amount });
    log('[DEV] applied ' + amount + ' poison to enemy');
  }
}
