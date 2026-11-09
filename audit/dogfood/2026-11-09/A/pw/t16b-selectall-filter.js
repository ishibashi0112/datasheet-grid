const L = require('./lib');
(async () => {
  const { browser, page, logs } = await L.open();
  await page.fill('input[placeholder="グローバルフィルター"]', 'タクシー');
  await page.waitForTimeout(500);
  const corner = await page.evaluate(() => { const el = document.querySelector('[role="columnheader"] [role="checkbox"]'); const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await page.mouse.click(corner.cx, corner.cy);
  await page.waitForTimeout(300);
  console.log('filtered: keys', (await page.evaluate(() => window.__app.grid.getSelectedRowKeys())).length);
  await page.fill('input[placeholder="グローバルフィルター"]', '');
  await page.waitForTimeout(500);
  console.log('after clearing filter: model', JSON.stringify(await page.evaluate(() => window.__app.grid.getRowSelection())), 'keys', (await page.evaluate(() => window.__app.grid.getSelectedRowKeys())).length, 'count', await page.evaluate(() => window.__app.grid.getSelectedRowCount()));
  const checked = await page.$$eval('[role="rowheader"] [role="checkbox"][aria-checked="true"]', (els) => els.length);
  console.log('checked boxes rendered', checked, 'header', await page.evaluate(() => document.querySelector('[role="columnheader"] [role="checkbox"]').getAttribute('aria-checked')));
  await L.shot(page, '16c-after-clear-filter');
  // 1 行の選択を外してから再び絞り込み
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
