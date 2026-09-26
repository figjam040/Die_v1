// ============================================================
// TESTS/SCREENSHOTS.JS — screenshot baseline (KI-6)
// Same launch path every other test file in this project uses: plain Node
// script, chromium launched directly via the raw `playwright` library
// (const { chromium } = require('playwright'); browser = await
// chromium.launch(); page = await browser.newPage(); page.goto(FILE_URL)),
// no test runner, no server, file:// direct. Never ships, same status as
// tests/facts.test.js/tests/mods.test.js/tests/autoplay.js.
//
// Drives to seven screens and saves one PNG each into verify/, overwriting
// every run: the map, a fight with one dev-loaded two-mod face and one
// strengthened face visible, that fight with the DIE layer open, the die
// action panel, the card reward panel,
// the dev drawer open, and act 1's nine-slot map at the fork. Every action taken to reach each screen is a
// real, already-used-elsewhere function (openDieActionScreen(),
// dieActionChooseStrengthen()/dieActionPickStrengthenFace(),
// dieActionChooseSkip(), cardRewardSkip(), devLoadMod(), the real
// #devChromeToggleBtn) — nothing new invented for this tool, same
// no-forcing-except-documented-dev-tools discipline tests/autoplay.js and
// tests/facts.test.js already follow.
//
// COMPARE MODE (--compare): before capturing, whatever is currently in
// verify/ (the previous run's set) is copied into verify_prev/, then this
// run's fresh captures overwrite verify/ as normal, then each screen's new
// PNG is diffed against its verify_prev/ counterpart (tests/pngdiff.js —
// a hand-rolled PNG decoder over Node's built-in zlib, no new dependency)
// and the changed-pixel count is reported. Without --compare, this file
// only regenerates verify/ — no previous-set bookkeeping, no diff.
//
// Run: node tests/screenshots.js [--compare]
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { diffPNGs } = require('./pngdiff');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const VERIFY_DIR = path.resolve(__dirname, '..', 'verify');
const PREV_DIR = path.resolve(__dirname, '..', 'verify_prev');

const SCREENS = ['map', 'fight', 'die_layer', 'die_action', 'card_reward', 'dev_drawer', 'map_act1_nine_slots'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Moves whatever the last run left in verify/ into verify_prev/, so this
// run's fresh captures have something real to diff against. A screen with
// no prior capture (first-ever run, or a screen added since) is reported
// as having no previous set, not silently skipped.
function rotatePreviousSet() {
  ensureDir(PREV_DIR);
  SCREENS.forEach(function(name) {
    const src = path.join(VERIFY_DIR, name + '.png');
    const dst = path.join(PREV_DIR, name + '.png');
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    } else if (fs.existsSync(dst)) {
      // Stale from an even-older run with no current counterpart — remove
      // so a missing screen reads as "no previous set", not a leftover.
      fs.unlinkSync(dst);
    }
  });
}

async function shoot(page, name) {
  ensureDir(VERIFY_DIR);
  const target = path.join(VERIFY_DIR, name + '.png');
  await page.screenshot({ path: target });
  console.log('captured verify/' + name + '.png');
}

(async () => {
  const compareMode = process.argv.indexOf('--compare') !== -1;
  ensureDir(VERIFY_DIR);
  if (compareMode) rotatePreviousSet();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  // A missing art/*.png (e.g. an enemy with no portrait yet) is the
  // expected fallback path, not a bug — dropped only when the resource
  // path is under art/. Any other "resource not found" (a script, font,
  // audio file) still fails the test. The failing URL lives on
  // msg.location().url, never in msg.text() itself.
  page.on('console', function(msg) {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) consoleErrors.push(msg.text());
  });
  page.on('pageerror', function(err) { pageErrors.push(err.message); });
  page.on('dialog', function(d) { d.accept(); });

  await page.goto(FILE_URL);
  await page.waitForFunction(function() { return typeof gameState !== 'undefined' && gameState.run.screen === 'map'; });

  // ---- 1. The map ----
  await shoot(page, 'map');

  // ---- Enter the opening fight; pause before the first roll so nothing
  // races the phase machine (the standing autoAdvance() gotcha every
  // multi-round Playwright script in this project works around the same
  // way). ----
  await page.evaluate(function() { devChromeOpen = true; devPauseBeforeFirstRoll = true; });
  await page.click('#devChromeToggleBtn');
  await page.evaluate(function() { enterSlot('opening', null); });
  await page.waitForFunction(function() { return gameState.turn.phase === 'START_OF_TURN'; });
  await page.evaluate(function() { nextPhase(); }); // START_OF_TURN -> ROLL_PHASE, no auto-advance armed
  await page.waitForFunction(function() { return gameState.turn.phase === 'ROLL_PHASE'; });

  // ---- Dev-load a two-mod face (face 2: Smite then Blight, via the real
  // devLoadMod() dev tool, called twice — first call fills modId, second
  // fills modId2, same as a real player's second Load onto that face
  // would). ----
  await page.selectOption('#devModSelect', 'smite');
  await page.fill('#devFaceInput', '2');
  await page.evaluate(function() { devLoadMod(); });
  await page.selectOption('#devModSelect', 'blight');
  await page.fill('#devFaceInput', '2');
  await page.evaluate(function() { devLoadMod(); });

  // ---- Strengthen the anchor (face 10, always loaded with Consecrate on
  // a fresh die) via strengthenFace() (pipeline.js) directly — the single
  // sanctioned place any face's weight is ever written (dieActionPickStrengthenFace()
  // and Ordain's effect both call it too, per DIE FACE OBJECT STRUCTURE).
  // Deliberately NOT via openDieActionScreen()'s UI flow here: that
  // function needs an origin, and closing the panel on a 'reward'
  // origin immediately cascades into the card reward panel
  // — real, correct behaviour for a genuine post-win flow, but not
  // wanted yet, this fight hasn't been won. A first version of this
  // script called dieActionPickStrengthenFace() through that same UI flow
  // mid-fight and caught exactly this: the resulting "fight" screenshot
  // showed the card reward panel's "Fight won" banner overlaid on an
  // unwon fight. strengthenFace() alone writes the weight with no
  // dieActionStep/screen side effect at all. ----
  await page.evaluate(function() { strengthenFace(10); });

  // ---- 2. A fight with one two-mod face and one strengthened face visible ----
  await shoot(page, 'fight');

  // ---- 2b. The same fight with the DIE layer open ----
  await page.click('#dieInfoBtn');
  await shoot(page, 'die_layer');
  await page.click('#dieInfoCloseBtn');

  // ---- Force this fight's win the same way every other Playwright script
  // in this project does (runPhase()'s own top-of-function win guard, the
  // real win code path). This is the real post-win reward flow, so its
  // own die-action-then-card-reward cascade is exactly what should
  // happen here. ----
  await page.evaluate(function() { updateEnemy({ hp: 0 }); nextPhase(); });
  await page.waitForFunction(function() { return dieActionStep !== null; });

  // ---- 3. The die action panel — real post-win reward flow, top-level
  // "choose Load or Strengthen" state, real die preview included. ----
  await shoot(page, 'die_action');
  await page.evaluate(function() { dieActionChooseSkip(); }); // real Skip, cascades into the real card reward panel
  await page.waitForFunction(function() { return cardRewardStep !== null; });

  // ---- 4. The card reward panel ----
  await shoot(page, 'card_reward');
  await page.evaluate(function() { cardRewardSkip(); });

  // ---- 5. The dev drawer open (back on the map by now) ----
  await page.waitForFunction(function() { return gameState.run.screen === 'map'; });
  await shoot(page, 'dev_drawer');

  // ---- 6. Act 1's map at the fork, drawer closed: nine slots a lane (D-123) ----
  await page.click('#devChromeToggleBtn');
  await shoot(page, 'map_act1_nine_slots');

  console.log('\nConsole errors:', consoleErrors.length, JSON.stringify(consoleErrors));
  console.log('Page errors:', pageErrors.length, JSON.stringify(pageErrors));

  await browser.close();

  if (compareMode) {
    console.log('\n=== COMPARE: current set vs previous set ===');
    SCREENS.forEach(function(name) {
      const prevPath = path.join(PREV_DIR, name + '.png');
      const curPath = path.join(VERIFY_DIR, name + '.png');
      if (!fs.existsSync(prevPath)) {
        console.log(name + ': no previous screenshot to compare (first baseline for this screen)');
        return;
      }
      try {
        const result = diffPNGs(prevPath, curPath);
        if (!result.comparable) {
          console.log(name + ': NOT COMPARABLE — ' + result.reason);
        } else {
          const pct = ((result.changedPixels / result.totalPixels) * 100).toFixed(3);
          console.log(name + ': ' + result.changedPixels + ' / ' + result.totalPixels + ' pixels changed (' + pct + '%)');
        }
      } catch (e) {
        console.log(name + ': DIFF FAILED — ' + e.message);
      }
    });
  }

  if (consoleErrors.length > 0 || pageErrors.length > 0) {
    process.exitCode = 1;
  }
})().catch(function(err) {
  console.error('SCREENSHOTS FAILED: ' + err.stack);
  process.exitCode = 1;
});
