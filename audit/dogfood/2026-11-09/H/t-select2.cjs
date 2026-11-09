const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const cnt = (page) => page.getByText(/^選択 \d+ 件$/).innerText();
(async () => {
  const { browser, page, logs } = await open();
  await page.exposeFunction('noop', () => {});
  await openColumnMenu(page, 'priority');
  await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.locator('label', { hasText: /^中$/ }).first().click();
  await page.locator('label', { hasText: /^低$/ }).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.locator(`${G} [role="columnheader"] .ssg-row-checkbox`).first().click();
  await page.waitForTimeout(300);
  log('count', await cnt(page));
  log('select value', await page.getByRole('textbox', { name: '一括で変える状態' }).inputValue());
  const sb = page.getByRole('button', { name: '状態を一括変更' });
  log('button disabled?', await sb.isDisabled());
  await sb.click();
  await page.waitForTimeout(800);
  log('bars', JSON.stringify(await bars(page)));
  await page.locator('text=すべてクリア').first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'CSV(小計つき)' }).click();
  await page.waitForTimeout(300);
  const stats = await page.evaluate(() => {
    const csv = window.__lastCsv; const lines = csv.split('\r\n'); const head = lines[0].split(',');
    const si = head.indexOf('状態'), pi = head.indexOf('優先度');
    const c = {}; for (const l of lines.slice(1)) { const f = l.split(','); if (!f[pi]) continue; const k = f[si] + '/' + f[pi]; c[k] = (c[k] || 0) + 1; }
    return c;
  });
  log('status/priority counts', JSON.stringify(stats));
  log(logs.join('\n'));
  await browser.close();
})();
