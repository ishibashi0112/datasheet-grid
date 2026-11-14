const { open, G } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [aria-label="すべての行を選択"]`).click(); await page.waitForTimeout(300);
  console.log('after select all', await page.evaluate(() => window.__grid.current.getSelectedRowCount()));
  await page.getByTestId('toolbar').getByRole('button', { name: 'タスクを追加' }).click(); await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  console.log('after add: count', await page.evaluate(() => window.__grid.current.getSelectedRowCount()), 'new row selected?', await page.evaluate(() => window.__grid.current.isRowSelected('T-03001')));
  await browser.close();
})();
