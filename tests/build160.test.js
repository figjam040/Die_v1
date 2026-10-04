// ============================================================
// TESTS/BUILD160.TEST.JS
// Standing regression suite for the CLAUDE.md size cap rise, 72,000 to
// 90,000 bytes (D-84 amended 25 Sep). Plain Node script, no browser
// needed — every assertion here is a source/text check.
// Run: node tests/build160.test.js
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { CLAUDE_MD_MAX_BYTES } = require('./shared-constants.js');

const ROOT = path.resolve(__dirname, '..');
const TESTS_DIR = __dirname;

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

const claudeMd = fs.readFileSync(path.resolve(ROOT, 'CLAUDE.md'), 'utf8');

// ---------------------------------------------------------------
// ITEM A — CLAUDE.md size cap rises from 72,000 to 90,000 bytes
// ---------------------------------------------------------------

runTest('CLAUDE_MD_MAX_BYTES is a whole number of bytes above CLAUDE.md\'s own size', () => {
  assert.ok(Number.isInteger(CLAUDE_MD_MAX_BYTES), 'CLAUDE_MD_MAX_BYTES must be an integer, found ' + CLAUDE_MD_MAX_BYTES);
  assert.ok(CLAUDE_MD_MAX_BYTES > fs.statSync(path.resolve(ROOT, 'CLAUDE.md')).size, 'CLAUDE.md is at or over CLAUDE_MD_MAX_BYTES');
});

runTest('no file in tests/ contains the literal 72000', () => {
  const oldCap = '72' + '000';
  const files = fs.readdirSync(TESTS_DIR)
    .filter((f) => fs.statSync(path.join(TESTS_DIR, f)).isFile())
    .filter((f) => f !== 'build160.test.js');
  const offenders = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(TESTS_DIR, f), 'utf8');
    if (src.indexOf(oldCap) !== -1) offenders.push(f);
  });
  assert.strictEqual(offenders.length, 0, 'the literal 72000 still appears in: ' + offenders.join(', ') + ' (scanned ' + (files.length + 1) + ' files in tests/, excluding this file)');
});

runTest('CLAUDE.md is under CLAUDE_MD_MAX_BYTES', () => {
  const size = Buffer.byteLength(claudeMd, 'utf8');
  assert.ok(size < CLAUDE_MD_MAX_BYTES, 'CLAUDE.md is ' + size + ' bytes, must be under ' + CLAUDE_MD_MAX_BYTES);
});

runTest('CLAUDE.md SIZE RULE line names the CLAUDE_MD_MAX_BYTES ceiling', () => {
  const sizeRuleLine = claudeMd.split('\n').find((line) => line.startsWith('SIZE RULE:'));
  assert.ok(sizeRuleLine, 'could not find the SIZE RULE line in CLAUDE.md');
  const named = CLAUDE_MD_MAX_BYTES.toLocaleString('en-US') + ' bytes';
  assert.ok(sizeRuleLine.indexOf(named) !== -1, 'the SIZE RULE line must name ' + named + ', found: ' + sizeRuleLine);
  assert.ok(sizeRuleLine.indexOf('72,000') === -1, 'the SIZE RULE line must not still name 72,000, found: ' + sizeRuleLine);
});

const failed = results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log('\nFAILURES:');
  failed.forEach((r) => console.log('  ' + r.name + ': ' + r.error));
  process.exit(1);
}
console.log('\n' + results.length + '/' + results.length + ' build160 tests passed.');
