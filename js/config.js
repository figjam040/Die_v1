// ============================================================
// CONFIG.JS — BUILD 102
// One constants file, loaded first, before state.js — this is now file 1
// of eleven (see PROJECT, CLAUDE.md). Every tunable number and structural
// constant enumerated in the BUILD 102 prompt lives here, on one object,
// GAME_CONFIG. This is the only file that defines these values; every
// other file reads them off GAME_CONFIG instead of repeating a literal.
// No gameplay change: every value below is copied verbatim from wherever
// it was previously hardcoded (see BUILD 102's paste-back for the full
// per-constant source list).
//
// FACTS — copied verbatim from the Notion "Die — V1" page's FACTS block,
// F01 to F28, one line per fact, kept beside the GAME_CONFIG field(s) that
// implement it below. This is the one place the F-numbers live in code.
// A build that changes any GAME_CONFIG value updates the F-line comment
// beside it and the FACTS block on the Notion page in the same build (see
// CLAUDE.md's WHO EDITS THIS FILE / ownership rule).
//
// F01 player HP 70 · F02 soul 3 · F03 draw 5 · F04 starting deck 5 Strike 4 Ward 1 Rite · F05 blank roll 2 block
// F06 Strike 1 soul 5 dmg · F07 Ward 1 soul 5 block · F08 Rite 2 soul 5 dmg 6 block
// F09 poison decays N, N−1 … 0, ticks at START_OF_TURN before block clears
// F10 Penitence 3 rounds, once per fight · F11 Nat 20 every loaded face triggers, ascending, repeatable
// F12 Strengthen targets face 20, never face 1 · F13 Load offer is 3 mods, excluding the anchor and loaded mods
// F14 die rewards as built: every fight win grants 1, an elite win 2, a rite 1 (or heal or removal); the boss grants none (D-22) · F15 rite heal 20
// F16 (checkpoint 3 map) lanes 2, slots per lane 8, three rites per lane (slots 2, 5, 8), the elite is slot 4 of the upper lane
// F17 HP: opening 50, normals 70/78/85, elite 100, boss 100
// F18 intent: opening 4–12, normals 6–18, elite 10–18, boss 10–20
// F19 enemy buff applies 3 stacks of poison (act 1), scaled per act to 4 (act 2) and 5 (act 3) · F20 elite buff faces 7 and 14, both poison, no Nat faces · F21 boss buff faces 5, 10, 15, all poison, plus Nat 20 and Nat 1
// F22 enemy Nat 20 every loaded buff triggers, ascending, repeatable · F23 enemy Nat 1 attack cancelled, self-applies a flat 5 stacks of poison, once per fight
// F24 mods 25 (checkpoint 3, the remaining Bound pieces, BUILD 134: 2 new — Concord, Herald; 24 offerable plus Consecrate, tiers 12 common/8 uncommon/4 rare), each asserted by tests/mods.test.js
// F25 cards 36 (checkpoint 3, the remaining Bound pieces, BUILD 134: 3 new — Kyrie, Novena, Canticle; tiers 18 common/12 uncommon/6 rare), each asserted by tests/facts.test.js
// F26 files under /js/: eleven — config, state, listener-registry, audio, pipeline, cards-mods, run-and-map, phase-machine, rendering, dev-tools, bootstrap
// F27 pitch chains cap 8, reset at START_OF_TURN
// F28 (corrected BUILD 102 — see paste-back) sound duration ceiling 200 ms holds for every frequent sound (roll, card plays, damage, block, end turn, mod trigger, die action, card reward, fight_start_normal/elite); nat_20 (230ms), nat_1 (260ms), fight_won (210ms), fight_lost (260ms), fight_start_boss (320ms) and boss_defeated (400ms) exceed it — all six are rare, at most once per fight-ending event, boss fight, or Nat roll, measured live via tests/facts.test.js, not just the two Nat sounds the fact previously named
// F31 (BUILD 125) three acts; per-act enemy HP multiplier 1.0/1.4/1.9 and intent multiplier 1.0/1.2/1.45, both applied at enemy creation (buildAct()) with Math.ceil; the enemy buff's poison-stack amount scales with the intent multiplier the same way (also Math.ceil, also fixed at enemy creation); the enemy Nat 1 self-poison stays a flat, unscaled amount
// F32 (BUILD 125) beating the act 1 or act 2 boss grants a card reward and one die reward, exactly like any other fight win; the act 3 boss is VICTORY with no reward (D-22)
// ============================================================

const GAME_CONFIG = {

  // BUILD 122 (KI-18): the single source of truth for the on-screen build
  // stamp (index.html's #buildStamp, rendered by rendering.js). A build
  // that lands bumps this one number; tests/facts.test.js's own BUILD-stamp
  // test then fails if it doesn't match the newest CONFIRMED WORKING entry
  // in CLAUDE.md, so a forgotten bump is caught by the test suite instead
  // of being noticed cold several builds later (the KI-18 failure mode).
  BUILD: 138,

  // F01 — player HP. Was state.js's gameState.player.hp/maxHp literal (70).
  PLAYER_MAX_HP: 70,

  // F02 — soul per turn. Was state.js's gameState.player.soul/maxSoul literal (3).
  PLAYER_MAX_SOUL: 3,

  // F03 — cards drawn at START_OF_TURN. Was phase-machine.js's drawCards(5) literal.
  DRAW_COUNT: 5,

  // F04 — starting deck, 5 Strike / 4 Ward / 1 Rite. Was cards-mods.js's
  // config.classes.ordained.startingDeck array literal.
  STARTING_DECK: ['strike', 'strike', 'strike', 'strike', 'strike', 'ward', 'ward', 'ward', 'ward', 'rite'],

  // F05 — blank-roll block. Was cards-mods.js's onBlankRoll dealBlock(2, ...) literal.
  BLANK_ROLL_BLOCK: 2,

  // F10 — Penitence duration in rounds. Was state.js's standalone PENITENCE_TURNS = 3.
  PENITENCE_TURNS: 3,

  // F15 — rite heal amount. Was rendering.js's riteChooseHeal() healPlayer(20) literal.
  RITE_HEAL: 20,

  // F14 — die rewards granted per source. SINGLE was rendering.js's
  // dieActionsRemaining default (1) — used for a rite's grant, a non-elite
  // fight win, and the dev skip shortcut, all of which grant exactly one.
  // ELITE was phase-machine.js's win-branch ternary (2 for an Elite win).
  // The boss grants none — no die action screen is ever opened on a boss
  // win (runPhase()'s win branch returns before reaching the die-action
  // code for currentSlot === 'boss'), so there is no BOSS field here — its
  // value is the absence.
  DIE_REWARDS: { ELITE: 2, SINGLE: 1 },

  // F16 — run structure. LANE_COUNT/SLOTS_PER_LANE describe buildAct()'s
  // shape (run-and-map.js: two eight-slot arrays, upper/lower — grown from
  // five slots at the checkpoint 3 map build, each lane's original five
  // slots kept as a prefix, three more appended: Fight, Fight, Rite) but
  // are not themselves loop bounds there (the act is still a data literal,
  // not generated from a count) — they exist so tests/facts.test.js can
  // assert the built act's real shape against the documented fact.
  // ELITE_SLOT_INDEX (0-based) is the slot buildAct() actually places the
  // Elite at (index 3 = the upper lane's 4th slot) — F16 now names this one
  // slot only, not a range, so ELITE_ALLOWED_SLOT_INDICES (still read by
  // tests/facts.test.js) is a single-element array.
  LANE_COUNT: 2,
  SLOTS_PER_LANE: 8,
  ELITE_SLOT_INDEX: 3,
  ELITE_ALLOWED_SLOT_INDICES: [3],
  // RITE_SLOT_INDICES (0-based) — the three rite slots every lane carries
  // (F16: "slots 2, 5 and 8", 1-based), same for both lanes.
  RITE_SLOT_INDICES: [1, 4, 7],

  // F17/F18 — HP and intent band per slot type. Was run-and-map.js's
  // buildAct() object-literal enemy blocks (hp/intentMin/intentMax on each
  // slot) and state.js's placeholder gameState.enemy defaults.
  // NORMAL_FIGHT_HP holds the three normal-fight HP values in the order
  // F17 states them (70/78/85); buildAct() indexes into it rather than
  // repeating the numbers — upper lane's two normals use indices 0 and 2,
  // lower lane's three use 0, 1, 2.
  NORMAL_FIGHT_HP: [70, 78, 85],
  HP: {
    OPENING: 50,
    ELITE: 100,
    BOSS: 100
  },
  INTENT: {
    OPENING: { MIN: 4, MAX: 12 },
    NORMAL: { MIN: 6, MAX: 18 },
    ELITE: { MIN: 10, MAX: 18 },
    BOSS: { MIN: 10, MAX: 20 }
  },

  // F19/F23 — enemy poison amounts. Two separate facts that no longer share
  // a value: F19 is what a triggered buff face applies TO THE PLAYER
  // (cards-mods.js's enemy_buff_dispatch), base 3, scaled per act by
  // ACT_INTENT_MULTIPLIER and Math.ceil'd (run-and-map.js's buildAct()) —
  // 3/4/5 across acts 1/2/3 (lowered from 5/6/8 for playtest readiness,
  // BUILD 137 — act scaling itself unchanged); F23 is what the boss's own
  // Nat 1 applies TO ITSELF (cards-mods.js's boss_nat_one_passive), flat and
  // unscaled, untouched by this build. Kept as two named constants, not
  // collapsed into one, since they are independent design knobs.
  ENEMY_BUFF_POISON_STACKS: 3,
  ENEMY_NAT_ONE_SELF_POISON: 5,

  // BUILD 107 (closes KI-12) — die size, one per-entity value. Was a bare
  // literal 20 repeated at nine call sites across run-and-map.js,
  // rendering.js and dev-tools.js (grep-confirmed before this build, and
  // confirmed zero remaining afterward). All three read 20 today, but each
  // is its own named field rather than one shared constant, per D-11 (die
  // size per class and per boss — Parked, not built): the player, an elite
  // and the boss must each be free to vary independently later without a
  // second refactor. Nothing in js/ reads a bare 20 for a die size any more.
  DIE_SIZE: { PLAYER: 20, ELITE: 20, BOSS: 20 },

  // F20/F21 — elite and boss die face layouts. Was run-and-map.js's
  // buildAct() inline buildEnemyDieFaces([7, 14], false) / ([5, 10, 15], true)
  // call-site arguments.
  ELITE_DIE: { POISON_FACES: [7, 14], INCLUDE_NATS: false },
  BOSS_DIE: { POISON_FACES: [5, 10, 15], INCLUDE_NATS: true },

  // F27 — pitch-chain step cap. Was audio.js's standalone CHAIN_STEP_CAP = 8.
  CHAIN_STEP_CAP: 8,

  // D-51 (BUILD 132) — per-round trigger cap. No cap existed in code before
  // this build (grep-confirmed at prompt D's own step 3 — see CLAUDE.md's
  // OUTSIDE-ROLL TRIGGER section). gameState.turn.roundTriggerCount
  // (state.js) counts every real MOD_TRIGGER dispatch this round (mod_dispatch,
  // cards-mods.js) except a Nat 20 sweep's own calls (onNatTwenty tags them
  // natTwentySweep: true so mod_dispatch can tell the two apart) —
  // triggerFaceOutsideRoll() (pipeline.js) refuses to fire once this counter
  // reaches the cap. Cleared to 0 at START_OF_TURN alongside every other
  // per-round roll flag (phase-machine.js).
  ROUND_TRIGGER_CAP: 10,

  // BUILD 133 (checkpoint 3, Bound engine) — fast sweep timing. Paces the
  // playback of a multi-face sweep (Nat 20's onNatTwenty() loop, the Bound
  // scan — pipeline.js) so many loaded faces don't all resolve in the same
  // instant. State itself still updates the instant each face's dispatch
  // runs; this only staggers WHEN each one plays. gameState.turn.
  // roundSweepPlays (state.js) counts every sweep-played trigger this round,
  // both Nat 20 sweeps and Bound scans alike; the first three plays in a
  // round land SWEEP_TRIGGER_DELAY_MS apart, every play after the third
  // lands at a quarter of that delay instead. No cap existed before this
  // build — timing only, no other numbers change.
  SWEEP_TRIGGER_DELAY_MS: 200,

  // F28 — sound duration ceiling. Not previously a literal anywhere (each
  // sound's own durationMs was, and remains, its own value — see audio.js's
  // WRITTEN SPEC comment) — this is the documented ceiling those values are
  // checked against. BUILD 102 audit: measured every SOUND_TABLE entry's
  // real total duration live (tests/facts.test.js) rather than trusting the
  // fact as written — the original F28 named only nat_20/nat_1 as
  // exceeding 200ms, but fight_won (210ms), fight_lost (260ms),
  // fight_start_boss (320ms) and boss_defeated (400ms) already exceeded it
  // too. No sound was changed (no numbers change, per this build's scope)
  // — F28's wording was corrected instead to name the true exemption set.
  SOUND_DURATION_CEILING_MS: 200,
  SOUND_DURATION_CEILING_EXEMPT: ['nat_20', 'nat_1', 'fight_won', 'fight_lost', 'fight_start_boss', 'boss_defeated'],

  // F31 — the three-act run (checkpoint 2, 8 North star). ACTS is the run's
  // total act count; buildAct(actNumber) (run-and-map.js) reads
  // ACT_HP_MULTIPLIER[actNumber-1] and ACT_INTENT_MULTIPLIER[actNumber-1]
  // and applies both, with Math.ceil, at enemy-slot creation time (every
  // enemy's hp/intentMin/intentMax, and the poison-buff amount below, which
  // rides the intent multiplier per the prompt's explicit instruction) —
  // never read live off GAME_CONFIG mid-fight, so an act's own numbers are
  // fixed the moment its map is built. Act 1's multiplier is 1.0 on both
  // axes, so every act 1 number is byte-identical to pre-125 behaviour.
  ACTS: 3,
  ACT_HP_MULTIPLIER: [1.0, 1.4, 1.9],
  ACT_INTENT_MULTIPLIER: [1.0, 1.2, 1.45],

  // BUILD 129 (checkpoint 3 tiers). Every offerable mod and card now
  // carries a tier field ('common'/'uncommon'/'rare') alongside its
  // definition (cards-mods.js) — Consecrate and Strike/Ward/Rite carry no
  // tier field at all and are never offered (unchanged, per DIE_ACTION_
  // EXCLUDED_MOD_IDS and the fact that config.cardPool never held the
  // three starters). TIER_ORDER is the fixed low-to-high order state.js's
  // pickTieredOffer() walks when a rolled tier has nothing left to offer:
  // first down (toward common), then, if still nothing, up (toward rare).
  // TIER_SPLIT is a [common, uncommon, rare] probability triple, one per
  // reward source, that each of a card reward's or a Load offer's 3
  // choices rolls independently against (state.js's rollTier()) — 'rite'
  // shares the 'fight' split (rites and fights read the same table); which
  // split a given offer uses is decided by rendering.js's
  // currentOfferTierSplit() off the slot that reward/offer came from.
  TIER_ORDER: ['common', 'uncommon', 'rare'],
  TIER_SPLIT: {
    fight: [0.65, 0.30, 0.05],
    elite: [0.40, 0.40, 0.20],
    boss: [0.0, 0.70, 0.30]
  }

};
