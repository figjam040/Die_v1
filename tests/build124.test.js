// ============================================================
// TESTS/BUILD124.TEST.JS — BUILD 124
// Regression tests for BUILD 124, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build124.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 124: tests/autoplay.js used to stamp its CSV output's `build`
  // column from its own hand-typed `const BUILD = 105`, never bumped since
  // the file was written — the same stale-stamp bug KI-18 closed for the
  // on-screen build stamp, found in this file's CSV column instead (flagged
  // by BUILD 123, fixed here). Closed by deleting the constant outright and
  // reading GAME_CONFIG.BUILD live off the page at row-build time instead.
  // BUILD 159 (KI-38, D-70): this test used to invoke the autoplayer's own
  // whole-run function to prove the CSV row's build column live — the
  // autoplayer must never run except when explicitly asked. Now a pure
  // source-text check: no own BUILD constant, and the CSV build column is
  // stamped from the same GAME_CONFIG.BUILD read this file reads elsewhere.
  // ---------------------------------------------------------------
  await runTest('BUILD 124: autoplay.js has no own BUILD constant and stamps its CSV from GAME_CONFIG.BUILD', async () => {
    const autoplaySrc = fs.readFileSync(path.resolve(__dirname, 'autoplay.js'), 'utf8');
    assert.ok(!/const\s+BUILD\s*=/.test(autoplaySrc), 'tests/autoplay.js must not declare its own BUILD constant — the CSV build column must come from GAME_CONFIG.BUILD instead');
    assert.ok(/build:\s*gameConfigBuild/.test(autoplaySrc), 'tests/autoplay.js must stamp its CSV row\'s `build` column from a GAME_CONFIG.BUILD read (gameConfigBuild), not a literal');
    assert.ok(/gameConfigBuild\s*=\s*await page\.evaluate\(function\(\)\s*\{\s*return GAME_CONFIG\.BUILD;\s*\}\)/.test(autoplaySrc), 'tests/autoplay.js must read gameConfigBuild live off the page via GAME_CONFIG.BUILD');
  });

  process.exit(report('build124') > 0 ? 1 : 0);
})();
