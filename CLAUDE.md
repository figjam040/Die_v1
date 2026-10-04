# CLAUDE.md — Die V1

This file is the source of truth for building. It lives at C:\Users\figja\Die_v1\CLAUDE.md.

Read this file at the start of every session before doing anything else.

---


# PROJECT

index.html plus fifteen plain JavaScript files under /js/, loaded by ordinary `<script src>` tags in this fixed order, each ending ?v=N with N = GAME_CONFIG.BUILD so a new build bypasses the browser cache: config.js, state.js, listener-registry.js, audio.js, pipeline.js, cards-mods.js, run-and-map.js, phase-machine.js, rendering.js, render-fight.js, render-map.js, render-layers.js, render-text.js, dev-tools.js, bootstrap.js. No ES modules — file:// origins are null and module scripts are CORS-blocked, a hard constraint. No build step, no npm in the game, no server: test by double-clicking index.html, never through a local server.

config.js is the one constants file, loaded first. Every tunable number and structural constant lives on GAME_CONFIG; every other file reads it from there instead of repeating a literal. Its header comment carries the FACTS block (F01-F52), one line per fact from the 2 Register's F-rows, beside the GAME_CONFIG fields implementing it — the one place F-numbers live in code.

All fifteen files share one global lexical scope, so a top-level name declared in two files silently overwrites the first; guardrails.test.js fails on any duplicate. The only eager trigger is `window.addEventListener('DOMContentLoaded', init)` in bootstrap.js — nothing calls a game function at parse time, so cross-file references are safe regardless of tag order. /art/ holds the PNGs, /fonts/ the two self-hosted OFL fonts; there is no /audio/, every sound is synthesised.

TESTS: plain Node scripts on raw `playwright`, no test runner. npm test (tests/run-all.js) runs every tests/*.test.js alone, guardrails first, each with a 10 minute timeout. guardrails.test.js: size caps, comment share, duplicate names, script tags, stray files. facts.test.js: every F-number against GAME_CONFIG and the live game. mods.test.js: each reward-eligible mod's exact effect through the real MOD_TRIGGER dispatch. tests/buildNNN.test.js: one file per build, that build's own assertions. screenshots.js and pngdiff.js regenerate verify/ (seeded, stamp hidden, pixel-identical) and, with --compare[=HASH], diff against a commit's shots. autoplay.js and autoplay-lib.js: the headless autoplayer, a measurement tool never run unless explicitly asked (D-70). Every limit lives in tests/shared-constants.js; no other test file sets one as a literal. tests/ holds test files and their helpers only; one-off scripts go in backups/. index.html loads nothing under tests/.

COMMENT RULE: a comment says what the code does now, or why it must be this way (a law, a trap, an order it depends on). At most 8 lines in a row; a file's opening header may run to 12. No build numbers, stage numbers, dates, test results, or the story of what the code used to do; git and HISTORY.md hold that. Rule/decision IDs (LAW-A2, D-66, KI-8) allowed when the ID is the reason. js/config.js's FACTS block is exempt.

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

Four die actions only: Load (place a mod on a blank face), Strengthen (add 1 weight to a face), Purify (remove every mod from a chosen loaded face) and Remove (delete one blank face from the die for the run, D-119) — see MULTI-MOD FACES. Expand is deferred; Enchant is a dead word for Strengthen.

Design floor: every mod must clearly outperform a guaranteed 2 block, measured on the turn it triggers, not scaled by trigger frequency. Frequency cancels out of this comparison: a mod and a blank on the same face are gated by identical roll chance, so their per-trigger value compares directly. Do not multiply mod value by trigger rate — that arithmetic is wrong. Current band: 10 to 16 points of value on the triggering turn — the standard every future mod is checked against.

Enemy HP carries progression across a run, not mod numbers. As enemies get tougher, their HP pool scales; mod values stay in readable single or low double digits, multipliers stay modest. Do not inflate a mod's raw numbers to keep pace with a harder run — that's enemy HP's job. This keeps every mod's value legible regardless of the run's stage.

A run has three fight types, each with its own HP/intent band and its own die (GAME_CONFIG.ENEMIES): normal fights, one elite per act, and the act boss. Permadeath.

The player always has more cards than soul: leaving cards unplayed, and choosing which, is the core decision of the card layer.

Not in V1: rings, markings, resonance, meta-progression, multiple enemies per fight, story and flavour.

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
TEXT RULE (D-125): every mod, card and artifact text is one or two short imperative sentences — a number before its noun, conditions as "If …," or "When …," at the front, no parentheses, never "applied"/"applies" or "this run"; tags ride the tag line, not the text. Texts live in render-text.js and config.artifacts.

---

# STATE SCHEMA

gameState (state.js, the field-by-field reference) holds ten objects, each with its own scope:

  player    — hp/maxHp (carry between fights), block, soul/maxSoul, deck/hand/discard, ownedCards, classId, poisonStacks, Penitence fields, natOneFiredThisFight, drainNextRound, sealNextRound
  enemy     — id ('Fight'|'Elite'|'Boss', the panel title) and name (the identity), hp/maxHp, intent and pattern fields, charge fields, wrath fields, hasDie/die, poisonStacks, activeBuffs, natOneFiredThisFight, buffPoisonStacks (fixed at buildAct())
  die       — faces: the player's own die, persists across fights (DIE FACE OBJECT STRUCTURE)
  turn      — phase, round, cardsPlayedThisTurn, the roll fields and their enemy mirrors, round flags and counters; round-scoped fields clear at START_OF_TURN
  fight     — fight-scoped counters (blanksRolled), zeroed by clearFightScopedState()
  run       — status (this fight: 'active'|'win'|'loss'), outcome (the whole run), screen, lane/currentSlot, act/actNumber, gold, artifacts, shop, removal price, run counters, transcript
  runRecord — the player's write-once-per-event run log (RUN RECORD), reset only by startNewRun()
  registry  — listeners, managed only by registerListener()/clearListeners()
  config    — classes, cards, cardPool, mods, artifacts; set once in init(), never changed
  ui        — open/closed flags for the log, dev drawer and info layers

---

# STATE HELPERS — USE THESE, NOTHING ELSE

updatePlayer(changes)   — Object.assign into gameState.player
updateEnemy(changes)    — Object.assign into gameState.enemy
updateTurn(changes)     — Object.assign into gameState.turn
updateDie(changes)      — Object.assign into gameState.die
updateFight(changes)    — Object.assign into gameState.fight
updateRun(changes)      — Object.assign into gameState.run
updateRunRecord(changes) — Object.assign into gameState.runRecord
updateUi(changes)       — Object.assign into gameState.ui

config and registry are never updated through helpers.
config is set once at init and never changed.
registry is managed only through registerListener() and clearListeners().

---

# PHASE ORDER — NEVER CHANGE

START_OF_TURN → ROLL_PHASE → CARD_PHASE → END_PLAYER_TURN → ENEMY_ROLL_PHASE → ENEMY_ACT_PHASE → CHECK_WIN_LOSS → START_OF_TURN

ENEMY_ACT_PHASE returns immediately — before intent, block, or damage are touched — when the enemy's own Nat 1 cancelled the attack this turn or Hourglass skipped round 1. Either way the pattern advances as if the intent had resolved.

POISON TIMING (D-120, F09): poison ticks at the end of the poisoned side's own turn — the player's in END_PLAYER_TURN, after hand-to-discard and the poison answer, before the enemy rolls; the enemy's in CHECK_WIN_LOSS, after its intent resolved. A tick deals the stacks as damage through calculateDamage(), ignores block, then drops the stacks by 1. Each tick re-enters runPhase(), whose top guard turns a kill into a win, or a loss before the enemy acts.

WIN REWARD (KI-59): a kill never opens the reward layer on the spot; it waits until no die icon is rolling and no pop is live.

---

# LISTENER API

registerListener(hook, id, fn, clearOn)
  hook    — an event: BLANK_ROLL { outsideRoll }, MOD_TRIGGER { modId, faceNumber }, NAT_TWENTY, NAT_ONE, ON_CARD_PLAY, ON_DAMAGE_DEALT, ON_BLOCK_GENERATED, ON_HEAL, FIGHT_START, ENEMY_BUFF_TRIGGER, ENEMY_NAT_TWENTY, ENEMY_NAT_ONE; a pipeline hook (DAMAGE PIPELINE), read straight off the registry, not through callListeners(); or a PHASE ORDER name — runPhase(phase) calls callListeners(phase) once per visit, before that phase's own logic
  id      — unique string identifier for this listener
  fn      — pipeline hooks: fn() (fn(sourceType) for DAMAGE_MULTIPLIER) returns a number. other hooks: fn(data) returns nothing.
  clearOn — 'turn' | 'permanent'. No call site passes 'fight' — fight-scoped fields are reset explicitly (FIGHT RESET).
  Same hook + same id registered twice is a no-op, logged '[LISTENER] duplicate registration skipped' — so a mod's effect() can register a persistent listener on every trigger safely.

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

dealDamage(target, amount, sourceType, sourceId, fireListener = true) (pipeline.js) — every damage-dealing card/mod calls this: calculateDamage(), hp through the helper, ON_DAMAGE_DEALT unless fireListener is false (the enemy's own attack only). dealBlock(amount, sourceId) — the same for block through generateBlock(). healPlayer(amount) — a direct clamp at maxHp, not a third pipeline, fires ON_HEAL with the post-cap amount.

All turn-scoped pipeline listeners clear at START_OF_TURN automatically.

---

# ROUNDING

Always Math.ceil(). No exceptions, but one ruling: D-122's boss heal rounds down, as its own decision says.

---

# DECK STORAGE

deck, hand, discard contain card id strings only. Never card objects.
Card objects live in config.cards; getCard(id) returns config.cards[id]. Multiple copies = the same id repeated.
player.ownedCards is the permanent collection; deck/hand/discard are reshuffled from it on every fight reset, so a reward pick survives Restart Fight.

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

# DIE FACE OBJECT STRUCTURE

{ number: 1, modId: null, modId2: null, weight: 1 }

number: 1-N, N being that die's own DIE_SIZE entry, each independently variable (D-11). Nothing in js/ reads a bare 20 for a die size.
modId: null = blank; string = mod id (player die) or buff id (enemy die). weight: default 1.
modId2: a second mod, loaded only onto a face where modId is set; cap two, never three (MULTI-MOD FACES).
Every face must be explicitly defined. No implicit blanks.

Player die — face 1 is always 'NAT_ONE', face 20 always 'NAT_TWENTY': stub ids, never real mods, excluded from Nat 20's own loop. Enemy die — whether faces 1/N carry a Nat depends on the enemy (buildEnemyDieFromSpec()).

Weight shows as the D-130 line under the face and in the DIE table; the hidden .die-mod-wrap keeps the ×N text. Weight is only ever written by strengthenFace(faceNumber) (pipeline.js), player die only.

---

# MULTI-MOD FACES

A face can hold up to two mods — modId (first loaded), modId2 (second) — cap two, never three. Per-face state (Zeal's accumulated bonus, per-mod trigger counts — TRIGGER COUNTS below) stays on that face's own modData regardless of slot; no parallel array keyed by face number anywhere, and never one (the carry-forward rule).

Trigger order: both mods on a rolled face trigger in load order — modId first, modId2 second, each fully resolving before the next, as two sequential MOD_TRIGGER dispatches, on a roll and in Nat 20's sweep alike.

Load excludes the anchor and any mod already on the die, either slot, and writes modId on a blank face or modId2 on a loaded, non-Nat face with a free slot; a full face refuses. Below 3 eligible mods, Load is not offered (D-54).

PURIFY (F43) resets a loaded face (not 1/10/20) to a blank's shape, weight untouched; its mods become offerable again. REMOVE (D-119, F43) deletes one blank face (not 1/10/20) for the run while the die has more than DIE_MIN_FACES. A removed face leaves a gap in the numbering: every read finds a face by number (getPlayerFace()/playerFaceIndex()), never by index, and "the face above" is nextFaceNumberAbove(), the next number still on the die.

Faces 1/20 are single-mod Nat stubs, never loaded. The enemy die shares the face shape, but nothing writes an enemy face's modId2.

TRIGGER COUNTS: in each face's modData — triggerCount for modId, triggerCount2 for modId2; faces 1/20 count their rolls. Run-scoped: only startNewRun()'s fresh faces wipe them. A mod's effect merges into existing modData rather than replacing it, so a trigger never erases a count.

---

# OUTSIDE-ROLL TRIGGER

triggerFaceOutsideRoll(faceNumber) (pipeline.js) is the one shared function every "trigger a face without rolling it" card/mod/artifact uses; any future piece with the same shape uses this, never a second dispatch copy. It refuses (no state change, returns false) face 1, face 20 and a removed face. A loaded face triggers through the identical MOD_TRIGGER dispatch a rolled face uses, so per-face growth accrues exactly as on a roll; a blank face dispatches BLANK_ROLL with outsideRoll: true. It never writes the roll fields. Every face that fires without being the rolled face (outside-roll, Bound scan, Nat 20 sweep) is recorded in turn.hoppedFaces and lit like a rolled face.

D-131 — no cap. turn.roundTriggerCount counts every trigger this round; at TRIGGER_FREEZE_GUARD nothing more triggers that round, logged [GUARD] once. QUEUE: runTriggerQueue() wraps every root dispatch; a trigger raised inside one waits in triggerQueue and plays after, in order, each resolving fully — no recursion — until empty, the enemy dead or the guard reached.

---

# BOUND ENGINE

A face is Bound if a mod loaded on it (either slot) carries the 'bound' tag (permanent) or was granted Bound for the fight. isBoundFace(face) (pipeline.js) checks both: modId/modId2 against config.mods[...].tags, and modData.boundGranted. A Sealed face counts as blank for every rule, Bound included.

grantBoundToFace(faceNumber) (pipeline.js) is the one setter — grants Bound to a loaded face (never 1/20) for the rest of the fight, merged into that face's modData (ARCH-CF2); clearFightScopedState() strips boundGranted at fight end, leaving the rest of that modData untouched.

Bound scan: runBoundScan(rolledFace) (pipeline.js), only from a rolled mod face, never during a Nat 20. When the rolled face is itself Bound, every other loaded Bound face triggers via triggerFaceOutsideRoll(), ascending. A face triggered this way never starts a further scan (D-64).

Sweep timing: playSweep(faceNumbers, dispatchFn) (pipeline.js) paces WHEN each face in a sweep plays (GAME_CONFIG.SWEEP_PACING); state updates the instant each dispatch runs. Queued chain triggers play at once, not paced.

CHAINS (D-134): chainToNeighbour() (pipeline.js). On any Bound face's MOD_TRIGGER, rolled or not, Reliquary Chain triggers the loaded face above, never 20; Rosary the one below, never 1. Two adjacent Bound faces with both held loop until the enemy dies or the guard stops it, by design.

---

# WEIGHTED ROLL ALGORITHM

function rollDie(faces) {
  const pool = [];
  faces.forEach(face => {
    for (let i = 0; i < face.weight; i++) { pool.push(face); }
  });
  return pool[Math.floor(Math.random() * pool.length)];
}

face.weight is the only ticket source; Strengthen adds tickets. rollOdds() (pipeline.js) reads this exact bag for the face row's percent.

canStrengthenFace() (pipeline.js) is the one rule the picker, shop, artifacts and strengthenFace() read: any loaded face, face 20 only while Halo is held (D-132) and up to FACE_TWENTY_MAX_WEIGHT, face 1 never; a refusal logs and strengthenFace() returns false.

---

# CLASS OBJECT STRUCTURE

Classes live in config.classes. Only one class exists in V1. classId in player state is a lookup key for config.classes[classId].

{ id: 'ordained', name: 'The Ordained', anchorModId: 'consecrate', onNatTwenty, onNatOne, onBlankRoll, startingDeck: [] }

onBlankRoll(data): the blank payout through dealBlock(), unless Alms replaces it.

onNatTwenty (Nat 20): every loaded face on the player die triggers, ascending, faces 1/20 excluded. Not capped, not once per fight. Each face fires through the same MOD_TRIGGER dispatch a rolled face uses — no second trigger path. Loop-safe: no mod re-rolls the die.

onNatOne (Nat 1 — Penitence): once per fight, gated on natOneFiredThisFight; Penitence costs 1 soul at each of the next PENITENCE_TURNS START_OF_TURNs (D-137). Every later face 1 that fight dispatches BLANK_ROLL — an ordinary blank.

The anchor, Consecrate on face 10, is loaded on the starting die and so excluded from the reward pool.

Enemy classes don't exist — the enemy's Nat 20/Nat 1/buff-trigger behaviour registers unconditionally in init(), since it belongs to the enemy fought, not a player class.

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

# AUDIO MODULE

audio.js. One AudioContext plus a name-to-sound table, the same shape as the listener registry: game logic never calls a sound function directly, only playAudioEvent('event_name'); SOUND_TABLE decides the sound, swappable in one place with no call-site change. Synthesised only via playTone() — no audio files.

Browser autoplay policy: an AudioContext built before any user gesture stays suspended — silent, no error — until resumed inside a real gesture handler; unlockAudioOnce(), on the page's first pointerdown, is that resume.

THE FIGHT ROLL (D-113): while the player's die icon spins, playAudioEvent() holds every event announced (heldAudioEvents) and plays them at the stop, so landing and trigger sounds follow the rattle, as the pops do. Mute flags (audioMuted, rollSoundsMuted) are checked inside playTone()/playAudioEvent(), never at call sites.

---

# FIGHT RESET

Player: block→0, soul→maxSoul, deck/hand/discard reshuffled from ownedCards, poisonStacks→0, penitenceActive→false, penitenceTurnsRemaining→0, natOneFiredThisFight→false. hp carries over.
Enemy: hp→maxHp, poisonStacks→0, activeBuffs→[], natOneFiredThisFight→false. die is overwritten from the entering slot's own static config on next fight entry (beginFightFromSlot()), not reset here.
Die (player's): weights and mods unchanged. Persists between fights.
Turn: phase→'START_OF_TURN', cardsPlayedThisTurn→0, round→0, sealedFaces→[], secondChanceUsedThisFight→false, enemyRoundSkippedThisTurn→false.
Fight: blanksRolled→0. The run's counters are untouched.
Registry: no 'fight' sweep — every fight-scoped field is reset explicitly, field by field, in clearFightScopedState()/resetFight() (run-and-map.js).
Run: status→'active'. Run record: untouched by a fight reset.

---

# RUN RECORD

Player-facing, not a dev tool. One CSV line per run (human or bot), written to localStorage as the run happens — never reconstructed at the end, since file:// can't write files. gameState.runRecord is run-scoped: reset only by startNewRun(), untouched by a fight reset.

Write as it happens: each event (slot entry, Load offer and pick, skip, card reward offer and pick, shop buy, fight end) writes its own field the moment it happens. Per-mod trigger counts are never accumulated as the run goes — collectTriggerCountsByMod() reads the die's faces fresh at serialize time.

Flush points — flushRunRecord(outcome), guarded by runRecord.flushed/started so a run that never began writes nothing and can't flush twice: boss defeated → 'won'; player death → 'lost'; New Run mid-run or a closed tab → 'abandoned'.

Line format — buildRunRecordLine() (run-and-map.js) — one CSV row: source, node, arrivalHpAtBoss, outcome, fightRounds, totalRounds, dieActionEvents, triggerCounts, blanksRolled, build, cardRewardEvents. Lists within a column are "|"- or ";"-joined — never a raw comma, so it pastes clean with no quoting.

Storage and copy — localStorage 'dieRunRecordLines', a JSON array appended by flushRunRecord(), never overwritten. #copyRunRecordBtn copies every line, then TRANSCRIPT and the last run's transcript lines (gameState.run.transcript, mirrored to 'dieRunTranscript'), to the clipboard; the player pastes it into a CSV by hand. HP printed anywhere goes through shownHp(), never below 0 (KI-47); state keeps overkill.

---

# INIT FUNCTION

init() (cards-mods.js) runs once, on DOMContentLoaded, before anything else: it populates config (cards, cardPool by reference, classes, mods, artifacts), registers the permanent listeners (class passives, enemy buff/Nat listeners, the MOD_TRIGGER dispatcher, artifact hooks), resets dev chrome to closed, then calls startNewRun(), which lands on the map — not mid-combat.

Nothing in the game runs before init() completes. No phase machine, no listeners, no rolls before it.
init() must not dump full arrays into the log. Log a summary line per structure.

---

# RULES FOR EVERY BUILD

Standing rules: never run the bot. Edit tool only, one Edit per message. One command per message, each starting with cd /c/Users/figja/Die_v1 &&. No background tasks, polling or waiting. Progress percentage on every status line. Do only the numbered steps; if an item fails its test twice, undo that item only and continue. Stop on red: no commit, no push if the full npm test fails. Scratch notes outside the repo.

Every build, in order: 1 confirm HEAD and a clean tree, back up to Die_v1_backup_<previous build>. 2 find and report before changing anything. 3 the work, one item at a time. 4 the build's own test file, then guardrails, facts, mods. 5 tests/screenshots.js against the previous commit. 6 move the previous CURRENT SUBSTAGE to HISTORY.md by script, write the new one-line CURRENT SUBSTAGE and CONFIRMED WORKING line, set GAME_CONFIG.BUILD. 7 full npm test, exit 0 or stop. 8 commit by file name, push, paste back.

Paste-back, under 1,000 characters, this shape only: BUILD n | hash | tests per file | full npm test exit and file count | screenshots px per screen | findings from step 2, at most five lines | older tests changed | deviations or none | Fergus looks at: one line.

---

# WHO EDITS THIS FILE

Claude Code may update CONFIRMED WORKING and CURRENT SUBSTAGE, and whichever standing section describes a mechanic, number, file or structure the build actually changed (the ownership rule). Every other change to this file is written in the planning chat and pasted in by Fergus.

OWNERSHIP RULE. Any build that changes a mechanic, a number, a file, or a structure updates the standing section describing it in the same build, and says so in its paste-back. HISTORY.md records that the change happened; the standing section records what is now true.

A build that changes any GAME_CONFIG value updates the F-line comment beside it in config.js's header and the F-row on 2 Register in the same build. Every build sets GAME_CONFIG.BUILD and every script tag's ?v= to its own number.

CONFIRMED WORKING and CURRENT SUBSTAGE are one line each, naming the newest build; every earlier write-up lives in HISTORY.md. This file stays under CLAUDE_MD_MAX_BYTES (tests/shared-constants.js).

Notion is the source of truth for planning; neither mirrors the other. The Notion planning page is 1 State, 3d27b97ff65a81d396d5f6abf687468d.

---

# CONFIRMED WORKING

(BUILD 188) — repo simplification: tests below build180 deleted, CLAUDE.md under 30,000 bytes, new build rules and paste-back, FACTS block exempt from comment share. No game change. Every earlier build: HISTORY.md.

---


# CURRENT SUBSTAGE

Stage 3.15 (BUILD 188) — repo simplification, no game change: old build tests deleted, CLAUDE.md cut to rules and architecture, FACTS block exempt from comment share. Tests: build188.test.js.
