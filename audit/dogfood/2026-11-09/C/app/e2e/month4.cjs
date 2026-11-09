const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
const clickMonth = async (page, key) => { await page.locator(`button[data-month="${key}"]`).click(); await page.waitForTimeout(500); };
(async () => {
  const { browser, page, logs } = await open();
  // d30 を手で広げる
  await ensureVisible(page, 'S001', 'd30');
  const rz = await page.locator('[role="columnheader"][data-ssg-col-key="d30"] .ssg-header-resize').boundingBox();
  await page.mouse.move(rz.x + 3, rz.y + 20); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(rz.x + 3 + i * 5, rz.y + 20); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(200);
  // d31 にフィルター(applyState で)
  await page.evaluate(() => window.__grid.current.applyState({ filters: { columnFilters: { d31: { kind: 'set', mode: 'include', values: ['夜'] } } } }));
  await page.waitForTimeout(300);
  const w = () => page.evaluate(() => JSON.stringify(window.__grid.current.getState().columnWidths));
  console.log('Dec widths', await w());
  await clickMonth(page, '2027-02');
  console.log('Feb widths', await w());
  await page.evaluate(() => window.__grid.current.setScrollPosition({ left: 0 })); await page.waitForTimeout(200);
  // フィルターを管理… を開く(どの列でもよい)
  const hb = await page.locator('[role="columnheader"][data-ssg-col-key="d3"]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  await page.locator('[role="columnheader"][data-ssg-col-key="d3"] button[aria-label*="列メニュー"]').click();
  await page.waitForTimeout(200);
  await page.getByText('フィルターを管理…').click();
  await page.waitForTimeout(800);
  await shot(page, '31-feb-filter-manager');
  console.log('manager:', await page.evaluate(() => [...document.querySelectorAll('.ssg-popover, .ssg-menu-panel, [class*="tool-panel"], [class*="toolpanel"]')].map((e) => e.innerText.replace(/\n/g, '|')).join(' ## ').slice(0, 800)));
  await page.keyboard.press('Escape');
  await clickMonth(page, '2026-12');
  console.log('Dec again widths', await w());
  dumpLogs(logs);
  await browser.close();
})();
