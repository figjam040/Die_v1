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
  const face = getPlayerFace(faceNumber);
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
  renderDevModDescription();
}

// The selected mod's MOD_DESCRIPTION, beside the dropdown.
function renderDevModDescription() {
  const select = document.getElementById('devModSelect');
  const span = document.getElementById('devModDescription');
  if (!select || !span) return;
  span.textContent = MOD_DESCRIPTION[select.value] || '';
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
  const index = playerFaceIndex(faceNumber);
  if (index === -1) {
    log('[DEV] face ' + faceNumber + ' was removed, refused');
    return;
  }
  const newFaces = gameState.die.faces.slice();
  const face = newFaces[index];
  if (face.modId === null) {
    newFaces[index] = Object.assign({}, face, { modId: modId });
    updateDie({ faces: newFaces });
    log('[DEV] loaded ' + gameState.config.mods[modId].name + ' onto face ' + faceNumber);
  } else if (!face.modId2) {
    newFaces[index] = Object.assign({}, face, { modId2: modId });
    updateDie({ faces: newFaces });
    log('[DEV] loaded ' + gameState.config.mods[modId].name + ' onto face ' + faceNumber + ' as a second mod');
  } else {
    log('[DEV] face ' + faceNumber + ' already holds two mods, refused');
  }
}

// Fills every open slot on faces 2-19 with the selected mod, the anchor
// face 10 excepted — deliberately produces the "same mod on many faces"
// shape the real Load flow never allows. Never touches the run record.
function devLoadAll() {
  const modId = document.getElementById('devModSelect').value;
  if (!modId || !gameState.config.mods[modId]) return;
  const newFaces = gameState.die.faces.slice();
  let filled = 0;
  let skipped = 0;
  for (let index = 0; index < newFaces.length; index++) {
    const face = newFaces[index];
    if (face.number === 1 || face.number === 10 || face.number === GAME_CONFIG.DIE_SIZE.PLAYER) continue;
    if (face.modId === null) {
      newFaces[index] = Object.assign({}, face, { modId: modId });
      filled++;
    } else if (!face.modId2) {
      newFaces[index] = Object.assign({}, face, { modId2: modId });
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
  const index = playerFaceIndex(faceNumber);
  if (index === -1) {
    log('[DEV] face ' + faceNumber + ' was removed, refused');
    return;
  }
  const newFaces = gameState.die.faces.slice();
  newFaces[index] = Object.assign({}, newFaces[index], { modId: null, modId2: null });
  updateDie({ faces: newFaces });
  log('[DEV] cleared face ' + faceNumber);
}

// ---------- DEV ONLY — REWARD SHORTCUT, ADD/REMOVE CARD ----------
// None of these writes the run record, the transcript or gold: a dev
// shortcut never counts toward the run.

// Ends the fight as a win and opens the artifact offer; closing it walks
// the same die action and card reward a real win does.
function devSkipToArtifactReward() {
  if (gameState.run.status !== 'active' || gameState.run.outcome !== 'active') { return; }
  log('[DEV] skip to artifact reward');
  updateEnemy({ hp: 0 });
  updateRun({ status: 'win' });
  dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
  openArtifactRewardScreen();
}

function devAddCard(cardId) {
  if (!cardId || !gameState.config.cards[cardId]) return;
  updatePlayer({
    deck: gameState.player.deck.concat([cardId]),
    ownedCards: gameState.player.ownedCards.concat([cardId])
  });
  log('[DEV] added ' + getCard(cardId).name + ' to the deck, ' + gameState.player.ownedCards.length + ' cards owned');
}

// Removes the owned copy at index, and one copy of it from whichever pile
// (draw, hand, discard) holds one.
function devRemoveCard(index) {
  const cardId = gameState.player.ownedCards[index];
  if (cardId === undefined) return;
  const owned = gameState.player.ownedCards.slice();
  owned.splice(index, 1);
  const changes = { ownedCards: owned };
  ['deck', 'hand', 'discard'].some(function(pile) {
    const cards = gameState.player[pile].slice();
    const at = cards.indexOf(cardId);
    if (at === -1) return false;
    cards.splice(at, 1);
    changes[pile] = cards;
    return true;
  });
  updatePlayer(changes);
  log('[DEV] removed ' + getCard(cardId).name + ' from the deck, ' + owned.length + ' cards owned');
}

// Both dropdowns render from gameState (KI-3). Rebuilt only when their
// contents change, so an open dropdown is never torn down mid-pick.
function renderDevCardOptions() {
  const fill = function(id, placeholder, entries) {
    const select = document.getElementById(id);
    if (!select) return;
    const signature = entries.map(function(e) { return e[0] + ':' + e[1]; }).join('|');
    if (select.dataset.signature === signature) return;
    select.dataset.signature = signature;
    select.innerHTML = '';
    [['', placeholder]].concat(entries).forEach(function(e) {
      const option = document.createElement('option');
      option.value = e[0];
      option.textContent = e[1];
      select.appendChild(option);
    });
  };
  const cards = gameState.config.cards;
  fill('devAddCardSelect', 'Add card…', Object.keys(cards).map(function(id) { return [id, cards[id].name]; }));
  fill('devRemoveCardSelect', 'Remove card…', gameState.player.ownedCards.map(function(id, i) { return [String(i), cards[id] ? cards[id].name : id]; }));
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
