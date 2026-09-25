// Standing regression suite for BUILD 176: the loaded face's hover as the
// offer box (D-128), the DIE layer as one table (D-129), weight as a line
// under the face (D-130), the flat rattle and landing gap, three dev drawer
// controls, and blanks rolled in the run record (KI-52).
// Run: node tests/build176.test.js

const { chromium } = require('playwright');
const assert = require('assert');
const { createRunner, FILE_URL } = require('./shared-constants');

const { runTest, report } = createRunner();

async function freshFight(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  await page.evaluate(() => {
    window.rowFor = n => [...document.querySelectorAll('#playerDieList .die-row')].find(r => r.querySelector('.face-num').textContent === String(n));
    devChromeOpen = true;
    enterSlot('opening', null);
  });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

// Face 2 holds Smite then Blight, through the real dev loader.
async function loadTwoModFace(page) {
  await page.evaluate(() => {
    document.getElementById('devModSelect').value = 'smite';
    document.getElementById('devFaceInput').value = '2';
    devLoadMod();
    document.getElementById('devModSelect').value = 'blight';
    devLoadMod();
  });
}

function setWeight(page, faceNumber, weight) {
  return page.evaluate(([n, w]) => {
    updateDie({ faces: gameState.die.faces.map(f => f.number === n ? Object.assign({}, f, { weight: w }) : f) });
  }, [faceNumber, weight]);
}

// Playwright locator text for hovering; in-page code uses window.rowFor
// (installed by freshFight), since :text-is() is not a DOM selector.
const rowOf = (n) => '#playerDieList .die-row:has(.face-num:text-is("' + n + '"))';

(async () => {
  const browser = await chromium.launch();

  await runTest('ROLL_LAND_GAP_MS is 250', async () => {
    const page = await freshFight(browser);
    assert.strictEqual(await page.evaluate(() => GAME_CONFIG.ROLL_LAND_GAP_MS), 250);
    await page.close();
  });

  await runTest('the rattle is four ticks, all at 644 Hz with no pitch movement, and ends at or under 200 ms', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      const realTimeout = window.setTimeout;
      const realTone = window.playTone;
      const ticks = [];
      let delayNow = 0;
      window.setTimeout = function(fn, d) { const prev = delayNow; delayNow = d; fn(); delayNow = prev; return 0; };
      window.playTone = function(wave, from, to, ms) { ticks.push({ from: from, to: to, endsAtMs: delayNow + ms }); };
      SOUND_TABLE.die_rolling();
      window.setTimeout = realTimeout;
      window.playTone = realTone;
      return ticks;
    });
    assert.strictEqual(v.length, 4, 'ticks played: ' + v.length);
    v.forEach(t => { assert.strictEqual(t.from, 644); assert.strictEqual(t.to, 644); });
    assert.ok(Math.max.apply(null, v.map(t => t.endsAtMs)) <= 200, 'rattle ends at ' + Math.max.apply(null, v.map(t => t.endsAtMs)) + ' ms');
    await page.close();
  });

  await runTest('the landing sound plays ROLL_LAND_GAP_MS after the rattle ends, with the icon stopping then', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(async () => {
      const heard = [];
      Object.keys(SOUND_TABLE).forEach(name => {
        const real = SOUND_TABLE[name];
        SOUND_TABLE[name] = function(step) { heard.push({ name: name, at: performance.now() }); return real(step); };
      });
      const start = performance.now();
      forcePlayerRoll(3);
      let stoppedAtMs = null;
      while (!dieRollAnimationsIdle()) {
        await new Promise(r => setTimeout(r, 5));
        if (stoppedAtMs === null && !dieRollHolding('player')) stoppedAtMs = performance.now() - start;
      }
      return { heard: heard.map(h => ({ name: h.name, atMs: h.at - start })), stoppedAtMs: stoppedAtMs, rattleEndMs: DIE_RATTLE_END_MS, gapMs: GAME_CONFIG.ROLL_LAND_GAP_MS };
    });
    const landing = v.heard.find(h => h.name === 'die_blank');
    const expectedMs = v.rattleEndMs + v.gapMs;
    assert.ok(Math.abs(landing.atMs - expectedMs) <= 80, 'blank landing at ' + landing.atMs + ' ms, expected about ' + expectedMs);
    assert.ok(Math.abs(v.stoppedAtMs - expectedMs) <= 80, 'icon stopped at ' + v.stoppedAtMs + ' ms, expected about ' + expectedMs);
    await page.close();
  });

  await runTest("a loaded face's hover box holds the mod's symbol, name, rarity word in its tier colour, and text", async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'smite';
      document.getElementById('devFaceInput').value = '2';
      devLoadMod();
    });
    await page.hover(rowOf(2) + ' .face-btn');
    const v = await page.evaluate(() => {
      const box = rowFor(2).querySelector('.hover-tip > .face-mod-box');
      const tier = gameState.config.mods.smite.tier;
      const rarity = box.querySelector('.face-tip-rarity');
      const probe = document.createElement('span');
      probe.style.color = GAME_CONFIG.TIER_COLOURS[tier];
      document.body.appendChild(probe);
      const expectedColour = getComputedStyle(probe).color;
      probe.remove();
      const tip = box.parentElement;
      const r = box.getBoundingClientRect();
      return {
        name: box.querySelector('.face-tip-title').textContent,
        rarity: rarity.textContent,
        tierUpper: tier.toUpperCase(),
        rarityColour: getComputedStyle(rarity).color,
        expectedColour: expectedColour,
        text: box.querySelector('.face-tip-text').textContent,
        description: MOD_DESCRIPTION.smite,
        symbolSrc: box.querySelector('img') ? box.querySelector('img').getAttribute('src') : null,
        showing: getComputedStyle(tip).visibility === 'visible',
        insideWindow: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      };
    });
    assert.strictEqual(v.name, 'Smite');
    assert.strictEqual(v.rarity, v.tierUpper);
    assert.strictEqual(v.rarityColour, v.expectedColour);
    assert.strictEqual(v.text, v.description);
    assert.strictEqual(v.symbolSrc, 'art/mods/smite.png');
    assert.ok(v.showing, 'the box shows while the face is hovered');
    assert.ok(v.insideWindow, 'the box stays inside the window');
    await page.close();
  });

  await runTest('a two-mod face shows two boxes side by side in load order, both inside the window', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.hover(rowOf(2) + ' .face-btn');
    const v = await page.evaluate(() => {
      const boxes = [...rowFor(2).querySelectorAll('.hover-tip > .face-mod-box')];
      const rects = boxes.map(b => b.getBoundingClientRect());
      return {
        boxCount: boxes.length,
        names: boxes.map(b => b.querySelector('.face-tip-title').textContent),
        leftBoxEndsBeforeRightBegins: rects[0].right <= rects[1].left,
        sameTop: Math.abs(rects[0].top - rects[1].top) < 1,
        insideWindow: rects.every(r => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight)
      };
    });
    assert.strictEqual(v.boxCount, 2);
    assert.deepStrictEqual(v.names, ['Smite', 'Blight']);
    assert.ok(v.leftBoxEndsBeforeRightBegins && v.sameTop, 'the boxes sit side by side');
    assert.ok(v.insideWindow, 'both boxes stay inside the window');
    await page.close();
  });

  await runTest('blank faces, face 1 and face 20 keep the two-line hover, with no mod box', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => [3, 1, 20].map(n => {
      const tip = rowFor(n).querySelector(':scope > .hover-tip');
      return { modBoxes: tip.querySelectorAll('.face-mod-box').length, lines: [...tip.children].map(d => d.textContent) };
    }));
    v.forEach(t => { assert.strictEqual(t.modBoxes, 0); assert.strictEqual(t.lines.length, 2); });
    assert.deepStrictEqual(v[0].lines, ['BLANK · weight 1', 'Gain 2 block.']);
    await page.close();
  });

  await runTest('the DIE layer has one header row, exactly 20 data rows, columns Face/Weight/Mod/Triggered aligned, and no hr or row borders', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => {
      const layer = document.getElementById('dieInfoLayer');
      const head = [...layer.querySelectorAll('thead tr')];
      const rows = [...layer.querySelectorAll('tbody tr')];
      const th = [...layer.querySelectorAll('thead th')];
      const leftOf = (el) => Math.round(el.getBoundingClientRect().left);
      const aligned = th.map((h, c) => rows.every(r => Math.abs(leftOf(r.cells[c]) - leftOf(h)) <= 1));
      const cellBorders = [...layer.querySelectorAll('th, td')].map(c => getComputedStyle(c).borderBottomWidth);
      return {
        headerRows: head.length,
        headers: th.map(h => h.textContent),
        dataRows: rows.length,
        hrCount: layer.querySelectorAll('hr').length,
        aligned: aligned,
        cellBorders: [...new Set(cellBorders)],
        faceColumn: rows.map(r => r.cells[0].textContent)
      };
    });
    assert.strictEqual(v.headerRows, 1);
    assert.deepStrictEqual(v.headers, ['Face', 'Weight', 'Mod', 'Triggered']);
    assert.strictEqual(v.dataRows, 20);
    assert.strictEqual(v.hrCount, 0);
    assert.deepStrictEqual(v.aligned, [true, true, true, true], 'columns aligned to their header');
    assert.deepStrictEqual(v.cellBorders, ['0px'], 'no rule lines under any row');
    assert.deepStrictEqual(v.faceColumn, Array.from({ length: 20 }, (_, i) => String(i + 1)));
    await page.close();
  });

  await runTest('the DIE layer still shows HP, weight with MAX, mod names, Bound, Sealed, trigger counts, and Blanks rolled N above the table', async () => {
    const page = await freshFight(browser);
    await loadTwoModFace(page);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'unison';
      document.getElementById('devFaceInput').value = '5';
      devLoadMod();
      updateDie({ faces: gameState.die.faces.map(f => f.number === 20 ? Object.assign({}, f, { weight: GAME_CONFIG.FACE_TWENTY_MAX_WEIGHT }) : f.number === 2 ? Object.assign({}, f, { modData: { triggerCount: 2, triggerCount2: 1 } }) : f) });
      updateTurn({ sealedFaces: [2] });
      updateRunRecord({ blanksRolled: 7 });
    });
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => {
      const rowFor = n => [...document.querySelectorAll('#dieInfoContent .info-table-row')].find(r => r.cells[0].textContent === String(n));
      const lines = [...document.querySelectorAll('#dieInfoContent .info-list-row')].map(r => r.textContent);
      const table = document.querySelector('#dieInfoContent .info-table');
      return {
        lines: lines,
        linesBeforeTable: !!(document.querySelector('#dieInfoContent .info-die-line').compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING),
        twenty: [rowFor(20).cells[1].textContent, rowFor(20).cells[3].textContent],
        two: [rowFor(2).cells[2].textContent, rowFor(2).cells[3].textContent],
        five: rowFor(5).cells[2].textContent,
        three: [rowFor(3).cells[2].textContent, rowFor(3).cells[3].textContent]
      };
    });
    assert.deepStrictEqual(v.lines, ['HP 70 / 70', 'Blanks rolled 7']);
    assert.ok(v.linesBeforeTable, 'the two lines sit above the table');
    assert.strictEqual(v.twenty[0], '5 MAX');
    assert.ok(v.two[0].indexOf('Smite / Blight') === 0 && v.two[0].indexOf('Sealed') !== -1, v.two[0]);
    assert.strictEqual(v.two[1], '2 / 1');
    assert.ok(v.five.indexOf('Unison') === 0 && v.five.indexOf('Bound') !== -1, v.five);
    assert.deepStrictEqual(v.three, ['BLANK', '']);
    await page.close();
  });

  await runTest('a face at weight 3 has a 4 px line, weight 2 a 2 px line, weight 1 none, no weight fill remains, and no square moves', async () => {
    const page = await freshFight(browser);
    const squaresBefore = await page.evaluate(() => [...document.querySelectorAll('#playerDieList .face-btn')].map(b => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }));
    await setWeight(page, 5, 3);
    await setWeight(page, 6, 2);
    const v = await page.evaluate(() => {
      const zoom = parseFloat(document.documentElement.style.zoom || '1');
      const lineOf = n => {
        const line = rowFor(n).querySelector('.face-weight-line');
        return line ? { styleHeight: getComputedStyle(line).height, drawnHeight: line.getBoundingClientRect().height / zoom } : null;
      };
      return {
        w3: lineOf(5), w2: lineOf(6), w1: lineOf(7),
        fills: document.querySelectorAll('.face-weight-fill').length,
        squaresAfter: [...document.querySelectorAll('#playerDieList .face-btn')].map(b => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })
      };
    });
    assert.deepStrictEqual(v.squaresAfter, squaresBefore, 'a strengthened face moves no square');
    assert.ok(Math.abs(v.w3.drawnHeight - 4) < 0.1 && Math.abs(parseFloat(v.w3.styleHeight) - 4) < 0.1, 'weight 3 line drawn ' + v.w3.drawnHeight + ' px, computed ' + v.w3.styleHeight);
    assert.ok(Math.abs(v.w2.drawnHeight - 2) < 0.1 && Math.abs(parseFloat(v.w2.styleHeight) - 2) < 0.1, 'weight 2 line drawn ' + v.w2.drawnHeight + ' px, computed ' + v.w2.styleHeight);
    assert.strictEqual(v.w1, null, 'weight 1 draws no line');
    assert.strictEqual(v.fills, 0, 'the row fill is gone');
    await page.close();
  });

  await runTest('the weight line takes the face identity colour, and the odds below sit lower by its height', async () => {
    const page = await freshFight(browser);
    await setWeight(page, 3, 3);
    await setWeight(page, 10, 3);
    await setWeight(page, 20, 3);
    const v = await page.evaluate(() => {
      const colourOf = n => getComputedStyle(rowFor(n).querySelector('.face-weight-line')).backgroundColor;
      const varColour = name => { const p = document.createElement('span'); p.style.color = 'var(' + name + ')'; document.body.appendChild(p); const c = getComputedStyle(p).color; p.remove(); return c; };
      const gapOf = n => {
        const row = rowFor(n);
        const line = row.querySelector('.face-weight-line');
        return { lineBottom: line.getBoundingClientRect().bottom, captionTop: row.querySelector('.die-face-caption').getBoundingClientRect().top, squareBottom: row.querySelector('.face-btn').getBoundingClientRect().bottom, lineTop: line.getBoundingClientRect().top };
      };
      return { blank: [colourOf(3), varColour('--blank')], loaded: [colourOf(10), varColour('--player-mod')], nat: [colourOf(20), varColour('--nat')], gap: gapOf(3) };
    });
    assert.strictEqual(v.blank[0], v.blank[1]);
    assert.strictEqual(v.loaded[0], v.loaded[1]);
    assert.strictEqual(v.nat[0], v.nat[1]);
    assert.ok(v.gap.lineTop >= v.gap.squareBottom - 0.01, 'the line sits under the square');
    assert.ok(v.gap.captionTop >= v.gap.lineBottom - 0.01, 'the odds sit under the line');
    await page.close();
  });

  await runTest('Skip to Artifact Reward ends the fight as a win, opens the artifact offer, and writes nothing to the run', async () => {
    const page = await freshFight(browser);
    await page.click('#devChromeToggleBtn');
    const before = await page.evaluate(() => ({ gold: gameState.run.gold, fightRoundEntries: gameState.runRecord.fightRounds.length, transcriptLines: gameState.run.transcript.length }));
    await page.click('#devSkipToArtifactRewardBtn');
    const v = await page.evaluate(() => ({
      step: artifactRewardStep,
      status: gameState.run.status,
      offered: document.querySelectorAll('#artifactRewardPanel .offer-symbol').length,
      gold: gameState.run.gold,
      fightRoundEntries: gameState.runRecord.fightRounds.length,
      transcriptLines: gameState.run.transcript.length
    }));
    assert.strictEqual(v.step, 'choose');
    assert.strictEqual(v.status, 'win');
    assert.strictEqual(v.offered, 3, 'artifacts offered on screen');
    assert.strictEqual(v.gold, before.gold, 'no gold granted');
    assert.strictEqual(v.fightRoundEntries, before.fightRoundEntries, 'no fight recorded');
    assert.strictEqual(v.transcriptLines, before.transcriptLines, 'no transcript line written');
    await page.close();
  });

  await runTest('Add card grows the owned deck and the draw pile by one; Remove card shrinks the owned deck by one and lists the owned cards', async () => {
    const page = await freshFight(browser);
    await page.click('#devChromeToggleBtn');
    const count = () => page.evaluate(() => ({
      ownedCards: gameState.player.ownedCards.length,
      cardsInPiles: gameState.player.deck.length + gameState.player.hand.length + gameState.player.discard.length,
      removeOptions: document.getElementById('devRemoveCardSelect').options.length,
      addOptions: document.getElementById('devAddCardSelect').options.length,
      knownCards: Object.keys(gameState.config.cards).length,
      strikesOwned: gameState.player.ownedCards.filter(id => id === 'strike').length
    }));
    const start = await count();
    assert.strictEqual(start.addOptions, start.knownCards + 1, 'every card id plus the placeholder');
    assert.strictEqual(start.removeOptions, start.ownedCards + 1, 'every owned card plus the placeholder');
    await page.selectOption('#devAddCardSelect', 'rite');
    const afterAdd = await count();
    assert.strictEqual(afterAdd.ownedCards, start.ownedCards + 1);
    assert.strictEqual(afterAdd.cardsInPiles, start.cardsInPiles + 1);
    assert.strictEqual(afterAdd.removeOptions, afterAdd.ownedCards + 1, 'the Remove list follows the deck');
    await page.selectOption('#devRemoveCardSelect', '0');
    const afterRemove = await count();
    assert.strictEqual(afterRemove.ownedCards, afterAdd.ownedCards - 1);
    assert.strictEqual(afterRemove.cardsInPiles, afterAdd.cardsInPiles - 1);
    assert.strictEqual(afterRemove.strikesOwned, afterAdd.strikesOwned - 1, 'the first owned card, a Strike, was the one removed');
    const record = await page.evaluate(() => ({ transcript: gameState.run.transcript.filter(l => l.indexOf('CARD') === 0 || l.indexOf('RITE') === 0).length }));
    assert.strictEqual(record.transcript, 0, 'dev card changes write no transcript line');
    await page.close();
  });

  await runTest('blanksRolled in the run record goes up by one on a blank roll', async () => {
    const page = await freshFight(browser);
    const before = await page.evaluate(() => gameState.runRecord.blanksRolled);
    await page.evaluate(() => { forcePlayerRoll(3); });
    await page.waitForFunction(() => dieRollAnimationsIdle());
    assert.strictEqual(before, 0);
    assert.strictEqual(await page.evaluate(() => gameState.runRecord.blanksRolled), 1);
    await page.close();
  });

  await runTest('blanksRolled goes up by one on a Sealed face', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => {
      document.getElementById('devModSelect').value = 'smite';
      document.getElementById('devFaceInput').value = '4';
      devLoadMod();
      updateTurn({ sealedFaces: [4] });
      forcePlayerRoll(4);
    });
    await page.waitForFunction(() => dieRollAnimationsIdle());
    const v = await page.evaluate(() => ({ recorded: gameState.runRecord.blanksRolled, outcome: gameState.turn.rollOutcome }));
    assert.strictEqual(v.outcome, 'mod');
    assert.strictEqual(v.recorded, 1);
    await page.close();
  });

  await runTest('blanksRolled goes up by one on a spent Nat 1, and not on the first Nat 1', async () => {
    const page = await freshFight(browser);
    await page.evaluate(() => { forcePlayerRoll(1); });
    await page.waitForFunction(() => dieRollAnimationsIdle());
    const firstNatOne = await page.evaluate(() => ({ recorded: gameState.runRecord.blanksRolled, outcome: gameState.turn.rollOutcome }));
    assert.deepStrictEqual(firstNatOne, { recorded: 0, outcome: 'nat_one' });
    const page2 = await freshFight(browser);
    await page2.evaluate(() => { updatePlayer({ natOneFiredThisFight: true }); forcePlayerRoll(1); });
    await page2.waitForFunction(() => dieRollAnimationsIdle());
    const spent = await page2.evaluate(() => ({ recorded: gameState.runRecord.blanksRolled, outcome: gameState.turn.rollOutcome }));
    assert.deepStrictEqual(spent, { recorded: 1, outcome: 'blank' });
    await page.close();
    await page2.close();
  });

  await runTest('blanksRolled ignores a blank a card triggers, is a CSV column before build, and a new run zeroes it', async () => {
    const page = await freshFight(browser);
    const v = await page.evaluate(() => {
      triggerFaceOutsideRoll(3);
      const outsideBlank = gameState.runRecord.blanksRolled;
      updateRunRecord({ blanksRolled: 4 });
      const cols = buildRunRecordLine().split(',');
      const header = RUN_RECORD_CSV_HEADER.split(',');
      startNewRun();
      return { outsideBlank: outsideBlank, column: cols[header.indexOf('blanksRolled')], headerEnd: header.slice(-2), afterNewRun: gameState.runRecord.blanksRolled };
    });
    assert.strictEqual(v.outsideBlank, 0, 'a triggered blank is not a roll');
    assert.strictEqual(v.column, '4');
    assert.deepStrictEqual(v.headerEnd, ['blanksRolled', 'build']);
    assert.strictEqual(v.afterNewRun, 0);
    await page.close();
  });

  await runTest('no piece has empty on-screen text: every mod box line, every dev dropdown label, every DIE layer header and line', async () => {
    const page = await freshFight(browser);
    await page.click('#devChromeToggleBtn');
    await page.click('#dieInfoBtn');
    const v = await page.evaluate(() => {
      const emptyBoxLines = [];
      Object.keys(gameState.config.mods).forEach(id => {
        const box = faceModBox({ number: 2, weight: 1, modId: id, modId2: null }, id);
        [...box.querySelectorAll('div')].forEach(d => { if (!d.textContent.trim()) emptyBoxLines.push(id + ':' + d.className); });
      });
      const labels = [...document.querySelectorAll('#devAddCardSelect option, #devRemoveCardSelect option')].map(o => o.textContent.trim());
      const layer = [...document.querySelectorAll('#dieInfoContent th, #dieInfoContent .info-list-row')].map(e => e.textContent.trim());
      return { emptyBoxLines: emptyBoxLines, emptyLabels: labels.filter(t => !t), labelCount: labels.length, emptyLayer: layer.filter(t => !t), layerCount: layer.length };
    });
    assert.deepStrictEqual(v.emptyBoxLines, []);
    assert.deepStrictEqual(v.emptyLabels, []);
    assert.ok(v.labelCount > 50, 'dropdown labels checked: ' + v.labelCount);
    assert.deepStrictEqual(v.emptyLayer, []);
    assert.strictEqual(v.layerCount, 6, 'four table headers plus the HP and Blanks rolled lines');
    await page.close();
  });

  await browser.close();
  process.exit(report('build176') > 0 ? 1 : 0);
})();
