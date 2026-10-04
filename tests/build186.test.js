// Standing regression suite for BUILD 186: cache-safe script tags, RULES FOR
// EVERY BUILD, and the limit-literal guardrail.
// Run: node tests/build186.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createRunner, limitLiteralLines } = require('./shared-constants');

const ROOT = path.resolve(__dirname, '..');
const { runTest, report } = createRunner();

const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').replace(/\r/g, '');
const configSrc = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const build = Number(configSrc.match(/^\s*BUILD:\s*(\d+)/m)[1]);

(async () => {
  await runTest('GAME_CONFIG.BUILD is read from config.js as a whole number', async () => {
    assert.ok(Number.isInteger(build) && build >= 186, 'BUILD is ' + build);
  });

  await runTest('all fifteen script tags carry ?v= equal to GAME_CONFIG.BUILD', async () => {
    const srcs = Array.from(html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)).map(function(m) { return m[1]; });
    assert.strictEqual(srcs.length, 15, 'script tags found');
    const wrong = srcs.filter(function(src) { return !new RegExp('^js/[a-z-]+\\.js\\?v=' + build + '$').test(src); });
    assert.deepStrictEqual(wrong, [], 'script tags without ?v=' + build);
  });

  // BUILD 188 rewrote the section as three paragraphs: standing rules, build order, paste-back.
  await runTest('the RULES FOR EVERY BUILD heading exists, once, with its standing rules', async () => {
    const heads = claudeMd.split('\n').filter(function(row) { return row === '# RULES FOR EVERY BUILD'; });
    assert.strictEqual(heads.length, 1, 'RULES FOR EVERY BUILD headings');
    const start = claudeMd.indexOf('# RULES FOR EVERY BUILD');
    const end = claudeMd.indexOf('\n---', start);
    const rules = claudeMd.slice(start, end).split('\n').slice(1).filter(function(row) { return row.trim() !== ''; });
    assert.strictEqual(rules.length, 3, 'rules: ' + rules.join(' | '));
    const text = rules.join('\n');
    ['Edit tool only', 'one Edit per message', 'One command per message', 'cd /c/Users/figja/Die_v1 &&', 'Stop on red', 'no push', 'Do only the numbered steps', 'Progress percentage']
      .forEach(function(needle) { assert.ok(text.indexOf(needle) !== -1, 'missing: ' + needle); });
  });

  await runTest('the shadowed-constant detector flags every kind of literal limit and passes clean lines', async () => {
    const bad = [
      ['const X_MAX_LINES', '=', '1500;'].join(' '),
      ['if (bytes', '<', '90000)'].join(' '),
      ['assert.ok(Buffer.byteLength(src)', '<=', '4000)'].join(' '),
      ['filter(l => l.length', '>', '300)'].join(' '),
      ['strictEqual(CLAUDE_MD_MAX_BYTES,', '90000)'].join(' '),
      ["runTest('at most 72", "000 bytes')"].join(','),
      ['title: under 300', 'characters'].join(' ')
    ];
    bad.forEach(function(row) { assert.strictEqual(limitLiteralLines(row).length, 1, 'not flagged: ' + row); });
    const clean = [
      "const { CLAUDE_MD_MAX_BYTES } = require('./shared-constants');",
      'assert.ok(bytes < CLAUDE_MD_MAX_BYTES);',
      'assert.ok(lines <= TEST_FILE_MAX_LINES);',
      '// bytes < ' + '9' + '0000 in a comment',
      'await page.waitForTimeout(300);'
    ];
    clean.forEach(function(row) { assert.strictEqual(limitLiteralLines(row).length, 0, 'wrongly flagged: ' + row); });
  });

  await runTest('guardrails.test.js runs the detector over every test file but shared-constants.js, and none is flagged', async () => {
    const guard = fs.readFileSync(path.join(ROOT, 'tests', 'guardrails.test.js'), 'utf8');
    assert.ok(guard.indexOf('limitLiteralLines(') !== -1, 'guardrails.test.js does not call limitLiteralLines');
    const testsDir = path.join(ROOT, 'tests');
    const offenders = [];
    fs.readdirSync(testsDir).filter(function(f) { return f.endsWith('.js') && f !== 'shared-constants.js'; }).forEach(function(f) {
      limitLiteralLines(fs.readFileSync(path.join(testsDir, f), 'utf8')).forEach(function(row) { offenders.push(f + ': ' + row.trim()); });
    });
    assert.deepStrictEqual(offenders, []);
  });

  process.exit(report('build186') > 0 ? 1 : 0);
})();
