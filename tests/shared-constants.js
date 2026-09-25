// Shared limits and page helpers used by more than one test file, so they
// can never disagree. CLAUDE_MD_MAX_BYTES matches CLAUDE.md's own standing
// rule (SIZE RULE: this file stays at or under 90,000 bytes) and F40,
// asserted in tests/guardrails.test.js. TEST_FILE_MAX_LINES caps every .js
// file under tests/; JS_FILE_MAX_LINES caps every file under js/, held just
// above js/cards-mods.js until that file is split, then lowered to 1500.
// Both are asserted in tests/guardrails.test.js.
const path = require('path');
const assert = require('assert');

const FILE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// track(name) runs before a test with its name and after it with null, for a
// file that needs the running test's name (facts.test.js's SPEC-ONLY log).
function createRunner(track) {
  const results = [];

  async function runTest(name, fn) {
    if (track) track(name);
    try {
      await fn();
      results.push({ name, pass: true });
      console.log('PASS — ' + name);
    } catch (err) {
      results.push({ name, pass: false, error: err.message });
      console.log('FAIL — ' + name + ': ' + err.message);
    }
    if (track) track(null);
  }

  // Prints the "N/M <label> tests passed." line run-all.js matches and
  // returns the failure count.
  function report(label) {
    const failed = results.filter(function(r) { return !r.pass; });
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' ' + label + ' tests passed.');
    if (failed.length > 0) {
      console.log('FAILURES:');
      failed.forEach(function(f) { console.log('  - ' + f.name + ': ' + f.error); });
    }
    return failed.length;
  }

  // The mod suites' shape: the browser first, handed back to the test body.
  function runModTest(browser, name, fn) {
    return runTest(name, function() { return fn(browser); });
  }

  return { results, runTest, runModTest, report };
}

const TEST_FACE = 2; // any face 2-19 is dev-loadable; never 1 or 20 (NAT faces)

async function freshFightPage(browser) {
  const page = await browser.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  // A missing art/*.png (e.g. an enemy with no portrait yet) is the
  // expected fallback path, not a bug — dropped only when the resource
  // path is under art/. Any other "resource not found" (a script, font,
  // audio file) still fails the test. The failing URL lives on
  // msg.location().url, never in msg.text() itself.
  page.on('console', msg => {
    if (msg.type() !== 'error') return;
    const isArtFailure = msg.text().indexOf('Failed to load resource') !== -1 && (msg.location().url || '').indexOf('art/') !== -1;
    if (!isArtFailure) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  page._consoleErrors = consoleErrors;
  page._pageErrors = pageErrors;
  return page;
}

// Loads modId onto TEST_FACE, opens dev chrome (forcePlayerRoll's own
// guard requires it), then forces that face's roll through the real
// resolvePlayerRoll() dispatch — the same code path a natural roll on a
// loaded face uses, MOD_TRIGGER included. Waits for CARD_PHASE, the phase
// autoAdvance settles on once the roll resolves.
async function triggerMod(page, modId) {
  await page.evaluate(({ modId, faceNum }) => {
    devChromeOpen = true;
    const newFaces = gameState.die.faces.slice();
    newFaces[faceNum - 1] = Object.assign({}, newFaces[faceNum - 1], { modId: modId });
    updateDie({ faces: newFaces });
  }, { modId, faceNum: TEST_FACE });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((faceNum) => { forcePlayerRoll(faceNum); }, TEST_FACE);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

function assertNoErrors(page) {
  assert.strictEqual(page._consoleErrors.length, 0, 'console errors: ' + JSON.stringify(page._consoleErrors));
  assert.strictEqual(page._pageErrors.length, 0, 'page errors: ' + JSON.stringify(page._pageErrors));
}

async function freshPage(browser) {
  const page = await browser.newPage();
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  return page;
}

async function enterOpeningFight(page) {
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
}

async function advanceUntilPhase(page, targetPhase, maxSteps) {
  for (let i = 0; i < (maxSteps || 30); i++) {
    const phase = await page.evaluate(() => gameState.turn.phase);
    if (phase === targetPhase) return;
    await page.evaluate(() => { nextPhase(); });
  }
  throw new Error('did not reach phase ' + targetPhase);
}

// F26: every js/ file shares one global scope, so a top-level name
// declared twice silently overwrites the first. Walks the source at brace
// depth 0, skipping comments, strings, template literals and regex
// literals, and returns every function/class/const/let/var name it declares.
function topLevelNames(src) {
  const names = [];
  const regexAfterWord = ['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else'];
  let i = 0, depth = 0, lastSig = '', lastWord = '';
  const n = src.length;
  function skipQuoted(q) {
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') i++;
      else if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
        let d = 1; i += 2;
        while (i < n && d > 0) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; }
        continue;
      }
      i++;
    }
    i++;
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); i = i === -1 ? n : i + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { skipQuoted(c); lastSig = c; lastWord = ''; continue; }
    if (c === '/' && (!/[\w$)\]]/.test(lastSig) || regexAfterWord.indexOf(lastWord) !== -1)) {
      i++;
      let inClass = false;
      while (i < n && (inClass || src[i] !== '/') && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        else if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        i++;
      }
      i++;
      while (i < n && /[a-z]/.test(src[i])) i++;
      lastSig = '/'; lastWord = '';
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const word = src.slice(i).match(/^[\w$]+/)[0];
      i += word.length;
      if (depth === 0 && ['function', 'class', 'const', 'let', 'var'].indexOf(word) !== -1) {
        const m = src.slice(i).match(/^[\s*]*([A-Za-z_$][\w$]*)/);
        if (m) { names.push(m[1]); i += m[0].length; lastSig = 'a'; lastWord = m[1]; continue; }
      }
      lastSig = 'a'; lastWord = word;
      continue;
    }
    if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') depth--;
    if (!/\s/.test(c)) { lastSig = c; lastWord = ''; }
    i++;
  }
  return names;
}

module.exports = {
  CLAUDE_MD_MAX_BYTES: 90000,
  TEST_FILE_MAX_LINES: 800,
  JS_FILE_MAX_LINES: 1700,
  FILE_URL,
  createRunner,
  TEST_FACE,
  freshFightPage,
  triggerMod,
  assertNoErrors,
  freshPage,
  enterOpeningFight,
  advanceUntilPhase,
  topLevelNames
};
