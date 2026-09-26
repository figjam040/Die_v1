// Standing regression suite for BUILD 180: documentation reconciliation.
// Run: node tests/build180.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createRunner } = require('./shared-constants');

const ROOT = path.resolve(__dirname, '..');
const CLAUDE_MD_BYTE_LIMIT = 85000;
const TOLLING_BELL_TEXT = 'When a blank triggers, gain 2 block, plus 1 for every blank you have rolled this fight.';
const STALE_CLAUDE_MD_STRINGS = [
  'no art ships this build',
  "Reverberation's blank sweep, D-127)",
  'native title',
  'Die — V1'
];

const { runTest, report } = createRunner();

const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
const configSrc = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8').replace(/\r/g, '');
const configHeader = configSrc.slice(0, configSrc.indexOf('const GAME_CONFIG'));
const headerLine = function(prefix) {
  return configHeader.split('\n').filter(function(l) { return l.indexOf('// ' + prefix + ' ') === 0; });
};

(async () => {
  await runTest('CLAUDE.md contains none of the ' + STALE_CLAUDE_MD_STRINGS.length + ' stale strings', async () => {
    const found = STALE_CLAUDE_MD_STRINGS.filter(function(s) { return claudeMd.indexOf(s) !== -1; });
    assert.deepStrictEqual(found, []);
  });

  await runTest('CLAUDE.md names D-126 for the Reverberation cap exemption', async () => {
    assert.ok(claudeMd.indexOf("Reverberation's blank sweep, D-126)") !== -1);
  });

  await runTest('config.js header has one F44 line naming the Anomaly', async () => {
    const f44 = headerLine('F44');
    assert.strictEqual(f44.length, 1, 'F44 lines in the header');
    assert.ok(/Anomaly/.test(f44[0]), f44[0]);
  });

  await runTest('config.js header has one F14 line naming the act 1 and 2 boss 1', async () => {
    const f14 = headerLine('F14');
    assert.strictEqual(f14.length, 1, 'F14 lines in the header');
    assert.ok(f14[0].indexOf('act 1 and 2 boss 1') !== -1, f14[0]);
  });

  await runTest('Tolling Bell text in cards-mods.js is the D-125 sentence', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'cards-mods.js'), 'utf8');
    const line = src.split('\n').filter(function(l) { return l.indexOf("id: 'tolling_bell'") !== -1; });
    assert.strictEqual(line.length, 1, 'tolling_bell definition lines');
    assert.ok(line[0].indexOf("text: '" + TOLLING_BELL_TEXT + "'") !== -1, line[0]);
  });

  await runTest('CLAUDE.md is under ' + CLAUDE_MD_BYTE_LIMIT.toLocaleString() + ' bytes (its own byte count)', async () => {
    const bytes = fs.statSync(path.join(ROOT, 'CLAUDE.md')).size;
    assert.ok(bytes < CLAUDE_MD_BYTE_LIMIT, 'CLAUDE.md is ' + bytes + ' bytes');
  });

  process.exit(report('build180') > 0 ? 1 : 0);
})();
