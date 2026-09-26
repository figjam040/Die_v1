// ============================================================
// TESTS/SCREENSHOTS.JS — screenshot baseline (KI-6, KI-54)
// Plain Node script, chromium launched directly via the raw `playwright`
// library, file:// direct, no test runner, no server. Never ships.
//
// Drives to seven screens and saves one PNG each into verify/, overwriting
// every run: the map, a fight with one dev-loaded two-mod face and one
// strengthened face, that fight with the DIE layer open, the die action
// panel, the card reward panel, the dev drawer open, and act 1's nine-slot
// map at the fork. Every step is a real function the game or its dev tools
// already have.
//
// Deterministic: Math.random is seeded with SEED at page start (the same
// generator tests/build175.test.js uses) and #buildStamp is hidden before
// every shot, so two runs of one tree are pixel-identical.
//
// COMPARE (--compare[=HASH]): the working tree's shots are diffed against
// the same seeded shots of a named commit, default the parent of HEAD. That
// commit's index.html, js/, fonts/ and art/ are read out of git into a temp
// folder outside the project. --from=HASH shoots a commit instead of the
// working tree, so two commits can be compared; nothing then touches verify/.
// The report gives changed pixels per screen and one line per bounding box.
//
// Run: node tests/screenshots.js [--compare[=HASH]] [--from=HASH]
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const { diffBoxes } = require('./pngdiff');

const ROOT = path.resolve(__dirname, '..');
const VERIFY_DIR = path.join(ROOT, 'verify');
const SEED = 178;
const SETTLE_MS = 300;
const TREE_PATHS = ['index.html', 'js', 'fonts', 'art'];

const SCREENS = ['map', 'fight', 'die_layer', 'die_action', 'card_reward', 'dev_drawer', 'map_act1_nine_slots'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function git(args, options) {
  return execFileSync('git', args, Object.assign({ cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }, options || {}));
}

function resolveCommit(name) {
  return git(['rev-parse', '--verify', name + '^{commit}'], { encoding: 'utf8' }).trim();
}

// Writes the commit's page files into dir, byte for byte, binaries included.
function extractTree(commit, dir) {
  const list = git(['ls-tree', '-r', '--name-only', commit, '--'].concat(TREE_PATHS), { encoding: 'utf8' });
  list.split('\n').filter(Boolean).forEach(function(rel) {
    const out = path.join(dir, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, git(['show', commit + ':' + rel]));
  });
}

function seededRandom(seed) {
  let s = seed >>> 0;
  Math.random = function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hides the stamp, lets fonts and layout settle, shoots. onShot(page, name)
// runs right after the picture is taken.
async function shoot(page, outDir, name, onShot) {
  ensureDir(outDir);
  await page.evaluate(function() {
    const stamp = document.getElementById('buildStamp');
    if (stamp) stamp.style.visibility = 'hidden';
    return document.fonts.ready;
  });
  // A pop number fades on wall-clock time, so a shot waits for #fxLayer to empty.
  await page.waitForFunction(function() { return !document.querySelector('#fxLayer .fx-number'); }, null, { timeout: 5000 });
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(outDir, name + '.png') });
  if (onShot) await onShot(page, name);
}

// Takes all seven shots of the page at indexUrl into outDir, on a seeded
// Math.random. Returns the console and page errors seen.
async function captureAll(browser, indexUrl, outDir, onShot) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  // A missing art/*.png is the expected fallback path, not a bug; any other
  // failed resource (script, font, audio) still counts. The failing URL
  // lives on msg.location().url, never in msg.text().
  page.on('console', function(msg) {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) consoleErrors.push(msg.text());
  });
  page.on('pageerror', function(err) { pageErrors.push(err.message); });
  page.on('dialog', function(d) { d.accept(); });
  await page.addInitScript(seededRandom, SEED);

  await page.goto(indexUrl);
  await page.waitForFunction(function() { return typeof gameState !== 'undefined' && gameState.run.screen === 'map'; });

  await shoot(page, outDir, 'map', onShot);

  // Pause before the first roll so nothing races the phase machine.
  await page.evaluate(function() { devChromeOpen = true; devPauseBeforeFirstRoll = true; });
  await page.click('#devChromeToggleBtn');
  await page.evaluate(function() { enterSlot('opening', null); });
  await page.waitForFunction(function() { return gameState.turn.phase === 'START_OF_TURN'; });
  await page.evaluate(function() { nextPhase(); });
  await page.waitForFunction(function() { return gameState.turn.phase === 'ROLL_PHASE'; });

  // Face 2 gets Smite then Blight through the real devLoadMod(), called
  // twice: the first call fills modId, the second modId2.
  await page.selectOption('#devModSelect', 'smite');
  await page.fill('#devFaceInput', '2');
  await page.evaluate(function() { devLoadMod(); });
  await page.selectOption('#devModSelect', 'blight');
  await page.fill('#devFaceInput', '2');
  await page.evaluate(function() { devLoadMod(); });

  // strengthenFace() writes the weight with no die action screen behind it;
  // going through openDieActionScreen() here would cascade into the card
  // reward panel over a fight that is not won yet.
  await page.evaluate(function() { strengthenFace(10); });

  await shoot(page, outDir, 'fight', onShot);

  await page.click('#dieInfoBtn');
  await shoot(page, outDir, 'die_layer', onShot);
  await page.click('#dieInfoCloseBtn');

  // Ending the fight through runPhase()'s own win guard runs the real
  // post-win die action then card reward cascade.
  await page.evaluate(function() { updateEnemy({ hp: 0 }); nextPhase(); });
  await page.waitForFunction(function() { return dieActionStep !== null; });
  await shoot(page, outDir, 'die_action', onShot);
  await page.evaluate(function() { dieActionChooseSkip(); });
  await page.waitForFunction(function() { return cardRewardStep !== null; });

  await shoot(page, outDir, 'card_reward', onShot);
  await page.evaluate(function() { cardRewardSkip(); });

  await page.waitForFunction(function() { return gameState.run.screen === 'map'; });
  await shoot(page, outDir, 'dev_drawer', onShot);

  await page.click('#devChromeToggleBtn');
  await shoot(page, outDir, 'map_act1_nine_slots', onShot);

  await page.close();
  return { consoleErrors, pageErrors };
}

function printErrors(label, result) {
  console.log(label + ' console errors: ' + result.consoleErrors.length + ' ' + JSON.stringify(result.consoleErrors));
  console.log(label + ' page errors: ' + result.pageErrors.length + ' ' + JSON.stringify(result.pageErrors));
}

// Returns the report lines and the total changed pixels.
function compareSets(baseDir, curDir) {
  const lines = [];
  let total = 0;
  SCREENS.forEach(function(name) {
    const basePath = path.join(baseDir, name + '.png');
    const curPath = path.join(curDir, name + '.png');
    if (!fs.existsSync(basePath) || !fs.existsSync(curPath)) {
      lines.push(name + ': a shot is missing, nothing to compare');
      return;
    }
    let result;
    try {
      result = diffBoxes(basePath, curPath);
    } catch (e) {
      lines.push(name + ': DIFF FAILED — ' + e.message);
      return;
    }
    if (!result.comparable) {
      lines.push(name + ': NOT COMPARABLE — ' + result.reason);
      return;
    }
    total += result.changedPixels;
    const pct = ((result.changedPixels / result.totalPixels) * 100).toFixed(3);
    lines.push(name + ': ' + result.changedPixels + ' / ' + result.totalPixels + ' pixels changed (' + pct + '%), ' + result.boxes.length + ' box(es)');
    result.boxes.forEach(function(b, i) {
      lines.push('  box ' + (i + 1) + ': x=' + b.x + ' y=' + b.y + ' w=' + b.w + ' h=' + b.h + ' (' + b.pixels + ' px)');
    });
  });
  return { lines: lines, total: total };
}

async function main() {
  const compareArg = process.argv.find(function(a) { return a === '--compare' || a.indexOf('--compare=') === 0; });
  const fromArg = process.argv.find(function(a) { return a.indexOf('--from=') === 0; });
  if (fromArg && !compareArg) throw new Error('--from needs --compare');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'die-shots-'));
  const browser = await chromium.launch();
  try {
    let curLabel = 'working tree';
    let curUrl = pathToFileURL(path.join(ROOT, 'index.html')).href;
    let curDir = VERIFY_DIR;
    if (fromArg) {
      const from = resolveCommit(fromArg.slice('--from='.length));
      const treeDir = path.join(tmpRoot, 'from-tree');
      extractTree(from, treeDir);
      curLabel = from.slice(0, 7);
      curUrl = pathToFileURL(path.join(treeDir, 'index.html')).href;
      curDir = path.join(tmpRoot, 'from-shots');
    }
    const cur = await captureAll(browser, curUrl, curDir, null);
    if (!fromArg) SCREENS.forEach(function(name) { console.log('captured verify/' + name + '.png'); });
    printErrors(curLabel, cur);

    let failed = cur.consoleErrors.length > 0 || cur.pageErrors.length > 0;
    if (compareArg) {
      const named = compareArg.indexOf('=') === -1 ? 'HEAD^' : compareArg.slice(compareArg.indexOf('=') + 1);
      const base = resolveCommit(named);
      const baseTree = path.join(tmpRoot, 'base-tree');
      const baseDir = path.join(tmpRoot, 'base-shots');
      extractTree(base, baseTree);
      const baseResult = await captureAll(browser, pathToFileURL(path.join(baseTree, 'index.html')).href, baseDir, null);
      printErrors(base.slice(0, 7), baseResult);
      console.log('\n=== COMPARE: ' + curLabel + ' vs ' + base.slice(0, 7) + ' (seed ' + SEED + ') ===');
      const report = compareSets(baseDir, curDir);
      report.lines.forEach(function(l) { console.log(l); });
      console.log('total changed pixels: ' + report.total);
    }
    if (failed) process.exitCode = 1;
  } finally {
    await browser.close();
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(function(err) {
    console.error('SCREENSHOTS FAILED: ' + err.stack);
    process.exitCode = 1;
  });
}

module.exports = { SCREENS, SEED, captureAll, extractTree, resolveCommit, compareSets };
