# CLAUDE.md — Die V1

This file is the source of truth for building. It lives at C:\Users\figja\Die_v1\CLAUDE.md.

Read this file at the start of every session before doing anything else.

---


# PROJECT

Single HTML file (index.html) plus eleven plain JavaScript files under /js/, loaded via ordinary `<script src>` tags in a fixed order: config.js, state.js, listener-registry.js, audio.js, pipeline.js, cards-mods.js, run-and-map.js, phase-machine.js, rendering.js, dev-tools.js, bootstrap.js. No ES modules — file:// origins are null and module scripts are CORS-blocked, so this is a hard constraint, not a style choice. No build step. No npm. No server.

config.js (added BUILD 102) is the one constants file, loaded first, before state.js. Every tunable number and structural constant enumerated in the BUILD 102 prompt lives on one object, GAME_CONFIG — every other file reads it from there instead of repeating a literal. Its header comment carries the FACTS block (F01-F28) verbatim from the Notion "Die — V1" page, one line per fact beside the GAME_CONFIG field(s) that implement it — the one place the F-numbers live in code.

All eleven files share one global lexical scope, the same way one giant inline `<script>` block would. The only eager trigger anywhere in the codebase is `window.addEventListener('DOMContentLoaded', init)` in bootstrap.js — nothing calls a game function at parse time, so cross-file references are safe regardless of script tag order.

File: C:\Users\figja\Die_v1\index.html (loads the eleven js/ files above).
Open in browser to test. Double-click index.html only — never through a local server. /audio/ and /art/ exist as empty asset folders (created BUILD 091); nothing currently populates them — see AUDIO MODULE.

tests/mods.test.js (added BUILD 100) — a plain Node script (this project has no test runner installed, only the raw `playwright` library), run via `node tests/mods.test.js`. For each of config.mods' reward-eligible entries, dev-loads it onto a face and forces that roll through the real forcePlayerRoll()/MOD_TRIGGER dispatch, then asserts the exact numeric effect on gameState. Not loaded by index.html — a standalone verification script, not part of the eleven-file game bundle above.

tests/build101_enemy_roll.test.js (added BUILD 101) — same shape as tests/mods.test.js, run via `node tests/build101_enemy_roll.test.js`. Dev-jumps straight to the boss fight, force-rolls the enemy die's face 5 every round through round 4, dumps the resulting log lines, and screenshots the roll strip (tests/build101_roll_strip.png) right after a forced trigger. Not loaded by index.html.

tests/facts.test.js (added BUILD 102) — same shape, run via `node tests/facts.test.js`. Asserts every F-number (F01-F28) against GAME_CONFIG and against the running gameState/DOM after a fresh New Run, entering the opening fight or dev-jumping to the elite/boss where a fact needs live combat state. A mismatch between a documented fact and the live value is a failing test. Not loaded by index.html.

tests/autoplay.js (added BUILD 105) — a headless autoplayer, run via `node tests/autoplay.js`. Plays complete runs against real gameplay only (New Run, map node clicks, playCard(), nextPhase()'s own natural rolls, the real die-action/rite/card-reward panels) — never forcePlayerRoll()/forceEnemyRoll()/devJumpToSlot()/devLoadMod() — with a seeded Math.random (page.addInitScript, installed before any js/ file runs) so every roll and shuffle is reproducible from one seed. Fixed, documented-in-file policy: always the elite lane; cheapest block cards until block covers intent, then remaining cards by points-per-soul (damage+block+5/card drawn, live-evaluated); Load (priority list, highest blank face) or Strengthen face 20 as the die reward; heal below 35 HP at a rite, else a die action; the highest points-per-soul card reward, skipped under 5. Two CLI/policy parameters, dieRewardRule (asBuilt | elitesAndRitesOnly) and riteHeal (20 | 25, the latter via an extra healPlayer(5), no config edit) — neither edits a game file. Appends one CSV row per run to tests/autoplay_results.csv; caps a fight at 60 rounds (reported as a bug, not an outcome) and fails the batch on any console/page error or on any '[CARD] cannot play'/'not enough soul' log line. A measurement tool, not a floor or ceiling for a human — never loaded by index.html. CHECKPOINT 3 MAP: playOneAct()'s lane traversal is read live off gameState.run.act.upper (slot count and each slot's own type/label), not a hardcoded 5-slot array, so the identical policy plays both the pre-checkpoint-3 5-slot lane and the 8-slot lane with no code change; runBatch()'s summary now also reports mean rounds per fight (every completed fight's own round count, not just each run's last) and, per act, mean HP entering that act's own boss.

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

Two die actions only: Load (place a mod on a blank face) and Strengthen (add 1 weight to a face). Remove, Enchant, Purify and Expand are deferred.

Design floor: every mod must clearly outperform a guaranteed 2 block, measured on the turn it triggers, not scaled by trigger frequency. Trigger frequency cancels out of this comparison: a mod and a blank loaded on the same face are gated by the identical roll chance, so comparing their per-trigger value directly is correct. An earlier version of this floor incorrectly multiplied mod value by trigger rate (treating the mod as if it alone paid a 5%-frequency tax while the blank did not), which inflated the bar roughly twentyfold and is wrong — do not use that arithmetic. Current band: 10 to 16 points of value on the triggering turn. This was raised from an earlier "3 to 5 times a blank" (6 to 12 points) figure after the first mod pool draft came out weaker than Consecrate — 10 to 16 is the standard every future mod is checked against.

Enemy HP is the axis that carries progression across a run, not mod numbers. As enemies get tougher across a run, their HP pool scales; mod values themselves should stay in readable single or low double digits, and multipliers on those values should stay modest. Do not design a mod's power budget by inflating its raw numbers to keep pace with a harder run — that's enemy HP's job. This keeps every mod's value legible at a glance regardless of what stage of a run it's being evaluated in.

A run now has three fight types, each with its own HP/intent band and its own die (see ENEMY DIE PER TYPE): normal fights, one elite per act, and the act boss. This superseded the single flat "test enemy" the design floor above predates.

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
    penitenceTurnsRemaining: 0,   // set to PENITENCE_TURNS (3) at Nat 1 onset, ticked down at START_OF_TURN
    natOneFiredThisFight: false,  // Nat 1 is once per fight; once true, face 1 rolls a plain blank for the rest of the fight
    ownedCards: []                // full permanent collection; deck/hand/discard reshuffle from this every fight reset
  },

  enemy: {
    id: 'Fight' | 'Elite' | 'Boss',
    hp: 0, maxHp: 0,
    intent: 0, intentMin: 0, intentMax: 0,  // intent re-rolled in this range every START_OF_TURN
    hasDie: false,                 // true only for elite/boss — see ENEMY DIE PER TYPE
    die: { faces: [] },
    poisonStacks: 0,
    activeBuffs: [],
    natOneFiredThisFight: false,   // mirrors the player's field; only meaningful on the boss (only die with ENEMY_NAT_ONE)
    buffPoisonStacks: 5            // BUILD 125 (F31) — this fight's own enemy_buff_poison amount, fixed at buildAct() time from GAME_CONFIG.ENEMY_BUFF_POISON_STACKS scaled (Math.ceil) by the current act's ACT_INTENT_MULTIPLIER — see ACTS
  },

  die: {
    faces: []                      // the player's own die, 20 faces, persists across fights. BUILD 108: the old separate triggerCounts array (BUILD 103) is gone — each loaded face's own modData now carries triggerCount (for modId) and, on a two-mod face, triggerCount2 (for modId2), run-scoped like the rest of modData, not fight-scoped. See MULTI-MOD FACES.
  },

  turn: {
    phase: 'START_OF_TURN',
    cardsPlayedThisTurn: 0,
    round: 0,
    rollOutcome: null,             // 'blank' | 'mod' | 'nat_twenty' | 'nat_one'; cleared every START_OF_TURN
    rolledFaceWeight: null,
    rolledFaceNumber: null,        // drives the die-row highlight
    enemyRollOutcome: null,        // BUILD 101: enemy-side mirror of rollOutcome, same values; set in resolveEnemyRoll()
    enemyRolledFaceNumber: null,   // BUILD 101: enemy-side mirror of rolledFaceNumber; drives the enemy die-row highlight
    modTriggeredThisTurn: false,   // true whether the trigger came from a normal roll or Nat 20's loop
    enemyAttackCancelledThisTurn: false  // set by the enemy's own Nat 1, read once by ENEMY_ACT_PHASE, cleared next START_OF_TURN
  },

  run: {
    stage: 1,
    node: 1,
    status: 'active',              // 'active' | 'win' | 'loss' — THIS FIGHT only
    screen: 'map',                 // 'map' | 'fight'
    outcome: 'active',             // 'active' | 'won' | 'lost' — the WHOLE run
    lane: null,                    // null | 'upper' | 'lower', fixed at the divergence
    currentSlot: null,             // null (at the fork) | { lane, index } | 'boss'
    act: null,                     // built by buildAct(actNumber) — opening/upper[]/lower[]/boss slots, that act's own numbers baked in
    actNumber: 1                   // BUILD 125 (F31) — 1-based, GAME_CONFIG.ACTS total. Incremented only when a non-final act's boss is defeated — see ACTS
  },

  // BUILD 109: the run record. Distinct from run above (which is fight/
  // run-progress state read by the game itself) — this is a write-once-
  // per-event log of the run for the player's own reference, reset only by
  // startNewRun() (resetRunRecord()), never by a fight reset. See RUN
  // RECORD for the full mechanic.
  runRecord: {
    started: false,                // true once at least one real slot has been entered this run
    flushed: false,                // true once this run's line has been written to localStorage
    source: 'human',               // 'human' | 'bot' — always 'human' from real play
    node: null,                    // last slot entered, e.g. 'opening' | 'upper-2' | 'boss'
    arrivalHpAtBoss: null,         // player.hp the instant the boss slot is entered; null if never reached
    outcome: null,                 // 'won' | 'lost' | 'abandoned' — set once, at flush time
    fightRounds: [],               // [{ label, rounds }, ...] — one entry per fight that has ended or was in progress at flush
    dieActionEvents: []            // [{ type:'load', offered:[modId,...], picked }|{ type:'skip' }] — one per Load offer shown or Skip chosen
  },

  registry: {
    listeners: {}
  },

  config: {
    classes: {},
    cards: {},
    mods: {},
    cardPool: {}                   // the 15-card reward pool — see CARDS
  }

}

PENITENCE_TURNS = GAME_CONFIG.PENITENCE_TURNS (BUILD 102), assigned once in state.js and read by both Nat 1's onset and the START_OF_TURN tick, so they cannot drift apart.

---

# STATE HELPERS — USE THESE, NOTHING ELSE

updatePlayer(changes)   — Object.assign into gameState.player
updateEnemy(changes)    — Object.assign into gameState.enemy
updateTurn(changes)     — Object.assign into gameState.turn
updateDie(changes)      — Object.assign into gameState.die
updateRun(changes)      — Object.assign into gameState.run
updateRunRecord(changes) — Object.assign into gameState.runRecord (BUILD 109) — see RUN RECORD

config and registry are never updated through helpers.
config is set once at init and never changed.
registry is managed only through registerListener() and clearListeners().

---

# PHASE ORDER — NEVER CHANGE

START_OF_TURN → ROLL_PHASE → CARD_PHASE → END_PLAYER_TURN → ENEMY_ROLL_PHASE → ENEMY_ACT_PHASE → CHECK_WIN_LOSS → START_OF_TURN

ENEMY_ACT_PHASE returns immediately — before intent, block, or damage are touched — when gameState.turn.enemyAttackCancelledThisTurn is true, set by the enemy's own Nat 1 earlier the same turn.

---

# EVENT HOOKS — COMPLETE LIST

These are the names registerListener() is designed around. The phase names in PHASE ORDER (START_OF_TURN, ROLL_PHASE, CARD_PHASE, END_PLAYER_TURN, ENEMY_ROLL_PHASE, ENEMY_ACT_PHASE, CHECK_WIN_LOSS) are also, in practice, real dispatchable hooks: runPhase(phase) calls callListeners(phase) unconditionally near its top, once per phase visit, before that phase's own if-branch runs — so any registerListener() call using one of the seven PHASE_ORDER strings as its hook fires at that phase's boundary, ahead of the phase's own logic. BUILD 100 correction: the previous version of this section (BUILD 099's documentation pass) asserted the opposite — that callListeners() is never invoked with a phase name — and called Vigil's registration on 'END_PLAYER_TURN' a dead hook on that basis. Both claims were checked against the current code and are false: phase-machine.js's runPhase() has called callListeners(phase) generically since before this build, Vigil's registration was never dead, and a live Playwright run (see CONFIRMED WORKING, BUILD 100) confirms it fires and generates block correctly. END_PLAYER_TURN specifically is exercised today only by Vigil, and fires before that phase's own hand-to-discard logic, which is what lets it read hand size pre-discard.

Player-side hooks:
BLANK_ROLL — {} — a genuinely blank player roll, and also the player's own Nat 1 once it has already fired this fight
MOD_TRIGGER — { modId, faceNumber } — a real mod trigger, from either a normal single-face roll or Nat 20's loop
NAT_TWENTY — {} — player rolls face 20
NAT_ONE — {} — player rolls face 1
ON_CARD_PLAY — { card }
ON_DAMAGE_DEALT — { amount, source }
ON_BLOCK_GENERATED — { amount, source }
ON_HEAL — { amount } — added BUILD 092 alongside healPlayer()

Enemy-side hooks:
ENEMY_BUFF_TRIGGER — { buffId, faceNumber } — a loaded enemy buff face triggers, from a normal roll or the enemy's own Nat 20 loop
ENEMY_NAT_TWENTY — {} — enemy rolls face 20 (boss only — the only die that carries this modId)
ENEMY_NAT_ONE — {} — enemy rolls face 1 (boss only)

Pipeline hooks — read directly off gameState.registry.listeners, not through callListeners(); each fn returns a number:
DAMAGE_FLAT_ADDITION — fn() returns amount to add
DAMAGE_MULTIPLIER — fn(sourceType) returns multiplier value; sourceType lets a multiplier scope itself (e.g. Fervour doubles 'attack' only, never 'poison')
BLOCK_FLAT_ADDITION — fn() returns amount to add
BLOCK_MULTIPLIER — fn() returns multiplier value (same pipeline shape as DAMAGE_MULTIPLIER; no mod currently registers one)

BUILD 100 correction: the "known dead registration" reported here by BUILD 099 was itself wrong. cards-mods.js registers Vigil's block-per-card-held effect on hook 'END_PLAYER_TURN'; that hook IS dispatched — see this section's note above — and Vigil fires correctly, verified live via Playwright (CONFIRMED WORKING, BUILD 100). No code change to Vigil or to phase-machine.js was needed; this build's fix was to the documentation and to add tests/mods.test.js as a standing regression guard so a genuinely dead mod registration can't pass as confirmed again.

---

# LISTENER API

registerListener(hook, id, fn, clearOn)
  hook    — one of the names in EVENT HOOKS above; a PHASE_ORDER phase name is also accepted and does fire, at that phase's boundary, via runPhase()'s own generic callListeners(phase) call (see EVENT HOOKS)
  id      — unique string identifier for this listener
  fn      — pipeline hooks: fn() (fn(sourceType) for DAMAGE_MULTIPLIER) returns a number. other hooks: fn(data) returns nothing.
  clearOn — 'turn' | 'permanent'. 'fight' is accepted by the function signature but no call site has ever passed it, and clearListeners('fight') itself was removed in BUILD 092 as dead code — every fight-scoped field is reset explicitly instead (see FIGHT RESET).
  Same hook + same id registered twice is a no-op (BUILD 092 dedup guard): registerListener logs '[LISTENER] duplicate registration skipped' and returns without re-adding it. This matters for a mod whose own effect() would otherwise re-register a persistent listener on every trigger.

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

dealDamage(target, amount, sourceType, sourceId, fireListener = true) — shared helper (pipeline.js). Runs calculateDamage(), applies it to the target's hp via updateEnemy()/updatePlayer(), plays the damage-landing sound when damage > 0, and fires ON_DAMAGE_DEALT unless fireListener is explicitly false (used once, by the enemy's own attack, which never fired that hook before dealDamage() existed and must not gain it now). Returns the final damage dealt. Every card/mod that deals damage calls this instead of repeating the three lines inline.

dealBlock(amount, sourceId) — same shape for block: generateBlock(), add to gameState.player.block, fire ON_BLOCK_GENERATED. Returns the final block generated.

healPlayer(amount) — added BUILD 092. newHp = Math.min(gameState.player.hp + amount, gameState.player.maxHp); updates hp; fires ON_HEAL with the actual, post-cap amount healed; returns that amount. No flat-addition or multiplier stage — a direct clamp, not a third pipeline. Currently used by the post-win rite's Heal option.

All turn-scoped pipeline listeners clear at START_OF_TURN automatically.

---

# ROUNDING

Always Math.ceil(). No exceptions.

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

Eighteen cards defined in total: the three Ring 0 cards the run always starts with, plus the fifteen-card reward pool (config.cardPool) the reward screen draws its three offered options from. Both live in the same config.cards object; cardPool holds references to the same fifteen objects, not copies.

Ring 0 — the starting deck (5 Strike, 4 Ward, 1 Rite, 10 cards):
Strike — 1 soul, attack — 5 damage.
Ward — 1 soul, block — 5 block.
Rite — 2 soul, attack, Ordained-only — 5 damage + 6 block.

Pool (config.cardPool), fifteen cards:
Rebuke — 0 soul, attack — 4 damage.
Censure — 2 soul, attack — 14 damage.
Judgement — 3 soul, attack — 20 damage.
Vestment — 2 soul, block — 13 block.
Litany — 2 soul, attack — 7 damage + 7 block.
Scripture — 1 soul, utility — draw 2.
Communion — 0 soul, utility — +2 soul this turn.
Censer — 1 soul, utility — 4 poison to the enemy.
Purge — 1 soul, attack — 6 damage, 10 if the enemy is currently poisoned.
Interdict — 1 soul, block — 5 block, 10 if enemy intent is 12 or higher.
Reckoning — 1 soul, attack — 3 + 2× the enemy's current poison stacks.
Retribution — 1 soul, attack — damage equal to current block, capped at 12.
Covenant — 1 soul, attack — 2 + 3× the weight of the face rolled this turn (gameState.turn.rolledFaceWeight).
Rapture — 2 soul (0 if a mod triggered this turn, via getCost), attack — 12 damage.
Orison — 1 soul, attack — 5 damage, 9 if this turn's roll was a blank (gameState.turn.rollOutcome === 'blank').

---

# DIE FACE OBJECT STRUCTURE

{ number: 1, modId: null, modId2: null, weight: 1 }

number: 1-N, where N is that die's own GAME_CONFIG.DIE_SIZE entry (BUILD 107, closes KI-12) — PLAYER, ELITE or BOSS. All three read 20 today, but each is its own named value, not one shared literal: the player, an elite and the boss are each free to vary independently later (D-11, Parked) without a second refactor. Nothing in js/ reads a bare 20 for a die size.
modId: null = blank. string = mod id from config.mods (player die) or a buff id (enemy die). weight: default 1.
modId2 (BUILD 115): a face can hold up to two mods, cap two, never three. null = only one mod (or blank). string = a second mod id, loaded after modId, only ever onto a face where modId is already set. Blank faces, Nat faces, and the enemy die's faces never carry a modId2 — see MULTI-MOD FACES below.
All of a die's faces must always be explicitly defined. No implicit blanks.
Player die and enemy die share this face object shape, but the Nat-face rule differs by die:

Player die — face 1 is always modId 'NAT_ONE', face GAME_CONFIG.DIE_SIZE.PLAYER (20) is always modId 'NAT_TWENTY'. Cannot change. Both are stub ids, never real mods, and both are excluded from Nat 20's own loaded-face loop.

Enemy die — whether faces 1/N carry a Nat modId depends on which enemy type the die belongs to; it is not fixed the way the player's is. See ENEMY DIE PER TYPE. buildEnemyDieFaces(poisonFaceNumbers, includeNats, dieSize) (run-and-map.js) is the one function that builds every enemy die; dieSize (BUILD 107 — was a bare 20) is the calling entity's own GAME_CONFIG.DIE_SIZE.{ELITE,BOSS}; includeNats is what switches faces 1/dieSize between an ordinary blank and a Nat face.

Weight display: any face at weight above 1 shows ×N in the die rows, on both the player's and the enemy's die, live (landed BUILD 065). The only place a face's weight is ever written is strengthenFace(faceNumber) (pipeline.js, BUILD 107) — Strengthen (rendering.js's dieActionPickStrengthenFace) and Ordain's effect (cards-mods.js) both call it instead of each cloning-and-incrementing gameState.die.faces independently, which is what they did before this build. Player die only — nothing Strengthens or Ordains the enemy's die. BUILD 116: the ×N text badge is no longer the only cue — a weight-2+ face also shows a bottom-anchored fill inside its own face-btn (`.face-weight-fill`, index.html), height 25% per point of weight above 1, capped at weight 5 (100%). Uses `background: currentColor` so the fill is always the same identity colour already governing that row (--blank/--nat/--player-mod/--enemy-mod) at reduced opacity — no new colour, emphasis only — see CURRENT SUBSTAGE for the full "why" (the thesis mechanic wasn't visible at a glance before this build).

Trigger-count display (BUILD 103, folded into per-face modData BUILD 108 — see MULTI-MOD FACES/TRIGGER COUNTS below): any loaded face on the player's own die that has triggered at least once this fight shows a badge — same box, same colour-inheritance selectors as the ×N weight badge (a separate CSS class, `.die-trigger-count`), zero triggers renders nothing. Player die only: renderDieList() gates this on reference equality between the faces array it was passed and gameState.die.faces, which is false for the enemy die and the map's static elite/boss previews. Closes KI-11. One counter per mod slot, not per face — a two-mod face shows both counts separated by a slash, first-loaded mod first. BUILD 116: the badge text changed from '↻N' to '#N' (and '#N1/N2' for two mods) — '↻' reads as a reload/refresh glyph to most players, not "count of," and '#' doesn't collide with the weight badge's own '×N' notation beside it; font-size bumped 14px -> 17px (with an explicit line-height:1, since without one the browser's default line box at 17px is taller than the die row's fixed height and pushes that one row taller than its neighbours — measured and fixed in the same build) so the number reads at a glance without hovering. BUILD 138: faces 1 and 20 (NAT_ONE/NAT_TWENTY) now also carry this exact badge — each counts how many times it has been rolled this run, in modData.triggerCount, the same field/render path every other face's own trigger count already uses (bumpNatFaceTriggerCount(), pipeline.js, called from resolvePlayerRoll()'s two Nat branches). Nothing in renderDieList() needed a code change for this — `face.modId !== null` was already true for both Nat stub ids, so the existing single-mod badge branch picked it up for free; only the existing nat-one/nat-twenty CSS colour-override selectors (already listing `.die-trigger-count`) needed to exist, and they already did.

---

# MULTI-MOD FACES (BUILD 115)

A face can hold up to two mods — modId (first loaded) and modId2 (second loaded) — cap two, never three. Per-face state (Zeal's accumulated bonus, per-mod trigger counts — see TRIGGER COUNTS below) stays on that face's own modData field regardless of which slot the mod is in; there is no parallel array keyed by face number anywhere in this system, and there must never be one (the carry-forward rule — BUILD 103's original triggerCounts array was exactly that shape, and BUILD 108 folded it back into modData for this reason; nothing new should ever repeat that mistake).

Trigger order: both mods on a face trigger when that face is rolled, in load order — modId first, modId2 second. Each resolves fully (its effect() returns) before the next begins. resolvePlayerRoll() (pipeline.js) dispatches this with two sequential, synchronous callListeners('MOD_TRIGGER', ...) calls; the generic mod_dispatch listener (cards-mods.js) needed no changes, since it was already written to handle one MOD_TRIGGER at a time regardless of caller.

Nat 20: onNatTwenty() (cards-mods.js) loops the player's loaded faces ascending, exactly as before; a two-mod face now dispatches both of its mods (modId then modId2) inside that same forEach iteration, before the loop advances to the next face — "within that face's own turn in the ascending sequence."

Load: dieActionChooseLoad() (rendering.js) still excludes the anchor and any mod already on the die, in either slot. The face picker (load_pick_face) offers any blank face AND any already-loaded, non-Nat, not-yet-full face together, always — BUILD 115's "only once no blank face is left" gate was removed in BUILD 116, per the prompt's explicit instruction: a second mod is a valid Load target at any point in a run, regardless of how many blanks remain. isEligible collapses to one condition, `f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2` — a blank face (modId null) trivially satisfies it, so no separate blank-vs-loaded branch is needed any more. dieActionPickLoadFace() writes modId on a blank face, modId2 on an already-loaded one, and refuses (no write) if both slots are already full — a defensive guard, since the picker's own eligibility should never offer a full face in the first place. The cap of two mods per face is unchanged.

Pool exhaustion (D-54, BUILD 126, revised BUILD 127): eligibleLoadModIds() (rendering.js — every unloaded, non-anchor mod, the same list dieActionChooseLoad() draws its 3-mod offer from) is checked before the Load button itself is ever rendered — the die action panel's 'choose' step shows only Strengthen and Skip once fewer than 3 remain, so a real 3-mod offer that can no longer be built is never presented at all, short or otherwise. dieActionChooseLoad() keeps the same eligibility check as a defensive fallback (converts to Strengthen) for a direct call bypassing the UI. tests/autoplay.js's bot policy checks the identical count before calling dieActionChooseLoad(), mirroring what a human would see.

Faces 1 and 20 are untouched by this change: both are always single-mod Nat stubs (NAT_ONE / NAT_TWENTY), excluded from the Load face picker exactly as before, and never gain a modId2. Face 20 can still be Strengthened; nothing else about it changes.

The enemy die shares the same face shape (modId2 always present, always null) for structural symmetry, but nothing ever writes an enemy face's modId2 — no enemy action loads a second buff. ENEMY_NAT_TWENTY's own loop (cards-mods.js) and resolveEnemyRoll() (pipeline.js) were deliberately left reading only modId; this is a scope choice, not a gap, since the enemy die's faces can structurally never carry a second buff.

Display: a face holding two mods shows both mod names in the one die row, side by side — `.die-mod-pair` (index.html, replaced BUILD 115's vertical `.die-mod-stack` at BUILD 117) wrapping two `.die-mod` spans, each with its own inline trigger-count badge. No new row; the die column still renders exactly twenty rows. faceHoverText() (rendering.js) appends the second mod's MOD_DESCRIPTION entry to the hover tip the same way. BUILD 137 (playtest readiness): each name is truncated to its first TWO_MOD_NAME_CHARS letters (rendering.js, 6 by default), no ellipsis — replaces BUILD 117's fixed-max-width CSS ellipsis, which could cut a name down to two or three letters plus "…" (e.g. "Her…"/"San…"). The full name is available via a native `title` tooltip set on the name span itself, not the row's own hover-tip. 6 was measured (Playwright canvas measureText, worst-case pairing) to fit both names plus their inline trigger badges inside the narrower #dieActionDieList at the game's default 1600×1080 window with room to spare; drop to 5 if a future name addition stops fitting.

Dev tooling: devLoadMod() (dev-tools.js) mirrors the real Load flow's cap — fills modId if blank, else modId2 if empty, else refuses and logs "already holds two mods, refused" with no write. devClearFace() clears both slots.

TRIGGER COUNTS (BUILD 108): folded gameState.die.triggerCounts — BUILD 103's separate array, indexed by face number, fight-scoped — into each face's own modData, one count per mod slot: modData.triggerCount for modId, modData.triggerCount2 for modId2 on a two-mod face. mod_dispatch (cards-mods.js's registerListener('MOD_TRIGGER', 'mod_dispatch', ...)) matches data.modId against the triggering face's modId/modId2 to decide which counter to bump, so a face holding two different mods increments only the one that actually fired, never its neighbour — even under Nat 20, where both of a two-mod face's mods are dispatched separately (see Nat 20 above) and each bump lands on its own counter. Run-scoped, not fight-scoped: modData lives on the face object itself, which clearFightScopedState() (a fight reset — Restart Fight) never touches, so both counts survive a fight reset intact; only startNewRun()'s brand-new faces (buildFreshPlayerDieFaces(), carrying no modData at all) wipe them — the same mechanism that already wiped Zeal's own accumulatedBonus before this build. Zeal's own effect (cards-mods.js) was corrected in the same build to merge into the face's existing modData rather than replace it wholesale — it used to write `{ modData: { accumulatedBonus } }` as a bare object literal, which would have silently erased a face's trigger count on every Zeal trigger. Display: renderDieList() (rendering.js) shows a single ↻N badge on a one-mod face exactly as before (zero renders nothing); a two-mod face shows both counts separated by a slash, first-loaded mod first (↻N1/N2), shown whenever at least one of the two is nonzero.

---

# OUTSIDE-ROLL TRIGGER (BUILD 132)

triggerFaceOutsideRoll(faceNumber) (pipeline.js) is the one shared function every "trigger a face without rolling it" card/mod goes through — Threnody, Reverberation, Magnificat today; any future piece with the same shape uses this, never a second copy of the dispatch logic.

Refuses outright (no state change, returns false) for face 1 or face GAME_CONFIG.DIE_SIZE.PLAYER (20) — both are Nat stubs, never a real mod or a blank.

Refuses a face already triggered this way once this round — gameState.turn.outsideTriggeredFaces (state.js), an array of face numbers, cleared to [] at START_OF_TURN (phase-machine.js) alongside every other per-round roll flag. A face rolled normally and then re-triggered outside a roll (Reverberation) is not blocked by this rule — the record only tracks outside triggers, not the roll itself.

D-51 — per-round trigger cap. GAME_CONFIG.ROUND_TRIGGER_CAP (config.js) is 10. gameState.turn.roundTriggerCount (state.js) counts every real MOD_TRIGGER dispatch this round — mod_dispatch (cards-mods.js, the one permanent MOD_TRIGGER listener) increments it on every call, whether reached via a normal roll, triggerFaceOutsideRoll(), or anywhere else — except a Nat 20 sweep's own calls, which onNatTwenty() (cards-mods.js) tags natTwentySweep: true so mod_dispatch can skip counting them; this is the one exemption. A blank face's BLANK_ROLL dispatch bypasses mod_dispatch entirely, so triggerFaceOutsideRoll() bumps the same counter directly in that branch. triggerFaceOutsideRoll() refuses once the counter has already reached the cap; cleared to 0 at START_OF_TURN, same site as outsideTriggeredFaces above. BUILD 137 (playtest readiness): the "round trigger cap (N) reached" log line now prints at most once per round — gameState.turn.roundTriggerCapLogged (state.js), set true the first time the cap refuses a trigger, checked before logging, cleared at the same START_OF_TURN site as every other round-scoped flag above. Refusals after the first still return false and still refuse the trigger; only the repeated log line is suppressed.

Dispatch: a loaded face triggers through the identical MOD_TRIGGER callListeners() dispatch a rolled face uses — modId first, then modId2 if present, same load order, same mod_dispatch funnel — so permanent per-face growth (Zeal's accumulatedBonus, Ordain's/Elevation's weight write via strengthenFace(), Cope's copeBonus) accrues exactly as it would on a roll. A blank face dispatches BLANK_ROLL for the same GAME_CONFIG.BLANK_ROLL_BLOCK (2) block. Never writes gameState.turn.rolledFaceNumber/rollOutcome/rolledFaceWeight — an outside trigger never changes which face is considered "the face rolled this round."

---

# THE HOP (BUILD 138)

Die feedback: every face that fires WITHOUT being the face actually rolled this round — a Nat 20 sweep, a Bound scan, or an outside-roll trigger (Threnody/Reverberation/Magnificat/Novena) — moves its die row to the exact same look a rolled face gets (indent + yellow, `.die-row-rolled`/`.die-row-rolled-flash`, index.html — byte-for-byte the same classes/CSS the BUILD 090 rolled-face highlight already uses, no new colour, no new indent). Player die only; the enemy die's own Nat 20 sweep (ENEMY_NAT_TWENTY) is unpaced (no playSweep()) and out of this build's scope.

gameState.turn.hoppedFaces (state.js) is the record — an array of face numbers, appended in firing order, a face never added twice in the same round. Two call sites mark it, both at the instant a face's dispatch actually fires (pipeline.js's markFaceHopped()):
- triggerFaceOutsideRoll() — covers every outside-roll trigger AND the Bound scan, since runBoundScan() dispatches through this same function; one call right after the round's outsideTriggeredFaces record is written, before the MOD_TRIGGER/BLANK_ROLL dispatch below it.
- onNatTwenty()'s own playSweep() dispatch callback (cards-mods.js) — the one sweep path that dispatches directly via callListeners() rather than through triggerFaceOutsideRoll(), so it needs its own call.

Paced by playSweep() exactly as before (BOUND ENGINE's Fast sweep timing, unchanged by this build) — the hop is marked inside the same dispatch callback playSweep() already staggers, so it lands at the same moment (and same pace) the underlying trigger does, never separately timed.

Display: renderDieList() (rendering.js) applies the rolled-face look to any row whose face.number is in gameState.turn.hoppedFaces, player-die containers only (playerDieList/dieActionDieList, never enemyDieList or the map's static previews — same tracksRolledFace/isEnemyContainer gate the rolled-face highlight itself already uses), skipped for the row that is already the tracked rolled face (already covered by the existing highlight, so a re-trigger of the rolled face itself — e.g. Reverberation — adds nothing extra, no double-apply). Same flash-once-then-sustained split as the rolled face's own highlight: a per-container "already seen hopped" record (lastSeenHoppedFacesByContainer, module-scope, rendering.js — same idiom as lastSeenRollSignatureByContainer) picks the animated `-flash` class only on the render immediately after a face is newly added to hoppedFaces; every later re-render of that same hop gets the plain sustained `.die-row-rolled` instead. Stays in that look for the rest of the round, exactly as a rolled face does, and clears at the same site: gameState.turn.hoppedFaces is reset to `[]` at START_OF_TURN (phase-machine.js), alongside every other round-scoped roll flag.

Faces 1 and 20's own run-scoped roll counts (a separate BUILD 138 change, not part of the hop record): each counts how many times it has been rolled this run, stored in that face's own modData.triggerCount — the identical field/render path every other face's trigger-count badge already uses (see TRIGGER-COUNT DISPLAY above) — bumped by bumpNatFaceTriggerCount() (pipeline.js), called from resolvePlayerRoll()'s NAT_TWENTY/NAT_ONE branches on every roll of that face, including a spent face 1's later blank-equivalent rolls. Reset for free on a new run: buildFreshPlayerDieFaces() (run-and-map.js) already returns faces with no modData at all, the same mechanism that wipes every other face's trigger count.

---

# BOUND ENGINE (BUILD 133)

A face is Bound if a mod loaded on it (either slot) has Bound printed — carries the 'bound' tag, permanent — or the face was granted Bound for the fight. isBoundFace(face) (pipeline.js) checks both: face.modId/modId2 against gameState.config.mods[...].tags, and face.modData.boundGranted.

grantBoundToFace(faceNumber) (pipeline.js) is the one setter — grants Bound to a loaded face for the rest of the current fight, merged into that face's own modData (ARCH-CF2, same merge pattern Zeal/Cope already use). Refuses outright (no state change, returns false) for face 1 or face GAME_CONFIG.DIE_SIZE.PLAYER (20) — both are Nat stubs — and for a genuinely blank face (both slots null). The grant itself is the one piece of a face's modData that is fight-scoped rather than run-scoped (unlike trigger counts or Zeal's/Cope's own accumulators — see MULTI-MOD FACES/TRIGGER COUNTS above): clearFightScopedState() (run-and-map.js, shared by resetFight() and every real fight transition) strips boundGranted from any face that carries it at fight end, leaving the rest of that face's modData untouched.

Display (BUILD 137, playtest readiness): every Bound face — printed (isBoundFace() true via a mod's own 'bound' tag) or granted (isBoundFace() true via modData.boundGranted) — shows a small "Bound" badge on its die row (renderDieList(), `.die-bound-badge`, same box/font as the `.die-weight` ×N badge, D-28's no-new-palette rule). Shown on every container renderDieList() draws, not gated by the trigger-badge's showTriggerBadges (a printed badge is part of what the mod IS, visible wherever its name is); a granted badge only ever appears on the live player die, since grantBoundToFace() only ever writes gameState.die.faces. Appears the instant a grant lands and disappears the instant clearFightScopedState() strips it — no separate render step needed, since every updateDie() call re-renders every die list.

Bound scan: runBoundScan(rolledFace) (pipeline.js), called only from resolvePlayerRoll()'s own mod-trigger branch (never from onNatTwenty()'s Nat 20 sweep, so the scan never runs during a Nat 20). When the rolled face is itself Bound, every OTHER loaded Bound face on the die triggers through triggerFaceOutsideRoll(), ascending face order, any position on the die — gameState.die.faces is already ascending, so filtering preserves order with no extra sort. A face triggered this way never starts a further scan (triggerFaceOutsideRoll() has no notion of what called it). Counts toward GAME_CONFIG.ROUND_TRIGGER_CAP (D-51) exactly like any other outside trigger, no exemption.

Fast sweep timing: playSweep(faceNumbers, dispatchFn) (pipeline.js) paces WHEN each face in a multi-face sweep (Nat 20's onNatTwenty() loop, the Bound scan above) plays — state itself still updates the instant each dispatch runs, no layout change, no other number changes. gameState.turn.roundSweepPlays (state.js) counts every sweep-played trigger this round, both kinds of sweep alike, cleared at START_OF_TURN. The first three plays in a round land GAME_CONFIG.SWEEP_TRIGGER_DELAY_MS (200ms) apart; every play after the third lands at a quarter of that delay (50ms) instead.

Three plain Bound mods (checkpoint 3, BUILD 133): Unison — 6 damage. Accord — 10 block. Kinship — applies 4 stacks of poison, tags Bound+Poison. All three tier common, tags include 'bound'.

The remaining Bound pieces (checkpoint 3, BUILD 134) — five more, closing checkpoint 3: Kyrie (card, common, cost 1, tags Bound) — 5 damage, 10 if the rolled face has Bound (isBoundFace()). Novena (card, rare, cost 2, tags Bound) — every loaded Bound face triggers, each through triggerFaceOutsideRoll(). Canticle (card, uncommon, cost 1, tags Bound) — 6 block; if the rolled face is loaded, it gains Bound for this fight via grantBoundToFace() (never face 1 or 20, since grantBoundToFace() itself refuses those, and Nat faces are never treated as "loaded" here). Concord (mod, uncommon, tags Bound+Soul) — Bound. +1 soul, 3 block. Herald (mod, rare, tags Bound) — Bound. 6 damage; one other random loaded face without Bound gains Bound for this fight, through grantBoundToFace() and pickRandom() (state.js, BUILD 134 — picks a random item from a list off the same Math.random() source shuffle() uses, returning undefined for an empty list); no eligible face is a no-op, only the damage happens. Mod count 23 -> 25 (24 offerable plus Consecrate); reward card count 33 -> 36.

---

# WEIGHTED ROLL ALGORITHM

function rollDie(faces) {
  const pool = [];
  faces.forEach(face => {
    for (let i = 0; i < face.weight; i++) { pool.push(face); }
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

Default: GAME_CONFIG.DIE_SIZE.PLAYER faces (20) weight 1 = 5% each.
Strengthen to weight 2 = that face appears twice in pool.
This function never changes. Only weight values change.

Strengthen may target face GAME_CONFIG.DIE_SIZE.PLAYER (20), in addition to any loaded face. Face 1 is never targetable — the Strengthen face picker (rendering.js) excludes number 1 explicitly. Face 20 never gains a mod; Strengthen only adds weight to it, raising how often Nat 20 itself comes up.

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

onBlankRoll: generateBlock(2) via dealBlock(2, 'blank_face'), fires ON_BLOCK_GENERATED.

onNatTwenty (Nat 20): every loaded face on the player die triggers this turn, ascending face number order. Not capped, not once per fight — it fires in full every single time face 20 comes up. Face 1 and face 20 are excluded (their modIds are the NAT_ONE/NAT_TWENTY stubs, not real mods). Each qualifying face fires through callListeners('MOD_TRIGGER', ...) — the same dispatch a single rolled mod face already uses, so there is no second trigger path. Loop-safe because no mod in the pool re-rolls the die.

onNatOne (Nat 1 — Penitence): fires once per fight, gated on gameState.player.natOneFiredThisFight. First time: sets penitenceActive: true and penitenceTurnsRemaining: PENITENCE_TURNS (3), and logs onset. The actual 1-soul loss happens at each of the next three START_OF_TURNs, immediately after the soul reset, floored at 0; Penitence expires automatically after the third tick. Every subsequent face 1 rolled this fight instead dispatches BLANK_ROLL directly — an ordinary blank roll, identical in every way, with no distinguishing tag.

anchorModId references consecrate, built in config.mods — see MODS. The Ordained's die starts with exactly one loaded face: Consecrate on face 10. That starting face is Strengthen-eligible like any other loaded face, and Consecrate is excluded from the reward pool for that reason.

Enemy classes do not exist — the enemy's Nat 20 / Nat 1 / buff-trigger behaviour is registered unconditionally in init() (cards-mods.js), not attached to a class object, because it belongs to whichever enemy is being fought, not to a player class. See ENEMY DIE PER TYPE.

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

Thirteen mods, all in config.mods. Consecrate is excluded from the reward pool because it is already loaded on the Ordained's starting die (see CLASS OBJECT STRUCTURE); the other twelve are reward-eligible.

Consecrate (anchor) — +2 soul this turn; each card played this turn also generates 3 block, turn-scoped.
Smite — 16 damage. Flat, no conditions.
Penance — 8 damage + 8 block. Flat, no conditions.
Offering — +2 soul this turn, draw 1.
Blight — 6 poison to the enemy.
Virulence — 3 poison to the enemy, then doubles the enemy's total poison stacks (including the 3 just applied).
Sanctuary — 16 block. Flat, no conditions.
Vigil — grants 5 block per card still held in hand at end of turn, via a turn-scoped listener on hook 'END_PLAYER_TURN'. BUILD 100: confirmed working, not dead as BUILD 099 previously reported — see EVENT HOOKS. END_PLAYER_TURN is a real, dispatched hook (runPhase()'s generic callListeners(phase) call fires it before that phase's own discard logic), so Vigil's listener triggers correctly, reading hand size before the hand is discarded.
Zeal — 10 damage plus an accumulated bonus that permanently increases by 4 every time Zeal triggers again from the same specific face; stored per-face on that face's own modData (via updateDie()), not as a global counter, so Zeal loaded on two faces accrues independently on each.
Fervour — registers a turn-scoped DAMAGE_MULTIPLIER listener that doubles damage tagged 'attack' only (poison ticks are untouched). The first and only mod that uses the multiplier stage of the pipeline.
Ordain — 10 damage, then permanently adds 1 weight to the specific face it triggered from.
Anthem — 6 damage, plus 4 per point of weight on its own face (weight 1 -> 10, weight 2 -> 14, weight 3 -> 18; BUILD 113). Reuses two existing paths rather than adding new ones: dealDamage() tagged 'attack' (the same call Smite makes, so Fervour doubles it identically) and gameState.turn.rolledFaceWeight (Covenant's own read). Reads weight only; writes nothing.
Elevation — 10 damage; the face directly above the triggering face (faceNumber + 1) permanently gains +1 weight, but only if that face is loaded and is not face GAME_CONFIG.DIE_SIZE.PLAYER (20; BUILD 114). If the face above is blank or is face 20, only the 10 damage happens — no weight write, no error. Like Ordain, the weight write goes through the shared strengthenFace() (pipeline.js) — the only place any face's weight is ever written.

---

# ENEMY DIE PER TYPE

Replaces the single hardcoded "test enemy" this file used to describe. There are three enemy types, distinguished entirely by their die (buildAct(), run-and-map.js) — the die is what separates them:

Normal (the opening fight and every plain 'Fight' slot) — hasDie: false. No die is ever read; the fight screen's die slot still renders, empty, for layout consistency. A fixed intent band you can plan around, nothing to read.

Elite (one per act, upper lane) — hasDie: true. Die has exactly two loaded poison faces, on 7 and 14, and nothing else: faces 1 and 20 are ordinary blanks (modId: null), no ENEMY_NAT_ONE/ENEMY_NAT_TWENTY at all. Built via buildEnemyDieFaces([7, 14], false, GAME_CONFIG.DIE_SIZE.ELITE). Poison triggers on roughly 10% of the elite's rolls.

Boss (act finale) — hasDie: true. Die has three loaded poison faces (5, 10, 15) plus both Nat faces: face 1 is ENEMY_NAT_ONE, face 20 is ENEMY_NAT_TWENTY. Built via buildEnemyDieFaces([5, 10, 15], true, GAME_CONFIG.DIE_SIZE.BOSS). Poison triggers on roughly 15% of rolls, plus both Nat behaviours below.

buildEnemyDieFaces(poisonFaceNumbers, includeNats, dieSize) (run-and-map.js) is the one function that builds all three shapes above; there is no separate code path per enemy type. dieSize (BUILD 107) is each caller's own GAME_CONFIG.DIE_SIZE entry, not a shared literal — see DIE FACE OBJECT STRUCTURE. beginFightFromSlot() copies the entering slot's own static die onto the live gameState.enemy.die when a fight begins.

Enemy buff/Nat mechanics — all registered unconditionally in init() (cards-mods.js), not tied to gameState.player.classId, since they belong to the enemy's own die rather than to a player class, and exist regardless of which enemy is being fought:

enemy_buff_poison (the only buff that exists) — on trigger, applies gameState.enemy.buffPoisonStacks stacks of poison to the player, through gameState.player.poisonStacks, the same field every player-facing poison source (Blight/Virulence/Censer/the dev poison applier) already writes to. No second poison system. BUILD 125 (F31): that amount is not the flat GAME_CONFIG.ENEMY_BUFF_POISON_STACKS — it's fixed per act at buildAct() time (scaled by that act's ACT_INTENT_MULTIPLIER, Math.ceil'd) — see ACTS. BUILD 137 (playtest readiness): the base value was lowered from 5 to 3 (3/4/5 across acts 1/2/3, act scaling itself unchanged); ENEMY_NAT_ONE_SELF_POISON (below) is untouched.

ENEMY_NAT_TWENTY (boss only — no other die carries this modId) — fires every loaded buff face on the enemy's own die, ascending by face number. Not capped, not once per fight — a deliberate mirror of the player's own Nat 20. On the current boss die (three poison faces) this applies 15 total poison stacks to the player in one roll.

ENEMY_NAT_ONE (boss only) — two effects at once, both gated on gameState.enemy.natOneFiredThisFight (once per fight, mirroring the player's own Nat 1): (1) cancels the enemy's attack that turn entirely — sets gameState.turn.enemyAttackCancelledThisTurn, read once by ENEMY_ACT_PHASE, which returns before intent/block/damage are touched at all — and (2) self-poisons the enemy a flat 5 stacks, regardless of how many poison faces its own die carries. Corrected in BUILD 098 from an earlier version that applied 5 stacks per loaded poison face (15 on the boss — roughly two thirds of the boss's own HP from a single 5% roll); the player-facing poison amount above was never affected by that bug. Once fired, every subsequent face 1 this fight resolves as a plain blank instead.

Enemy intent: rolled fresh each turn at START_OF_TURN, a random integer in [intentMin, intentMax] (normal 6-18, elite 10-18, boss 10-20 — act 1 values; see ACTS for other acts), fixed for that turn's ENEMY_ACT_PHASE and always visible to the player before CARD_PHASE. The die only determines whether a buff or Nat triggers — it never modifies intent.

FIGHT PANEL TITLE (BUILD 139, enemy readability): #enemyPanelTitle (index.html, inside .stats-col.enemy-stats) reads ENEMY with no mark for a normal fight, ELITE ★ for the elite, BOSS ☠ for the boss — set by refreshInspector() (rendering.js) from gameState.enemy.id (beginFightFromSlot() copies the entering slot's own label — 'Fight'/'Elite'/'Boss' — onto it). Plain Unicode text characters in the existing .panel-title font/colour, no image, no new palette.

ENEMY FACE HOVER TEXT (BUILD 139): faceHoverText() (rendering.js) — the same function/mechanism the player's own die rows use (DIE FACE OBJECT STRUCTURE) — now also resolves the enemy's own poison/Nat faces, which were real behaviour since BUILD 097/098 but had no hover entry until this build: enemy_buff_poison names "applies N stacks of poison to you"; ENEMY_NAT_TWENTY names "fires every loaded poison face this turn, ascending face order, each applying N stacks of poison to you"; ENEMY_NAT_ONE names "cancels the enemy's attack this turn (once per fight), applies N stacks of poison to itself". N is never hand-typed: renderDieList() (rendering.js) takes an optional 5th arg, buffPoisonStacks, threaded straight through to faceHoverText() — the live enemy die passes gameState.enemy.buffPoisonStacks, and the map's elite/boss die previews (renderMapScreen()) pass that slot's own static enemy.buffPoisonStacks — both already the act-scaled amount ACTS describes, fixed at buildAct() time. ENEMY_NAT_ONE's own number (GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON) is read directly, since it is flat and unscaled by act. Same `.hover-tip` component the player's own die rows use — no second hover mechanism.

---

# ACTS (BUILD 125, checkpoint 2, F31/F32)

The run is GAME_CONFIG.ACTS (3) acts, played in sequence. Each act is a fresh map of the same two-lane shape (F16) — same slot types, its own boss — built by buildAct(actNumber) (run-and-map.js), which now takes the 1-based act number and bakes that act's own scaled numbers into every enemy at build time (never read live off GAME_CONFIG mid-fight).

Scaling — GAME_CONFIG.ACT_HP_MULTIPLIER and ACT_INTENT_MULTIPLIER, indexed by actNumber-1, both [1.0, 1.4, 1.9] and [1.0, 1.2, 1.45]:
- Every enemy's hp is Math.ceil(base hp × that act's HP multiplier).
- Every enemy's intentMin/intentMax is Math.ceil(base × that act's intent multiplier).
- The enemy buff's poison amount (enemy_buff_poison, ENEMY DIE PER TYPE) rides the intent multiplier the same way: Math.ceil(GAME_CONFIG.ENEMY_BUFF_POISON_STACKS × intent multiplier) — 3/4/5 stacks across acts 1/2/3 (BUILD 137 — base lowered from 5 to 3 for playtest readiness; the ×1.0/1.2/1.45 act scaling itself is unchanged). Stored on gameState.enemy.buffPoisonStacks, copied from the slot's own enemy config by beginFightFromSlot(), same as hp/intentMin/intentMax.
- The enemy Nat 1 self-poison (ENEMY_NAT_ONE, GAME_CONFIG.ENEMY_NAT_ONE_SELF_POISON) stays a flat, unscaled 5 — this is the one enemy number acts do not touch.
- Act 1's multipliers are both 1.0, so buildAct(1) is byte-identical to the pre-125 buildAct()'s output. Die face layouts (F20/F21, which faces carry poison/Nats) do not change per act — only the four scaled numbers above vary.

Transition — a boss win's outcome depends on which act it ends (runPhase()'s win branch, phase-machine.js):
- Acts 1 and 2: the same reward flow any other fight win gets — one die reward (GAME_CONFIG.DIE_REWARDS.SINGLE; 'Boss' is never 'Elite', so never the two-action grant) plus a card reward. boss_defeated still plays (it is still a boss kill), but the run does not end. Closing that reward flow (advanceRun(), run-and-map.js) increments gameState.run.actNumber and rebuilds gameState.run.act via buildAct(actNumber) for the next act, resetting currentSlot to 'opening' and lane to null — the same fields startNewRun() itself sets for act 1. Player hp, die and ownedCards are untouched; no heal between acts (D-27).
- Act 3 (the final act): true VICTORY (D-22) — run.outcome becomes 'won', no die reward, no card reward, exactly as a single-act boss win always worked before this build.

UI: the act number is shown on both the map screen ("ACT N MAP" title, renderMapScreen()) and the fight screen (#actStamp, set by refreshInspector() from gameState.run.actNumber) — gameState.run.actNumber is the only source for either.

---

# AUDIO MODULE

audio.js (BUILD 093, extended 094/095, retuned 096). One AudioContext plus a name-to-sound table, the same shape as the listener registry: game logic never calls a sound function directly, only playAudioEvent('event_name'); SOUND_TABLE decides what that sounds like, so any sound can be swapped by editing that one table without touching a call site. Synthesised only via playTone(waveform, freqStart, freqEnd, durationMs, peakGain, attackMs) — no audio files; /audio/ stays empty.

Browser autoplay policy: an AudioContext built before any user gesture starts (and stays) suspended — every scheduled sound is silent, no error — until resumed from inside a real gesture handler. unlockAudioOnce() (audio.js), called once on the page's first pointerdown (bootstrap.js), is that resume.

SOUND_TABLE — 22 events, no entries added/removed/renamed since BUILD 096: roll, roll_blank, card_attack, card_block, card_hybrid, mod_trigger, damage_enemy, damage_player, block_absorb, end_turn, nat_20, nat_1, fight_won, fight_lost, fight_start_normal, fight_start_elite, fight_start_boss, boss_defeated, die_action_load, die_action_strengthen, card_reward_basic, card_reward_rich.

Two pitch chains climb as an action repeats within a turn, reset to 0 by resetSoundChains() at every START_OF_TURN, capped at CHAIN_STEP_CAP (8): CARD_CHAIN_EVENTS = ['card_attack', 'card_block', 'card_hybrid'] (cardChainStep) and MOD_CHAIN_EVENTS = ['mod_trigger'] (modChainStep). playAudioEvent(eventName) threads the relevant chain's current step into a chained event's sound function and advances that chain's counter afterward; every non-chained event is called exactly as it always was, with no argument.

Mute: devMuteAudioCheckbox (index.html, dev chrome) sets the module-level audioMuted flag (bootstrap.js); playTone() returns immediately when muted, before scheduling any oscillator. Default unmuted.

---

# FIGHT RESET

Player: block→0, soul→maxSoul, deck/hand/discard reshuffled from ownedCards, poisonStacks→0, penitenceActive→false, penitenceTurnsRemaining→0, natOneFiredThisFight→false. hp carries over.
Enemy: hp→maxHp, poisonStacks→0, activeBuffs→[], natOneFiredThisFight→false. die is overwritten from the entering slot's own static config on next fight entry (beginFightFromSlot()), not reset here.
Die (player's): weights and mods unchanged. Persists between fights.
Turn: phase→'START_OF_TURN', cardsPlayedThisTurn→0, round→0.
Registry: no clearListeners('fight') call exists anywhere — removed in BUILD 092 as dead code, since no listener has ever registered with clearOn: 'fight'. Every fight-scoped field above is reset explicitly, field by field, in clearFightScopedState()/resetFight() (run-and-map.js), not by a registry sweep.
Run: status→'active'.
Run record (BUILD 109): entirely untouched by a fight reset — clearFightScopedState() never mentions gameState.runRecord. See RUN RECORD.

---

# RUN RECORD (BUILD 109)

Player-facing, not a dev tool. One line per run (human or bot), written to localStorage as the run happens — never reconstructed at the end — because a page opened via file:// (see PROJECT's "double-click index.html only" rule) cannot write files. gameState.runRecord (STATE SCHEMA) is run-scoped: reset only by startNewRun() (resetRunRecord(), run-and-map.js), untouched by a fight reset (FIGHT RESET above).

Write as it happens:
- enterSlot() (run-and-map.js) sets runRecord.started true and runRecord.node to the slot just entered (describeSlot() — 'opening' | '<lane>-<index>' | 'boss') on every real slot entry; the one time laneName is 'boss', it also captures runRecord.arrivalHpAtBoss = gameState.player.hp before the boss fight begins.
- dieActionChooseLoad() (rendering.js) pushes a `{ type:'load', offered:[modId,...], picked:null }` entry onto runRecord.dieActionEvents the moment the 3-mod offer is shown; dieActionPickLoadFace() patches that same entry's `picked` field once a mod is actually committed to a face. dieActionChooseSkip() pushes a `{ type:'skip' }` entry instead — a genuinely distinct outcome, not a Load offer with no pick (Skip is chosen at the top-level 'choose' step, before any offer is ever shown; there is no way to abandon a shown Load offer short of leaving the run itself, which the abandon-flush below already covers).
- runPhase()'s win/loss branches (phase-machine.js) call recordFightRoundEnd(gameState.enemy.id) the instant a fight ends (gameState.turn.round is still that fight's own final round count — it only resets at the next START_OF_TURN), pushing one `{ label, rounds }` entry onto runRecord.fightRounds. The boss-win and player-death branches also call flushRunRecord('won'|'lost') immediately after.

Per-mod trigger counts are never accumulated as the run goes — collectTriggerCountsByMod() (run-and-map.js) reads gameState.die.faces fresh every time the record is serialized, seeds every real mod at 0, and SUMS each face's own trigger count into that mod's running total (both a face's own modId and modId2 contribute). BUILD 118 (KI-19 fix): this used to overwrite (`counts[modId] = faceCount`) instead of sum, which stayed silently correct only because the real in-game Load flow never lets the same mod appear on two faces (DIE_ACTION_EXCLUDED_MOD_IDS + the "already on the die" check — see MULTI-MOD FACES) — but devLoadMod() and devLoadAll() (dev-tools.js) enforce no such thing, so a die built by either can genuinely carry one mod on many faces, and the old code kept only whichever face was processed last, silently discarding every other face's count for that mod. Now sums correctly regardless of how many faces carry a given mod, and a mod on zero faces still reports 0 rather than being missing from the trigger-counts column entirely.

Flush points — flushRunRecord(outcome) (run-and-map.js), guarded by runRecord.flushed/started so a run that never began writes nothing and a run cannot be flushed twice:
- Boss defeated → flushRunRecord('won') (phase-machine.js, inside the existing boss-win branch).
- Player death → flushRunRecord('lost') (phase-machine.js, inside the existing loss branch).
- New Run clicked while gameState.run.outcome is still 'active' → flushRunRecord('abandoned'), called in the #startGameBtn click handler (bootstrap.js) BEFORE startNewRun() resets the record for the run about to begin. A run already won/lost has already flushed itself, so this is a no-op then.
- A closed tab → the same flushRunRecord('abandoned') call, from a window 'beforeunload' listener (bootstrap.js) — best-effort, since a browser can refuse to run further script during unload, but the flush is synchronous localStorage.setItem(), not async.
An abandon mid-fight (screen 'fight', status still 'active' — the win/loss branches above never fired) has flushRunRecord() itself call recordFightRoundEnd() once more for that still-unfinished fight before serializing, so its partial round count is never lost.

Line format — buildRunRecordLine() (run-and-map.js) — one comma-separated CSV row, columns in this order: source, node, arrivalHpAtBoss, outcome, fightRounds, totalRounds, dieActionEvents, triggerCounts. Lists within a column are "|"-joined and key:value pairs "label:rounds" / "modId:count" — a raw comma never appears inside any column, so the result pastes into a spreadsheet as a clean CSV with no quoting needed. dieActionEvents encodes a load event as `load:mod1|mod2|mod3>picked` (picked empty if the offer was never resolved) and a skip as the literal `skip`, multiple events ";"-joined in chronological order. totalRounds is fightRounds' own rounds summed at serialize time, never tracked as a separate running total (the same "read from the one source of truth" principle TRIGGER COUNTS above already follows).

Storage and the copy button — RUN_RECORD_STORAGE_KEY = 'dieRunRecordLines' (run-and-map.js), a JSON array of line strings in localStorage, appended to by flushRunRecord(), never overwritten. #copyRunRecordBtn (index.html, wired in bootstrap.js) calls collectAllRunRecordLines() — every line ever flushed this browser profile, prefixed with the RUN_RECORD_CSV_HEADER row, joined with '\n' — and copies the whole thing to the clipboard via copyTextToClipboard() (navigator.clipboard.writeText(), falling back to a hidden-textarea/execCommand('copy') trick). The player pastes that into one CSV file in the project folder (C:\Users\figja\Die_v1) by hand — this game never writes to disk itself. source is always 'human' from real play today; the column exists so a future headless writer (tests/autoplay.js, which currently has no round-length column — the gap this build closes) can mark its own lines 'bot' and land in the same file.

---

# INIT FUNCTION

init() (cards-mods.js) runs once, on DOMContentLoaded (bootstrap.js), before anything else. It:
1. Populates config.cards with the 3 Ring 0 cards and the 15-card pool (config.cardPool references the same objects, not copies) — see CARDS
2. Populates config.classes with the Ordained class object — onNatTwenty/onNatOne/onBlankRoll are all implemented, not stubs
3. Populates config.mods with all 11 mods — see MODS
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

---

# WHO EDITS THIS FILE

Claude Code may append a one-line confirmation to CONFIRMED WORKING and update CURRENT SUBSTAGE. Claude Code also updates whichever standing section describes a mechanic, number, file, or structure that build actually changed — see the ownership rule below. No other rewrite of a standing section happens without Fergus's own pasted text in the planning chat.

Every other change to this file — mechanics, rulings, schema, numbers, structure not touched by the build just shipped — is written in the planning chat and pasted in by Fergus.

OWNERSHIP RULE. Any build that changes a mechanic, a number, a file, or a structure updates the standing section describing it in the same build, and says so explicitly in its paste-back. The log (CONFIRMED WORKING / HISTORY.md) records that the change happened; the standing section records what is now true. A build that touches only CONFIRMED WORKING/CURRENT SUBSTAGE — no mechanic, number, file, or structure change — has nothing else to update.

BUILD 102: a build that changes any GAME_CONFIG value updates the F-line comment beside it in config.js's header and the FACTS block on the Notion page in the same build, and runs tests/facts.test.js before pasting back.

BUILD 117: every build updates #buildStamp (index.html) to that build's own stage and build number, in the same build, whether or not the build touches any other part of index.html — this is the one standing exception to "don't touch files the build doesn't need to." The stamp had gone stale repeatedly (stuck at BUILD 104 through BUILD 109, eleven builds) because nothing enforced this; it is not optional busywork, it is how a player or a future session can tell what code is actually running. Say so explicitly in the paste-back the way every other OWNERSHIP RULE update already does.

BUILD (KI-6): every build regenerates verify/ (`node tests/screenshots.js`) and reports the diff (`node tests/screenshots.js --compare`, changed-pixel count per screen against the previous run's set) in its paste-back — a visual defect this catches costs a diff to notice, not a build. Same standing-exception status as the build stamp line above: run it even in a build that doesn't touch index.html/rendering, so a regression from any build is caught by the next one's screenshot set, not discovered cold several builds later.

SIZE RULE (21 Sep 2026): CURRENT SUBSTAGE holds the write-up of the newest build only. The first work step of every build moves the previous build's write-up to the end of HISTORY.md, word for word, by script, not by retyping. A CONFIRMED WORKING line is one line of at most 300 characters; the full text goes to HISTORY.md. This file stays under 100 KB.

At the end of every session, paste back the new CONFIRMED WORKING line and the CURRENT SUBSTAGE section.

This file is the source of truth for building. Notion is the source of truth for planning. Neither mirrors the other. The Notion project page is 3d27b97ff65a81d396d5f6abf687468d, titled Die — V1. The previous page, 3be7b97ff65a81cd8836fd33c0a08b70, is now the Archive and is not read at session start.

---

# DEV MODE — ALWAYS PRESENT, NEVER SHIPS

Face buttons: trigger any face result without rolling
State inspector: full gameState as JSON at all times
Pipeline inspector: calculateDamage() breakdown — base, additions, multipliers, final
Registry inspector: all listeners grouped by hook and clearOn
Log: every event and calculation. Prefixed [PHASE] [MOD] [CARD] [DAMAGE] [BLOCK] [LISTENER]

---

# CONFIRMED WORKING

Full reports for every build below live in HISTORY.md, verbatim, in order. This section is an index only — read only when a specific build's full detail (exact numbers, exact code paths, exact Playwright verification) is needed.

Stages 0.1-0.5 (early builds, no individual build numbers cited in the original log) — HTML shell and gameState object; phase machine skeleton; listener registration system; state mutation helpers and state inspector; init divider log line.
Stages 1.2-1.10 (early builds, no individual build numbers cited) — config sync and repair; build stamp; enemy roll and blank-face passive; MOD_TRIGGER verification; blank-roll bug fix; START_OF_TURN behaviour; card drawing and deck cycling; card play; enemy action; win and loss.
Stage 1.11 (BUILD 050) — first real card reward screen, three throwaway placeholder cards (TEST_A/B/C), first substage of Stage 1. Superseded by the real 15-card pool (BUILD 051-59, folded into this entry in the original log).
Stage 2.8 (BUILD 077) — run-outcome guards added on the two remaining unguarded dev paths.
Stage 2.9 (BUILD 078) — riteStep dev-jump fix identified in BUILD 077's trace, applied.
Stage 2.10 (BUILD 079) — the die action screen's own 20-row die becomes the Load/Strengthen face picker, replacing two separate face-button screens.
Stage 2.11 (BUILD 080) — presentation pass on the BUILD 079 die-row picker, three browser-observed bugs fixed, CSS only.
Stage 2.12 (BUILD 081) — widened the Load/Strengthen picker's die rows to stop mod-name/badge clipping, one CSS rule.
Stage 2.13 (BUILD 082) — act grows from three lane slots to five; the elite grants two die actions instead of one.
Stage 2.14 (BUILD 083) — all dev chrome moved behind one toggle, closed by default; the setup pause made optional.
Stage 2.15 (BUILD 084) — Nat 1 becomes once per fight; Penitence changed from "rest of the fight" to 3 turns.
Stage 2.16 (BUILD 085) — boss intent band dropped from 16-28 to 10-20, average 15.
Stage 2.17 (BUILD 086) — elite intent band dropped from 12-22 to 10-18, average 14.
Stage 2.18 (BUILD 087) — New Run moved off End Turn and gated behind a confirm when a run is live.
Stage 2.19 (BUILD 088) — third rite option added, Remove a card, alongside Heal and Take a die action.
Stage 2.20 (BUILD 089) — the class card can now be removed at a rite; one discard restriction dropped.
Stage 2.21 (BUILD 090) — rolled-face highlight added to the player's die column.
Stage 2.22 (BUILD 091) — the file split: one ~3,217-line inline script becomes nine files in /js/, script-tag loaded, structural only.
Stage 2.23 (BUILD 092) — three engine fixes from the BUILD 091 code audit: registerListener dedup guard, dead clearListeners('fight') removed, healPlayer()/ON_HEAL added.
Stage 2.24 (BUILD 093) — three independent UI/audio items, verified and reported separately; the audio module (audio.js) is introduced.
Stage 2.25 (BUILD 094) — sound pass: twelve new synthesised sounds added on the BUILD 093 audio module.
Stage 2.26 (BUILD 095) — sound chain mechanic (two pitch chains, 8-step cap) plus five new sounds.
Stage 2.27 (BUILD 096) — tone pass retuning existing sounds; no new sounds, events, gameplay, numbers, or visuals.
Stage 2.28 (BUILD 097) — the boss die's enemy half: poison, Nat 20, and Nat 1 wired up on the boss's own die for the first time.
Stage 2.29 (BUILD 098) — Nat 1 self-poison corrected to a flat 5; elites given their own die (poison on 7 and 14, no Nat faces), closing the normal/elite/boss distinction.
Stage 2.30 (BUILD 099) — this documentation rewrite: standing spec sections restated to match the code, CONFIRMED WORKING compacted to this index, full history moved to HISTORY.md.
Stage 2.31 (BUILD 100) — Vigil audited and confirmed already working (BUILD 099's "dead hook" finding was a documentation error, not a code bug); tests/mods.test.js added as a standing per-mod regression suite for all eleven mods.
Stage 2.32 (BUILD 101) — enemy roll made visible: resolveEnemyRoll() audited and confirmed already fully resolving (not a no-op); the rolled-face highlight (BUILD 090, player-only) extended to the enemy die column via new enemyRollOutcome/enemyRolledFaceNumber turn fields.
Stage 2.33 (BUILD 102) — one constants file: js/config.js (new, loaded first — …
Stage 2.34 (BUILD 103) — trigger-count indicator: …
Stage 2.35 (BUILD 104) — font unification pass: every player-facing text selector that didn't already carry var(--game-font) at .panel-title's own weight (die-mod, face-btn, die-weight, die-trigger-count, stat-label, stat-value) now does. …
Stage 2.36 (BUILD 105) — tests/autoplay.js: a headless autoplayer, a measurement tool (never ships), plays complete runs against real gameplay only (New Run, map clicks, playCard(), nextPhase()'s own natural rolls, the real die-action/rite/card-reward panels — …
Stage 2.37 (BUILD 113) — twelfth mod, Anthem: 6 damage plus 4 per point of weight on its own face (weight 1 -> 10, weight 2 -> 14, weight 3 -> 18). Reuses dealDamage() tagged 'attack' (Smite's path — Fervour doubles it identically) and gameState.turn.rolledFaceWeight (Covenant's own read) — …
Stage 2.38 (BUILD 114) — thirteenth mod, Elevation: 10 damage; the face directly above the triggering face (faceNumber + 1) permanently gains +1 weight, but only if that face is loaded and is not face 20. …
Stage 2.39 (BUILD 115) — multi-mod faces: a face can now hold up to two mods (modId, modId2 — load order), cap two, never three. …
Stage 2.40 (BUILD 108) — per-mod trigger counts: BUILD 103's separate gameState.die.triggerCounts array (fight-scoped, indexed by face number) folded into each face's own modData — modData.triggerCount for modId, modData.triggerCount2 for modId2 on a two-mod face — …
Stage 2.41 (BUILD 109) — the run record: a player-facing, localStorage-backed log of every run (see RUN RECORD), built from scratch (no prior copy-run-line button or clipboard/localStorage code existed anywhere — flagged and approved before writing any code). …
Stage 2.42 (BUILD 116) — three fixes: …
Stage 2.43 (BUILD 117) — three die-row fixes plus one investigation: two mods now render side by side on one line, each with its own trigger count beside it (replaces BUILD 115's vertical stack, which broke row height — …
Stage 2.44 (BUILD 118) — KI-19: collectTriggerCountsByMod() (run-and-map.js) OVERWROTE a mod's trigger count with whichever face was processed last instead of summing across every face carrying it, silently discarding every earlier face's count — …
Stage 2.45 (BUILD 119) — measurement session, not a feature build: re-measured the bot win rate D-08 recorded at 34% at BUILD 105. No design/policy change to the bot (resolveDieAction()/LOAD_PRIORITY untouched); two run-record plumbing additions to tests/autoplay.js only — …
Stage 2.46 (BUILD 112) — "make verification honest": closes KI-14 (facts.test.js's circular comment-vs-GAME_CONFIG assertions now labelled SPEC-ONLY, 18 assertion-sites/14 tests, real behavioural assertions untouched), KI-9 (checked the resetFight()/clearListeners('turn') gap empirically — …
Stage 2.47 (BUILD 120) — the screenshot baseline KI-6 had queued: …
Stage 2.48 (BUILD 121) — D-53 sweep: every bare use of "stacks" (a stacking-status count with no status named beside it) in a log string or a GAME_CONFIG comment now names the status it counts. …
Stage 2.49 (BUILD 122) — KI-18, the stale build stamp: GAME_CONFIG.BUILD (config.js, new) is now the single source of truth for the on-screen build number. …
Stage 2.50 (BUILD 123) — checkpoint 1 on 8 North star, OQ-13: LOAD_PRIORITY (tests/autoplay.js) replaced with the twelve loadable mods in Fergus's own rank order from 1 State §6 (Fervour 1 through Vigil 12; Consecrate is the anchor, never ranked, never offered) — …
Stage 2.51 (BUILD 124) — closes the CSV stale-build-stamp bug BUILD 123 flagged: …
Stage 2.52 (BUILD 125) — checkpoint 2, the three-act run (F31/F32): …
Stage 2.53 (BUILD 126) — pool exhaustion stopgap (D-54): dieActionChooseLoad() now converts to Strengthen the instant fewer than three unloaded, non-anchor mods remain in the pool, before dieActionMods/dieActionStep are ever touched — …
Stage 2.54 (BUILD 127) — the bot plays all three acts (checkpoint 2 closes): tests/autoplay.js's playRun() now loops every act via a new playOneAct() helper instead of stopping at one boss; tests/autoplay_results.csv gained an actReached column (existing rows blanked, never guessed). …
Stage 2.55 (BUILD 128) — checkpoint 3 map: each lane grows from five slots to eight (F16), so every act now has 7 fights (opening + 5 lane fights/elite + boss), 21 a run. …

Stage 2.56 (BUILD 129) — checkpoint 3 tiers: every offerable mod and card now carries a tier field ('common'/'uncommon'/'rare', gameState.config.mods/cardPool) — mods: common Smite/Sanctuary/Penance/Blight/Offering/Anthem, uncommon Vigil/Ordain/Zeal/Elevation, rare Virulence/Fervour; cards: …

Stage 2.58 (BUILD 131) — checkpoint 3, sixteen new cards needing no new engine code: card count 15 -> 31 (F25 updated in config.js's header comment and tests/facts.test.js's own assertion — CLAUDE.md itself carries no separate copy of the FACTS text, only config.js's header and the Notion "Die — …

Stage 2.57 (BUILD 130) — checkpoint 3 tags, plus six new mods needing no other new engine code: every mod and card now carries a `tags` field (a list of words, several allowed per piece) — Poison: Blight/Virulence/Censer/Purge/Reckoning; Mass: …

Stage 2.59 (BUILD 132) — checkpoint 3, trigger a face outside a roll (prompt D): one shared function, triggerFaceOutsideRoll() (pipeline.js) — …
Stage 2.60 (BUILD 133) — checkpoint 3, the Bound engine: a die-wide Bound scan (runBoundScan(), pipeline.js), a fight-scoped Bound setter (grantBoundToFace()), a fast sweep (playSweep() — …
Stage 2.61 (BUILD 134) — checkpoint 3, the remaining Bound pieces, closing checkpoint 3: Kyrie (card, common, cost 1, tags Bound — 5 damage, 10 if the rolled face has Bound, via isBoundFace()); Novena (card, rare, cost 2, tags Bound — …
Stage 2.62 (BUILD 135) — win the fight the moment the enemy dies. A card kill already ended the fight without End Turn (BUILD 053/068's own top-of-runPhase() win/loss guard, re-entered on demand) — the gap was BUILD 133's playSweep(): …
Stage 2.63 (BUILD 136) — on-screen text for every checkpoint 3 piece, plus New Run working while a fight-won panel is open. Twenty-one new cards (Tenet through Canticle) had never been added to CARD_EFFECT_TEXT (rendering.js) — …
Stage 2.64 (BUILD 137) — playtest readiness: weaker enemy poison, a Bound badge, readable two-mod names, a quieter log. Enemy poison buff (ENEMY_BUFF_POISON_STACKS, config.js) lowered from 5 to 3 — …
Stage 2.65 (BUILD 138) — die feedback: every face that triggers is now SEEN to trigger, and faces 1/20 count their own rolls. A face that fires without being the rolled face (a Nat 20 sweep, a Bound scan, or an outside-roll trigger — …
Stage 2.66 (BUILD 139) — enemy readability: the fight panel title reads ENEMY/ELITE ★/BOSS ☠ (#enemyPanelTitle, set from gameState.enemy.id), and every loaded enemy die face now shows real hover text — …
Stage 2.67 (BUILD 140) — card fixes and plainer text: Tenet and Gradual lose their caps for slower, uncapped growth, and a batch of confusing card/mod descriptions were reworded plain. Tenet is now 6 damage + 1 per time the rolled face has triggered this run (was +3 per trigger, capped at 24) — …
Documentation cleanup, 21 Sep 2026, no build number — CURRENT SUBSTAGE write-ups and long CONFIRMED WORKING lines moved word for word to HISTORY.md; CLAUDE.md cut from 335 KB to about 85 KB; size rule added to WHO EDITS THIS FILE; several items per build now allowed (D-72). No game file changed.

---

# CURRENT SUBSTAGE

Stage 2.67 (BUILD 140) — card fixes and plainer text: Tenet and Gradual lose their caps for slower growth, and confusing text is reworded.

Full write-ups for this and every earlier build: HISTORY.md.
