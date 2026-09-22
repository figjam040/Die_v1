# CLAUDE.md — Die V1

This file is the source of truth for building. It lives at C:\Users\figja\Die_v1\CLAUDE.md.

Read this file at the start of every session before doing anything else.

---


# PROJECT

Single HTML file (index.html) plus eleven plain JavaScript files under /js/, loaded via ordinary `<script src>` tags in a fixed order: config.js, state.js, listener-registry.js, audio.js, pipeline.js, cards-mods.js, run-and-map.js, phase-machine.js, rendering.js, dev-tools.js, bootstrap.js. No ES modules — file:// origins are null and module scripts are CORS-blocked, so this is a hard constraint, not a style choice. No build step. No npm. No server.

config.js is the one constants file, loaded first, before state.js. Every tunable number and structural constant lives on one object, GAME_CONFIG — every other file reads it from there instead of repeating a literal. Its header comment carries the FACTS block (F01-F39+) verbatim from the Notion "Die — V1" page, one line per fact beside the GAME_CONFIG field(s) that implement it — the one place the F-numbers live in code.

All eleven files share one global lexical scope, the same way one giant inline `<script>` block would. The only eager trigger anywhere in the codebase is `window.addEventListener('DOMContentLoaded', init)` in bootstrap.js — nothing calls a game function at parse time, so cross-file references are safe regardless of script tag order.

File: C:\Users\figja\Die_v1\index.html (loads the eleven js/ files above).
Open in browser to test. Double-click index.html only — never through a local server. /audio/ and /art/ exist as empty asset folders; nothing currently populates them — see AUDIO MODULE. /fonts/ holds the game's two self-hosted OFL font files (Press Start 2P, VT323), loaded by index.html's own @font-face rules.

tests/facts.test.js — a plain Node script (this project has no test runner installed, only the raw `playwright` library), run via `node tests/facts.test.js`. Asserts every F-number against GAME_CONFIG and against the running gameState/DOM after a fresh New Run, entering the opening fight or dev-jumping to the elite/boss where a fact needs live combat state. A mismatch between a documented fact and the live value is a failing test. Not loaded by index.html.

tests/mods.test.js — same shape, run via `node tests/mods.test.js`. For each of config.mods' reward-eligible entries, dev-loads it onto a face and forces that roll through the real forcePlayerRoll()/MOD_TRIGGER dispatch, then asserts the exact numeric effect on gameState. Not loaded by index.html.

tests/build141.test.js, tests/build142.test.js — same shape, one file per build that shipped new mechanics, asserting that build's own items. Not loaded by index.html.

tests/autoplay.js — a headless autoplayer, run via `node tests/autoplay.js`. Plays complete runs against real gameplay only (New Run, map node clicks, playCard(), nextPhase()'s own natural rolls, the real die-action/rite/card-reward panels) — never forcePlayerRoll()/forceEnemyRoll()/devJumpToSlot()/devLoadMod() — with a seeded Math.random so every roll and shuffle is reproducible. Fixed, documented-in-file policy (lane, card priority, die/card rewards, rite choice). Appends one CSV row per run to tests/autoplay_results.csv. A measurement tool, not a floor or ceiling for a human — never loaded by index.html. Never run the bot except when explicitly asked (D-70).

tests/screenshots.js, tests/pngdiff.js — regenerate and diff the visual baseline in verify/.

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

Design floor: every mod must clearly outperform a guaranteed 2 block, measured on the turn it triggers, not scaled by trigger frequency. Trigger frequency cancels out of this comparison: a mod and a blank loaded on the same face are gated by the identical roll chance, so comparing their per-trigger value directly is correct. Do not multiply mod value by trigger rate — that arithmetic is wrong. Current band: 10 to 16 points of value on the triggering turn — the standard every future mod is checked against.

Enemy HP is the axis that carries progression across a run, not mod numbers. As enemies get tougher across a run, their HP pool scales; mod values themselves should stay in readable single or low double digits, and multipliers on those values should stay modest. Do not design a mod's power budget by inflating its raw numbers to keep pace with a harder run — that's enemy HP's job. This keeps every mod's value legible at a glance regardless of what stage of a run it's being evaluated in.

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
    penitenceTurnsRemaining: 0,   // set to PENITENCE_TURNS (3) at Nat 1 onset, ticked down at START_OF_TURN
    natOneFiredThisFight: false,  // Nat 1 is once per fight; once true, face 1 rolls a plain blank for the rest of the fight
    drainNextRound: 0,            // Drain's queue; consumed by the next START_OF_TURN's soul reset
    sealNextRound: [],            // Seal's queue (face numbers); moves into turn.sealedFaces at the next START_OF_TURN
    ownedCards: []                // full permanent collection; deck/hand/discard reshuffle from this every fight reset
  },

  enemy: {
    id: 'Fight' | 'Elite' | 'Boss',
    name: 'Verger' | ... ,          // the enemy's own designed identity, distinct from id
    hp: 0, maxHp: 0,
    intent: 0, intentMin: 0, intentMax: 0,  // intentMin/intentMax describe the built enemy's Attack band; live round-to-round behaviour runs through pattern/currentEntry — see ENEMY DIE PER TYPE
    pattern: [],                   // 1-4 {kind:'attack'|'charge'|'afflict', ...} entries, copied from the entering slot; see ENEMY DIE PER TYPE
    patternIndex: 0,
    chargeStage: null,             // null | 'windup' | 'release'
    chargeBroken: false,
    windupStartHp: null,
    currentEntry: null,            // this round's fixed intent spec — getIncomingIntentDamage() (pipeline.js) reads this
    forcedNextIntent: null,        // dev-only, devSetNextIntent() — replaces the next round's entry exactly once
    wrath: 0, wrathPending: 0,     // see ENEMY DIE PER TYPE
    wrathPerTrigger: 2,            // this enemy's own Wrath amount, from GAME_CONFIG.ENEMIES[...].wrathPerTrigger
    pontifexDoubleAttackThisRound: false,
    hasDie: false,                 // true only for elite/boss — see ENEMY DIE PER TYPE
    die: { faces: [] },
    poisonStacks: 0,
    activeBuffs: [],
    natOneFiredThisFight: false,   // mirrors the player's field
    buffPoisonStacks: 5            // this fight's own enemy_buff_poison amount, fixed at buildAct() time — see ACTS
  },

  die: {
    faces: []                      // the player's own die, 20 faces, persists across fights. Each loaded face's own modData carries triggerCount (for modId) and, on a two-mod face, triggerCount2 (for modId2), run-scoped. See MULTI-MOD FACES.
  },

  turn: {
    phase: 'START_OF_TURN',
    cardsPlayedThisTurn: 0,
    round: 0,
    rollOutcome: null,             // 'blank' | 'mod' | 'nat_twenty' | 'nat_one'; cleared every START_OF_TURN
    rolledFaceWeight: null,
    rolledFaceNumber: null,        // drives the die-row highlight
    enemyRollOutcome: null,        // enemy-side mirror of rollOutcome, same values; set in resolveEnemyRoll()
    enemyRolledFaceNumber: null,   // enemy-side mirror of rolledFaceNumber; drives the enemy die-row highlight
    modTriggeredThisTurn: false,   // true whether the trigger came from a normal roll or Nat 20's loop
    enemyAttackCancelledThisTurn: false,  // set by the enemy's own Nat 1, read once by ENEMY_ACT_PHASE, cleared next START_OF_TURN
    outsideTriggeredFaces: [],     // faces already triggered outside a roll this round
    roundTriggerCount: 0,          // toward GAME_CONFIG.ROUND_TRIGGER_CAP
    roundTriggerCapLogged: false,  // the cap log line prints at most once per round
    roundSweepPlays: 0,            // fast-sweep timing counter, see BOUND ENGINE
    hoppedFaces: [],               // faces that fired without being the face actually rolled — see THE HOP
    sealedFaces: []                // this round's active Sealed faces; see LOADED-FACE RULE / SEAL
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
    actNumber: 1,                  // 1-based, GAME_CONFIG.ACTS total. Incremented only when a non-final act's boss is defeated — see ACTS
    threnodyFace: null,            // Threnody's own fixed face for this run, 2-19, rolled once at run creation
    gold: 0, relics: [], shop: null, removalPrice: 75, thirdEyeUsedThisAct: false  // GOLD, SHOP AND RELICS
  },

  // The run record. Distinct from run above (which is fight/run-progress
  // state read by the game itself) — this is a write-once-per-event log of
  // the run for the player's own reference, reset only by startNewRun()
  // (resetRunRecord()), never by a fight reset. See RUN RECORD.
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
    cardPool: {},                  // the reward pool — see CARDS
    relics: {}                     // see GOLD, SHOP AND RELICS
  }

}

PENITENCE_TURNS = GAME_CONFIG.PENITENCE_TURNS, assigned once in state.js and read by both Nat 1's onset and the START_OF_TURN tick, so they cannot drift apart.

---

# STATE HELPERS — USE THESE, NOTHING ELSE

updatePlayer(changes)   — Object.assign into gameState.player
updateEnemy(changes)    — Object.assign into gameState.enemy
updateTurn(changes)     — Object.assign into gameState.turn
updateDie(changes)      — Object.assign into gameState.die
updateRun(changes)      — Object.assign into gameState.run
updateRunRecord(changes) — Object.assign into gameState.runRecord — see RUN RECORD

config and registry are never updated through helpers.
config is set once at init and never changed.
registry is managed only through registerListener() and clearListeners().

---

# PHASE ORDER — NEVER CHANGE

START_OF_TURN → ROLL_PHASE → CARD_PHASE → END_PLAYER_TURN → ENEMY_ROLL_PHASE → ENEMY_ACT_PHASE → CHECK_WIN_LOSS → START_OF_TURN

ENEMY_ACT_PHASE returns immediately — before intent, block, or damage are touched — when gameState.turn.enemyAttackCancelledThisTurn is true, set by the enemy's own Nat 1 earlier the same turn.

---

# EVENT HOOKS — COMPLETE LIST

These are the names registerListener() is designed around. The phase names in PHASE ORDER (START_OF_TURN, ROLL_PHASE, CARD_PHASE, END_PLAYER_TURN, ENEMY_ROLL_PHASE, ENEMY_ACT_PHASE, CHECK_WIN_LOSS) are also, in practice, real dispatchable hooks: runPhase(phase) calls callListeners(phase) unconditionally near its top, once per phase visit, before that phase's own if-branch runs — so any registerListener() call using one of the seven PHASE_ORDER strings as its hook fires at that phase's boundary, ahead of the phase's own logic. END_PLAYER_TURN specifically is exercised today only by Vigil, and fires before that phase's own hand-to-discard logic, which is what lets it read hand size pre-discard.

Player-side hooks:
BLANK_ROLL — {} — a genuinely blank player roll, and also the player's own Nat 1 once it has already fired this fight
MOD_TRIGGER — { modId, faceNumber } — a real mod trigger, from either a normal single-face roll or Nat 20's loop
NAT_TWENTY — {} — player rolls face 20
NAT_ONE — {} — player rolls face 1
ON_CARD_PLAY — { card }
ON_DAMAGE_DEALT — { amount, source }
ON_BLOCK_GENERATED — { amount, source }
ON_HEAL — { amount }

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

dealDamage(target, amount, sourceType, sourceId, fireListener = true) — shared helper (pipeline.js). Runs calculateDamage(), applies it to the target's hp via updateEnemy()/updatePlayer(), plays the damage-landing sound when damage > 0, and fires ON_DAMAGE_DEALT unless fireListener is explicitly false (used only by the enemy's own attack, which must not gain that hook). Returns the final damage dealt. Every card/mod that deals damage calls this instead of repeating the three lines inline.

dealBlock(amount, sourceId) — same shape for block: generateBlock(), add to gameState.player.block, fire ON_BLOCK_GENERATED. Returns the final block generated.

healPlayer(amount) — newHp = Math.min(gameState.player.hp + amount, gameState.player.maxHp); updates hp; fires ON_HEAL with the actual, post-cap amount healed; returns that amount. No flat-addition or multiplier stage — a direct clamp, not a third pipeline. Currently used by the post-win rite's Heal option.

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

Forty-four cards defined in total: the three Ring 0 cards the run always starts with, plus the reward pool (config.cardPool, 41 entries) the reward screen and shop both draw offers from. Both live in config.cards; cardPool holds references, not copies.

Ring 0 — the starting deck (5 Strike, 4 Ward, 1 Rite, 10 cards):
Strike — 1 soul, attack — 5 damage.
Ward — 1 soul, block — 5 block.
Rite — 2 soul, attack, Ordained-only — 5 damage + 6 block.

Pool (config.cardPool) carries a tier ('common'/'uncommon'/'rare') and a tags list per card. See CARD_EFFECT_TEXT (rendering.js) for the live, plain-text description of every reward-pool card — that table, not this file, is the source a player reads from, and getCardEffectText() is the one place code should read a card's text from (Threnody's own entry is live-numbered, see THE HOP/rendering.js).

---

# DIE FACE OBJECT STRUCTURE

{ number: 1, modId: null, modId2: null, weight: 1 }

number: 1-N, where N is that die's own GAME_CONFIG.DIE_SIZE entry — PLAYER, ELITE, BOSS or NORMAL. Each is its own named value, not one shared literal: the player, an elite, a boss and a normal fight are each free to vary independently (D-11). Nothing in js/ reads a bare 20 for a die size.
modId: null = blank. string = mod id from config.mods (player die) or a buff id (enemy die). weight: default 1.
modId2: a face can hold up to two mods, cap two, never three. null = only one mod (or blank). string = a second mod id, loaded after modId, only ever onto a face where modId is already set. Blank faces, Nat faces, and the enemy die's faces never carry a modId2 — see MULTI-MOD FACES below.
All of a die's faces must always be explicitly defined. No implicit blanks.
Player die and enemy die share this face object shape, but the Nat-face rule differs by die:

Player die — face 1 is always modId 'NAT_ONE', face GAME_CONFIG.DIE_SIZE.PLAYER (20) is always modId 'NAT_TWENTY'. Cannot change. Both are stub ids, never real mods, and both are excluded from Nat 20's own loaded-face loop.

Enemy die — whether faces 1/N carry a Nat modId depends on which enemy the die belongs to; it is not fixed the way the player's is. See ENEMY DIE PER TYPE. buildEnemyDieFaces(poisonFaceNumbers, includeNats, dieSize) and buildEnemyDieFromSpec(spec) (both build every enemy die); includeNats/spec.nats is what switches faces 1/dieSize between an ordinary blank and a Nat face.

Weight display: any face at weight above 1 shows ×N in the die rows, live. The only place a face's weight is ever written is strengthenFace(faceNumber) (pipeline.js) — Strengthen and Ordain's/Elevation's own effect all call it. Player die only. A weight-2+ face also shows a bottom-anchored fill inside its own face-btn (`.face-weight-fill`, index.html), scaled per point of weight, capped at weight 5. Uses `background: currentColor` — no new colour.

Trigger-count display: any loaded face on the player's own die that has triggered at least once this fight shows a badge (`.die-trigger-count`), zero triggers renders nothing. Player die only (reference equality with gameState.die.faces). One counter per mod slot — a two-mod face shows both separated by a slash, rendered as '#N' or '#N1/N2'. Faces 1 and 20 also carry this badge, counting how many times each has been rolled this run.

---

# MULTI-MOD FACES

A face can hold up to two mods — modId (first loaded) and modId2 (second loaded) — cap two, never three. Per-face state (Zeal's accumulated bonus, per-mod trigger counts — see TRIGGER COUNTS below) stays on that face's own modData field regardless of which slot the mod is in; there is no parallel array keyed by face number anywhere in this system, and there must never be one (the carry-forward rule).

Trigger order: both mods on a face trigger when that face is rolled, in load order — modId first, modId2 second, each resolving fully before the next begins. resolvePlayerRoll() (pipeline.js) dispatches this with two sequential, synchronous callListeners('MOD_TRIGGER', ...) calls; onNatTwenty() (cards-mods.js) dispatches both mods on a two-mod face within that same face's own turn in the ascending sweep.

Load: dieActionChooseLoad() (rendering.js) excludes the anchor and any mod already on the die, in either slot. The face picker (load_pick_face) offers any blank face AND any already-loaded, non-Nat, not-yet-full face together, always — a second mod is a valid Load target at any point in a run, regardless of how many blanks remain. isEligible: `f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY' && !f.modId2`. dieActionPickLoadFace() writes modId on a blank face, modId2 on an already-loaded one, and refuses (no write) if both slots are already full.

Pool exhaustion (D-54): eligibleLoadModIds() (rendering.js) is checked before the Load button itself is rendered — the die action panel's 'choose' step shows only Strengthen and Skip once fewer than 3 eligible mods remain, so a short offer is never presented at all.

Faces 1 and 20 are untouched by this system: both are always single-mod Nat stubs, excluded from the Load face picker, and never gain a modId2. Face 20 can still be Strengthened.

The enemy die shares the same face shape (modId2 always present, always null) for structural symmetry, but nothing ever writes an enemy face's modId2 — no enemy action loads a second buff.

Display: a face holding two mods shows both mod names in the one die row, side by side — `.die-mod-pair` (index.html) wrapping two `.die-mod` spans, each with its own inline trigger-count badge. No new row. faceHoverText() (rendering.js) appends the second mod's MOD_DESCRIPTION entry to the hover tip. Each name is truncated to its first TWO_MOD_NAME_CHARS letters (rendering.js, 6 by default), no ellipsis; the full name is available via a native `title` tooltip. Drop TWO_MOD_NAME_CHARS to 5 if a future name stops fitting.

Dev tooling: devLoadMod() (dev-tools.js) mirrors the real Load flow's cap. devClearFace() clears both slots.

TRIGGER COUNTS: lives in each face's own modData — modData.triggerCount for modId, modData.triggerCount2 for modId2. mod_dispatch matches data.modId against the triggering face's modId/modId2 to decide which counter to bump, so a two-mod face increments only the one that fired. Run-scoped, not fight-scoped: survives a fight reset intact; only startNewRun()'s brand-new faces wipe it. Zeal's own effect merges into the face's existing modData rather than replacing it wholesale, so a trigger never erases the count.

---

# OUTSIDE-ROLL TRIGGER

triggerFaceOutsideRoll(faceNumber) (pipeline.js) is the one shared function every "trigger a face without rolling it" card/mod goes through — Threnody, Reverberation, Magnificat, Novena today; any future piece with the same shape uses this, never a second copy of the dispatch logic.

Refuses outright (no state change, returns false) for face 1 or face GAME_CONFIG.DIE_SIZE.PLAYER (20) — both are Nat stubs, never a real mod or a blank.

Refuses a face already triggered this way once this round — gameState.turn.outsideTriggeredFaces (state.js), cleared to [] at START_OF_TURN. A face rolled normally and then re-triggered outside a roll (Reverberation) is not blocked — the record only tracks outside triggers, not the roll itself.

D-51 — per-round trigger cap. GAME_CONFIG.ROUND_TRIGGER_CAP (config.js) is 10. gameState.turn.roundTriggerCount counts every real MOD_TRIGGER dispatch this round — mod_dispatch increments it on every call except a Nat 20 sweep's own calls (tagged natTwentySweep: true), the one exemption. A blank face bumps the same counter directly in triggerFaceOutsideRoll(). Refuses once the counter reaches the cap; cleared to 0 at START_OF_TURN. The "round trigger cap reached" log line prints at most once per round (roundTriggerCapLogged).

Dispatch: a loaded face triggers through the identical MOD_TRIGGER dispatch a rolled face uses — modId first, then modId2 — so permanent per-face growth accrues exactly as it would on a roll. A blank face dispatches BLANK_ROLL for the same GAME_CONFIG.BLANK_ROLL_BLOCK (2) block. Never writes rolledFaceNumber/rollOutcome/rolledFaceWeight.

---

# THE HOP

Die feedback: every face that fires WITHOUT being the face actually rolled this round — a Nat 20 sweep, a Bound scan, or an outside-roll trigger — moves its die row to the exact same look a rolled face gets (`.die-row-rolled`/`.die-row-rolled-flash`, index.html — the same classes the rolled-face highlight uses, no new colour). Player die only.

gameState.turn.hoppedFaces (state.js) is the record — face numbers in firing order, never added twice per round. Marked at the instant a face's dispatch fires (pipeline.js's markFaceHopped()), from triggerFaceOutsideRoll() (covers outside-roll triggers and the Bound scan) and from onNatTwenty()'s own playSweep() callback (the one path that dispatches directly). Paced by playSweep() — the hop lands at the same moment the underlying trigger does.

Display: renderDieList() applies the rolled-face look to any row whose face.number is in hoppedFaces, player-die containers only, skipped for the row that is already the tracked rolled face. Same flash-once-then-sustained split as the rolled face's own highlight, tracked per container (lastSeenHoppedFacesByContainer). Clears at START_OF_TURN alongside every other round-scoped roll flag.

Faces 1 and 20's own run-scoped roll counts (separate from the hop record): each counts how many times it has been rolled this run, in modData.triggerCount — bumped by bumpNatFaceTriggerCount() (pipeline.js), called from resolvePlayerRoll()'s NAT_TWENTY/NAT_ONE branches on every roll. Reset for free on a new run.

---

# BOUND ENGINE

A face is Bound if a mod loaded on it (either slot) has Bound printed — carries the 'bound' tag, permanent — or the face was granted Bound for the fight. isBoundFace(face) (pipeline.js) checks both: face.modId/modId2 against gameState.config.mods[...].tags, and face.modData.boundGranted. A Sealed face counts as blank for every rule, including Bound.

grantBoundToFace(faceNumber) (pipeline.js) is the one setter — grants Bound to a loaded face for the rest of the current fight, merged into that face's own modData (ARCH-CF2, same merge pattern Zeal/Cope use). Refuses for face 1/20 and a genuinely blank face. The grant is fight-scoped (unlike trigger counts or Zeal's/Cope's accumulators): clearFightScopedState() strips boundGranted at fight end, leaving the rest of that face's modData untouched.

Display: every Bound face — printed or granted — shows a small "Bound" badge on its die row (`.die-bound-badge`, same box/font as `.die-weight`, D-28's no-new-palette rule), shown on every container, not gated by showTriggerBadges.

Bound scan: runBoundScan(rolledFace) (pipeline.js), called only from resolvePlayerRoll()'s mod-trigger branch, never during a Nat 20. When the rolled face is itself Bound, every OTHER loaded Bound face triggers through triggerFaceOutsideRoll(), ascending face order. A face triggered this way never starts a further scan. Counts toward GAME_CONFIG.ROUND_TRIGGER_CAP (D-51), no exemption.

Fast sweep timing: playSweep(faceNumbers, dispatchFn) (pipeline.js) paces WHEN each face in a multi-face sweep plays — state itself still updates the instant each dispatch runs. gameState.turn.roundSweepPlays counts every sweep-played trigger this round, cleared at START_OF_TURN. The first three plays land GAME_CONFIG.SWEEP_TRIGGER_DELAY_MS (200ms) apart; every play after the third lands at a quarter of that delay (50ms).

Bound mods/cards: Unison (6 damage), Accord (10 block), Kinship (4 poison) are plain Bound. Kyrie — 5 damage, 10 if the rolled face has Bound. Novena — every loaded Bound face triggers. Canticle — 6 block; if the rolled face is loaded, it gains Bound for this fight (never face 1/20). Concord — Bound, +1 soul, 3 block. Herald — Bound, 6 damage; one other random loaded face without Bound gains Bound for this fight (pickRandom(), state.js).

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

Twenty-seven mods, all in config.mods. Consecrate is excluded from the reward pool because it is already loaded on the Ordained's starting die (see CLASS OBJECT STRUCTURE); the other twenty-six are reward-eligible, each carrying a tier ('common'/'uncommon'/'rare') and a tags list. See MOD_DESCRIPTION (rendering.js) for the live, plain-text description of every mod — that table is the source a player reads from.

Consecrate (anchor) — +2 soul this turn; each card played this turn also generates 3 block, turn-scoped.
Fervour — registers a turn-scoped DAMAGE_MULTIPLIER listener that doubles damage tagged 'attack' only (poison ticks are untouched). The first and only mod that uses the multiplier stage of the pipeline.
Vigil — grants 5 block per card still held in hand at end of turn, via a turn-scoped listener on hook 'END_PLAYER_TURN'.
Zeal — 10 damage plus an accumulated bonus that permanently increases by 4 every time Zeal triggers again from the same specific face; stored per-face on that face's own modData (via updateDie()), not as a global counter, so Zeal loaded on two faces accrues independently on each.
Ordain — 10 damage, then permanently adds 1 weight to the specific face it triggered from.
Elevation — 10 damage; the face directly above the triggering face (faceNumber + 1) permanently gains +1 weight, but only if that face is loaded and is not face GAME_CONFIG.DIE_SIZE.PLAYER (20). If the face above is blank or is face 20, only the 10 damage happens — no weight write, no error. Like Ordain, the weight write goes through the shared strengthenFace() (pipeline.js) — the only place any face's weight is ever written.
Anthem — 6 damage, plus 4 per point of weight on its own face (weight 1 -> 10, weight 2 -> 14, weight 3 -> 18). Reuses dealDamage() tagged 'attack' and gameState.turn.rolledFaceWeight (Covenant's own read). Reads weight only; writes nothing.

The other reward-eligible mods (Smite, Penance, Offering, Blight, Virulence, Sanctuary, Largesse, Tithe, Congregation, Cope, Anathema, Thurible, Magnificat, Unison, Accord, Kinship, Concord, Herald, Dread, Genuflect) each have a plain, direct effect described in MOD_DESCRIPTION — see that table rather than duplicating the numbers here.

---

# ENEMY DIE PER TYPE

Every fight-type slot's enemy is a named, designed entry in GAME_CONFIG.ENEMIES, keyed by id (buildAct(), run-and-map.js assembles each act's opening/lanes/elite/boss from these). Fifteen enemies total: act 1 — Verger (opening, and again at the lower lane's position 3), Thurifer, Asperser, Lector (elite), Hierophant (boss); act 2 — Chorister, Cantor, Flagellant, Archdeacon (elite), Cardinal (boss); act 3 — Anchorite, Mendicant, Inquisitor, Exarch (elite), Pontifex (boss). Each carries `name`, a literal `pattern` (ACT_INTENT_MULTIPLIER scales only the enemy-buff poison amount, never a pattern's own numbers), and, except the three plain act-1 lane normals (hasDie:false), a `dieSpec` built by buildEnemyDieFromSpec() (pipeline.js). GAME_CONFIG.DIE_SIZE.NORMAL (6) and ELITE (12) are real sizes; bosses stay 20-sided with both Nats. HP: Math.ceil(base × that act's ACT_HP_MULTIPLIER) — act 1's five lane positions read GAME_CONFIG.ACT1_LANE_FIGHT_HP ([58,65,72,78,85]) directly. gameState.enemy.name (beginFightFromSlot()) is the enemy's own identity, distinct from `id` (the slot label 'Fight'/'Elite'/'Boss', which the panel title keys off).

Enemy buff/Nat mechanics — registered unconditionally in init() (cards-mods.js): enemy_buff_poison/wrath/drain/seal via enemy_buff_dispatch; ENEMY_NAT_TWENTY sweeps every loaded buff ascending; ENEMY_NAT_ONE cancels the attack + self-poisons 5, once per fight — the DEFAULT every enemy uses unless named below. gameState.enemy.wrathPerTrigger is each enemy's own Wrath amount, falling back to GAME_CONFIG.ENEMY_WRATH_AMOUNT.

Cardinal and Pontifex each replace the default Nat behaviour entirely (branch on gameState.enemy.name): Cardinal's Nat 20 Seals its two heaviest loaded faces, no buff sweep; its Nat 1 triggers the player's own heaviest loaded face outside the roll and does not cancel its attack. Pontifex's Nat 20 doubles that round's Attack damage (pontifexDoubleAttackThisRound); its Nat 1 zeroes both wrath fields, once per fight, and does not cancel its attack.

Per-enemy "reads" — applyEnemyReads() (pipeline.js), once per round, reading the PLAYER's own roll: Lector triggers Drain whenever the player rolls face 6; Hierophant's own Nat 1 also fires whenever the player rolls a Nat 1; Pontifex triggers Wrath whenever the player rolls their own heaviest loaded face.

Enemy intent (F34): every enemy acts from `pattern`, a repeating list of Attack/Charge/Afflict entries, fixed and shown during START_OF_TURN (advanceEnemyIntentForRound(), called after both poison ticks so a Charge's break check counts the release round's own tick — KI-28) and advanced by ENEMY_ACT_PHASE once a round resolves (a Charge only after its release). getIncomingIntentDamage() is the shared "how much is this round's intent about to deal" reader (Interdict). The enemy's own Nat 1 cancels whatever is live this round, including a wind-up's whole charge.

FIGHT PANEL TITLE: #enemyPanelTitle reads ENEMY/ELITE ★/BOSS ☠ off gameState.enemy.id. #enemyNameValue shows gameState.enemy.name. Pontifex gets its own panel line (#enemyReadLine): "Reads the heaviest face: Wrath +N when the player rolls it."

ENEMY FACE HOVER TEXT: faceHoverText(face, buffPoisonStacks, enemyName, wrathAmount) — threaded through by renderDieList(). Cardinal, Pontifex and Hierophant each get fully custom ENEMY_NAT_ONE/ENEMY_NAT_TWENTY hover text; Lector's own Drain face (6) appends "Also triggers when the player rolls a 6."

ENEMY NAT SOUND AND VISUAL: enemy_nat_20/enemy_nat_1 (audio.js) — the player's own synthesis an octave lower, each ≤200ms. Visual: the enemy die's rolled row pulses three times over 600ms in --nat, and #enemyIntentValue reads "NAT 20" or "CANCELLED — NAT 1" (plain "NAT 1" for Cardinal/Pontifex).

ENEMY DICE OF ANY SIZE, WRATH, DRAIN, SEAL (F35): buildEnemyDieFromSpec(spec) (pipeline.js) is the real construction path for every act 2/3 enemy and the two non-Hierophant bosses; buildEnemyDieFaces() (run-and-map.js) is kept only for Hierophant's own die.

LOADED-FACE RULE / SEAL: isFaceSealed(faceNumber) (pipeline.js) is the one shared check. gameState.turn.sealedFaces is REPLACED by a copy of gameState.player.sealNextRound every START_OF_TURN (even when empty), and cleared at every fight-start reset, so a Seal never survives past its own round or into a new fight. Faces 1 and 20 are never Sealed.

POISON ANSWER (F33): at START_OF_TURN, before poison ticks and before block clears, a permanent listener (poison_answer_passive) removes floor(gameState.player.block / GAME_CONFIG.POISON_ANSWER_BLOCK_PER_STACK) stacks of the player's own poison, capped at their current stacks — block is read, not spent. Enemies have no block field and are unaffected.

---

# ACTS

The run is GAME_CONFIG.ACTS (3) acts, played in sequence. Each act is a fresh map of the same two-lane shape (F16) — same slot types, its own boss — built by buildAct(actNumber) (run-and-map.js), which takes the 1-based act number and bakes that act's own scaled numbers into every enemy at build time (never read live off GAME_CONFIG mid-fight).

Scaling — GAME_CONFIG.ACT_HP_MULTIPLIER and ACT_INTENT_MULTIPLIER, indexed by actNumber-1, [1.0, 1.4, 1.9] and [1.0, 1.2, 1.45]: every enemy's hp/intentMin/intentMax is Math.ceil(base × that act's multiplier); the enemy buff's poison amount rides the intent multiplier the same way (3/4/5 stacks across acts 1/2/3); the enemy Nat 1 self-poison stays flat and unscaled at 5. Act 1's multipliers are both 1.0. Die face layouts do not change per act.

Transition — a boss win's outcome depends on which act it ends (runPhase()'s win branch): acts 1/2 get the same reward flow any fight win gets (gold, a relic reward, a die reward, a card reward), then advanceRun() increments actNumber, resets thirdEyeUsedThisAct and rebuilds run.act for the next act; player hp/die/ownedCards untouched, no heal between acts (D-27). Act 3 (final): true VICTORY (D-22) — no reward, no gold.

UI: the act number is shown on both the map screen and the fight screen (#actStamp), from gameState.run.actNumber.

---

# GOLD, SHOP AND RELICS

GOLD: a fight win grants gold within GAME_CONFIG.GOLD_REWARDS (Fight 12-20, Elite 30-40, Boss 60 flat); the final act's boss grants none (D-22). #goldValue reads gameState.run.gold.

SHOP (GAME_CONFIG.SHOP): opens after every rite, in #shopPanel. Stock (gameState.run.shop, built once per visit): 3 cards at the Elite tier split, one Strengthen (opens the real face picker, returns to the shop), one removal at gameState.run.removalPrice (starts REMOVAL_BASE_PRICE, +REMOVAL_PRICE_STEP/purchase, run-scoped). Unaffordable disabled; Leave is free.

RELICS: gameState.run.relics, max RELIC_MAX (5), defs in gameState.config.relics. #relicRewardPanel (pick 1 of 3, Skip allowed) opens after an Elite win and a non-final Boss win, before the die reward. Third Eye (thirdEyeChooseFace()) forces one chosen face per act. Loaded Die (rollWithRelics(), the roll path's one rollDie() site) rolls twice, higher stands. Tolling Bell (nextPhase()) triggers a second face after the first if chargeStage is 'windup'/'release'.

---

# AUDIO MODULE

audio.js. One AudioContext plus a name-to-sound table, the same shape as the listener registry: game logic never calls a sound function directly, only playAudioEvent('event_name'); SOUND_TABLE decides what that sounds like, so any sound can be swapped by editing that one table without touching a call site. Synthesised only via playTone(waveform, freqStart, freqEnd, durationMs, peakGain, attackMs) — no audio files; /audio/ stays empty.

Browser autoplay policy: an AudioContext built before any user gesture starts (and stays) suspended — every scheduled sound is silent, no error — until resumed from inside a real gesture handler. unlockAudioOnce() (audio.js), called once on the page's first pointerdown (bootstrap.js), is that resume.

SOUND_TABLE — 24 events: roll, roll_blank, card_attack, card_block, card_hybrid, mod_trigger, damage_enemy, damage_player, block_absorb, end_turn, nat_20, nat_1, fight_won, fight_lost, fight_start_normal, fight_start_elite, fight_start_boss, boss_defeated, die_action_load, die_action_strengthen, card_reward_basic, card_reward_rich, enemy_nat_20, enemy_nat_1. The last two are the player's own nat_20/nat_1 synthesis an octave lower, kept ≤200ms.

Two pitch chains climb as an action repeats within a turn, reset to 0 by resetSoundChains() at every START_OF_TURN, capped at CHAIN_STEP_CAP (8): CARD_CHAIN_EVENTS and MOD_CHAIN_EVENTS. playAudioEvent(eventName) threads the relevant chain's step into a chained event's sound function and advances the counter afterward.

Mute: devMuteAudioCheckbox (index.html, dev chrome) sets the module-level audioMuted flag (bootstrap.js); playTone() returns immediately when muted, before scheduling any oscillator. Default unmuted.

---

# FIGHT RESET

Player: block→0, soul→maxSoul, deck/hand/discard reshuffled from ownedCards, poisonStacks→0, penitenceActive→false, penitenceTurnsRemaining→0, natOneFiredThisFight→false. hp carries over.
Enemy: hp→maxHp, poisonStacks→0, activeBuffs→[], natOneFiredThisFight→false. die is overwritten from the entering slot's own static config on next fight entry (beginFightFromSlot()), not reset here.
Die (player's): weights and mods unchanged. Persists between fights.
Turn: phase→'START_OF_TURN', cardsPlayedThisTurn→0, round→0.
Registry: no clearListeners('fight') call exists anywhere — no listener has ever registered with clearOn: 'fight'. Every fight-scoped field above is reset explicitly, field by field, in clearFightScopedState()/resetFight() (run-and-map.js), not by a registry sweep.
Run: status→'active'.
Run record: entirely untouched by a fight reset — clearFightScopedState() never mentions gameState.runRecord. See RUN RECORD.

---

# RUN RECORD

Player-facing, not a dev tool. One line per run (human or bot), written to localStorage as the run happens — never reconstructed at the end — because a page opened via file:// cannot write files. gameState.runRecord (STATE SCHEMA) is run-scoped: reset only by startNewRun() (resetRunRecord()), untouched by a fight reset.

Write as it happens: enterSlot() (run-and-map.js) sets runRecord.started/node on every real slot entry, and arrivalHpAtBoss the one time the boss slot is entered. dieActionChooseLoad() (rendering.js) pushes a `{ type:'load', offered, picked:null }` entry the moment an offer is shown; dieActionPickLoadFace() patches `picked` once committed. dieActionChooseSkip() pushes a `{ type:'skip' }` entry instead. runPhase()'s win/loss branches (phase-machine.js) call recordFightRoundEnd() the instant a fight ends, then flushRunRecord('won'|'lost').

Per-mod trigger counts are never accumulated as the run goes — collectTriggerCountsByMod() (run-and-map.js) reads gameState.die.faces fresh every time the record is serialized, seeds every real mod at 0, and sums each face's own trigger count (both modId and modId2 contribute) into that mod's running total.

Flush points — flushRunRecord(outcome), guarded by runRecord.flushed/started so a run that never began writes nothing and a run cannot be flushed twice: boss defeated → 'won'; player death → 'lost'; New Run clicked mid-run → 'abandoned' (bootstrap.js, before startNewRun() resets the record); a closed tab → the same 'abandoned' call from a 'beforeunload' listener. An abandon mid-fight has flushRunRecord() call recordFightRoundEnd() once more first, so a partial round count is never lost.

Line format — buildRunRecordLine() (run-and-map.js) — one comma-separated CSV row: source, node, arrivalHpAtBoss, outcome, fightRounds, totalRounds, dieActionEvents, triggerCounts. Lists within a column are "|"-joined, key:value pairs "label:rounds"/"modId:count" — never a raw comma, so it pastes as clean CSV with no quoting needed.

Storage and the copy button — RUN_RECORD_STORAGE_KEY = 'dieRunRecordLines' (run-and-map.js), a JSON array of line strings in localStorage, appended to by flushRunRecord(), never overwritten. #copyRunRecordBtn calls collectAllRunRecordLines() and copies the whole thing to the clipboard, followed by every transcript line (see below). The player pastes that into one CSV file by hand — this game never writes to disk itself.

TRANSCRIPT — gameState.run.transcript, plain-text lines, last run only, reset by startNewRun() and mirrored whole to localStorage under RUN_TRANSCRIPT_STORAGE_KEY = 'dieRunTranscript' by the one shared appendTranscript() (run-and-map.js). Four line kinds: FIGHT (act, slot, enemy name/HP, player HP/max) on beginFightFromSlot(); R<round> (enemy HP/poison, the roll and its mods, cards played, the enemy's five-word-or-fewer action, player HP/block/poison) appended once per round from ENEMY_ACT_PHASE via appendRoundTranscript(); WON/LOST (round, player HP/max) from runPhase()'s win/loss branches; and LOAD/STRENGTHEN/SKIP/CARD/RITE reward lines from the die action, card reward and rite screens. #copyRunRecordBtn appends a blank line, TRANSCRIPT, and every line after the CSV, logging both line counts.

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

COMMENT RULE (BUILD 143): A comment says what the code does now, or why it must be this way (a law, a trap, an order it depends on). At most 8 lines in a row; a file's opening header may run to 12. No build numbers, stage numbers, dates, test results, or the story of what the code used to do; git and HISTORY.md hold the story. Rule and decision IDs (LAW-A2, ARCH-CF1, D-66, KI-8) are allowed when the ID is the reason. The FACTS block at the top of js/config.js is exempt and is never edited by this rule.

TESTS (BUILD 143): npm test runs every test file in tests/, one at a time, guardrails first. New assertions for a build go in tests/buildNNN.test.js. tests/ holds test files and their helpers only; screenshots and one-off scripts go in backups/.

---

# WHO EDITS THIS FILE

Claude Code may append a one-line confirmation to CONFIRMED WORKING and update CURRENT SUBSTAGE. Claude Code also updates whichever standing section describes a mechanic, number, file, or structure that build actually changed — see the ownership rule below. No other rewrite of a standing section happens without Fergus's own pasted text in the planning chat.

Every other change to this file — mechanics, rulings, schema, numbers, structure not touched by the build just shipped — is written in the planning chat and pasted in by Fergus.

OWNERSHIP RULE. Any build that changes a mechanic, a number, a file, or a structure updates the standing section describing it in the same build, and says so explicitly in its paste-back. The log (CONFIRMED WORKING / HISTORY.md) records that the change happened; the standing section records what is now true. A build that touches only CONFIRMED WORKING/CURRENT SUBSTAGE — no mechanic, number, file, or structure change — has nothing else to update.

A build that changes any GAME_CONFIG value updates the F-line comment beside it in config.js's header and the FACTS block on the Notion page in the same build, and runs tests/facts.test.js before pasting back.

Every build updates #buildStamp (index.html) to that build's own stage and build number, in the same build, whether or not the build touches any other part of index.html — this is the one standing exception to "don't touch files the build doesn't need to." It is how a player or a future session can tell what code is actually running.

Every build regenerates verify/ (`node tests/screenshots.js`) and reports the diff (`node tests/screenshots.js --compare`, changed-pixel count per screen against the previous run's set) in its paste-back — a visual defect this catches costs a diff to notice, not a build. Same standing-exception status as the build stamp line above: run it even in a build that doesn't touch index.html/rendering, so a regression from any build is caught by the next one's screenshot set, not discovered cold several builds later.

SIZE RULE: CURRENT SUBSTAGE holds the write-up of the newest build only. The first work step of every build moves the previous build's write-up to the end of HISTORY.md, word for word, by script, not by retyping. A CONFIRMED WORKING line is one line of at most 300 characters; the full text goes to HISTORY.md. This file stays under 80 KB.

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

# SCREEN LAYOUT

The fight screen is designed for 1600 by 900 and fits a 16:9 window with no scrollbar. The play column (.left-col) is centred, max-width 1600px, min-width min(1280px, 100%), padding 16px 24px 14px. Colour is identity and motion is state: a face's hue never changes, a flash or hold says what just happened, and the screen shows state, not conclusions (D-30). Every number, name, weight, trigger count and state is either visible or readable from a native title on hover — information never decreases.

ACTION BAR — div.top-bar, 58px, outside .app, three groups. Left: #buildStamp, and under it #goldValue (84 by 26px, reads GOLD then gameState.run.gold when that field exists, an em dash until it does — no gold mechanic exists in V1) beside #relicRow's five empty 26px slots. Centre, var(--game-font) 13px: #actStamp as ACT N, ROUND with #roundValue, #phaseBadge in --phase-color, #resultBanner. Right, 30px buttons: #devChromeToggleBtn, #copyRunRecordBtn, #logToggleBtn, #startGameBtn.

ART BAND — the middle band of #fightScreen, taking the remaining height (minimum 220px). #playerArtBox and #enemyArtBox are 340 by 220px boxes, each holding an img (#playerArtImg/#enemyArtImg, src art/ordained.png and art/ + gameState.enemy.name.toLowerCase() + .png) and a text label (#playerArtLabel/#enemyArtLabel) that swap on the img's own load/error event — no art files ship in this build, so the label is what actually shows. Directly left of #enemyArtBox: #enemyIntentIcon, a 40px inline SVG stroked --nat — a sword for Attack, a bolt for Charge, a slashed bolt for Release, a drop for Afflict, the bolt again for Broken — whose aria-label carries the kind word; #enemyIntentValue beside it shows only the number (BROKEN, or the enemy Nat's own wording, when there is no number). Both carry the same full sentence in a .hover-tip child (game-font box, opens downward, the same pattern every die row's hover uses) instead of a native title — neither element carries a title attribute. #enemyIntentLabel under both carries a Charge wind-up's "break N / M".

ENEMY BLOCK — the right 300px column of the stats band (228px tall, 300px / hand / 300px, bottom-aligned). #enemyPanelTitle (ENEMY / ELITE ★ / BOSS ☠), #enemyNameValue, HP with #enemyHpValue, #enemyWrathLine when Wrath is up, #enemyReadLine for Pontifex, then #enemyStatusRow — one 28px square per state present, P plus stacks of poison and W plus Wrath, both --enemy-mod, each carrying its own sentence as a title. #enemyBuffsValue lists every loaded face on that enemy's die with its face number (POISON 3, POISON 9, SEAL 6); #enemyActiveValue lists gameState.enemy.activeBuffs. #enemyPoisonValue is still written every render, hidden — the P icon is where stacks of poison read.

PLAYER BLOCK — the left 300px column of the same band. ORDAINED, HP with #playerHpValue, BL with #playerBlockValue, SOUL with #playerSoulValue, then #playerStatusRow on the same icon rule: P plus stacks of poison in --enemy-mod, PN for Penitence in --nat, D plus the amount for Drain in --player-mod, S for a Seal in --muted. Then #playerDebuffsValue, #playerDrainLine when it applies, and DECK #playerDeckValue DISCARD #playerDiscardValue.

HAND ROW — #handRow, centred in the stats band's middle column, cards 144 by 216px, 2px --player-mod border: cost badge top right, a 100px art placeholder, the name at 12px var(--game-font), the effect text at 20px var(--game-font-2). Unaffordable cards sit at opacity 0.4; every card carries its name and effect as a title. #endTurnBtn (128 by 44px) sits immediately right of the last card, vertically centred on the hand row (align-self: center). Every hand card's art placeholder and every card in the card reward panel holds an img child, src art/cards/<id>.png, pixelated and object-fit contain, hidden with an empty box on load failure — no art files ship in this build.

DIE COLUMN (now the face row) — #playerDieList, the bottom band's middle column, twenty squares in one horizontal row, face 1 at the left and face 20 at the right (D-10 as amended 22 Sep 2026). Each square is a .face-btn capped at 56px, square by aspect-ratio, shrinking together when the column is narrower, 8px gap, 2px border: blank faces --line with a --blank number, loaded faces --player-mod, faces 1 and 20 --nat. The rolled face fills --text with a black number and holds for the round — a blank roll holds the same way a loaded roll does, its own flash class on the roll itself then the plain sustained look for the rest of the round; a hopped face takes the same look; a sealed face keeps its own colour at opacity 0.5. Under each square, 17px var(--game-font-2) --blank: the weight as a bare number, NAT 1 / NAT 20 on those two faces, SEALED or SEALED NEXT ROUND on a sealed one. Each square's title reads "Blight · weight 1 · triggered 2 times this run · Bound" then the existing hover sentence. Rows are still built face 20 first and flipped by flex-direction: row-reverse, so nothing that indexes the row list changes; .die-mod-wrap (mod names, ×N weight, trigger-count badges, Bound badge) stays in the DOM, hidden, and is what those words are read from. The dev force-roll click and its hover state are unchanged. #enemyDieList stays in the DOM, display:none, still rendered every frame — its content reads off #enemyBuffsValue and the die icons instead.

DIE ICONS — #playerDieIcon in the bottom band's left column: a 104px inline SVG stroked --text, shaped by GAME_CONFIG.DIE_SIZE (20 a hexagon d20, 12 a pentagon, 6 a square, each with an inner shape and spokes), the rolled face number centred inside in --player-mod for a mod, --nat for a Nat, --blank for a blank, empty before the roll. The number itself sits on a small #000000 backing (`.die-icon-number-text`, 4px padding each side, 26px font) so the die shape's own inner lines stop short of the digits rather than crossing them. #enemyDieIcon mirrors it in the right column, stroked --enemy-mod, sized from that enemy's own die, its own number on the same black backing; beside it the buff that triggered in upper case, or NAT 20 / NAT 1 in --nat, and the die size as d20 / d12 / d6 in --muted. A normal with no die shows an empty 104px outline (D-29).

ROLL STAGE — #rollHero, one line above the face row: #rollResultNumber carries the signed value the roll produced, #rollResultLabel the mod name in upper case in --player-mod with the run trigger count as ↻N in --muted (+13 CONSECRATE ↻6). A two-mod face prints both names and both values. A blank roll reads +2 BLANK, a Nat 20 reads NAT 20 and a Nat 1 reads NAT 1 PENITENCE, both in --nat; before the roll, AWAITING ROLL in --muted. The value is taken from the number that mod's own log line already reports — nothing is recomputed.

POST-FIGHT OVERLAY — #dieActionPanel, #cardRewardPanel, #riteScreenPanel and #resultBanner keep their ids and behaviour. The die action panel renders the same horizontal twenty-square row at every step, the opening Load / Strengthen / Skip menu included, with the same hover text, so the player sees one die. A panel opening below takes the art band's slack first; once that is gone the play column scrolls.

MAP SCREEN — #mapScreen, ACT N MAP at 20px var(--game-font). Nodes are 70px squares, 2px outlined, labels at 11px var(--game-font); the four node states (completed, current, choice, inert) and three connector states (neutral, committed, abandoned) keep their classes and colours, and dev-jump nodes stay dotted and muted. The player, elite and boss die previews keep every number and buff name they show, rendered by the same renderDieList() in its vertical form.

LOG PANEL — #log in .right-col, shown only while gameState.ui.logOpen; #logToggleBtn in the action bar flips it, default closed on every page load, and it works on the map exactly as on the fight screen. Open, .right-col covers the whole play column (position fixed, inset 0, black background, 24px padding, above the fight) rather than sitting beside it — the fight keeps rendering underneath, unchanged when closed — with #log at 22px VT323, a #logViewToggleBtn (LOG: PLAY / LOG: ALL, gameState.ui.logView) and a #logCloseBtn doing what #logToggleBtn does. Play view hides `.log-state`/`.log-listener` lines (still written to the DOM); All view shows them.

DEV DRAWER — #devChrome, below the panels in the play column, opened by #devChromeToggleBtn from the action bar. Closed on every page load; closed also makes the two dev inputs outside it (die-face force rolls, map dev-jump nodes) inert.

---

# CONFIRMED WORKING

Full reports for every build below live in HISTORY.md, verbatim, in order. This section is an index only — read only when a specific build's full detail (exact numbers, exact code paths, exact Playwright verification) is needed.

001–067 engine, phase machine, three laws, eleven mods, fifteen cards, Nat 20 and Nat 1, Load and Strengthen, card reward, weight display. VERIFIED-PLAYWRIGHT. Lines per build in HISTORY.md.
068–082 run scaffold, two-lane map, rites, die rewards from elites, five-slot lanes, die-row picker, run-outcome guards. VERIFIED-PLAYWRIGHT.
083–098 dev drawer, Nat 1 and Penitence tuning, intent retunes, New Run guard, rite card removal, rolled-face highlight, file split, listener dedup, audio module and seventeen sounds, pitch chains, tone pass, boss and elite dice, enemy Nat 1 self-poison. VERIFIED-PLAYWRIGHT.
099–104 docs rewrite (099, documentation only), Vigil proven alive, enemy roll proven resolving, js/config.js GAME_CONFIG and tests/facts.test.js, trigger-count badge, one font. VERIFIED-PLAYWRIGHT except 099.
105–120 seeded autoplayer, DIE_SIZE per entity, trigger counts in modData, run record, facts split, Anthem, Elevation, two mods per face, badge/weight fill, hover text, Load All, trigger measurement, screenshot baseline. VERIFIED-PLAYWRIGHT except 106 (UNVERIFIED, Fervour doubling never seen live).
121–127 stacks name poison, on-screen build stamp from GAME_CONFIG.BUILD, LOAD_PRIORITY from the ranked pool, autoplay build column live, three acts with per-act scaling, pool exhaustion converts Load to Strengthen, bot plays three acts. VERIFIED-PLAYWRIGHT.
128–135 checkpoint 3: eight-slot lanes, tiers and offer split, synergy tags, outside-roll trigger, Bound, instant win on enemy death. VERIFIED-PLAYWRIGHT.
136–140 on-screen text for every checkpoint 3 piece, enemy poison 3/4/5, Bound badge, six-letter names on two-mod faces, hop on trigger, ENEMY/ELITE/BOSS title, enemy face hover text, Tenet and Gradual uncapped. VERIFIED-PLAYWRIGHT.
Stage 2.68 (BUILD 141) — three items: the poison answer (block-vs-poison, F33), enemy intent patterns (Attack/Charge/Afflict, F34), and enemy dice of any size with Wrath/Drain/Seal (F35). All three kept — 111/111 facts, 40/40 mods, 22/22 new tests/build141.test.js tests passed; KI-26 answered.
Stage 2.69 (BUILD 142) — seven items, all kept: the Seal-never-wears-off fix, act 1 HP by position, all fifteen designed enemies (F36/F37), the enemy Nat sound/visual (KI-22 answered), Hosanna and Threnody reworked (F38). 111/111 facts, 40/40 mods, 22/22 build141, 22/22 new build142 tests.
Stage 2.70 (BUILD 143) — anti-bloat: comment rule applied to js/ and index.html, CLAUDE.md trimmed, stray files removed, guardrail tests added. No behaviour change. 111/111 facts, 40/40 mods, 22/22 build141, 22/22 build142, 19/19 guardrails.
Stage 2.71 (BUILD 144) — skin pass: black palette, Press Start 2P/VT323 fonts, log toggle default closed, phase badge no underscores, stepped motion; no number/mechanic/layout change. 111/111 facts, 40/40 mods, 22/22 build141, 22/22 build142, 19/19 guardrails, 13/13 build144.
Stage 2.72 (BUILD 145) — layout pass: horizontal face row 1 to 20, die icons, intent icon, art/gold/relic placeholders, portrait cards, map restyle. No number or mechanic changed. 111 facts, 40 mods, 22 build141, 22 build142, 19 guardrails, 13 build144, 23 build145.
Stage 2.73 (BUILD 146) — CLAUDE.md trim, window scaling, End Turn/hand-card resize, intent icon hover sentence, character art loading. No number or mechanic changed. 111 facts, 40 mods, 22/22 build141/142, 19 guardrails, 13 build144, 23 build145, 11 build146.
Stage 2.74 (BUILD 147) — intent hover box, console filter narrowed to art/, blank rolled face holds like a loaded one, die icon number gets a black backing. No number or mechanic changed. 111 facts, 40 mods, 22/22 build141/142, 19 guardrails, 13/23/11/9 build144-147.
Stage 2.75 (BUILD 148) — KI-28 Charge break now counts the release round's poison tick, run transcript, log Play/All views, log full screen, zoom-block check (none found). 111 facts, 40 mods, 22/22 build141/142, 19 guardrails, 13/23/11/9/11 build144-148.
Stage 2.76 (BUILD 149) — the awe status, Dread, Genuflect, Kneel, Compline, Tremendum, Mysterium, card art loading. 111 facts, 42 mods, 22/22 build141/142, 19 guardrails, 13/23/11/9/11/15 build144-149.
Stage 2.77 (BUILD 150) — break numbers -4, Bulwark, gold, shop after every rite, three relics (Third Eye/Loaded Die/Tolling Bell), KI-29. 111 facts, 42 mods, 22/22 build141/142, 19 guardrails, 13/23/11/9/11/15 build144-149, 9/9 build150.

---


# CURRENT SUBSTAGE

Stage 2.77 (BUILD 150) — six items; new mechanics under GOLD, SHOP AND RELICS. (1) OQ-16: every Charge enemy's breakAt lowered 4 (config.js ENEMIES). (2) Bulwark: common card, 1 soul, 6 block, 16 if chargeStage 'windup'/'release' — pool 40 to 41. (3) Gold. (4) The shop, after every rite. (5) Three relics plus their reward panel. (6) KI-29: build142.test.js F-b forces threnodyFace 7 after each enterOpeningFight() — no game code changed.

Verification: guardrails 19/19, facts 111/111, mods 42/42, build141 22/22, build142 22/22, build144 13/13, build145 23/23, build146 11/11, build147 9/9, build148 11/11, build149 15/15, new tests/build150.test.js 9/9.

Full write-ups for earlier builds: HISTORY.md.
