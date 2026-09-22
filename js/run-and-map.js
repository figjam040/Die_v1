// Die/act builders, fight-scoped reset, run start, slot dispatch, and the
// dev jump. Forward-references rendering.js's screen-flow functions and
// phase-machine.js's runPhase()/autoAdvance() — safe per state.js's
// header note; rendering.js's map code calls back into this file's
// enterSlot()/chooseLane()/devJumpToSlot()/advanceRun() in turn.

// ---------- RUN SCAFFOLD ----------

function buildFreshPlayerDieFaces() {
  const faces = [];
  for (let n = 1; n <= GAME_CONFIG.DIE_SIZE.PLAYER; n++) {
    let modId = null;
    if (n === 1) modId = 'NAT_ONE';
    if (n === GAME_CONFIG.DIE_SIZE.PLAYER) modId = 'NAT_TWENTY';
    if (n === 10) modId = 'consecrate';
    faces.push({ number: n, modId: modId, modId2: null, weight: 1 });
  }
  return faces;
}

// poisonFaceNumbers is the list of faces carrying 'enemy_buff_poison';
// includeNats puts ENEMY_NAT_ONE/ENEMY_NAT_TWENTY on faces 1/dieSize —
// when false, those faces are left as ordinary blanks.
function buildEnemyDieFaces(poisonFaceNumbers, includeNats, dieSize) {
  const faces = [];
  for (let n = 1; n <= dieSize; n++) {
    let modId = null;
    if (includeNats && n === 1) {
      modId = 'ENEMY_NAT_ONE';
    } else if (includeNats && n === dieSize) {
      modId = 'ENEMY_NAT_TWENTY';
    } else if (poisonFaceNumbers.indexOf(n) !== -1) {
      modId = 'enemy_buff_poison';
    }
    faces.push({ number: n, modId: modId, modId2: null, weight: 1 });
  }
  return faces;
}

// The act: a shared opening fight, two lanes of eight slots each that
// diverge, rejoin at a shared boss. Every enemy comes from GAME_CONFIG.
// ENEMIES; HP is Math.ceil(base * that act's ACT_HP_MULTIPLIER), fixed
// once here, never read live off GAME_CONFIG mid-fight.

// A purely informational intentMin/intentMax from a pattern — nothing
// computes damage from these fields any more (see getIncomingIntentDamage()).
function patternBounds(pattern) {
  let min = null;
  let max = null;
  pattern.forEach(function(entry) {
    if (entry.kind === 'attack') {
      if (min === null || entry.min < min) min = entry.min;
      if (max === null || entry.max > max) max = entry.max;
    } else if (entry.kind === 'charge') {
      if (min === null || entry.release < min) min = entry.release;
      if (max === null || entry.release > max) max = entry.release;
    }
  });
  return { min: min || 0, max: max || 0 };
}

function buildAct(actNumber) {
  const hpMult = GAME_CONFIG.ACT_HP_MULTIPLIER[actNumber - 1];
  const intentMult = GAME_CONFIG.ACT_INTENT_MULTIPLIER[actNumber - 1];
  const scaleHp = function(hp) { return Math.ceil(hp * hpMult); };
  const buffPoisonStacks = Math.ceil(GAME_CONFIG.ENEMY_BUFF_POISON_STACKS * intentMult);
  const ENEMIES = GAME_CONFIG.ENEMIES;

  // hasDie is derived from whether the def carries a dieSpec at all —
  // act 1's lane normals carry none; act 2/3's normals and every elite/boss do.
  const buildEnemyFromDef = function(defId, hp) {
    const def = ENEMIES[defId];
    const bounds = patternBounds(def.pattern);
    const enemy = {
      name: def.name,
      hp: hp,
      intentMin: bounds.min,
      intentMax: bounds.max,
      hasDie: !!def.dieSpec,
      buffPoisonStacks: buffPoisonStacks,
      pattern: def.pattern
    };
    if (def.dieSpec) {
      enemy.die = { faces: buildEnemyDieFromSpec(def.dieSpec) };
    }
    if (def.wrathPerTrigger) {
      enemy.wrathPerTrigger = def.wrathPerTrigger;
    }
    return enemy;
  };
  const fightSlot = function(label, defId, hp) {
    return { type: 'fight', label: label, enemy: buildEnemyFromDef(defId, hp), completed: false };
  };
  const rite = function() { return { type: 'rite', label: 'Rite', completed: false }; };

  if (actNumber === 1) {
    // Act 1's five lane-fight positions each carry their own fixed HP,
    // rather than the lightest/second-lightest/heaviest rotation below.
    const laneHp = GAME_CONFIG.ACT1_LANE_FIGHT_HP;
    return {
      opening: fightSlot('Fight', 'verger_opening', scaleHp(GAME_CONFIG.HP.OPENING)),
      upper: [
        fightSlot('Fight', 'thurifer', laneHp[0]),
        rite(),
        fightSlot('Fight', 'asperser', laneHp[1]),
        fightSlot('Elite', 'lector', GAME_CONFIG.HP.ELITE),
        rite(),
        fightSlot('Fight', 'thurifer', laneHp[3]),
        fightSlot('Fight', 'asperser', laneHp[4]),
        rite()
      ],
      lower: [
        fightSlot('Fight', 'thurifer', laneHp[0]),
        rite(),
        fightSlot('Fight', 'asperser', laneHp[1]),
        fightSlot('Fight', 'verger_lane', laneHp[2]),
        rite(),
        fightSlot('Fight', 'thurifer', laneHp[3]),
        fightSlot('Fight', 'asperser', laneHp[4]),
        rite()
      ],
      boss: fightSlot('Boss', 'hierophant', GAME_CONFIG.HP.BOSS)
    };
  }

  // Acts 2/3 — lightest/second-lightest/heaviest rotation (NORMAL_FIGHT_HP
  // indices 0/1/2). Position 3 on the upper lane is the Elite instead.
  const normalHp = GAME_CONFIG.NORMAL_FIGHT_HP;
  const lightestId = actNumber === 2 ? 'chorister' : 'anchorite';
  const secondId = actNumber === 2 ? 'cantor' : 'mendicant';
  const heaviestId = actNumber === 2 ? 'flagellant' : 'inquisitor';
  const eliteId = actNumber === 2 ? 'archdeacon' : 'exarch';
  const bossId = actNumber === 2 ? 'cardinal' : 'pontifex';

  return {
    opening: fightSlot('Fight', lightestId, scaleHp(GAME_CONFIG.HP.OPENING)),
    upper: [
      fightSlot('Fight', secondId, scaleHp(normalHp[1])),
      rite(),
      fightSlot('Fight', heaviestId, scaleHp(normalHp[2])),
      fightSlot('Elite', eliteId, scaleHp(GAME_CONFIG.HP.ELITE)),
      rite(),
      fightSlot('Fight', secondId, scaleHp(normalHp[1])),
      fightSlot('Fight', heaviestId, scaleHp(normalHp[2])),
      rite()
    ],
    lower: [
      fightSlot('Fight', secondId, scaleHp(normalHp[1])),
      rite(),
      fightSlot('Fight', heaviestId, scaleHp(normalHp[2])),
      fightSlot('Fight', lightestId, scaleHp(normalHp[0])),
      rite(),
      fightSlot('Fight', secondId, scaleHp(normalHp[1])),
      fightSlot('Fight', heaviestId, scaleHp(normalHp[2])),
      rite()
    ],
    boss: fightSlot('Boss', bossId, scaleHp(GAME_CONFIG.HP.BOSS))
  };
}

// Shared fight-scoped reset — everything that must reset between fights
// (poison, Penitence, block, soul, the draw pile reshuffled from the
// persistent ownedCards collection) but never HP, never the die, never
// ownedCards itself. Used both when a fight begins (beginFightFromSlot())
// and right after a slot resolves (advanceRun()) — deliberately redundant.
function clearFightScopedState() {
  updatePlayer({
    block: 0,
    soul: gameState.player.maxSoul,
    deck: shuffle(gameState.player.ownedCards.slice()),
    hand: [],
    discard: [],
    poisonStacks: 0,
    penitenceActive: false,
    penitenceTurnsRemaining: 0,
    natOneFiredThisFight: false
  });
  updatePlayer({ drainNextRound: 0, sealNextRound: [] });
  updateEnemy({ poisonStacks: 0, activeBuffs: [], natOneFiredThisFight: false, patternIndex: 0, chargeStage: null, chargeBroken: false, windupStartHp: null, currentEntry: null, forcedNextIntent: null, wrath: 0, wrathPending: 0, pontifexDoubleAttackThisRound: false, aweStacks: 0 });
  updateTurn({ round: 0, cardsPlayedThisTurn: 0 });
  updateTurn({ sealedFaces: [] });
  // A Bound grant lasts one fight only, unlike the rest of a face's
  // modData (trigger counts, Zeal's/Cope's accumulators), which is
  // run-scoped and deliberately untouched here.
  const boundClearedFaces = gameState.die.faces.map(function(f) {
    if (!f.modData || !f.modData.boundGranted) { return f; }
    const newModData = Object.assign({}, f.modData);
    delete newModData.boundGranted;
    return Object.assign({}, f, { modData: newModData });
  });
  updateDie({ faces: boundClearedFaces });
  updateRun({ status: 'active' });
}

// Starts a brand new run from scratch: full HP, a freshly built die and
// deck, a freshly built act, lands on the map screen. Called by #startGameBtn
// ("New Run") and by init() for a session's first run.
function startNewRun() {
  updatePlayer({
    hp: gameState.player.maxHp,
    block: 0,
    soul: gameState.player.maxSoul,
    poisonStacks: 0,
    penitenceActive: false,
    penitenceTurnsRemaining: 0,
    natOneFiredThisFight: false,
    hand: [],
    discard: []
  });
  updateDie({ faces: buildFreshPlayerDieFaces() });
  updatePlayer({ drainNextRound: 0, sealNextRound: [] });
  updateTurn({ sealedFaces: [] });
  // This die is just a blank placeholder — beginFightFromSlot() overwrites
  // it with the entering slot's own die the moment any fight begins.
  updateEnemy({ die: { faces: buildEnemyDieFaces([], false, GAME_CONFIG.DIE_SIZE.BOSS) }, poisonStacks: 0, activeBuffs: [], natOneFiredThisFight: false, aweStacks: 0 });

  const startingDeck = gameState.config.classes[gameState.player.classId].startingDeck;
  updatePlayer({ ownedCards: startingDeck.slice(), deck: shuffle(startingDeck.slice()) });

  clearListeners('turn');

  updateTurn({ phase: 'START_OF_TURN', round: 0, cardsPlayedThisTurn: 0, rollOutcome: null, rolledFaceWeight: null, rolledFaceNumber: null, enemyRollOutcome: null, enemyRolledFaceNumber: null, modTriggeredThisTurn: false, cardsPlayed: [], modsTriggered: [] });

  updateRun({
    status: 'active',
    screen: 'map',
    outcome: 'active',
    lane: null,
    // currentSlot 'opening' means "the shared fight before the fork is
    // next"; null means "the fork itself is next" (after 'opening' resolves).
    currentSlot: 'opening',
    act: buildAct(1),
    actNumber: 1,
    threnodyFace: Math.floor(Math.random() * 18) + 2,
    transcript: [],
    gold: 0,
    relics: [],
    shop: null,
    removalPrice: GAME_CONFIG.SHOP.REMOVAL_BASE_PRICE,
    thirdEyeUsedThisAct: false
  });
  localStorage.removeItem(RUN_TRANSCRIPT_STORAGE_KEY);

  resetRunRecord();

  log('[RUN] new run started');
  refreshInspector();
}

// ---------- GOLD ----------

// A fight win's gold, rolled evenly within its type's range; a flat amount
// for a Boss. The final act's Boss grants none (D-22) — callers never pass
// 'Boss' for that win.
function rollGoldForSlotLabel(label) {
  if (label === 'Boss') { return GAME_CONFIG.GOLD_REWARDS.BOSS; }
  const range = label === 'Elite' ? GAME_CONFIG.GOLD_REWARDS.ELITE : GAME_CONFIG.GOLD_REWARDS.FIGHT;
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
}

function grantGoldForWin(label) {
  const amount = rollGoldForSlotLabel(label);
  const total = gameState.run.gold + amount;
  updateRun({ gold: total });
  log('[RUN] +' + amount + ' gold (total ' + total + ')');
}

// ---------- RUN RECORD ----------
// Player-facing run log, not a dev tool. See RUN RECORD, CLAUDE.md.

function resetRunRecord() {
  updateRunRecord({
    started: false,
    flushed: false,
    source: 'human',
    node: null,
    arrivalHpAtBoss: null,
    outcome: null,
    fightRounds: [],
    dieActionEvents: []
  });
}

// Converts gameState.run.currentSlot into the record's node column string.
function describeSlot(currentSlot) {
  if (currentSlot === null) return null;
  if (currentSlot === 'opening' || currentSlot === 'boss') return currentSlot;
  return currentSlot.lane + '-' + currentSlot.index;
}

// Per-mod trigger counts, read fresh off gameState.die.faces every time
// the record is serialized, never tracked as a running total. Sums across
// every face and both of a face's slots (a die built by hand, e.g.
// devLoadAll(), can carry the same mod on many faces — the real in-game
// Load flow can't), and seeds every real mod at 0 so one that never
// triggered still reports 0 rather than being omitted.
function collectTriggerCountsByMod() {
  const counts = {};
  Object.keys(gameState.config.mods).forEach(function(modId) {
    counts[modId] = 0;
  });
  gameState.die.faces.forEach(function(f) {
    if (f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY') {
      counts[f.modId] = (counts[f.modId] || 0) + ((f.modData && f.modData.triggerCount) || 0);
    }
    if (f.modId2) {
      counts[f.modId2] = (counts[f.modId2] || 0) + ((f.modData && f.modData.triggerCount2) || 0);
    }
  });
  return counts;
}

// Pushes the current fight's round count onto fightRounds — called once
// by runPhase()'s win/loss branches, and once more by flushRunRecord()
// for an abandoned run's still-unfinished fight.
function recordFightRoundEnd(label) {
  const entry = { label: label, rounds: gameState.turn.round };
  updateRunRecord({ fightRounds: gameState.runRecord.fightRounds.concat([entry]) });
}

// One line per run — comma-separated columns, "|"-joined lists, ":"
// key:value pairs within a column, never a raw comma — pastes into a
// spreadsheet as clean CSV. Column order matches RUN_RECORD_CSV_HEADER.
function buildRunRecordLine() {
  const r = gameState.runRecord;
  const totalRounds = r.fightRounds.reduce(function(sum, f) { return sum + f.rounds; }, 0);
  const fightRoundsCol = r.fightRounds.map(function(f) { return f.label + ':' + f.rounds; }).join('|');
  const eventsCol = r.dieActionEvents.map(function(e) {
    if (e.type === 'load') { return 'load:' + e.offered.join('|') + '>' + (e.picked === null ? '' : e.picked); }
    return 'skip';
  }).join(';');
  const triggerCounts = collectTriggerCountsByMod();
  const triggerCountsCol = Object.keys(triggerCounts).map(function(modId) { return modId + ':' + triggerCounts[modId]; }).join('|');
  return [
    r.source,
    r.node === null ? '' : r.node,
    r.arrivalHpAtBoss === null ? '' : r.arrivalHpAtBoss,
    r.outcome === null ? '' : r.outcome,
    fightRoundsCol,
    totalRounds,
    eventsCol,
    triggerCountsCol
  ].join(',');
}

const RUN_RECORD_CSV_HEADER = 'source,node,arrivalHpAtBoss,outcome,fightRounds,totalRounds,dieActionEvents,triggerCounts';

const RUN_RECORD_STORAGE_KEY = 'dieRunRecordLines';

// Appends one line to localStorage — a file:// page has no filesystem
// write access, so this is the only place a run's data can land until the
// player copies it out. Guarded by r.flushed against a duplicate write and
// by r.started against writing an empty line for a run never played.
function flushRunRecord(outcome) {
  const r = gameState.runRecord;
  if (r.flushed || !r.started) { return; }
  // An abandon can land mid-fight, whose round count no win/loss branch
  // has pushed yet — captured here, once, before serializing.
  if (outcome === 'abandoned' && gameState.run.screen === 'fight' && gameState.run.status === 'active') {
    recordFightRoundEnd(gameState.enemy.id);
  }
  updateRunRecord({ outcome: outcome, flushed: true });
  const line = buildRunRecordLine();
  let lines = [];
  try {
    lines = JSON.parse(localStorage.getItem(RUN_RECORD_STORAGE_KEY) || '[]');
  } catch (e) {
    lines = [];
  }
  lines.push(line);
  localStorage.setItem(RUN_RECORD_STORAGE_KEY, JSON.stringify(lines));
  log('[RUN RECORD] flushed (' + outcome + '): ' + line);
}

// Every line ever flushed to localStorage this browser profile, as full
// CSV text (header plus every line), or null if nothing recorded yet.
function collectAllRunRecordLines() {
  let lines = [];
  try {
    lines = JSON.parse(localStorage.getItem(RUN_RECORD_STORAGE_KEY) || '[]');
  } catch (e) {
    lines = [];
  }
  if (lines.length === 0) { return null; }
  return [RUN_RECORD_CSV_HEADER].concat(lines).join('\n');
}

// ---------- RUN TRANSCRIPT ----------
// Player-facing, last run only. See RUN RECORD, CLAUDE.md.

const RUN_TRANSCRIPT_STORAGE_KEY = 'dieRunTranscript';

// The one function every transcript line goes through — pushes to
// gameState.run.transcript and mirrors the whole array to localStorage,
// replaced (not appended to) on every New Run.
function appendTranscript(line) {
  updateRun({ transcript: gameState.run.transcript.concat([line]) });
  localStorage.setItem(RUN_TRANSCRIPT_STORAGE_KEY, JSON.stringify(gameState.run.transcript));
}

// Builds and appends this round's own line — called once at the end of
// ENEMY_ACT_PHASE (phase-machine.js), after the enemy's action for the
// round has fully resolved, with that action's own five-word-or-fewer
// summary (or the enemy's own Nat 1/20 wording in its place).
function appendRoundTranscript(actionSummary) {
  const t = gameState.turn;
  const e = gameState.enemy;
  const p = gameState.player;

  let rollSegment;
  if (t.rollOutcome === 'nat_twenty') {
    rollSegment = 'roll ' + t.rolledFaceNumber + ' NAT 20';
  } else if (t.rollOutcome === 'nat_one') {
    rollSegment = 'roll ' + t.rolledFaceNumber + ' NAT 1';
  } else if (t.rollOutcome === 'blank') {
    rollSegment = 'roll ' + t.rolledFaceNumber + ' blank';
  } else {
    rollSegment = 'roll ' + t.rolledFaceNumber + ' ' + t.modsTriggered.join(', ');
  }

  const line = 'R' + t.round + ' ' + e.name + ' ' + e.hp + '/' + e.maxHp + ' P' + e.poisonStacks
    + ' | ' + rollSegment
    + ' | ' + t.cardsPlayed.join(', ')
    + ' | enemy ' + actionSummary
    + ' | you ' + p.hp + '/' + p.maxHp + ' bl' + p.block + ' P' + p.poisonStacks;
  appendTranscript(line);
}

// Best-effort clipboard write, falling back to the hidden-textarea +
// execCommand('copy') trick where the async Clipboard API isn't available.
function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(function() { copyTextToClipboardFallback(text); });
  } else {
    copyTextToClipboardFallback(text);
  }
}

function copyTextToClipboardFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try { document.execCommand('copy'); } catch (e) { /* best effort */ }
  document.body.removeChild(textarea);
}

// Slot type dispatch — the map/advance logic reads slot.type through this
// table rather than an if/else, so a further slot type can be added later
// (a new key here) without reopening enterSlot() itself.
const SLOT_HANDLERS = {
  fight: function(slot, nodeLabel) { beginFightFromSlot(slot, nodeLabel); },
  rite: function() { openRiteScreen(); }
};

function enterSlot(laneName, index) {
  if (gameState.run.outcome !== 'active') { return; }

  // 'opening' joins 'boss' as the other single-slot special case (neither
  // lives inside an upper/lower array).
  const slot = laneName === 'boss' ? gameState.run.act.boss
    : laneName === 'opening' ? gameState.run.act.opening
    : gameState.run.act[laneName][index];
  log('[RUN] entering slot: ' + slot.label);

  const slotForDescribe = (laneName === 'opening' || laneName === 'boss') ? laneName : { lane: laneName, index: index };
  const nodeLabel = describeSlot(slotForDescribe);
  const runRecordChanges = { started: true, node: nodeLabel };
  if (laneName === 'boss') { runRecordChanges.arrivalHpAtBoss = gameState.player.hp; }
  updateRunRecord(runRecordChanges);

  const handler = SLOT_HANDLERS[slot.type];
  if (handler) { handler(slot, nodeLabel); }
}

function chooseLane(laneName) {
  if (gameState.run.lane !== null) { return; }
  updateRun({ lane: laneName, currentSlot: { lane: laneName, index: 0 } });
  log('[RUN] lane chosen: ' + laneName);
  refreshInspector();
}

// DEV ONLY — jumps the run straight to any slot through the exact same
// enterSlot() every real arrival uses. Run state is rewritten as a played
// run would have left it: every slot on the path is marked completed, and
// run.lane is set to whatever lane the target sits on. No fight along the
// way actually runs, so none of their rewards are granted.
function devJumpToSlot(laneName, index) {
  if (gameState.run.outcome !== 'active') { return; }

  // These are module-level, not gameState, so nothing else clears them.
  riteStep = null;
  dieActionStep = null;
  cardRewardStep = null;

  const newAct = Object.assign({}, gameState.run.act);
  if (laneName !== 'opening') {
    newAct.opening = Object.assign({}, newAct.opening, { completed: true });
  }

  let targetLane = gameState.run.lane;
  let targetSlot;
  let targetLabel;

  if (laneName === 'opening') {
    targetSlot = 'opening';
    targetLabel = gameState.run.act.opening.label;
  } else if (laneName === 'boss') {
    targetLane = gameState.run.lane || 'upper';
    newAct[targetLane] = newAct[targetLane].map(function(s) { return Object.assign({}, s, { completed: true }); });
    targetSlot = 'boss';
    targetLabel = gameState.run.act.boss.label;
  } else {
    targetLane = laneName;
    const laneArr = newAct[laneName].slice();
    for (let i = 0; i < index; i++) {
      laneArr[i] = Object.assign({}, laneArr[i], { completed: true });
    }
    newAct[laneName] = laneArr;
    targetSlot = { lane: laneName, index: index };
    targetLabel = gameState.run.act[laneName][index].label;
  }

  updateRun({ act: newAct, lane: targetLane, currentSlot: targetSlot });
  log('[DEV] jumped to slot: ' + targetLabel + ' — earlier slots skipped, no rewards granted');
  enterSlot(laneName, index);
}

// Begins the fight for a 'fight'-type slot (normal, elite, or boss — they
// differ only in the enemy config carried on the slot, per buildAct()).
function beginFightFromSlot(slot, nodeLabel) {
  updateEnemy({
    id: slot.label,
    // Display/log identity name, distinct from id (the slot label
    // 'Fight'/'Elite'/'Boss', which #enemyPanelTitle keys off).
    name: slot.enemy.name,
    hp: slot.enemy.hp,
    maxHp: slot.enemy.hp,
    intentMin: slot.enemy.intentMin,
    intentMax: slot.enemy.intentMax,
    hasDie: !!slot.enemy.hasDie,
    buffPoisonStacks: slot.enemy.buffPoisonStacks,
    pattern: slot.enemy.pattern,
    patternIndex: 0,
    chargeStage: null,
    chargeBroken: false,
    windupStartHp: null,
    currentEntry: null,
    forcedNextIntent: null,
    wrath: 0,
    wrathPending: 0,
    // Falls back to the flat default for an enemy def with no amount of
    // its own (and for devSetTestDie()'s test dice).
    wrathPerTrigger: slot.enemy.wrathPerTrigger || GAME_CONFIG.ENEMY_WRATH_AMOUNT,
    pontifexDoubleAttackThisRound: false,
    aweStacks: 0,
    // Copies the slot's own static die (built once by buildAct(), never
    // mutated) onto the live enemy — the map's own preview reads
    // slot.enemy.die.faces directly, so it never goes stale.
    die: slot.enemy.die || { faces: [] }
  });
  clearFightScopedState();
  updateRun({ screen: 'fight' });
  log('[RUN] fight begins: ' + slot.label + ' (' + slot.enemy.hp + ' HP)');
  playAudioEvent(slot.label === 'Boss' ? 'fight_start_boss' : slot.label === 'Elite' ? 'fight_start_elite' : 'fight_start_normal');
  appendTranscript('FIGHT act ' + gameState.run.actNumber + ' ' + nodeLabel + ' ' + slot.enemy.name + ' ' + slot.enemy.hp + ' | you ' + gameState.player.hp + '/' + gameState.player.maxHp);
  startFreshTurnPaused();
}

// Marks the current slot completed and moves to the next one, returning
// to the map. Never called for a final-act boss win — see runPhase()'s
// win branch, which ends the run instead.
function advanceRun() {
  const cs = gameState.run.currentSlot;
  if (!cs) { updateRun({ screen: 'map' }); refreshInspector(); return; }

  if (cs === 'boss') {
    // Reached only for a non-final act's boss win — the same reward flow
    // a normal fight win gets, then start the next act. No heal between
    // acts (D-27); player hp/die/ownedCards are untouched.
    const nextActNumber = gameState.run.actNumber + 1;
    updateRun({ act: buildAct(nextActNumber), actNumber: nextActNumber, currentSlot: 'opening', lane: null, thirdEyeUsedThisAct: false });
    log('[RUN] act ' + nextActNumber + ' begins');
  } else if (cs === 'opening') {
    // Returns to the fork (currentSlot null); lane stays null too.
    const newOpening = Object.assign({}, gameState.run.act.opening, { completed: true });
    updateRun({ act: Object.assign({}, gameState.run.act, { opening: newOpening }), currentSlot: null });
  } else {
    const laneArr = gameState.run.act[cs.lane].slice();
    laneArr[cs.index] = Object.assign({}, laneArr[cs.index], { completed: true });
    const newAct = Object.assign({}, gameState.run.act);
    newAct[cs.lane] = laneArr;
    const nextSlot = cs.index < laneArr.length - 1 ? { lane: cs.lane, index: cs.index + 1 } : 'boss';
    updateRun({ act: newAct, currentSlot: nextSlot });
  }

  updateRun({ screen: 'map' });
  clearFightScopedState();
  log('[RUN] advanced to next slot');
  refreshInspector();
}

// DEV ONLY — full reset of the CURRENT fight, including a full HP heal
// (fine for dev tooling; #devRestartFightBtn is not player-facing).
// Without the heal, Restart Fight after a loss would set run.status back
// to 'active' while hp was still <= 0, re-triggering the loss immediately
// on the next START_OF_TURN. Die weights/mods are untouched.
function resetFight() {
  updatePlayer({ hp: gameState.player.maxHp });
  updateEnemy({ hp: gameState.enemy.maxHp });
  clearFightScopedState();
  log('[INIT] fight reset');
}

// Single shared entry point for "begin a fresh turn 1" — used by
// beginFightFromSlot() and the Restart Fight handler. The setup pause
// (devPauseBeforeFirstRoll) is optional and off by default: unchecked
// runs START_OF_TURN then immediately autoAdvance()s; checked stops at
// START_OF_TURN until #devBeginRollBtn advances into ROLL_PHASE.
function startFreshTurnPaused() {
  runPhase('START_OF_TURN');
  if (!devPauseBeforeFirstRoll) { autoAdvance(); }
}
