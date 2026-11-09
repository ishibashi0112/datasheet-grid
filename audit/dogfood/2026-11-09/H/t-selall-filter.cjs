const { open, G, openColumnMenu, clickMenu, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const cnt = (page) => page.getByText(/^選択 \d+ 件$/).innerText();
(async () => {
  const { browser, page, logs } = await open();
  await openColumnMenu(page, 'priority'); await clickMenu(page, 'フィルター…'); await page.waitForTimeout(800);
  await page.locator('label', { hasText: /^中$/ }).first().click();
  await page.locator('label', { hasText: /^低$/ }).first().click();
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  log('filtered', JSON.stringify((await bars(page))[0]));
  await page.locator(`${G} [aria-label="すべての行を選択"]`).click(); await page.waitForTimeout(300);
  log('after select all (filtered)', await cnt(page));
  // clear filter
  await page.locator('text=すべてクリア').first().click(); await page.waitForTimeout(800);
  log('after clear filter', JSON.stringify((await bars(page))[0]), 'label', await cnt(page));
  const hdr = await page.locator(`${G} [role="columnheader"] .ssg-row-checkbox`).first().getAttribute('data-state');
  log('header checkbox state', hdr);
  const lowRowChecked = await page.evaluate(() => { const r = [...document.querySelectorAll('[aria-label="タスク一覧"] [data-pane="left"][data-row-key]')]; return r.slice(0, 6).map(x => x.dataset.rowKey + ':' + x.querySelector('.ssg-row-checkbox')?.dataset.state); });
  log('rows checked state', JSON.stringify(lowRowChecked));
  // click delete
  await page.getByRole('button', { name: '選択を削除' }).click(); await page.waitForTimeout(800);
  log('after delete', JSON.stringify((await bars(page))[0]));
  await page.screenshot({ path: 'shots/s-selall-filter-delete.png' });
  log(logs.join('\n'));
  await browser.close();
})();
