// BUILD 104 verification helper — not part of the eleven-file game bundle,
// standalone like tests/mods.test.js. Starts a real run, enters the opening
// fight, and screenshots the play column (#fightScreen) to the path given
// as argv[2]. Pass 'before' or 'after' as argv[2] to name the file.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const label = process.argv[2] || 'before';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1080 } });
  const fileUrl = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
  await page.goto(fileUrl);
  page.on('dialog', function(d) { d.accept(); });

  await page.click('#startGameBtn');
  // New Run lands on the map screen at the shared 'opening' fight slot —
  // click it to actually enter the fight screen.
  await page.click('.map-node-opening');
  await page.waitForSelector('#fightScreen', { state: 'visible' });

  const consoleErrors = [];
  page.on('pageerror', function(e) { consoleErrors.push(String(e)); });

  await page.locator('#fightScreen').screenshot({
    path: path.resolve(__dirname, 'build104_' + label + '.png')
  });

  console.log('Screenshot saved: tests/build104_' + label + '.png');
  console.log('Page errors: ' + consoleErrors.length);

  await browser.close();
})();
