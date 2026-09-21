// Runs tests/guardrails.test.js first, then every other tests/*.test.js in
// name order, one at a time, each with a 10 minute timeout. Never runs
// autoplay.js or screenshots.js. Run: node tests/run-all.js

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const TIMEOUT_MS = 10 * 60 * 1000;

const allTestFiles = fs.readdirSync(TESTS_DIR).filter(function(f) { return f.endsWith('.test.js'); });
const rest = allTestFiles.filter(function(f) { return f !== 'guardrails.test.js'; }).sort();
const ordered = ['guardrails.test.js'].concat(rest);

let anyFailed = false;

for (const file of ordered) {
  console.log('\n=== ' + file + ' ===');
  try {
    const output = execFileSync(process.execPath, [path.join(TESTS_DIR, file)], {
      timeout: TIMEOUT_MS,
      encoding: 'utf8'
    });
    process.stdout.write(output);
    const match = output.match(/(\d+)\/(\d+) [\w\s]*passed\./);
    console.log(file + ': ' + (match ? match[0] : 'passed (no summary line matched)'));
  } catch (err) {
    anyFailed = true;
    if (err.stdout) process.stdout.write(err.stdout);
    if (err.stderr) process.stderr.write(err.stderr);
    console.log(file + ': FAILED');
  }
}

process.exit(anyFailed ? 1 : 0);
