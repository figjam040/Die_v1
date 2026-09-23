// Phase sequencing: PHASE_ORDER, runPhase(), nextPhase(), the roll-pause
// auto-advance chain, and the two roll-resolved flags both this file and
// dev-tools.js's force-roll functions read/write. Forward-references
// rendering.js's openDieActionScreen()/dieActionsRemaining — safe per
// state.js's header note.

// Whether this turn's roll has already resolved (naturally or forced),
// per die — ensures exactly one roll per phase visit.
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

// Shared "did that just kill the enemy" check, called from any player-side
// dispatch that can deal damage outside a phase transition.
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
      recordFightRoundEnd(gameState.enemy.id);
      appendTranscript('WON r' + gameState.turn.round + ' | you ' + gameState.player.hp + '/' + gameState.player.maxHp);
      // A boss win only ends the run (VICTORY, D-22) on the FINAL act.
      // Every earlier act's boss grants the usual reward flow first.
      if (gameState.run.currentSlot === 'boss') {
        playAudioEvent('boss_defeated');
        if (gameState.run.actNumber >= GAME_CONFIG.ACTS) {
          updateRun({ outcome: 'won' });
          log('[RUN] boss defeated — run complete');
          flushRunRecord('won');
          return;
        }
        log('[RUN] act ' + gameState.run.actNumber + ' boss defeated');
        grantGoldForWin('Boss');
        dieActionsRemaining = GAME_CONFIG.DIE_REWARDS.SINGLE;
        openArtifactRewardScreen();
      } else {
        playAudioEvent('fight_won');
        const cs = gameState.run.currentSlot;
        const wonSlot = cs === 'opening' ? gameState.run.act.opening : gameState.run.act[cs.lane][cs.index];
        grantGoldForWin(wonSlot.label);
        dieActionsRemaining = (wonSlot.label === 'Elite') ? GAME_CONFIG.DIE_REWARDS.ELITE : GAME_CONFIG.DIE_REWARDS.SINGLE;
        if (wonSlot.label === 'Elite') {
          openArtifactRewardScreen();
        } else {
          openDieActionScreen();
        }
      }
      return;
    }
    if (gameState.player.hp <= 0) {
      updateRun({ status: 'loss', outcome: 'lost' });
      log('[LOSS] player defeated');
      log('[RUN] run over');
      playAudioEvent('fight_lost');
      recordFightRoundEnd(gameState.enemy.id);
      appendTranscript('LOST r' + gameState.turn.round + ' | you ' + gameState.player.hp + '/' + gameState.player.maxHp);
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

    resetSoundChains();

    if (gameState.player.poisonStacks > 0) {
      const poisonDamage = calculateDamage(gameState.player.poisonStacks, 'poison');
      const newStacks = gameState.player.poisonStacks - 1;
      const hpBefore = gameState.player.hp;
      const hpAfter = hpBefore - poisonDamage;
      updatePlayer({ hp: hpAfter, poisonStacks: newStacks });
      log('[POISON] player takes ' + poisonDamage + ' damage: HP ' + hpBefore + ' to ' + hpAfter);
    }

    // Re-enters runPhase() so the top guard fires before the enemy tick
    // runs for a player the poison tick above just killed.
    if (gameState.player.hp <= 0) {
      runPhase(phase);
      return;
    }

    if (gameState.enemy.poisonStacks > 0) {
      // Bypasses block by construction — straight to enemy.hp.
      const poisonDamage = calculateDamage(gameState.enemy.poisonStacks, 'poison');
      const newStacks = gameState.enemy.poisonStacks - 1;
      updateEnemy({ hp: gameState.enemy.hp - poisonDamage, poisonStacks: newStacks });
      log('[POISON] ' + poisonDamage + ' damage, ' + newStacks + ' stacks of poison remaining');
    }

    if (gameState.enemy.hp <= 0) {
      runPhase(phase);
      return;
    }

    if (gameState.enemy.aweStacks > 0) {
      const aweRemaining = gameState.enemy.aweStacks - 1;
      updateEnemy({ aweStacks: aweRemaining });
      log('[AWE] ' + aweRemaining + ' stacks of awe remaining');
    }

    // Enemies act from a repeating pattern of 1-4 intents — see
    // advanceEnemyIntentForRound() (pipeline.js). Runs after the enemy's own
    // poison tick above so a Charge's break check counts that tick (KI-28).
    advanceEnemyIntentForRound();

    // A Seal lasts one round: REPLACED (not appended) every START_OF_TURN, even when empty.
    gameState.player.sealNextRound.forEach(function(faceNumber) {
      log('[ENEMY] Face ' + faceNumber + ' is sealed and counts as blank.');
    });
    updateTurn({ sealedFaces: gameState.player.sealNextRound.slice() });
    updatePlayer({ sealNextRound: [] });

    const blockBefore = gameState.player.block;
    updatePlayer({ block: 0 });
    log('[START] block cleared: ' + blockBefore + ' to 0');

    const soulAfterDrain = Math.max(0, gameState.player.maxSoul - gameState.player.drainNextRound);
    updatePlayer({ soul: soulAfterDrain, drainNextRound: 0 });
    log('[START] soul reset to ' + soulAfterDrain);

    // Onset happens in ROLL_PHASE, so the three ticks land on the three
    // START_OF_TURNs following onset; the third deducts and clears the flag.
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

    // Clears every per-turn/per-round roll flag so none leaks forward.
    updateTurn({ rollOutcome: null, rolledFaceWeight: null, rolledFaceNumber: null, enemyRollOutcome: null, enemyRolledFaceNumber: null, modTriggeredThisTurn: false, enemyAttackCancelledThisTurn: false, outsideTriggeredFaces: [], roundTriggerCount: 0, roundSweepPlays: 0, roundTriggerCapLogged: false, hoppedFaces: [], cardsPlayed: [], modsTriggered: [], boundTriggeredThisRound: false, enemyRoundSkippedThisTurn: false, gildedFace: null });

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
    // Hourglass: round 1's intent is skipped, the pattern advancing as if
    // it had resolved. Set by the artifact's own listener, which this
    // phase's generic callListeners(phase) call has already run.
    if (gameState.turn.enemyRoundSkippedThisTurn) {
      log('[ARTIFACT] Hourglass: ' + gameState.enemy.name + ' does nothing this round');
      advanceEnemyPattern();
      appendRoundTranscript('hourglass: no action');
      return;
    }

    // The enemy's own Nat 1 cancels this round's intent entirely — every
    // case reduces to: advance the pattern, no effect.
    if (gameState.turn.enemyAttackCancelledThisTurn) {
      log('[ENEMY] attack cancelled by its own Nat 1');
      advanceEnemyPattern();
      appendRoundTranscript('nat 1 cancelled');
      return;
    }

    const entry = gameState.enemy.currentEntry;
    const block = gameState.player.block;
    const enemyName = gameState.enemy.name;

    // Pontifex's own Nat 20: an Attack this round resolves twice.
    const pontifexDouble = gameState.enemy.pontifexDoubleAttackThisRound;
    if (pontifexDouble) {
      updateEnemy({ pontifexDoubleAttackThisRound: false });
    }

    let actionSummary;

    if (entry && entry.kind === 'charge') {
      if (gameState.enemy.chargeStage === 'windup') {
        log('[ENEMY] ' + enemyName + ' winds up.');
        actionSummary = 'windup ' + entry.release + ' break ' + entry.breakAt;
      } else {
        if (gameState.enemy.chargeBroken) {
          log('[ENEMY] ' + enemyName + '\'s release is lost.');
          actionSummary = 'release broken';
        } else {
          const rawDamage = Math.max(0, entry.release - block);
          const blockedAmount = Math.min(entry.release, block);
          if (blockedAmount > 0) { playAudioEvent('block_absorb'); }
          const damage = dealDamage('player', rawDamage, 'enemy_attack', null, false);
          log('[ENEMY] ' + enemyName + ' releases for ' + damage + '.');
          actionSummary = 'release ' + entry.release + ' for ' + damage;
        }
        advanceEnemyPattern();
      }
    } else if (entry && entry.kind === 'afflict') {
      const stacks = entry.stacks;
      const newStacks = gameState.player.poisonStacks + stacks;
      updatePlayer({ poisonStacks: newStacks });
      log('[ENEMY] ' + enemyName + ' afflicts: ' + stacks + ' stacks of poison.');
      actionSummary = 'afflict ' + stacks;
      advanceEnemyPattern();
    } else {
      const rolledIntent = entry ? entry.rolledValue : 0;
      const aweStacks = gameState.enemy.aweStacks;
      const intent = aweStacks > 0 ? Math.max(0, rolledIntent - aweStacks) : rolledIntent;
      if (aweStacks > 0) {
        log('[ENEMY] attack ' + rolledIntent + ' lowered by ' + aweStacks + ' stacks of awe to ' + intent);
      }
      const rawDamage = Math.max(0, intent - block);
      const blockedAmount = Math.min(intent, block);
      if (blockedAmount > 0) {
        playAudioEvent('block_absorb');
      }
      // 'enemy_attack', not 'attack', so Fervour never doubles it.
      const damage = dealDamage('player', rawDamage, 'enemy_attack', null, false);
      if (pontifexDouble) {
        const damage2 = dealDamage('player', rawDamage, 'enemy_attack', null, false);
        log('[ENEMY] ' + enemyName + '\'s Nat 20: the Attack resolves twice — dealt ' + damage + ' + ' + damage2 + ' damage (intent ' + intent + ', block ' + block + ')');
        actionSummary = 'attack twice for ' + damage + '+' + damage2;
      } else if (damage === 0) {
        log('[ENEMY] attack fully blocked (intent ' + intent + ', block ' + block + ')');
        actionSummary = 'attack ' + intent + ' blocked';
      } else {
        log('[ENEMY] dealt ' + damage + ' damage (intent ' + intent + ', block ' + block + ')');
        actionSummary = 'attack ' + intent + ' for ' + damage;
      }
      advanceEnemyPattern();
    }

    appendRoundTranscript(actionSummary);
  }

  if (phase === 'CHECK_WIN_LOSS') {
    log('[PHASE] CHECK_WIN_LOSS — awaiting result');
  }
}

function nextPhase() {
  const currentPhase = gameState.turn.phase;

  if (currentPhase === 'ROLL_PHASE' && !playerRollResolved) {
    playerRollResolved = true;
    const face = rollWithArtifacts(gameState.die.faces);
    resolvePlayerRoll(face);
    // Tolling Bell — a second roll, fully after the first resolves, while
    // the enemy is mid-Charge (wind-up or release) this round. Goes
    // through the same resolvePlayerRoll() dispatch, so a Nat on either
    // roll behaves exactly as it always does and both count toward
    // GAME_CONFIG.ROUND_TRIGGER_CAP via mod_dispatch as usual.
    if (hasArtifact('tolling_bell') && (gameState.enemy.chargeStage === 'windup' || gameState.enemy.chargeStage === 'release')) {
      const secondFace = rollWithArtifacts(gameState.die.faces);
      log('[ARTIFACT] Tolling Bell: second face ' + secondFace.number + ' triggers');
      resolvePlayerRoll(secondFace);
    }
  }
  if (currentPhase === 'ENEMY_ROLL_PHASE') {
    if (!enemyRollResolved) {
      enemyRollResolved = true;
      if (gameState.enemy.hasDie) {
        const enemyFace = rollDie(gameState.enemy.die.faces);
        resolveEnemyRoll(enemyFace);
      }
    }
    // A few designed enemies also react to the PLAYER's own roll. Called
    // unconditionally so it still runs once per round when forced.
    applyEnemyReads();
  }

  const currentIndex = PHASE_ORDER.indexOf(gameState.turn.phase);
  const nextIndex = (currentIndex + 1) % PHASE_ORDER.length;
  runPhase(PHASE_ORDER[nextIndex]);
}

// Long enough for a human to click one specific face among twenty.
const ROLL_PHASE_PAUSE_MS = 1800;

// Auto-advances through every phase needing no player input, stopping at
// CARD_PHASE. While sitting in ROLL_PHASE unresolved, pauses via
// setTimeout (synchronous code can't leave a window for a click to land)
// — if a forced roll resolves first, nextPhase()'s own guard skips the
// natural roll, so exactly one roll ever happens.
function autoAdvance() {
  autoAdvanceStep();
}

function autoAdvanceStep() {
  if (gameState.turn.phase === 'ROLL_PHASE' && !playerRollResolved) {
    setTimeout(function() {
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
