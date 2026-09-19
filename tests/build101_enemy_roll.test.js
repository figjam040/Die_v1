// BUILD 101 verification script — not part of the nine-file game bundle,
// standalone like tests/mods.test.js. Drives a real boss fight via the
// existing dev tools (devChromeOpen, devJumpToSlot('boss'), forceEnemyRoll)
// to force a deterministic enemy poison-buff trigger, screenshots the roll
// strip on the round it lands, and dumps the log lines proving the roll
// resolved and the stack count it produced.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  page.on('dialog', function(d) { d.accept(); });

  // Open dev chrome so forceEnemyRoll()/devJumpToSlot() are live.
  await page.click('#devChromeToggleBtn');

  // Start a run, then jump straight to the boss fight (dev-only shortcut,
  // wired the same way the real fork/lane nodes are, just gated on
  // devChromeOpen instead of normal progression).
  await page.click('#startGameBtn');
  await page.evaluate(() => devJumpToSlot('boss', null));

  const results = [];
  let round = 0;
  let guard = 0;
  let screenshotTaken = false;

  while (round < 4 && guard < 200) {
    guard++;
    const phase = await page.evaluate(() => gameState.turn.phase);

    if (phase === 'ENEMY_ROLL_PHASE') {
      // Force face 5 — one of the boss's three loaded poison faces
      // (5/10/15, per CLAUDE.md's ENEMY DIE PER TYPE) — so a buff trigger
      // is guaranteed on every round instead of left to a ~15% roll.
      // updateTurn()/updateEnemy() re-render synchronously (state.js), so
      // the roll strip already shows the held highlight immediately after
      // this call, before ENEMY_ACT_PHASE is ever entered.
      await page.evaluate(() => forceEnemyRoll(5));

      if (!screenshotTaken) {
        const stacksAfter = await page.evaluate(() => gameState.player.poisonStacks);
        const roundNow = await page.evaluate(() => gameState.turn.round);
        await page.locator('#fightScreen').screenshot({
          path: path.resolve(__dirname, 'build101_roll_strip.png')
        });
        screenshotTaken = true;
        results.push('SCREENSHOT taken at round ' + roundNow + ', player poisonStacks now ' + stacksAfter);
      }
    }

    await page.click('#devNextPhaseBtn');

    round = await page.evaluate(() => gameState.turn.round);
  }

  const logLines = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#log > div')).map(function(d) { return d.textContent; })
  );

  const relevant = logLines.filter(function(l) {
    return l.indexOf('[ENEMY ROLL]') === 0 || l.indexOf('[ENEMY]') === 0 || l.indexOf('[PHASE]') === 0;
  });

  console.log('--- Rounds reached: ' + round + ' ---');
  console.log(results.join('\n'));
  console.log('--- Relevant log lines (last 60) ---');
  console.log(relevant.slice(-60).join('\n'));

  await browser.close();
})();
