const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5408' });
  const page = await context.newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto('http://localhost:5408/min/paste.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  const names = () => page.evaluate(() => window.__rows.map(r => r.team + ':' + r.name).join(' '));
  console.log('before', await names());
  // select a1..b1 (view rows 1..4 incl. group row B at view 3) and copy
  const c = (key) => page.locator(`[data-row-key="${key}"] [data-ssg-col-key="name"]`).first();
  await c(1).click();
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  console.log('copied', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  // paste back at the same anchor
  await c(1).click();
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  console.log('after paste same place', await names());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  // paste 3 new values from "Excel"
  await page.evaluate(() => navigator.clipboard.writeText('X\r\nY\r\nZ\r\n'));
  await c(1).click();
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  console.log('after paste X,Y,Z at a1', await names());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  console.log('after undo', await names());
  // round trip: select a2..b2 (a2, group B, b1, b2), copy, paste at same anchor
  await c(2).click();
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  console.log('copied a2..b2', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  await c(2).click();
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  console.log('after round-trip paste', await names());
  await page.screenshot({ path: 'shots/min-paste.png' });
  console.log(logs.join('\n'));
  await browser.close();
})();
