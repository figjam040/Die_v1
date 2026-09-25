// ============================================================
// TESTS/BUILD137.TEST.JS — BUILD 137
// Regression tests for BUILD 137, split out of tests/facts.test.js
// unchanged. Same shape as tests/build141.test.js: plain Node script,
// playwright launched directly, node:assert.
// Run: node tests/build137.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { FILE_URL, createRunner, freshPage, enterOpeningFight, advanceUntilPhase } = require('./shared-constants');

const { runTest, report } = createRunner();

(async () => {
  // ---------------------------------------------------------------
  // BUILD 137 (playtest readiness): Bound badge, two-mod name truncation,
  // and the round-trigger-cap log line printing at most once per round.
  // ---------------------------------------------------------------
  await runTest('BUILD 137: a printed-Bound face (Unison) shows the Bound badge', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'unison' }); // face 10
      updateDie({ faces: newFaces });
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10]; // rows render NAT 20 -> NAT 1, face 10 is the 10th from the bottom
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, text: badge ? badge.textContent : null };
    });
    assert.strictEqual(v.found, true, 'a face carrying a printed-Bound mod must show a .die-bound-badge on its die row');
    assert.strictEqual(v.text, 'Bound', 'the badge must read exactly "Bound"');
    await liveBrowser.close();
  });

  await runTest('BUILD 137: a face granted Bound for the fight shows the badge, then loses it at fight end', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const during = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'smite' }); // face 10, not printed-Bound
      updateDie({ faces: newFaces });
      grantBoundToFace(10);
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10];
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, text: badge ? badge.textContent : null };
    });
    assert.strictEqual(during.found, true, 'a face granted Bound for the fight must show the badge the moment it is granted');
    assert.strictEqual(during.text, 'Bound', 'the granted badge must also read exactly "Bound"');

    // Fight end — same resetFight()-based real code path the existing
    // mods.test.js "grantBoundToFace: the grant clears at fight end" test
    // uses (resetFight() -> clearFightScopedState(), run-and-map.js, which
    // strips modData.boundGranted but leaves the rest of the face alone).
    await page.evaluate(() => { resetFight(); });
    const after = await page.evaluate(() => {
      const row = document.querySelectorAll('#playerDieList .die-row')[20 - 10];
      const badge = row ? row.querySelector('.die-bound-badge') : null;
      return { found: !!badge, faceModId: gameState.die.faces[9].modId, boundGranted: !!(gameState.die.faces[9].modData && gameState.die.faces[9].modData.boundGranted) };
    });
    assert.strictEqual(after.boundGranted, false, 'modData.boundGranted must be cleared at fight end');
    assert.strictEqual(after.found, false, 'the Bound badge must be gone once the fight has ended, even though face 10 still carries smite');
    assert.strictEqual(after.faceModId, 'smite', 'the mod itself (not just the grant) must survive the fight, since only boundGranted is fight-scoped');
    await liveBrowser.close();
  });

  await runTest("BUILD 137: a two-mod face's row shows the start of both names with no ellipsis, full names on hover", async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      newFaces[9] = Object.assign({}, newFaces[9], { modId: 'congregation', modId2: 'magnificat' });
      updateDie({ faces: newFaces });
      const pair = document.querySelector('#playerDieList .die-mod-pair');
      const names = Array.from(pair.querySelectorAll('.die-mod'));
      // BUILD 161 (D-104/KI-41): the full names no longer sit on each
      // span's own native title — they're part of the row's one hover-tip.
      const rowTip = pair.closest('.die-row').querySelector('.hover-tip');
      return { names: names.map(n => n.textContent), rowTipText: rowTip ? rowTip.textContent : '', charCount: TWO_MOD_NAME_CHARS };
    });
    assert.strictEqual(v.names.length, 2, 'a two-mod face must render exactly two name spans');
    assert.strictEqual(v.names[0], 'Congregation'.slice(0, v.charCount), 'the first mod name must show its own truncated prefix, no ellipsis');
    assert.strictEqual(v.names[1], 'Magnificat'.slice(0, v.charCount), 'the second mod name must show its own truncated prefix, no ellipsis');
    assert.ok(v.names[0].indexOf('…') === -1 && v.names[1].indexOf('…') === -1, 'neither truncated name may contain an ellipsis character');
    assert.ok(v.rowTipText.indexOf('Congregation') !== -1, 'the full first name must be available via hover: ' + v.rowTipText);
    assert.ok(v.rowTipText.indexOf('Magnificat') !== -1, 'the full second name must be available via hover: ' + v.rowTipText);
    await liveBrowser.close();
  });

  await runTest('BUILD 137: the round-trigger-cap log line appears once even when the cap is hit many times in one round', async () => {
    const liveBrowser = await chromium.launch();
    const page = await freshPage(liveBrowser);
    await enterOpeningFight(page);
    const v = await page.evaluate(() => {
      const newFaces = gameState.die.faces.slice();
      for (let n = 2; n <= 19; n++) { newFaces[n - 1] = Object.assign({}, newFaces[n - 1], { modId: 'smite' }); }
      updateDie({ faces: newFaces });
      const results = [];
      for (let n = 2; n <= 19; n++) { results.push(triggerFaceOutsideRoll(n)); }
      const capLines = Array.from(document.querySelectorAll('#log > div')).filter(function(d) {
        return d.textContent.indexOf('round trigger cap (' + GAME_CONFIG.ROUND_TRIGGER_CAP + ') reached') !== -1;
      });
      return { refusedCount: results.filter(function(r) { return r === false; }).length, capLineCount: capLines.length, cap: GAME_CONFIG.ROUND_TRIGGER_CAP };
    });
    assert.ok(v.refusedCount > 1, 'this batch must refuse the cap more than once, or the test proves nothing (got ' + v.refusedCount + ')');
    assert.strictEqual(v.capLineCount, 1, 'the cap-reached log line must appear exactly once despite ' + v.refusedCount + ' refusals this round');
    await liveBrowser.close();
  });

  process.exit(report('build137') > 0 ? 1 : 0);
})();
