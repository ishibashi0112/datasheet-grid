const { open, G, cell, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(500);
  await page.locator(`${G} [data-row-key="T-00001"] .ssg-row-checkbox`).first().click();
  await page.waitForTimeout(300);
  log('count', await page.getByText(/^選択 \d+ 件$/).innerText());
  await page.getByRole('button', { name: '選択を削除' }).click();
  await page.waitForTimeout(600);
  log('bars', JSON.stringify(await bars(page)));
  log('scrollTop', await page.locator(G).evaluate(e => e.scrollTop));
  log('rendered keys', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[aria-label="タスク一覧"] [data-pane="left"][data-row-key]')].sort((a,b)=>a.dataset.rowIndex-b.dataset.rowIndex).slice(0,5).map(r => r.dataset.rowIndex + ':' + r.dataset.rowKey))));
  await page.screenshot({ path: 'shots/d-after-delete.png' });
  log(logs.join('\n'));
  await browser.close();
})();
