// The autoplayer's constants and base helpers: the CSV file, the seeded
// Math.random, the fresh page, the guards, one phase step, the card phase,
// the die action, card reward, fight and rite resolvers. tests/autoplay.js
// requires these and plays whole runs with them; its header documents the
// fixed policy. Never run except when explicitly asked (D-70).

const path = require('path');
const fs = require('fs');

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
const LOAD_PRIORITY = ['fervour', 'sanctuary', 'virulence', 'smite', 'blight', 'elevation', 'zeal', 'offering', 'anthem', 'ordain', 'penance', 'vigil', 'largesse', 'tithe', 'congregation', 'cope', 'anathema', 'thurible', 'magnificat', 'unison', 'accord', 'kinship', 'concord', 'herald', 'dread', 'genuflect'];

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
  // A missing art/*.png (e.g. an enemy with no portrait yet) is the
  // expected fallback path, not a bug — dropped only when the resource
  // path is under art/. Any other "resource not found" (a script, font,
  // audio file) still fails the test. The failing URL lives on
  // msg.location().url, never in msg.text() itself.
  page.on('console', function(msg) {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    const isArtFailure = text.indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) errors.push('console: ' + text);
  });
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

module.exports = { FILE_URL, CSV_PATH, CSV_HEADER, LOAD_PRIORITY, ensureCsvHeader, appendCsvRow, freshPage, checkGuards, resolveDieAction, playFight, resolveFightWinRewards, resolveRite };
