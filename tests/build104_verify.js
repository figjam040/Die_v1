// BUILD 104 verification — font-family/weight unification for player-facing
// text (die face labels, die weight/trigger badges, stat-row labels/values).
// Checks: (1) no element's text overflows its own box (clientWidth vs
// scrollWidth) after the font change, (2) die-row geometry (height, face-btn
// left offset) is unchanged from BUILD 103's own measured baseline, (3) every
// audited selector now resolves to the target font-family/weight.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  page.on('dialog', function(d) { d.accept(); });

  await page.click('#devChromeToggleBtn');
  await page.click('#startGameBtn');
  await page.click('.map-node-opening');
  await page.waitForSelector('#fightScreen', { state: 'visible' });

  // Directly set state (per Law 3, via updateDie()) to put the longest mod
  // name (Consecrate) on a face with weight > 1 and a non-zero trigger
  // count, so die-mod's worst-case text plus both the ×N weight and ↻N
  // trigger badges all render at once for the clipping/font check.
  // BUILD 108: trigger counts moved off gameState.die.triggerCounts and
  // onto each face's own modData (triggerCount) — set directly here instead
  // of through a second array.
  await page.evaluate(function() {
    const newFaces = gameState.die.faces.slice();
    newFaces[4] = Object.assign({}, newFaces[4], { modId: 'consecrate', weight: 3, modData: { triggerCount: 2 } });
    updateDie({ faces: newFaces });
  });

  const geometry = await page.evaluate(function() {
    const rows = Array.from(document.querySelectorAll('#playerDieList .die-row'));
    return rows.map(function(r) {
      const rect = r.getBoundingClientRect();
      const faceBtn = r.querySelector('.face-btn').getBoundingClientRect();
      return { height: Math.round(rect.height), faceLeft: Math.round(faceBtn.left) };
    });
  });

  const overflow = await page.evaluate(function() {
    const selectors = ['.die-mod', '.face-btn', '.die-weight', '.die-trigger-count', '.stat-label', '.stat-value', '.panel-title'];
    const results = [];
    selectors.forEach(function(sel) {
      document.querySelectorAll(sel).forEach(function(el) {
        if (el.scrollWidth > el.clientWidth + 1) {
          results.push(sel + ': "' + el.textContent + '" scrollWidth=' + el.scrollWidth + ' clientWidth=' + el.clientWidth);
        }
      });
    });
    return results;
  });

  const fonts = await page.evaluate(function() {
    const selectors = ['.panel-title', '.face-btn', '.die-mod', '.die-weight', '.die-trigger-count', '.stat-label', '.stat-value'];
    const out = {};
    selectors.forEach(function(sel) {
      const el = document.querySelector(sel);
      if (!el) { out[sel] = 'NOT FOUND IN DOM'; return; }
      const cs = getComputedStyle(el);
      out[sel] = { fontFamily: cs.fontFamily, fontWeight: cs.fontWeight };
    });
    return out;
  });

  console.log('--- Die row geometry (height, face-btn left) ---');
  console.log(JSON.stringify(geometry));

  console.log('--- Overflow findings (should be empty) ---');
  console.log(overflow.length ? overflow.join('\n') : 'NONE');

  console.log('--- Computed font-family/weight per selector ---');
  console.log(JSON.stringify(fonts, null, 2));

  await browser.close();
})();
