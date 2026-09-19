// ============================================================
// AUDIO.JS — BUILD 093, extended BUILD 094/095, retuned BUILD 096
// One AudioContext plus an event-to-sound table — the same shape as the
// listener registry (listener-registry.js). Game logic never calls a
// sound function directly; it announces a named event via
// playAudioEvent('event_name'), and this file's own SOUND_TABLE decides
// what that sounds like. Every sound in the game can later be swapped by
// editing that one table, without touching any call site.
//
// Synthesised only — no audio files. The /audio/ folder exists (BUILD 091)
// but stays empty this build too; these are plain WebAudio oscillator
// sounds, short and quiet, reference is original RuneScape: dry,
// satisfying clicks and thuds, not musical phrases — no reverb, no melody.
//
// Browser autoplay policy: an AudioContext constructed before any user
// gesture starts in the 'suspended' state, and stays suspended — every
// sound scheduled on it silently produces no audio, no error — until it is
// resumed from inside a real user-gesture event handler. unlockAudioOnce()
// (called once, on the page's first pointerdown — see bootstrap.js) is
// that resume. After that unlock, playAudioEvent() calls fire normally
// with no further clicks needed, including the fully automatic rolls the
// phase machine's own auto-advance chain triggers.
//
// BUILD 096 — TONE PASS. No new sounds, no new SOUND_TABLE entries, no
// event/announce-site changes, no change to the two BUILD 095 pitch chains
// or their 8-step cap, no change to mute. Purely a retune of the existing
// voices, because almost every one of them was built on the same shared
// playTone() call with a square wave and a similar short instant-attack
// envelope, differing mainly by frequency — same waveform + same envelope
// is the same voice no matter how far apart the pitches sit, and several
// of the most-frequently-fired sounds (card plays, damage landing, end
// turn) sat in a piercing high register on top of that. This pass: lowers
// the register on everything that fires often, moves most sounds off
// square onto sine/triangle (reserving square/sawtooth specifically for
// Nat 1, damage landing on the player, and fight lost — the sounds that
// should actually feel harsh), and gives each sound a genuinely different
// envelope shape (attack time, duration, single tone vs. a simultaneous
// interval), not just a different pitch. Four sounds are named in the
// prompt as already working and are unchanged: Load, Strengthen, Nat 20,
// Nat 1 (each function below says so explicitly). fight_start_boss and
// boss_defeated were reviewed too (not named as exempt) but were already
// sine-based, low-ish, and deliberately the two biggest/weightiest sounds
// in the table — left as they were, since nothing about them was tinny,
// square, or fired often.
//
// WRITTEN SPEC — every voice in the table, for the next tone pass to start
// from a record rather than from reading the code (durations are the
// total sound length including any fade/attack; "interval" means two
// oscillators sounding together, not in sequence):
//
//   roll                 triangle  620Hz              6ms attack  / 70ms total
//   roll_blank           sine      340Hz              0ms attack  / 90ms total
//   card_attack (Chain A) triangle  480Hz (chain-shifted) 4ms attack / 50ms total
//   card_block  (Chain A) sine      240Hz (chain-shifted) 12ms attack / 110ms total
//   card_hybrid (Chain A) triangle  360Hz+480Hz interval (chain-shifted) 8ms attack / 90ms total
//   mod_trigger (Chain B) sine      420Hz (chain-shifted) 5ms attack  / 60ms total
//   damage_enemy         triangle  820Hz              2ms attack  / 65ms total
//   damage_player        sawtooth  240->170Hz sweep    0ms attack  / 130ms total  (harsh, on purpose)
//   block_absorb         sine      130Hz              18ms attack / 170ms total
//   end_turn             sine      200Hz              10ms attack / 55ms total   (very quiet)
//   nat_20               square    900/1300/1900Hz cascade  UNCHANGED, see below
//   nat_1                sawtooth  450->140 / 442->132 detuned pair  UNCHANGED, see below
//   fight_won            sine      520Hz then 780Hz    6ms attack each / 90ms+120ms
//   fight_lost           sawtooth  260->140Hz sweep    0ms attack  / 260ms total  (harsh, on purpose — CHANGED, see below)
//   fight_start_normal   triangle  420Hz              10ms attack / 90ms total
//   fight_start_elite    triangle  520Hz then 620Hz    5ms attack each / 50ms+50ms
//   fight_start_boss     sine      110Hz+165Hz interval 60ms attack / 320ms total  UNCHANGED
//   boss_defeated        sine      500(found.)/700/1050/1400Hz cascade  UNCHANGED
//   die_action_load      sine      260->220 / 268->226 detuned pair  40ms attack / 190ms total  UNCHANGED
//   die_action_strengthen sine     220->160Hz sweep    0ms attack  / 120ms total  UNCHANGED
//   card_reward_basic    sine      440Hz              6ms attack  / 60ms total
//   card_reward_rich     sine      560Hz+700Hz interval 8ms attack / 100ms total
// ============================================================

let audioContext = null;
let audioMuted = false;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Called once, from the page's first user gesture (bootstrap.js wires this
// with { once: true }, so this itself never needs to guard against being
// called more than once). Resuming an already-running context is a
// harmless no-op, so this is safe to call unconditionally on that first
// gesture regardless of what state the context happens to already be in.
function unlockAudioOnce() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// BUILD 094: the one shared low-level synth every sound in this file goes
// through — a single oscillator with a gain envelope, optionally sweeping
// from freqStart to freqEnd (a plain constant-pitch tone passes the same
// value for both). audioMuted/ctx.state are checked here, in this one
// place, so every sound — including the multi-call cascades below
// (nat_20, fight_won, fight_start_elite, boss_defeated) — is silenced by
// the mute toggle and fails silently before the audio unlock, with no
// per-sound duplication of either check.
// BUILD 095: gained an optional 6th argument, attackMs, for a slow fade-in
// instead of an instant attack. BUILD 096: this argument is now used far
// more widely (most retuned sounds pass a small attackMs to soften what
// was previously an instant click) — the parameter itself and its
// behaviour inside playTone() are unchanged from BUILD 095, only how many
// callers use it has grown.
function playTone(waveform, freqStart, freqEnd, durationMs, peakGain, attackMs) {
  if (audioMuted) return;
  const ctx = getAudioContext();
  if (ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = waveform;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqEnd !== freqStart) {
    osc.frequency.linearRampToValueAtTime(freqEnd, now + durationMs / 1000);
  }
  if (attackMs) {
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peakGain, now + attackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  } else {
    gain.gain.setValueAtTime(peakGain, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  }
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

// BUILD 093: kept as its own name (a constant-pitch square click) since
// nat_20 (BUILD 094, explicitly unchanged this build) still uses it; now a
// thin wrapper over the shared playTone() rather than its own separate
// oscillator setup. BUILD 096: no longer used by roll/card_attack/end_turn/
// card_reward_basic — each of those moved off square directly onto
// playTone() with a softer waveform, so this helper's only remaining
// caller is Nat 20.
function playClick(freq, durationMs, peakGain) {
  playTone('square', freq, freq, durationMs, peakGain);
}

// ---------- BUILD 095: the rising chains (unchanged this build) ----------
// Balatro-style: each consecutive trigger of the same chain, within the
// same player turn, plays one semitone higher than the last. Two
// independent chains sharing no counter — Chain A (cards played) and
// Chain B (mods triggered) — each capped at 8 steps so a long cascade
// (a Nat 20 across a heavily loaded die, or a long turn of cards) holds at
// a ceiling rather than climbing into a shriek. Both reset to 0 at the
// start of the player's turn (resetSoundChains(), called once from
// runPhase()'s START_OF_TURN branch — phase-machine.js) — not a sound
// itself, so it is called directly rather than through playAudioEvent().
// BUILD 096 touches none of this mechanism — only the base frequencies
// the chain multiplies (inside each chained sound function below) moved.
const CHAIN_STEP_CAP = GAME_CONFIG.CHAIN_STEP_CAP;
let cardChainStep = 0;
let modChainStep = 0;

function semitoneRatio(steps) {
  return Math.pow(2, steps / 12);
}

function resetSoundChains() {
  cardChainStep = 0;
  modChainStep = 0;
}

// Events whose SOUND_TABLE function accepts a chain step (semitones) as
// its one argument. Anything not listed here is called with no argument,
// exactly as every BUILD 094 sound already was.
const CARD_CHAIN_EVENTS = ['card_attack', 'card_block', 'card_hybrid'];
const MOD_CHAIN_EVENTS = ['mod_trigger'];

// A non-blank, non-Nat roll landing (a mod die-face). BUILD 096: moved off
// a square 1400Hz click onto a softer triangle tone, an octave-plus lower,
// with a short fade-in — this fires often (every non-blank, non-Nat roll)
// so it was one of the "piercing register" offenders.
function playRollSound() {
  playTone('triangle', 620, 620, 70, 0.13, 6);
}

// A blank roll landing — deliberately duller and quieter than the roll
// click above, since blanks are ~70% of rolls and must not read as an
// event. BUILD 096: sine (was square via playClick), lower register,
// otherwise the same "quiet non-event" intent as before.
function playBlankRollSound() {
  playTone('sine', 340, 340, 90, 0.05);
}

// ---------- Card play sounds (Chain A) ----------
// BUILD 096: attack/block/hybrid were the single worst offender group
// named in the prompt — all three were square or square-sweep, all high,
// all essentially the same voice at three different pitches. Retuned so
// each reads as a different ACTION, not a different note: attack is a
// quick decisive single tone, block is a duller lower single tone with a
// bodied fade-in, hybrid is the only one of the three built from two
// simultaneous tones (an interval) rather than one. Chain A's pitch shift
// (semitoneOffset) still multiplies every base frequency unchanged from
// BUILD 095 — only the base timbre moved.

// Card play, attack — triangle (no more square edge), single tone, the
// shortest attack of the three (4ms — still reads as quick/decisive) and
// the shortest overall duration, at a mid-low register instead of the old
// piercing 1800Hz.
function playCardAttackSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('triangle', 480 * ratio, 480 * ratio, 50, 0.13, 4);
}

// Card play, block — sine (the softest waveform), lower register than
// attack, a noticeably longer attack (12ms) and total duration (110ms) for
// a dull, bodied thud rather than a click.
function playCardBlockSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('sine', 240 * ratio, 240 * ratio, 110, 0.14, 12);
}

// Card play, hybrid — the only one of the three built from an interval:
// two triangle tones a fourth apart (360Hz/480Hz), sounding together, with
// an attack (8ms) and duration (90ms) between the other two. Distinct from
// both without being a blend of either — it doesn't sound like a quieter
// attack or a higher block, it sounds like two things at once, because it
// is.
function playCardHybridSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('triangle', 360 * ratio, 360 * ratio, 90, 0.10, 8);
  playTone('triangle', 480 * ratio, 480 * ratio, 90, 0.10, 8);
}

// A mod triggering — the identity Chain B climbs. Every mod, whatever it
// actually does (damage, block, poison, a pure setup effect like Fervour),
// fires this once when it triggers; a mod's own dealDamage()/dealBlock()
// call separately fires its own landing/absorb sound as usual. BUILD 096:
// moved from a triangle 1100Hz tone (too close to the old card_hybrid
// register, and too high given how often this can fire on a Nat 20) down
// to a quieter sine tone in a register of its own, between block_absorb
// and card_block.
function playModTriggerSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('sine', 420 * ratio, 420 * ratio, 60, 0.10, 5);
}

// Damage landing on the enemy — "good news." BUILD 096: this was a
// sawtooth 2200Hz click, the single most piercing sound in the table and
// one of the most frequent. Reserving harsh waveforms for the sounds that
// should actually feel harsh (see damage_player below) means this moves
// to triangle — still bright and satisfying, since landing a hit on the
// enemy is a good thing, just not abrasive — at a much lower register with
// a near-instant attack (2ms) for a snappy, positive "hit" feel.
function playDamageEnemySound() {
  playTone('triangle', 820, 820, 65, 0.15, 2);
}

// Damage landing on the player — "bad news," and the prompt explicitly
// wants this to stay harsh. Kept on sawtooth per that instruction, kept
// low and falling (a heavier, sinking feeling), instant attack (an
// unblocked hit should feel abrupt, not eased in) — the one deliberately
// unpleasant sound in the frequently-fired group, which is the point:
// it must be unmistakably different from, and worse-sounding than,
// damage_enemy above.
function playDamagePlayerSound() {
  playTone('sawtooth', 240, 170, 130, 0.15);
}

// Block absorbing an incoming hit — "dull and bodied, not a click," per
// the prompt. Already sine and already the lowest register in the
// BUILD 094 set; BUILD 096 adds a real fade-in (18ms, was instant) and
// stretches the duration a little (170ms) so it reads as a body absorbing
// a hit rather than a sharp tap.
function playBlockAbsorbSound() {
  playTone('sine', 130, 130, 170, 0.11, 18);
}

// End turn — "soft and low, close to unnoticeable," per the prompt, since
// it fires every single turn. BUILD 096: the old square 550Hz double-tick
// is gone entirely (a rhythmic double-click reads as an event, the exact
// opposite of "close to unnoticeable") — replaced with one quiet, low sine
// blip, the quietest sound in the whole table (peak gain 0.045).
function playEndTurnSound() {
  playTone('sine', 200, 200, 55, 0.045, 10);
}

// Nat 20 — the payoff. UNCHANGED this build, per the prompt's explicit
// instruction to leave it alone: still the three-step ascending square
// cascade (900 -> 1300 -> 1900Hz, ~260ms, the loudest sound in the table).
// Reviewed against the newly-quieter set and does not sit oddly — if
// anything the contrast is now sharper, which is correct for "the payoff
// moment of the whole game."
function playNat20Sound() {
  playClick(900, 70, 0.22);
  setTimeout(function() { playClick(1300, 70, 0.22); }, 70);
  setTimeout(function() { playClick(1900, 90, 0.24); }, 140);
}

// Nat 1 — the punishment. UNCHANGED this build, per the prompt's explicit
// instruction: still the detuned descending sawtooth pair (450->140Hz /
// 442->132Hz, ~260ms). Reviewed against the retuned set and still reads
// correctly as "wrong" — fight_lost below is now also harsh (sawtooth),
// but never detunes, so the two negative sounds remain distinct from each
// other exactly as before.
function playNat1Sound() {
  playTone('sawtooth', 450, 140, 260, 0.16);
  playTone('sawtooth', 442, 132, 260, 0.10);
}

// Fight won — sine, two ascending notes. BUILD 096: lowered both notes
// (520Hz -> 780Hz, was 700/1050) to sit further from Nat 20's now-more-
// prominent cascade, and added a short fade-in (6ms) to each note so
// neither has an instant-click transient; the two-note rising-chime shape
// itself, and the gap between the notes, are unchanged.
function playFightWonSound() {
  playTone('sine', 520, 520, 90, 0.16, 6);
  setTimeout(function() { playTone('sine', 780, 780, 120, 0.16, 6); }, 90);
}

// Fight lost — CHANGED this build, and flagged as such: previously sine
// (deliberately soft, "somber not wrong"), now sawtooth, per the prompt's
// explicit instruction to reserve harsh waveforms for Nat 1, damage
// landing on the player, and fight lost specifically — three sounds named
// together as "should feel harsh," and fight_lost was the one of the three
// still sine. Kept clearly distinct from Nat 1: no detuning (a single
// plain oscillator, not a beating pair), and a longer, single continuous
// downward sweep (260 -> 140Hz over 260ms) rather than Nat 1's dissonant
// wobble — reads as harsh-and-final rather than harsh-and-wrong.
function playFightLostSound() {
  playTone('sawtooth', 260, 140, 260, 0.13);
}

// Fight start, normal — BUILD 096: lowered slightly (420Hz, was 500) and
// given a touch more attack (10ms) for consistency with the rest of the
// quieter set; still triangle, still the plainest and quietest of the
// three fight-start variants.
function playFightStartNormalSound() {
  playTone('triangle', 420, 420, 90, 0.08, 10);
}

// Fight start, elite — BUILD 096: was a square two-click (700/850Hz,
// instant attack) — moved to triangle with a short fade-in on each note,
// keeping the two-quick-tones "more urgent than normal" shape but losing
// the square edge that made it read as another click in the same family
// as the old card sounds.
function playFightStartEliteSound() {
  playTone('triangle', 520, 520, 50, 0.12, 5);
  setTimeout(function() { playTone('triangle', 620, 620, 50, 0.13, 5); }, 50);
}

// Fight start, boss — UNCHANGED this build. Not named in the prompt's
// exempt list, but reviewed and left alone: already sine, already low
// (110Hz/165Hz), already slow-attack (60ms) and the longest non-Nat sound
// in the table (~320ms) — it was never square, tinny, or frequent, so
// nothing about it needed the fixes this pass makes.
function playFightStartBossSound() {
  playTone('sine', 110, 110, 320, 0.16, 60);
  playTone('sine', 165, 165, 320, 0.12, 60);
}

// Boss defeated — UNCHANGED this build, for the same reason as fight-
// start-boss above: already sine, already the biggest/weightiest positive
// sound in the table, fires at most once per run. Nothing to fix.
function playBossDefeatedSound() {
  playTone('sine', 500, 500, 100, 0.10); // low foundation, under the first note
  playTone('sine', 700, 700, 100, 0.18);
  setTimeout(function() { playTone('sine', 1050, 1050, 140, 0.20); }, 100);
  setTimeout(function() { playTone('sine', 1400, 1400, 180, 0.22); }, 220);
}

// Load a mod onto a face — UNCHANGED this build, per the prompt's explicit
// instruction: still the detuned sine pair (260->220Hz / 268->226Hz) with
// a slow 40ms fade-in, deliberately spooky rather than a UI confirm tone.
function playDieActionLoadSound() {
  playTone('sine', 260, 220, 190, 0.11, 40);
  playTone('sine', 268, 226, 190, 0.09, 40);
}

// Strengthen a face — UNCHANGED this build, per the prompt's explicit
// instruction: still a single plain sine tone, instant attack, sweeping
// down (220 -> 160Hz), no detuning — Load adds (eerie), Strengthen
// deepens (solid), unchanged from BUILD 095.
function playDieActionStrengthenSound() {
  playTone('sine', 220, 160, 120, 0.15);
}

// Card reward, basic (Strike/Ward) — BUILD 096: moved off a square
// 500Hz click onto a plain sine tone with a short fade-in; still the
// simplest single-tone sound in the reward pair, matching how plain these
// two starting cards are.
function playCardRewardBasicSound() {
  playTone('sine', 440, 440, 60, 0.10, 6);
}

// Card reward, rich (every other card) — BUILD 096: lowered both notes of
// the interval slightly (560Hz/700Hz, was 600/750) and added a short
// fade-in (8ms) to each, for consistency with the rest of the quieter,
// softer-attack palette; still two simultaneous sine tones a consonant
// major third apart, reading as a small chord against card_reward_basic's
// single flat tone.
function playCardRewardRichSound() {
  playTone('sine', 560, 560, 100, 0.12, 8);
  playTone('sine', 700, 700, 100, 0.12, 8);
}

// The event-to-sound table. Game logic calls playAudioEvent() with one of
// these names, never a playXSound() function directly. No entries added,
// removed, or renamed this build.
const SOUND_TABLE = {
  roll: playRollSound,
  roll_blank: playBlankRollSound,
  card_attack: playCardAttackSound,
  card_block: playCardBlockSound,
  card_hybrid: playCardHybridSound,
  mod_trigger: playModTriggerSound,
  damage_enemy: playDamageEnemySound,
  damage_player: playDamagePlayerSound,
  block_absorb: playBlockAbsorbSound,
  end_turn: playEndTurnSound,
  nat_20: playNat20Sound,
  nat_1: playNat1Sound,
  fight_won: playFightWonSound,
  fight_lost: playFightLostSound,
  fight_start_normal: playFightStartNormalSound,
  fight_start_elite: playFightStartEliteSound,
  fight_start_boss: playFightStartBossSound,
  boss_defeated: playBossDefeatedSound,
  die_action_load: playDieActionLoadSound,
  die_action_strengthen: playDieActionStrengthenSound,
  card_reward_basic: playCardRewardBasicSound,
  card_reward_rich: playCardRewardRichSound
};

// BUILD 095: threads the current chain step into a chained event's sound
// function and advances that chain's counter (capped) afterward. Every
// non-chained event is called exactly as it always was, with no argument.
// Unchanged this build.
function playAudioEvent(eventName) {
  const fn = SOUND_TABLE[eventName];
  if (!fn) return;
  if (CARD_CHAIN_EVENTS.indexOf(eventName) !== -1) {
    fn(cardChainStep);
    cardChainStep = Math.min(cardChainStep + 1, CHAIN_STEP_CAP);
  } else if (MOD_CHAIN_EVENTS.indexOf(eventName) !== -1) {
    fn(modChainStep);
    modChainStep = Math.min(modChainStep + 1, CHAIN_STEP_CAP);
  } else {
    fn();
  }
}
