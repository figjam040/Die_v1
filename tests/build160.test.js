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

runTest('CLAUDE_MD_MAX_BYTES is 90000', () => {
  assert.strictEqual(CLAUDE_MD_MAX_BYTES, 90000, 'CLAUDE_MD_MAX_BYTES must be 90000, found ' + CLAUDE_MD_MAX_BYTES);
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

runTest('CLAUDE.md is under 90,000 bytes', () => {
  const bytes = Buffer.byteLength(claudeMd, 'utf8');
  assert.ok(bytes < 90000, 'CLAUDE.md is ' + bytes + ' bytes, must be under 90,000');
});

runTest('CLAUDE.md SIZE RULE line names 90,000', () => {
  const sizeRuleLine = claudeMd.split('\n').find((line) => line.startsWith('SIZE RULE:'));
  assert.ok(sizeRuleLine, 'could not find the SIZE RULE line in CLAUDE.md');
  assert.ok(sizeRuleLine.indexOf('90,000 bytes') !== -1, 'the SIZE RULE line must name 90,000 bytes, found: ' + sizeRuleLine);
  assert.ok(sizeRuleLine.indexOf('72,000') === -1, 'the SIZE RULE line must not still name 72,000, found: ' + sizeRuleLine);
});

const failed = results.filter((r) => !r.pass);
if (failed.length > 0) {
  console.log('\nFAILURES:');
  failed.forEach((r) => console.log('  ' + r.name + ': ' + r.error));
  process.exit(1);
}
console.log('\n' + results.length + '/' + results.length + ' build160 tests passed.');
