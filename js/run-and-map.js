// ============================================================
// RUN-AND-MAP.JS — BUILD 090 file split
// Die/act builders, fight-scoped reset, run start, slot dispatch, and the
// dev jump. Depends on state.js/listener-registry.js (loaded first) and
// calls into rendering.js's screen-flow functions (openRiteScreen,
// refreshInspector, and the riteStep/dieActionStep/cardRewardStep flow
// variables devJumpToSlot() clears directly) and phase-machine.js's
// runPhase()/autoAdvance() (via startFreshTurnPaused()) — both defined in
// files loaded AFTER this one. This is a forward reference, and it is the
// other half of a genuine circularity: rendering.js's map/screen code also
// calls back into this file's enterSlot()/chooseLane()/devJumpToSlot()/
// advanceRun(). Safe only because neither side is invoked until
// DOMContentLoaded (see bootstrap.js) — by then every file has executed
// and defined its globals in the one shared script scope, so it makes no
// difference which of the two loads first. Documented here rather than
// silently inherited, per the BUILD 090 prompt's explicit instruction.
// ============================================================

// ---------- RUN SCAFFOLD ----------

// Player die faces — 20 faces. Extracted verbatim from what init() used to
// build inline; called by startNewRun() so a brand new run always starts
// from the same clean die, exactly as init() always did for the one fight
// a session used to have.
function buildFreshPlayerDieFaces() {
  const faces = [];
  for (let n = 1; n <= GAME_CONFIG.DIE_SIZE.PLAYER; n++) {
    let modId = null;
    if (n === 1) modId = 'NAT_ONE';
    if (n === GAME_CONFIG.DIE_SIZE.PLAYER) modId = 'NAT_TWENTY';
    if (n === 10) modId = 'consecrate';
    // modId2 (BUILD 115): a face may hold a second mod once no blank face
    // remains for Load to offer — cap two, never three. null on every face
    // at build time; only dieActionPickLoadFace()/devLoadMod() ever write
    // it, and only onto an already-loaded, non-Nat face. See DIE FACE
    // OBJECT STRUCTURE.
    faces.push({ number: n, modId: modId, modId2: null, weight: 1 });
  }
  return faces;
}

// Enemy die faces — BUILD 098: generalised from a boss-only hardcoded
// layout into a builder any hasDie:true slot can use with its own layout.
// poisonFaceNumbers is the list of face numbers that carry
// 'enemy_buff_poison'; includeNats (boss only) puts ENEMY_NAT_ONE/
// ENEMY_NAT_TWENTY on faces 1/20 — when false (elites), those two faces
// are left as ordinary blanks (modId null), so an elite's face 1/20 roll
// and resolve exactly like any other blank face, with no Nat behaviour at
// all, per this build's explicit "Nat faces stay boss-only" rule. Called
// once by buildAct() for each of the elite/boss slots (with their own
// distinct face lists), and once more, blank, by startNewRun() as the
// live gameState.enemy.die's placeholder before any fight is entered —
// beginFightFromSlot() overwrites it with the entered slot's own die the
// moment any fight actually begins.
// BUILD 107: dieSize is now an explicit third argument (was a bare 20)
// so each caller supplies its own GAME_CONFIG.DIE_SIZE.{ELITE,BOSS} —
// this function has no way to know which enemy type it's building for on
// its own, only what poisonFaceNumbers/includeNats it was handed.
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
    // modId2 (BUILD 115): shares the player die's face shape (see DIE FACE
    // OBJECT STRUCTURE) but is never written on the enemy side — no enemy
    // action ever loads a second buff onto one of its faces. Present only
    // for structural symmetry.
    faces.push({ number: n, modId: modId, modId2: null, weight: 1 });
  }
  return faces;
}

// The act: eleven slots — a shared opening fight, then two lanes of five
// slots each that diverge, rejoin at a shared boss. BUILD 073 added the
// opening fight (both lanes pass through it, the same "shared" relationship
// the boss already has, just at the other end); BUILD 082 grew each lane
// from three slots to five, per this build's own prompt. Upper: fight,
// rite, fight, elite, rite. Lower: fight, rite, fight, fight, rite — no
// elite on the lower lane, matching that same prompt's shape exactly.
// Counting the opening as the run's first fight, the upper lane's elite is
// its lane's second normal fight, making it the run's fourth fight overall
// (opening, upper[0], upper[2], upper[3]-elite) — the exact position this
// build's prompt specified; the lower lane's own fourth fight (opening,
// lower[0], lower[2], lower[3]) lands on the same fight count but is a
// plain fight, not an elite, since only the upper lane carries one.
// HP figures are still explicit numbers, not a formula (opening 50; elite
// 100; boss 100 as of BUILD 075 — none of these three changed this build).
// Normal-fight HP still rises across each lane ending at 85, per this
// build's prompt — upper has exactly two normal fights so it reuses the
// same two endpoint values every prior build already used (70, 85); lower
// now has three (it used to have two), so a middle value was needed and
// none was specified — 78 was chosen as a roughly-even step between 70 and
// 85 (not derived from a formula, a flagged taste call, the same kind of
// judgment call this file's history already makes and documents rather
// than hides). Every fight-type slot keeps the existing normal intent band
// (6-18) unless noted (opening 4-12, boss 10-20 as of BUILD 085, elite
// 10-18 as of BUILD 086, down from 12-22 — average 14, kept below the
// boss's 15 and above normal fights' 12, since BUILD 085 had inverted
// that order). BUILD 098: the die, not just hasDie, is now what separates
// the three enemy types — normal fights and the opening fight still carry
// hasDie: false (unchanged, no die object needed since it's never read).
// The elite now carries hasDie: true and its own die: two loaded poison
// faces (7 and 14 — deliberately not the boss's 5/10/15, so the elite
// reads as a genuinely different die at a glance, not a smaller copy) and
// no Nat faces at all (includeNats false — buildEnemyDieFaces() leaves
// faces 1/20 as ordinary blanks). The boss keeps its own die unchanged:
// three poison faces (5/10/15) plus both Nats (includeNats true). Both
// die objects are built once, here, and never mutated afterward — this is
// what lets the map's own elite/boss previews (renderMapScreen(),
// rendering.js) read them directly without ever going stale no matter
// which fight was most recently entered; beginFightFromSlot() copies
// whichever slot's own die onto the live gameState.enemy.die when that
// fight actually begins.
// BUILD 125 (F31, checkpoint 2): actNumber (1-based) selects that act's own
// GAME_CONFIG.ACT_HP_MULTIPLIER/ACT_INTENT_MULTIPLIER entry, applied to
// every enemy's hp/intentMin/intentMax and to the enemy buff's own poison
// amount (which rides the intent multiplier, per the prompt), all with
// Math.ceil, fixed once here at act-build time — never read live off
// GAME_CONFIG mid-fight. Act 1's multipliers are both 1.0, so
// buildAct(1)'s output is byte-identical to the pre-125 buildAct()'s. The
// shape (opening/upper/lower/boss, F16) and every die's face layout
// (F20/F21) are unchanged per act — only the four scaled numbers above vary.
// CHECKPOINT 3 MAP: each lane grows from five slots to eight (F16), so each
// act now has 7 fights (opening + 5 lane fights/elite + boss), 21 a run.
// Both lanes keep their original five slots as an exact prefix (byte-
// identical object shapes to the pre-checkpoint-3 build) and append three
// more: Fight, Fight, Rite — this is what "Upper: Fight, Rite, Fight,
// Elite, Rite, Fight, Fight, Rite. Lower: Fight, Rite, Fight, Fight, Rite,
// Fight, Fight, Rite" (the prompt's own shape) reduces to once you notice
// both lanes' first five slots are unchanged. A normal fight's own enemy
// "type" (which NORMAL_FIGHT_HP entry it uses) is tracked per lane via a
// simple 0/1/2 rotation, incremented once per normal fight in that lane in
// slot order (rites/the elite don't advance it) — three distinct HP values
// rotating in a fixed order can never repeat on the very next normal fight,
// which is what keeps "no lane shows the same normal enemy twice in a row"
// true by construction rather than by a runtime check. The original five
// slots' own rotation values (upper: 0,2; lower: 0,1,2) are preserved
// exactly as they were hardcoded before this build, so every pre-existing
// fact/test about those five slots' HP is untouched; only the three
// appended slots are new rotation output (upper continues 0,1; lower
// continues 0,1). enemy.normalTypeIndex (new) records which rotation
// value a normal fight actually got, for tests/facts.test.js's own
// adjacency assertion — opening/elite/boss carry no such field, only
// plain 'fight' slots with a normal enemy do.
function buildAct(actNumber) {
  const normalHp = GAME_CONFIG.NORMAL_FIGHT_HP;
  const normalIntent = GAME_CONFIG.INTENT.NORMAL;
  const hpMult = GAME_CONFIG.ACT_HP_MULTIPLIER[actNumber - 1];
  const intentMult = GAME_CONFIG.ACT_INTENT_MULTIPLIER[actNumber - 1];
  const scaleHp = function(hp) { return Math.ceil(hp * hpMult); };
  const scaleIntent = function(v) { return Math.ceil(v * intentMult); };
  const buffPoisonStacks = Math.ceil(GAME_CONFIG.ENEMY_BUFF_POISON_STACKS * intentMult);

  // BUILD 141 (item B, F34) — every enemy definition now carries pattern, a
  // repeating list of 1-4 intents. Per the prompt's explicit instruction
  // ("convert every current enemy to pattern [{kind:'attack', min, max}] ...
  // so play is identical"), every enemy built here still gets exactly the
  // one-entry pattern below, using that same enemy's own (already act-
  // scaled) intentMin/intentMax — the four-wide Attack range and multi-
  // intent patterns are reserved for the designed enemies BUILD 142 adds.
  const attackPattern = function(min, max) { return [{ kind: 'attack', min: min, max: max }]; };

  const buildNormalFight = function(typeIndex) {
    const intentMin = scaleIntent(normalIntent.MIN);
    const intentMax = scaleIntent(normalIntent.MAX);
    return { type: 'fight', label: 'Fight', enemy: { hp: scaleHp(normalHp[typeIndex]), intentMin: intentMin, intentMax: intentMax, hasDie: false, buffPoisonStacks: buffPoisonStacks, normalTypeIndex: typeIndex, pattern: attackPattern(intentMin, intentMax) }, completed: false };
  };
  const buildRite = function() { return { type: 'rite', label: 'Rite', completed: false }; };
  const buildElite = function() {
    const intentMin = scaleIntent(GAME_CONFIG.INTENT.ELITE.MIN);
    const intentMax = scaleIntent(GAME_CONFIG.INTENT.ELITE.MAX);
    return { type: 'fight', label: 'Elite', enemy: { hp: scaleHp(GAME_CONFIG.HP.ELITE), intentMin: intentMin, intentMax: intentMax, hasDie: true, buffPoisonStacks: buffPoisonStacks, pattern: attackPattern(intentMin, intentMax), die: { faces: buildEnemyDieFaces(GAME_CONFIG.ELITE_DIE.POISON_FACES, GAME_CONFIG.ELITE_DIE.INCLUDE_NATS, GAME_CONFIG.DIE_SIZE.ELITE) } }, completed: false };
  };

  const openingIntentMin = scaleIntent(GAME_CONFIG.INTENT.OPENING.MIN);
  const openingIntentMax = scaleIntent(GAME_CONFIG.INTENT.OPENING.MAX);
  const bossIntentMin = scaleIntent(GAME_CONFIG.INTENT.BOSS.MIN);
  const bossIntentMax = scaleIntent(GAME_CONFIG.INTENT.BOSS.MAX);

  return {
    opening: { type: 'fight', label: 'Fight', enemy: { hp: scaleHp(GAME_CONFIG.HP.OPENING), intentMin: openingIntentMin, intentMax: openingIntentMax, hasDie: false, buffPoisonStacks: buffPoisonStacks, pattern: attackPattern(openingIntentMin, openingIntentMax) }, completed: false },
    upper: [
      buildNormalFight(0),
      buildRite(),
      buildNormalFight(2),
      buildElite(),
      buildRite(),
      buildNormalFight(0),
      buildNormalFight(1),
      buildRite()
    ],
    lower: [
      buildNormalFight(0),
      buildRite(),
      buildNormalFight(1),
      buildNormalFight(2),
      buildRite(),
      buildNormalFight(0),
      buildNormalFight(1),
      buildRite()
    ],
    boss: { type: 'fight', label: 'Boss', enemy: { hp: scaleHp(GAME_CONFIG.HP.BOSS), intentMin: bossIntentMin, intentMax: bossIntentMax, hasDie: true, buffPoisonStacks: buffPoisonStacks, pattern: attackPattern(bossIntentMin, bossIntentMax), die: { faces: buildEnemyDieFaces(GAME_CONFIG.BOSS_DIE.POISON_FACES, GAME_CONFIG.BOSS_DIE.INCLUDE_NATS, GAME_CONFIG.DIE_SIZE.BOSS) } }, completed: false }
  };
}

// Shared fight-scoped reset — everything that must reset between fights
// (poison, Penitence, block, soul, the current draw pile reshuffled from
// the persistent ownedCards collection) but never HP, never the die, never
// ownedCards itself. Used both when a new fight actually begins
// (beginFightFromSlot()) and right after a slot resolves (advanceRun()) —
// calling it in both places is deliberately redundant/idempotent, not a
// correctness dependency on call order. resetFight() (dev-only) below
// layers a full HP heal on top of this same shared reset.
function clearFightScopedState() {
  updatePlayer({
    block: 0,
    soul: gameState.player.maxSoul,
    deck: shuffle(gameState.player.ownedCards.slice()),
    hand: [],
    discard: [],
    poisonStacks: 0,
    penitenceActive: false,
    // BUILD 084: the two new Penitence/Nat 1 fields reset here, in the same
    // call and for the same reason as penitenceActive and poisonStacks —
    // both are fight-scoped, so a fresh fight always starts with Nat 1
    // unspent and the turn counter at zero.
    penitenceTurnsRemaining: 0,
    natOneFiredThisFight: false
  });
  // BUILD 141 (items B/C): Drain/Seal queues are fight-scoped, reset
  // alongside the player's other fight-scoped debuff state above.
  updatePlayer({ drainNextRound: 0, sealNextRound: [] });
  // BUILD 097: natOneFiredThisFight reset alongside the enemy's other
  // fight-scoped fields, mirroring the player's own reset three lines up.
  // BUILD 141 (item B/C): pattern walk/charge bookkeeping/Wrath are also
  // fight-scoped — beginFightFromSlot() (the real fight-entry path) already
  // sets these fresh from the entering slot's own pattern, but this shared
  // reset (also called directly by advanceRun()/resetFight()) must not
  // leave a stale in-progress charge or accumulated Wrath sitting on
  // gameState.enemy between calls.
  updateEnemy({ poisonStacks: 0, activeBuffs: [], natOneFiredThisFight: false, patternIndex: 0, chargeStage: null, chargeBroken: false, windupStartHp: null, currentEntry: null, forcedNextIntent: null, wrath: 0, wrathPending: 0 });
  updateTurn({ round: 0, cardsPlayedThisTurn: 0 });
  // BUILD 133 (checkpoint 3, Bound engine) — a Bound grant (modData.
  // boundGranted, grantBoundToFace(), pipeline.js) lasts one fight only,
  // unlike the rest of a face's modData (trigger counts, Zeal's/Cope's own
  // accumulators), which is run-scoped and deliberately untouched by this
  // function — see MULTI-MOD FACES, CLAUDE.md. Strips only that one field
  // from any face that carries it, leaving everything else on the face
  // (modId/modId2/weight, and the rest of modData) exactly as it was.
  const boundClearedFaces = gameState.die.faces.map(function(f) {
    if (!f.modData || !f.modData.boundGranted) { return f; }
    const newModData = Object.assign({}, f.modData);
    delete newModData.boundGranted;
    return Object.assign({}, f, { modData: newModData });
  });
  updateDie({ faces: boundClearedFaces });
  // BUILD 108: per-face trigger counts used to be reset here (a separate,
  // fight-scoped gameState.die.triggerCounts array). They now live inside
  // each face's own modData, alongside the die's other persistent state
  // (faces/weights/mods, Zeal's own accumulatedBonus) — run-scoped, not
  // fight-scoped, per the prompt's explicit instruction. Otherwise
  // gameState.die is untouched by this function (BUILD 133's boundGranted
  // strip above is the one deliberate exception, per its own comment).
  // BUILD 092: clearListeners('fight') removed — no registerListener() call
  // anywhere in the codebase has ever passed clearOn: 'fight' (only
  // 'permanent' and 'turn' are real), so this was always a no-op filter.
  updateRun({ status: 'active' });
}

// Starts a brand new run from scratch: full HP, a freshly built die and
// deck (per the prompt's explicit success criterion), a freshly built act,
// and lands on the map screen rather than jumping into a fight. This is
// what #startGameBtn ("New Run") calls, and what init() calls once at page
// load for the very first run of a session.
function startNewRun() {
  updatePlayer({
    hp: gameState.player.maxHp,
    block: 0,
    soul: gameState.player.maxSoul,
    poisonStacks: 0,
    penitenceActive: false,
    // BUILD 084: same two fields startNewRun() already clears alongside
    // penitenceActive, so a brand new run never inherits a spent Nat 1 or a
    // part-elapsed Penitence counter from the previous one.
    penitenceTurnsRemaining: 0,
    natOneFiredThisFight: false,
    hand: [],
    discard: []
  });
  // BUILD 108: no separate triggerCounts reset needed any more —
  // buildFreshPlayerDieFaces() already returns faces with no modData at
  // all, which is what wipes both Zeal's own accumulatedBonus and the
  // per-mod trigger counts on a brand new run.
  updateDie({ faces: buildFreshPlayerDieFaces() });
  // BUILD 141 (items B/C): pattern/charge/Wrath state and the player's own
  // Drain/Seal queues are fight-scoped, same as poisonStacks/natOneFired
  // ThisFight — reset here alongside them so a Restart Fight never carries
  // over an in-progress charge, an accumulated Wrath, a pending Drain, or a
  // queued Seal from before the reset.
  updatePlayer({ drainNextRound: 0, sealNextRound: [] });
  // BUILD 097: natOneFiredThisFight reset here too, same reason as
  // clearFightScopedState() above — a brand new run never inherits a
  // spent enemy Nat 1 from whatever the previous run last fought.
  // BUILD 098: this die is just a blank placeholder — beginFightFromSlot()
  // overwrites it with whichever slot's own die (buildAct(), below) the
  // moment any fight actually begins, so what's set here is never rolled
  // or rendered in practice (the very first slot, 'opening', has no die).
  // BUILD 107: dieSize here is arbitrary (BOSS, matching this placeholder's
  // pre-BUILD-098 boss-only shape) since nothing ever reads this die before
  // beginFightFromSlot() overwrites it.
  updateEnemy({ die: { faces: buildEnemyDieFaces([], false, GAME_CONFIG.DIE_SIZE.BOSS) }, poisonStacks: 0, activeBuffs: [], natOneFiredThisFight: false });

  const startingDeck = gameState.config.classes[gameState.player.classId].startingDeck;
  updatePlayer({ ownedCards: startingDeck.slice(), deck: shuffle(startingDeck.slice()) });

  // BUILD 092: clearListeners('fight') removed here too — same dead no-op,
  // see clearFightScopedState() above. clearListeners('turn') is untouched
  // and still live (turn-scoped mods like Consecrate/Vigil/Fervour really
  // do register with clearOn: 'turn').
  clearListeners('turn');

  updateTurn({ phase: 'START_OF_TURN', round: 0, cardsPlayedThisTurn: 0, rollOutcome: null, rolledFaceWeight: null, rolledFaceNumber: null, enemyRollOutcome: null, enemyRolledFaceNumber: null, modTriggeredThisTurn: false });

  updateRun({
    status: 'active',
    screen: 'map',
    outcome: 'active',
    lane: null,
    // BUILD 073: a run now opens on the shared opening fight, not the
    // fork — currentSlot 'opening' is a new third state (alongside null
    // and {lane,index}/'boss') meaning "the shared fight before the fork
    // is next." null now means "the fork itself is next" (only reachable
    // after 'opening' resolves — see advanceRun()).
    currentSlot: 'opening',
    act: buildAct(1),
    actNumber: 1
  });

  // BUILD 109: a brand new run always starts its run record fresh, after
  // whatever flush the caller was responsible for (the New Run click
  // handler in bootstrap.js flushes an abandoned prior run BEFORE calling
  // this function; this function itself never flushes — it only resets).
  resetRunRecord();

  log('[RUN] new run started');
  refreshInspector();
}

// ---------- RUN RECORD (BUILD 109) ----------
// Player-facing run log, not a dev tool. Written as the run happens (see
// RUN RECORD, CLAUDE.md, for the full mechanic): dieActionChooseLoad()/
// dieActionPickLoadFace()/dieActionChooseSkip() (rendering.js) append to
// gameState.runRecord.dieActionEvents; enterSlot() below updates node and
// (once, at the boss) arrivalHpAtBoss; runPhase()'s win/loss branches
// (phase-machine.js) push this fight's own round count and call
// flushRunRecord() directly. Trigger counts are read fresh off
// gameState.die.faces at flush time — never accumulated separately, per
// the prompt's explicit "not from any other source."

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

// Converts gameState.run.currentSlot into the short string the record's
// node column uses — 'opening' | 'upper-0'..'upper-4' | 'lower-0'..
// 'lower-4' | 'boss'. Mirrors the shapes currentSlot actually takes
// (STATE SCHEMA / enterSlot()'s own laneName/index pair), nothing new.
function describeSlot(currentSlot) {
  if (currentSlot === null) return null;
  if (currentSlot === 'opening' || currentSlot === 'boss') return currentSlot;
  return currentSlot.lane + '-' + currentSlot.index;
}

// Per-mod trigger counts, read fresh off gameState.die.faces — the one
// source of truth (face.modData.triggerCount/triggerCount2, BUILD 108) —
// every time the record is serialized, never tracked as a running total
// of its own. A mod that landed in a face's second slot (modId2) is keyed
// by its own mod id exactly like one in the first slot (modId): since Load
// never offers a mod already on the die (either slot), each mod id can
// only ever occupy one slot on one face at a time, so there is no
// collision to resolve here.
// BUILD 118 (KI-19 fix): was `counts[modId] = faceCount` — an OVERWRITE,
// not a sum. That's silently correct only when a mod id can appear on at
// most one face at a time, which the real in-game Load flow does enforce
// (DIE_ACTION_EXCLUDED_MOD_IDS + "already on the die" check,
// dieActionChooseLoad()) but devLoadMod() (dev-tools.js) does not — it has
// no duplicate guard at all, so a die built by hand (or by the new
// devLoadAll() below) can genuinely carry the same mod on many faces. When
// it does, this used to keep only whichever face's count happened to be
// processed last (ascending face order) and silently drop every other
// face's count for that mod — exactly how two real runs recorded
// consecrate:1 and blight:0 against dice where those mods sat on ~15/~18
// faces with real nonzero counts. Now accumulates (`+=`) across every face
// and both of a face's slots, and seeds every real mod at 0 first so one
// that never triggered — or was never loaded at all this run — still
// reports 0 rather than being omitted from the line entirely.
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

// Pushes the current (still in-progress) fight's round count onto
// fightRounds — called once by the win/loss branches in runPhase()
// (phase-machine.js) for a fight that has just ended, and once more here
// by flushRunRecord() for an abandoned run's still-unfinished fight (a
// fight only ever gets counted once: the win/loss branches call this
// before status stops being 'active', so flushRunRecord()'s own check
// below never double-counts an already-finished fight).
function recordFightRoundEnd(label) {
  const entry = { label: label, rounds: gameState.turn.round };
  updateRunRecord({ fightRounds: gameState.runRecord.fightRounds.concat([entry]) });
}

// One line per run — comma-separated columns, "|"-joined lists and ":"
// key:value pairs within a column (never a raw comma inside any column),
// so the result pastes into a spreadsheet as a clean CSV with no quoting
// needed. Column order matches RUN_RECORD_CSV_HEADER below.
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

// Appends one line to localStorage — a page opened via file:// (per
// CLAUDE.md's own "double-click index.html only" rule) has no filesystem
// write access, so this is the only place a run's data can land until the
// player copies it out (see copyRunRecordLines(), bootstrap.js's click
// handler). Guarded by r.flushed so a stray second call (e.g. a win
// detected, then New Run clicked on the resulting screen before a fresh
// run has begun) never appends a duplicate line for the same run; guarded
// by r.started so a run where the player never entered a single slot never
// writes an empty line.
function flushRunRecord(outcome) {
  const r = gameState.runRecord;
  if (r.flushed || !r.started) { return; }
  // An abandon can land mid-fight — the current fight's round count was
  // never pushed by a win/loss branch (those only fire when a fight
  // actually ends), so it's captured here, once, before serializing.
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

// Reads every line ever flushed to localStorage (every run this browser
// profile has played, human and bot alike, not just the current one —
// per the prompt's explicit "dumps everything stored") and returns the
// full CSV text (header plus every line), or null if nothing has been
// recorded yet.
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

// Best-effort clipboard write. navigator.clipboard.writeText() is the
// normal path and works under Playwright/most Chromium builds even from a
// file:// origin once clipboard permissions are granted, but isn't
// guaranteed everywhere a file:// page might run — the hidden-textarea +
// execCommand('copy') fallback below is the same trick every "copy to
// clipboard" button used before the async Clipboard API existed, and needs
// no permission prompt at all.
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
  fight: function(slot) { beginFightFromSlot(slot); },
  rite: function() { openRiteScreen(); }
};

function enterSlot(laneName, index) {
  if (gameState.run.outcome !== 'active') { return; }

  // BUILD 073: 'opening' joins 'boss' as the other single-slot special
  // case (neither lives inside an upper/lower array).
  const slot = laneName === 'boss' ? gameState.run.act.boss
    : laneName === 'opening' ? gameState.run.act.opening
    : gameState.run.act[laneName][index];
  log('[RUN] entering slot: ' + slot.label);

  // BUILD 109: run record — the node reached, updated on every real slot
  // entry (write as it happens, per the prompt), plus arrival HP the one
  // time the boss slot specifically is entered. laneName/index here are
  // this call's own arguments, not gameState.run.currentSlot (which a
  // caller may or may not have already updated) — describeSlot() accepts
  // the same {lane,index}/'opening'/'boss' shape currentSlot itself uses.
  const slotForDescribe = (laneName === 'opening' || laneName === 'boss') ? laneName : { lane: laneName, index: index };
  const runRecordChanges = { started: true, node: describeSlot(slotForDescribe) };
  if (laneName === 'boss') { runRecordChanges.arrivalHpAtBoss = gameState.player.hp; }
  updateRunRecord(runRecordChanges);

  const handler = SLOT_HANDLERS[slot.type];
  if (handler) { handler(slot); }
}

function chooseLane(laneName) {
  if (gameState.run.lane !== null) { return; }
  updateRun({ lane: laneName, currentSlot: { lane: laneName, index: 0 } });
  log('[RUN] lane chosen: ' + laneName);
  refreshInspector();
}

// DEV ONLY — jumps the run straight to any slot, regardless of whether it
// has actually been reached, then enters it through the exact same
// enterSlot() every real arrival uses — no parallel path, no bypass of
// beginFightFromSlot()/openRiteScreen(). Before entering, run state is
// rewritten exactly as a played run would have left it: every slot on the
// path to the target is marked completed, and run.lane is set to whatever
// lane the target sits on (this can reassign lane — jumping into the
// lane not currently committed to is allowed, per the prompt, and is
// exactly what "regardless of whether the run has reached it" means for a
// lane slot). No fight along the way actually runs, so none of their
// rewards are granted — player HP, die, and deck arrive exactly as they
// currently are. Does nothing once the run is already won or lost, the
// same guard every other dev control now uses (see also the
// devSkipToDieActionBtn fix below, closing the identical gap BUILD 074
// found).
function devJumpToSlot(laneName, index) {
  if (gameState.run.outcome !== 'active') { return; }

  // BUILD 078: dismiss whatever transient panel (rite choice, die action,
  // card reward) the player is mid-way through before jumping away — these
  // are module-level, not gameState, so nothing else clears them on a jump.
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
    // Reaching the boss means a lane was fully walked — keep whichever
    // lane is already committed, or default to 'upper' if none has been
    // chosen yet, and mark that whole lane completed as the path taken.
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
function beginFightFromSlot(slot) {
  updateEnemy({
    id: slot.label,
    hp: slot.enemy.hp,
    maxHp: slot.enemy.hp,
    intentMin: slot.enemy.intentMin,
    intentMax: slot.enemy.intentMax,
    // BUILD 075: read straight off the slot's own config, same as every
    // other enemy field here — only whether it's rolled/rendered depends
    // on this.
    hasDie: !!slot.enemy.hasDie,
    // BUILD 125 (F31): this act's own poison-buff amount, fixed at
    // buildAct() time — see enemy_buff_dispatch (cards-mods.js), which now
    // reads this field instead of GAME_CONFIG.ENEMY_BUFF_POISON_STACKS
    // directly.
    buffPoisonStacks: slot.enemy.buffPoisonStacks,
    // BUILD 141 (item B) — this slot's own static pattern (see buildAct()),
    // copied exactly like hp/intentMin/intentMax; the live enemy's pattern
    // walk (patternIndex) and any in-progress charge always start fresh at
    // a new fight, never carried over from whatever the previous enemy was
    // doing.
    pattern: slot.enemy.pattern,
    patternIndex: 0,
    chargeStage: null,
    chargeBroken: false,
    windupStartHp: null,
    currentEntry: null,
    forcedNextIntent: null,
    // BUILD 141 (item C) — Wrath is fight-scoped, same reasoning.
    wrath: 0,
    wrathPending: 0,
    // BUILD 098: die now varies per slot (elite: 2 poison faces only;
    // boss: 3 poison faces + both Nats — buildAct()) instead of always
    // being the same shared object. Copies the slot's own static die
    // (built once by buildAct(), never mutated) onto the live enemy —
    // the map's own preview of that same slot reads slot.enemy.die.faces
    // directly, not this live copy, so it never goes stale regardless of
    // which fight is currently active. Slots with no die (hasDie: false)
    // have no die field at all on their static config; falling back to an
    // empty face list is harmless since hasDie: false means it's never
    // rolled or rendered either way.
    die: slot.enemy.die || { faces: [] }
  });
  clearFightScopedState();
  updateRun({ screen: 'fight' });
  log('[RUN] fight begins: ' + slot.label + ' (' + slot.enemy.hp + ' HP)');
  // BUILD 095: fight-start sound, one of three variants by slot.label —
  // this is the one place a fight actually begins, for every slot type
  // (normal, opening, elite, boss all funnel through this single
  // function). 'Fight' covers both the opening and every plain normal
  // fight, since neither is distinguished from the other anywhere else in
  // the run structure.
  playAudioEvent(slot.label === 'Boss' ? 'fight_start_boss' : slot.label === 'Elite' ? 'fight_start_elite' : 'fight_start_normal');
  startFreshTurnPaused();
}

// Marks the current slot completed and moves to the next one, returning to
// the map. Shared by every slot type's resolution (a fight's reward flow
// closing, or a rite resolving) — the completion/advancement logic itself
// never branches on slot.type, only SLOT_HANDLERS above does. Never called
// for a boss win — see runPhase()'s win branch, which ends the run instead.
function advanceRun() {
  const cs = gameState.run.currentSlot;
  if (!cs) { updateRun({ screen: 'map' }); refreshInspector(); return; }

  if (cs === 'boss') {
    // BUILD 125 (F31/F32): reached only for a non-final act's boss win —
    // runPhase()'s win branch (phase-machine.js) ends the run outright on
    // the final act's boss and never opens a reward flow, so advanceRun()
    // is never called for that case. Every other boss win falls through
    // the same reward flow (die action + card reward) a normal fight win
    // does, and closing that flow lands here: start the next act rather
    // than returning to a map with nothing left on it. Player hp, die and
    // ownedCards are untouched — no heal between acts (D-27) — only
    // run.act/actNumber/currentSlot/lane are rebuilt, the same fields
    // startNewRun() itself sets for act 1.
    const nextActNumber = gameState.run.actNumber + 1;
    updateRun({ act: buildAct(nextActNumber), actNumber: nextActNumber, currentSlot: 'opening', lane: null });
    log('[RUN] act ' + nextActNumber + ' begins');
  } else if (cs === 'opening') {
    // BUILD 073: resolving the shared opening fight returns to the fork
    // (currentSlot null) — lane stays null too, so the map now shows both
    // lanes' first slots as choices, exactly like a fresh run used to on
    // its very first render.
    const newOpening = Object.assign({}, gameState.run.act.opening, { completed: true });
    updateRun({ act: Object.assign({}, gameState.run.act, { opening: newOpening }), currentSlot: null });
  } else {
    const laneArr = gameState.run.act[cs.lane].slice();
    laneArr[cs.index] = Object.assign({}, laneArr[cs.index], { completed: true });
    const newAct = Object.assign({}, gameState.run.act);
    newAct[cs.lane] = laneArr;
    // BUILD 082: was a hardcoded "< 2", correct only for the old 3-slot
    // lane (indices 0-2). Reads the lane's own current length instead of a
    // second magic number, so this never has to be touched again if a lane
    // grows or shrinks.
    const nextSlot = cs.index < laneArr.length - 1 ? { lane: cs.lane, index: cs.index + 1 } : 'boss';
    updateRun({ act: newAct, currentSlot: nextSlot });
  }

  updateRun({ screen: 'map' });
  clearFightScopedState();
  log('[RUN] advanced to next slot');
  refreshInspector();
}

// Resets the fight to round 1: block, soul, deck (reshuffled from the class
// starting deck), hand, discard, poison, enemy hp/poison/buffs, round,
// cardsPlayedThisTurn, fight-scoped listeners, and run status all reset.
// Die weights/mods are untouched — they persist between fights per the die
// face law.
//
// BUILD 049 fix: player hp is now restored to maxHp here too. The old
// "hp carries over" behaviour meant that after a loss (hp <= 0, the only
// way a loss triggers), Restart Fight set run.status back to 'active' while
// hp was still <= 0 — the very next runPhase('START_OF_TURN') call (from
// startFreshTurnPaused() immediately below) hit the top-of-function
// win/loss guard again with status now 'active' and hp still <= 0, so it
// re-triggered the loss immediately, logging [LOSS] player defeated in a
// loop with the game never reaching START_OF_TURN's own logic. Restoring
// hp here is what actually makes Restart Fight usable after a loss, not a
// reordering of existing calls — nothing here was previously restoring hp
// at all, on any path.
// DEV ONLY — full reset of the CURRENT fight (including a full HP heal),
// for testing a single fight in isolation. BUILD 068: this is no longer a
// player-facing way to undo a loss — see #devRestartFightBtn — so healing
// HP here is fine, it's dev tooling, not something a player can reach.
// Shares clearFightScopedState() with beginFightFromSlot()/advanceRun()
// (BUILD 068) for everything except the HP heal, which is unique to this
// dev tool — a normal fight-to-fight transition never heals HP. Still
// reshuffles from the player's full permanent collection (ownedCards)
// rather than the fixed starting-deck constant (via clearFightScopedState()),
// so cards added via a card reward survive a dev Restart Fight too —
// matching how die state already persists (BUILD 038).
function resetFight() {
  updatePlayer({ hp: gameState.player.maxHp });
  updateEnemy({ hp: gameState.enemy.maxHp });
  clearFightScopedState();
  log('[INIT] fight reset');
}

// Single shared entry point for "begin a fresh turn 1" — used by
// beginFightFromSlot() (so init()'s first run, New Run, and every map slot
// entry all arrive here) and by the Restart Fight click handler, so no
// future third entry point can diverge from either one.
//
// BUILD 083: the BUILD 036/037 setup pause this function was built around is
// now optional, and off by default. Still exactly one path — the only
// question is whether the proceed step happens here or waits for a click:
//
//   unchecked (default) — runs START_OF_TURN, then immediately makes the
//     same autoAdvance() call #devBeginRollBtn makes, so the fight rolls
//     with no click using the auto-advance every later round already uses.
//     ROLL_PHASE timing is untouched: autoAdvance()'s own
//     ROLL_PHASE_PAUSE_MS wait still arms exactly as it always has.
//   checked — runs START_OF_TURN and stops there, sitting with the hand
//     already drawn, until #devBeginRollBtn advances into ROLL_PHASE. This
//     is BUILD 037's behaviour, unchanged.
//
// Because the unchecked branch calls the identical autoAdvance() the Begin
// Roll button calls, an unpaused entry and a paused entry followed by Begin
// Roll execute the same code in the same order.
function startFreshTurnPaused() {
  runPhase('START_OF_TURN');
  if (!devPauseBeforeFirstRoll) { autoAdvance(); }
}
