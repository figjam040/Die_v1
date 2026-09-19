// ============================================================
// PHASE-MACHINE.JS — BUILD 090 file split
// Phase sequencing: PHASE_ORDER, runPhase(), nextPhase(), the roll-pause
// auto-advance chain, and the two roll-resolved flags both this file and
// dev-tools.js's force-roll functions read/write. Depends on state.js,
// listener-registry.js, pipeline.js, cards-mods.js, and run-and-map.js
// (all loaded first) — calls drawCards(), dealDamage(), rollDie(),
// resolvePlayerRoll()/resolveEnemyRoll(), all already defined by this
// point. Forward-references rendering.js's openDieActionScreen()
// (win branch) and dieActionsRemaining — safe per state.js's header note.
// ============================================================

// Tracks whether this turn's roll has already resolved — naturally or
// forced — for each die. Set false on entering the relevant roll phase,
// set true the moment either path resolves a roll, so exactly one roll
// ever happens per phase visit regardless of which path fires it.
let playerRollResolved = false;
let enemyRollResolved = false;

// ---------- PHASE MACHINE ----------

const PHASE_ORDER = [
  'START_OF_TURN',
  'ROLL_PHASE',
  'CARD_PHASE',
  'END_PLAYER_TURN',
  'ENEMY_ROLL_PHASE',
  'ENEMY_ACT_PHASE',
  'CHECK_WIN_LOSS'
];

// BUILD 135: shared "did that just kill the enemy" check, called from any
// player-side dispatch that can deal damage outside a phase transition — a
// rolled mod trigger, a Nat 20 sweep's or Bound scan's completion, a card
// (cards-mods.js's playCard()). Re-enters runPhase() with the CURRENT phase,
// firing the exact same top-of-function guard below (the BUILD 053 pattern
// cards-mods.js's own card-kill check already used, generalised here to
// every other kill path) — gated on run.status === 'active', so calling this
// after the fight has already ended (or been won by an earlier call this
// same tick) is a no-op.
function checkWinNow() {
  if (gameState.run.status === 'active' && gameState.enemy.hp <= 0) {
    runPhase(gameState.turn.phase);
  }
}

function runPhase(phase) {
  if (gameState.run.status === 'active') {
    if (gameState.enemy.hp <= 0) {
      updateRun({ status: 'win' });
      log('[WIN] enemy defeated');
      // BUILD 109: run record — this fight has just ended, so its round
      // count (gameState.turn.round, not yet reset — that only happens at
      // the next START_OF_TURN) is captured now, for both branches below
      // (a normal fight win and the run-ending boss win alike).
      recordFightRoundEnd(gameState.enemy.id);
      // BUILD 094/095: fires exactly once per fight — this whole branch
      // only ever runs once, since run.status stops being 'active' the
      // instant updateRun() above sets it to 'win', and every other path
      // that might re-enter runPhase() for the same fight (the BUILD
      // 053/063 "no second win path" re-entry guard this function's own
      // top-level if is built around) is gated on that same status check.
      // BUILD 095: boss_defeated is now its own distinct, bigger sound —
      // branched here rather than played unconditionally before the if,
      // so the boss case gets boss_defeated instead of (not in addition
      // to) the ordinary fight_won every other fight still gets.
      // BUILD 068: beating the boss ends the whole run in victory — no
      // reward flow (there's no next fight to reward for), just the win
      // banner (existing renderResultBanner(), unchanged, already keys off
      // run.status === 'win') plus the run-level outcome. Any other fight
      // win proceeds through the existing die action + card reward flow
      // exactly as before, which now returns to the map when it resolves
      // (see closeCardRewardScreen()/advanceRun()).
      if (gameState.run.currentSlot === 'boss') {
        // BUILD 125 (F32, checkpoint 2): a boss win only ends the whole run
        // in VICTORY on the FINAL act (D-22, unchanged there — no reward,
        // just the win banner). Every earlier act's boss grants the same
        // reward flow (one die reward — 'Boss' isn't 'Elite', so
        // GAME_CONFIG.DIE_REWARDS.SINGLE, never the two-action ELITE grant
        // — plus a card reward, exactly like any other fight win) before
        // advanceRun() (run-and-map.js) starts the next act once that flow
        // closes. boss_defeated plays either way — it is still a boss kill.
        playAudioEvent('boss_defeated');
        if (gameState.run.actNumber >= GAME_CONFIG.ACTS) {
          updateRun({ outcome: 'won' });
          log('[RUN] boss defeated — run complete');
          flushRunRecord('won');
          return;
        }
        log('[RUN] act ' + gameState.run.actNumber + ' boss defeated');
        dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
        openDieActionScreen();
      } else {
        playAudioEvent('fight_won');
        // BUILD 082: the elite grants two die actions instead of one,
        // resolved one after the other through the same panel
        // (closeDieActionScreen() loops it — see dieActionsRemaining
        // above). currentSlot is 'opening' or {lane,index} here (the
        // 'boss' case already returned above), never null — a fight can
        // only be won from inside an actual fight slot.
        const cs = gameState.run.currentSlot;
        const wonSlot = cs === 'opening' ? gameState.run.act.opening : gameState.run.act[cs.lane][cs.index];
        dieActionsRemaining = (wonSlot.label === 'Elite') ? GAME_CONFIG.DIE_REWARDS.ELITE : GAME_CONFIG.DIE_REWARDS.SINGLE;
        openDieActionScreen();
      }
      return;
    }
    if (gameState.player.hp <= 0) {
      // BUILD 068: player death ends the whole run — no continue, no
      // retry. outcome:'lost' is the new run-level flag; status:'loss'
      // (unchanged) still drives the existing per-fight DEFEAT banner.
      updateRun({ status: 'loss', outcome: 'lost' });
      log('[LOSS] player defeated');
      log('[RUN] run over');
      // BUILD 094: same once-only guarantee as fight_won above — this
      // branch only runs once per fight, since status stops being 'active'
      // the instant updateRun() sets it to 'loss'.
      playAudioEvent('fight_lost');
      // BUILD 109: run record — player death ends the run outright, same
      // "capture this fight's round count, then flush" shape as the boss
      // win above.
      recordFightRoundEnd(gameState.enemy.id);
      flushRunRecord('lost');
      return;
    }
  }

  updateTurn({ phase: phase });
  log('[PHASE] ' + phase);
  log('[LISTENER] calling hook: ' + phase);
  callListeners(phase);

  if (phase === 'START_OF_TURN') {
    updateTurn({ round: gameState.turn.round + 1 });

    // BUILD 095: both rising sound chains (cards played, mods triggered)
    // reset to zero at the start of the player's turn — this is that one
    // place. Not a sound itself, so called directly rather than through
    // playAudioEvent().
    resetSoundChains();

    // BUILD 068: was a hardcoded Math.floor(Math.random()*13)+6 (a fixed
    // 6-18 band). Now reads gameState.enemy.intentMin/intentMax, set per
    // slot in beginFightFromSlot() — normal fights default to 6/18 (the
    // exact same range, unchanged), elite/boss carry their own wider bands.
    const newIntent = Math.floor(Math.random() * (gameState.enemy.intentMax - gameState.enemy.intentMin + 1)) + gameState.enemy.intentMin;
    updateEnemy({ intent: newIntent });
    log('[ENEMY] intent set to ' + newIntent);

    if (gameState.player.poisonStacks > 0) {
      // Mirrors the enemy poison tick exactly: damage through calculateDamage()
      // per Law 1, decremented stack computed alongside it and written back in
      // the same state-helper call (updatePlayer here, updateEnemy there) so
      // the tick actually decays instead of dealing full damage forever.
      const poisonDamage = calculateDamage(gameState.player.poisonStacks, 'poison');
      const newStacks = gameState.player.poisonStacks - 1;
      const hpBefore = gameState.player.hp;
      const hpAfter = hpBefore - poisonDamage;
      updatePlayer({ hp: hpAfter, poisonStacks: newStacks });
      log('[POISON] player takes ' + poisonDamage + ' damage: HP ' + hpBefore + ' to ' + hpAfter);
    }

    // BUILD 063: the player poison tick above can drop hp to 0 or below, but
    // no phase transition happens mid-body, so without this the rest of
    // START_OF_TURN (enemy tick, block clear, soul reset, listener clear,
    // draw) would still run for a dead player before the top-of-runPhase()
    // guard ever saw it. Re-entering runPhase(phase) fires that exact same
    // guard (the BUILD 053 pattern: no second loss path) — it checks
    // run.status === 'active' and hp <= 0, sets status, logs [LOSS], and
    // returns. Checked before the enemy tick per spec: a dead player must
    // not run the enemy tick.
    if (gameState.player.hp <= 0) {
      runPhase(phase);
      return;
    }

    if (gameState.enemy.poisonStacks > 0) {
      // Poison damage bypasses block by construction — it is applied here via
      // calculateDamage() straight to enemy.hp, never routed through the
      // intent-minus-block subtraction ENEMY_ACT_PHASE uses. The enemy has no
      // block concept yet; this stays true once it does, since nothing here
      // reads any enemy block value.
      const poisonDamage = calculateDamage(gameState.enemy.poisonStacks, 'poison');
      const newStacks = gameState.enemy.poisonStacks - 1;
      updateEnemy({ hp: gameState.enemy.hp - poisonDamage, poisonStacks: newStacks });
      log('[POISON] ' + poisonDamage + ' damage, ' + newStacks + ' stacks of poison remaining');
    }

    // BUILD 063: same shape as the player check above, for the enemy tick —
    // without this, a fight-ending poison tick would still run block clear,
    // soul reset, and drawCards(5) for a fight the player already won.
    // Re-enters runPhase(phase) to fire the same top-of-function guard
    // (BUILD 053 pattern: no second win path).
    if (gameState.enemy.hp <= 0) {
      runPhase(phase);
      return;
    }

    const blockBefore = gameState.player.block;
    updatePlayer({ block: 0 });
    log('[START] block cleared: ' + blockBefore + ' to 0');

    updatePlayer({ soul: gameState.player.maxSoul });
    log('[START] soul reset to ' + gameState.player.maxSoul);

    // BUILD 067: Penitence's per-turn soul loss, after the reset above so
    // a Penitence turn begins at maxSoul - 1 (e.g. 2), never negative.
    //
    // BUILD 084: the loss now runs for exactly PENITENCE_TURNS turns from
    // onset instead of the rest of the fight. The deduction itself is
    // untouched — same 1 soul, same Math.max(0, ...) floor, same position
    // immediately after the soul reset; only the counter and the expiry
    // check below it are new, and both sit inside the existing branch so no
    // other turn does extra work. This is the only place the counter moves.
    //
    // Onset happens in ROLL_PHASE, after this turn's tick has already run,
    // so the three ticks land on the three START_OF_TURNs following onset.
    // The third one deducts and then clears the flag, which is why the
    // fourth START_OF_TURN never enters this branch at all.
    if (gameState.player.penitenceActive) {
      const soulAfterPenitence = Math.max(0, gameState.player.soul - 1);
      updatePlayer({ soul: soulAfterPenitence });
      log('[START] Penitence: 1 soul lost, now ' + soulAfterPenitence);

      const penitenceTurnsLeft = gameState.player.penitenceTurnsRemaining - 1;
      updatePlayer({ penitenceTurnsRemaining: penitenceTurnsLeft });
      if (penitenceTurnsLeft <= 0) {
        updatePlayer({ penitenceActive: false });
        log('[START] Penitence expires');
      }
    }

    clearListeners('turn');
    log('[START] turn listeners cleared');

    // BUILD 056: clear last turn's roll-result exposure alongside the
    // turn listener sweep so a card played this turn never reads a
    // previous turn's rollOutcome/rolledFaceWeight. BUILD 066: same for
    // modTriggeredThisTurn (see the mod_dispatch listener), so a Nat 20
    // with loaded faces can't leave Rapture reading free on the next turn.
    // BUILD 090: same for rolledFaceNumber — this is the one place a new
    // turn's START_OF_TURN runs before that turn's own roll, so it's also
    // what clears the previous roll's die-row highlight on fight start and
    // Restart Fight (both funnel through here via startFreshTurnPaused()),
    // not just turn-to-turn.
    // BUILD 097: same clear for enemyAttackCancelledThisTurn — set by the
    // enemy's own Nat 1 during ENEMY_ROLL_PHASE, read once by ENEMY_ACT_PHASE
    // the same turn, and must not leak into the following turn.
    // BUILD 132: outsideTriggeredFaces/roundTriggerCount (D-51) reset here
    // too — the same round-scoped clear every other per-round roll flag
    // above already gets, so a face triggered outside a roll last round (or
    // last round's trigger tally) never carries into this one.
    // BUILD 133: roundSweepPlays (fast sweep timing, pipeline.js's
    // playSweep()) cleared the same way, same reason.
    // BUILD 137: roundTriggerCapLogged cleared the same way, same reason —
    // the cap-reached log line is allowed to print again next round.
    // BUILD 138: hoppedFaces cleared the same way — a face that hopped last
    // round loses that look the instant the new round starts, same as the
    // rolled face's own highlight clearing.
    updateTurn({ rollOutcome: null, rolledFaceWeight: null, rolledFaceNumber: null, enemyRollOutcome: null, enemyRolledFaceNumber: null, modTriggeredThisTurn: false, enemyAttackCancelledThisTurn: false, outsideTriggeredFaces: [], roundTriggerCount: 0, roundSweepPlays: 0, roundTriggerCapLogged: false, hoppedFaces: [] });

    drawCards(GAME_CONFIG.DRAW_COUNT);
  }

  if (phase === 'ROLL_PHASE') {
    playerRollResolved = false;
  }

  if (phase === 'END_PLAYER_TURN') {
    const discardedCount = gameState.player.hand.length;
    updatePlayer({ discard: gameState.player.discard.concat(gameState.player.hand), hand: [] });
    log('[END] discarded ' + discardedCount + ' cards to discard pile');
  }

  if (phase === 'ENEMY_ROLL_PHASE') {
    enemyRollResolved = false;
  }

  if (phase === 'ENEMY_ACT_PHASE') {
    // BUILD 097: the enemy's own Nat 1 cancels this turn's attack entirely
    // — no damage, no intent resolution, per the prompt exactly. Checked
    // first and returns before intent/block are even read, so nothing
    // below this (the block-absorb/damage sounds, dealDamage(), the two
    // per-outcome log lines) runs at all this turn. enemyAttackCancelledThisTurn
    // is set by boss_nat_one_passive (cards-mods.js) during ENEMY_ROLL_PHASE,
    // earlier the same turn, and cleared for good at the next START_OF_TURN.
    if (gameState.turn.enemyAttackCancelledThisTurn) {
      log('[ENEMY] attack cancelled by its own Nat 1');
      return;
    }
    const intent = gameState.enemy.intent;
    const block = gameState.player.block;
    const rawDamage = Math.max(0, intent - block);
    // BUILD 094: block-absorb sound, announced before dealDamage() below
    // so it lands first — this is the one place the intent-vs-block
    // subtraction already happens, so it's the only correct spot to know
    // "block actually absorbed some of this hit" (as opposed to just
    // "the player currently has some block," which dealBlock() itself
    // would not know for an enemy attack it isn't even involved in).
    // Math.min(intent, block) is the actual amount of the hit block ate,
    // gated on >0 so a hit that arrives against zero block never plays
    // the absorb thud. The damage_player sound (fired inside dealDamage()
    // below, independently, gated on damage>0) follows immediately after
    // for whatever gets through — a fully-blocked hit fires this sound
    // alone, an unblocked hit fires only damage_player, and a partially
    // blocked hit fires both exactly once each, in that order.
    const blockedAmount = Math.min(intent, block);
    if (blockedAmount > 0) {
      playAudioEvent('block_absorb');
    }
    // BUILD 064: explicit source tag closes the one previously-untagged
    // calculateDamage() call the audit found. 'enemy_attack' is deliberately
    // not 'attack' so it stays outside Fervour's sourceType === 'attack'
    // check — enemy damage to the player must never be doubled by a buff
    // meant for the player's own outgoing attacks. Routed through
    // dealDamage(target: 'player', ...) like every other damage site, but
    // with fireListener false: this site never fired ON_DAMAGE_DEALT before
    // this build (no listener is registered for it) and the prompt's own
    // constraint is to match current listener behaviour exactly, not add a
    // trigger. The damage===0/else branch (distinct "fully blocked" vs
    // "dealt" log lines) is this call site's own decision logic and stays
    // here — dealDamage() always applies its result unconditionally
    // (subtracting 0 is a no-op), only the two log lines differ.
    const damage = dealDamage('player', rawDamage, 'enemy_attack', null, false);
    if (damage === 0) {
      log('[ENEMY] attack fully blocked (intent ' + intent + ', block ' + block + ')');
    } else {
      log('[ENEMY] dealt ' + damage + ' damage (intent ' + intent + ', block ' + block + ')');
    }
  }

  if (phase === 'CHECK_WIN_LOSS') {
    log('[PHASE] CHECK_WIN_LOSS — awaiting result');
  }
}

function nextPhase() {
  const currentPhase = gameState.turn.phase;

  // If a roll phase is ending and nothing (forced or natural) has resolved
  // its roll yet, resolve it naturally now. If a forced roll already
  // resolved it this visit, this is skipped — exactly one roll per phase.
  if (currentPhase === 'ROLL_PHASE' && !playerRollResolved) {
    playerRollResolved = true;
    const face = rollDie(gameState.die.faces);
    resolvePlayerRoll(face);
  }
  if (currentPhase === 'ENEMY_ROLL_PHASE' && !enemyRollResolved) {
    enemyRollResolved = true;
    // BUILD 075: the phase itself is unchanged and always runs (the
    // fight loop's shape is untouched) — for a dieless enemy there is
    // simply nothing to roll, so neither rollDie() nor resolveEnemyRoll()
    // (and none of their log lines) run at all.
    if (gameState.enemy.hasDie) {
      const enemyFace = rollDie(gameState.enemy.die.faces);
      resolveEnemyRoll(enemyFace);
    }
  }

  const currentIndex = PHASE_ORDER.indexOf(gameState.turn.phase);
  const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
  runPhase(PHASE_ORDER[nextIndex]);
}

// How long auto-advance pauses on ROLL_PHASE before resolving the natural
// roll. A human cannot reliably pick out and click one specific face among
// twenty within a couple hundred milliseconds, so this is a deliberate
// ~1.5-2s wait a player can act inside, not a short race window — 300ms
// (tried previously) was consistently too fast to land a real click.
const ROLL_PHASE_PAUSE_MS = 1800;

// Auto-advances through every phase that needs no player input, stopping at
// CARD_PHASE (the only phase that waits for the player) or halting early if
// runPhase()'s win/loss guard flips run.status away from 'active' mid-chain.
// Always takes at least one step, so calling this while already sitting in
// CARD_PHASE correctly runs a full turn (END_PLAYER_TURN through the next
// ROLL_PHASE) rather than doing nothing.
//
// While sitting in ROLL_PHASE with no roll resolved yet, the chain pauses
// for ROLL_PHASE_PAUSE_MS via setTimeout instead of calling nextPhase()
// immediately — synchronous code can never leave a window for a click to
// land, so this pause is what actually lets forcePlayerRoll() run before
// the natural roll does. Nothing but a face click (forcePlayerRoll, via the
// existing gating on gameState.turn.phase) or the dev tools can interrupt
// this wait — End Turn and every other control are already disabled outside
// CARD_PHASE (see refreshInspector()'s endTurnBtn.disabled line), so this
// needed no new gating of its own. When the pause elapses, nextPhase() is
// the same function used everywhere else: if a forced roll already resolved
// playerRollResolved during the pause, its own existing guard skips the
// natural roll and just advances the phase — so exactly one roll ever
// resolves, forced or natural, never both. This pause only applies to the
// player's ROLL_PHASE inside the auto-advance chain — ENEMY_ROLL_PHASE and
// every other phase transition in autoAdvanceStep()/continueAutoAdvance()
// below are untouched and still advance immediately.
function autoAdvance() {
  autoAdvanceStep();
}

function autoAdvanceStep() {
  if (gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved) {
    setTimeout(function() {
      // Abandon this continuation if something else already moved the game
      // out of ROLL_PHASE during the pause (e.g. Restart Fight clicked
      // mid-wait) — that path started its own autoAdvance chain already.
      if (gameState.turn.phase !== 'ROLL_PHASE') return;
      nextPhase();
      continueAutoAdvance();
    }, ROLL_PHASE_PAUSE_MS);
    return;
  }
  nextPhase();
  continueAutoAdvance();
}

function continueAutoAdvance() {
  if (gameState.run.status === 'active' && gameState.turn.phase !== 'CARD_PHASE') {
    autoAdvanceStep();
  }
}
