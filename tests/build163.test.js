// Standing regression suite for KI-43 (no byte-identical standing check) and
// KI-44 (config.js header fact numbers). Source/text checks only.
// Run: node tests/build163.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const read = (...p) => fs.readFileSync(path.resolve(__dirname, '..', ...p), 'utf8');
const results = [];
function runTest(name, fn) {
  try { fn(); results.push({ name, pass: true }); console.log('PASS — ' + name); }
  catch (err) { results.push({ name, pass: false, error: err.message }); console.log('FAIL — ' + name + ': ' + err.message); }
}

const claudeMd = read('CLAUDE.md');
const configSrc = read('js', 'config.js');
const header = configSrc.slice(0, configSrc.indexOf('const GAME_CONFIG'));
const layoutStart = claudeMd.indexOf('# SCREEN LAYOUT');
const layout = claudeMd.slice(layoutStart, claudeMd.indexOf('\n# CONFIRMED WORKING', layoutStart));
const headerLine = (n) => header.split('\n').filter((l) => new RegExp('^// F' + n + ' ').test(l));

runTest('tests/build159.test.js contains no reference to a backup folder', () => {
  assert.ok(!/backup/i.test(read('tests', 'build159.test.js')), 'build159.test.js still mentions a backup');
});

runTest('SCREEN LAYOUT names DIE_ROLL_ANIMATION and does not say #enemyDieList is hidden', () => {
  assert.ok(layout.includes('DIE_ROLL_ANIMATION'), 'SCREEN LAYOUT lacks DIE_ROLL_ANIMATION');
  assert.ok(!/#enemyDieList[^.]*display:\s*none/.test(layout), '#enemyDieList still described as display:none');
  assert.ok(!/#enemyDieList stays in the DOM/.test(layout), 'old hidden-row sentence still present');
});

runTest('config.js header has exactly one line each for F47, F48, F49, F50, each with its own content', () => {
  [47, 48, 49, 50].forEach((n) => assert.strictEqual(headerLine(n).length, 1, 'F' + n + ' line count ' + headerLine(n).length));
  assert.ok(/Hierophant/.test(headerLine(47)[0]), 'F47 lacks Hierophant');
  assert.ok(/floor/.test(headerLine(48)[0]), 'F48 lacks floor');
  assert.ok(/face row/.test(headerLine(49)[0]), 'F49 lacks the enemy row');
  assert.ok(/DIE_ROLL_ANIMATION/.test(headerLine(50)[0]), 'F50 lacks DIE_ROLL_ANIMATION');
});

const failed = results.filter((r) => !r.pass);
if (failed.length > 0) process.exit(1);
console.log('\n' + results.length + '/' + results.length + ' build163 tests passed.');
