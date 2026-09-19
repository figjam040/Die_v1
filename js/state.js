// ============================================================
// STATE.JS — BUILD 090 file split
// gameState schema, the five mutation helpers, and shuffle() (a generic
// array helper used by cards-mods.js/run-and-map.js/rendering.js alike —
// no single one of those is a better home for it than this foundational
// file). Loaded first: nothing here reads any other file's value at the
// top level. updatePlayer()/updateEnemy()/updateTurn()/updateDie()/
// updateRun() all call refreshInspector() (defined in rendering.js, the
// second-to-last file loaded) and logStateChange() calls log() (also
// rendering.js) — both are safe forward references: neither is invoked
// until some game action actually runs, and nothing in this whole project
// runs before window's DOMContentLoaded fires (see bootstrap.js), by which
// point every script tag — regardless of order — has already executed and
// registered its top-level names in the one shared global scope classic
// <script src> tags all share. This is the explicit resolution to the
// BUILD 059/078 ordering-trap question raised for the BUILD 090 file
// split: it is not hoisting luck, it is (1) one shared global lexical
// environment across every <script> tag and (2) a single DOMContentLoaded-
// gated kickoff with no other eager entry point anywhere in the codebase.
// ============================================================

// ---------- GAME STATE ----------

const gameState = {

  player: {
    hp: GAME_CONFIG.PLAYER_MAX_HP,
    maxHp: GAME_CONFIG.PLAYER_MAX_HP,
    block: 0,
    soul: GAME_CONFIG.PLAYER_MAX_SOUL,
    maxSoul: GAME_CONFIG.PLAYER_MAX_SOUL,
    deck: [],
    hand: [],
    discard: [],
    classId: 'ordained',
    poisonStacks: 0,
    // BUILD 067: Penitence (Nat 1). Fight-scoped, not turn-scoped — lives
    // here alongside poisonStacks (the other fight-scoped player debuff),
    // not on gameState.turn. Cleared by resetFight() the same way
    // poisonStacks is.
    penitenceActive: false,
    // BUILD 084: how many more START_OF_TURN ticks Penitence has left.
    // Set to PENITENCE_TURNS at onset, decremented by the tick itself, and
    // the tick clears penitenceActive when it reaches 0. Meaningless while
    // penitenceActive is false; fight-scoped exactly like the flag above.
    penitenceTurnsRemaining: 0,
    // BUILD 084: Nat 1 fires once per fight. Once this is true, face 1
    // resolves as a blank (the ordinary 2-block blank passive) for the rest
    // of the fight. Deliberately separate from penitenceActive, which now
    // expires after 3 turns — a Nat 1 rolled after that expiry must still
    // resolve as a blank, not re-arm Penitence. Fight-scoped: cleared
    // alongside poisonStacks/penitenceActive, never by a turn boundary.
    natOneFiredThisFight: false,
    // The player's full permanent card collection — starts as a copy of the
    // Ordained starting deck, then grows by one id per card reward picked.
    // Distinct from deck/hand/discard (the current fight's draw pile,
    // reshuffled from this collection every resetFight()) so that reward
    // additions survive Restart Fight, matching how die state already
    // persists (BUILD 038) — resetFight() reshuffles FROM this collection
    // rather than from the fixed starting-deck constant.
    ownedCards: []
  },

  enemy: {
    id: 'test_enemy',
    // BUILD 102: this whole object is a placeholder, provably dead — it is
    // fully overwritten by beginFightFromSlot() before any real fight
    // begins, and startNewRun() never touches these fields (only
    // die/poisonStacks/activeBuffs/natOneFiredThisFight), so nothing here
    // is ever rolled or rendered while gameState.run.screen is 'map'. Found
    // during the BUILD 102 audit as a second hardcoded copy of the normal-
    // fight HP/intent facts (buildAct(), run-and-map.js, is the live one);
    // pointed at GAME_CONFIG here too rather than left as stray literals,
    // so a grep for the moved numbers finds no orphan copy.
    hp: GAME_CONFIG.NORMAL_FIGHT_HP[0],
    maxHp: GAME_CONFIG.NORMAL_FIGHT_HP[0],
    intent: 10,
    // BUILD 068: the intent-roll range at START_OF_TURN. Was a hardcoded
    // 6-18 (Math.random()*13+6); now data on the enemy so a slot's fight
    // can carry its own band (elite/boss are wider) while normal fights
    // keep this exact default, unchanged.
    intentMin: GAME_CONFIG.INTENT.NORMAL.MIN,
    intentMax: GAME_CONFIG.INTENT.NORMAL.MAX,
    // BUILD 075: die-carrying is a property of the enemy, not a hardcoded
    // assumption in the roll/render code. Set per fight in
    // beginFightFromSlot() from the slot's own enemy.hasDie; a future
    // enemy gets a die by setting that flag true, not by restoring deleted
    // roll/render code. The die system and die.faces below are untouched
    // and still fully populated even when hasDie is false — only whether
    // ENEMY_ROLL_PHASE actually rolls it and whether it's rendered depend
    // on this flag.
    hasDie: true,
    die: { faces: [] },
    poisonStacks: 0,
    activeBuffs: [],
    // BUILD 097: mirrors gameState.player.natOneFiredThisFight (BUILD 084)
    // exactly, for the enemy's own Nat 1 — fight-scoped, reset in
    // clearFightScopedState()/startNewRun() the same way the player's is.
    // Once true, ENEMY_NAT_ONE resolves as a plain blank for the rest of
    // the fight instead of re-cancelling the attack / re-poisoning itself.
    natOneFiredThisFight: false,
    // BUILD 125 (F31) — how many poison stacks a triggered enemy_buff_poison
    // face applies this fight. Fixed at enemy-slot creation (buildAct(),
    // run-and-map.js) from GAME_CONFIG.ENEMY_BUFF_POISON_STACKS scaled by
    // that act's own ACT_INTENT_MULTIPLIER (Math.ceil'd), copied onto the
    // live enemy by beginFightFromSlot() exactly like hp/intentMin/intentMax
    // — never read live off GAME_CONFIG.ENEMY_BUFF_POISON_STACKS by the
    // dispatch listener any more. Placeholder value here is dead, like the
    // rest of this block — overwritten before any real fight begins.
    buffPoisonStacks: GAME_CONFIG.ENEMY_BUFF_POISON_STACKS
  },

  die: {
    faces: []
    // BUILD 108: the BUILD 103 per-face trigger count (a separate
    // gameState.die.triggerCounts array, indexed by face number) was folded
    // into each face's own modData instead — a parallel-array-keyed-by-
    // face-number structure is exactly the shape the carry-forward rule
    // (see MULTI-MOD FACES, CLAUDE.md) forbids, and BUILD 103 was itself the
    // one prior exception to it. Every loaded face's modData now carries
    // triggerCount (for modId) and, on a two-mod face, triggerCount2 (for
    // modId2) — see DIE FACE OBJECT STRUCTURE. Generic across every mod,
    // same as before, just no longer a second top-level array. Also
    // run-scoped now, not fight-scoped: modData lives on the face object
    // itself, and a fresh run's faces (buildFreshPlayerDieFaces()) start
    // with no modData at all, so a Restart Fight (which never touches
    // gameState.die) leaves both counters and Zeal's own accumulatedBonus
    // intact across the reset — only startNewRun()'s brand-new faces wipe
    // them, exactly as Zeal's own counter already worked before this build.
  },

  turn: {
    phase: 'START_OF_TURN',
    cardsPlayedThisTurn: 0,
    round: 0,
    rollOutcome: null,
    rolledFaceWeight: null,
    // BUILD 090: which face number was rolled this turn, for the die-row
    // highlight — a gameState property, not a module-scope variable, per
    // the BUILD 078 riteStep lesson (module-scope flow state gets missed by
    // resets/dev-jumps that only ever touch gameState).
    rolledFaceNumber: null,
    // BUILD 101: enemy-side mirror of rollOutcome/rolledFaceNumber above,
    // for the enemy die-row highlight in the roll strip. Same lifecycle:
    // set in resolveEnemyRoll() (pipeline.js), cleared alongside the
    // player fields at the next START_OF_TURN and on fight reset.
    enemyRollOutcome: null,
    enemyRolledFaceNumber: null,
    modTriggeredThisTurn: false,
    // BUILD 097: set by the enemy's own Nat 1 passive (boss_nat_one_passive,
    // registered in init()) during ENEMY_ROLL_PHASE; read once, later the
    // same turn, by ENEMY_ACT_PHASE, which skips its whole intent/block/
    // damage computation entirely when this is true — no damage, no intent
    // resolution, matching "the enemy's attack that turn is cancelled
    // entirely." Turn-scoped: cleared alongside rollOutcome etc. at the
    // next START_OF_TURN, the same single clear site every other per-turn
    // roll flag already uses.
    enemyAttackCancelledThisTurn: false,
    // BUILD 132 (checkpoint 3, prompt D) — round-scoped record for
    // triggerFaceOutsideRoll() (pipeline.js): which face numbers have
    // already been triggered outside a roll this round (each face at most
    // once this way per round) and how many real triggers this round have
    // counted toward GAME_CONFIG.ROUND_TRIGGER_CAP (D-51). Both cleared at
    // the next START_OF_TURN, same single clear site every other per-round
    // roll flag above already uses.
    outsideTriggeredFaces: [],
    roundTriggerCount: 0,
    // BUILD 137 — the round-trigger-cap log line (triggerFaceOutsideRoll(),
    // pipeline.js) used to print every time the cap refused a trigger,
    // flooding the log on a round with many refused triggers. Now prints at
    // most once per round: set true the first time it fires, checked before
    // logging, cleared at the same next START_OF_TURN every other
    // round-scoped flag above already resets at.
    roundTriggerCapLogged: false,
    // BUILD 133 (checkpoint 3, Bound engine) — fast sweep timing. Counts
    // every sweep-played trigger this round (Nat 20 sweeps and Bound scans
    // alike, via pipeline.js's playSweep()) so a sweep can tell whether it's
    // past its round's third trigger yet and switch to the fast delay.
    // Round-scoped, same single clear site as outsideTriggeredFaces/
    // roundTriggerCount above.
    roundSweepPlays: 0,
    // BUILD 138 — die feedback: which face numbers have hopped (moved to
    // the rolled-face indent+yellow look) this round by firing WITHOUT
    // being the face actually rolled — a Nat 20 sweep, a Bound scan, or an
    // outside-roll trigger (Threnody/Reverberation/Magnificat/Novena), via
    // triggerFaceOutsideRoll() and onNatTwenty() (pipeline.js/cards-mods.js).
    // Appended in firing order, one entry per face (a face already present
    // is never re-added). Read by renderDieList() (rendering.js) to apply
    // the same die-row-rolled/-flash look a rolled face gets. Round-scoped,
    // same single clear site as outsideTriggeredFaces/roundTriggerCount
    // above.
    hoppedFaces: []
  },

  run: {
    stage: 1,
    node: 1,
    status: 'active',
    // BUILD 068: run scaffold — the first system above a single fight.
    // status (above) is unchanged and stays fight-scoped: 'active'/'win'/
    // 'loss' for the CURRENT fight only, exactly as every prior build left
    // it. Everything below is genuinely run-scoped, persists across
    // fights, and is only reset by startNewRun().
    screen: 'map',        // 'map' | 'fight' — which top-level screen is shown
    outcome: 'active',    // 'active' | 'won' | 'lost' — the WHOLE run's outcome
    lane: null,            // null | 'upper' | 'lower' — chosen at the divergence, never changes after
    currentSlot: null,     // null (at the fork) | { lane, index } | 'boss'
    act: null,             // built by buildAct(actNumber) in startNewRun()/the act-transition step; see those functions
    // BUILD 125 (F31) — which of GAME_CONFIG.ACTS acts is live, 1-based. Set
    // to 1 by startNewRun(), incremented only when a non-final act's boss is
    // defeated (advanceRun()'s 'boss' branch) — the trigger for rebuilding
    // gameState.run.act via buildAct(actNumber) with that act's own
    // multipliers. Never reset mid-act; player hp/die/deck are untouched by
    // an act transition (D-27: no heal between acts).
    actNumber: 1
  },

  // BUILD 109: the run record — a player-facing, localStorage-backed log of
  // one line per run (human or bot), built up as the run happens rather
  // than reconstructed at the end. Run-scoped: reset only by startNewRun()
  // (resetRunRecord(), run-and-map.js), never by a fight reset. See RUN
  // RECORD (CLAUDE.md) for the full mechanic and column meanings.
  runRecord: {
    started: false,          // true once enterSlot() has entered at least one real slot this run — an empty/never-played run never flushes a line
    flushed: false,          // true once this run's line has been written to localStorage — guards against a double flush (e.g. win detected, then New Run clicked on the resulting screen)
    source: 'human',         // 'human' | 'bot' — always 'human' from real play; a hook for a future headless writer, not read from anywhere yet
    node: null,              // last slot entered, as a short string ('opening' | 'upper-0' ... | 'boss') — see describeSlot()
    arrivalHpAtBoss: null,   // gameState.player.hp at the instant the boss slot is entered; null if the boss was never reached
    outcome: null,           // 'won' | 'lost' | 'abandoned' — set once, at flush time
    fightRounds: [],         // [{ label, rounds }, ...] — one entry per fight that has ended (win) or was in progress at flush time; total rounds is this array's own rounds summed, never tracked separately
    dieActionEvents: []      // [{ type: 'load', offered: [modId,...], picked: modId|null } | { type: 'skip' }] — one entry per Load offer shown (patched with its pick once made) or Skip chosen, in chronological order
  },

  registry: {
    listeners: {}
  },

  config: {
    classes: {},
    cards: {},
    mods: {},
    // Stage 1.11 card reward pool. Currently the eight tier-1 cards added
    // in substage 2 (rebuke/censure/judgement/vestment/litany/scripture/
    // communion/censer) — the reward screen draws its 3 offered options
    // from here. Each entry is the same object reference also registered
    // in config.cards (not a copy), so once a picked card is added to the
    // player's deck it's playable through the exact same getCard()/
    // drawCards()/playCard() path every other card already uses.
    cardPool: {}
  }

};

// BUILD 084: Penitence lasts exactly this many turns from onset, replacing
// BUILD 067's "rest of the fight". Named rather than inlined because two
// distant places read it — onNatOne() sets the counter from it, and the
// START_OF_TURN tick decrements that counter — and they must never drift
// apart. The soul loss itself is unchanged: still 1 per turn, still
// immediately after the soul reset.
const PENITENCE_TURNS = GAME_CONFIG.PENITENCE_TURNS;

// ---------- STATE HELPERS ----------

function logStateChange(helperName, changes) {
  log('[STATE] ' + helperName + ': ' + JSON.stringify(changes));
}

function updatePlayer(changes, silent) {
  Object.assign(gameState.player, changes);
  if (!silent) logStateChange('updatePlayer', changes);
  refreshInspector();
}

function updateEnemy(changes, silent) {
  Object.assign(gameState.enemy, changes);
  if (!silent) logStateChange('updateEnemy', changes);
  refreshInspector();
}

function updateTurn(changes, silent) {
  Object.assign(gameState.turn, changes);
  if (!silent) logStateChange('updateTurn', changes);
  refreshInspector();
}

function updateDie(changes, silent) {
  Object.assign(gameState.die, changes);
  if (!silent) logStateChange('updateDie', changes);
  refreshInspector();
}

function updateRun(changes, silent) {
  Object.assign(gameState.run, changes);
  if (!silent) logStateChange('updateRun', changes);
  refreshInspector();
}

function updateRunRecord(changes, silent) {
  Object.assign(gameState.runRecord, changes);
  if (!silent) logStateChange('updateRunRecord', changes);
  refreshInspector();
}

// ---------- SHUFFLE ----------

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------- TIERED OFFERS (BUILD 129, checkpoint 3 tiers) ----------

// Rolls one of GAME_CONFIG.TIER_ORDER off a [common, uncommon, rare]
// probability triple, using the same Math.random() source shuffle() above
// already uses.
function rollTier(splitWeights) {
  const order = GAME_CONFIG.TIER_ORDER;
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < order.length; i++) {
    cumulative += splitWeights[i];
    if (r < cumulative) return order[i];
  }
  return order[order.length - 1];
}

// A random entry of the given tier from pool (an array of {id, tier}), or
// null if none remain — never mutates pool.
function pickFromTier(pool, tier) {
  const matches = pool.filter(function(e) { return e.tier === tier; });
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

// Checkpoint 3, Bound pieces (Herald). A random entry from list, off the
// same Math.random() source shuffle()/rollTier()/pickFromTier() above
// already use — no second RNG source anywhere in this file. Returns
// undefined for an empty list rather than throwing; never mutates list.
function pickRandom(list) {
  if (list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

// Rolls `count` choices out of `pool` (an array of {id, tier} — every
// offerable piece, already filtered to what's actually eligible this
// offer), each choice rolling its own tier independently off splitWeights.
// If the rolled tier has nothing left in pool (already picked earlier in
// this same offer, or empty to begin with), tries the next tier down
// (TIER_ORDER, toward 'common'), then, if still nothing, the tiers above
// (toward 'rare') — so an offer is always filled up to count as long as
// pool has that many entries left, regardless of tier. No piece is ever
// picked twice within one offer (removed from the working copy the moment
// it's chosen). Returns one entry per choice: { id, rolledTier } —
// rolledTier is what rollTier() actually rolled, kept distinct from the
// delivered id's own tier so a fallback substitution never contaminates a
// test's sample of the rolled-tier distribution against splitWeights.
function pickTieredOffer(pool, splitWeights, count) {
  const order = GAME_CONFIG.TIER_ORDER;
  const remaining = pool.slice();
  const results = [];
  for (let i = 0; i < count && remaining.length > 0; i++) {
    const rolledTier = rollTier(splitWeights);
    const rolledIndex = order.indexOf(rolledTier);
    let picked = null;
    for (let idx = rolledIndex; idx >= 0 && !picked; idx--) {
      picked = pickFromTier(remaining, order[idx]);
    }
    if (!picked) {
      for (let idx = rolledIndex + 1; idx < order.length && !picked; idx++) {
        picked = pickFromTier(remaining, order[idx]);
      }
    }
    if (picked) {
      results.push({ id: picked.id, rolledTier: rolledTier, fallback: picked.tier !== rolledTier });
      remaining.splice(remaining.indexOf(picked), 1);
    }
  }
  return results;
}
