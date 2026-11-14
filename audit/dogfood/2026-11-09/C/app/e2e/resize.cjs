const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
async function widths(page, keys) {
  return page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, Math.round(document.querySelector(`[role="columnheader"][data-ssg-col-key="${k}"]`)?.getBoundingClientRect().width ?? -1)])), keys);
}
(async () => {
  const { browser, page, logs } = await open();
  const keys = ['name', 'dept', 'd1', 'd5', 'd6', 'workDays', 'nightCount'];
  console.log('initial', JSON.stringify(await widths(page, keys)));
  // ヘッダーにホバーしたときの見た目(狭い列で ⋮ と日付が重なるか)
  const h5 = await page.locator('[role="columnheader"][data-ssg-col-key="d5"]').boundingBox();
  await page.mouse.move(h5.x + h5.width / 2, h5.y + h5.height / 2);
  await page.waitForTimeout(400);
  await shot(page, '18-header-hover-narrow', { clip: { x: h5.x - 100, y: h5.y - 10, width: 260, height: 90 } });
  // 1) d5 の右端をドラッグで +40px
  const rz = await page.locator('[role="columnheader"][data-ssg-col-key="d5"] .ssg-header-resize').boundingBox();
  console.log('resize handle', rz);
  await page.mouse.move(rz.x + rz.width / 2, rz.y + rz.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(rz.x + rz.width / 2 + i * 5, rz.y + rz.height / 2); await page.waitForTimeout(16); }
  await page.mouse.up();
  await page.waitForTimeout(200);
  console.log('after drag d5 +40', JSON.stringify(await widths(page, keys)));
  console.log('state.columnWidths', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().columnWidths)));
  // 2) d1 の境界をダブルクリック(内容に合わせる)
  const rz1 = await page.locator('[role="columnheader"][data-ssg-col-key="d1"] .ssg-header-resize').boundingBox();
  await page.mouse.dblclick(rz1.x + rz1.width / 2, rz1.y + rz1.height / 2);
  await page.waitForTimeout(500);
  console.log('after dblclick d1', JSON.stringify(await widths(page, keys)));
  // 合計行の切れた値にホバー → ツールチップ
  const tc = await page.evaluate(() => { const c = document.querySelector('.ssg-total-row [data-ssg-col-key="d2"]'); const r = c.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, text: c.textContent, sw: c.querySelector('*')?.scrollWidth, cw: c.querySelector('*')?.clientWidth }; });
  console.log('total d2', tc);
  await page.mouse.move(tc.cx, tc.cy); await page.waitForTimeout(800);
  console.log('tooltip', await page.evaluate(() => [...document.querySelectorAll('.ssg-tooltip')].map((t) => t.textContent + '|' + getComputedStyle(t).visibility + '|' + getComputedStyle(t).opacity)));
  await shot(page, '19-total-tooltip');
  // 3) 列メニュー → すべての列の幅を自動調整
  const h3 = await page.locator('[role="columnheader"][data-ssg-col-key="d3"]').boundingBox();
  await page.mouse.move(h3.x + h3.width / 2, h3.y + h3.height / 2);
  await page.waitForTimeout(200);
  await page.locator('[role="columnheader"][data-ssg-col-key="d3"] button[aria-label*="列メニュー"]').click();
  await page.waitForTimeout(300);
  const items = await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel [role="menuitem"], .ssg-menu-panel button')].map((b) => b.textContent.trim()).filter(Boolean));
  console.log('menu items', items);
  await shot(page, '20-column-menu');
  await page.getByText('すべての列の幅を自動調整').click();
  await page.waitForTimeout(1200);
  console.log('after autosize all', JSON.stringify(await widths(page, keys)));
  console.log('state.columnWidths keys', Object.keys(await page.evaluate(() => window.__grid.current.getState().columnWidths)).length);
  await shot(page, '21-after-autosize-all');
  dumpLogs(logs);
  await browser.close();
})();
