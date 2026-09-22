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
    modsTriggered: []
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
    transcript: []
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
    cardPool: {}
  },

  // Display-only flags, never part of the run record.
  ui: {
    logOpen: false,
    logView: 'play'
  }

};

// Named because onNatOne() and the START_OF_TURN tick both read it and
// must never drift apart.
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

// Display-only flags (gameState.ui) — never part of the run record.
function updateUi(changes, silent) {
  Object.assign(gameState.ui, changes);
  if (!silent) logStateChange('updateUi', changes);
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

// ---------- TIERED OFFERS ----------

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
// next tier down (toward 'common'), then up (toward 'rare') — an offer
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
