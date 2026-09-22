// Damage/block math (Law 1) plus the roll system.

// ---------- DAMAGE PIPELINE ----------

// sourceType tags this call so a multiplier can scope to a specific damage
// source (e.g. Fervour doubling "attack" without touching "poison" ticks,
// which share this same pipeline). Flat additions are untagged.
function calculateDamage(baseDamage, sourceType) {
  let total = baseDamage;
  callListeners('DAMAGE_FLAT_ADDITION').forEach(function(amount) {
    total = total + amount;
  });
  callListeners('DAMAGE_MULTIPLIER', sourceType).forEach(function(multiplier) {
    total = Math.ceil(total * multiplier);
  });
  return Math.ceil(total);
}

function generateBlock(baseBlock) {
  let total = baseBlock;
  callListeners('BLOCK_FLAT_ADDITION').forEach(function(amount) {
    total = total + amount;
  });
  callListeners('BLOCK_MULTIPLIER').forEach(function(multiplier) {
    total = Math.ceil(total * multiplier);
  });
  return Math.ceil(total);
}

// Shared dispatch: every damage-dealing card/mod calls this instead of
// repeating calculateDamage() + hp update + ON_DAMAGE_DEALT inline.
// sourceType has no default — every damage source must name itself
// explicitly. fireListener defaults true; ENEMY_ACT_PHASE passes false
// since that site has never fired ON_DAMAGE_DEALT and must not gain one now.
function dealDamage(target, amount, sourceType, sourceId, fireListener) {
  if (fireListener === undefined) fireListener = true;
  const damage = calculateDamage(amount, sourceType);
  if (target === 'enemy') {
    updateEnemy({ hp: gameState.enemy.hp - damage });
  } else {
    updatePlayer({ hp: gameState.player.hp - damage });
  }
  // Gated on damage > 0 so a fully-blocked hit never plays a "landed" sound.
  if (damage > 0) {
    playAudioEvent(target === 'enemy' ? 'damage_enemy' : 'damage_player');
  }
  if (fireListener) {
    callListeners('ON_DAMAGE_DEALT', { amount: damage, source: sourceId });
  }
  return damage;
}

function dealBlock(amount, sourceId) {
  const block = generateBlock(amount);
  updatePlayer({ block: gameState.player.block + block });
  callListeners('ON_BLOCK_GENERATED', { amount: block, source: sourceId });
  return block;
}

// A direct min(hp + amount, maxHp) clamp — no flat-addition or multiplier
// stage, unlike calculateDamage()/generateBlock(). Returns the actual
// amount healed (post-cap).
function healPlayer(amount) {
  const before = gameState.player.hp;
  const newHp = Math.min(before + amount, gameState.player.maxHp);
  const healedAmount = newHp - before;
  updatePlayer({ hp: newHp });
  callListeners('ON_HEAL', { amount: healedAmount });
  return healedAmount;
}

// ---------- DIE FACE HELPERS ----------

// The one place any face's weight is ever written. Player die only —
// nothing Strengthens or Ordains the enemy's die.
function strengthenFace(faceNumber) {
  const face = gameState.die.faces[faceNumber - 1];
  const newWeight = face.weight + 1;
  const newFaces = gameState.die.faces.slice();
  newFaces[faceNumber - 1] = Object.assign({}, face, { weight: newWeight });
  updateDie({ faces: newFaces });
  return newWeight;
}

// Face 1/20's own run-scoped roll count, in face.modData.triggerCount —
// the same field every other face's trigger badge reads.
function bumpNatFaceTriggerCount(faceNumber) {
  const face = gameState.die.faces[faceNumber - 1];
  const newFaces = gameState.die.faces.slice();
  const existingModData = face.modData || {};
  newFaces[faceNumber - 1] = Object.assign({}, face, {
    modData: Object.assign({}, existingModData, { triggerCount: (existingModData.triggerCount || 0) + 1 })
  });
  updateDie({ faces: newFaces });
}

// Marks a face's die row to hop to the rolled-face look because it fired
// without being the face actually rolled.
function markFaceHopped(faceNumber) {
  if (gameState.turn.hoppedFaces.indexOf(faceNumber) !== -1) { return; }
  updateTurn({ hoppedFaces: gameState.turn.hoppedFaces.concat(faceNumber) });
}

// ---------- ROLL SYSTEM ----------

function rollDie(faces) {
  const pool = [];
  faces.forEach(face => {
    for (let i = 0; i < face.weight; i++) { pool.push(face); }
  });
  log('[ROLL] pool size: ' + pool.length);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Loaded Die, threaded through the one place the real roll path calls
// rollDie() — rollDie() itself is untouched (WEIGHTED ROLL ALGORITHM).
function rollWithRelics(faces) {
  if (!hasRelic('loaded_die')) { return rollDie(faces); }
  const a = rollDie(faces);
  const b = rollDie(faces);
  const chosen = b.number > a.number ? b : a;
  log('[RELIC] Loaded Die: rolled ' + a.number + ' and ' + b.number + ', ' + chosen.number + ' stands');
  return chosen;
}

// Third Eye — mirrors forcePlayerRoll() (dev-tools.js) but player-facing,
// gated on the relic and its once-per-act use instead of dev chrome.
function thirdEyeChooseFace(faceNumber) {
  if (!hasRelic('third_eye')) { return; }
  if (gameState.run.thirdEyeUsedThisAct) { return; }
  if (gameState.turn.phase !== 'ROLL_PHASE' || playerRollResolved) { return; }
  playerRollResolved = true;
  updateRun({ thirdEyeUsedThisAct: true });
  const face = gameState.die.faces[faceNumber - 1];
  log('[RELIC] Third Eye: face ' + faceNumber + ' chosen');
  resolvePlayerRoll(face);
}

function resolvePlayerRoll(face) {
  log('[ROLL] face: ' + face.number + ' modId: ' + face.modId);

  let rollOutcome;
  if (face.modId === 'NAT_TWENTY') {
    rollOutcome = 'nat_twenty';
  } else if (face.modId === 'NAT_ONE') {
    // A spent Nat 1 is a blank in every respect, cards included — Orison
    // reads rollOutcome directly rather than re-deriving blankness.
    rollOutcome = gameState.player.natOneFiredThisFight ? 'blank' : 'nat_one';
  } else if (face.modId !== null) {
    rollOutcome = 'mod';
  } else {
    rollOutcome = 'blank';
  }
  updateTurn({ rollOutcome: rollOutcome, rolledFaceWeight: face.weight, rolledFaceNumber: face.number });

  if (rollOutcome === 'nat_twenty') {
    playAudioEvent('nat_20');
  } else if (rollOutcome === 'nat_one') {
    playAudioEvent('nat_1');
  } else {
    playAudioEvent(rollOutcome === 'blank' ? 'roll_blank' : 'roll');
  }

  if (face.modId === 'NAT_TWENTY') {
    bumpNatFaceTriggerCount(face.number);
    callListeners('NAT_TWENTY', {});
  } else if (face.modId === 'NAT_ONE') {
    bumpNatFaceTriggerCount(face.number);
    callListeners('NAT_ONE', {});
  } else if (face.modId !== null && !isFaceSealed(face.number)) {
    // A face can hold up to two mods; both trigger, first-loaded first,
    // each resolving fully before the next begins.
    callListeners('MOD_TRIGGER', { modId: face.modId, faceNumber: face.number });
    if (face.modId2) {
      callListeners('MOD_TRIGGER', { modId: face.modId2, faceNumber: face.number });
    }
    // No separate checkWinNow() needed here — see runBoundScan()'s own
    // onComplete for the async-dispatch case.
    runBoundScan(face);
  } else {
    callListeners('BLANK_ROLL', {});
  }
}

// ---------- BOUND ENGINE ----------

// A face is Bound if a mod loaded on it carries the 'bound' tag
// (permanent), or if it was granted Bound for the fight
// (grantBoundToFace() below, stored in modData.boundGranted).
function isBoundFace(face) {
  // A Sealed face counts as blank for every rule, including Bound.
  if (isFaceSealed(face.number)) { return false; }
  if (face.modData && face.modData.boundGranted) { return true; }
  const mod = face.modId !== null ? gameState.config.mods[face.modId] : null;
  if (mod && mod.tags && mod.tags.indexOf('bound') !== -1) { return true; }
  const mod2 = face.modId2 ? gameState.config.mods[face.modId2] : null;
  if (mod2 && mod2.tags && mod2.tags.indexOf('bound') !== -1) { return true; }
  return false;
}

// Grants Bound to a loaded face for the rest of the current fight. Refuses
// for face 1/20 (Nat stubs) and a genuinely blank face. Cleared at fight
// end by clearFightScopedState().
function grantBoundToFace(faceNumber) {
  if (faceNumber === 1 || faceNumber === GAME_CONFIG.DIE_SIZE.PLAYER) {
    log('[BOUND] grant refused: face ' + faceNumber + ' is a Nat face');
    return false;
  }
  const face = gameState.die.faces[faceNumber - 1];
  if (face.modId === null && face.modId2 === null) {
    log('[BOUND] grant refused: face ' + faceNumber + ' is blank');
    return false;
  }
  const newFaces = gameState.die.faces.slice();
  newFaces[faceNumber - 1] = Object.assign({}, face, { modData: Object.assign({}, face.modData, { boundGranted: true }) });
  updateDie({ faces: newFaces });
  log('[BOUND] face ' + faceNumber + ' granted Bound for the fight');
  return true;
}

// When the rolled face is itself Bound, every OTHER loaded Bound face
// triggers through triggerFaceOutsideRoll(), ascending face order. Never
// runs during a Nat 20 sweep. A scanned face never starts a further scan.
function runBoundScan(rolledFace) {
  if (!isBoundFace(rolledFace)) { return; }
  const others = gameState.die.faces.filter(function(f) {
    return f.number !== rolledFace.number && isBoundFace(f);
  });
  if (others.length === 0) { return; }
  log('[BOUND] scan: ' + others.length + ' other loaded Bound face' + (others.length === 1 ? '' : 's') + ' trigger' + (others.length === 1 ? 's' : ''));
  // checkWinNow() runs as the sweep's onComplete, once every queued face
  // has actually dispatched — a kill mid-scan still lets the rest land.
  playSweep(others.map(function(f) { return f.number; }), function(faceNumber) {
    triggerFaceOutsideRoll(faceNumber);
  }, checkWinNow);
}

// ---------- FAST SWEEP TIMING ----------

// Paces WHEN each face in a multi-face sweep plays (state itself still
// updates the instant each dispatch runs). The first three plays in a
// round land SWEEP_TRIGGER_DELAY_MS apart; every play after the third
// lands at a quarter of that delay. onComplete fires once every dispatch
// has actually run (not merely scheduled) — a kill from an early step
// doesn't cut the rest of the sweep short — or synchronously if empty.
function playSweep(faceNumbers, dispatchFn, onComplete) {
  let cumulativeDelay = 0;
  let completedCount = 0;
  faceNumbers.forEach(function(faceNumber, index) {
    const playIndex = gameState.turn.roundSweepPlays + index;
    const stepDelay = playIndex < 3 ? GAME_CONFIG.SWEEP_TRIGGER_DELAY_MS : (GAME_CONFIG.SWEEP_TRIGGER_DELAY_MS / 4);
    if (index > 0) { cumulativeDelay += stepDelay; }
    setTimeout(function() {
      dispatchFn(faceNumber);
      completedCount++;
      if (onComplete && completedCount === faceNumbers.length) { onComplete(); }
    }, cumulativeDelay);
  });
  updateTurn({ roundSweepPlays: gameState.turn.roundSweepPlays + faceNumbers.length });
  if (onComplete && faceNumbers.length === 0) { onComplete(); }
}

// ---------- SEAL ----------

// See CLAUDE.md's LOADED-FACE RULE — every "is this face loaded" decision
// site that must treat a Sealed face as blank calls this first.
function isFaceSealed(faceNumber) {
  return gameState.turn.sealedFaces.indexOf(faceNumber) !== -1;
}

// The player's heaviest loaded face, excluding faces 1/20 and any face
// already Sealed this round. Ties go to the lowest-numbered face.
function pickHeaviestLoadedFaceForSeal() {
  const candidates = gameState.die.faces.filter(function(f) {
    return f.number !== 1 && f.number !== GAME_CONFIG.DIE_SIZE.PLAYER && f.modId !== null && !isFaceSealed(f.number);
  });
  if (candidates.length === 0) { return null; }
  return candidates.reduce(function(best, f) {
    if (f.weight > best.weight) { return f; }
    if (f.weight === best.weight && f.number < best.number) { return f; }
    return best;
  });
}

// Same candidates/tie rule as pickHeaviestLoadedFaceForSeal(), but returns
// up to n of them — Cardinal's Nat 20 Seals its two heaviest at once.
function pickTopLoadedFacesForSeal(n) {
  const candidates = gameState.die.faces.filter(function(f) {
    return f.number !== 1 && f.number !== GAME_CONFIG.DIE_SIZE.PLAYER && f.modId !== null && !isFaceSealed(f.number);
  });
  candidates.sort(function(a, b) {
    if (b.weight !== a.weight) { return b.weight - a.weight; }
    return a.number - b.number;
  });
  return candidates.slice(0, n);
}

// ---------- ENEMY DICE OF ANY SIZE ----------

// A generic enemy-die builder from a {sizeKey, faces, nats} spec — sizeKey
// indexes GAME_CONFIG.DIE_SIZE, faces is a sparse { faceNumber: buffId }
// map, nats (bool) puts ENEMY_NAT_ONE/ENEMY_NAT_TWENTY on faces 1/size.
function buildEnemyDieFromSpec(spec) {
  const dieSize = GAME_CONFIG.DIE_SIZE[spec.sizeKey];
  const faces = [];
  for (let n = 1; n <= dieSize; n++) {
    let modId = null;
    if (spec.nats && n === 1) {
      modId = 'ENEMY_NAT_ONE';
    } else if (spec.nats && n === dieSize) {
      modId = 'ENEMY_NAT_TWENTY';
    } else if (spec.faces && spec.faces[n]) {
      modId = spec.faces[n];
    }
    faces.push({ number: n, modId: modId, modId2: null, weight: 1 });
  }
  return faces;
}

// ---------- OUTSIDE-ROLL TRIGGER ----------

// The one shared function every "trigger a face without rolling it"
// card/mod goes through (Threnody, Reverberation, Magnificat). Refuses
// face 1/20 and a face already triggered this way this round. Counts
// toward GAME_CONFIG.ROUND_TRIGGER_CAP — a loaded face counts through
// mod_dispatch same as a normal roll; a blank face bumps the counter here
// directly, since BLANK_ROLL has no counter of its own. Exempt: Nat 20's
// own sweep, which tags its calls so mod_dispatch can tell the two apart.
// Never touches rolledFaceNumber/rollOutcome/rolledFaceWeight.
function triggerFaceOutsideRoll(faceNumber) {
  if (faceNumber === 1 || faceNumber === GAME_CONFIG.DIE_SIZE.PLAYER) {
    log('[TRIGGER] outside-roll trigger refused: face ' + faceNumber + ' is a Nat face');
    return false;
  }
  if (gameState.turn.outsideTriggeredFaces.indexOf(faceNumber) !== -1) {
    log('[TRIGGER] outside-roll trigger refused: face ' + faceNumber + ' already triggered outside a roll this round');
    return false;
  }
  if (gameState.turn.roundTriggerCount >= GAME_CONFIG.ROUND_TRIGGER_CAP) {
    // Logs at most once per round, to avoid flooding the log.
    if (!gameState.turn.roundTriggerCapLogged) {
      log('[TRIGGER] outside-roll trigger refused: round trigger cap (' + GAME_CONFIG.ROUND_TRIGGER_CAP + ') reached');
      updateTurn({ roundTriggerCapLogged: true });
    }
    return false;
  }

  updateTurn({ outsideTriggeredFaces: gameState.turn.outsideTriggeredFaces.concat(faceNumber) });
  markFaceHopped(faceNumber);

  const face = gameState.die.faces[faceNumber - 1];
  if (face.modId !== null && !isFaceSealed(faceNumber)) {
    log('[TRIGGER] face ' + faceNumber + ' triggered outside a roll (modId: ' + face.modId + ')');
    callListeners('MOD_TRIGGER', { modId: face.modId, faceNumber: face.number });
    if (face.modId2) {
      callListeners('MOD_TRIGGER', { modId: face.modId2, faceNumber: face.number });
    }
  } else {
    updateTurn({ roundTriggerCount: gameState.turn.roundTriggerCount + 1 });
    log('[TRIGGER] face ' + faceNumber + ' triggered outside a roll (blank)');
    callListeners('BLANK_ROLL', {});
  }
  return true;
}

// ---------- ENEMY INTENT PATTERN ----------

// Fixes and shows this round's intent, called once per START_OF_TURN,
// after both poison ticks resolve (KI-28). Handles: (1) Wrath's
// pending-to-active move; (2) the charge windup->release transition and
// its break check; (3) picking this round's entry — the dev's
// forcedNextIntent override if set, else the next pattern entry.
function advanceEnemyIntentForRound() {
  const enemy = gameState.enemy;

  // Moves from pending into active before any Attack this round is
  // rolled, so a Wrath triggered mid-round affects next round only.
  if (enemy.wrathPending > 0) {
    const newWrath = enemy.wrath + enemy.wrathPending;
    updateEnemy({ wrath: newWrath, wrathPending: 0 });
    log('[ENEMY] Wrath active: Attacks now +' + newWrath + '.');
  }

  if (!enemy.pattern || enemy.pattern.length === 0) { return; }

  if (enemy.chargeStage === 'windup') {
    // Break check: HP lost since windupStartHp was captured — includes
    // this round's own poison tick (KI-28).
    const entry = enemy.currentEntry;
    const hpLost = enemy.windupStartHp - enemy.hp;
    const broke = hpLost >= entry.breakAt;
    updateEnemy({ chargeStage: 'release', chargeBroken: broke });
    if (broke) {
      log('[ENEMY] ' + enemy.name + '\'s Charge breaks.');
    }
    return;
  }

  const forced = enemy.forcedNextIntent;
  const entry = forced || enemy.pattern[enemy.patternIndex];
  if (forced) {
    updateEnemy({ forcedNextIntent: null });
  }

  if (entry.kind === 'attack') {
    const rolled = Math.floor(Math.random() * (entry.max - entry.min + 1)) + entry.min;
    const value = rolled + enemy.wrath;
    updateEnemy({ currentEntry: Object.assign({}, entry, { rolledValue: value }), chargeStage: null, chargeBroken: false, windupStartHp: null });
    log('[ENEMY] intent set to ' + value);
  } else if (entry.kind === 'charge') {
    updateEnemy({ currentEntry: entry, chargeStage: 'windup', chargeBroken: false, windupStartHp: enemy.hp });
    log('[ENEMY] ' + enemy.name + ' charges. Release ' + entry.release + ' next round.');
  } else if (entry.kind === 'afflict') {
    updateEnemy({ currentEntry: entry, chargeStage: null, chargeBroken: false, windupStartHp: null });
  }
}

// Advances the pattern pointer past the entry that just resolved (or was
// cancelled) and clears this round's charge bookkeeping. Never called for
// a charge still in its wind-up stage.
function advanceEnemyPattern() {
  const enemy = gameState.enemy;
  const nextIndex = enemy.pattern.length ? (enemy.patternIndex + 1) % enemy.pattern.length : 0;
  updateEnemy({ patternIndex: nextIndex, chargeStage: null, chargeBroken: false, windupStartHp: null, currentEntry: null });
}

// How much damage this round's intent is actually going to deal, before
// block (Interdict reads this). Attack -> rolled-plus-Wrath value. Charge
// on its release round, unbroken -> the release value. Otherwise 0.
function getIncomingIntentDamage() {
  const enemy = gameState.enemy;
  const entry = enemy.currentEntry;
  if (!entry) { return 0; }
  if (entry.kind === 'attack') { return entry.rolledValue; }
  if (entry.kind === 'charge') {
    return (enemy.chargeStage === 'release' && !enemy.chargeBroken) ? entry.release : 0;
  }
  return 0;
}

// Mirrors resolvePlayerRoll()'s own dispatch shape, enemy-side: each Nat
// face fires its own hook, a loaded buff face fires ENEMY_BUFF_TRIGGER,
// blank logs and does nothing. The actual behaviour lives in the
// permanent listeners registered once in init().
function resolveEnemyRoll(face) {
  let enemyRollOutcome;
  if (face.modId === 'ENEMY_NAT_TWENTY') {
    enemyRollOutcome = 'nat_twenty';
  } else if (face.modId === 'ENEMY_NAT_ONE') {
    enemyRollOutcome = gameState.enemy.natOneFiredThisFight ? 'blank' : 'nat_one';
  } else if (face.modId !== null) {
    enemyRollOutcome = 'mod';
  } else {
    enemyRollOutcome = 'blank';
  }
  updateTurn({ enemyRollOutcome: enemyRollOutcome, enemyRolledFaceNumber: face.number });
  log('[ENEMY ROLL] face: ' + face.number + ' modId: ' + face.modId);
  if (face.modId === 'ENEMY_NAT_ONE') {
    if (enemyRollOutcome === 'nat_one') { playAudioEvent('enemy_nat_1'); }
    callListeners('ENEMY_NAT_ONE', {});
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    playAudioEvent('enemy_nat_20');
    callListeners('ENEMY_NAT_TWENTY', {});
  } else if (face.modId !== null) {
    callListeners('ENEMY_BUFF_TRIGGER', { buffId: face.modId, faceNumber: face.number });
  } else {
    log('[ENEMY ROLL] blank');
  }
}

// Per-enemy "reads": a few designed enemies react to the PLAYER's own
// roll this round, independent of their own die. Called once per round,
// after the enemy's own die roll (if any) has resolved.
function applyEnemyReads() {
  const enemy = gameState.enemy;
  if (enemy.name === 'Lector') {
    if (gameState.turn.rolledFaceNumber === 6) {
      updatePlayer({ drainNextRound: gameState.player.drainNextRound + 1 });
      log('[ENEMY] Lector reads the 6: Drain triggers.');
    }
  } else if (enemy.name === 'Hierophant') {
    if (gameState.turn.rollOutcome === 'nat_one' && !enemy.natOneFiredThisFight) {
      log('[ENEMY] Hierophant answers the Nat 1: attack cancelled.');
      callListeners('ENEMY_NAT_ONE', {});
    }
  } else if (enemy.name === 'Pontifex') {
    const heaviest = pickHeaviestLoadedFaceForSeal();
    if (heaviest && gameState.turn.rolledFaceNumber === heaviest.number) {
      updateEnemy({ wrathPending: enemy.wrathPending + enemy.wrathPerTrigger });
      log('[ENEMY] Pontifex reads face ' + heaviest.number + ': Wrath triggers.');
    }
  }
}
