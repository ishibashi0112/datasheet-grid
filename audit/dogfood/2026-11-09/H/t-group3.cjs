const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await openColumnMenu(page, 'priority');
  await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.locator('label', { hasText: /^低$/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '閉じる', exact: true }).last().click();
  await page.waitForTimeout(600);
  let gr = await groupRows(page);
  log('after priority filter', JSON.stringify(gr.slice(0, 2).map(g => g.label + g.count + JSON.stringify(g.vals))));
  log('bars', JSON.stringify(await bars(page)));
  log('total', JSON.stringify(await totalRow(page)));
  // filter manager -> add filter for status
  await openColumnMenu(page, 'title');
  await clickMenu(page, 'フィルターを管理…');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/g-filter-manager.png' });
  const sel = page.locator('select', { has: page.locator('option', { hasText: '+ フィルターを追加…' }) }).first();
  const opts = await sel.evaluate((s) => [...s.options].map(o => o.value + '=' + o.textContent));
  log('add options', JSON.stringify(opts));
  const target = (await sel.evaluate((s) => [...s.options].find(o => o.textContent.includes('状態'))?.value));
  await sel.selectOption(target);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shots/g-filter-status.png' });
  // uncheck all then check 進行中
  await page.locator('label', { hasText: '（すべて選択）' }).first().click();
  await page.waitForTimeout(200);
  await page.locator('label', { hasText: /^進行中$/ }).first().click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  let gr2 = await groupRows(page);
  log('after status filter', JSON.stringify(gr2.slice(0, 4).map(g => g.label + g.count)), gr2.length);
  log('bars', JSON.stringify(await bars(page)));
  await page.screenshot({ path: 'shots/g-filter-status-after.png' });
  // global filter
  await page.locator('.ssg-bar-input').fill('佐藤');
  await page.waitForTimeout(800);
  gr2 = await groupRows(page);
  log('after global 佐藤', JSON.stringify(gr2.map(g => g.label + g.count)));
  log('bars', JSON.stringify(await bars(page)));
  await page.locator('.ssg-bar-input').fill('');
  await page.waitForTimeout(800);
  log(logs.join('\n'));
  await browser.close();
})();
