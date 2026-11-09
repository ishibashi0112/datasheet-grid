const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })).newPage();
  await page.goto('http://localhost:5408/min/reset.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  await page.locator('[role="columnheader"][data-ssg-col-key="name"]').click({ button: 'right' }); await page.waitForTimeout(400);
  const r = await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-item')].map(e => e.textContent.trim() + ':' + Math.round(e.getBoundingClientRect().height)));
  console.log(JSON.stringify(r));
  console.log('font', await page.evaluate(() => getComputedStyle(document.querySelector('.ssg-menu-item')).fontSize + ' ' + getComputedStyle(document.querySelector('.ssg-menu-item')).fontFamily));
  await page.screenshot({ path: 'shots/min-menu.png' });
  await browser.close();
})();
