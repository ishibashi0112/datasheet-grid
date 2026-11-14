const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.getByTestId('scheme').click();
  await page.waitForTimeout(600);
  log('html scheme', await page.evaluate(() => document.documentElement.getAttribute('data-mantine-color-scheme')));
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(600);
  await (await cell(page, 'T-00118', 'estimate')).click();
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
  await page.locator(`${G} [data-row-key="T-00150"] .ssg-row-checkbox`).first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/dark-grid.png' });
  await openColumnMenu(page, 'priority');
  await page.screenshot({ path: 'shots/dark-menu.png' });
  await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/dark-filter.png' });
  await page.keyboard.press('Escape');
  await openColumnMenu(page, 'title'); await clickMenu(page, '列の表示'); await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/dark-toolpanel.png' });
  await page.locator('.ssg-toolpanel .ssg-popover-close').click();
  // inner select editor in dark
  const own = page.locator(`[aria-label="T-00001 のサブタスク"] [data-row-key="T-00001-2"] [data-ssg-col-key="owner"]`).first();
  await own.dblclick(); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/dark-inner-select.png' });
  await page.keyboard.press('Escape');
  // date editor
  await (await cell(page, 'T-00118', 'due')).dblclick(); await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/dark-date.png', clip: { x: 0, y: 130, width: 1600, height: 500 } });
  await page.keyboard.press('Escape');
  // tooltip on validation? set title empty
  await (await cell(page, 'T-00118', 'title')).click(); await page.keyboard.press('Delete'); await page.waitForTimeout(300);
  await (await cell(page, 'T-00118', 'title')).hover(); await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/dark-invalid.png', clip: { x: 0, y: 130, width: 1600, height: 500 } });
  log(logs.join('\n'));
  await browser.close();
})();
