// Plain Node, no browser. Asserts the anti-bloat properties BUILD 143
// established: CLAUDE.md size, comment share per js file, stray files.
// Run: node tests/guardrails.test.js

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

// Files whose comment-share/run-length checks were reverted this build
// after failing AST-sameness twice — see the build's own paste-back.
const notYetTrimmed = [];

const results = [];

async function runTest(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log('PASS — ' + name);
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
    console.log('FAIL — ' + name + ': ' + err.message);
  }
}

function measureJs(src) {
  const n = src.length;
  let i = 0;
  let commentBytes = 0;
  let line = 1;
  const commentLines = new Set();

  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }

    if (c === '/' && src[i + 1] === '/') {
      const start = i;
      while (i < n && src[i] !== '\n') i++;
      commentBytes += Buffer.byteLength(src.slice(start, i), 'utf8');
      commentLines.add(line);
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const start = i;
      const startLine = line;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') line++;
        i++;
      }
      i = Math.min(i + 2, n);
      commentBytes += Buffer.byteLength(src.slice(start, i), 'utf8');
      for (let L = startLine; L <= line; L++) commentLines.add(L);
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '\n') line++;
        i++;
      }
      i++;
      continue;
    }
    i++;
  }

  return { totalBytes: Buffer.byteLength(src, 'utf8'), commentBytes, commentLines };
}

function measureHtml(src) {
  let commentBytes = 0;
  const htmlCommentRe = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = htmlCommentRe.exec(src))) commentBytes += Buffer.byteLength(m[0], 'utf8');
  const styleRe = /<style([^>]*)>([\s\S]*?)<\/style>/g;
  let sm;
  while ((sm = styleRe.exec(src))) {
    const cssCommentRe = /\/\*[\s\S]*?\*\//g;
    let cm;
    while ((cm = cssCommentRe.exec(sm[1]))) commentBytes += Buffer.byteLength(cm[0], 'utf8');
  }
  return { totalBytes: Buffer.byteLength(src, 'utf8'), commentBytes };
}

function longestCommentRun(commentLines) {
  const sorted = Array.from(commentLines).sort((a, b) => a - b);
  let longest = 0, run = 0, prev = null;
  for (const L of sorted) {
    if (prev !== null && L === prev + 1) run++; else run = 1;
    longest = Math.max(longest, run);
    prev = L;
  }
  return longest;
}

// FACTS block: js/config.js's own top-of-file comment, up through the
// "====" divider right before `const GAME_CONFIG =`, exempt from every
// comment-share/run-length check below.
function factsBlockLineRange(src) {
  const marker = 'const GAME_CONFIG';
  const idx = src.indexOf(marker);
  if (idx === -1) return { startLine: 0, endLine: 0 };
  const before = src.slice(0, idx);
  const endLine = before.split('\n').length;
  return { startLine: 1, endLine };
}

(async function main() {
  await runTest('CLAUDE.md is at most 80,000 bytes', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const bytes = Buffer.byteLength(src, 'utf8');
    assert.ok(bytes <= 80000, 'CLAUDE.md is ' + bytes + ' bytes, over the 80,000 byte guardrail');
  });

  await runTest('Every line in CONFIRMED WORKING is at most 300 characters', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const start = src.indexOf('# CONFIRMED WORKING');
    const end = src.indexOf('# CURRENT SUBSTAGE');
    assert.ok(start !== -1 && end !== -1 && end > start, 'CONFIRMED WORKING / CURRENT SUBSTAGE markers not found');
    const section = src.slice(start, end);
    const tooLong = section.split('\n').filter(function(l) { return l.length > 300; });
    assert.strictEqual(tooLong.length, 0, tooLong.length + ' line(s) over 300 characters in CONFIRMED WORKING');
  });

  await runTest('CURRENT SUBSTAGE is at most 4,000 bytes and names exactly one build, equal to GAME_CONFIG.BUILD', async () => {
    const claudeMd = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
    const start = claudeMd.indexOf('# CURRENT SUBSTAGE');
    assert.ok(start !== -1, 'CURRENT SUBSTAGE marker not found');
    const section = claudeMd.slice(start);
    const bytes = Buffer.byteLength(section, 'utf8');
    assert.ok(bytes <= 4000, 'CURRENT SUBSTAGE is ' + bytes + ' bytes, over the 4,000 byte limit');

    const buildNumbers = new Set(Array.from(section.matchAll(/BUILD (\d+)/g)).map(function(m) { return m[1]; }));
    assert.strictEqual(buildNumbers.size, 1, 'CURRENT SUBSTAGE names ' + buildNumbers.size + ' distinct build number(s), expected exactly 1');

    const configSrc = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
    const buildMatch = configSrc.match(/BUILD:\s*(\d+)/);
    assert.ok(buildMatch, 'GAME_CONFIG.BUILD not found in config.js');
    assert.strictEqual(Array.from(buildNumbers)[0], buildMatch[1], 'CURRENT SUBSTAGE build number does not match GAME_CONFIG.BUILD');
  });

  const jsDir = path.join(ROOT, 'js');
  const jsFiles = fs.readdirSync(jsDir).filter(function(f) { return f.endsWith('.js'); });

  for (const file of jsFiles) {
    await runTest('Comment share for js/' + file + ' is within its ceiling', async () => {
      if (notYetTrimmed.indexOf(file) !== -1) {
        console.log('  (skipped — ' + file + ' is in notYetTrimmed)');
        return;
      }
      const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
      const m = measureJs(src);
      const ceiling = file === 'config.js' ? 0.50 : 0.30;
      const share = m.commentBytes / m.totalBytes;
      assert.ok(share <= ceiling, file + ' comment share is ' + (share * 100).toFixed(1) + '%, over its ' + (ceiling * 100) + '% ceiling');
    });
  }

  await runTest('No run of comment lines in js/ is longer than 8 (12 for a header, unlimited for the FACTS block)', async () => {
    const offenders = [];
    for (const file of jsFiles) {
      if (notYetTrimmed.indexOf(file) !== -1) continue;
      const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
      const m = measureJs(src);
      const facts = file === 'config.js' ? factsBlockLineRange(src) : { startLine: 0, endLine: 0 };
      const nonFactsLines = new Set(Array.from(m.commentLines).filter(function(l) { return l < facts.startLine || l > facts.endLine; }));
      const longest = longestCommentRun(nonFactsLines);
      const cap = longest > 0 && nonFactsLines.has(1) ? 12 : 8;
      // A run starting at line 1 is the file's opening header — allow 12.
      const sorted = Array.from(nonFactsLines).sort(function(a, b) { return a - b; });
      let run = 0, prev = null, best = 0, bestStartsAtOne = false, curStartsAtOne = false;
      for (const L of sorted) {
        if (prev !== null && L === prev + 1) { run++; } else { run = 1; curStartsAtOne = (L - run + 1) === 1; }
        if (run > best) { best = run; bestStartsAtOne = curStartsAtOne; }
        prev = L;
      }
      const limit = bestStartsAtOne ? 12 : 8;
      if (best > limit) {
        offenders.push(file + ' (run of ' + best + ', limit ' + limit + ')');
      }
    }
    assert.strictEqual(offenders.length, 0, 'files with an over-long comment run: ' + offenders.join(', '));
  });

  await runTest('No comment in js/ outside the FACTS block, and no comment in index.html, names a build number', async () => {
    const offenders = [];
    for (const file of jsFiles) {
      const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
      const facts = file === 'config.js' ? factsBlockLineRange(src) : { startLine: 0, endLine: 0 };
      const lines = src.split('\n');
      lines.forEach(function(line, idx) {
        const lineNo = idx + 1;
        if (lineNo >= facts.startLine && lineNo <= facts.endLine) return;
        if (/\/\//.test(line) || /\/\*/.test(line)) {
          if (/BUILD\s*\d+/i.test(line)) offenders.push(file + ':' + lineNo);
        }
      });
    }
    const htmlSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const htmlComments = (htmlSrc.match(/<!--[\s\S]*?-->/g) || []).concat(
      Array.from(htmlSrc.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).flatMap(function(m) { return m[1].match(/\/\*[\s\S]*?\*\//g) || []; })
    );
    htmlComments.forEach(function(c) { if (/BUILD\s*\d+/i.test(c)) offenders.push('index.html: ' + c.slice(0, 60)); });
    assert.strictEqual(offenders.length, 0, 'comments naming a build number: ' + offenders.join(', '));
  });

  await runTest("index.html comment share is at most 20%", async () => {
    const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = measureHtml(src);
    const share = m.commentBytes / m.totalBytes;
    assert.ok(share <= 0.20, 'index.html comment share is ' + (share * 100).toFixed(1) + '%, over the 20% ceiling');
  });

  await runTest('tests/ holds no .png and nothing but the allowed script names', async () => {
    const testsDir = path.join(ROOT, 'tests');
    const allowedExact = ['screenshots.js', 'pngdiff.js', 'autoplay.js', 'run-all.js', 'guardrails.test.js'];
    const entries = fs.readdirSync(testsDir).filter(function(f) {
      return fs.statSync(path.join(testsDir, f)).isFile();
    });
    const offenders = entries.filter(function(f) {
      if (f.endsWith('.png')) return true;
      if (f.endsWith('.test.js')) return false;
      if (allowedExact.indexOf(f) !== -1) return false;
      if (f === 'autoplay_results.csv') return false; // git-ignored output, not a stray source file
      return true;
    });
    assert.strictEqual(offenders.length, 0, 'unexpected files in tests/: ' + offenders.join(', '));
  });

  await runTest('The repo root holds only the allowed files and folders', async () => {
    const allowed = ['.git', 'CLAUDE.md', 'HISTORY.md', 'index.html', 'package.json', 'package-lock.json', '.gitignore', 'js', 'tests',
      // fonts/ — the two self-hosted OFL font files the skin pass added.
      'fonts',
      // git-ignored working folders, documented in CLAUDE.md's PROJECT section or .gitignore
      'node_modules', 'backups', 'Archive', 'test-results', 'verify', 'verify_prev',
      'register_backup.json', 'run_record_master.csv', '.nojekyll', 'art', 'audio'];
    const entries = fs.readdirSync(ROOT);
    const offenders = entries.filter(function(f) { return allowed.indexOf(f) === -1; });
    assert.strictEqual(offenders.length, 0, 'unexpected entries in repo root: ' + offenders.join(', '));
  });

  if (notYetTrimmed.length > 0) {
    console.log('notYetTrimmed (comment checks skipped for these files): ' + notYetTrimmed.join(', '));
  }

  const failed = results.filter(function(r) { return !r.pass; });
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' guardrail tests passed.');
  if (failed.length > 0) {
    console.log('FAILURES:');
    failed.forEach(function(f) { console.log('  - ' + f.name + ': ' + f.error); });
    process.exit(1);
  }
  process.exit(0);
})();
