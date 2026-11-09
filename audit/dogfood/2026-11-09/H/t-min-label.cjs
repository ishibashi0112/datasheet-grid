const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 800, height: 500 }, deviceScaleFactor: 1 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5408' });
  const page = await context.newPage();
  await page.goto('http://localhost:5408/min/label.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  const names = () => page.evaluate(() => window.__rows.filter(r => r.label === undefined).map(r => r.name).join(' '));
  const c = (key) => page.locator(`[data-row-key="${key}"] [data-ssg-col-key="name"]`).first();
  await c(2).click();
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  console.log('copied a2..b2', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  await c(2).click(); await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  console.log('label rows: after round-trip paste', await names());
  await browser.close();
})();
