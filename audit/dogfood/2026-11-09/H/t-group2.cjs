const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  // sort by estimate desc via column menu
  await openColumnMenu(page, 'estimate');
  await clickMenu(page, '降順で並び替え');
  await page.waitForTimeout(600);
  let gr = await groupRows(page);
  log('sorted desc top groups', JSON.stringify(gr.filter(g => g.indent === '0px').map(g => g.label + ':' + g.vals.estimate)));
  log('sub groups of first', JSON.stringify(gr.slice(0, 7).map(g => g.label + ':' + g.vals.estimate)));
  await page.getByRole('button', { name: 'すべて閉じる', exact: true }).click();
  await page.waitForTimeout(600);
  gr = await groupRows(page);
  log('collapsed sorted', JSON.stringify(gr.map(g => g.label + ':' + g.vals.estimate)));
  await page.screenshot({ path: 'shots/g-sorted-collapsed.png' });
  await page.getByRole('button', { name: 'すべて開く', exact: true }).click();
  await page.waitForTimeout(400);
  // first leaf rows ordering within group
  const leafs = await page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [data-pane="center"][data-row-key]')].sort((a,b)=>a.dataset.rowIndex-b.dataset.rowIndex).slice(0,6).map(r => r.dataset.rowKey + ':' + r.querySelector('[data-ssg-col-key="estimate"]')?.textContent));
  log('leafs', JSON.stringify(leafs));
  // filter: priority set filter via column menu
  await openColumnMenu(page, 'priority');
  await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/g-filter-priority.png' });
  const pop = await page.evaluate(() => { const p = document.querySelector('.ssg-filter-popover, [class*="filter-popover"]'); return p ? p.textContent.slice(0, 300) : [...document.body.children].map(c => c.className).join(' | '); });
  log('popover', pop);
  log(logs.join('\n'));
  await browser.close();
})();
