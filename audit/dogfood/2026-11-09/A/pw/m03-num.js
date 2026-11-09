const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost:5401' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:5401/min/num.html');
  await page.waitForSelector('.ssg-body-cell');
  await (await page.$('[role="row"][aria-rowindex="2"] [role="gridcell"][aria-colindex="2"]')).click();
  const vals = ['¥12,000', '12,000円', '￥１２，０００', '(1,200)', ' 1200 ', '1.2e3', '−500', '1,200.0'];
  await page.evaluate((t) => navigator.clipboard.writeText(t), vals.map((v) => `${v}\t${v}`).join('\n'));
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => window.__rows);
  rows.forEach((r, i) => console.log(JSON.stringify(vals[i]).padEnd(18), 'mark →', JSON.stringify(r.a).padEnd(12), 'reject →', JSON.stringify(r.b)));
  await browser.close();
})();
