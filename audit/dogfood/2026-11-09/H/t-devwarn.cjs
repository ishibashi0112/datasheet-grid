const { open, G } = require('./lib.cjs');
(async () => {
  // state with group width + a removed column + grouping change via menu
  const { browser, page, logs } = await open();
  await page.evaluate(() => localStorage.setItem('wbs-grid-state', JSON.stringify({ version: 2, columnWidths: { __ssg_group__: 150, oldcol: 99 }, filters: { globalText: '', columnFilters: { oldcol: { kind: 'text', value: 'x' } } }, sort: [{ columnKey: 'oldcol', direction: 'asc' }], columns: [{ key: 'title' }, { key: 'id', pinned: 'left' }] })));
  logs.length = 0;
  await page.reload(); await page.waitForSelector('[role="grid"]'); await page.waitForTimeout(1000);
  console.log(logs.filter(l => !l.includes('DevTools')).join('\n---\n'));
  console.log('headers', await page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key]')].map(h => h.dataset.ssgColKey).join(' ')));
  await browser.close();
})();
