// gameState schema, the five mutation helpers, and shuffle(). Loaded
// first; its refreshInspector()/log() calls (rendering.js) are safe
// forward references since nothing runs before DOMContentLoaded fires.

// ---------- GAME STATE ----------

// Field-by-field meanings for anything not obvious from its name: STATE
// SCHEMA, CLAUDE.md.
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
    penitenceActive: false,
    penitenceTurnsRemaining: 0,
    natOneFiredThisFight: false,
    drainNextRound: 0,
    sealNextRound: [],
    ownedCards: []
  },

  enemy: {
    id: 'test_enemy',
    hp: GAME_CONFIG.NORMAL_FIGHT_HP[0],
    maxHp: GAME_CONFIG.NORMAL_FIGHT_HP[0],
    intent: 10,
    intentMin: GAME_CONFIG.INTENT.NORMAL.MIN,
    intentMax: GAME_CONFIG.INTENT.NORMAL.MAX,
    hasDie: true,
    die: { faces: [] },
    poisonStacks: 0,
    activeBuffs: [],
    pattern: [],
    patternIndex: 0,
    chargeStage: null,
    chargeBroken: false,
    windupStartHp: null,
    currentEntry: null,
    forcedNextIntent: null,
    wrath: 0,
    wrathPending: 0,
    wrathPerTrigger: GAME_CONFIG.ENEMY_WRATH_AMOUNT,
    pontifexDoubleAttackThisRound: false,
    name: 'test_enemy',
    natOneFiredThisFight: false,
    buffPoisonStacks: GAME_CONFIG.ENEMY_BUFF_POISON_STACKS,
    aweStacks: 0
  },

  die: {
    faces: []
  },

  turn: {
    phase: 'START_OF_TURN',
    cardsPlayedThisTurn: 0,
    round: 0,
    rollOutcome: null,
    rolledFaceWeight: null,
    rolledFaceNumber: null,
    enemyRollOutcome: null,
    enemyRolledFaceNumber: null,
    modTriggeredThisTurn: false,
    enemyAttackCancelledThisTurn: false,
    outsideTriggeredFaces: [],
    roundTriggerCount: 0,
    roundTriggerCapLogged: false,
    roundSweepPlays: 0,
    hoppedFaces: [],
    sealedFaces: [],
    cardsPlayed: [],
    modsTriggered: [],
    // Watchword reads this; mod_dispatch sets it whenever a Bound face triggers.
    boundTriggeredThisRound: false,
    // Hourglass's own skip, kept apart from the enemy Nat 1's cancel so
    // each reports its own wording.
    enemyRoundSkippedThisTurn: false,
    // Second Chance is once per fight, not once per turn.
    secondChanceUsedThisFight: false
  },

  // Fight-scoped counters, zeroed by clearFightScopedState().
  fight: {
    blanksRolled: 0
  },

  run: {
    stage: 1,
    node: 1,
    status: 'active',
    screen: 'map',
    outcome: 'active',
    lane: null,
    currentSlot: null,
    act: null,
    actNumber: 1,
    threnodyFace: null,
    transcript: [],
    gold: 0,
    artifacts: [],
    shop: null,
    removalPrice: GAME_CONFIG.SHOP.REMOVAL_BASE_PRICE,
    thirdEyeUsedThisAct: false,
    weightAdded: 0,
    blanksRolled: 0
  },

  runRecord: {
    started: false,
    flushed: false,
    source: 'human',
    node: null,
    arrivalHpAtBoss: null,
    outcome: null,
    fightRounds: [],
    dieActionEvents: []
  },

  registry: {
    listeners: {}
  },

  config: {
    classes: {},
    cards: {},
    mods: {},
    cardPool: {},
    artifacts: {}
  },

  // Display-only flags, never part of the run record.
  ui: {
    logOpen: false,
    logView: 'play',
    dieInfoOpen: false,
    artifactsInfoOpen: false,
    cardsInfoOpen: false
  }

};

// Named because onNatOne() and the START_OF_TURN tick both read it and
// must never drift apart.
const PENITENCE_TURNS = GAME_CONFIG.PENITENCE_TURNS;

// ---------- STATE HELPERS ----------

function logStateChange(helperName, changes) {
  log('[STATE] ' + helperName + ': ' + JSON.stringify(changes));
}

// ---------- POP NUMBERS (F46) ----------
// Announced here, beside the [STATE] log line that records the same
// change, never from a render function: rendering only owns the drawing
// primitive (spawnFxNumber(), rendering.js). A bulk reset — a new run, a
// fight reset — raises fxSuppressDepth so its field writes pop nothing.

let fxSuppressDepth = 0;

function suppressFxNumbers(fn) {
  fxSuppressDepth++;
  try { return fn(); } finally { fxSuppressDepth--; }
}

function announceFx(anchorId, kind, delta) {
  if (fxSuppressDepth > 0 || delta === 0) { return; }
  if (typeof spawnFxNumber !== 'function') { return; }
  spawnFxNumber(anchorId, kind, delta);
}

// Block/poison pop on a gain only: their drops are the turn's own block
// clear and the poison tick, neither of which is a hit landing. Soul
// skips START_OF_TURN so the per-turn reset never pops.
function announcePlayerFx(changes, before) {
  if (gameState.run.screen !== 'fight') { return; }
  if (changes.hp !== undefined) {
    const d = gameState.player.hp - before.hp;
    if (d < 0) announceFx('playerArtBox', 'damage', d);
    else if (d > 0) announceFx('playerArtBox', 'healing', d);
  }
  if (changes.block !== undefined && gameState.player.block > before.block) {
    announceFx('playerBlockValue', 'block', gameState.player.block - before.block);
  }
  if (changes.poisonStacks !== undefined && gameState.player.poisonStacks > before.poisonStacks) {
    announceFx('playerStatusRow', 'poison', gameState.player.poisonStacks - before.poisonStacks);
  }
  if (changes.soul !== undefined && gameState.turn.phase !== 'START_OF_TURN') {
    announceFx('playerSoulValue', 'soul', gameState.player.soul - before.soul);
  }
}

function announceEnemyFx(changes, before) {
  if (gameState.run.screen !== 'fight') { return; }
  if (changes.hp !== undefined && gameState.enemy.hp < before.hp) {
    announceFx('enemyArtBox', 'damage', gameState.enemy.hp - before.hp);
  }
  if (changes.poisonStacks !== undefined && gameState.enemy.poisonStacks > before.poisonStacks) {
    announceFx('enemyStatusRow', 'poison', gameState.enemy.poisonStacks - before.poisonStacks);
  }
}

// The announcement follows refreshInspector() so a pop is placed against
// the readout it belongs to as it now reads — an enemy's status row has
// no poison icon to sit on until this change has been drawn.
function updatePlayer(changes, silent) {
  const before = { hp: gameState.player.hp, block: gameState.player.block, poisonStacks: gameState.player.poisonStacks, soul: gameState.player.soul };
  Object.assign(gameState.player, changes);
  if (!silent) logStateChange('updatePlayer', changes);
  refreshInspector();
  announcePlayerFx(changes, before);
}

function updateEnemy(changes, silent) {
  const before = { hp: gameState.enemy.hp, poisonStacks: gameState.enemy.poisonStacks };
  Object.assign(gameState.enemy, changes);
  if (!silent) logStateChange('updateEnemy', changes);
  refreshInspector();
  announceEnemyFx(changes, before);
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

function updateFight(changes, silent) {
  Object.assign(gameState.fight, changes);
  if (!silent) logStateChange('updateFight', changes);
  refreshInspector();
}

function updateRun(changes, silent) {
  const goldBefore = gameState.run.gold;
  Object.assign(gameState.run, changes);
  if (!silent) logStateChange('updateRun', changes);
  refreshInspector();
  // Gold is spent and earned off the fight screen too (shop, The Font),
  // so it is the one pop with no screen gate.
  if (changes.gold !== undefined) announceFx('goldValue', 'gold', gameState.run.gold - goldBefore);
}

function updateRunRecord(changes, silent) {
  Object.assign(gameState.runRecord, changes);
  if (!silent) logStateChange('updateRunRecord', changes);
  refreshInspector();
}

// Display-only flags (gameState.ui) — never part of the run record.
function updateUi(changes, silent) {
  Object.assign(gameState.ui, changes);
  if (!silent) logStateChange('updateUi', changes);
  refreshInspector();
}

// KI-47: HP as the player reads it (panels, layers, transcript, run record)
// never goes below 0; state itself keeps overkill unclamped.
function shownHp(hp) {
  return Math.max(0, hp);
}

// ---------- SHUFFLE ----------

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ---------- TIERED OFFERS ----------

function rollTier(splitWeights) {
  const order = GAME_CONFIG.TIER_ORDER;
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < order.length; i++) {
    cumulative += splitWeights[i];
    if (r < cumulative) return order[i];
  }
  // Float rounding can leave r past the sum; the last tier with weight wins,
  // never an empty zero-weight tier.
  for (let i = order.length - 1; i > 0; i--) {
    if (splitWeights[i] > 0) return order[i];
  }
  return order[0];
}

// A random entry of the given tier from pool ({id, tier} array), or null
// if none remain — never mutates pool.
function pickFromTier(pool, tier) {
  const matches = pool.filter(function(e) { return e.tier === tier; });
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

// Returns undefined for an empty list rather than throwing; never mutates list.
function pickRandom(list) {
  if (list.length === 0) return undefined;
  return list[Math.floor(Math.random() * list.length)];
}

// Rolls `count` choices out of `pool`, each rolling its own tier
// independently off splitWeights. If the rolled tier is empty, tries the
// next tier down (toward 'basic'), then up (toward 'void') — an offer
// fills up to count as long as pool has that many entries left. No piece
// is picked twice within one offer. rolledTier is kept distinct from the
// delivered id's own tier so a fallback substitution never contaminates a
// sample of the rolled-tier distribution.
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
