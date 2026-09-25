// ============================================================
// TESTS/BUILD109.TEST.JS — BUILD 109
// Regression tests for BUILD 109, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build109.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // BUILD 109 — the run record. Not an F-number (nothing on the Notion
  // page names this), so these are named descriptively rather than F-NN,
  // matching this file's own convention for non-fact behavioural checks.
  // ---------------------------------------------------------------

  await runTest('Run record: a Load offer and its pick are both recorded', async () => {
    const page = await freshPage(browser);
    const result = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad();
      const offeredMods = dieActionMods.slice();
      const chosenMod = offeredMods[0];
      dieActionPickMod(chosenMod);
      dieActionPickLoadFace(2); // face 2 is blank on a fresh die
      return { events: gameState.runRecord.dieActionEvents.slice(), offeredMods, chosenMod };
    });
    assert.strictEqual(result.events.length, 1, 'expected exactly one recorded die-action event');
    assert.strictEqual(result.events[0].type, 'load');
    assert.deepStrictEqual(result.events[0].offered, result.offeredMods, 'the offer itself must be recorded verbatim');
    assert.strictEqual(result.events[0].picked, result.chosenMod, 'the pick must be recorded against that same offer');
    await page.close();
  });

  await runTest('Run record: a Skip is recorded as a skip', async () => {
    const page = await freshPage(browser);
    const events = await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseSkip();
      return gameState.runRecord.dieActionEvents.slice();
    });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, 'skip');
    await page.close();
  });

  await runTest('Run record: a mod in a second slot records its own trigger count', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[1] = Object.assign({}, newFaces[1], { modId: 'smite', modId2: 'blight' }); // face 2
      updateDie({ faces: newFaces });
    });
    await page.evaluate(() => { forcePlayerRoll(2); });
    await advanceUntilPhase(page, 'CARD_PHASE');
    const counts = await page.evaluate(() => collectTriggerCountsByMod());
    assert.strictEqual(counts.smite, 1, 'expected the first-slot mod (smite) to have its own count');
    assert.strictEqual(counts.blight, 1, 'expected the second-slot mod (blight) to have its own, independent count');
    await page.close();
  });

  await runTest('Run record: an abandoned run keeps its offers', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page); // marks started:true, node:'opening'
    await page.evaluate(() => {
      openDieActionScreen();
      dieActionChooseLoad(); // offer shown, never resolved
    });
    // BUILD 136: #startGameBtn now works even while a die-action panel is
    // open (its own click handler dismisses the panel, bootstrap.js) — this
    // test still calls flushRunRecord()/startNewRun() directly rather than
    // a UI click, since the realistic way this abandon shape happens is a
    // closed tab (beforeunload), not a New Run click; see the BUILD 136
    // tests below for New Run's own mid-panel behaviour.
    await page.evaluate(() => { flushRunRecord('abandoned'); startNewRun(); });
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dieRunRecordLines') || '[]'));
    assert.strictEqual(stored.length, 1, 'expected exactly one flushed line');
    const cols = stored[0].split(',');
    // source,node,arrivalHpAtBoss,outcome,fightRounds,totalRounds,dieActionEvents,triggerCounts
    assert.strictEqual(cols[1], 'opening', 'node reached must be preserved');
    assert.strictEqual(cols[3], 'abandoned', 'outcome must read abandoned');
    assert.ok(cols[6].indexOf('load:') === 0, 'the shown-but-unresolved offer must survive the abandon flush: ' + cols[6]);
    await page.close();
  });

  await runTest('Run record: round counts are captured per fight and for the run', async () => {
    const page = await freshPage(browser);
    await enterOpeningFight(page);
    // Two full rounds (7 phases each, cycling back to ROLL_PHASE) driven
    // via the real nextPhase() — no shortcut.
    for (let i = 0; i < 14; i++) {
      await page.evaluate(() => { nextPhase(); });
    }
    const roundBeforeWin = await page.evaluate(() => gameState.turn.round);
    // Force the win directly (Law 3-compliant, via updateEnemy) rather than
    // grinding out real damage — nextPhase() then hits runPhase()'s own
    // top-of-function win guard, the exact same real code path a genuine
    // kill uses, on whichever phase happens to come next.
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    const fightRounds = await page.evaluate(() => gameState.runRecord.fightRounds.slice());
    assert.strictEqual(fightRounds.length, 1, 'expected exactly one completed-fight entry');
    assert.strictEqual(fightRounds[0].rounds, roundBeforeWin, 'the completed fight\'s own round count must match turn.round at the moment it ended');
    const line = await page.evaluate(() => buildRunRecordLine());
    const totalRoundsCol = Number(line.split(',')[5]);
    assert.strictEqual(totalRoundsCol, roundBeforeWin, 'total rounds (one fight so far) must equal that fight\'s own round count');
    await page.close();
  });

  await browser.close();
  process.exit(report('build109') > 0 ? 1 : 0);
})();
