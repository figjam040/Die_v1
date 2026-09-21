// One-off capture script (BUILD 141, step 3q) — captures the BUILD 140
// baseline for assertion 6i: seeded Math.random (same seed/shape as the
// BUILD 129 test in tests/facts.test.js's page.addInitScript approach),
// starts a run, enters the opening fight, and records the first 8 enemy
// intent values, ending each round with no cards played. Run against a
// TARGET_URL pointing at the pre-BUILD-141 backup so this captures the true
// "before" behaviour. Writes tests/build141_seed_baseline.json.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET = process.argv[2] || path.resolve(__dirname, '..', 'index.html');
const FILE_URL = 'file://' + TARGET.replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('dialog', function(d) { d.accept(); });
  await page.addInitScript(() => {
    let seed = 12345;
    Math.random = function() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => { devChromeOpen = true; });
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');

  const values = [];
  for (let i = 0; i < 8; i++) {
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE' || gameState.turn.phase === 'CARD_PHASE');
    const v = await page.evaluate(() => gameState.enemy.intent);
    values.push(v);
    await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
    await page.evaluate(() => { autoAdvance(); });
    await page.waitForFunction((round) => gameState.turn.round > round || gameState.run.status !== 'active', i + 1, { timeout: 15000 }).catch(() => {});
  }
  console.log('Captured baseline:', values);
  fs.writeFileSync(path.resolve(__dirname, 'build141_seed_baseline.json'), JSON.stringify(values));
  await browser.close();
})();
