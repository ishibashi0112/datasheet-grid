const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })).newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto('http://localhost:5408/min/reset.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  await page.locator('[role="columnheader"][data-ssg-col-key="dept"]').click({ button: 'right' }); await page.waitForTimeout(300);
  await page.locator('.ssg-menu-item', { hasText: 'この列でグループ化' }).click(); await page.waitForTimeout(500);
  console.log('after group by 部署:', await page.locator('#hierarchy').innerText());
  await page.locator('[role="columnheader"][data-ssg-col-key="name"]').click({ button: 'right' }); await page.waitForTimeout(300);
  await page.locator('.ssg-menu-item', { hasText: '列の表示' }).click(); await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'すべての列を初期状態に戻す' }).click(); await page.waitForTimeout(500);
  console.log('after tool panel reset:', await page.locator('#hierarchy').innerText());
  console.log(logs.filter(l => !l.includes('DevTools') && !l.includes('vite')).join('\n'));
  await browser.close();
})();
