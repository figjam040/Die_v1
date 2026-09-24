// ============================================================
// TESTS/BUILD159.TEST.JS
// Standing regression suite for KI-38/D-70 (the autoplayer never runs from
// facts.test.js) and the CLAUDE.md size trim. Plain Node script, no
// browser needed — every assertion here is a source/text check.
// Run: node tests/build159.test.js
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { CLAUDE_MD_MAX_BYTES } = require('./shared-constants.js');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = path.resolve(ROOT, '..', 'Die_v1_backup_158');
const CLAUDE_MD_UNDER_BYTES = 72000;

const results = [];
function runTest(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log('PASS — ' + name);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log('FAIL — ' + name + ': ' + err.message);
  }
}

const factsSrc = fs.readFileSync(path.resolve(__dirname, 'facts.test.js'), 'utf8');
const autoplaySrc = fs.readFileSync(path.resolve(__dirname, 'autoplay.js'), 'utf8');
const claudeMd = fs.readFileSync(path.resolve(ROOT, 'CLAUDE.md'), 'utf8');
const historyMd = fs.readFileSync(path.resolve(ROOT, 'HISTORY.md'), 'utf8');

// ---------------------------------------------------------------
// ITEM A — KI-38, D-70: the bot never runs from facts.test.js
// ---------------------------------------------------------------

runTest('KI-38: tests/facts.test.js contains no call to playRun(', () => {
  assert.ok(!/playRun\(/.test(factsSrc), 'facts.test.js must not call playRun( anywhere — the autoplayer must never run except when explicitly asked (D-70)');
});

runTest('KI-38: tests/facts.test.js does not require autoplay.js for playRun, only for reading it as text or its LOAD_PRIORITY export', () => {
  assert.ok(!/\{\s*playRun\s*\}\s*=\s*require\(['"]\.\/autoplay\.js['"]\)/.test(factsSrc), 'facts.test.js must not destructure playRun out of a require of autoplay.js');
});

runTest('KI-38: tests/autoplay.js declares no own BUILD constant and stamps its CSV build column from GAME_CONFIG.BUILD', () => {
  assert.ok(!/const\s+BUILD\s*=/.test(autoplaySrc), 'tests/autoplay.js must not declare its own BUILD constant');
  assert.ok(/GAME_CONFIG\.BUILD/.test(autoplaySrc), 'tests/autoplay.js must read GAME_CONFIG.BUILD somewhere to stamp its CSV');
});

// ---------------------------------------------------------------
// ITEM B — CLAUDE.md trimmed under its cap, CONFIRMED WORKING reshaped
// ---------------------------------------------------------------

runTest('CLAUDE.md is under ' + CLAUDE_MD_UNDER_BYTES + ' bytes', () => {
  const bytes = Buffer.byteLength(claudeMd, 'utf8');
  assert.ok(bytes < CLAUDE_MD_UNDER_BYTES, 'CLAUDE.md is ' + bytes + ' bytes, must be under ' + CLAUDE_MD_UNDER_BYTES);
  assert.ok(CLAUDE_MD_UNDER_BYTES <= CLAUDE_MD_MAX_BYTES, 'CLAUDE_MD_MAX_BYTES (' + CLAUDE_MD_MAX_BYTES + ') must not be lower than the ' + CLAUDE_MD_UNDER_BYTES + '-byte target itself');
});

runTest('CLAUDE.md standing sections (everything before CONFIRMED WORKING) are byte-identical to the BUILD 158 backup\'s', () => {
  const backupClaudeMdPath = path.resolve(BACKUP_ROOT, 'CLAUDE.md');
  assert.ok(fs.existsSync(backupClaudeMdPath), 'BUILD 158 backup CLAUDE.md not found at ' + backupClaudeMdPath);
  const backupClaudeMd = fs.readFileSync(backupClaudeMdPath, 'utf8');

  const currentMarker = '# CONFIRMED WORKING';
  const currentIdx = claudeMd.indexOf(currentMarker);
  assert.ok(currentIdx !== -1, 'could not find # CONFIRMED WORKING in the current CLAUDE.md');
  const currentStanding = claudeMd.slice(0, currentIdx);

  const backupIdx = backupClaudeMd.indexOf(currentMarker);
  assert.ok(backupIdx !== -1, 'could not find # CONFIRMED WORKING in the BUILD 158 backup CLAUDE.md');
  const backupStanding = backupClaudeMd.slice(0, backupIdx);

  assert.strictEqual(currentStanding, backupStanding, 'the standing sections (everything before # CONFIRMED WORKING) must be byte-identical to the BUILD 158 backup — this build changes no mechanic, so nothing above CONFIRMED WORKING may change');
});

runTest('CLAUDE.md CONFIRMED WORKING has exactly one line for each build 141 to 159, and one line for builds 001 to 140', () => {
  const startIdx = claudeMd.indexOf('# CONFIRMED WORKING');
  const endIdx = claudeMd.indexOf('\n# CURRENT SUBSTAGE');
  assert.ok(startIdx !== -1 && endIdx !== -1 && endIdx > startIdx, 'could not locate the CONFIRMED WORKING section bounds');
  const section = claudeMd.slice(startIdx, endIdx);

  const aggregateMatches = section.match(/^\(BUILDs 001 to 140\).*$/m) || [];
  assert.strictEqual(aggregateMatches.length, 1, 'expected exactly one aggregate line for builds 001 to 140, found ' + aggregateMatches.length);

  for (let n = 141; n <= 159; n++) {
    const padded = String(n).padStart(3, '0');
    const re = new RegExp('^\\(BUILD ' + padded + '\\).*$|^\\(BUILD ' + n + '\\).*$', 'm');
    const matches = section.match(new RegExp(re.source, 'gm')) || [];
    assert.strictEqual(matches.length, 1, 'expected exactly one CONFIRMED WORKING line for BUILD ' + n + ', found ' + matches.length);
  }
});

runTest('every build number from 001 to 140 appears in HISTORY.md', () => {
  const missing = [];
  for (let n = 1; n <= 140; n++) {
    const padded = String(n).padStart(3, '0');
    if (historyMd.indexOf(padded) === -1) missing.push(padded);
  }
  assert.strictEqual(missing.length, 0, 'HISTORY.md is missing build number(s): ' + missing.join(', '));
});

const failed = results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log('\nFAILURES:');
  failed.forEach((r) => console.log('  ' + r.name + ': ' + r.error));
  process.exit(1);
}
console.log('\n' + results.length + '/' + results.length + ' build159 tests passed.');
