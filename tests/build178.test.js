// Standing regression suite for BUILD 178: seeded screenshots, a commit-based
// compare, CLAUDE.md and config.js header housekeeping.
// Run: node tests/build178.test.js

const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { createRunner } = require('./shared-constants');
const { diffBoxes } = require('./pngdiff');
const { SCREENS, SEED, captureAll } = require('./screenshots');

const ROOT = path.resolve(__dirname, '..');
const { pathToFileURL } = require('url');
const INDEX_URL = pathToFileURL(path.join(ROOT, 'index.html')).href;
const CLAUDE_MD_BYTE_LIMIT = 85000;
const CONFIG_COMMENT_CEILING = 0.50;

const { runTest, report } = createRunner();

// Comment bytes of a line: everything from the first // that is not inside a quote.
function lineCommentBytes(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '/' && line[i + 1] === '/') return Buffer.byteLength(line.slice(i));
  }
  return 0;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'die-b178-'));
  const browser = await chromium.launch();
  const stampHiddenByShot = {};
  const recordStamp = async (page, name) => {
    stampHiddenByShot[name] = await page.evaluate(() => getComputedStyle(document.getElementById('buildStamp')).visibility);
  };
  const runA = await captureAll(browser, INDEX_URL, path.join(tmp, 'a'), recordStamp);
  const runB = await captureAll(browser, INDEX_URL, path.join(tmp, 'b'), null);
  await browser.close();

  await runTest('two runs at seed ' + SEED + ' of the fight shot are pixel-identical (changed pixels: 0)', async () => {
    const d = diffBoxes(path.join(tmp, 'a', 'fight.png'), path.join(tmp, 'b', 'fight.png'));
    assert.ok(d.comparable, d.reason);
    assert.strictEqual(d.changedPixels, 0, 'changed pixels between two seeded fight shots');
  });

  await runTest('two runs at seed ' + SEED + ' of every screen are pixel-identical (screens compared: ' + SCREENS.length + ')', async () => {
    const differing = SCREENS.filter(function(name) {
      const d = diffBoxes(path.join(tmp, 'a', name + '.png'), path.join(tmp, 'b', name + '.png'));
      return !d.comparable || d.changedPixels !== 0;
    });
    assert.deepStrictEqual(differing, []);
    assert.deepStrictEqual(runA.consoleErrors.concat(runA.pageErrors, runB.consoleErrors, runB.pageErrors), []);
  });

  await runTest('#buildStamp is hidden in every one of the ' + SCREENS.length + ' shots', async () => {
    assert.deepStrictEqual(Object.keys(stampHiddenByShot), SCREENS);
    SCREENS.forEach(function(name) { assert.strictEqual(stampHiddenByShot[name], 'hidden', name + ' stamp visibility'); });
  });

  await runTest('screenshots.js keeps no verify_prev folder or code, and verify_prev/ is gone', async () => {
    assert.ok(!/verify_prev|rotatePreviousSet/.test(fs.readFileSync(path.join(__dirname, 'screenshots.js'), 'utf8')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'verify_prev')));
  });

  await runTest('--from=HEAD --compare=HEAD reports zero changed pixels (total) and zero on each of the ' + SCREENS.length + ' screens', async () => {
    const out = execFileSync('node', [path.join(__dirname, 'screenshots.js'), '--from=HEAD', '--compare=HEAD'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    assert.ok(/total changed pixels: 0\b/.test(out), 'compare output:\n' + out);
    SCREENS.forEach(function(name) {
      assert.ok(new RegExp('^' + name + ': 0 / \\d+ pixels changed', 'm').test(out), name + ' line in:\n' + out);
    });
  });

  await runTest('CLAUDE.md is under ' + CLAUDE_MD_BYTE_LIMIT.toLocaleString() + ' bytes (its own byte count)', async () => {
    const bytes = fs.statSync(path.join(ROOT, 'CLAUDE.md')).size;
    assert.ok(bytes < CLAUDE_MD_BYTE_LIMIT, 'CLAUDE.md is ' + bytes + ' bytes');
  });

  await runTest('config.js header has exactly one F52 line, after F51, and the file stays under its ' + CONFIG_COMMENT_CEILING * 100 + '% comment share', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8').replace(/\r/g, '');
    const header = src.slice(0, src.indexOf('const GAME_CONFIG'));
    const f52 = header.split('\n').filter(function(l) { return /^\/\/ F52 /.test(l); });
    assert.strictEqual(f52.length, 1, 'F52 lines in the header');
    assert.ok(/counts rolls only/.test(f52[0]), 'F52 text');
    assert.ok(header.indexOf('// F52 ') > header.indexOf('// F51 '), 'F52 comes after F51');
    let commentBytes = 0;
    src.split('\n').forEach(function(l) { commentBytes += lineCommentBytes(l); });
    const share = commentBytes / Buffer.byteLength(src);
    assert.ok(share <= CONFIG_COMMENT_CEILING, 'config.js comment share is ' + (share * 100).toFixed(1) + '%');
  });

  await runTest('HISTORY.md holds the "Moved from CLAUDE.md at BUILD 178" heading', async () => {
    assert.ok(/^# Moved from CLAUDE\.md at BUILD 178/m.test(fs.readFileSync(path.join(ROOT, 'HISTORY.md'), 'utf8')));
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(report('build178') > 0 ? 1 : 0);
})();
