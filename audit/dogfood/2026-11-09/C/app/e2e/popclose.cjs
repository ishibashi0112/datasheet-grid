const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
const state = (page) => page.evaluate(() => ({ filterPop: !!document.querySelector('.ssg-filter-popover'), menu: !!document.querySelector('.ssg-menu-panel'), focus: (document.activeElement?.className || document.activeElement?.tagName || '').toString().slice(0, 50) }));
(async () => {
  const { browser, page, logs } = await open();
  await ensureVisible(page, 'S001', 'd31');
  const openMenu = async (key) => {
    const hb = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`).boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
    const b = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"] button[aria-label*="列メニュー"]`).boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(250);
  };
  await openMenu('d31');
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  console.log('1 filter open', JSON.stringify(await state(page)));
  await page.locator('.ssg-filter-popover label', { hasText: /すべて/ }).first().click();
  await page.locator('.ssg-filter-popover label', { hasText: /^夜/ }).first().click();
  await page.waitForTimeout(200);
  console.log('2 after checks', JSON.stringify(await state(page)), JSON.stringify(await page.evaluate(() => window.__grid.current.getState().filters.columnFilters)));
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  console.log('3 after Enter', JSON.stringify(await state(page)));
  // 別の列の ⋮ を押す
  await openMenu('nightCount');
  console.log('4 after other column menu click', JSON.stringify(await state(page)));
  await shot(page, '54-popover-and-menu');
  await page.getByText('降順で並び替え').click(); await page.waitForTimeout(400);
  console.log('5 after sort item', JSON.stringify(await state(page)));
  // セルを押す
  await clickCell(page, 'S001', 'd20').catch(() => {});
  await page.waitForTimeout(250);
  console.log('6 after cell click', JSON.stringify(await state(page)));
  dumpLogs(logs);
  await browser.close();
})();
