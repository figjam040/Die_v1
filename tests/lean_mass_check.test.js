// ============================================================
// TESTS/LEAN_MASS_CHECK.TEST.JS
// A read-only verification session (no game file edited). Drives one real
// fight, through the real production functions only (forcePlayerRoll(),
// resolvePlayerRoll(), nextPhase(), playCard(), dieActionPickStrengthenFace(),
// clearFightScopedState(), startNewRun(), rollDie()) — never a reimplemented
// shortcut — to empirically answer:
//   (a) does Strengthen on a Zeal face raise its roll frequency
//   (b) does Zeal's growth survive a fight reset, and get wiped by a new run
//   (c) does Covenant read the weight of the face rolled this round
//   (d) does a Nat 20 double Zeal's damage when Fervour sits on a lower face
//
// Seeded PRNG (mulberry32, same generator tests/autoplay.js already uses)
// installed via page.addInitScript() before any js/ file runs, so every
// roll this script does NOT force (the statistical rollDie() sampling in
// part (a)) is reproducible from one fixed seed.
//
// Not @playwright/test — this project has no test runner installed, only
// the raw `playwright` library (package.json), same as every other file in
// this folder. Plain Node script, chromium launched directly. Run:
//   node tests/lean_mass_check.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const SEED = 424242;

// Same mulberry32 PRNG tests/autoplay.js installs — copied here rather than
// required from that file, since this file must not depend on or modify
// anything outside tests/ itself and autoplay.js exports nothing.
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

async function freshFightPage(browser) {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.addInitScript(installSeededRandom, SEED);
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');

  // Open dev chrome (forcePlayerRoll requires it) and check the "pause
  // before first roll" box BEFORE entering the fight, so this fight's
  // startFreshTurnPaused() does not call autoAdvance() at all — every
  // phase transition from here on is driven explicitly by this script's
  // own nextPhase() calls, never a natural roll or a race with the
  // 1800ms ROLL_PHASE_PAUSE_MS timer (same technique tests/autoplay.js
  // uses for the identical reason).
  await page.evaluate(() => {
    devChromeOpen = true;
    const cb = document.getElementById('devPauseBeforeRollCheckbox');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
  });

  await page.evaluate(() => { enterSlot('opening', null); });
  // Fight starts paused at START_OF_TURN (devPauseBeforeFirstRoll is true).
  await page.waitForFunction(() => gameState.turn.phase === 'START_OF_TURN');

  // Test-setup headroom only, not part of what's being measured: raise
  // both combatants' HP so four Zeal triggers plus Covenant cannot end
  // the fight mid-script (opening enemy HP is 50 by default —
  // GAME_CONFIG.ENEMY_HP.OPENING — and total planned damage exceeds
  // that). Real state helpers, same as every other mutation in this file.
  await page.evaluate(() => {
    updateEnemy({ hp: 1000, maxHp: 1000 });
    updatePlayer({ hp: 500, maxHp: 500 });
  });

  page._consoleErrors = consoleErrors;
  page._pageErrors = pageErrors;
  return page;
}

function assertNoErrors(page) {
  assert.strictEqual(page._consoleErrors.length, 0, 'console errors: ' + JSON.stringify(page._consoleErrors));
  assert.strictEqual(page._pageErrors.length, 0, 'page errors: ' + JSON.stringify(page._pageErrors));
}

// Advances phases one at a time via the real nextPhase(), up to `max`
// steps, stopping the moment gameState.turn.phase === targetPhase. Throws
// if the fight ends (run.status leaves 'active') or the step budget runs
// out — both would mean this script's own assumptions about the fight
// were wrong, not a normal outcome to swallow silently.
async function driveToPhase(page, targetPhase, max) {
  for (let i = 0; i < max; i++) {
    const r = await page.evaluate(() => {
      nextPhase();
      return { phase: gameState.turn.phase, status: gameState.run.status };
    });
    if (r.status !== 'active') {
      throw new Error('fight ended unexpectedly (status=' + r.status + ') while driving to ' + targetPhase);
    }
    if (r.phase === targetPhase) return;
  }
  throw new Error('did not reach ' + targetPhase + ' within ' + max + ' phase steps');
}

(async () => {
  const browser = await chromium.launch();
  const page = await freshFightPage(browser);
  const log = [];
  const record = (line) => { log.push(line); console.log(line); };

  try {
    // ---------------------------------------------------------------
    // SETUP — reach this fight's first ROLL_PHASE, load Zeal on face 5,
    // Strengthen that face exactly twice via the real die-action function.
    // ---------------------------------------------------------------
    await driveToPhase(page, 'ROLL_PHASE', 2);

    const ZEAL_FACE = 5;
    const FERVOUR_FACE = 3;

    await page.evaluate((faceNum) => {
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'zeal' });
      updateDie({ faces: newFaces });
    }, ZEAL_FACE);

    // dieActionPickStrengthenFace() is the real production function
    // (rendering.js) the Strengthen die-action screen calls on a click —
    // called directly here twice, exactly as instructed ("Strengthen it
    // twice"), rather than a reimplementation of what it does.
    await page.evaluate((faceNum) => { dieActionPickStrengthenFace(faceNum); }, ZEAL_FACE);
    await page.evaluate((faceNum) => { dieActionPickStrengthenFace(faceNum); }, ZEAL_FACE);

    const weightAfterStrengthen = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);
    assert.strictEqual(weightAfterStrengthen, 3, 'expected two Strengthens to raise face 5 from weight 1 to weight 3');
    record('[SETUP] Zeal loaded on face ' + ZEAL_FACE + ', Strengthened twice -> weight ' + weightAfterStrengthen);

    // Give Covenant a hand slot for later (not part of the starting deck).
    await page.evaluate(() => {
      updatePlayer({ hand: gameState.player.hand.concat(['covenant']) });
    });

    // ---------------------------------------------------------------
    // (a) STATISTICAL PROOF — call the real rollDie() many times directly,
    // once against the live (Strengthened, weight 3) faces, once against a
    // cloned faces array with face 5 reset to weight 1 (the pre-Strengthen
    // baseline). rollDie() is pure (it only reads its argument and returns
    // a face — the earlier "[ROLL] pool size" log line is its only side
    // effect); calling it directly like this is the real production
    // function, sampled, not a reimplementation of its pool math.
    // ---------------------------------------------------------------
    const sample = await page.evaluate((faceNum) => {
      // Kept modest (not tens of thousands): rollDie() itself calls the
      // real log() every draw, which appends a DOM node and forces a
      // scrollTop reflow — a large sample count here is a real-browser
      // performance problem, not a statistics one. 2500 draws per side is
      // still far more than enough to separate a ~13.6% expected frequency
      // from a ~5% baseline with a comfortable margin.
      const SAMPLES = 2500;
      const liveFaces = gameState.die.faces;
      let liveHits = 0;
      for (let i = 0; i < SAMPLES; i++) {
        if (rollDie(liveFaces).number === faceNum) liveHits++;
      }
      const baselineFaces = liveFaces.map(function(f) {
        return f.number === faceNum ? Object.assign({}, f, { weight: 1 }) : f;
      });
      let baselineHits = 0;
      for (let i = 0; i < SAMPLES; i++) {
        if (rollDie(baselineFaces).number === faceNum) baselineHits++;
      }
      const totalWeightLive = liveFaces.reduce(function(sum, f) { return sum + f.weight; }, 0);
      const totalWeightBaseline = baselineFaces.reduce(function(sum, f) { return sum + f.weight; }, 0);
      return {
        samples: SAMPLES,
        liveHits: liveHits,
        baselineHits: baselineHits,
        liveWeight: liveFaces[faceNum - 1].weight,
        baselineWeight: baselineFaces[faceNum - 1].weight,
        expectedLiveFraction: liveFaces[faceNum - 1].weight / totalWeightLive,
        expectedBaselineFraction: baselineFaces[faceNum - 1].weight / totalWeightBaseline
      };
    }, ZEAL_FACE);

    const liveFraction = sample.liveHits / sample.samples;
    const baselineFraction = sample.baselineHits / sample.samples;
    record('[A] face ' + ZEAL_FACE + ' weight=' + sample.liveWeight + ' (post-Strengthen): '
      + sample.liveHits + '/' + sample.samples + ' = ' + liveFraction.toFixed(4)
      + ' (expected ~' + sample.expectedLiveFraction.toFixed(4) + ')');
    record('[A] face ' + ZEAL_FACE + ' weight=' + sample.baselineWeight + ' (baseline, hypothetical clone): '
      + sample.baselineHits + '/' + sample.samples + ' = ' + baselineFraction.toFixed(4)
      + ' (expected ~' + sample.expectedBaselineFraction.toFixed(4) + ')');
    assert.ok(liveFraction > baselineFraction * 2, 'expected Strengthened face to roll far more often than the weight-1 baseline');
    assert.ok(Math.abs(liveFraction - sample.expectedLiveFraction) < 0.02, 'live sampled frequency should track the pool-math prediction closely');
    record('[A] VERIFIED — Strengthen raises the face\'s share of rollDie()\'s pool, and its measured roll frequency');

    // ---------------------------------------------------------------
    // ROUND 1 — force face 5 (Zeal, trigger #1), then play Covenant in the
    // same CARD_PHASE, reading whatever gameState.turn.rolledFaceWeight
    // this roll just set.
    // ---------------------------------------------------------------
    let enemyHpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, ZEAL_FACE);
    let enemyHpAfter = await page.evaluate(() => gameState.enemy.hp);
    let zealDamage1 = enemyHpBefore - enemyHpAfter;
    let weightAtTrigger1 = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);
    record('[ZEAL #1] damage=' + zealDamage1 + ' face_weight=' + weightAtTrigger1);
    assert.strictEqual(zealDamage1, 10, 'expected Zeal\'s first trigger to deal exactly 10 (bonus starts at 0)');

    await driveToPhase(page, 'CARD_PHASE', 1);

    const rolledFaceWeightAtCovenant = await page.evaluate(() => gameState.turn.rolledFaceWeight);
    const handIndexCovenant = await page.evaluate(() => gameState.player.hand.indexOf('covenant'));
    assert.ok(handIndexCovenant !== -1, 'covenant must be in hand to play it');
    enemyHpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate((idx) => { playCard(idx); }, handIndexCovenant);
    enemyHpAfter = await page.evaluate(() => gameState.enemy.hp);
    const covenantDamage = enemyHpBefore - enemyHpAfter;
    const expectedCovenantDamage = 2 + 3 * rolledFaceWeightAtCovenant;
    record('[C] Covenant played right after a Zeal roll — rolledFaceWeight=' + rolledFaceWeightAtCovenant
      + ' damage=' + covenantDamage + ' (expected 2 + 3*' + rolledFaceWeightAtCovenant + ' = ' + expectedCovenantDamage + ')');
    assert.strictEqual(covenantDamage, expectedCovenantDamage, 'Covenant damage must equal 2 + 3*rolledFaceWeight');
    assert.strictEqual(rolledFaceWeightAtCovenant, weightAtTrigger1, 'rolledFaceWeight should be the weight of the face just rolled');
    record('[C] VERIFIED — Covenant\'s damage matches 2 + 3x the weight of the face rolled this round');

    await driveToPhase(page, 'ROLL_PHASE', 6);

    // ---------------------------------------------------------------
    // ROUND 2 — Zeal trigger #2.
    // ---------------------------------------------------------------
    enemyHpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, ZEAL_FACE);
    enemyHpAfter = await page.evaluate(() => gameState.enemy.hp);
    const zealDamage2 = enemyHpBefore - enemyHpAfter;
    const weightAtTrigger2 = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);
    record('[ZEAL #2] damage=' + zealDamage2 + ' face_weight=' + weightAtTrigger2);
    assert.strictEqual(zealDamage2, 14, 'expected Zeal\'s second trigger to deal 10 + 4 = 14');

    await driveToPhase(page, 'ROLL_PHASE', 7);

    // ---------------------------------------------------------------
    // ROUND 3 — Zeal trigger #3 (three natural-dispatch triggers reached).
    // ---------------------------------------------------------------
    enemyHpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, ZEAL_FACE);
    enemyHpAfter = await page.evaluate(() => gameState.enemy.hp);
    const zealDamage3 = enemyHpBefore - enemyHpAfter;
    const weightAtTrigger3 = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);
    record('[ZEAL #3] damage=' + zealDamage3 + ' face_weight=' + weightAtTrigger3);
    assert.strictEqual(zealDamage3, 18, 'expected Zeal\'s third trigger to deal 10 + 8 = 18');

    await driveToPhase(page, 'ROLL_PHASE', 7);

    // ---------------------------------------------------------------
    // ROUND 4 — (d) load Fervour on a LOWER face number than Zeal, force a
    // Nat 20. onNatTwenty() (cards-mods.js) fires every loaded face
    // ascending by number, so Fervour (face 3) registers its turn-scoped
    // DAMAGE_MULTIPLIER before Zeal (face 5) triggers and dispatches its
    // own attack-tagged damage through it.
    // ---------------------------------------------------------------
    await page.evaluate((faceNum) => {
      const newFaces = gameState.die.faces.slice();
      newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: 'fervour' });
      updateDie({ faces: newFaces });
    }, FERVOUR_FACE);
    assert.ok(FERVOUR_FACE < ZEAL_FACE, 'test setup requires Fervour on a lower face number than Zeal');

    const bonusBeforeNat20 = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData.accumulatedBonus, ZEAL_FACE);
    enemyHpBefore = await page.evaluate(() => gameState.enemy.hp);
    await page.evaluate(() => { forcePlayerRoll(20); });
    enemyHpAfter = await page.evaluate(() => gameState.enemy.hp);
    const zealDamageNat20 = enemyHpBefore - enemyHpAfter; // Fervour/Consecrate deal no damage in this sweep — isolates Zeal's hit
    const expectedUndoubled = 10 + bonusBeforeNat20;
    record('[D] Nat 20 sweep — Fervour face ' + FERVOUR_FACE + ' < Zeal face ' + ZEAL_FACE
      + '. Zeal bonus going in=' + bonusBeforeNat20 + ', undoubled would be ' + expectedUndoubled
      + ', measured damage=' + zealDamageNat20);
    assert.strictEqual(zealDamageNat20, expectedUndoubled * 2, 'expected Fervour to double Zeal\'s Nat-20 damage');
    record('[D] VERIFIED — on a Nat 20, Fervour registered on a lower face doubles Zeal\'s damage');

    await driveToPhase(page, 'CARD_PHASE', 1);
    assertNoErrors(page);

    // ---------------------------------------------------------------
    // (b) PERSISTENCE PROOF — clearFightScopedState() (a fight reset,
    // e.g. Restart Fight or the next slot's beginFightFromSlot) must NOT
    // touch gameState.die; startNewRun() must rebuild it from scratch.
    // Both are the real production functions (run-and-map.js), called
    // directly, not reimplemented.
    // ---------------------------------------------------------------
    const bonusBeforeFightReset = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData.accumulatedBonus, ZEAL_FACE);
    const weightBeforeFightReset = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);

    await page.evaluate(() => { clearFightScopedState(); });
    const bonusAfterFightReset = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].modData.accumulatedBonus, ZEAL_FACE);
    const weightAfterFightReset = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1].weight, ZEAL_FACE);
    record('[B] clearFightScopedState() — bonus before=' + bonusBeforeFightReset + ' after=' + bonusAfterFightReset
      + '; weight before=' + weightBeforeFightReset + ' after=' + weightAfterFightReset);
    assert.strictEqual(bonusAfterFightReset, bonusBeforeFightReset, 'a fight-scoped reset must not touch Zeal\'s accumulated bonus');
    assert.strictEqual(weightAfterFightReset, weightBeforeFightReset, 'a fight-scoped reset must not touch face weight either');

    await page.evaluate(() => { startNewRun(); });
    const faceAfterNewRun = await page.evaluate((faceNum) => gameState.die.faces[faceNum - 1], ZEAL_FACE);
    record('[B] startNewRun() — face ' + ZEAL_FACE + ' now: modId=' + JSON.stringify(faceAfterNewRun.modId)
      + ' weight=' + faceAfterNewRun.weight + ' modData=' + JSON.stringify(faceAfterNewRun.modData));
    assert.strictEqual(faceAfterNewRun.modId, null, 'a brand new run must rebuild the die — face 5 should be blank again');
    assert.strictEqual(faceAfterNewRun.weight, 1, 'a brand new run must reset weight back to 1');
    assert.strictEqual(faceAfterNewRun.modData, undefined, 'a brand new run must wipe Zeal\'s accumulated-bonus modData');
    record('[B] VERIFIED — Zeal\'s growth survives a fight-scoped reset, and is wiped by startNewRun()');

    assertNoErrors(page);
    console.log('\nALL DRIVEN CHECKS PASSED.');
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.log('\nFAILED: ' + err.message);
    await browser.close();
    process.exit(1);
  }
})();
