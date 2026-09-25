// ============================================================
// TESTS/BUILD167.TEST.JS
// Standing regression suite for BUILD 167: D-114 gold coin, D-115 Choose
// titles, D-116 rite screen, D-117 Anomaly, D-118 sleek pass (one
// --ui-scale variable, face rows untouched) and D-119 Remove.
// Run: node tests/build167.test.js
// ============================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE_URL = 'file://' + path.resolve(ROOT, 'index.html').split(String.fromCharCode(92)).join('/');
const BACKUP_166_INDEX = 'C:/Users/figja/Die_v1_backup_166/index.html';

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

async function freshPage(browser, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1600, height: 900 } });
  page.on('dialog', function(d) { d.accept(); });
  await page.goto(FILE_URL);
  await page.waitForFunction(() => typeof gameState !== 'undefined' && gameState.run.screen === 'map');
  return page;
}

// Any wait on ROLL_PHASE needs the dev drawer's flag first (D-113).
async function freshFightPage(browser, artifacts) {
  const page = await freshPage(browser);
  await page.evaluate((held) => { devChromeOpen = true; updateRun({ artifacts: held || [] }); }, artifacts);
  await page.evaluate(() => { enterSlot('opening', null); });
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  return page;
}

async function forceRoll(page, faceNumber) {
  await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE');
  await page.evaluate((n) => { devChromeOpen = true; forcePlayerRoll(n); }, faceNumber);
  await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
}

// Writes a face's mod by number, never by index — a removed face shifts
// every index after it.
async function loadFaces(page, pairs) {
  await page.evaluate((list) => {
    const newFaces = gameState.die.faces.slice();
    list.forEach(function(p) {
      const i = newFaces.findIndex(function(f) { return f.number === p[0]; });
      newFaces[i] = Object.assign({}, newFaces[i], { modId: p[1], modId2: null });
    });
    updateDie({ faces: newFaces });
  }, pairs);
}

// The same data shape dieActionPickRemoveFace() writes, without its
// screen flow — for tests that need a removed face before a fight begins.
async function dropFaces(page, numbers) {
  await page.evaluate((nums) => {
    updateDie({ faces: gameState.die.faces.filter(function(f) { return nums.indexOf(f.number) === -1; }) });
  }, numbers);
}

async function titleOf(page, panelId) {
  return page.evaluate((id) => {
    const t = document.querySelector('#' + id + ' .die-action-title');
    return t ? t.textContent : null;
  }, panelId);
}

// One rule's declared font-size out of an index.html source.
function declaredFontSize(html, selector) {
  const start = html.indexOf('\n  ' + selector + ' {');
  if (start === -1) return null;
  const block = html.slice(start, html.indexOf('}', start));
  const m = block.match(/font-size:\s*([^;]+);/);
  return m ? m[1].trim() : null;
}

function backupIndexHtml() {
  if (fs.existsSync(BACKUP_166_INDEX)) return fs.readFileSync(BACKUP_166_INDEX, 'utf8');
  return execFileSync('git', ['show', 'ddfb790:index.html'], { cwd: ROOT, encoding: 'utf8' });
}

// String literals in a JS source, comments stripped first.
function stringLiterals(src) {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const noLine = noBlock.split('\n').map(function(l) {
    return l.trim().indexOf('//') === 0 ? '' : l.replace(/\s\/\/\s.*$/, '');
  }).join('\n');
  return noLine.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g) || [];
}

(async () => {
  const browser = await chromium.launch();

  // ---------------------------------------------------------------
  // ITEM A — D-114 gold coin

  await runTest('A: art/gold.png exists and is 32 by 32', async () => {
    const file = path.join(ROOT, 'art', 'gold.png');
    assert.ok(fs.existsSync(file), 'art/gold.png missing');
    const buf = fs.readFileSync(file);
    assert.strictEqual(buf.toString('ascii', 12, 16), 'IHDR', 'not a PNG');
    assert.strictEqual(buf.readUInt32BE(16), 32, 'width');
    assert.strictEqual(buf.readUInt32BE(20), 32, 'height');
  });

  await runTest('A: the gold icon shows at 32px beside the number, no box; a failed load shows GOLD and keeps the number', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { updateRun({ gold: 37 }); });
    await page.waitForFunction(() => document.getElementById('goldIcon').complete);
    const v = await page.evaluate(() => {
      const icon = document.getElementById('goldIcon');
      const r = icon.getBoundingClientRect();
      const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      return {
        src: icon.getAttribute('src'),
        natural: icon.naturalWidth,
        width: Math.round(r.width / zoom),
        iconShown: getComputedStyle(icon).display !== 'none',
        fallbackShown: getComputedStyle(document.getElementById('goldFallback')).display !== 'none',
        fallbackText: document.getElementById('goldFallback').textContent,
        amount: document.getElementById('goldAmount').textContent,
        border: getComputedStyle(document.getElementById('goldValue')).borderTopWidth
      };
    });
    assert.strictEqual(v.src, 'art/gold.png');
    assert.strictEqual(v.natural, 32, 'icon loaded at 32px');
    assert.strictEqual(v.width, 32, 'icon drawn at 32px');
    assert.ok(v.iconShown && !v.fallbackShown, 'icon shown, fallback hidden');
    assert.strictEqual(v.fallbackText, 'GOLD');
    assert.strictEqual(v.amount, '37');
    assert.strictEqual(v.border, '0px', 'no box around the gold');

    await page.evaluate(() => { document.getElementById('goldIcon').src = 'art/no_such_gold.png'; });
    await page.waitForFunction(() => getComputedStyle(document.getElementById('goldFallback')).display !== 'none');
    const after = await page.evaluate(() => ({
      iconShown: getComputedStyle(document.getElementById('goldIcon')).display !== 'none',
      amount: document.getElementById('goldAmount').textContent
    }));
    assert.ok(!after.iconShown, 'the icon hides itself on error');
    assert.strictEqual(after.amount, '37', 'the number never disappears');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM B — D-115 Choose

  await runTest('B: die action, Load (both steps), Strengthen, Purify, Remove, card and artifact titles all read exactly Choose', async () => {
    const page = await freshPage(browser);
    await loadFaces(page, [[5, 'smite']]);
    const titles = {};
    await page.evaluate(() => { openDieActionScreen('reward'); });
    titles.choose = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionChooseLoad(); });
    titles.loadMod = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionPickMod(dieActionMods[0]); });
    titles.loadFace = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionChooseStrengthen(); });
    titles.strengthen = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionChoosePurify(); });
    titles.purify = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionChooseRemove(); });
    titles.remove = await titleOf(page, 'dieActionPanel');
    await page.evaluate(() => { dieActionStep = null; openCardRewardScreen(); });
    titles.card = await titleOf(page, 'cardRewardPanel');
    await page.evaluate(() => { cardRewardStep = null; openArtifactRewardScreen(); });
    titles.artifact = await titleOf(page, 'artifactRewardPanel');
    Object.keys(titles).forEach((k) => assert.strictEqual(titles[k], 'Choose', k + ' title: ' + titles[k]));
    await page.close();
  });

  await runTest('B: the shop keeps SHOP and The Font keeps its own text', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { openShopScreen(); });
    const shop = await titleOf(page, 'shopPanel');
    await page.evaluate(() => { shopStep = null; openEventScreen(); });
    const font = await titleOf(page, 'eventScreenPanel');
    assert.strictEqual(shop, 'SHOP');
    assert.ok(font.indexOf('A font of black water') === 0, 'Font text: ' + font);
    await page.close();
  });

  await runTest('B: the die action buttons sit centred under the Choose title', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { openDieActionScreen('reward'); });
    const v = await page.evaluate(() => {
      const t = document.querySelector('#dieActionPanel .die-action-title').getBoundingClientRect();
      const row = document.querySelector('#dieActionPanel .die-action-row');
      const btns = Array.from(row.querySelectorAll('button')).map((b) => b.getBoundingClientRect());
      const left = Math.min.apply(null, btns.map((r) => r.left));
      const right = Math.max.apply(null, btns.map((r) => r.right));
      return { titleMid: (t.left + t.right) / 2, buttonsMid: (left + right) / 2, titleBottom: t.bottom, buttonsTop: Math.min.apply(null, btns.map((r) => r.top)) };
    });
    assert.ok(Math.abs(v.titleMid - v.buttonsMid) <= 2, 'title centre ' + v.titleMid + ' vs buttons centre ' + v.buttonsMid);
    assert.ok(v.buttonsTop >= v.titleBottom, 'buttons sit under the title');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM C — D-116 rite screen

  await runTest('C: a Rite node replaces the map with the rite screen: title Rite, three choices, the face row below', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = true; devJumpToSlot('upper', 1); });
    const v = await page.evaluate(() => {
      const panel = document.getElementById('riteScreenPanel');
      return {
        riteStep: riteStep,
        inLayer: !!panel.closest('#fightScreen .band-top'),
        panelShown: panel.offsetParent !== null,
        mapShown: getComputedStyle(document.getElementById('mapScreen')).display !== 'none',
        title: (panel.querySelector('.die-action-title') || {}).textContent,
        choices: Array.from(panel.querySelectorAll('.die-action-row button')).map((b) => b.textContent),
        faceRowShown: document.getElementById('playerDieList').offsetParent !== null,
        faces: document.querySelectorAll('#playerDieList .die-row').length,
        panelsOutsideLayer: document.querySelectorAll('.left-col > #riteScreenPanel').length
      };
    });
    assert.strictEqual(v.riteStep, 'choose');
    assert.ok(v.inLayer, 'the rite screen lives in the reward layer');
    assert.ok(v.panelShown && !v.mapShown, 'rite screen shown, map hidden');
    assert.strictEqual(v.title, 'Rite');
    assert.deepStrictEqual(v.choices, ['Heal 20 HP', 'Take a die action', 'Remove a card']);
    assert.ok(v.faceRowShown && v.faces === 20, 'the face row sits below');
    assert.strictEqual(v.panelsOutsideLayer, 0, 'the old rite strip under the map is gone');
    await page.close();
  });

  await runTest('C: die action and card removal open on the rite screen, the shop follows, the map returns with the node entered and unclickable (KI-31)', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = true; devJumpToSlot('upper', 1); });
    const again = await page.evaluate(() => { enterSlot('upper', 1); return riteStep; });
    assert.strictEqual(again, 'choose', 'a second entry is refused while the rite is open');

    await page.evaluate(() => { riteChooseDieAction(); });
    const da = await page.evaluate(() => ({ step: dieActionStep, fightShown: getComputedStyle(document.getElementById('fightScreen')).display !== 'none', layer: document.getElementById('fightScreen').classList.contains('reward-layer-active') }));
    assert.strictEqual(da.step, 'choose');
    assert.ok(da.fightShown && da.layer, 'the die action shows on the same layer');
    await page.evaluate(() => { dieActionChooseSkip(); });
    assert.strictEqual(await page.evaluate(() => shopStep), 'open', 'the shop opens after the rite');
    await page.evaluate(() => { closeShopScreen(); });

    const map = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('#mapScreen .map-lane')[0].querySelectorAll('.map-node'));
      return {
        screen: gameState.run.screen,
        mapShown: getComputedStyle(document.getElementById('mapScreen')).display !== 'none',
        entered: !!gameState.run.act.upper[1].entered,
        completed: !!gameState.run.act.upper[1].completed,
        nodeClass: nodes[1].className,
        current: JSON.stringify(gameState.run.currentSlot)
      };
    });
    assert.ok(map.mapShown && map.entered && map.completed, JSON.stringify(map));
    assert.ok(map.nodeClass.indexOf('map-node-completed') !== -1, 'node reads completed: ' + map.nodeClass);
    await page.evaluate(() => { devChromeOpen = false; refreshInspector(); document.querySelectorAll('#mapScreen .map-lane')[0].querySelectorAll('.map-node')[1].click(); });
    const after = await page.evaluate(() => ({ riteStep: riteStep, current: JSON.stringify(gameState.run.currentSlot) }));
    assert.strictEqual(after.riteStep, null, 'clicking the entered node opens nothing');
    assert.strictEqual(after.current, map.current, 'the run did not move');

    // D-123 (BUILD 169): act 1's second rite is index 5; D-112: the removal
    // picker draws one card per owned id (Strike, Ward, Rite on a fresh deck).
    await page.evaluate(() => { devJumpToSlot('upper', 5); riteChooseRemoveCard(); });
    const rm = await page.evaluate(() => ({
      title: document.querySelector('#riteScreenPanel .die-action-title').textContent,
      instruction: (document.querySelector('#riteScreenPanel .offer-instruction') || {}).textContent,
      buttons: document.querySelectorAll('#riteScreenPanel .offer-card').length,
      faceRowShown: document.getElementById('playerDieList').offsetParent !== null
    }));
    assert.strictEqual(rm.title, 'Rite');
    assert.strictEqual(rm.instruction, 'CHOOSE A CARD TO REMOVE');
    assert.ok(rm.buttons === 3 && rm.faceRowShown, JSON.stringify(rm));
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM D — D-117 Anomaly

  await runTest('D: no player-facing Event string remains in the render files, run-and-map.js or index.html', async () => {
    const wordEvent = /\bEvent\b|\bEVENT\b/;
    const offenders = [];
    ['js/rendering.js', 'js/render-fight.js', 'js/render-map.js', 'js/render-layers.js', 'js/render-text.js', 'js/run-and-map.js'].forEach((rel) => {
      stringLiterals(fs.readFileSync(path.join(ROOT, rel), 'utf8')).forEach((s) => {
        if (wordEvent.test(s)) offenders.push(rel + ': ' + s);
      });
    });
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const body = html.slice(html.indexOf('<body>')).replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    if (wordEvent.test(body)) offenders.push('index.html visible text');
    assert.deepStrictEqual(offenders, []);
  });

  await runTest('D: the map node reads Anomaly; The Font logs and transcribes ANOMALY', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('#mapScreen .map-node')).map((n) => n.childNodes[0].textContent);
      openEventScreen();
      eventRoll();
      const logLines = Array.from(document.querySelectorAll('#log div')).map((d) => d.textContent).filter((t) => t.indexOf('font: rolled') !== -1 && t.indexOf('[STATE]') !== 0);
      return { labels: labels, slot: gameState.run.act.lower[3].label, type: gameState.run.act.lower[3].type, log: logLines, transcript: gameState.run.transcript.filter((t) => t.indexOf('font:') !== -1), text: document.body.innerText };
    });
    assert.strictEqual(v.slot, 'Anomaly');
    assert.strictEqual(v.type, 'event', 'the code key stays event');
    assert.ok(v.labels.indexOf('Anomaly') !== -1 && v.labels.indexOf('Event') === -1, JSON.stringify(v.labels));
    assert.ok(v.log.length === 1 && v.log[0].indexOf('[ANOMALY] font:') === 0, JSON.stringify(v.log));
    assert.ok(v.transcript.length === 1 && v.transcript[0].indexOf('ANOMALY font:') === 0, JSON.stringify(v.transcript));
    assert.ok(!/\bEvent\b/.test(v.text), 'no Event on screen');
    await page.close();
  });

  // ---------------------------------------------------------------
  // ITEM E — D-118 sleek pass

  await runTest('E: :root carries --ui-scale 0.75 and scaled text reads three quarters of its old size', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; openDieActionScreen('reward'); });
    const v = await page.evaluate(() => ({
      scale: getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim(),
      title: getComputedStyle(document.querySelector('#dieActionPanel .die-action-title')).fontSize,
      button: getComputedStyle(document.querySelector('#dieActionPanel .die-action-row button')).fontSize
    }));
    assert.strictEqual(v.scale, '0.75');
    assert.strictEqual(v.title, '12.75px', 'die-action-title 17px x 0.75');
    assert.strictEqual(v.button, '10.5px', 'die-action button 14px x 0.75');
    await page.close();
  });

  await runTest('E: the face row, enemy face row and die icon font sizes are unchanged from BUILD 166', async () => {
    const old = backupIndexHtml();
    const cur = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    ['.face-btn', '.die-face-caption', '.die-face-caption-emphasis', '.die-face-caption-nat', '.die-icon-number', '.die-icon-side', '.art-box'].forEach((sel) => {
      const was = declaredFontSize(old, sel);
      assert.ok(was, 'BUILD 166 declared a font-size on ' + sel);
      assert.strictEqual(declaredFontSize(cur, sel), was, sel);
    });
    assert.ok(old.indexOf('.enemy-face-row .face-btn { font-size: 9px; }') !== -1 && cur.indexOf('.enemy-face-row .face-btn { font-size: 9px; }') !== -1, 'enemy face row 9px');

    const page = await freshPage(browser);
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    const v = await page.evaluate(() => ({
      face: getComputedStyle(document.querySelector('#playerDieList .face-btn')).fontSize,
      caption: getComputedStyle(document.querySelector('#playerDieList .die-face-caption:not(.die-face-caption-nat)')).fontSize
    }));
    assert.strictEqual(v.face, declaredFontSize(old, '.face-btn'));
    assert.strictEqual(v.caption, declaredFontSize(old, '.die-face-caption'));
    await page.close();
  });

  await runTest('E: bold only on titles and the rolled result; box outlines 1px', async () => {
    const page = await freshPage(browser);
    await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
    await page.waitForFunction(() => gameState.turn.phase === 'ROLL_PHASE' || gameState.turn.phase === 'CARD_PHASE');
    // applyScale()'s zoom snaps a computed 1px border to device pixels.
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    const v = await page.evaluate(() => {
      const w = (sel) => getComputedStyle(document.querySelector(sel)).fontWeight;
      const b = (sel) => getComputedStyle(document.querySelector(sel)).borderTopWidth;
      return {
        statLabel: w('.stat-label'), sideTitle: w('.side-title'), cardName: w('#handRow .offer-card-name'), endTurn: w('#endTurnBtn'),
        phase: w('#phaseBadge'), rollNumber: w('#rollResultNumber'),
        hand: b('.hand-card-el'), slot: b('.artifact-slot'), button: b('#startGameBtn'), tip: b('.hover-tip'), art: b('.art-box')
      };
    });
    ['statLabel', 'sideTitle', 'cardName', 'endTurn', 'phase'].forEach((k) => assert.strictEqual(v[k], '400', k));
    assert.strictEqual(v.rollNumber, '700', 'the rolled result stays bold');
    // D-112 (BUILD 169): a card's rarity border is 2px, the one card exception.
    ['slot', 'button', 'tip', 'art'].forEach((k) => assert.strictEqual(v[k], '1px', k));
    assert.strictEqual(v.hand, '2px', 'hand card rarity border');
    await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
    await page.waitForFunction(() => dieActionStep !== null);
    const d = await page.evaluate(() => ({
      zoomReset: (document.documentElement.style.zoom = '1'),
      titleWeight: getComputedStyle(document.querySelector('#dieActionPanel .die-action-title')).fontWeight,
      buttonBorder: getComputedStyle(document.querySelector('#dieActionPanel .die-action-row button')).borderTopWidth
    }));
    assert.strictEqual(d.titleWeight, '700', 'Choose stays bold');
    assert.strictEqual(d.buttonBorder, '1px');
    await page.evaluate(() => { dieActionChooseSkip(); });
    await page.waitForFunction(() => cardRewardStep !== null);
    assert.strictEqual(await page.evaluate(() => { document.documentElement.style.zoom = '1'; return getComputedStyle(document.querySelector('#cardRewardPanel .offer-card')).borderTopWidth; }), '2px', 'card reward card (D-112 rarity border)');
    await page.close();
  });

  await runTest('E: nothing clips or scrolls on the fight, die action, card reward, map and rite screens at 1600x900 and 1920x1080', async () => {
    for (const vp of [{ width: 1600, height: 900 }, { width: 1920, height: 1080 }]) {
      const page = await freshPage(browser, vp);
      const report = [];
      // The die icon turns 30 degrees mid-spin (D-107, unchanged here) and
      // briefly overhangs the fight screen; measure once it has stopped.
      const check = async (label) => {
        await page.waitForFunction(() => dieRollAnimationsIdle());
        await page.waitForTimeout(150);
        const r = await page.evaluate(() => {
          const out = [];
          const tips = Array.from(document.querySelectorAll('.hover-tip'));
          tips.forEach((t) => { t.style.display = 'none'; });
          document.querySelectorAll('body *').forEach((el) => {
            if (el.closest('#devChrome, .right-col, .info-layer')) return;
            if (!el.getClientRects().length || !el.textContent.trim()) return;
            const cs = getComputedStyle(el);
            if (!/hidden|auto|scroll|clip/.test(cs.overflowX + cs.overflowY)) return;
            // overflow: clip still paints out to its overflow-clip-margin (D-124's symbol strip).
            const margin = cs.overflowX === 'clip' && cs.overflowY === 'clip' ? (parseFloat(cs.overflowClipMargin) || 0) : 0;
            if (el.scrollWidth > el.clientWidth + 1 + margin || el.scrollHeight > el.clientHeight + 1 + margin) out.push('clips: ' + (el.id || el.className));
          });
          const within = (outerSel, innerSel) => {
            const o = document.querySelector(outerSel);
            if (!o || !o.getClientRects().length) return;
            const orect = o.getBoundingClientRect();
            document.querySelectorAll(innerSel).forEach((el) => {
              if (!el.getClientRects().length) return;
              const r = el.getBoundingClientRect();
              if (r.left < orect.left - 0.5 || r.right > orect.right + 0.5 || r.top < orect.top - 0.5 || r.bottom > orect.bottom + 0.5) out.push('outside ' + outerSel + ': ' + (el.id || el.className));
            });
          };
          within('#mapScreen', '.map-node');
          within('.band-top', '.band-top button, .band-top .offer-card, .band-top .die-action-title');
          const de = document.documentElement;
          if (de.scrollHeight > de.clientHeight || de.scrollWidth > de.clientWidth) out.push('page scrolls');
          tips.forEach((t) => { t.style.display = ''; });
          return out;
        });
        r.forEach((line) => report.push(vp.width + ' ' + label + ' ' + line));
      };
      await check('map');
      await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
      await page.waitForFunction(() => gameState.turn.phase === 'CARD_PHASE');
      await check('fight');
      await page.evaluate(() => { updateEnemy({ hp: 0 }); nextPhase(); });
      await page.waitForFunction(() => dieActionStep !== null);
      await check('die action');
      await page.evaluate(() => { dieActionChooseSkip(); });
      await page.waitForFunction(() => cardRewardStep !== null);
      await check('card reward');
      await page.evaluate(() => { cardRewardSkip(); });
      await page.evaluate(() => { devJumpToSlot('upper', 1); });
      await check('rite');
      assert.deepStrictEqual(report, []);
      await page.close();
    }
  });

  // ---------------------------------------------------------------
  // ITEM F — D-119 Remove

  await runTest('F: DIE_MIN_FACES is 12 and die_action_remove plays the Purify sound', async () => {
    const page = await freshPage(browser);
    const v = await page.evaluate(() => ({ min: GAME_CONFIG.DIE_MIN_FACES, same: SOUND_TABLE.die_action_remove === SOUND_TABLE.die_action_strengthen }));
    assert.strictEqual(v.min, 12);
    assert.ok(v.same, 'die_action_remove reuses the Purify sound');
    await page.close();
  });

  await runTest('F: Remove eligibility — blank only, never 1, 20 or the anchor, refused at 12 faces', async () => {
    const page = await freshPage(browser);
    await loadFaces(page, [[5, 'smite']]);
    const v = await page.evaluate(() => {
      const e = (n) => isRemoveEligibleFace(getPlayerFace(n));
      return { one: e(1), twenty: e(20), anchor: e(10), loaded: e(5), blank: e(2), exists: removableFaceExists() };
    });
    assert.deepStrictEqual(v, { one: false, twenty: false, anchor: false, loaded: false, blank: true, exists: true });

    await dropFaces(page, [2, 3, 4, 6, 7, 8, 9]);
    const at13 = await page.evaluate(() => ({ n: gameState.die.faces.length, exists: removableFaceExists() }));
    assert.deepStrictEqual(at13, { n: 13, exists: true });
    await page.evaluate(() => { openDieActionScreen('reward'); dieActionChooseRemove(); dieActionPickRemoveFace(11); });
    const at12 = await page.evaluate(() => {
      dieActionStep = null; cardRewardStep = null;
      openDieActionScreen('reward');
      return {
        n: gameState.die.faces.length,
        exists: removableFaceExists(),
        eligible12: isRemoveEligibleFace(getPlayerFace(12)),
        buttons: Array.from(document.querySelectorAll('#dieActionPanel .die-action-row button')).map((b) => b.childNodes[0].textContent)
      };
    });
    assert.strictEqual(at12.n, 12);
    assert.ok(!at12.exists && !at12.eligible12, 'nothing is removable at 12 faces');
    assert.ok(at12.buttons.indexOf('Remove') === -1, 'Remove hidden at 12: ' + at12.buttons.join('|'));
    const refused = await page.evaluate(() => { dieActionPickRemoveFace(12); return gameState.die.faces.length; });
    assert.strictEqual(refused, 12, 'a direct call is refused too');
    await page.close();
  });

  await runTest('F: one Remove through the real buttons leaves 19 faces, one fewer ticket, odds summing to 100, and records Removed face N', async () => {
    const page = await freshPage(browser);
    const before = await page.evaluate(() => {
      openDieActionScreen('reward');
      return { tickets: rollOdds(gameState.die.faces)[2].total };
    });
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#dieActionPanel .die-action-row button')).find((b) => b.childNodes[0].textContent === 'Remove').click();
    });
    const pick = await page.evaluate(() => ({
      step: dieActionStep,
      instruction: (document.querySelector('#dieActionPanel .offer-instruction') || {}).textContent,
      pickable: Array.from(document.querySelectorAll('#playerDieList .die-row-pickable .face-num')).map((n) => parseInt(n.textContent, 10)).sort((a, b) => a - b)
    }));
    assert.strictEqual(pick.step, 'remove_pick_face');
    assert.strictEqual(pick.instruction, 'CHOOSE A BLANK FACE TO REMOVE');
    assert.deepStrictEqual(pick.pickable, [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('#playerDieList .die-row-pickable')).find((r) => r.querySelector('.face-num').textContent === '7').click();
    });
    const v = await page.evaluate(() => {
      const odds = rollOdds(gameState.die.faces);
      // The exact odds; each face's shown percent is rounded to one
      // decimal (D-99), so nineteen equal faces show 5.3% apiece.
      const pcts = Object.keys(odds).map((k) => (odds[k].tickets / odds[k].total) * 100);
      gameState.ui.dieInfoOpen = true;
      renderInfoLayers();
      const layerRows = Array.from(document.querySelectorAll('#dieInfoContent .info-table-row')).map((r) => r.cells[0].textContent);
      gameState.ui.dieInfoOpen = false;
      const logLines = Array.from(document.querySelectorAll('#log div')).map((d) => d.textContent);
      rollDie(gameState.die.faces);
      const pool = Array.from(document.querySelectorAll('#log div')).map((d) => d.textContent).filter((t) => t.indexOf('[ROLL] pool size: ') === 0).pop();
      return {
        faces: gameState.die.faces.length,
        has7: !!getPlayerFace(7),
        rowNumbers: Array.from(document.querySelectorAll('#playerDieList .face-num')).map((n) => n.textContent),
        tickets: odds[2].total,
        sum: pcts.reduce((a, b) => a + b, 0),
        pool: pool,
        faceRowsInLayer: layerRows,
        record: buildRunRecordLine(),
        transcript: gameState.run.transcript.slice(-1)[0],
        logged: logLines.some((t) => t.indexOf('[DIE] Removed face 7') === 0),
        next: cardRewardStep
      };
    });
    assert.strictEqual(v.faces, 19);
    assert.ok(!v.has7, 'face 7 is gone');
    assert.strictEqual(v.rowNumbers.length, 19, 'the face row shows 19 squares');
    assert.ok(v.rowNumbers.indexOf('7') === -1, 'the face row no longer shows 7');
    assert.strictEqual(v.tickets, before.tickets - 1, 'one fewer ticket');
    assert.strictEqual(v.pool, '[ROLL] pool size: 19');
    assert.ok(Math.abs(v.sum - 100) <= 0.1, 'odds sum ' + v.sum);
    assert.strictEqual(v.faceRowsInLayer.length, 19, 'the DIE layer lists 19 faces');
    assert.ok(v.faceRowsInLayer.indexOf('7') === -1, 'the DIE layer drops face 7');
    assert.ok(v.record.indexOf('remove:7') !== -1, 'run record: ' + v.record);
    assert.strictEqual(v.transcript, 'Removed face 7');
    assert.ok(v.logged, 'log line');
    assert.strictEqual(v.next, 'choose', 'the reward flow moves on to the card reward');
    await page.close();
  });

  await runTest('F: after a removal, a face is still found by its number (forced roll, Load)', async () => {
    const page = await freshPage(browser);
    await dropFaces(page, [6]);
    await page.evaluate(() => { openDieActionScreen('rite'); dieActionChooseLoad(); dieActionPickMod(dieActionMods[0]); dieActionPickLoadFace(8); });
    const loaded = await page.evaluate(() => ({ eight: getPlayerFace(8).modId, nine: getPlayerFace(9).modId }));
    assert.ok(loaded.eight && loaded.nine === null, 'Load wrote face 8 itself: ' + JSON.stringify(loaded));
    await page.evaluate(() => { shopStep = null; updateRun({ shop: null }); });
    await page.close();

    const fight = await freshPage(browser);
    await dropFaces(fight, [6]);
    await loadFaces(fight, [[7, 'smite']]);
    await fight.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
    const hp = await fight.evaluate(() => gameState.enemy.hp);
    await forceRoll(fight, 7);
    const v = await fight.evaluate(() => ({ rolled: gameState.turn.rolledFaceNumber, hp: gameState.enemy.hp }));
    assert.strictEqual(v.rolled, 7);
    assert.strictEqual(hp - v.hp, 16, 'Smite on face 7 lands');
    await fight.close();
  });

  await runTest('F: Reliquary Chain reads the next face still on the die after a removal', async () => {
    const page = await freshPage(browser);
    await dropFaces(page, [6]);
    await loadFaces(page, [[5, 'unison'], [7, 'smite']]);
    await page.evaluate(() => { devChromeOpen = true; updateRun({ artifacts: ['reliquary_chain'] }); enterSlot('opening', null); });
    const hp = await page.evaluate(() => gameState.enemy.hp);
    await forceRoll(page, 5);
    const v = await page.evaluate(() => ({ hp: gameState.enemy.hp, outside: gameState.turn.outsideTriggeredFaces.slice() }));
    assert.strictEqual(hp - v.hp, 22, 'Unison (6) plus the chained Smite on 7 (16)');
    assert.deepStrictEqual(v.outside, [7], 'face 7 chained, not the removed 6');
    await page.close();
  });

  await runTest('F: Elevation raises the next face still on the die after a removal', async () => {
    const page = await freshPage(browser);
    await dropFaces(page, [6]);
    await loadFaces(page, [[5, 'elevation'], [7, 'smite']]);
    await page.evaluate(() => { devChromeOpen = true; enterSlot('opening', null); });
    await forceRoll(page, 5);
    assert.strictEqual(await page.evaluate(() => getPlayerFace(7).weight), 2, 'face 7 gains the weight');
    await page.close();
  });

  await browser.close();
  const passed = results.filter((r) => r.pass).length;
  console.log(passed + '/' + results.length + ' build167 tests passed.');
  if (passed !== results.length) { process.exit(1); }
})();
