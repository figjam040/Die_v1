// ============================================================
// TESTS/AUTOPLAY.JS — BUILD 105
// A headless autoplayer that plays complete runs with a fixed, documented
// policy and writes one line per run to tests/autoplay_results.csv. This is
// a measurement tool, same shape/status as tests/facts.test.js and
// tests/mods.test.js — not loaded by index.html, never ships, exists to
// observe how a reference player's runs actually go, not to define a floor
// or a ceiling for a human. Plain Node script (no test runner installed,
// only the raw `playwright` library), chromium launched directly. Run:
// node tests/autoplay.js
//
// LAW 3 (single state object, mutated only through the five helpers): the
// autoplayer never writes gameState.anything directly. Every action it
// takes calls the exact same functions the game's own buttons call —
// enterSlot(), chooseLane(), playCard(), nextPhase(), dieActionChooseLoad()/
// dieActionChooseStrengthen()/dieActionChooseSkip()/dieActionPickMod()/
// dieActionPickLoadFace()/dieActionPickStrengthenFace(), riteChooseHeal()/
// riteChooseDieAction(), cardRewardPickCard()/cardRewardSkip(), and the
// #startGameBtn click. See "FUNCTIONS CALLED" below for the exact list and
// where each is exercised. Never uses forcePlayerRoll()/forceEnemyRoll()/
// devJumpToSlot()/devLoadMod() or any other dev-only forcing tool — every
// roll in every run is the real weighted rollDie() draw, resolved through
// resolvePlayerRoll()/resolveEnemyRoll() exactly as autoAdvance() (the End
// Turn button's own chain) resolves it.
//
// nextPhase() note: nextPhase() is the actual phase-advance function the
// game itself runs on every turn — it is also exposed as the dev-only
// "Next Phase" button, but the function itself is core phase machinery, not
// a forcing tool: when called while sitting in ROLL_PHASE/ENEMY_ROLL_PHASE
// with no roll yet resolved, it draws the real weighted rollDie() face
// itself, the same call autoAdvance() makes after its own UX pause. The
// only thing this script skips is autoAdvance()'s ROLL_PHASE_PAUSE_MS
// (1800ms) human-reaction-time wait — a UI pacing delay, not game logic —
// which would make hundreds of runs take hours of real wall-clock time for
// no verification benefit. Driving the loop with nextPhase() directly reads
// off gameState.turn.phase/gameState.run.status after every call, exactly
// as autoAdvance()'s own continueAutoAdvance() does, so it stops at the
// same points (CARD_PHASE, a win, a loss) autoAdvance() would.
//
// FUNCTIONS CALLED (grep-confirmed against js/ — every one of these is a
// real, non-dev, non-forcing function; the exact list the "no dev jumps, no
// force roll, no dev-load" constraint permits):
//   #startGameBtn click (New Run)      — once per run
//   chooseLane('upper')                — once per run, at the fork
//   enterSlot(laneName, index)         — once per slot entered
//   nextPhase()                        — every phase transition, including
//                                         every natural (unforced) roll
//   playCard(handIndex)                — every card played
//   dieActionChooseLoad() / dieActionChooseStrengthen() / dieActionChooseSkip()
//   dieActionPickMod(modId)
//   dieActionPickLoadFace(faceNumber) / dieActionPickStrengthenFace(faceNumber)
//   riteChooseHeal() / riteChooseDieAction()
//   cardRewardPickCard(cardId) / cardRewardSkip()
//   healPlayer(5)                      — riteHeal=25 only, see POLICY below;
//                                         healPlayer() is the same sanctioned
//                                         pipeline function riteChooseHeal()
//                                         itself calls (pipeline.js), not a
//                                         direct gameState write
//
// MATH.RANDOM CALL SITES (grep-confirmed, all of js/ — every source of
// randomness in the game funnels through one of these three, all patched by
// the seeded PRNG below):
//   js/state.js:231     shuffle()            — Fisher-Yates, used by the
//                                               init/New-Run deck shuffle,
//                                               every fight-reset reshuffle,
//                                               and both the Load-mod-offer
//                                               and card-reward-offer draws
//   js/pipeline.js:122  rollDie()            — the weighted face pick used
//                                               by every player and enemy roll
//   js/phase-machine.js:106  runPhase()      — the enemy intent roll,
//                                               START_OF_TURN
// (js/state.js:79, js/rendering.js:901 and js/phase-machine.js:102 are
// historical comments mentioning Math.random, not live call sites.)
//
// SEEDING — page.addInitScript() installs a seeded PRNG (mulberry32) as the
// page's Math.random before any of the eleven js/ files execute, so the
// init-time deck shuffle and every roll for the entire page lifetime are
// reproducible from one seed. A fresh browser page (and a fresh
// addInitScript() call with that run's own seed) is used for every run —
// same pattern tests/facts.test.js's freshPage() already uses — so seed
// N always reproduces the identical sequence of rolls/shuffles regardless
// of what any other run did.
//
// POLICY — fixed and documented here, the one and only place it is defined.
// Never tuned per run; the two CLI parameters (dieRewardRule, riteHeal)
// switch between two small, named variants of it, nothing else.
//
//   MAP: always take the elite lane (chooseLane('upper') at the fork).
//
//   CARD PHASE, each round:
//     1. Block phase — play cards of type 'block' in hand (ward, vestment,
//        interdict — the game's own card.type field, not a second
//        classification), cheapest first (getCardCost() ascending, ties
//        broken by hand position), stopping as soon as
//        gameState.player.block >= gameState.enemy.intent, or when no
//        affordable block-type card remains in hand.
//     2. Points phase — play the remaining hand by points-per-soul,
//        descending, until gameState.player.soul reaches 0 or no
//        affordable card remains. A card's points = its damage + its block
//        + 5 per card it draws, evaluated at its live value this round
//        (conditionals — Purge/Interdict/Reckoning/Retribution/Covenant/
//        Rapture/Orison — count their currently-met branch; recomputed
//        fresh before every single pick, not once at the top of the round,
//        so a card played a moment earlier can change the next card's
//        points, e.g. Retribution after a block card). A 0-cost card's
//        ratio is treated as infinite (always played first among
//        affordable options); ties among 0-cost cards broken by points
//        descending, then hand position.
//     Both phases stop early if gameState.enemy.hp <= 0 (no point spending
//     further resources on an already-dead enemy — the game itself doesn't
//     prevent this, but a reference player has no reason to do it).
//
//   RITE: riteChooseHeal() if gameState.player.hp < 35, else
//     riteChooseDieAction() (always the asBuilt die-action policy below —
//     dieRewardRule's Skip clause applies only to a non-elite fight win, not
//     to a rite's own die action, per its own definition below).
//     riteHeal=25 additionally calls healPlayer(5) once, immediately after
//     riteChooseHeal()'s own heal, for a 25-total heal without editing
//     GAME_CONFIG.RITE_HEAL (20).
//
//   DIE ACTION (after a fight win, and after riteChooseDieAction()):
//     dieRewardRule=elitesAndRitesOnly forces dieActionChooseSkip() whenever
//     the reward is for a non-elite fight win (dieActionOrigin==='reward'
//     and the won slot's label isn't 'Elite'); every other case (an elite
//     win's one or two actions, and every rite's action) always uses the
//     policy below, under both dieRewardRule values.
//     Load if any face has modId === null; else Strengthen face 20.
//     Load's mod choice, in priority order: Virulence (only if Blight is
//     currently loaded on the die), else Blight, Smite, Sanctuary, Zeal,
//     Ordain, Offering, Fervour, Penance, Vigil — the first of these ten
//     that appears in the 3-mod offer is picked (the ten cover every
//     reward-eligible mod, so exactly one of the offer always matches).
//     Loaded onto the highest-numbered currently-blank face.
//
//   CARD REWARD: pick the offered card with the highest points-per-soul (by
//     the identical points formula above, live gameState at reward time,
//     0-cost treated as infinite exactly as in the points phase); skip
//     (cardRewardSkip()) if every offered option's ratio is below 5.
//
// GUARDS:
//   - every fight is capped at 60 rounds; hitting the cap throws (reported
//     as a bug, per the prompt, not silently recorded as an outcome).
//   - any browser console error or page error fails the whole batch.
//   - any '[CARD] cannot play' / '[CARD] not enough soul' log line (the
//     game's own "this card could not legally be played" messages) fails
//     the batch — the policy above is built to only ever attempt a legal,
//     affordable play, so this should never fire; it exists as a guard on
//     that claim, not routine handling.
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const CSV_PATH = path.resolve(__dirname, 'autoplay_results.csv');
const ROUND_CAP = 60;

// BUILD 127: act_reached appended (not inserted — every existing column
// keeps its own position) — the highest act number a run actually played a
// fight in (1..GAME_CONFIG.ACTS), now that a run plays all of them, not
// just one. Rows written before this build predate acts entirely and get a
// blank here (never a guessed value — see the one-time migration in this
// build's own paste-back), read back by a spreadsheet or Node's CSV split
// as an empty string.
const CSV_HEADER = 'build,dieRewardRule,riteHeal,seed,lane,facesAtBoss,faceListAtBoss,arrivalHp,outcome,finalRound,bossHpAtEnd,playerHpAtEnd,playerStacksAtEnd,natOnesRolled,natTwentiesRolled,actReached';

// BUILD 123 (checkpoint 1, OQ-13): the twelve loadable mods, in Load
// priority order, derived directly from Fergus's own rank pick order on
// 1 State §6 (Fervour 1 through Vigil 12; Consecrate is the anchor, never
// offered, and carries no rank). Replaces the BUILD 105 hand-tuned list,
// which covered only nine mods (missing Virulence, Anthem and Elevation
// entirely — Anthem and Elevation were built at 113/114 and never added)
// and special-cased Virulence on Blight already being loaded; that
// heuristic is gone, since a flat rank order is now the whole policy —
// nothing left to decide, per 8 North star's own framing of this
// checkpoint.
// Checkpoint 3 tags/mods build: the six new mods (Largesse, Tithe,
// Congregation, Cope, Anathema, Thurible) are appended at the end, unranked
// among themselves relative to Fergus's original 1-12 order above — no rank
// pick exists for them yet, so they sit after every originally-ranked mod
// rather than being inserted into that order. assertEveryLoadableModIsRanked()
// below only requires every loadable mod appear exactly once, not in any
// particular position, so this satisfies it without guessing a rank.
const LOAD_PRIORITY = ['fervour', 'sanctuary', 'virulence', 'smite', 'blight', 'elevation', 'zeal', 'offering', 'anthem', 'ordain', 'penance', 'vigil', 'largesse', 'tithe', 'congregation', 'cope', 'anathema', 'thurible', 'magnificat', 'unison', 'accord', 'kinship', 'concord', 'herald'];

function ensureCsvHeader() {
  if (!fs.existsSync(CSV_PATH)) {
    fs.writeFileSync(CSV_PATH, CSV_HEADER + '\n');
  }
}

function appendCsvRow(row) {
  const line = [
    row.build, row.dieRewardRule, row.riteHeal, row.seed, row.lane,
    row.facesAtBoss, row.faceListAtBoss, row.arrivalHp, row.outcome,
    row.finalRound, row.bossHpAtEnd, row.playerHpAtEnd, row.playerStacksAtEnd,
    row.natOnesRolled, row.natTwentiesRolled, row.actReached
  ].join(',');
  fs.appendFileSync(CSV_PATH, line + '\n');
  return line;
}

// ---------------------------------------------------------------
// Seeded PRNG install — mulberry32, installed as the page's own
// Math.random before any js/ file executes. Deterministic given the
// same seed.
// ---------------------------------------------------------------
function installSeededRandom(seed) {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  function mulberry32() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Math.random = mulberry32;
}

// ---------------------------------------------------------------
// One page per run. Errors/console errors collected live; checked after
// (and during, for the round cap) driving.
// ---------------------------------------------------------------
async function freshPage(browser, seed) {
  const page = await browser.newPage();
  const errors = [];
  page.on('dialog', function(d) { d.accept(); });
  page.on('pageerror', function(err) { errors.push('pageerror: ' + err.message); });
  page.on('console', function(msg) { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });
  await page.addInitScript(installSeededRandom, seed);
  await page.goto(FILE_URL);
  await page.waitForFunction(function() { return typeof gameState !== 'undefined' && gameState.run.screen === 'map'; });
  // Every fight normally starts by calling autoAdvance() once (see
  // startFreshTurnPaused(), phase-machine.js), which arms a real 1800ms
  // setTimeout (ROLL_PHASE_PAUSE_MS — a human-reaction-time UX pause, not
  // game logic) before resolving that fight's first roll. Left alone, this
  // stray timer can still be pending when this script's own much-faster
  // nextPhase()-driven loop has already moved several rounds further into
  // the same fight and happens to be sitting in a LATER round's ROLL_PHASE
  // when the timer fires — the timer's own phase==='ROLL_PHASE' guard can't
  // tell "this fight's first roll" from "this fight's fifth round's roll",
  // so it would resolve that later roll itself, racing this script's own
  // upcoming nextPhase() call and corrupting the phase sequence. Checking
  // this existing dev checkbox (the real, documented way to skip the
  // auto-roll-after-fight-start convenience — CLAUDE.md's DEV MODE/BUILD
  // 083 note) makes every fight start paused at START_OF_TURN instead, so
  // autoAdvance() and its timer are never armed at all — every phase step,
  // for every round of every fight, is driven by this script's own
  // nextPhase() calls alone, with nothing else able to touch the phase
  // machine concurrently.
  await page.evaluate(function() {
    const cb = document.getElementById('devPauseBeforeRollCheckbox');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });
  page.__errors = errors;
  return page;
}

function checkNoErrors(page) {
  if (page.__errors.length > 0) {
    throw new Error('browser error(s) during run: ' + page.__errors.join(' | '));
  }
}

async function checkNoIllegalPlays(page) {
  const bad = await page.evaluate(function() {
    return Array.from(document.querySelectorAll('#log div')).some(function(d) {
      return d.textContent.indexOf('[CARD] cannot play') === 0 || d.textContent.indexOf('[CARD] not enough soul') === 0;
    });
  });
  if (bad) throw new Error('an illegal card play was logged — policy must only make legal plays');
}

// BUILD 127: both guard checks in one call — was playRun()'s own local
// closure over its page variable; pulled out standalone (checkNoErrors/
// checkNoIllegalPlays already take page as an argument, not a closure) so
// playOneAct() below can reuse it without playRun() handing it down itself.
async function checkGuards(page) {
  checkNoErrors(page);
  await checkNoIllegalPlays(page);
}

// ---------------------------------------------------------------
// nextPhase() driver — advances exactly one phase (resolving a natural
// roll along the way if that phase is a roll phase), then reports where
// the game landed. Used for both "reach CARD_PHASE" and "leave CARD_PHASE
// and reach the next CARD_PHASE, or the fight's end".
// ---------------------------------------------------------------
async function stepPhase(page) {
  return page.evaluate(function() {
    nextPhase();
    return { phase: gameState.turn.phase, fightStatus: gameState.run.status, runOutcome: gameState.run.outcome, round: gameState.turn.round, rollOutcome: gameState.turn.rollOutcome };
  });
}

// Drives phases (never forcing a roll) until either CARD_PHASE is reached
// or the fight resolves (run.status leaves 'active'). Returns
// { reachedCardPhase, natOne, natTwenty }.
async function driveToCardPhaseOrFightEnd(page, natCounts) {
  for (let i = 0; i < 10; i++) {
    const r = await stepPhase(page);
    if (r.round > ROUND_CAP) {
      throw new Error('ROUND_CAP_EXCEEDED: fight exceeded ' + ROUND_CAP + ' rounds — likely a stuck phase loop');
    }
    if (r.fightStatus !== 'active') {
      return { reachedCardPhase: false };
    }
    if (r.phase === 'CARD_PHASE') {
      if (r.rollOutcome === 'nat_one') natCounts.one += 1;
      if (r.rollOutcome === 'nat_twenty') natCounts.twenty += 1;
      return { reachedCardPhase: true };
    }
  }
  throw new Error('did not reach CARD_PHASE or a fight resolution within 10 phase steps — likely a stuck phase loop');
}

// ---------------------------------------------------------------
// CARD_PHASE policy — block phase then points phase, both driven from
// live gameState re-read fresh before every single pick.
// ---------------------------------------------------------------
async function playCardPhase(page) {
  await page.evaluate(function() {
    // Points formula — mirrors each card's own effect() calculation
    // exactly, read-only, never invoking the card's actual effect.
    function cardPoints(cardId) {
      const s = gameState;
      switch (cardId) {
        case 'strike': return 5;
        case 'ward': return 5;
        case 'rite': return 5 + 6;
        case 'rebuke': return 4;
        case 'censure': return 14;
        case 'judgement': return 20;
        case 'vestment': return 13;
        case 'litany': return 7 + 7;
        case 'scripture': return 5 * 2;
        case 'communion': return 0;
        case 'censer': return 0;
        case 'purge': return s.enemy.poisonStacks > 0 ? 10 : 6;
        case 'interdict': return s.enemy.intent >= 12 ? 10 : 5;
        case 'reckoning': return 3 + (2 * s.enemy.poisonStacks);
        case 'retribution': return s.player.block > 12 ? 12 : s.player.block;
        case 'covenant': return 2 + (3 * (s.turn.rolledFaceWeight || 0));
        case 'rapture': return 12;
        case 'orison': return s.turn.rollOutcome === 'blank' ? 9 : 5;
        default: return 0;
      }
    }

    function ratioOf(cardId) {
      const card = getCard(cardId);
      const cost = getCardCost(card);
      const points = cardPoints(cardId);
      const ratio = cost === 0 ? Infinity : points / cost;
      return { cost: cost, points: points, ratio: ratio };
    }

    function affordableIndices(predicate) {
      return gameState.player.hand
        .map(function(cardId, idx) { return { cardId: cardId, idx: idx }; })
        .filter(function(e) { return predicate(e.cardId); })
        .map(function(e) {
          const r = ratioOf(e.cardId);
          return Object.assign({}, e, r);
        })
        .filter(function(e) { return e.cost <= gameState.player.soul; });
    }

    // ---- Block phase: cheapest affordable block-type card first, until
    // block covers enemy intent. ----
    while (gameState.enemy.hp > 0 && gameState.player.block < gameState.enemy.intent) {
      const candidates = affordableIndices(function(cardId) { return getCard(cardId).type === 'block'; });
      if (candidates.length === 0) break;
      candidates.sort(function(a, b) { return (a.cost - b.cost) || (a.idx - b.idx); });
      playCard(candidates[0].idx);
    }

    // ---- Points phase: highest points-per-soul first, 0-cost cards
    // ranked as infinite ratio, until soul is spent or nothing affordable
    // remains. ----
    while (gameState.enemy.hp > 0 && gameState.player.soul > 0) {
      const candidates = affordableIndices(function() { return true; });
      if (candidates.length === 0) break;
      candidates.sort(function(a, b) {
        if (a.ratio !== b.ratio) return b.ratio - a.ratio;
        if (a.points !== b.points) return b.points - a.points;
        return a.idx - b.idx;
      });
      playCard(candidates[0].idx);
    }
  });
}

// ---------------------------------------------------------------
// Die action policy (Load if a blank exists, else Strengthen face 20; pick
// the highest-ranked offered mod off LOAD_PRIORITY — BUILD 123).
// ---------------------------------------------------------------
async function resolveDieAction(page, skip) {
  if (skip) {
    await page.evaluate(function() { dieActionChooseSkip(); });
    return;
  }
  const hasBlank = await page.evaluate(function() { return gameState.die.faces.some(function(f) { return f.modId === null; }); });
  // BUILD 127: the real Load button itself is now hidden at the 'choose'
  // step once fewer than three unloaded mods remain (D-54, BUILD 126's
  // fix, revised to hide rather than redirect) — a real scenario once the
  // bot plays all three acts of Load offers instead of just one, where it
  // never came up before. Mirrors the same eligibleLoadModIds() count the
  // real UI gates the button's existence on, so this policy only ever
  // calls dieActionChooseLoad() when a human would actually see a Load
  // button to click.
  const eligibleCount = await page.evaluate(function() { return eligibleLoadModIds().length; });
  if (hasBlank && eligibleCount >= 3) {
    await page.evaluate(function() { dieActionChooseLoad(); });
    const modId = await page.evaluate(function(priority) {
      for (let i = 0; i < priority.length; i++) {
        if (dieActionMods.indexOf(priority[i]) !== -1) return priority[i];
      }
      return dieActionMods[0]; // unreachable given LOAD_PRIORITY covers all twelve, kept as a safety fallback
    }, LOAD_PRIORITY);
    await page.evaluate(function(id) { dieActionPickMod(id); }, modId);
    const faceNumber = await page.evaluate(function() {
      let highest = null;
      gameState.die.faces.forEach(function(f) { if (f.modId === null) highest = f.number; });
      return highest;
    });
    await page.evaluate(function(n) { dieActionPickLoadFace(n); }, faceNumber);
  } else {
    await page.evaluate(function() { dieActionChooseStrengthen(); });
    await page.evaluate(function() { dieActionPickStrengthenFace(20); });
  }
}

// ---------------------------------------------------------------
// Card reward policy.
// ---------------------------------------------------------------
async function resolveCardReward(page) {
  const best = await page.evaluate(function() {
    function cardPoints(cardId) {
      const s = gameState;
      switch (cardId) {
        case 'rebuke': return 4;
        case 'censure': return 14;
        case 'judgement': return 20;
        case 'vestment': return 13;
        case 'litany': return 7 + 7;
        case 'scripture': return 5 * 2;
        case 'communion': return 0;
        case 'censer': return 0;
        case 'purge': return s.enemy.poisonStacks > 0 ? 10 : 6;
        case 'interdict': return s.enemy.intent >= 12 ? 10 : 5;
        case 'reckoning': return 3 + (2 * s.enemy.poisonStacks);
        case 'retribution': return s.player.block > 12 ? 12 : s.player.block;
        case 'covenant': return 2 + (3 * (s.turn.rolledFaceWeight || 0));
        case 'rapture': return 12;
        case 'orison': return s.turn.rollOutcome === 'blank' ? 9 : 5;
        default: return 0;
      }
    }
    const scored = cardRewardOptions.map(function(cardId) {
      const card = getCard(cardId);
      const cost = getCardCost(card);
      const points = cardPoints(cardId);
      const ratio = cost === 0 ? Infinity : points / cost;
      return { cardId: cardId, ratio: ratio };
    });
    scored.sort(function(a, b) { return b.ratio - a.ratio; });
    return scored[0];
  });
  if (best.ratio < 5) {
    await page.evaluate(function() { cardRewardSkip(); });
  } else {
    await page.evaluate(function(id) { cardRewardPickCard(id); }, best.cardId);
  }
}

// ---------------------------------------------------------------
// Plays one fight to its conclusion (win or loss). Returns
// { won, natOnes, natTwenties }.
// ---------------------------------------------------------------
async function playFight(page) {
  const natCounts = { one: 0, twenty: 0 };
  // beginFightFromSlot() (already run by whichever enterSlot() call started
  // this fight) always leaves the game sitting in ROLL_PHASE — the same
  // driveToCardPhaseOrFightEnd() loop reaches CARD_PHASE for round 1 as for
  // every later round.
  for (;;) {
    const result = await driveToCardPhaseOrFightEnd(page, natCounts);
    if (!result.reachedCardPhase) break;
    await playCardPhase(page);
    checkNoErrors(page);
  }
  const status = await page.evaluate(function() { return gameState.run.status; });
  return { won: status === 'win', natOnes: natCounts.one, natTwenties: natCounts.twenty };
}

// Post-win reward flow for a fight (not a rite). skipDieAction applies the
// dieRewardRule=elitesAndRitesOnly Skip clause for non-elite wins.
async function resolveFightWinRewards(page, skipDieAction) {
  for (;;) {
    const step = await page.evaluate(function() { return dieActionStep; });
    if (step === null) break;
    await resolveDieAction(page, skipDieAction);
  }
  const rewardStep = await page.evaluate(function() { return cardRewardStep; });
  if (rewardStep !== null) {
    await resolveCardReward(page);
  }
}

async function resolveRite(page, riteHeal) {
  const hp = await page.evaluate(function() { return gameState.player.hp; });
  if (hp < 35) {
    await page.evaluate(function() { riteChooseHeal(); });
    if (riteHeal === 25) {
      await page.evaluate(function() { healPlayer(5); });
    }
  } else {
    await page.evaluate(function() { riteChooseDieAction(); });
    for (;;) {
      const step = await page.evaluate(function() { return dieActionStep; });
      if (step === null) break;
      await resolveDieAction(page, false); // rites always use the asBuilt policy
    }
  }
}

// ---------------------------------------------------------------
// BUILD 127: plays exactly one act, from its own opening fight (assumes
// gameState.run.currentSlot is already 'opening' for this act — true for
// act 1 at run start, and true for act 2/3 the instant advanceRun()'s own
// act-transition branch resets it there) through its own boss, always the
// elite (upper) lane — same policy playRun() always used, now applied once
// per act rather than once per run. A boss win's reward flow
// (resolveFightWinRewards()) is always called after a boss fight is won,
// unconditionally: on a non-final act's boss this grants the real die+card
// reward (F32); on the final act's boss it is a no-op (dieActionStep/
// cardRewardStep are both null there — D-22, no reward), so this function
// itself needs no idea which act number it's playing to behave correctly
// either way. Returns null-filled fields exactly as playRun() always did
// when a stage is never reached (facesAtBoss/arrivalHp/etc. stay 'NA').
// ---------------------------------------------------------------
async function playOneAct(page, dieRewardRule, riteHeal) {
  let natOnesRolled = 0;
  let natTwentiesRolled = 0;
  let arrivalHp = 'NA';
  let facesAtBoss = 'NA';
  let faceListAtBoss = 'NA';
  let bossHpAtEnd = 'NA';
  let finalRound = 'NA';
  let bossReached = false;
  let bossWon = false;
  // BUILD (checkpoint 3 map): every completed fight's own round count, in
  // play order (opening, then each lane fight, then the boss if reached) —
  // not just the last one. Read off gameState.turn.round the same way
  // finalRound already was; this just keeps every value instead of
  // overwriting. Lets runBatch() report a true mean rounds-per-fight
  // instead of only the run's last fight.
  const fightRoundCounts = [];

  await page.evaluate(function() { enterSlot('opening', null); });
  let res = await playFight(page);
  natOnesRolled += res.natOnes; natTwentiesRolled += res.natTwenties;
  await checkGuards(page);
  finalRound = await page.evaluate(function() { return gameState.turn.round; });
  fightRoundCounts.push(finalRound);

  if (res.won) {
    await resolveFightWinRewards(page, dieRewardRule === 'elitesAndRitesOnly');
    await checkGuards(page);

    await page.evaluate(function() { chooseLane('upper'); enterSlot('upper', 0); });

    // BUILD (checkpoint 3 map): the lane's own shape (fight/rite/elite, and
    // how many slots) is read live off gameState.run.act.upper instead of a
    // hardcoded 5-slot laneSlots array — this is what lets the identical
    // bot code play both the pre-checkpoint-3 five-slot lane and the new
    // eight-slot lane with no policy change, per LAW 3 (real function calls
    // only, no dev jumps): slot 0 is already entered above (the fork click
    // does that), every later index is entered here in order.
    const laneLength = await page.evaluate(function() { return gameState.run.act.upper.length; });

    let allWon = true;
    for (let idx = 0; idx < laneLength; idx++) {
      if (idx > 0) {
        await page.evaluate(function(i) { enterSlot('upper', i); }, idx);
      }
      const slotInfo = await page.evaluate(function(i) {
        const s = gameState.run.act.upper[i];
        return { type: s.type, label: s.label };
      }, idx);

      if (slotInfo.type === 'fight') {
        res = await playFight(page);
        natOnesRolled += res.natOnes; natTwentiesRolled += res.natTwenties;
        await checkGuards(page);
        finalRound = await page.evaluate(function() { return gameState.turn.round; });
        fightRoundCounts.push(finalRound);
        if (!res.won) { allWon = false; break; }
        const skipThis = dieRewardRule === 'elitesAndRitesOnly' && slotInfo.label !== 'Elite';
        await resolveFightWinRewards(page, skipThis);
        await checkGuards(page);
      } else {
        await resolveRite(page, riteHeal);
        await checkGuards(page);
      }
    }

    if (allWon) {
      await page.evaluate(function() { enterSlot('boss', null); });
      const arrival = await page.evaluate(function() {
        return {
          hp: gameState.player.hp,
          faces: gameState.die.faces.filter(function(f) { return f.modId !== null && f.modId !== 'NAT_ONE' && f.modId !== 'NAT_TWENTY'; })
            .map(function(f) { return f.number + ':' + f.modId; })
        };
      });
      arrivalHp = arrival.hp;
      facesAtBoss = arrival.faces.length;
      faceListAtBoss = arrival.faces.length ? arrival.faces.join(';') : '(none)';
      bossReached = true;

      res = await playFight(page);
      natOnesRolled += res.natOnes; natTwentiesRolled += res.natTwenties;
      await checkGuards(page);
      bossWon = res.won;
      finalRound = await page.evaluate(function() { return gameState.turn.round; });
      fightRoundCounts.push(finalRound);
      bossHpAtEnd = await page.evaluate(function() { return gameState.enemy.hp; });

      if (bossWon) {
        const skipThis = dieRewardRule === 'elitesAndRitesOnly';
        await resolveFightWinRewards(page, skipThis);
        await checkGuards(page);
      }
    }
  }

  const lane = await page.evaluate(function() { return gameState.run.lane; });
  return {
    bossReached: bossReached, bossWon: bossWon, natOnesRolled: natOnesRolled, natTwentiesRolled: natTwentiesRolled,
    arrivalHp: arrivalHp, facesAtBoss: facesAtBoss, faceListAtBoss: faceListAtBoss,
    finalRound: finalRound, bossHpAtEnd: bossHpAtEnd, lane: lane === null ? 'NA' : lane,
    fightRoundCounts: fightRoundCounts
  };
}

// ---------------------------------------------------------------
// One full run — now all GAME_CONFIG.ACTS acts (F31/F32, checkpoint 2),
// not just one. Always the elite lane (upper), every act. Returns one CSV
// row object; actReached (BUILD 127, new CSV column) is the highest act
// number this run actually played a fight in, 1..ACTS regardless of
// outcome — 3 on a true victory, whichever act's own loss ended the run
// otherwise. facesAtBoss/faceListAtBoss/arrivalHp/bossHpAtEnd stay the
// LAST boss this run fought (win or loss), the same "this run's own boss
// fight" meaning those columns always had when there was only one boss to
// mean it about; facesAtBossByAct (not a CSV column — collected only for
// this build's own baseline report, per-act medians) carries every act's
// own boss face count the run actually reached.
// ---------------------------------------------------------------
async function playRun(browser, seed, dieRewardRule, riteHeal) {
  let row = null;
  const page = await freshPage(browser, seed);
  let natOnesRolled = 0;
  let natTwentiesRolled = 0;
  let arrivalHp = 'NA';
  let facesAtBoss = 'NA';
  let faceListAtBoss = 'NA';
  let outcome = 'lost';
  let finalRound = 'NA';
  let bossHpAtEnd = 'NA';
  let lane = 'NA';
  let actReached = 1;
  const facesAtBossByAct = {};
  // BUILD (checkpoint 3 map): per-act boss arrival HP and every fight's own
  // round count, for this run — same "not a CSV column, read only by
  // runBatch()'s own summary" status as facesAtBossByAct above.
  const arrivalHpByAct = {};
  const allFightRoundCounts = [];

  try {
    await page.click('#startGameBtn');
    // BUILD 119: tag this run's record as bot-sourced. startNewRun()'s
    // synchronous click handler has already called resetRunRecord() (which
    // hardcodes source: 'human') by the time page.click() resolves, so this
    // runs strictly after that reset and correctly overwrites it. Pure
    // plumbing — CLAUDE.md's RUN RECORD section already documented 'source'
    // as a hook for "a future headless writer" to mark its own lines 'bot';
    // this is that hook, not a policy or decision change. No other line in
    // this file changes: resolveDieAction() and LOAD_PRIORITY are untouched.
    await page.evaluate(function() { updateRunRecord({ source: 'bot' }); });
    await page.waitForFunction(function() { return gameState.run.act !== null; });

    const totalActs = await page.evaluate(function() { return GAME_CONFIG.ACTS; });

    for (let act = 1; act <= totalActs; act++) {
      actReached = act;
      const actResult = await playOneAct(page, dieRewardRule, riteHeal);
      natOnesRolled += actResult.natOnesRolled;
      natTwentiesRolled += actResult.natTwentiesRolled;
      lane = actResult.lane;
      finalRound = actResult.finalRound;
      allFightRoundCounts.push.apply(allFightRoundCounts, actResult.fightRoundCounts);

      if (!actResult.bossReached) {
        outcome = 'lost';
        break;
      }

      arrivalHp = actResult.arrivalHp;
      facesAtBoss = actResult.facesAtBoss;
      faceListAtBoss = actResult.faceListAtBoss;
      bossHpAtEnd = actResult.bossHpAtEnd;
      facesAtBossByAct[act] = actResult.facesAtBoss;
      arrivalHpByAct[act] = actResult.arrivalHp;

      if (!actResult.bossWon) {
        outcome = 'lost';
        break;
      }

      // Boss won. Final act ends the run in victory (D-22); every earlier
      // act's reward flow already resolved inside playOneAct() itself —
      // looping to act+1 finds gameState.run.currentSlot already reset to
      // 'opening' by advanceRun()'s own act-transition branch.
      if (act >= totalActs) {
        outcome = 'won';
      }
    }

    const playerHpAtEnd = await page.evaluate(function() { return gameState.player.hp; });
    const playerStacksAtEnd = await page.evaluate(function() { return gameState.player.poisonStacks; });
    const gameConfigBuild = await page.evaluate(function() { return GAME_CONFIG.BUILD; });

    row = {
      build: gameConfigBuild, dieRewardRule: dieRewardRule, riteHeal: riteHeal, seed: seed,
      lane: lane, facesAtBoss: facesAtBoss, faceListAtBoss: faceListAtBoss,
      arrivalHp: arrivalHp, outcome: outcome, finalRound: finalRound,
      bossHpAtEnd: bossHpAtEnd, playerHpAtEnd: playerHpAtEnd, playerStacksAtEnd: playerStacksAtEnd,
      natOnesRolled: natOnesRolled, natTwentiesRolled: natTwentiesRolled, actReached: actReached
    };
    // Non-CSV field — read by runBatch()'s summary only, for the per-act
    // median-loaded-faces-at-boss report this build's own prompt asks for;
    // appendCsvRow() only ever writes the named columns above, so this is
    // silently ignored there, not a hidden extra CSV column.
    row.facesAtBossByAct = facesAtBossByAct;
    row.arrivalHpByAct = arrivalHpByAct;
    row.fightRoundCounts = allFightRoundCounts;

    // BUILD 119 plumbing: browser.newPage() (freshPage(), above) opens each
    // run in its own isolated browser context, so this run's localStorage
    // never carries over to the next page/run — a batch driver reading
    // localStorage only after the whole batch finishes would find nothing.
    // Capture this run's own flushed run-record line(s) here, while its
    // page is still open, and hand them back on the row for the caller to
    // accumulate. Pure extraction — reads state flushRunRecord() (a real,
    // unmodified production function) already wrote; no decision code.
    row.runRecordLines = await page.evaluate(function() {
      try { return JSON.parse(localStorage.getItem('dieRunRecordLines') || '[]'); }
      catch (e) { return []; }
    });
  } finally {
    await page.close();
  }
  return row;
}

// ---------------------------------------------------------------
// Batch driver + summary.
// ---------------------------------------------------------------
function median(nums) {
  if (nums.length === 0) return 'NA';
  const sorted = nums.slice().sort(function(a, b) { return a - b; });
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(nums) {
  if (nums.length === 0) return 'NA';
  return nums.reduce(function(a, b) { return a + b; }, 0) / nums.length;
}

async function runBatch(browser, dieRewardRule, riteHeal, seeds) {
  const rows = [];
  for (let i = 0; i < seeds.length; i++) {
    const row = await playRun(browser, seeds[i], dieRewardRule, riteHeal);
    appendCsvRow(row);
    rows.push(row);
  }
  const wins = rows.filter(function(r) { return r.outcome === 'won'; }).length;
  const arrivalHps = rows.map(function(r) { return r.arrivalHp; }).filter(function(v) { return typeof v === 'number'; });
  const facesAtBossVals = rows.map(function(r) { return r.facesAtBoss; }).filter(function(v) { return typeof v === 'number'; });
  const finalRounds = rows.map(function(r) { return r.finalRound; }).filter(function(v) { return typeof v === 'number'; });

  // BUILD 127: how many runs reached each act, and that act's own median
  // loaded-faces-at-boss — read off row.actReached (a real CSV column) and
  // row.facesAtBossByAct (collected per run, not itself a CSV column; see
  // playRun()). "Reached" an act means it fought that act's own boss and
  // the arrival face count was actually captured — a run that lost before
  // its own boss (actReached still names that act) contributes no
  // facesAtBoss value for it, matching facesAtBossVals' own "only where
  // a boss was actually reached" filter above.
  // BUILD (checkpoint 3 map): acts 1..the highest actReached any row in this
  // batch names (always GAME_CONFIG.ACTS wide runs permitting) rather than
  // only acts a boss was actually reached for — so a boss nobody reached
  // still gets its own zero-run row instead of silently vanishing from the
  // table.
  const highestAct = rows.reduce(function(m, r) { return Math.max(m, r.actReached); }, 1);
  const actNumbers = [];
  for (let a = 1; a <= highestAct; a++) actNumbers.push(a);
  const perAct = {};
  actNumbers.forEach(function(act) {
    const reachedCount = rows.filter(function(r) { return r.actReached >= act; }).length;
    const facesAtThatBoss = rows.map(function(r) { return r.facesAtBossByAct[act]; }).filter(function(v) { return typeof v === 'number'; });
    const arrivalHpAtThatBoss = rows.map(function(r) { return r.arrivalHpByAct[act]; }).filter(function(v) { return typeof v === 'number'; });
    perAct[act] = {
      runsReachingBoss: facesAtThatBoss.length, medianFacesAtBoss: median(facesAtThatBoss), runsReachingAct: reachedCount,
      meanArrivalHp: mean(arrivalHpAtThatBoss)
    };
  });

  // BUILD (checkpoint 3 map): mean rounds per fight across every fight
  // actually played in the batch (row.fightRoundCounts, set by playRun() —
  // every completed fight's own round count, not just each run's last one).
  const allFightRounds = [];
  rows.forEach(function(r) { allFightRounds.push.apply(allFightRounds, r.fightRoundCounts || []); });

  return {
    dieRewardRule: dieRewardRule, riteHeal: riteHeal,
    runs: rows.length,
    winRate: (wins / rows.length),
    medianArrivalHp: median(arrivalHps),
    medianFacesAtBoss: median(facesAtBossVals),
    medianFinalRound: median(finalRounds),
    meanRoundsPerFight: mean(allFightRounds),
    fightsPlayed: allFightRounds.length,
    perAct: perAct
  };
}

function printSummary(s) {
  console.log(
    'dieRewardRule=' + s.dieRewardRule + ' riteHeal=' + s.riteHeal +
    ' | runs=' + s.runs +
    ' | win rate=' + (s.winRate * 100).toFixed(1) + '%' +
    ' | median arrival HP=' + s.medianArrivalHp +
    ' | median faces at boss=' + s.medianFacesAtBoss +
    ' | median final round=' + s.medianFinalRound +
    ' | mean rounds/fight=' + (typeof s.meanRoundsPerFight === 'number' ? s.meanRoundsPerFight.toFixed(2) : s.meanRoundsPerFight) +
    ' (' + s.fightsPlayed + ' fights)'
  );
  if (s.perAct) {
    Object.keys(s.perAct).sort().forEach(function(act) {
      const p = s.perAct[act];
      console.log('  act ' + act + ': ' + p.runsReachingAct + ' run(s) reached it, ' + p.runsReachingBoss + ' reached its boss, median loaded faces at that boss=' + p.medianFacesAtBoss +
        ', mean HP entering that boss=' + (typeof p.meanArrivalHp === 'number' ? p.meanArrivalHp.toFixed(1) : p.meanArrivalHp));
    });
  }
}

// ---------------------------------------------------------------
// CLI
// ---------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  argv.forEach(function(a) {
    const m = a.match(/^--([a-zA-Z]+)=(.+)$/);
    if (m) out[m[1]] = m[2];
  });
  return out;
}

// BUILD 119: exported so a separate measurement script can reuse these
// exact, unmodified functions (playRun/runBatch/etc.) inside its own
// browser session — needed only to extract the run-record lines those
// runs produce (localStorage, per-page, gone once the CLI's browser
// closes) for the D-40 CSV. Guarding the CLI body behind require.main
// means `node tests/autoplay.js` behaves exactly as before; nothing
// about how a run is played changes.
// BUILD 123 (checkpoint 1, OQ-13): "every loadable mod is ranked" — asserts
// LOAD_PRIORITY is exactly the live game's set of loadable mods (every real
// entry in gameState.config.mods except the anchor, 'consecrate'), no more,
// no fewer, no duplicates. Reads config.mods off a real page rather than a
// second hand-typed id list, so a mod added later without updating
// LOAD_PRIORITY fails this immediately instead of silently never being the
// bot's top pick (the exact BUILD 105 gap this checkpoint closes — Anthem
// and Elevation were built at 113/114 and never added).
async function assertEveryLoadableModIsRanked(browser) {
  const page = await browser.newPage();
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined');
  const loadableModIds = await page.evaluate(function() {
    return Object.keys(gameState.config.mods).filter(function(id) { return id !== 'consecrate'; }).sort();
  });
  await page.close();
  assert.strictEqual(LOAD_PRIORITY.length, new Set(LOAD_PRIORITY).size, 'LOAD_PRIORITY must not contain duplicates: ' + JSON.stringify(LOAD_PRIORITY));
  assert.deepStrictEqual(LOAD_PRIORITY.slice().sort(), loadableModIds, 'LOAD_PRIORITY must rank exactly the loadable mods (every real mod except the anchor, consecrate) — found ' + loadableModIds.length + ' loadable mods, LOAD_PRIORITY has ' + LOAD_PRIORITY.length);
  console.log('PASS — every loadable mod is ranked (' + loadableModIds.length + '/' + loadableModIds.length + ')');
}

module.exports = { playRun, runBatch, appendCsvRow, ensureCsvHeader, CSV_HEADER, CSV_PATH, median, LOAD_PRIORITY, assertEveryLoadableModIsRanked };

if (require.main === module) {
(async () => {
  ensureCsvHeader();
  const args = parseArgs(process.argv.slice(2));
  const browser = await chromium.launch();

  try {
    await assertEveryLoadableModIsRanked(browser);
    if (args.seed || args.dieRewardRule || args.riteHeal || args.runs) {
      // Ad hoc invocation.
      const dieRewardRule = args.dieRewardRule || 'asBuilt';
      const riteHeal = parseInt(args.riteHeal || '20', 10);
      if (args.runs) {
        const runs = parseInt(args.runs, 10);
        const seedStart = parseInt(args.seed || '1', 10);
        const seeds = [];
        for (let i = 0; i < runs; i++) seeds.push(seedStart + i);
        const summary = await runBatch(browser, dieRewardRule, riteHeal, seeds);
        printSummary(summary);
      } else {
        const seed = parseInt(args.seed || '42', 10);
        const row = await playRun(browser, seed, dieRewardRule, riteHeal);
        const line = appendCsvRow(row);
        console.log(line);
      }
      return;
    }

    // Default: full BUILD 105 verification protocol.
    console.log('CSV header: ' + CSV_HEADER);
    console.log('');
    console.log('--- Reproducibility check: seed 42, asBuilt, riteHeal 20, run twice ---');
    const rowA = await playRun(browser, 42, 'asBuilt', 20);
    const lineA = appendCsvRow(rowA);
    console.log(lineA);
    const rowB = await playRun(browser, 42, 'asBuilt', 20);
    const lineB = appendCsvRow(rowB);
    console.log(lineB);
    if (lineA === lineB) {
      console.log('CONFIRMED IDENTICAL');
    } else {
      console.log('MISMATCH — same seed produced different lines, see above');
      process.exitCode = 1;
      return;
    }

    console.log('');
    console.log('--- 100 runs x 4 combinations (seeds 1-100 per combination) ---');
    const seeds100 = [];
    for (let i = 1; i <= 100; i++) seeds100.push(i);

    const combos = [
      { dieRewardRule: 'asBuilt', riteHeal: 20 },
      { dieRewardRule: 'asBuilt', riteHeal: 25 },
      { dieRewardRule: 'elitesAndRitesOnly', riteHeal: 20 },
      { dieRewardRule: 'elitesAndRitesOnly', riteHeal: 25 }
    ];

    const summaries = [];
    for (let i = 0; i < combos.length; i++) {
      const c = combos[i];
      const summary = await runBatch(browser, c.dieRewardRule, c.riteHeal, seeds100);
      summaries.push(summary);
      printSummary(summary);
    }
  } finally {
    await browser.close();
  }
})().catch(function(err) {
  console.error('BATCH FAILED: ' + err.message);
  process.exitCode = 1;
});
}
