const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 900, height: 500 }, deviceScaleFactor: 1 })).newPage();
  const logs = []; page.on('console', m => logs.push(m.type() + ' ' + m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto('http://localhost:5408/min/reset.html');
  await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(500);
  const groups = () => page.evaluate(() => [...document.querySelectorAll('[data-ssg-group-row][data-pane] .ssg-group-label')].map(e => e.textContent).join(','));
  const header = () => page.locator('[role="columnheader"][data-ssg-col-key="__ssg_group__"]').first().innerText();
  console.log('initial:', await page.locator('#hierarchy').innerText(), '| header', await header(), '| groups', await groups());
  await page.locator('[role="columnheader"][data-ssg-col-key="dept"]').click({ button: 'right' }); await page.waitForTimeout(300);
  await page.locator('.ssg-menu-item', { hasText: 'この列でグループ化' }).click(); await page.waitForTimeout(500);
  console.log('after group by 部署:', await page.locator('#hierarchy').innerText(), '| header', await header(), '| groups', await groups());
  await page.locator('[role="columnheader"][data-ssg-col-key="name"]').click({ button: 'right' }); await page.waitForTimeout(300);
  await page.locator('.ssg-menu-item', { hasText: '列のリセット' }).click(); await page.waitForTimeout(500);
  console.log('after 列のリセット:', await page.locator('#hierarchy').innerText(), '| header', await header(), '| groups', await groups());
  console.log(logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
