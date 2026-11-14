const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 })).newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text()));
  await page.goto('http://localhost:5408/min/selall.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  const keys = () => page.evaluate(() => ({ keys: window.__grid.current.getSelectedRowKeys(), count: window.__grid.current.getSelectedRowCount(), model: window.__grid.current.getRowSelection() }));
  await page.locator('.ssg-bar-input').fill('りんご'); await page.waitForTimeout(600);
  await page.locator('[aria-label="すべての行を選択"]').click(); await page.waitForTimeout(200);
  console.log('filtered "りんご" + select all:', JSON.stringify(await keys()));
  await page.locator('.ssg-bar-input').fill(''); await page.waitForTimeout(600);
  console.log('after clearing filter:', JSON.stringify(await keys()));
  await page.locator('.ssg-bar-input').fill('ぶどう'); await page.waitForTimeout(600);
  console.log('after filter "ぶどう":', JSON.stringify(await keys()));
  await page.screenshot({ path: 'shots/min-selall.png' });
  console.log(logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
