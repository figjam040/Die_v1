// Standing regression suite for BUILD 188: old build tests deleted, CLAUDE.md
// cut to rules and architecture, RULES FOR EVERY BUILD with the paste-back
// shape, config.js's FACTS block exempt from the comment-share check.
// Run: node tests/build188.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createRunner, CLAUDE_MD_MAX_BYTES, withoutFactsBlock, factsBlockProblems } = require('./shared-constants');

const ROOT = path.resolve(__dirname, '..');
const { runTest, report } = createRunner();

const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r/g, '');
const headings = claudeMd.split('\n').filter(function(row) { return row.startsWith('# '); }).map(function(row) { return row.slice(2); });

const KEPT_HEADINGS = [
  'PROJECT', 'WHAT THIS GAME IS', 'SCOPE — V1', 'THREE LAWS — NEVER VIOLATE', 'TERMINOLOGY', 'STATE SCHEMA',
  'STATE HELPERS — USE THESE, NOTHING ELSE', 'PHASE ORDER — NEVER CHANGE', 'LISTENER API', 'DAMAGE PIPELINE',
  'ROUNDING', 'DECK STORAGE', 'CARD OBJECT STRUCTURE', 'DIE FACE OBJECT STRUCTURE', 'MULTI-MOD FACES',
  'OUTSIDE-ROLL TRIGGER', 'BOUND ENGINE', 'WEIGHTED ROLL ALGORITHM', 'CLASS OBJECT STRUCTURE',
  'MOD OBJECT STRUCTURE', 'AUDIO MODULE', 'FIGHT RESET', 'RUN RECORD', 'INIT FUNCTION',
  'RULES FOR EVERY BUILD', 'WHO EDITS THIS FILE', 'CONFIRMED WORKING', 'CURRENT SUBSTAGE'
];
const DELETED_HEADINGS = [
  'CORE NUMBERS', 'EVENT HOOKS — COMPLETE LIST', 'CARDS', 'THE HOP', 'MODS', 'ENEMY DIE PER TYPE', 'ACTS',
  "THE FONT (Anomaly slot, id 'font')", 'GOLD, SHOP AND ARTIFACTS', 'BUILD METHODOLOGY',
  'DEV MODE — ALWAYS PRESENT, NEVER SHIPS', 'SCREEN LAYOUT'
];

const FIXTURE_FACTS = [
  '// ==========',
  '// CONFIG.JS',
  '//',
  '// FACTS — one line per fact.',
  '//',
  '// F01 player HP 70 · F02 soul 3',
  '// F03 draw 5',
  '// =========='
].join('\n');
const FIXTURE_BODY = 'const GAME_CONFIG = {\n  PLAYER_HP: 70,\n  SOUL: 3\n};\n';

function commentLineShare(src) {
  const rows = src.split('\n').filter(function(row) { return row.trim() !== ''; });
  return rows.filter(function(row) { return row.trim().startsWith('//'); }).length / rows.length;
}

(async () => {
  await runTest('no tests/buildNNN.test.js below build180 exists', async () => {
    const old = fs.readdirSync(__dirname).filter(function(f) {
      const m = f.match(/^build(\d+)\.test\.js$/);
      return m && Number(m[1]) < 180;
    });
    assert.deepStrictEqual(old, []);
  });

  await runTest('CLAUDE.md is under CLAUDE_MD_MAX_BYTES (' + CLAUDE_MD_MAX_BYTES + ')', async () => {
    const bytes = fs.statSync(path.join(ROOT, 'CLAUDE.md')).size;
    assert.ok(bytes < CLAUDE_MD_MAX_BYTES, 'CLAUDE.md is ' + bytes + ' bytes');
  });

  await runTest('CLAUDE.md keeps every kept heading, once each', async () => {
    const missing = KEPT_HEADINGS.filter(function(h) { return headings.filter(function(x) { return x === h; }).length !== 1; });
    assert.deepStrictEqual(missing, []);
  });

  await runTest('CLAUDE.md no longer carries a deleted heading', async () => {
    const left = DELETED_HEADINGS.filter(function(h) { return headings.indexOf(h) !== -1; });
    assert.deepStrictEqual(left, []);
  });

  await runTest('RULES FOR EVERY BUILD holds Stop on red and the Paste-back shape', async () => {
    const start = claudeMd.indexOf('# RULES FOR EVERY BUILD');
    const end = claudeMd.indexOf('\n---', start);
    assert.ok(start !== -1 && end > start, 'section not found');
    const section = claudeMd.slice(start, end);
    ['Paste-back', 'Stop on red', 'Every build, in order:', 'Fergus looks at'].forEach(function(needle) {
      assert.ok(section.indexOf(needle) !== -1, 'missing: ' + needle);
    });
  });

  await runTest('FACTS exemption on a fixture: the block is found, dropped from the share, and the body measured alone', async () => {
    const fixture = FIXTURE_FACTS + '\n' + FIXTURE_BODY;
    assert.deepStrictEqual(factsBlockProblems(fixture), []);
    assert.ok(commentLineShare(fixture) > 0.5, 'fixture should be mostly comment');
    const body = withoutFactsBlock(fixture);
    assert.ok(body.startsWith('const GAME_CONFIG'), body.slice(0, 40));
    assert.strictEqual(commentLineShare(body), 0);
  });

  await runTest('FACTS check fails a fixture whose block is missing or not at the top', async () => {
    assert.ok(factsBlockProblems(FIXTURE_BODY).length > 0, 'no block');
    assert.ok(factsBlockProblems('const X = 1;\n' + FIXTURE_FACTS + '\n' + FIXTURE_BODY).length > 0, 'code above the block');
    assert.ok(factsBlockProblems(FIXTURE_FACTS.replace('// FACTS', '// NOTES') + '\n' + FIXTURE_BODY).length > 0, 'no FACTS line');
  });

  await runTest('guardrails.test.js measures config.js through withoutFactsBlock and asserts the block exists', async () => {
    const guard = fs.readFileSync(path.join(__dirname, 'guardrails.test.js'), 'utf8');
    assert.ok(guard.indexOf('withoutFactsBlock(raw)') !== -1, 'share check does not exempt the FACTS block');
    assert.ok(guard.indexOf('factsBlockProblems(src)') !== -1, 'no FACTS block existence check');
  });

  process.exit(report('build188') > 0 ? 1 : 0);
})();
