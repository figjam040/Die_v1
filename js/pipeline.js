// ============================================================
// PIPELINE.JS — BUILD 090 file split
// Damage/block math (Law 1) plus the roll system. Depends on state.js
// (gameState, updatePlayer/updateEnemy/updateTurn) and listener-registry.js
// (callListeners). Called from cards-mods.js's init() (every card/mod
// effect), phase-machine.js's runPhase()/nextPhase(), and dev-tools.js's
// force-roll — all safe forward/back references per state.js's header note.
// ============================================================

// ---------- DAMAGE PIPELINE ----------

// sourceType tags this call so a multiplier can be scoped to a specific
// damage source (e.g. Fervour doubling "attack" damage without touching
// "poison" ticks, which share this same undifferentiated pipeline). Flat
// additions are untagged/unscoped — nothing needs that distinction yet.
// Existing DAMAGE_MULTIPLIER listeners that don't care about sourceType are
// unaffected: fn() ignores an argument it doesn't declare, same as before.
// BUILD 106 (KI-16 fix): routed through callListeners() instead of reading
// gameState.registry.listeners[hook] directly — this was the second of the
// two parallel listener mechanisms KI-16 flagged against Law 2. sourceType
// is passed as callListeners()'s ordinary data argument; DAMAGE_MULTIPLIER
// listeners (e.g. Fervour) already declare it as their one parameter, so
// this is not a signature change for them.
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

// BUILD 064: shared dispatch helpers. Every attack card/mod effect() used to
// repeat the same three lines verbatim — calculateDamage(), apply to the
// target's hp via updateEnemy()/updatePlayer(), fire ON_DAMAGE_DEALT —
// differing only in target, amount, tag, and source string; every block
// card/mod effect() repeated the equivalent three lines for
// generateBlock()/player.block/ON_BLOCK_GENERATED. These collapse that
// boilerplate to one call each. Both return the final computed amount so
// callers that log it still can. sourceType has no default on purpose —
// every damage source must name itself explicitly (this is also what closes
// the one previously-untagged calculateDamage() call site, in
// ENEMY_ACT_PHASE, which now passes 'enemy_attack' explicitly).
// fireListener defaults true for the 16 existing card/mod sites, which all
// fire ON_DAMAGE_DEALT unconditionally. ENEMY_ACT_PHASE passes false: that
// site never fired ON_DAMAGE_DEALT before this build (no listener is
// registered for it, and its own damage===0 branch logs a distinct
// "fully blocked" line instead of applying anything) — routing it through
// this helper must not change that, so it gets an explicit opt-out rather
// than silently gaining a new trigger.
function dealDamage(target, amount, sourceType, sourceId, fireListener) {
  if (fireListener === undefined) fireListener = true;
  const damage = calculateDamage(amount, sourceType);
  if (target === 'enemy') {
    updateEnemy({ hp: gameState.enemy.hp - damage });
  } else {
    updatePlayer({ hp: gameState.player.hp - damage });
  }
  // BUILD 094: damage-landing sounds — this is the single place both
  // card/mod damage (always target: 'enemy') and the enemy's own attack
  // (target: 'player', from ENEMY_ACT_PHASE) already flow through, so it's
  // the one spot that covers both events 4 and 5 with no new detection
  // logic. Independent of the fireListener flag above (that flag is only
  // about ON_DAMAGE_DEALT) and gated on damage > 0 so a fully-blocked
  // enemy attack or a 0-damage Retribution never plays a "hit landed"
  // sound for a hit that didn't actually land. Poison ticks never reach
  // here at all — both the player's and the enemy's poison damage call
  // calculateDamage() directly and were never routed through dealDamage()
  // — so this cannot accidentally add the sound the prompt explicitly
  // says poison must not have.
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

// BUILD 092: healPlayer()/ON_HEAL. Neither existed before this build —
// riteChooseHeal() (rendering.js) healed via a bare updatePlayer({hp:...})
// call with no hook, so nothing could observe or modify a heal. This is
// plumbing for shops and rest nodes, not a balance change: no flat-addition
// or multiplier stage was added (the prompt explicitly excluded one), so
// this does not mirror calculateDamage()/generateBlock()'s two-stage
// pipeline — it is a direct min(hp + amount, maxHp) clamp, exactly what
// riteChooseHeal() already computed inline, now just named and hooked.
// Returns the actual amount healed (post-cap), same shape as dealBlock()
// returning the actual block generated, so a caller building its own log
// line reads the real number even when the cap reduced it.
function healPlayer(amount) {
  const before = gameState.player.hp;
  const newHp = Math.min(before + amount, gameState.player.maxHp);
  const healedAmount = newHp - before;
  updatePlayer({ hp: newHp });
  callListeners('ON_HEAL', { amount: healedAmount });
  return healedAmount;
}

// ---------- DIE FACE HELPERS ----------

// BUILD 107: the one place any face's weight is ever written. Strengthen
// (rendering.js's dieActionPickStrengthenFace) and Ordain's effect
// (cards-mods.js) used to each clone-then-increment gameState.die.faces
// independently — the identical three lines, written twice. Both now call
// this instead; grep-confirmed no other site writes face.weight. Always
// +1, matching what both callers already did — a future mod that adds a
// different amount would need its own argument here, not a new duplicate.
// Player die only (gameState.die, not gameState.enemy.die) — neither
// caller has ever targeted the enemy's die, since only the player has
// Strengthen or Ordain-loadable faces.
function strengthenFace(faceNumber) {
  const face = gameState.die.faces[faceNumber - 1];
  const newWeight = face.weight + 1;
  const newFaces = gameState.die.faces.slice();
  newFaces[faceNumber - 1] = Object.assign({}, face, { weight: newWeight });
  updateDie({ faces: newFaces });
  return newWeight;
}

// BUILD 138 — die feedback: face 1 and face 20 each count how many times
// they've been rolled this run, stored the same place every other face's
// trigger count already lives (face.modData.triggerCount — see MULTI-MOD
// FACES/TRIGGER COUNTS), so renderDieList()'s existing #N badge picks it up
// with no new display code. Called from resolvePlayerRoll() below for both
// Nat faces, on every roll of either — the actual Nat event and every later
// roll of a spent face 1 (which resolves as a plain blank, BUILD 084) alike,
// matching "how many times they have been rolled this run" literally. Reset
// on a new run for free: buildFreshPlayerDieFaces() (run-and-map.js) returns
// faces with no modData at all, same mechanism that already wipes every
// other face's trigger count on a brand new run.
function bumpNatFaceTriggerCount(faceNumber) {
  const face = gameState.die.faces[faceNumber - 1];
  const newFaces = gameState.die.faces.slice();
  const existingModData = face.modData || {};
  newFaces[faceNumber - 1] = Object.assign({}, face, {
    modData: Object.assign({}, existingModData, { triggerCount: (existingModData.triggerCount || 0) + 1 })
  });
  updateDie({ faces: newFaces });
}

// BUILD 138 — die feedback: the one shared marker for "this face's die row
// should hop to the rolled-face look (indent + yellow) because it just
// fired without being the face actually rolled." Called at the moment a
// face's dispatch actually runs — inside triggerFaceOutsideRoll() below
// (covers every outside-roll trigger AND the Bound scan, which dispatches
// through triggerFaceOutsideRoll() itself) and from onNatTwenty()'s own
// playSweep() dispatch callback (cards-mods.js), the one sweep path that
// does not go through triggerFaceOutsideRoll(). A face already marked this
// round is never re-added, but is a harmless no-op if called again (e.g.
// Reverberation re-triggering the already-rolled face, which already carries
// the look through the separate rolledFaceNumber mechanism). Read by
// renderDieList() (rendering.js); cleared at START_OF_TURN alongside every
// other round-scoped roll flag (phase-machine.js).
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

function resolvePlayerRoll(face) {
  log('[ROLL] face: ' + face.number + ' modId: ' + face.modId);

  // BUILD 056: expose this turn's roll result to card effects. Recorded
  // here — the single place both the natural (nextPhase) and forced
  // (forcePlayerRoll) roll paths funnel through — so every resolution
  // path sets it identically. Weight is read straight off the face
  // object exactly as rollDie()'s own pool-building already does.
  let rollOutcome;
  if (face.modId === 'NAT_TWENTY') {
    rollOutcome = 'nat_twenty';
  } else if (face.modId === 'NAT_ONE') {
    // BUILD 084: a spent Nat 1 is a blank in every respect, cards included —
    // not just in its effect and its log line. Orison is the reason this
    // matters: it reads gameState.turn.rollOutcome directly (never
    // re-deriving blankness from the die or the face), so without this it
    // would take its 5-damage branch on a face 1 that the player has just
    // watched pay out 2 block like any other blank.
    //
    // Ordering is what makes the one-liner correct: natOneFiredThisFight is
    // still false here on the fight's first face 1 — onNatOne() sets it
    // below, during the dispatch — so this reads 'nat_one' exactly once per
    // fight and 'blank' for every face 1 after it, matching the dispatch
    // branch in onNatOne() one for one.
    rollOutcome = gameState.player.natOneFiredThisFight ? 'blank' : 'nat_one';
  } else if (face.modId !== null) {
    rollOutcome = 'mod';
  } else {
    rollOutcome = 'blank';
  }
  // BUILD 090: rolledFaceNumber drives the die-row highlight — set here,
  // the single funnel both the natural (nextPhase) and forced
  // (forcePlayerRoll) roll paths already go through.
  updateTurn({ rollOutcome: rollOutcome, rolledFaceWeight: face.weight, rolledFaceNumber: face.number });

  // BUILD 093: announce the roll sound event — never call a playXSound()
  // function (audio.js) directly. Same funnel as the highlight above, so a
  // forced dev roll gets the same sound a natural one does. BUILD 094:
  // nat_twenty/nat_one each get their own dedicated event now (the payoff/
  // punishment sounds) instead of sharing the generic 'roll' click; a
  // spent Nat 1 still reads as 'blank' here (BUILD 084) and correctly
  // keeps getting the plain dull roll_blank click, not the punishment
  // sound — Penitence only fires once per fight, on the fresh trigger.
  if (rollOutcome === 'nat_twenty') {
    playAudioEvent('nat_20');
  } else if (rollOutcome === 'nat_one') {
    playAudioEvent('nat_1');
  } else {
    playAudioEvent(rollOutcome === 'blank' ? 'roll_blank' : 'roll');
  }

  if (face.modId === 'NAT_TWENTY') {
    // BUILD 138: face 20's own run-scoped roll count, same field every
    // other face's trigger count already lives in — see
    // bumpNatFaceTriggerCount() above.
    bumpNatFaceTriggerCount(face.number);
    // BUILD 066: onNatTwenty is now a real permanent NAT_TWENTY listener
    // (registered in init(), see 'ordained_nat_twenty_passive') that logs
    // its own announcement line and dispatches every loaded face in
    // ascending order — this call is unchanged from BUILD 054, only what
    // it now reaches has changed.
    callListeners('NAT_TWENTY', {});
  } else if (face.modId === 'NAT_ONE') {
    // BUILD 138: face 1's own run-scoped roll count — every roll of face 1
    // counts, not just the fight's first (real Penitence-onset) one; a
    // later, already-spent face 1 still resolves through this branch (see
    // rollOutcome derivation above) and still counts as a roll of face 1.
    bumpNatFaceTriggerCount(face.number);
    // BUILD 067: onNatOne is now a real permanent NAT_ONE listener
    // (registered in init(), see 'ordained_nat_one_passive') that applies
    // Penitence and logs its own line — this call is unchanged from
    // BUILD 054, only what it now reaches has changed, same shape as the
    // BUILD 066 NAT_TWENTY change above.
    callListeners('NAT_ONE', {});
  } else if (face.modId !== null) {
    // BUILD 115: a face can hold up to two mods (modId, then modId2 — load
    // order). Both trigger when the face is rolled, first-loaded first,
    // each resolving fully (mod_dispatch's effect() call returns) before
    // the next begins — two sequential, synchronous callListeners() calls
    // achieve that with no new dispatch mechanism. modId2 is null on every
    // single-mod face (including both Nat faces, which never carry a
    // second mod), so this is a no-op there, unchanged from before.
    callListeners('MOD_TRIGGER', { modId: face.modId, faceNumber: face.number });
    if (face.modId2) {
      callListeners('MOD_TRIGGER', { modId: face.modId2, faceNumber: face.number });
    }
    // A kill from this synchronous dispatch alone (no Bound scan involved)
    // needs no separate checkWinNow() call here — nextPhase()'s own
    // immediately-following, still-synchronous runPhase(nextIndex) call
    // hits the pre-existing top-of-runPhase() guard (BUILD 053/068) while
    // run.status is still 'active', exactly as it always has. Calling
    // checkWinNow() here too would flip run.status to 'win' a step early and
    // let that guard's own check be skipped on the next call, leaving
    // turn.phase to fall through into CARD_PHASE unguarded instead of
    // holding at ROLL_PHASE — checkWinNow() below (as runBoundScan()'s own
    // onComplete) is what actually needs this, since a Bound scan's
    // dispatches are staggered async and can still be in flight when that
    // synchronous CARD_PHASE transition happens.
    // BUILD 133 (checkpoint 3, Bound engine) — the die-wide Bound scan.
    // Only runs off a genuinely rolled mod face (this branch), never off a
    // Nat 20 sweep (its own branch above, which never reaches here) or a
    // blank (the else branch below).
    runBoundScan(face);
  } else {
    callListeners('BLANK_ROLL', {});
  }
}

// ---------- BOUND ENGINE (checkpoint 3) ----------

// A face is Bound if a mod loaded on it (either slot) carries the 'bound'
// tag (printed Bound, permanent — Unison/Accord/Kinship, cards-mods.js), or
// if the face was granted Bound for the fight (grantBoundToFace() below).
// The grant lives on the face's own modData (ARCH-CF2: per-face state stays
// in modData, no parallel array keyed by face number) under boundGranted —
// merged in like every other modData field (Zeal's accumulatedBonus, Cope's
// copeBonus), never replacing modData wholesale.
function isBoundFace(face) {
  if (face.modData && face.modData.boundGranted) { return true; }
  const mod = face.modId !== null ? gameState.config.mods[face.modId] : null;
  if (mod && mod.tags && mod.tags.indexOf('bound') !== -1) { return true; }
  const mod2 = face.modId2 ? gameState.config.mods[face.modId2] : null;
  if (mod2 && mod2.tags && mod2.tags.indexOf('bound') !== -1) { return true; }
  return false;
}

// The one fight-scoped Bound setter — grants Bound to a loaded face for the
// rest of the current fight. Refuses outright (no state change, returns
// false) for face 1 or face GAME_CONFIG.DIE_SIZE.PLAYER (20) — both are Nat
// stubs, never a real mod or a blank — and for a genuinely blank face (both
// slots null), since a grant with nothing loaded to carry it has nothing to
// scan for. Cleared at fight end by clearFightScopedState() (run-and-map.js),
// alongside the die's other fight-scoped state.
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

// The die-wide Bound scan. When the rolled face is itself Bound, every
// OTHER loaded Bound face on the die triggers through triggerFaceOutsideRoll()
// (below), ascending face order, any position on the die — gameState.die.
// faces is already stored in ascending order (face.number === index+1), so
// filtering preserves that order with no extra sort. Faces triggered this
// way never call this function themselves (triggerFaceOutsideRoll() has no
// idea what called it), so a scanned face never starts a further scan. Only
// called from resolvePlayerRoll()'s own mod-trigger branch above — never
// from onNatTwenty()'s sweep — so the scan never runs during a Nat 20.
// Playback of the scanned faces is paced by playSweep() below (fast sweep
// timing) — state itself still updates the instant each one's dispatch runs.
function runBoundScan(rolledFace) {
  if (!isBoundFace(rolledFace)) { return; }
  const others = gameState.die.faces.filter(function(f) {
    return f.number !== rolledFace.number && isBoundFace(f);
  });
  if (others.length === 0) { return; }
  log('[BOUND] scan: ' + others.length + ' other loaded Bound face' + (others.length === 1 ? '' : 's') + ' trigger' + (others.length === 1 ? 's' : ''));
  // BUILD 135: checkWinNow() runs as the sweep's onComplete, once every face
  // this scan queued has actually dispatched — a kill mid-scan still lets
  // the scan's remaining triggers land (and any permanent growth they carry
  // still counts) before the fight is declared won.
  playSweep(others.map(function(f) { return f.number; }), function(faceNumber) {
    triggerFaceOutsideRoll(faceNumber);
  }, checkWinNow);
}

// ---------- FAST SWEEP TIMING (checkpoint 3, Bound engine) ----------

// Paces the playback of a multi-face sweep (Nat 20's onNatTwenty() loop,
// runBoundScan() above) so many loaded faces don't all resolve in the same
// instant. dispatchFn(faceNumber) still runs its full dispatch (state
// changes, trigger counts, everything) the instant its own setTimeout
// fires — this only staggers WHEN each one plays, never what it does or in
// what order (faceNumbers is walked in the order given, unchanged). The
// first three plays in a round (gameState.turn.roundSweepPlays, counted
// across every sweep this round, Nat 20 and Bound scan alike) land
// GAME_CONFIG.SWEEP_TRIGGER_DELAY_MS apart; every play after the third
// lands at a quarter of that delay instead — a big sweep speeds up partway
// through rather than dragging out at a constant pace.
// BUILD 135: onComplete (optional) fires once every faceNumbers dispatch has
// actually run — not when they're merely scheduled. A kill from an early
// step in the sweep does not cut the rest of it short (permanent growth from
// the remaining triggers still counts); onComplete is what lets a caller
// (checkWinNow(), phase-machine.js) check the win condition only once the
// whole sweep is truly done. Fires synchronously, before returning, when
// faceNumbers is empty — nothing was scheduled, so there is nothing to wait
// for.
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

// ---------- OUTSIDE-ROLL TRIGGER (checkpoint 3, prompt D) ----------

// BUILD 132: the one shared function every "trigger a face without rolling
// it" card/mod goes through (Threnody, Reverberation, Magnificat — see
// cards-mods.js) — never a second copy of resolvePlayerRoll()'s own
// dispatch above. Refuses face 1 and face GAME_CONFIG.DIE_SIZE.PLAYER (20)
// outright (both are Nat stubs, never a real mod or a blank), and refuses a
// face already triggered this way once this round —
// gameState.turn.outsideTriggeredFaces, a round-scoped record cleared at
// START_OF_TURN alongside every other per-round roll flag (phase-machine.js).
// Counts toward GAME_CONFIG.ROUND_TRIGGER_CAP (D-51, added this build — no
// cap existed in code before it): a loaded face's dispatch counts through
// mod_dispatch (cards-mods.js), the same funnel a normal roll's own
// MOD_TRIGGER already uses, so this needs no separate bookkeeping there; a
// blank face bypasses mod_dispatch entirely (BLANK_ROLL has no counter of
// its own), so this function bumps roundTriggerCount itself in that branch.
// The only call site exempt from the count is Nat 20's own sweep
// (onNatTwenty, cards-mods.js), which tags its MOD_TRIGGER calls with
// natTwentySweep so mod_dispatch can tell the two apart — this function
// never sets that flag, so every trigger it causes counts.
// A loaded face triggers through the exact same MOD_TRIGGER dispatch a
// rolled face uses, in load order, both slots — permanent growth (Zeal,
// Ordain, Elevation, Cope) runs identically, since it lives inside each
// mod's own effect(), reached the same way either path. A blank face
// dispatches BLANK_ROLL, the same hook a genuinely rolled blank uses, for
// the same GAME_CONFIG.BLANK_ROLL_BLOCK (2) block. Never touches
// rolledFaceNumber/rollOutcome/rolledFaceWeight — this does not change
// which face was rolled this round.
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
    // BUILD 137 — logs at most once per round (roundTriggerCapLogged,
    // cleared at START_OF_TURN alongside every other round-scoped flag,
    // state.js/phase-machine.js): a round that refuses this many times over
    // used to print this exact line once per refusal, flooding the log.
    if (!gameState.turn.roundTriggerCapLogged) {
      log('[TRIGGER] outside-roll trigger refused: round trigger cap (' + GAME_CONFIG.ROUND_TRIGGER_CAP + ') reached');
      updateTurn({ roundTriggerCapLogged: true });
    }
    return false;
  }

  updateTurn({ outsideTriggeredFaces: gameState.turn.outsideTriggeredFaces.concat(faceNumber) });

  // BUILD 138: this face's die row hops to the rolled-face look (indent +
  // yellow) the instant its dispatch actually fires below — covers every
  // outside-roll trigger (Threnody/Reverberation/Magnificat/Novena) and the
  // Bound scan (runBoundScan() above dispatches through this same function).
  markFaceHopped(faceNumber);

  const face = gameState.die.faces[faceNumber - 1];
  if (face.modId !== null) {
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

// BUILD 097: ENEMY_NAT_ONE and ENEMY_NAT_TWENTY are now real dispatches —
// both were log-only stubs before this build (see CLAUDE.md's completion
// notes). Structure now mirrors resolvePlayerRoll()'s own dispatch exactly:
// each Nat face fires its own hook, a loaded buff face fires
// ENEMY_BUFF_TRIGGER, blank logs and does nothing. The actual behaviour for
// all three lives in the permanent listeners registered once in init()
// (boss_nat_one_passive/boss_nat_twenty_passive/enemy_buff_dispatch) —
// this function only dispatches, exactly as resolvePlayerRoll() does for
// the player's own Nat/mod faces.
function resolveEnemyRoll(face) {
  // BUILD 101: mirrors resolvePlayerRoll()'s own rollOutcome derivation
  // (pipeline.js above), enemy-side, so the roll strip can highlight the
  // enemy's rolled face for the round exactly as it already does for the
  // player's (rendering.js's renderDieList). natOneFiredThisFight is read
  // here before boss_nat_one_passive (cards-mods.js) sets it true below,
  // same ordering resolvePlayerRoll() relies on for its own Nat 1 case.
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
    callListeners('ENEMY_NAT_ONE', {});
  } else if (face.modId === 'ENEMY_NAT_TWENTY') {
    callListeners('ENEMY_NAT_TWENTY', {});
  } else if (face.modId !== null) {
    callListeners('ENEMY_BUFF_TRIGGER', { buffId: face.modId, faceNumber: face.number });
  } else {
    log('[ENEMY ROLL] blank');
  }
}
