# CLAUDE.md — Die V1

This file is the source of truth for building. It lives at C:\Users\figja\Die_v1\CLAUDE.md.

Read this file at the start of every session before doing anything else.

---


# PROJECT

Single HTML file (index.html) plus fifteen plain JavaScript files under /js/, loaded via ordinary `<script src>` tags in a fixed order: config.js, state.js, listener-registry.js, audio.js, pipeline.js, cards-mods.js, run-and-map.js, phase-machine.js, rendering.js, render-fight.js, render-map.js, render-layers.js, render-text.js, dev-tools.js, bootstrap.js. rendering.js holds log(), refreshInspector() and renderCard(); render-fight.js the fight screen and face rows; render-map.js the map; render-layers.js the reward and info layers, shop, rite and The Font; render-text.js hover boxes, pops, the roll animation and the text tables. No ES modules — file:// origins are null and module scripts are CORS-blocked, a hard constraint, not a style choice. No build step. No npm. No server.

config.js is the one constants file, loaded first, before state.js. Every tunable number/structural constant lives on one object, GAME_CONFIG — every other file reads it from there instead of repeating a literal. Its header comment carries the FACTS block (F01-F39+) verbatim from the Notion "Die — V1" page, one line per fact beside the GAME_CONFIG field(s) implementing it — the one place F-numbers live in code.

All fifteen files share one global lexical scope, as one giant inline `<script>` block would, so a top-level name declared in two files silently overwrites the first; guardrails.test.js fails on any duplicate. The only eager trigger anywhere is `window.addEventListener('DOMContentLoaded', init)` in bootstrap.js — nothing calls a game function at parse time, so cross-file references are safe regardless of script tag order.

File: C:\Users\figja\Die_v1\index.html (loads the fifteen js/ files above).
Open in browser to test. Double-click index.html only — never through a local server. /audio/ and /art/ are empty asset folders; nothing populates them — see AUDIO MODULE. /fonts/ holds the game's two self-hosted OFL font files (Press Start 2P, VT323), loaded by index.html's @font-face rules.

tests/facts.test.js — plain Node script (raw `playwright`, no test runner), `node tests/facts.test.js`. Asserts every F-number against GAME_CONFIG and the live gameState/DOM of a fresh run, its opening fight or a dev-jumped elite/boss. A mismatch fails. It keeps the F-number tests and those with no BUILD label; a BUILD-labelled test lives in that build's own file.

tests/mods.test.js — same shape, `node tests/mods.test.js`. For each of config.mods' reward-eligible entries, dev-loads it onto a face and forces that roll through the real forcePlayerRoll()/MOD_TRIGGER dispatch, asserting the exact numeric effect on gameState.

tests/build141.test.js, tests/build142.test.js, etc. — same shape, one file per build shipping new mechanics, asserting that build's own items; build108 to build139 hold the tests split out of facts.test.js and mods.test.js by BUILD label.

tests/autoplay.js — headless autoplayer, `node tests/autoplay.js`; its constants and base helpers live in tests/autoplay-lib.js. Plays whole runs through real gameplay only (map clicks, playCard(), nextPhase()'s natural rolls, the real reward panels), never a dev force or jump, on a seeded Math.random, with a fixed policy documented in the file. Appends one CSV row per run to tests/autoplay_results.csv (git-ignored). A measurement tool, never run except when explicitly asked (D-70). index.html loads nothing under tests/.

tests/screenshots.js, tests/pngdiff.js — regenerate verify/ (seeded Math.random, #buildStamp hidden, so two runs are pixel-identical) and, with --compare[=HASH], diff the working tree against that commit's own shots (default the parent of HEAD), one line per changed bounding box; --from=HASH shoots a commit instead of the tree.

---

# WHAT THIS GAME IS

A roguelike deckbuilder built on Slay the Spire's skeleton, with a D20 as the second power axis.

Every face of the die starts blank. The player rolls once per turn before playing cards. Between fights they reshape the die — loading mods onto blank faces, weighting faces to come up more often.

Core sentence: You are not rolling for an outcome. You are building the distribution you roll on.

Every mechanic must let the player shape or exploit the distribution. If it does not, it does not belong in V1.

---

# SCOPE — V1

One class only: The Ordained. Dante, Obelisk and EX-0 are deferred and must not be built.

Blank faces are not empty. Rolling a blank face generates 2 block for The Ordained. This is what makes loading a mod a real decision rather than a free upgrade.

Four die actions only: Load (place a mod on a blank face), Strengthen (add 1 weight to a face), Purify (remove every mod from a chosen loaded face) and Remove (delete one blank face from the die for the run, D-119) — see MULTI-MOD FACES. Enchant and Expand are deferred.

Design floor: every mod must clearly outperform a guaranteed 2 block, measured on the turn it triggers, not scaled by trigger frequency. Frequency cancels out of this comparison: a mod and a blank on the same face are gated by identical roll chance, so their per-trigger value compares directly. Do not multiply mod value by trigger rate — that arithmetic is wrong. Current band: 10 to 16 points of value on the triggering turn — the standard every future mod is checked against.

Enemy HP carries progression across a run, not mod numbers. As enemies get tougher, their HP pool scales; mod values stay in readable single or low double digits, multipliers stay modest. Do not inflate a mod's raw numbers to keep pace with a harder run — that's enemy HP's job. This keeps every mod's value legible regardless of the run's stage.

A run has three fight types, each with its own HP/intent band and its own die (see ENEMY DIE PER TYPE): normal fights, one elite per act, and the act boss.

Not in V1: rings, markings, resonance, shops, meta-progression, multiple enemies per fight, story and flavour, animations, art.

---

# THREE LAWS — NEVER VIOLATE

LAW 1 — DAMAGE PIPELINE
All damage passes through calculateDamage(). Never calculate damage inline.
Order: base → flat additions → multipliers. Always. Multipliers always last.
Flat additions and multipliers are registered via the listener system. Not separately.

LAW 2 — LISTENER SYSTEM
All mod effects, card effects, class passives, and pipeline additions attach via registerListener().
The phase machine calls callListeners() at each phase boundary.
Adding a new effect never modifies existing phase logic. New effect = new listener.
This is the only registration system. There is no second system.

LAW 3 — SINGLE STATE OBJECT
All game state lives in gameState. Nothing mutates gameState directly.
All changes go through updatePlayer(), updateEnemy(), updateTurn(), updateDie(), updateRun().
If you are writing gameState.anything = x outside a helper function, stop.

---

# TERMINOLOGY

Mods trigger. Never fire. Never activate. Always trigger.
Soul is the resource spent on cards. Never energy.
A loaded face has a mod. A blank face does not.
Status: stacks of poison, stacks of awe. Never a bare number of either.

---

# CORE NUMBERS

Player HP 70. Carries between fights.
Soul 3 per turn. Resets every turn.
Draw 5 cards at start of turn.
Deck size 10 at run start (5 Strike, 4 Ward, 1 Rite); grows by one card per reward picked. gameState.player.ownedCards holds the full permanent collection — deck/hand/discard are reshuffled from it on every fight reset, not from the fixed starting-deck constant, so reward picks survive Restart Fight.
Block clears at start of every turn.
Rounding always Math.ceil(). No exceptions.
Permadeath.
Penitence (player Nat 1) lasts exactly 3 turns from onset (PENITENCE_TURNS), once per fight — see CLASS OBJECT STRUCTURE.
Nat 20 (player and enemy alike) is uncapped and not once-per-fight: it fires every loaded face on that die, ascending, every single time it comes up.

These numbers are modelled on Slay the Spire and exist so that the player always has more cards than soul. Leaving cards unplayed and choosing which is the core decision of the card layer.

---

# STATE SCHEMA

gameState = {

  player: {
    hp: 70,
    maxHp: 70,
    block: 0,
    soul: 3,
    maxSoul: 3,
    deck: [],
    hand: [],
    discard: [],
    classId: 'ordained',
    poisonStacks: 0,
    penitenceActive: false,
    penitenceTurnsRemaining: 0, // PENITENCE_TURNS at Nat 1 onset, ticks at START_OF_TURN
    natOneFiredThisFight: false, // once per fight — see CLASS OBJECT STRUCTURE, onNatOne
    drainNextRound: 0, // Drain's queue — see MODS/ARTIFACTS
    sealNextRound: [], // Seal's queue (face numbers) — see ENEMY DIE PER TYPE, SEAL
    ownedCards: [] // full permanent collection — see DECK STORAGE
  },

  enemy: {
    id: 'Fight' | 'Elite' | 'Boss',
    name: 'Verger' | ... , // distinct from id — see ENEMY DIE PER TYPE
    hp: 0, maxHp: 0,
    intent: 0, intentMin: 0, intentMax: 0, // see ENEMY DIE PER TYPE
    pattern: [], // 1-4 {kind:'attack'|'charge'|'afflict', ...} — see ENEMY DIE PER TYPE
    patternIndex: 0,
    chargeStage: null, // null | 'windup' | 'release'
    chargeBroken: false,
    windupStartHp: null,
    currentEntry: null, // this round's intent spec — getIncomingIntentDamage()
    forcedNextIntent: null, // dev-only, devSetNextIntent()
    wrath: 0, wrathPending: 0, // see ENEMY DIE PER TYPE
    wrathPerTrigger: 2, // from GAME_CONFIG.ENEMIES[...].wrathPerTrigger
    pontifexDoubleAttackThisRound: false,
    hasDie: false, // elite/boss only — see ENEMY DIE PER TYPE
    die: { faces: [] },
    poisonStacks: 0,
    activeBuffs: [],
    natOneFiredThisFight: false, // mirrors the player's field
    buffPoisonStacks: 5 // fixed at buildAct() — see ACTS
  },

  die: {
    faces: [] // player's own die, 20 faces, persists across fights — see MULTI-MOD FACES for modData
  },

  turn: {
    phase: 'START_OF_TURN',
    cardsPlayedThisTurn: 0,
    round: 0,
    rollOutcome: null, // 'blank' | 'mod' | 'nat_twenty' | 'nat_one'; cleared every START_OF_TURN
    rolledFaceWeight: null,
    rolledFaceNumber: null, // drives the die-row highlight
    enemyRollOutcome: null, // enemy-side mirror, set in resolveEnemyRoll()
    enemyRolledFaceNumber: null, // enemy-side mirror
    modTriggeredThisTurn: false, // true from a normal roll or Nat 20's loop
    enemyAttackCancelledThisTurn: false, // set by the enemy's own Nat 1
    outsideTriggeredFaces: [], // faces already triggered outside a roll this round
    roundTriggerCount: 0, // toward GAME_CONFIG.ROUND_TRIGGER_CAP
    roundTriggerCapLogged: false, // prints once per round
    roundSweepPlays: 0, // see BOUND ENGINE
    hoppedFaces: [], // see THE HOP
    sealedFaces: [], // this round's Sealed faces — see ENEMY DIE PER TYPE, SEAL
    boundTriggeredThisRound: false,// set by mod_dispatch, read by Watchword
    enemyRoundSkippedThisTurn: false, // Hourglass's own skip
    secondChanceUsedThisFight: false // once per fight
  },

  fight: {
    blanksRolled: 0 // blank rolls this fight, Tolling Bell's count; zeroed by clearFightScopedState()
  },

  run: {
    stage: 1,
    node: 1,
    status: 'active', // 'active' | 'win' | 'loss' — this fight
    screen: 'map', // 'map' | 'fight'
    outcome: 'active', // 'active' | 'won' | 'lost' — the whole run
    lane: null, // null | 'upper' | 'lower'
    currentSlot: null, // null (fork) | { lane, index } | 'boss'
    act: null, // buildAct(actNumber)'s opening/upper[]/lower[]/boss slots
    actNumber: 1, // 1-based — see ACTS
    threnodyFace: null, // fixed once per run, 2-19
    gold: 0, artifacts: [], shop: null, removalPrice: 75, thirdEyeUsedThisAct: false, // GOLD, SHOP AND ARTIFACTS
    weightAdded: 0, // weight added through strengthenFace() this run; Jubilee reads it
    blanksRolled: 0 // blank rolls this run, counted by the blank_roll_counter listener; Vigil reads it
  },

 // A write-once-per-event log for the player's own reference, distinct
 // from run above. Reset only by startNewRun(), never a fight reset. See
 // RUN RECORD.
  runRecord: {
    started: false,
    flushed: false,
    source: 'human', // 'human' | 'bot'
    node: null, // last slot entered
    arrivalHpAtBoss: null,
    outcome: null, // 'won' | 'lost' | 'abandoned'
    fightRounds: [], // [{ label, rounds }, ...]
    dieActionEvents: [], // [{ type:'load'|'skip'|'purify'|'remove', ... }]
    blanksRolled: 0 // KI-52 — every blank roll this run
  },

  registry: {
    listeners: {}
  },

  config: {
    classes: {},
    cards: {},
    mods: {},
    cardPool: {}, // CARDS
    artifacts: {} // GOLD, SHOP AND ARTIFACTS
  }

}

PENITENCE_TURNS = GAME_CONFIG.PENITENCE_TURNS, assigned once in state.js and read by both Nat 1's onset and the START_OF_TURN tick, so they cannot drift apart.

---

# STATE HELPERS — USE THESE, NOTHING ELSE

updatePlayer(changes)   — Object.assign into gameState.player
updateEnemy(changes)    — Object.assign into gameState.enemy
updateTurn(changes)     — Object.assign into gameState.turn
updateDie(changes)      — Object.assign into gameState.die
updateFight(changes)    — Object.assign into gameState.fight
updateRun(changes)      — Object.assign into gameState.run
updateRunRecord(changes) — Object.assign into gameState.runRecord — see RUN RECORD

config and registry are never updated through helpers.
config is set once at init and never changed.
registry is managed only through registerListener() and clearListeners().

---

# PHASE ORDER — NEVER CHANGE

START_OF_TURN → ROLL_PHASE → CARD_PHASE → END_PLAYER_TURN → ENEMY_ROLL_PHASE → ENEMY_ACT_PHASE → CHECK_WIN_LOSS → START_OF_TURN

ENEMY_ACT_PHASE returns immediately — before intent, block, or damage are touched — when gameState.turn.enemyAttackCancelledThisTurn is true, set by the enemy's own Nat 1 earlier the same turn, or when gameState.turn.enemyRoundSkippedThisTurn is true, set by Hourglass on round 1. Either way the pattern advances as if the intent had resolved; each reports its own wording.

POISON TIMING (D-120, F09): poison ticks at the end of the poisoned side's own turn. The player's ticks in END_PLAYER_TURN (tickPlayerPoison(), phase-machine.js), after hand-to-discard and after poison_answer_passive, before the enemy rolls or acts. The enemy's ticks in CHECK_WIN_LOSS (tickEnemyPoison()), after its intent resolved and before the next START_OF_TURN. A tick deals damage equal to the stacks through calculateDamage(), ignores block, then drops the stacks by 1. Stacks applied during a side's own turn tick at the end of that same turn; stacks applied to the other side wait for that side's next turn end. Each tick is followed by a re-entry of runPhase(), whose top guard turns a kill into a win before the next round, or a loss before the enemy acts. The R<round> transcript line prints the enemy's stacks before its own tick.

---

# EVENT HOOKS — COMPLETE LIST

These are the names registerListener() is designed around. The PHASE ORDER names (START_OF_TURN, ROLL_PHASE, CARD_PHASE, END_PLAYER_TURN, ENEMY_ROLL_PHASE, ENEMY_ACT_PHASE, CHECK_WIN_LOSS) are also real dispatchable hooks: runPhase(phase) calls callListeners(phase) unconditionally near its top, once per visit, before that phase's own if-branch — so a listener on one of these seven fires at that boundary, ahead of the phase's own logic. END_PLAYER_TURN is exercised by Anathema, firing before hand-to-discard, and by poison_answer_passive, registered first, so it runs ahead of Anathema and of the player's poison tick.

Player-side hooks:
BLANK_ROLL — { outsideRoll } — a genuinely blank roll, and the player's own Nat 1 once already fired this fight. outsideRoll: true marks a blank reached for rather than rolled (triggerFaceOutsideRoll()) — what Alms, the blank counter, Vigil and Gilded Die read to leave those alone; Tolling Bell still pays. Listeners run in registration order: the class passive, Alms, Tolling Bell (reads the fight count before this blank), blank_roll_counter (adds it), Vigil's trigger (reads the run count with it in), Gilded Die
MOD_TRIGGER — { modId, faceNumber } — a real mod trigger, normal roll or Nat 20's loop
NAT_TWENTY — {} — player rolls face 20
NAT_ONE — {} — player rolls face 1
ON_CARD_PLAY — { card }
ON_DAMAGE_DEALT — { amount, source }
ON_BLOCK_GENERATED — { amount, source }
ON_HEAL — { amount }
FIGHT_START — {} — dispatched once by beginFightFromSlot(), after the fight-scoped reset, before the first START_OF_TURN; Plague Bell is its only listener today

Enemy-side hooks:
ENEMY_BUFF_TRIGGER — { buffId, faceNumber } — a loaded enemy buff face triggers, from a normal roll or the enemy's own Nat 20 loop
ENEMY_NAT_TWENTY — {} — enemy rolls face 20 (boss only — the only die that carries this modId)
ENEMY_NAT_ONE — {} — enemy rolls face 1 (boss only)

Pipeline hooks — read directly off gameState.registry.listeners, not through callListeners(); each fn returns a number:
DAMAGE_FLAT_ADDITION — fn() returns amount to add
DAMAGE_MULTIPLIER — fn(sourceType) returns multiplier value; sourceType lets a multiplier scope itself (e.g. Fervour doubles 'attack' only, never 'poison')
BLOCK_FLAT_ADDITION — fn() returns amount to add
BLOCK_MULTIPLIER — fn() returns multiplier value (same pipeline shape as DAMAGE_MULTIPLIER; no mod currently registers one)

---

# LISTENER API

registerListener(hook, id, fn, clearOn)
  hook    — one of the names in EVENT HOOKS above; a PHASE_ORDER phase name is also accepted and does fire, at that phase's boundary, via runPhase()'s own generic callListeners(phase) call (see EVENT HOOKS)
  id      — unique string identifier for this listener
  fn      — pipeline hooks: fn() (fn(sourceType) for DAMAGE_MULTIPLIER) returns a number. other hooks: fn(data) returns nothing.
  clearOn — 'turn' | 'permanent'. 'fight' is accepted by the function signature but no call site has ever passed it — every fight-scoped field is reset explicitly instead (see FIGHT RESET).
  Same hook + same id registered twice is a no-op: registerListener logs '[LISTENER] duplicate registration skipped' and returns without re-adding it. This matters for a mod whose own effect() would otherwise re-register a persistent listener on every trigger.

callListeners(hook, data)
  calls all listeners for hook in registration order
  stops immediately if run.status is not 'active'

clearListeners(clearOn)
  removes all listeners where clearOn matches the argument
  called with 'turn' automatically at START_OF_TURN
  'permanent' never cleared automatically

---

# DAMAGE PIPELINE

calculateDamage(baseDamage, sourceType)
  1. total = baseDamage
  2. for each DAMAGE_FLAT_ADDITION listener: total = total + fn()
  3. for each DAMAGE_MULTIPLIER listener: total = Math.ceil(total * fn(sourceType))
  4. return Math.ceil(total)
  sourceType (e.g. 'attack', 'poison') lets a multiplier scope itself to one source; flat additions are untagged and apply to every call.

generateBlock(baseBlock)
  1. total = baseBlock
  2. for each BLOCK_FLAT_ADDITION listener: total = total + fn()
  3. for each BLOCK_MULTIPLIER listener: total = Math.ceil(total * fn())
  4. return Math.ceil(total)

Two multipliers compound. () => 2 then () => 3 produces x6 not x5. This is correct. Do not change.

dealDamage(target, amount, sourceType, sourceId, fireListener = true) — shared helper (pipeline.js). Runs calculateDamage(), applies to the target's hp via updateEnemy()/updatePlayer(), plays the damage-landing sound when > 0, fires ON_DAMAGE_DEALT unless fireListener is explicitly false (the enemy's own attack only, which must not gain that hook). Returns the final damage dealt. Every damage-dealing card/mod calls this instead of repeating the three lines inline.

dealBlock(amount, sourceId) — same shape for block: generateBlock(), add to player.block, fire ON_BLOCK_GENERATED. Returns the final block generated.

healPlayer(amount) — newHp = Math.min(player.hp + amount, player.maxHp); updates hp; fires ON_HEAL with the actual, post-cap amount; returns it. No flat-addition/multiplier stage — a direct clamp, not a third pipeline. Used by the post-win rite's Heal option.

All turn-scoped pipeline listeners clear at START_OF_TURN automatically.

---

# ROUNDING

Always Math.ceil(). No exceptions, but one ruling: D-122's boss heal rounds down, as its own decision says.

---

# DECK STORAGE

deck, hand, discard contain card id strings only. Never card objects.
Card objects live in config.cards.
getCard(id) returns config.cards[id].
Multiple copies of same card = same id string repeated.
gameState.player.ownedCards holds the player's full permanent collection (one id string per owned copy). deck/hand/discard are the current fight's draw pile and are reshuffled from ownedCards on every fight reset — not from the fixed starting-deck constant — so a card picked at a reward survives Restart Fight.

---

# CARD OBJECT STRUCTURE

Cards live in config.cards. Not config.mods.

{
  id: 'unique_string',
  name: 'Display Name',
  soulCost: 1,
  type: 'attack' | 'block' | 'utility',
  classRestriction: null | 'ordained',
  getCost: function(gameState) { ... },  // optional, overrides soulCost when present — only Rapture uses this
  effect: function(gameState) {
    // calls helpers and pipeline functions only
    // never mutates gameState directly
  }
}

---

# CARDS

Fifty-one cards defined in total: the three Ring 0 cards the run always starts with, plus the reward pool (config.cardPool, 48 entries) the reward screen and shop both draw offers from. Both live in config.cards; cardPool holds references, not copies.

Ring 0 — the starting deck (5 Strike, 4 Ward, 1 Rite, 10 cards):
Strike — 1 soul, attack — 5 damage.
Ward — 1 soul, block — 5 block.
Rite — 2 soul, attack, Ordained-only — 6 damage + 6 block (D-121).

Pool (config.cardPool) carries a tier ('basic'/'uncommon'/'rare'; D-111's 'mythic'/'void' hold no pieces yet, offer weight 0) and a tags list per card; the Ring 0 cards carry none and read basic (cardTier()). Every card's text lives in CARD_EFFECT_TEXT (render-text.js), not this file; code reads it only through getCardEffectText(), which live-numbers Threnody's face.

Tags in use: poison, soul, bastion, mass, growth, bound, awe, die, blank (D-126). BLANK PIECES (D-126, D-127): a blank face is a face on the die with no mod, or Sealed this round, never face 1 or 20 nor a removed face (blankFaceNumbers(), pipeline.js). Rolling a blank is any resolved player roll landing on one, a spent Nat 1 and a Second Sight or Loaded Die roll included; a blank a card triggers is not a roll. Vacancy (rare, 2 soul) deals 1 damage per blank face, Tabernacle (basic, 1 soul) gains 2 block per blank face, both uncapped; Reverberation (rare, 2 soul) triggers every blank face, ascending, through triggerFaceOutsideRoll(face, { capExempt: true }) — each pays the blank payout as an outside-roll blank, so Alms, Vigil, Gilded Die and the blank counters do not react, and none counts toward ROUND_TRIGGER_CAP. Orison is unchanged. Each carries the Blank tag with its old ones (Vigil and Tithe drop bastion and soul; Vacancy, Tabernacle and Reverberation drop mass). Every number is in GAME_CONFIG (BLANK_GOLD, VIGIL_BASE_DAMAGE, VIGIL_BLANKS_PER_POINT, TITHE_BLOCK_PER_BLANK, VACANCY_DAMAGE_PER_BLANK, TABERNACLE_BLOCK_PER_BLANK, ARTIFACTS.TOLLING_BELL_BLOCK_PER_BLANK).

---

# DIE FACE OBJECT STRUCTURE

{ number: 1, modId: null, modId2: null, weight: 1 }

number: 1-N, N being that die's own DIE_SIZE entry — PLAYER, ELITE, BOSS or NORMAL, each independently variable (D-11). Nothing in js/ reads a bare 20 for a die size.
modId: null = blank; string = mod id (player die) or buff id (enemy die). weight: default 1.
modId2: cap two mods, never three. null = one mod (or blank); string = a second, loaded only onto a face where modId is set. Blank/Nat faces and the enemy die never carry a modId2 — see MULTI-MOD FACES.
Every face must be explicitly defined. No implicit blanks.
Player and enemy die share this shape; the Nat-face rule differs:

Player die — face 1 is always 'NAT_ONE', face DIE_SIZE.PLAYER (20) always 'NAT_TWENTY'. Cannot change; both stub ids, never real mods, both excluded from Nat 20's own loop.

Enemy die — whether faces 1/N carry a Nat modId depends on the enemy, not fixed like the player's — see ENEMY DIE PER TYPE. buildEnemyDieFaces(poisonFaceNumbers, includeNats, dieSize) and buildEnemyDieFromSpec(spec) build every enemy die; includeNats/spec.nats switches faces 1/dieSize between blank and Nat.

Weight display: a face above weight 1 shows ×N in the die rows, live. Weight is only ever written by strengthenFace(faceNumber) (pipeline.js) — Strengthen and Ordain's/Elevation's effect all call it. Player die only. A weight-2+ face also draws a line under its square (`.face-weight-line`, D-130), 2 px per weight above 1, in the face's own colour; it adds no layout height.

Trigger-count display: a loaded player-die face that triggered at least once this run shows a badge (`.die-trigger-count`), zero renders nothing. Player die only. One counter per mod slot — two-mod faces show both, slash-separated, '#N' or '#N1/N2'. Faces 1/20 also carry this badge, counting rolls this run.

---

# MULTI-MOD FACES

A face can hold up to two mods — modId (first loaded), modId2 (second) — cap two, never three. Per-face state (Zeal's accumulated bonus, per-mod trigger counts — TRIGGER COUNTS below) stays on that face's own modData regardless of slot; no parallel array keyed by face number anywhere, and never one (the carry-forward rule).

Trigger order: both mods on a rolled face trigger in load order — modId first, modId2 second, each fully resolving before the next. resolvePlayerRoll() (pipeline.js) dispatches two sequential, synchronous callListeners('MOD_TRIGGER', ...) calls; onNatTwenty() (cards-mods.js) dispatches both within that face's own turn in the ascending sweep.

Load: dieActionChooseLoad() (render-layers.js) excludes the anchor and any mod already on the die, either slot. The face picker (load_pick_face) offers any blank AND any already-loaded, non-Nat, not-yet-full face together, always. isEligible: `f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2`. dieActionPickLoadFace() writes modId on a blank, modId2 on an already-loaded face, refuses (no write) if both slots are full.

Pool exhaustion (D-54): eligibleLoadModIds() (render-layers.js) is checked before the Load button renders — 'choose' shows only Strengthen and Skip once fewer than 3 eligible mods remain, so a short offer is never shown.

PURIFY (F43): the third die action, offered on 'choose' (purifiableFaceExists()) whenever a face other than 1/10/20 carries a mod. Opens the picker limited to those faces ('purify_pick_face'). dieActionPickPurifyFace() resets modId/modId2/modData to a fresh blank's shape, weight untouched — removed mod(s) are offerable again next Load (eligibleLoadModIds() re-derives live, D-07). Logs `[DIE] purify face N: X, Y removed`; writes `{ type:'purify', faceNumber, removed }` into runRecord.dieActionEvents, CSV `purify:X|Y>N`. Reuses the Strengthen sound.

REMOVE (D-119, F43): the fourth die action, offered on 'choose' (removableFaceExists()) wherever a die action is offered, whenever a face qualifies: blank, not 1, 20 or 10 (the anchor), and only while the die has more than GAME_CONFIG.DIE_MIN_FACES (12) faces — a loaded face never qualifies. 'remove_pick_face' wires the face row as the picker (isRemoveEligibleFace()). dieActionPickRemoveFace() deletes the face from gameState.die.faces for the rest of the run, so the face row, the roll bag, rollOdds() and the DIE layer all lose it. Logs `[DIE] Removed face N`; runRecord `{ type:'remove', faceNumber }`, CSV `remove:N`; transcript `Removed face N`; sound die_action_remove (Purify's). A removed face leaves a gap in the numbering: every read finds a face by number through getPlayerFace()/playerFaceIndex() (pipeline.js), never by index, and "the face above" is nextFaceNumberAbove(), the next number still on the die (Elevation, Reliquary Chain). triggerFaceOutsideRoll() refuses a removed face (Threnody's fixed face included).

Faces 1/20 are untouched here: single-mod Nat stubs, excluded from the Load picker, never gain a modId2. Face 20 can still be Strengthened.

The enemy die shares this face shape (modId2 always present, always null) for structural symmetry, but nothing ever writes an enemy face's modId2.

Display: a two-mod face shows both names in the one die row, side by side — `.die-mod-pair` (index.html) wrapping two `.die-mod` spans, each with its own inline trigger badge. No new row. faceHoverText() (render-text.js) appends the second mod's MOD_DESCRIPTION to the hover tip, after " / ". Each name truncates to TWO_MOD_NAME_CHARS letters (6 default), no ellipsis; full name via native `title`. Drop to 5 if a future name stops fitting.

Dev tooling: devLoadMod() (dev-tools.js) mirrors the Load cap. devClearFace() clears both slots.

TRIGGER COUNTS: in each face's modData — triggerCount for modId, triggerCount2 for modId2. mod_dispatch matches data.modId against the triggering face's modId/modId2 to bump the right counter. Run-scoped: survives a fight reset; only startNewRun()'s fresh faces wipe it. Zeal's effect merges into existing modData rather than replacing it, so a trigger never erases a count.

---

# OUTSIDE-ROLL TRIGGER

triggerFaceOutsideRoll(faceNumber) (pipeline.js) is the one shared function every "trigger a face without rolling it" card/mod uses — Threnody, Reverberation, Magnificat, Novena today; any future piece with the same shape uses this, never a second dispatch copy.

Refuses outright (no state change, returns false) for face 1 or DIE_SIZE.PLAYER (20) — both Nat stubs, never a real mod or blank.

Refuses a face already triggered this way once this round — turn.outsideTriggeredFaces (state.js), cleared to [] at START_OF_TURN. A face rolled normally then re-triggered outside a roll (Reverberation) isn't blocked — the record only tracks outside triggers, not the roll itself.

D-51 — per-round trigger cap. ROUND_TRIGGER_CAP (config.js) is 10. turn.roundTriggerCount counts every real MOD_TRIGGER dispatch this round — mod_dispatch increments it on every call except a Nat 20 sweep's own (tagged natTwentySweep: true), the one exemption. A blank face bumps the same counter directly in triggerFaceOutsideRoll(). Refuses once the counter reaches the cap, unless the call passes { capExempt: true } (Reverberation's blank sweep, D-127), which neither checks nor bumps it; cleared to 0 at START_OF_TURN. The "round trigger cap reached" log line prints at most once per round (roundTriggerCapLogged).

Dispatch: a loaded face triggers through the identical MOD_TRIGGER dispatch a rolled face uses — modId first, then modId2 — so permanent per-face growth accrues exactly as on a roll. A blank face dispatches BLANK_ROLL for the same BLANK_ROLL_BLOCK (2) block. Never writes rolledFaceNumber/rollOutcome/rolledFaceWeight.

---

# THE HOP

Die feedback: every face that fires WITHOUT being the face actually rolled this round — a Nat 20 sweep, a Bound scan, or an outside-roll trigger — moves its die row to the exact look a rolled face gets (`.die-row-rolled`/`.die-row-rolled-flash`, no new colour). Player die only.

turn.hoppedFaces (state.js) is the record — face numbers in firing order, never added twice per round. Marked the instant a face's dispatch fires (pipeline.js's markFaceHopped()), from triggerFaceOutsideRoll() (outside-roll triggers and the Bound scan) and onNatTwenty()'s own playSweep() callback (the one path dispatching directly). Paced by playSweep() — the hop lands the moment the trigger does.

Display: renderDieList() applies the rolled-face look to any row whose face.number is in hoppedFaces, player-die containers only, skipped for the row already tracked as rolled. Same flash-once-then-sustained split as the rolled face's own highlight, per container (lastSeenHoppedFacesByContainer). Clears at START_OF_TURN with every other round-scoped roll flag.

Faces 1/20's own run-scoped roll counts (separate from the hop record): each counts times rolled this run, in modData.triggerCount — bumped by bumpNatFaceTriggerCount() (pipeline.js), from resolvePlayerRoll()'s NAT_TWENTY/NAT_ONE branches on every roll. Reset free on a new run.

---

# BOUND ENGINE

A face is Bound if a mod loaded on it (either slot) carries the 'bound' tag (permanent) or was granted Bound for the fight. isBoundFace(face) (pipeline.js) checks both: modId/modId2 against config.mods[...].tags, and modData.boundGranted. A Sealed face counts as blank for every rule, Bound included.

grantBoundToFace(faceNumber) (pipeline.js) is the one setter — grants Bound to a loaded face for the rest of the fight, merged into that face's modData (ARCH-CF2, Zeal/Cope's pattern). Refuses face 1/20 and a blank face. Fight-scoped: clearFightScopedState() strips boundGranted at fight end, leaving the rest of that modData untouched.

Display: every Bound face — printed or granted — shows a "Bound" badge on its die row (`.die-bound-badge`, same box/font as `.die-weight`, D-28), on every container, not gated by showTriggerBadges.

Bound scan: runBoundScan(rolledFace) (pipeline.js), only from resolvePlayerRoll()'s mod-trigger branch, never during a Nat 20. When the rolled face is itself Bound, every other loaded Bound face triggers via triggerFaceOutsideRoll(), ascending order. A face triggered this way never starts a further scan. Counts toward ROUND_TRIGGER_CAP (D-51), no exemption.

Fast sweep timing: playSweep(faceNumbers, dispatchFn) (pipeline.js) paces WHEN each face in a sweep plays — state updates the instant each dispatch runs. turn.roundSweepPlays counts every sweep-played trigger this round, cleared at START_OF_TURN. The first three plays land SWEEP_TRIGGER_DELAY_MS (200ms) apart; after, a quarter of that (50ms).

Bound mods/cards: Unison (6 damage), Accord (10 block), Kinship (4 poison) are plain Bound. Kyrie — 5 damage, 10 if the rolled face has Bound. Novena — every loaded Bound face triggers. Canticle — 6 block; if the rolled face is loaded, it gains Bound for the fight (never face 1/20). Concord — Bound, +1 soul, 3 block. Herald — Bound, 6 damage; one other random loaded non-Bound face gains Bound for the fight (pickRandom(), state.js).

---

# WEIGHTED ROLL ALGORITHM

function rollDie(faces) {
  const pool = [];
  faces.forEach(face => {
    for (let i = 0; i < face.weight; i++) { pool.push(face); }
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

Default: DIE_SIZE.PLAYER faces (20) weight 1 = 5% each. Strengthen to weight 2 = that face appears twice in pool. Only weight values change; face.weight is the only ticket source. rollOdds() (pipeline.js) reads this exact bag to show the face row's own percent — see THE FACE ROW.

Strengthen may target face DIE_SIZE.PLAYER (20), plus any loaded face. Face 1 is never targetable — the Strengthen picker (render-layers.js) excludes number 1 explicitly. Face 20 never gains a mod; Strengthen only adds weight, raising how often Nat 20 comes up, and stops at FACE_TWENTY_MAX_WEIGHT (5): strengthenFace() refuses past it, the picker marks face 20 inert, and its caption reads MAX. An eligible face's hover in the picker ends with a pair, "Now: weight N · P%" and "Becomes: weight N+1 · P%", odds from rollOdds() at each weight, Becomes in --text and Now in --blank.

---

# CLASS OBJECT STRUCTURE

Classes live in config.classes. Only one class exists in V1.

{
  id: 'ordained',
  name: 'The Ordained',
  anchorModId: 'consecrate',
  onNatTwenty: function() { ... },
  onNatOne: function() { ... },
  onBlankRoll: function() { ... },
  startingDeck: []
}

classId in player state is a lookup key for config.classes[classId].

onBlankRoll(data): generateBlock(2) via dealBlock(2, 'blank_face'), fires ON_BLOCK_GENERATED — unless Alms replaces it outright (almsReplacesBlankRoll(data), GOLD, SHOP AND ARTIFACTS).

onNatTwenty (Nat 20): every loaded face on the player die triggers, ascending order. Not capped, not once per fight — fires in full every time face 20 comes up. Faces 1/20 excluded (NAT_ONE/NAT_TWENTY stubs, not real mods). Each qualifying face fires through callListeners('MOD_TRIGGER', ...), same dispatch a single rolled mod face uses — no second trigger path. Loop-safe: no mod in the pool re-rolls the die.

onNatOne (Nat 1 — Penitence): fires once per fight, gated on natOneFiredThisFight. Bone Counter takes its gold ahead of everything below; Penitence never arms. First time otherwise: sets penitenceActive true, penitenceTurnsRemaining PENITENCE_TURNS (3), logs onset. The 1-soul loss happens at each of the next three START_OF_TURNs, right after the soul reset, floored at 0; expires after the third tick. Every later face 1 this fight instead dispatches BLANK_ROLL directly — an ordinary blank, no distinguishing tag.

anchorModId references consecrate, built in config.mods — see MODS. The Ordained's die starts with one loaded face: Consecrate on face 10, Strengthen-eligible like any loaded face; Consecrate is excluded from the reward pool for that reason.

Enemy classes don't exist — the enemy's Nat 20/Nat 1/buff-trigger behaviour registers unconditionally in init() (cards-mods.js), not on a class object, since it belongs to the enemy fought, not a player class. See ENEMY DIE PER TYPE.

---

# MOD OBJECT STRUCTURE

Die mods live in config.mods. Not config.cards.

{
  id: 'unique_string',
  name: 'Display Name',
  effect: function(data) {
    // data.faceNumber is always supplied; a mod that doesn't need it ignores the argument
    // registers listeners via registerListener() for anything that must persist past this trigger
    // never mutates state directly
  }
}

---

# MODS

Twenty-seven mods, all in config.mods. Consecrate is excluded from the reward pool because it's already loaded on the Ordained's starting die (CLASS OBJECT STRUCTURE); the other twenty-six are reward-eligible, each with a tier ('basic'/'uncommon'/'rare') and a tags list. Every mod's text lives in MOD_DESCRIPTION (render-text.js). TEXT RULE (D-125): every mod, card and artifact text is one or two short imperative sentences — a number before its noun, conditions as "If …," or "When …," at the front, no parentheses, never "applied"/"applies" or "this run"; tags ride the tag line, not the text.

Consecrate (anchor) — +2 soul this turn; each card played this turn also generates 3 block, turn-scoped.
Fervour — turn-scoped DAMAGE_MULTIPLIER listener doubling damage tagged 'attack' only (poison untouched). The first and only mod using the pipeline's multiplier stage.
Vigil — 4 damage plus 1 per 3 blanks rolled this run (gameState.run.blanksRolled, whole points), and it also triggers on every blank roll: the permanent 'vigil_blank_trigger' listener on BLANK_ROLL dispatches MOD_TRIGGER for the face carrying it (one trigger per roll, counted against ROUND_TRIGGER_CAP, skipped for an outside-roll blank or a Sealed face), after the roll's blank is counted. Tithe — 1 block per blank face on the die, on the trigger.
Zeal — 10 damage plus a bonus that permanently increases by 4 each further trigger from the same face; stored per-face on that face's modData (updateDie()), not a global counter, so Zeal on two faces accrues independently.
Ordain — 10 damage, then permanently +1 weight to the face it triggered from.
Elevation — 10 damage; the face above (the next number still on the die, nextFaceNumberAbove()) permanently gains +1 weight, only if loaded and not face 20. Blank-above or face 20: just the 10 damage, no write, no error. Weight write goes through the shared strengthenFace() (pipeline.js), the only place weight is ever written.
Anthem — 6 damage plus 4 per point of weight on its own face (1→10, 2→14, 3→18). Reuses dealDamage() tagged 'attack'; reads the weight of the face that carries it (data.faceNumber), never the rolled face's. Writes nothing.

The rest (Smite, Penance, Offering, Blight, Virulence, Sanctuary, Largesse, Tithe, Congregation, Cope, Anathema, Thurible, Magnificat, Unison, Accord, Kinship, Concord, Herald, Dread, Genuflect) each have a plain, direct effect in MOD_DESCRIPTION — see that table rather than duplicating numbers here.

---

# ENEMY DIE PER TYPE

Every fight-type slot's enemy is a named entry in GAME_CONFIG.ENEMIES, keyed by id (buildAct(), run-and-map.js, assembles each act's opening/lanes/elite/boss from these). Fifteen: act 1 — Verger (opening only), Thurifer, Asperser, Lector (elite), Hierophant (boss); act 2 — Chorister, Cantor, Flagellant, Archdeacon (elite), Cardinal (boss); act 3 — Anchorite, Mendicant, Inquisitor, Exarch (elite), Pontifex (boss). Each carries `name`, a literal `pattern` (ACT_INTENT_MULTIPLIER scales only buff poison, never a pattern's own numbers), and, except the three plain act-1 lane normals (hasDie:false), a `dieSpec` (buildEnemyDieFromSpec(), pipeline.js). DIE_SIZE.NORMAL (6)/ELITE (12) are real sizes; bosses stay 20-sided, both Nats. HP: Math.ceil(base × ACT_HP_MULTIPLIER) — act 1's four lane positions read ACT1_LANE_FIGHT_HP ([58,65,78,85]) directly. enemy.name (beginFightFromSlot()) is the enemy's identity, distinct from `id` ('Fight'/'Elite'/'Boss', which the panel title keys off).

Enemy buff/Nat mechanics — registered unconditionally in init() (cards-mods.js): enemy_buff_poison/wrath/drain/seal via enemy_buff_dispatch, each triggering only when its own face is actually rolled; ENEMY_NAT_ONE cancels the attack + self-poisons 5, once per fight — default unless named below. ENEMY_NAT_TWENTY (D-101): every boss with Nat faces (Hierophant, Cardinal, Pontifex) forces its next intent to its own pattern's charge entry via forcedNextIntent, unless already winding up/releasing (then nothing extra happens) — winds up next round, releases the round after, breakable as any Charge. wrathPerTrigger is each enemy's own Wrath amount, falling back to ENEMY_WRATH_AMOUNT.

Cardinal and Pontifex keep their own Nat 1 (branch on enemy.name): Cardinal's triggers the player's heaviest loaded face outside the roll, no attack cancel; Pontifex's zeroes both wrath fields, once per fight, no attack cancel. Their Nat 20 follows the shared forced-Charge behaviour above.

Per-enemy "reads" — applyEnemyReads() (pipeline.js), once per round, reading the player's roll: Lector triggers Drain on face 6; Hierophant's Nat 1 also fires on a player Nat 1; Pontifex triggers Wrath on the player's heaviest loaded face.

Enemy intent (F34): every enemy acts from `pattern`, a repeating Attack/Charge/Afflict list, shown at START_OF_TURN (advanceEnemyIntentForRound(), after the enemy's own tick from the round before, so a Charge's break check counts the tick that ended the wind-up round — KI-28), advanced by ENEMY_ACT_PHASE once a round resolves (Charge only after release). getIncomingIntentDamage() is the shared intent-damage reader (Interdict). The enemy's Nat 1 cancels whatever is live, wind-up included.

FIGHT PANEL TITLE: #enemyPanelTitle reads ENEMY/ELITE ★/BOSS ☠ off enemy.id. #enemyNameValue shows enemy.name. Pontifex's own #enemyReadLine: "Reads the heaviest face: Wrath +N when the player rolls it."

ENEMY FACE HOVER TEXT: faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount), threaded by renderDieList(). Cardinal, Pontifex, Hierophant each get custom ENEMY_NAT_ONE/TWENTY hover text; Lector's Drain face (6) appends "Also triggers when the player rolls a 6."

ENEMY NAT SOUND/VISUAL: enemy_nat_20/enemy_nat_1 (audio.js) — the player's own synthesis an octave lower, ≤200ms. Visual: the rolled row pulses three times over 600ms in --nat; #enemyIntentValue reads "NAT 20" or "CANCELLED — NAT 1" (plain "NAT 1" for Cardinal/Pontifex).

ENEMY DICE OF ANY SIZE, WRATH, DRAIN, SEAL (F35): buildEnemyDieFromSpec(spec) (pipeline.js) builds every act 2/3 enemy and the two non-Hierophant bosses; buildEnemyDieFaces() (run-and-map.js) is kept only for Hierophant.

LOADED-FACE RULE / SEAL: isFaceSealed(faceNumber) (pipeline.js) is the one shared check. turn.sealedFaces is REPLACED by a copy of player.sealNextRound every START_OF_TURN (even empty), cleared at fight-start, so a Seal never survives past its round or into a new fight. Faces 1/20 are never Sealed.

POISON ANSWER (F33): at END_PLAYER_TURN, before the player's poison tick, a permanent listener (poison_answer_passive) removes floor(player.block / POISON_ANSWER_BLOCK_PER_STACK) stacks of the player's poison, capped at current stacks — block is read, not spent. Enemies have no block field.

---

# ACTS

The run is ACTS (3) acts, played in sequence. Each act is a fresh map of the same two-lane shape (F16) — same slot types, its own boss — built by buildAct(actNumber) (run-and-map.js), baking that act's scaled numbers into every enemy at build time (never read live off GAME_CONFIG mid-fight).

ANOMALY SLOT (F44, D-117): the lower lane's slot index 3 (opposite the upper lane's Elite) is type 'event' (`{ type: 'event', label: 'Anomaly', id: 'font' }`) in every act. The player reads Anomaly everywhere (map node, log, transcript); code keys stay event (type, openEventScreen(), GAME_CONFIG.EVENT). SLOT_HANDLERS['event'] dispatches to openEventScreen() — see THE FONT. Upper path: 7 fights an act, 8 in act 1 (22 a run). Lower path, through the Anomaly: 6, 7 in act 1 (19 a run).

LANE SHAPE (F16, D-123): GAME_CONFIG.SLOTS_PER_LANE [9, 8, 8] and RITE_SLOT_INDICES [[1,5,8],[1,4,7],[1,4,7]], indexed actNumber-1; buildAct() fills every other slot with the act's lane fights in order, ELITE_SLOT_INDEX (3) being the Elite/Anomaly. Act 1's extra slot (index 4, both lanes) is a Verger at HP.OPENING, the one act 1 normal that repeats neither neighbour.

Scaling — ACT_HP_MULTIPLIER and ACT_INTENT_MULTIPLIER, indexed by actNumber-1, [1.0, 1.4, 1.9] and [1.0, 1.2, 1.45]: every enemy's hp/intentMin/intentMax is Math.ceil(base × that multiplier); the buff poison amount rides the intent multiplier the same way (3/4/5 stacks acts 1/2/3); enemy Nat 1 self-poison stays flat at 5. Act 1's multipliers are both 1.0. Die face layouts don't change per act.

Transition — a boss win's outcome depends which act it ends: acts 1/2 first heal BOSS_HEAL_PERCENT (20) of max HP, rounded down, capped at max (grantBossHeal(), phase-machine.js; D-122; log `[HEAL] boss heal N: HP a to b`, transcript `BOSS HEAL N | you b/max`), then get the same reward flow any fight win gets (gold, artifact/die/card reward), then advanceRun() increments actNumber, resets thirdEyeUsedThisAct, rebuilds run.act; die/ownedCards untouched. Act 3 (final): true VICTORY (D-22) — no reward, no gold.

UI: the act number shows on the map and fight screen (#actStamp), from gameState.run.actNumber.

---

# THE FONT (Anomaly slot, id 'font')

openEventScreen() opens #eventScreenPanel: fixed flavour text, a ROLL button, the player's die as one row. ROLL (eventRoll()) picks a face via rollWithArtifacts() (D-21, weights included) but never passes it to resolvePlayerRoll() — no listener dispatch, no Bound, no Nat sweep, roll sound only; written straight to turn.rolledFaceNumber/rollOutcome so it lights on the face row (cleared next START_OF_TURN, on leaving). Outcome, then CONTINUE (closeEventScreen()) back to the map: Nat 20 opens the normal die reward panel (openDieActionScreen('event'), no card reward after) plus NAT_TWENTY_GOLD gold; a loaded face gains 1 weight (strengthenFace()); a blank grants BLANK_GOLD; Nat 1 costs NAT_ONE_HP_LOSS HP, floored at 1. Third Eye applies to fight rolls only, never here. Log: `[ANOMALY] font: rolled N, outcome ...`; transcript `ANOMALY font: ...`.

---

# GOLD, SHOP AND ARTIFACTS

GOLD: a fight win grants gold within GOLD_REWARDS (Fight 12-20, Elite 30-40, Boss 60 flat); the final boss grants none (D-22). #goldValue reads run.gold.

SHOP (GAME_CONFIG.SHOP): opens after every rite, in #shopPanel. Stock (gameState.run.shop, built once per visit): 3 cards at the Elite tier split, one artifact at ARTIFACT_PRICE (150) from the artifacts not held, one Strengthen (opens the real face picker, returns to shop), one removal at shopRemovalPrice() (gameState.run.removalPrice, starting REMOVAL_BASE_PRICE, +REMOVAL_PRICE_STEP/purchase, run-scoped). Every price but removal runs through shopPriceWithArtifacts() (cards-mods.js). Unaffordable disabled; Leave is free.

ARTIFACTS (F45): gameState.run.artifacts, max ARTIFACT_MAX (8), defs in config.artifacts, thirteen total, every one tier rare (colour only, D-111); amounts in GAME_CONFIG.ARTIFACTS. #artifactRewardPanel (pick 1 of 3, Skip allowed) opens after an Elite win and a non-final Boss win, before the die reward, drawing 3 from the unheld. Each with a hook of its own registers a permanent listener in init(), gated on hasArtifact(); the rest gate at the roll path or shop price they act on.

Third Eye (thirdEyeChooseFace()) forces one chosen face per act. Loaded Die (rollWithArtifacts()) rolls twice, higher stands. Tolling Bell (BLANK_ROLL) pays 1 block per blank rolled earlier this fight (gameState.fight.blanksRolled) on top of the blank payout, an outside-roll blank included, and pays it beside Alms. Tithe Box (NAT_TWENTY) pays TITHE_BOX_GOLD per Nat 20. Merchant's Seal lowers every shop price a quarter, rounded down, freezes removal at REMOVAL_BASE_PRICE while held. Leaden Face makes dieActionPickStrengthenFace() call strengthenFace() twice — Ordain/Elevation untouched. Reliquary Chain (rolled face only) triggers the loaded face above a rolled Bound face (the next number still on the die) via triggerFaceOutsideRoll(), never face 20, counting toward ROUND_TRIGGER_CAP. Plague Bell (FIGHT_START) poisons the enemy for half its loaded faces, rounded down, 1/10/20 excluded. Alms (BLANK_ROLL) replaces the blank passive with ALMS_SOUL soul — an outside-roll blank (Threnody, Reverberation, Refrain) still gives its block. Hourglass (ENEMY_ACT_PHASE) skips round 1's intent, pattern still advances, die still rolls. Second Chance rerolls once a fight — the first face never resolves. Gilded Die (BLANK_ROLL) pays BLANK_GOLD gold on a blank roll, never on an outside-roll blank. Alms, Tolling Bell, Gilded Die, Vigil, Tithe, Vacancy, Tabernacle, Reverberation and Orison carry the Blank tag (D-126, D-127). Bone Counter takes BONE_COUNTER_GOLD instead of arming Penitence, when the gold is there.

---

# AUDIO MODULE

audio.js. One AudioContext plus a name-to-sound table, the same shape as the listener registry: game logic never calls a sound function directly, only playAudioEvent('event_name'); SOUND_TABLE decides the sound, swappable in one place with no call-site change. Synthesised only via playTone(waveform, freqStart, freqEnd, durationMs, peakGain, attackMs) — no audio files; /audio/ stays empty.

Browser autoplay policy: an AudioContext built before any user gesture stays suspended — every scheduled sound is silent, no error — until resumed inside a real gesture handler. unlockAudioOnce() (audio.js), on the page's first pointerdown (bootstrap.js), is that resume.

SOUND_TABLE — 27 events: roll (The Font only), die_rolling, die_landing, die_blank, card_attack, card_block, card_hybrid, mod_trigger, damage_enemy, damage_player, block_absorb, end_turn, nat_20, nat_1, fight_won, fight_lost, fight_start_normal/elite/boss, boss_defeated, die_action_load, die_action_strengthen, die_action_remove (the same sound), card_reward_basic/rich, enemy_nat_20, enemy_nat_1. The last two are the player's own nat_20/nat_1 synthesis an octave lower, ≤200ms.

Two pitch chains climb as an action repeats within a turn, reset to 0 by resetSoundChains() every START_OF_TURN, capped at CHAIN_STEP_CAP (8): CARD_CHAIN_EVENTS, MOD_CHAIN_EVENTS. playAudioEvent(eventName) threads the chain's step into a chained sound function and advances the counter after.

THE FIGHT ROLL (D-113): startDieRollAnimation() plays die_rolling as the player's die icon starts spinning; resolvePlayerRoll() announces die_landing (loaded face), die_blank (blank, spent Nat 1) or nat_20/nat_1 instead. playAudioEvent() holds every other event announced while the player's icon spins (heldAudioEvents) and releaseDieRollDisplay() plays them at the stop, so landing and each mod_trigger (the trigger sound) follow the rattle, as the pops do. The enemy's roll keeps its own sounds, no rattle. die_rolling is four square ticks at a flat 644 Hz, gain 0.04, ending by 200ms, and the landing sound and the player icon's stop come GAME_CONFIG.ROLL_LAND_GAP_MS (250) after the rattle ends; die_blank a sine 300 to 260 Hz, gain 0.084.

Mute: devMuteAudioCheckbox (dev chrome) sets the module-level audioMuted flag (bootstrap.js); playTone() returns immediately when muted, before scheduling any oscillator. devMuteRollSoundsCheckbox sets rollSoundsMuted, which drops only ROLL_SOUND_EVENTS (die_rolling, die_landing, die_blank, mod_trigger) in playAudioEvent(). Both default unmuted.

---

# FIGHT RESET

Player: block→0, soul→maxSoul, deck/hand/discard reshuffled from ownedCards, poisonStacks→0, penitenceActive→false, penitenceTurnsRemaining→0, natOneFiredThisFight→false. hp carries over.
Enemy: hp→maxHp, poisonStacks→0, activeBuffs→[], natOneFiredThisFight→false. die is overwritten from the entering slot's own static config on next fight entry (beginFightFromSlot()), not reset here.
Die (player's): weights and mods unchanged. Persists between fights.
Turn: phase→'START_OF_TURN', cardsPlayedThisTurn→0, round→0, sealedFaces→[], secondChanceUsedThisFight→false, enemyRoundSkippedThisTurn→false.
Fight: blanksRolled→0 (updateFight()). The run's blanksRolled is untouched.
Registry: no clearListeners('fight') call exists anywhere — no listener has ever registered with clearOn: 'fight'. Every fight-scoped field above is reset explicitly, field by field, in clearFightScopedState()/resetFight() (run-and-map.js), not by a registry sweep.
Run: status→'active'.
Run record: entirely untouched by a fight reset — clearFightScopedState() never mentions gameState.runRecord. See RUN RECORD.

---

# RUN RECORD

Player-facing, not a dev tool. One line per run (human or bot), written to localStorage as the run happens — never reconstructed at the end, since file:// can't write files. gameState.runRecord (STATE SCHEMA) is run-scoped: reset only by startNewRun() (resetRunRecord()), untouched by a fight reset.

Write as it happens: enterSlot() (run-and-map.js) sets runRecord.started/node on every real slot entry, arrivalHpAtBoss the one time the boss slot is entered. dieActionChooseLoad() (render-layers.js) pushes `{ type:'load', offered, picked:null }` the moment an offer shows; dieActionPickLoadFace() patches `picked` once committed. dieActionChooseSkip() pushes `{ type:'skip' }` instead. runPhase()'s win/loss branches (phase-machine.js) call recordFightRoundEnd() the instant a fight ends, then flushRunRecord('won'|'lost').

Per-mod trigger counts are never accumulated as the run goes — collectTriggerCountsByMod() (run-and-map.js) reads gameState.die.faces fresh at serialize time, seeds every real mod at 0, sums each face's trigger count (modId and modId2 both contribute) into that mod's total.

Flush points — flushRunRecord(outcome), guarded by runRecord.flushed/started so a run that never began writes nothing and can't flush twice: boss defeated → 'won'; player death → 'lost'; New Run clicked mid-run → 'abandoned' (bootstrap.js, before startNewRun() resets it); a closed tab → the same from a 'beforeunload' listener. An abandon mid-fight calls recordFightRoundEnd() once more first, so a partial round count isn't lost.

Line format — buildRunRecordLine() (run-and-map.js) — one CSV row: source, node, arrivalHpAtBoss, outcome, fightRounds, totalRounds, dieActionEvents, triggerCounts, blanksRolled, build. blanksRolled (KI-52) counts every blank roll this run — a Sealed face and a spent Nat 1 included, a blank a card triggers not — bumped by blank_roll_counter, zeroed by startNewRun(). Lists within a column are "|"-joined, key:value pairs "label:rounds"/"modId:count" — never a raw comma, so it pastes clean with no quoting.

Storage and copy — RUN_RECORD_STORAGE_KEY = 'dieRunRecordLines' (run-and-map.js), a JSON array of lines in localStorage, appended by flushRunRecord(), never overwritten. #copyRunRecordBtn calls collectAllRunRecordLines() and copies it all to the clipboard, followed by every transcript line (below) — the player pastes that into one CSV file by hand; the game never writes to disk itself.

TRANSCRIPT — gameState.run.transcript, plain-text lines, last run only, reset by startNewRun(), mirrored to localStorage (RUN_TRANSCRIPT_STORAGE_KEY = 'dieRunTranscript') by appendTranscript() (run-and-map.js). Four kinds: FIGHT (act, slot, enemy name/HP, player HP/max) on beginFightFromSlot(); R<round> (enemy HP/poison, roll and mods, cards played, enemy's five-word action, player HP/block/poison) once per round from ENEMY_ACT_PHASE via appendRoundTranscript(); WON/LOST (round, player HP/max) from runPhase()'s win/loss; LOAD/STRENGTHEN/PURIFY/Removed face N/SKIP/CARD/RITE lines from the die action, card reward and rite screens. #copyRunRecordBtn appends a blank line, TRANSCRIPT, then every line after the CSV, logging both counts. HP printed on a panel, a layer, the transcript or the run record goes through shownHp() (state.js), never below 0 (KI-47); state keeps overkill.

---

# INIT FUNCTION

init() (cards-mods.js) runs once, on DOMContentLoaded (bootstrap.js), before anything else. It:
1. Populates config.cards with the 3 Ring 0 cards and the reward pool (config.cardPool references the same objects, not copies) — see CARDS
2. Populates config.classes with the Ordained class object — onNatTwenty/onNatOne/onBlankRoll are all implemented, not stubs
3. Populates config.mods with every mod — see MODS
4. Registers the Ordained's three permanent passives (BLANK_ROLL, NAT_TWENTY, NAT_ONE), the enemy's own permanent buff/Nat listeners (ENEMY_BUFF_TRIGGER, ENEMY_NAT_TWENTY, ENEMY_NAT_ONE), and the generic MOD_TRIGGER dispatcher
5. Resets dev-chrome state to closed/unchecked regardless of any browser-restored form state
6. Logs [INIT] gameState initialised, then [INIT COMPLETE]
7. Calls startNewRun() (run-and-map.js), which builds the act (buildAct()), sets up the player's starting die and deck, and lands on the map screen — not mid-combat

Nothing in the game runs before init() completes. No phase machine, no listeners, no rolls before it.
init() must not dump full arrays into the log. Log a summary line per structure, not the whole faces array or deck array.

---

# BUILD METHODOLOGY

One build per Claude Code session. A build may carry several items when its prompt lists them; each item gets its own assertions and is verified on its own, and if one item's test fails twice that item alone is undone and the rest finish (process rule D-72).
Every prompt starts with: Read CLAUDE.md.
Every prompt ends with: Do not change any other logic.
State only changes through helpers.
Everything attaches via listeners.
All damage through calculateDamage(). All block through generateBlock().
Stage 0: confirmed when log output matches expected output exactly.
Stage 1+: five consecutive clean fights with zero errors before next substage.
Never skip a failing substage. Never advance on partial verification.

COMMENT RULE: a comment says what the code does now, or why it must be this way (a law, a trap, an order it depends on). At most 8 lines in a row; a file's opening header may run to 12. No build numbers, stage numbers, dates, test results, or the story of what the code used to do; git and HISTORY.md hold that. Rule/decision IDs (LAW-A2, ARCH-CF1, D-66, KI-8) allowed when the ID is the reason. js/config.js's FACTS block is exempt.

TESTS: npm test runs every test file in tests/, one at a time, guardrails first. New assertions for a build go in tests/buildNNN.test.js. tests/ holds test files and their helpers only; screenshots and one-off scripts go in backups/. tests/shared-constants.js holds the page helpers every test file shares, topLevelNames() and the size caps (KI-51): no .js file under tests/ over TEST_FILE_MAX_LINES (800), no js/ file over JS_FILE_MAX_LINES (1700, down to 1500 once cards-mods.js is split). guardrails.test.js asserts both, that no top-level name is declared twice across js/ (F26), and that every js/ file has exactly one script tag in index.html, each naming a real file.

---

# WHO EDITS THIS FILE

Claude Code may append a one-line confirmation to CONFIRMED WORKING and update CURRENT SUBSTAGE. Claude Code also updates whichever standing section describes a mechanic, number, file, or structure that build actually changed — the ownership rule below. No other rewrite of a standing section without Fergus's own pasted text in the planning chat.

Every other change to this file — mechanics, rulings, schema, numbers, structure not touched by the build just shipped — is written in the planning chat and pasted in by Fergus.

OWNERSHIP RULE. Any build that changes a mechanic, a number, a file, or a structure updates the standing section describing it in the same build, and says so explicitly in its paste-back. The log (CONFIRMED WORKING/HISTORY.md) records that the change happened; the standing section records what is now true. A build touching only CONFIRMED WORKING/CURRENT SUBSTAGE has nothing else to update.

A build that changes any GAME_CONFIG value updates the F-line comment beside it in config.js's header and the FACTS block on the Notion page in the same build, and runs tests/facts.test.js before pasting back.

Every build updates #buildStamp (index.html) to its own stage/build number, whether or not it touches any other part of index.html — the one standing exception to "don't touch files the build doesn't need to." It's how a player or future session tells what code is running.

Every build regenerates verify/ (`node tests/screenshots.js`) and reports the diff (`node tests/screenshots.js --compare`, changed pixels per screen and per box vs. the parent commit) in its paste-back — a visual defect costs a diff to notice, not a build. Same standing-exception status: run it even when the build doesn't touch index.html/rendering, so a regression is caught by the next build's screenshot set, not discovered cold several builds later.

SIZE RULE: CURRENT SUBSTAGE holds the write-up of the newest build only. The first work step of every build moves the previous build's write-up to the end of HISTORY.md, word for word, by script, not by retyping. A CONFIRMED WORKING line is one line of at most 300 characters; the full text goes to HISTORY.md. This file stays at or under 90,000 bytes (CLAUDE_MD_MAX_BYTES, tests/shared-constants.js).

At the end of every session, paste back the new CONFIRMED WORKING line and the CURRENT SUBSTAGE section.

Notion is the source of truth for planning; neither mirrors the other. The Notion project page is 3d27b97ff65a81d396d5f6abf687468d, titled Die — V1. The previous page, 3be7b97ff65a81cd8836fd33c0a08b70, is now the Archive and is not read at session start.

---

# DEV MODE — ALWAYS PRESENT, NEVER SHIPS

Face buttons: trigger any face result without rolling
State inspector: full gameState as JSON at all times
Pipeline inspector: calculateDamage() breakdown — base, additions, multipliers, final
Registry inspector: all listeners grouped by hook and clearOn
Log: every event and calculation. Prefixed [PHASE] [MOD] [CARD] [DAMAGE] [BLOCK] [LISTENER]

---

# SCREEN LAYOUT

The fight screen is designed for 1600 by 900, fits a 16:9 window with no scrollbar. The play column (.left-col) is centred, max-width 1600px, min-width min(1280px, 100%), padding 16px 24px 14px. Colour is identity, motion is state: a face's hue never changes, a flash or hold says what just happened, the screen shows state, not conclusions (D-30). Every number, name, weight, trigger count and state is visible or readable from a native title on hover — information never decreases.

ACTION BAR — div.top-bar, 58px, outside .app, three groups. Left: #buildStamp, under it #goldValue (D-114: #goldIcon, art/gold.png at 32px, then #goldAmount, gameState.run.gold; no box; a failed icon load hides it and shows #goldFallback, the word GOLD) beside #artifactRow's eight 26px slots (each an artifact's art/artifacts/<id>.png icon filling the slot, its name under it until the icon loads, its text in the hover box), then #dieInfoBtn/#artifactsInfoBtn/#cardsInfoBtn (INFO LAYERS). Centre, var(--game-font) 13px: #actStamp as ACT N, ROUND with #roundValue, #phaseBadge in --phase-color, #resultBanner. Right, 30px buttons: #devChromeToggleBtn, #copyRunRecordBtn, #logToggleBtn, #startGameBtn.

ART BAND — #fightScreen's middle band, remaining height (min 220px). #playerArtBox/#enemyArtBox are 340x220px boxes, each an img (#playerArtImg/#enemyArtImg, src art/ordained.png and art/<enemy name lowercased>.png) plus a text label that swap on load/error — no art ships this build, so the label shows. Left of #enemyArtBox: #enemyIntentIcon, 40px inline SVG stroked --nat — sword/Attack, bolt/Charge, slashed bolt/Release, drop/Afflict, bolt again/Broken — aria-label carries the kind word; #enemyIntentValue beside it shows only the number (or BROKEN / the enemy Nat's wording). Both carry the full sentence in a .hover-tip child (opens downward, same as every die row's hover), no title attribute. #enemyIntentLabel under both carries a Charge wind-up's "break N / M".

ACT BACKGROUNDS (D-97) — #actBackgroundImg, first child of #fightScreen, same footprint as .band-top. art/background_act<N>.png, when present, draws at 40% opacity, pixelated, cover; renderActBackground() reuses setArtImage()'s onload/onerror pattern — missing (no art ships this build), it stays hidden. .band-top/band-d's own opaque backgrounds paint over it where they have content.

ENEMY BLOCK — the stats band's right 300px column (228px tall, 300/hand/300, bottom-aligned). #enemyPanelTitle (ENEMY / ELITE ★ / BOSS ☠), #enemyNameValue, HP #enemyHpValue, #enemyWrathLine when Wrath is up, #enemyReadLine for Pontifex, then #enemyStatusRow — one 28px square per state present, P + poison and W + Wrath, both --enemy-mod, each its own sentence as a title. #enemyBuffsValue lists every loaded face by number (POISON 3, POISON 9, SEAL 6); #enemyActiveValue lists gameState.enemy.activeBuffs. #enemyPoisonValue still writes every render, hidden — the P icon is where poison reads.

PLAYER BLOCK — the same band's left 300px column. ORDAINED, HP #playerHpValue, BL #playerBlockValue, SOUL #playerSoulValue, then #playerStatusRow: P + poison in --enemy-mod, PN for Penitence in --nat, D + amount for Drain in --player-mod, S for a Seal in --muted. Then #playerDebuffsValue, #playerDrainLine when it applies, DECK #playerDeckValue DISCARD #playerDiscardValue.

THE ONE CARD (D-112) — every card on screen (hand, card reward, shop, CARDS layer, both removal pickers) is renderCard(cardId, opts) (rendering.js), class .offer-card plus a size: .offer-card-offer 304x470 (the three spaced 130px apart), .offer-card-hand 144x216 (also .hand-card-el), .offer-card-mini 116x172. Top to bottom: soul cost as filled --nat dots at the top right, one per soul, none at zero cost; the name (never a cost in it); the rarity word in its tier colour; the art box (art/cards/<id>.png); the tag line; the text; an optional foot line (CLICK TO CHOOSE, the shop's price then CLICK TO BUY). The border is 2px in the tier's colour. The pickers and the CARDS layer draw one mini card per owned id with a ×N count (renderOwnedCardGrid()); a pick removes that id's first copy.

RARITY (D-111) — GAME_CONFIG.TIER_ORDER basic/uncommon/rare/mythic/void, TIER_COLOURS 4a4a4a/b8b8b8/60a5fa/fbbf24/8b5cf6; every rarity label (card line, offer symbol hover line) and every card border reads its tier's colour. The mod symbol PNGs stay as drawn.

HOVER BOXES (KI-46) — clampHoverTips() (render-text.js) shifts any showing .hover-tip inward, through the CSS translate property, until it sits 4px inside the window; it runs on every mouseover (bootstrap.js) and every refreshInspector().

HAND ROW — #handRow, centred in the stats band's middle column, the one card at hand size. Unaffordable at opacity 0.4; every card carries name/effect in its hover box. #endTurnBtn (128x44px) sits right of the last card, vertically centred (align-self: center). Every hand card's art placeholder and every card reward panel card holds an img child, src art/cards/<id>.png, pixelated, object-fit contain, hidden with an empty box on load failure — no art ships this build.

THE FACE ROW — #playerDieList, bottom band's middle column, twenty squares in one row, face 1 left, face 20 right (D-10); the only face row on screen — the reward layer picks/lights faces on it. Each square is a .face-btn capped at 56px, square, shrinking together, 8px gap, 2px border: blank --line/--blank number, loaded --player-mod, faces 1/20 --nat. The rolled face fills --text with a black number, holds for the round; a blank roll holds the same way; a hopped face matches; a sealed face keeps colour at opacity 0.5. Under each square, 17px var(--game-font-2) --blank: this roll's odds (rollOdds(), pipeline.js, the exact bag rollDie() builds), one decimal by largest remainder so the row totals 100.0 (KI-45; ties to the lower face); NAT 1/NAT 20 beside their percent, SEALED/SEALED NEXT ROUND on a sealed face; weight above 1 drops its percent ODDS_EMPHASIS.DROP_PX lower, one font step larger, ODDS_EMPHASIS.COLOUR, and the line D-130 draws under the square (2 px per weight above 1, none at 1, the face's colour) pushes the odds and symbols down by its height (--weight-px) with no square moving. HOVER (D-128): a loaded, unsealed face opens one box per mod, load order left to right, the Load offer's box — symbol, name, rarity word in its tier colour, tags, text, foot "weight N" (MAX, Bound) — faceModBox() (render-text.js). Blank faces, faces 1/20 and a Sealed face keep two lines (D-125): "BLANK · weight 1", then the text. Never a trigger count, that shows only in the DIE layer. SYMBOL STRIP (D-124): under each loaded face's caption, its mod symbol(s), art/mods/<id>.png at 24px (FACE_SYMBOL_PX), a two-mod face's side by side; blank faces and 1/20 none; a missing file hides. Each symbol is a .face-symbol with its own hover box (setHoverTip()) opening upward over it: that mod's name and the face's weight, then that mod's text; the face's own box stays shut meanwhile. .face-symbol-strip is absolute, so the squares and captions never move; it hangs below band-d into #fightScreen's overflow-clip-margin (20px, overflow: clip). Rows built face 20 first, flipped by row-reverse; .die-mod-wrap (mod names, ×N weight, trigger badges, Bound badge) stays hidden in the DOM as the source of those words. Dev force-roll click disables whenever a step wires the row as a picker instead (currentPlayerDiePickConfig()). ENEMY DIE ROW: #enemyDieList sits under #enemyArtBox in .enemy-art-col, one square per face (6/12 at 28px, 20 at 22px, .enemy-face-row): blank like a blank player face, buff --enemy-mod, Nat --nat, no percents. The rolled face holds through the round (enemyRollDisplay, render-text.js). Hover shows faceHoverText(). A dieless enemy hides the row (:empty); the reward layer hides it. Dev drawer open, a click in ENEMY_ROLL_PHASE forces that face via forceEnemyRoll().

DIE ICONS — #playerDieIcon, bottom band's left column: 104px inline SVG stroked --text, shaped by GAME_CONFIG.DIE_SIZE (20 hexagon d20, 12 pentagon, 6 square, each with an inner shape/spokes), rolled face number centred in --player-mod for a mod, --nat for a Nat, --blank for a blank, empty pre-roll. The number sits on a #000000 backing (`.die-icon-number-text`, 4px padding, 26px font) so the shape's inner lines stop short of it. #enemyDieIcon mirrors it in the right column, stroked --enemy-mod, sized from that enemy's die; beside it the triggered buff in upper case, or NAT 20/NAT 1 in --nat, and die size as d20/d12/d6 in --muted. A normal with no die: empty 104px outline (D-29). ROLL ANIMATION (D-107): every roll animates both icons per GAME_CONFIG.DIE_ROLL_ANIMATION — stepped random-number frames, each turned further, then upright on the rolled number, one flash, two shakes; the face row's rolled look, the roll strip and pops land at the stop. Display only (3 frames over 200ms); The Font's roll doesn't animate.

ROLL STAGE — #rollHero, one line above the face row: #rollResultNumber carries the roll's signed value, #rollResultLabel the mod name upper case in --player-mod with the run trigger count as ↻N in --muted (+13 CONSECRATE ↻6). A two-mod face prints both. A blank roll reads +2 BLANK, Nat 20 reads NAT 20, Nat 1 reads NAT 1 PENITENCE, both --nat; pre-roll, AWAITING ROLL in --muted — values taken from the mod's own log line, nothing recomputed. Pre-roll artifact controls sit on this strip, each shown only while open: #thirdEyeBtn, #secondChanceBtn (REROLL). Third Eye picks its face by clicking the real die row.

THE REWARD LAYER — #dieActionPanel, #cardRewardPanel, #artifactRewardPanel, #eventScreenPanel, #shopPanel, #riteScreenPanel keep their ids, live inside #fightScreen's .band-top (a position:absolute wrapper above the face row; band-d is pinned to #fightScreen's bottom edge, fixed 118px, so a panel's height never moves the face row; KI-32: band-d's three children each carry an explicit grid-column, since the die icons go display:none while the layer is open). #fightScreen.reward-layer-active (any of the six with a step open) hides band-b, band-c and band-d's roll-hero/die icons by CSS, so the layer covers everything in .band-top; #mapScreen hides the same way, so the layer shows in place of the map too (a rite, its shop, an elite's artifact reward, The Font). All six render through renderOfferPanel() (render-layers.js, D-86): .die-action-title — Choose on the die action (every step), card and artifact layers (D-115), SHOP, Rite, The Font's flavour — then .offer-cards — three of the one card at offer size (THE ONE CARD), except the Load and artifact reward offers, whose three choices are .offer-symbol, the symbol alone at 160px with its name/rarity/tag/text in a .hover-tip (D-110); .offer-skip right; then .offer-instruction, above the exposed face row. A face-picking step wires #playerDieList as the picker — currentPlayerDiePickConfig() is the one place isEligible/onPick/showBecomes lives. Card/artifact show cards, no instruction; Strengthen/Purify/Remove the instruction/row only (the die action's own buttons centred under Choose); Load its menu then three mod symbols; shop shows the price on the foot line, LEAVE for SKIP; The Font its flavour as title, ROLL then CONTINUE. Every panel builds from gameState each refreshInspector(). Nothing scrolls at 1600x900.

RITE SCREEN (D-116) — clicking a Rite node (enterSlot(), KI-31 marks it entered first) opens #riteScreenPanel in the reward layer in place of the map: title Rite, under it the player's HP as '20 / 70' in the HP red (.rite-hp) and nothing else, Heal / Take a die action / Remove a card centred (the panel fills .band-top and centres itself, as The Font's does), the face row below. The die action and the card-removal list (instruction CHOOSE A CARD TO REMOVE) open on the same layer; once the choice resolves the shop opens, then the map returns with the node completed.

SLEEK PASS (D-118) — :root's --ui-scale (0.75) multiplies every font size in index.html, each written calc(Npx * var(--ui-scale)) with N the pre-D-118 size (the px sizes named in this section are those N), except the face row and enemy face row (squares, symbols, captions, odds), the two die icons and their roll animation, and the art boxes, which keep their px. Font weight is normal everywhere except the screen titles (.die-action-title: Choose, Rite, SHOP, the info layers) and the roll strip's number, which stay bold, with the face row and die icons unchanged. Every box outline is 1px: panels, layers, buttons, the hover box, card art boxes, the top-bar slots, map nodes, status squares, art boxes. Kept at 2px: the face-row squares, the empty enemy die icon, the D-106 gold pick outline, and every card's rarity border (D-112).

POP NUMBERS — every HP, block, poison, soul and gold change pops a number where it happened (D-87, F46): damage/healing on #enemyArtBox/#playerArtBox, block on #playerBlockValue, stacks on #playerStatusRow/#enemyStatusRow, soul on #playerSoulValue, gold on #goldValue. GAME_CONFIG.DAMAGE_NUMBERS holds the rise, fade, step count and six colours; motion is stepped, no easing, no shake. state.js's helpers announce beside the same [STATE] log line, after refreshInspector() so the anchor reads as it now is — never a render function; render-text.js owns only spawnFxNumber(), placing .fx-number in #fxLayer. A pop keys on anchor + kind, so several hits in one round (a Nat 20 sweep) climb one total, fading 600ms after the last. Block/poison pop on a gain only, soul skips its START_OF_TURN reset, fxSuppressDepth silences bulk resets.

MAP SCREEN (D-98) — #mapScreen shows the top bar and the map only: no ACT N MAP title (the top bar's own already says it), no YOUR DIE/PLAYER DIE/ELITE PREVIEW/ELITE DIE/BOSS PREVIEW/BOSS DIE. .map-composition draws at zoom 1.25, the widest at which Start and Boss sit inside the map panel's border at 1600px (1.4 overran it), centred; node labels one size down (10px). The lower lane's slot 3 reads Anomaly (D-117). Act 1 draws nine nodes a lane (D-123): .map-composition-long shortens the in-lane connectors from 20px to 14px, so at 1600x900 and 1920x1080 every node sits inside the panel with no scroll; acts 2/3 keep eight and 20px. Node/connector states keep their classes/colours, dev-jump nodes stay dotted/muted. Hovering the Elite or Boss node shows a .hover-tip with the name/HP/pattern/loaded-faces text (enemyPreviewHoverText()) — a dev-jump node's own tip appends rather than laying a second one over the same spot. KI-31: enterSlot() marks the slot entered before its handler runs, refuses (logged) a second call on an entered slot; an entered current node reads as completed. No map node, dev-jump included, accepts a click while the reward layer is open.

INFO LAYERS (D-98) — #dieInfoBtn/#artifactsInfoBtn/#cardsInfoBtn (top bar) open #dieInfoLayer/#artifactsInfoLayer/#cardsInfoLayer, full-screen covers gated on gameState.ui.dieInfoOpen/artifactsInfoOpen/cardsInfoOpen. DIE is an HP line, a "Blanks rolled N" line (runRecord.blanksRolled), then one table (D-129): Face, Weight, Mod, Triggered, one row per face still on the die (a removed face drops out, D-119); the Mod cell holds the symbol(s), art/mods/<id>.png at 32px, names, Bound and Sealed, the Triggered cell the count per run, kept across fights ("N / M" on a two-mod face); ARTIFACTS lists run.artifacts by name/text, each row led by a 48px art/artifacts/<id>.png icon; every icon hides on load error; CARDS draws ownedCards as the one card at mini size, one per id with its count. renderInfoLayers() runs every refreshInspector(); CLOSE or Escape closes; same buttons work on the fight screen too.

LOG PANEL — #log in .right-col, shown only while gameState.ui.logOpen; #logToggleBtn flips it, default closed every page load, works on the map as on the fight screen. Open, .right-col covers the whole play column (position fixed, inset 0, black background, 24px padding) rather than sitting beside it — the fight keeps rendering underneath, unchanged when closed — #log at 22px VT323, a #logViewToggleBtn (LOG: PLAY / LOG: ALL) and #logCloseBtn doing what #logToggleBtn does. Play view hides `.log-state`/`.log-listener` lines (still in the DOM); All view shows them.

DEV DRAWER — #devChrome, below the panels, opened by #devChromeToggleBtn. Closed on every page load; #devModDescription reads the selected mod's text; the ROLL_PHASE pause (1800ms) only applies while it is open (D-113); Mute roll sounds (#devMuteRollSoundsCheckbox) silences the four roll sounds (AUDIO MODULE); Skip to Artifact Reward ends the fight as a win and opens the artifact offer; Skip to Die Action opens the die action panel with origin 'dev', its close returning to the fight with no reward; Load All fills every open slot on faces 2-19 with the selected mod, the anchor face 10 excepted; the Add card and Remove card dropdowns (renderDevCardOptions()) put a card into the deck or take an owned copy out, none of the three writing the run record, transcript or gold; closed also makes the two dev inputs outside it (die-face force rolls, map dev-jump nodes) inert.

---

# CONFIRMED WORKING

Full reports for every build below live in HISTORY.md, verbatim, in order. This section is an index only — read when a build's full detail is needed.

(BUILDs 001 to 169) one line per build in HISTORY.md; see it for any build before 170.
(BUILD 170) — D-124 mod symbols under faces, D-125 imperative texts, two-line face hover, D-113 roll sounds held to the stop.
(BUILD 171) — KI-48 Anthem reads its own face's weight, KI-49 Jubilee counts run.weightAdded.
(BUILD 172) — face hover without trigger counts, per-symbol hover boxes, die_rolling quieter, die_blank louder.
(BUILD 173) — D-126/D-127 blank synergy: Vacancy, Tabernacle, Tithe, Vigil, Reverberation, Tolling Bell, Gilded Die, Blank tag.
(BUILD 174) — KI-51: facts/mods tests split by BUILD, 34 test files to 54, line caps asserted. No game change.
(BUILD 175) — rendering.js split into four render files (F26 fifteen), name-collision and script-tag guardrails, tighter line caps. No game change.
(BUILD 176) — D-128 face hover as the offer box, D-129 DIE table, D-130 weight line, flat 644 Hz rattle and ROLL_LAND_GAP_MS, dev Skip to Artifact Reward/Add card/Remove card, KI-52 blanksRolled. Verified: npm test green, screenshots compared.
(BUILD 177) — KI-50 DIE count is per run (doc fixed), KI-23 Load All skips face 10, KI-21 no default die action origin, die_layer shot. Verified: guardrails, facts, mods, build177 green; screenshots compared.
(BUILD 178) — KI-54 seeded, stamp-free screenshots with a commit-based --compare, KI-55 config.js header room + F52, CLAUDE.md history moved out. No game change. Verified: guardrails, facts, mods, build178, build159 green; screenshots 0 px vs 177.
(BUILD 179) — D-125 wording pass (Consecrate, Reliquary, Leaden Face), Strengthen picker Now/Becomes with odds, symbol hover box asserted inside the viewport. Verified: npm test green, screenshots 0 px vs 178.

---


# CURRENT SUBSTAGE

Stage 3.06 (BUILD 179) — D-125 wording pass, on-screen text only.

Item A: every mod, card and artifact text audited against D-125. Reworded: Consecrate, Reliquary, Leaden Face. Tolling Bell kept, its wording asked as a question. No number, cost, tier or name changed.

Item B: symbol hover boxes were already inside clampHoverTips()'s reach; asserted at faces 2 and 19, at 1600x900 and 1280x720.

Item C: the Strengthen picker's hover shows Now and Becomes, weight and odds (.face-tip-now in --blank, .face-tip-becomes in --text).

Tests: build179.test.js. Corrected: build139 (Reliquary text), build178 (--from=HEAD --compare=HEAD).

Verification: see paste-back.

Full write-ups: HISTORY.md.
