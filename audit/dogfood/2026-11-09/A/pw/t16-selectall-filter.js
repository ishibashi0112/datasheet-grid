const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
(async () => {
  const { browser, page, logs } = await L.open();
  // 摘要に「タクシー」でグローバルフィルター
  await page.fill('input[placeholder="グローバルフィルター"]', 'タクシー');
  await page.waitForTimeout(500);
  const visible = await page.evaluate(() => window.__app.grid.getExportData().rows.length);
  console.log('visible rows', visible, 'bar', await page.evaluate(() => document.querySelector('.ssg-root').innerText.split('\n')[0]));
  const corner = await page.evaluate(() => { const el = document.querySelector('[role="columnheader"] [role="checkbox"]'); const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await page.mouse.click(corner.cx, corner.cy);
  await page.waitForTimeout(300);
  console.log('selected label', await page.textContent('[data-testid="selected-count"]'));
  console.log('model', JSON.stringify(await page.evaluate(() => window.__app.grid.getRowSelection())));
  console.log('getSelectedRowKeys', (await page.evaluate(() => window.__app.grid.getSelectedRowKeys())).length, 'getSelectedRowCount', await page.evaluate(() => window.__app.grid.getSelectedRowCount()));
  console.log('header checkbox state', await page.evaluate(() => document.querySelector('[role="columnheader"] [role="checkbox"]').getAttribute('aria-checked')));
  await L.shot(page, '16a-selectall-filtered');
  // 削除ボタン(ドキュメントのレシピ通り)
  await page.click('[data-testid="delete-btn"]');
  await page.waitForTimeout(400);
  let rows = await rowsOf(page);
  console.log('after delete rows', rows.length, 'message', await page.textContent('[data-testid="message"]'));
  await page.fill('input[placeholder="グローバルフィルター"]', '');
  await page.waitForTimeout(500);
  console.log('after clearing filter rows visible', await page.evaluate(() => window.__app.grid.getExportData().rows.length));
  await L.shot(page, '16b-after-delete');
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
