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
// F17 (BUILD 142) act 1 HP: opening 50, lane fights by position 58/65/72/78/85, elite 100, boss 100
// F18 (BUILD 142) intent: opening 4–12, normals 6–18, elite 10–18, boss 10–20 — every enemy acts from a pattern (F36, F37)
// F19 enemy buff applies 3 stacks of poison (act 1), scaled per act to 4 (act 2) and 5 (act 3) · F20 (BUILD 142) act 1 elite (Lector) buff faces 3 and 9, both poison, 12-sided, no Nat faces · F21 (BUILD 142) act 1 boss (Hierophant) buff faces 5, 10, 15, all poison, plus Nat 20 and Nat 1
// F22 enemy Nat 20 every loaded buff triggers, ascending, repeatable · F23 enemy Nat 1 attack cancelled, self-applies a flat 5 stacks of poison, once per fight
// F24 mods 27 (BUILD 149: +Dread, Genuflect; 26 offerable plus Consecrate, tiers 13/9/4), each asserted by tests/mods.test.js
// F25 cards 41 (BUILD 150: +Bulwark; tiers 21/13/7), each asserted by tests/facts.test.js
// F26 files under /js/: eleven — config, state, listener-registry, audio, pipeline, cards-mods, run-and-map, phase-machine, rendering, dev-tools, bootstrap
// F27 pitch chains cap 8, reset at START_OF_TURN
// F28 (corrected BUILD 102 — see paste-back) sound duration ceiling 200 ms holds for every frequent sound (roll, card plays, damage, block, end turn, mod trigger, die action, card reward, fight_start_normal/elite); nat_20 (230ms), nat_1 (260ms), fight_won (210ms), fight_lost (260ms), fight_start_boss (320ms) and boss_defeated (400ms) exceed it — all six are rare, at most once per fight-ending event, boss fight, or Nat roll, measured live via tests/facts.test.js, not just the two Nat sounds the fact previously named
// F33 (BUILD 141) at START_OF_TURN, before poison ticks and before block clears, every 5 block the player holds removes 1 stack of poison from the player
// F34 (BUILD 141, KI-28 BUILD 148) enemies act from a repeating pattern of 1 to 4 intents: Attack (a number rolled evenly in its range), Charge (a no-damage wind-up round, then a release; broken if HP lost from the wind-up's start through the release's own tick reaches the break number) and Afflict (stacks of poison, no damage); an enemy Nat 1 cancels that round's intent
// F35 (BUILD 141) any enemy can carry a die of any size from GAME_CONFIG.DIE_SIZE; buffs are poison, Wrath (adds to every Attack from the next round on), Drain (1 less soul next round) and Seal (the player's heaviest loaded face other than 1 and 20 counts as blank next round, for every rule)
// F36 (BUILD 142) act 1 enemies: Verger (opening at 6–9, position 3 at 9–12), Thurifer (positions 1 and 4), Asperser (positions 2 and 5), Lector (elite), Hierophant (boss); an enemy Nat 20 or Nat 1 has its own sound and a pulse on the rolled row (KI-22)
// F37 (BUILD 142) acts 2 and 3 enemies: Chorister, Cantor, Flagellant, Archdeacon, Cardinal; Anchorite, Mendicant, Inquisitor, Exarch, Pontifex; normals roll 6-sided dice, elites 12-sided, bosses 20-sided with their own Nat pair; the Pontifex reads the player's heaviest face
// F38 (BUILD 142) Threnody's face is set once per run, 2 to 19, in gameState.run
// F39 (BUILD 142) a Seal lasts one round: the sealed list is replaced at every START_OF_TURN and emptied at fight start
// F31 (BUILD 125, corrected BUILD 142) three acts; per-act enemy HP multiplier 1.0/1.4/1.9, applied at enemy creation (buildAct()) with Math.ceil; the intent multiplier 1.0/1.2/1.45 no longer scales a pattern's own numbers (BUILD 142) — it sets only the enemy buff's poison-stack amount, the same way (also Math.ceil, also fixed at enemy creation); the enemy Nat 1 self-poison stays a flat, unscaled amount
// F32 (BUILD 125) beating the act 1 or act 2 boss grants a card reward and one die reward, exactly like any other fight win; the act 3 boss is VICTORY with no reward (D-22)
// F40 (BUILD 143) npm test runs every test file; guardrails.test.js fails on CLAUDE.md size, CONFIRMED WORKING line length, stale CURRENT SUBSTAGE, comment share, a build number in a comment, or a stray file
// F41 (BUILD 149) stacks of awe lower an Attack's damage to no less than 0, after Wrath, then decay by 1 at START_OF_TURN
// F42 (BUILD 150) break numbers lowered by 4; gold (GOLD_REWARDS) from a fight win spends in the shop (SHOP) after every rite; three relics offered after an Elite/non-final-Boss win
// F43 (BUILD 151) Purify: third die action, clears mods off a face (never 1/10/20), weight kept
// F44 (BUILD 151) lower lane index 3 is the event The Font: unresolved roll picks the outcome
// ============================================================

const GAME_CONFIG = {

  BUILD: 152,

  PLAYER_MAX_HP: 70,
  PLAYER_MAX_SOUL: 3,
  DRAW_COUNT: 5,
  STARTING_DECK: ['strike', 'strike', 'strike', 'strike', 'strike', 'ward', 'ward', 'ward', 'ward', 'rite'],
  BLANK_ROLL_BLOCK: 2,
  PENITENCE_TURNS: 3,
  RITE_HEAL: 20,

  DIE_REWARDS: { ELITE: 2, SINGLE: 1 },

  LANE_COUNT: 2,
  SLOTS_PER_LANE: 8,
  ELITE_SLOT_INDEX: 3,
  ELITE_ALLOWED_SLOT_INDICES: [3],
  RITE_SLOT_INDICES: [1, 4, 7],

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

  ACT1_LANE_FIGHT_HP: [58, 65, 72, 78, 85],

  POISON_ANSWER_BLOCK_PER_STACK: 5,

  ENEMY_BUFF_POISON_STACKS: 3,
  ENEMY_NAT_ONE_SELF_POISON: 5,

  DIE_SIZE: { PLAYER: 20, ELITE: 12, BOSS: 20, NORMAL: 6 },

  ENEMY_WRATH_AMOUNT: 2,

  DEV_TEST_DIE_SIZES: [6, 12, 20],

  ELITE_DIE: { POISON_FACES: [7, 14], INCLUDE_NATS: false },
  BOSS_DIE: { POISON_FACES: [5, 10, 15], INCLUDE_NATS: true },

  ENEMIES: {
    verger_opening: {
      name: 'Verger',
      pattern: [{ kind: 'attack', min: 6, max: 9 }, { kind: 'attack', min: 6, max: 9 }]
    },
    verger_lane: {
      name: 'Verger',
      pattern: [{ kind: 'attack', min: 9, max: 12 }, { kind: 'attack', min: 9, max: 12 }]
    },
    thurifer: {
      name: 'Thurifer',
      pattern: [{ kind: 'attack', min: 10, max: 14 }, { kind: 'charge', release: 24, breakAt: 11 }]
    },
    asperser: {
      name: 'Asperser',
      pattern: [{ kind: 'attack', min: 11, max: 15 }, { kind: 'attack', min: 11, max: 15 }, { kind: 'afflict', stacks: 4 }]
    },
    lector: {
      name: 'Lector',
      pattern: [{ kind: 'attack', min: 13, max: 17 }, { kind: 'afflict', stacks: 4 }, { kind: 'charge', release: 27, breakAt: 15 }],
      dieSpec: { sizeKey: 'ELITE', faces: { 3: 'enemy_buff_poison', 9: 'enemy_buff_poison', 6: 'enemy_buff_drain', 12: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 2
    },
    hierophant: {
      name: 'Hierophant',
      pattern: [{ kind: 'attack', min: 16, max: 20 }, { kind: 'charge', release: 32, breakAt: 19 }, { kind: 'afflict', stacks: 4 }],
      dieSpec: { sizeKey: 'BOSS', faces: { 5: 'enemy_buff_poison', 10: 'enemy_buff_poison', 15: 'enemy_buff_poison' }, nats: true }
    },
    chorister: {
      name: 'Chorister',
      pattern: [{ kind: 'attack', min: 11, max: 15 }, { kind: 'charge', release: 26, breakAt: 14 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 6: 'enemy_buff_drain' }, nats: false }
    },
    cantor: {
      name: 'Cantor',
      pattern: [{ kind: 'attack', min: 13, max: 17 }, { kind: 'charge', release: 27, breakAt: 17 }, { kind: 'attack', min: 13, max: 17 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 2: 'enemy_buff_poison', 5: 'enemy_buff_drain' }, nats: false }
    },
    flagellant: {
      name: 'Flagellant',
      pattern: [{ kind: 'attack', min: 17, max: 21 }, { kind: 'afflict', stacks: 5 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 3: 'enemy_buff_poison', 6: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 3
    },
    archdeacon: {
      name: 'Archdeacon',
      pattern: [{ kind: 'attack', min: 16, max: 20 }, { kind: 'afflict', stacks: 5 }, { kind: 'charge', release: 32, breakAt: 21 }],
      dieSpec: { sizeKey: 'ELITE', faces: { 3: 'enemy_buff_poison', 12: 'enemy_buff_poison', 6: 'enemy_buff_seal', 9: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 2
    },
    cardinal: {
      name: 'Cardinal',
      pattern: [{ kind: 'attack', min: 19, max: 23 }, { kind: 'charge', release: 37, breakAt: 25 }, { kind: 'afflict', stacks: 5 }],
      dieSpec: { sizeKey: 'BOSS', faces: { 3: 'enemy_buff_poison', 15: 'enemy_buff_poison', 7: 'enemy_buff_wrath', 18: 'enemy_buff_wrath', 11: 'enemy_buff_seal' }, nats: true },
      wrathPerTrigger: 3
    },
    anchorite: {
      name: 'Anchorite',
      pattern: [{ kind: 'attack', min: 13, max: 17 }, { kind: 'attack', min: 13, max: 17 }, { kind: 'afflict', stacks: 6 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 6: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 2
    },
    mendicant: {
      name: 'Mendicant',
      pattern: [{ kind: 'attack', min: 17, max: 21 }, { kind: 'afflict', stacks: 6 }, { kind: 'attack', min: 17, max: 21 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 3: 'enemy_buff_wrath', 6: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 3
    },
    inquisitor: {
      name: 'Inquisitor',
      pattern: [{ kind: 'attack', min: 20, max: 24 }, { kind: 'charge', release: 39, breakAt: 29 }],
      dieSpec: { sizeKey: 'NORMAL', faces: { 4: 'enemy_buff_poison' }, nats: false }
    },
    exarch: {
      name: 'Exarch',
      pattern: [{ kind: 'attack', min: 21, max: 25 }, { kind: 'afflict', stacks: 6 }, { kind: 'charge', release: 41, breakAt: 31 }],
      dieSpec: { sizeKey: 'ELITE', faces: { 3: 'enemy_buff_poison', 6: 'enemy_buff_seal', 12: 'enemy_buff_seal', 9: 'enemy_buff_wrath' }, nats: false },
      wrathPerTrigger: 3
    },
    pontifex: {
      name: 'Pontifex',
      pattern: [{ kind: 'attack', min: 21, max: 25 }, { kind: 'afflict', stacks: 6 }, { kind: 'attack', min: 21, max: 25 }, { kind: 'charge', release: 41, breakAt: 31 }],
      dieSpec: { sizeKey: 'BOSS', faces: { 4: 'enemy_buff_poison', 16: 'enemy_buff_poison', 8: 'enemy_buff_seal', 19: 'enemy_buff_seal', 12: 'enemy_buff_wrath' }, nats: true },
      wrathPerTrigger: 3
    }
  },

  CHAIN_STEP_CAP: 8,

  ROUND_TRIGGER_CAP: 10,

  SWEEP_TRIGGER_DELAY_MS: 200,

  SOUND_DURATION_CEILING_MS: 200,
  SOUND_DURATION_CEILING_EXEMPT: ['nat_20', 'nat_1', 'fight_won', 'fight_lost', 'fight_start_boss', 'boss_defeated'],

  ACTS: 3,
  ACT_HP_MULTIPLIER: [1.0, 1.4, 1.9],
  ACT_INTENT_MULTIPLIER: [1.0, 1.2, 1.45],

  TIER_ORDER: ['common', 'uncommon', 'rare'],
  TIER_SPLIT: {
    fight: [0.65, 0.30, 0.05],
    elite: [0.40, 0.40, 0.20],
    boss: [0.0, 0.70, 0.30]
  },

  GOLD_REWARDS: { FIGHT: [12, 20], ELITE: [30, 40], BOSS: 60 },

  SHOP: {
    CARD_PRICE: { common: 50, uncommon: 75, rare: 120 },
    STRENGTHEN_PRICE: 100,
    REMOVAL_BASE_PRICE: 75,
    REMOVAL_PRICE_STEP: 25
  },

  RELIC_MAX: 5,

  EVENT: {
    NAT_TWENTY_GOLD: 30,
    BLANK_GOLD: 20,
    NAT_ONE_HP_LOSS: 10
  }

};
