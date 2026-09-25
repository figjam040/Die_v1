// One AudioContext plus an event-to-sound table. Game logic never calls a
// sound function directly; it announces a named event via
// playAudioEvent('event_name'), and SOUND_TABLE decides what that sounds
// like. Synthesised only — no audio files; /audio/ stays empty.
//
// An AudioContext built before any user gesture starts 'suspended' and
// stays silent until resumed from inside a real gesture handler —
// unlockAudioOnce() (bootstrap.js, on the page's first pointerdown) is
// that resume.

let audioContext = null;
let audioMuted = false;

function getAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioContext;
}

// Resuming an already-running context is a harmless no-op, so this is
// safe to call unconditionally on the first user gesture.
function unlockAudioOnce() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }
}

// The one shared low-level synth every sound goes through. audioMuted/
// ctx.state are checked here only, so every sound — including multi-call
// cascades — is silenced by mute with no per-sound duplication.
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

function playClick(freq, durationMs, peakGain) {
  playTone('square', freq, freq, durationMs, peakGain);
}

// ---------- Rising pitch chains ----------
// Each consecutive trigger of the same chain, within the same player
// turn, plays one semitone higher, capped at CHAIN_STEP_CAP so a long
// cascade holds at a ceiling rather than climbing into a shriek. Both
// chains reset to 0 at START_OF_TURN via resetSoundChains().
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

const CARD_CHAIN_EVENTS = ['card_attack', 'card_block', 'card_hybrid'];
const MOD_CHAIN_EVENTS = ['mod_trigger'];

// The Font's roll, which never animates.
function playRollSound() {
  playTone('triangle', 620, 620, 70, 0.13, 6);
}

// ---------- The fight roll (D-113) ----------
// Rolling rattles under the die animation; landing, blank or a Nat sound
// plays on the stop. Four quick ticks, each a little lower, inside 200ms.
function playDieRollingSound() {
  [0, 45, 90, 135].forEach(function(delay, i) {
    const freq = (700 - i * 60) * 0.92;
    setTimeout(function() { playTone('square', freq, freq, 30, 0.04); }, delay);
  });
}

// A struck tone over a low body — the die settling on a loaded face.
function playDieLandingSound() {
  playTone('triangle', 620, 620, 70, 0.13, 6);
  playTone('sine', 180, 120, 110, 0.10, 4);
}

// Deliberately duller than landing — blanks are most rolls and must not
// read as an event.
function playDieBlankSound() {
  playTone('sine', 300, 260, 100, 0.084, 6);
}

// ---------- Card play sounds (Chain A) ----------
// Each reads as a different ACTION: attack a quick single tone, block a
// duller one with a bodied fade-in, hybrid two simultaneous tones.

function playCardAttackSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('triangle', 480 * ratio, 480 * ratio, 50, 0.13, 4);
}

function playCardBlockSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('sine', 240 * ratio, 240 * ratio, 110, 0.14, 12);
}

function playCardHybridSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('triangle', 360 * ratio, 360 * ratio, 90, 0.10, 8);
  playTone('triangle', 480 * ratio, 480 * ratio, 90, 0.10, 8);
}

// Every mod fires this once when it triggers; dealDamage()/dealBlock()
// separately fire their own landing/absorb sound.
function playModTriggerSound(semitoneOffset) {
  const ratio = semitoneRatio(semitoneOffset || 0);
  playTone('sine', 420 * ratio, 420 * ratio, 60, 0.10, 5);
}

function playDamageEnemySound() {
  playTone('triangle', 820, 820, 65, 0.15, 2);
}

// Deliberately the harshest frequent sound: sawtooth, falling, instant
// attack — an unblocked hit must read as worse than a landed one.
function playDamagePlayerSound() {
  playTone('sawtooth', 240, 170, 130, 0.15);
}

function playBlockAbsorbSound() {
  playTone('sine', 130, 130, 170, 0.11, 18);
}

// Fires every turn — the quietest sound in the table on purpose.
function playEndTurnSound() {
  playTone('sine', 200, 200, 55, 0.045, 10);
}

// Loudest sound in the table on purpose — the payoff moment.
function playNat20Sound() {
  playClick(900, 70, 0.22);
  setTimeout(function() { playClick(1300, 70, 0.22); }, 70);
  setTimeout(function() { playClick(1900, 90, 0.24); }, 140);
}

// A detuned descending pair — kept dissonant so it's never mistaken for
// fight_lost below (harsh, but never detuned).
function playNat1Sound() {
  playTone('sawtooth', 450, 140, 260, 0.16);
  playTone('sawtooth', 442, 132, 260, 0.10);
}

// The player's own nat_20/nat_1 synthesis, an octave lower, each kept at
// 200ms or under so neither needs GAME_CONFIG.SOUND_DURATION_CEILING_EXEMPT.
function playEnemyNat20Sound() {
  playClick(450, 60, 0.20);
  setTimeout(function() { playClick(650, 60, 0.20); }, 60);
  setTimeout(function() { playClick(950, 70, 0.22); }, 120);
}

function playEnemyNat1Sound() {
  playTone('sawtooth', 225, 70, 190, 0.16);
  playTone('sawtooth', 221, 66, 190, 0.10);
}

function playFightWonSound() {
  playTone('sine', 520, 520, 90, 0.16, 6);
  setTimeout(function() { playTone('sine', 780, 780, 120, 0.16, 6); }, 90);
}

// Harsh like Nat 1, but never detuned — reads as final, not wrong.
function playFightLostSound() {
  playTone('sawtooth', 260, 140, 260, 0.13);
}

function playFightStartNormalSound() {
  playTone('triangle', 420, 420, 90, 0.08, 10);
}

function playFightStartEliteSound() {
  playTone('triangle', 520, 520, 50, 0.12, 5);
  setTimeout(function() { playTone('triangle', 620, 620, 50, 0.13, 5); }, 50);
}

function playFightStartBossSound() {
  playTone('sine', 110, 110, 320, 0.16, 60);
  playTone('sine', 165, 165, 320, 0.12, 60);
}

function playBossDefeatedSound() {
  playTone('sine', 500, 500, 100, 0.10);
  playTone('sine', 700, 700, 100, 0.18);
  setTimeout(function() { playTone('sine', 1050, 1050, 140, 0.20); }, 100);
  setTimeout(function() { playTone('sine', 1400, 1400, 180, 0.22); }, 220);
}

// A detuned pair with a slow fade-in — spooky, not a UI confirm tone.
function playDieActionLoadSound() {
  playTone('sine', 260, 220, 190, 0.11, 40);
  playTone('sine', 268, 226, 190, 0.09, 40);
}

// Load adds (eerie, detuned); Strengthen deepens (a single plain tone).
function playDieActionStrengthenSound() {
  playTone('sine', 220, 160, 120, 0.15);
}

function playCardRewardBasicSound() {
  playTone('sine', 440, 440, 60, 0.10, 6);
}

// A major third apart — a small chord against the basic sound's flat tone.
function playCardRewardRichSound() {
  playTone('sine', 560, 560, 100, 0.12, 8);
  playTone('sine', 700, 700, 100, 0.12, 8);
}

const SOUND_TABLE = {
  roll: playRollSound,
  die_rolling: playDieRollingSound,
  die_landing: playDieLandingSound,
  die_blank: playDieBlankSound,
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
  enemy_nat_20: playEnemyNat20Sound,
  enemy_nat_1: playEnemyNat1Sound,
  fight_won: playFightWonSound,
  fight_lost: playFightLostSound,
  fight_start_normal: playFightStartNormalSound,
  fight_start_elite: playFightStartEliteSound,
  fight_start_boss: playFightStartBossSound,
  boss_defeated: playBossDefeatedSound,
  die_action_load: playDieActionLoadSound,
  die_action_strengthen: playDieActionStrengthenSound,
  // D-119 — Remove reuses the sound Purify plays.
  die_action_remove: playDieActionStrengthenSound,
  card_reward_basic: playCardRewardBasicSound,
  card_reward_rich: playCardRewardRichSound
};

// The four roll sounds the dev drawer can mute on their own; mod_trigger
// is the trigger sound.
const ROLL_SOUND_EVENTS = ['die_rolling', 'die_landing', 'die_blank', 'mod_trigger'];
let rollSoundsMuted = false;

// Sounds announced while the player's die icon spins wait for its stop,
// as the pops do (D-107), so landing and triggers follow the rattle.
const heldAudioEvents = [];

function releaseHeldAudioEvents() {
  heldAudioEvents.splice(0).forEach(playAudioEvent);
}

function playAudioEvent(eventName) {
  const fn = SOUND_TABLE[eventName];
  if (!fn) return;
  if (rollSoundsMuted && ROLL_SOUND_EVENTS.indexOf(eventName) !== -1) return;
  if (eventName !== 'die_rolling' && dieRollHolding('player')) {
    heldAudioEvents.push(eventName);
    return;
  }
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
