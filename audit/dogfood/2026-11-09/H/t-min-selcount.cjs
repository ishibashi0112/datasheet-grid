const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 })).newPage();
  await page.goto('http://localhost:5408/min/selcount.html?unc');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  await page.locator('[data-row-key="1"] .ssg-row-checkbox').first().click(); await page.waitForTimeout(200);
  await page.locator('[data-row-key="2"] .ssg-row-checkbox').first().click(); await page.waitForTimeout(200);
  await page.locator('[aria-label="すべての行を選択"]').click(); await page.waitForTimeout(200);
  console.log((await page.evaluate(() => window.__log)).join('\n'));
  await browser.close();
})();
