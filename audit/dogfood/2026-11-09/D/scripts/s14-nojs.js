const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3401/users?sort=mrr.desc&q=vip');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '../shots/14-nojs-dark.png' });
  const info = await page.evaluate(() => ({ html: document.documentElement.className, rows: document.querySelectorAll('[role="row"]').length, skeleton: document.querySelectorAll('[data-skeleton-row]').length, gf: document.querySelector('.ssg-root input')?.value, text: document.querySelector('.ssg-root')?.textContent.slice(0, 200) }));
  console.log(info);
  await browser.close();
})();
