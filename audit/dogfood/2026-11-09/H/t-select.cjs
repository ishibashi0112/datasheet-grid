const { open, G, openColumnMenu, clickMenu, groupRows, cell, totalRow, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
const cnt = (page) => page.getByText(/^選択 \d+ 件$/).innerText();
const statusOf = (page, keys) => page.evaluate(async (keys) => keys, keys);
(async () => {
  const { browser, page, logs } = await open();
  const cb = (k) => page.locator(`${G} [data-row-key="${k}"] .ssg-row-checkbox`).first();
  await cb('T-00001').click();
  await page.waitForTimeout(200);
  log('after 1 click', await cnt(page));
  await cb('T-00150').click({ modifiers: ['Shift'] });
  await page.waitForTimeout(200);
  log('after shift click', await cnt(page));
  await page.screenshot({ path: 'shots/s-select.png', clip: { x: 0, y: 0, width: 1600, height: 450 } });
  // bulk change to 保留
  await page.getByRole('textbox', { name: '一括で変える状態' }).click();
  await page.getByRole('option', { name: '保留' }).click();
  await page.getByRole('button', { name: '状態を一括変更' }).click();
  await page.waitForTimeout(800);
  log('after bulk: status of T-00001', await (await cell(page, 'T-00001', 'progress')).innerText().catch(() => 'not rendered'));
  let gr = await groupRows(page);
  log('groups', JSON.stringify(gr.slice(0, 4).map(g => g.label + g.count)));
  log('count after bulk', await cnt(page));
  // undo via grid Ctrl+Z (focus grid first)
  await (await cell(page, 'T-00118', 'title')).click().catch(async () => { await page.locator(`${G} [data-pane="center"][data-row-key] [data-ssg-col-key="title"]`).first().click(); });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(800);
  gr = await groupRows(page);
  log('after undo groups', JSON.stringify(gr.slice(0, 4).map(g => g.label + g.count)));
  // header select all
  await page.locator(`${G} [aria-label="すべての行を選択"]`).click();
  await page.waitForTimeout(300);
  log('after select all', await cnt(page));
  await page.locator(`${G} [role="columnheader"] .ssg-row-checkbox`).first().click();
  await page.waitForTimeout(300);
  log('after toggle select all again', await cnt(page));
  // filter priority 高 via global filter? use column filter
  await openColumnMenu(page, 'priority');
  await clickMenu(page, 'フィルター…');
  await page.waitForTimeout(800);
  await page.locator('label', { hasText: /^中$/ }).first().click();
  await page.locator('label', { hasText: /^低$/ }).first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  log('bars after filter', JSON.stringify(await bars(page)));
  await page.locator(`${G} [role="columnheader"] .ssg-row-checkbox`).first().click();
  await page.waitForTimeout(300);
  log('after select all with filter', await cnt(page));
  const model = await page.evaluate(() => 0);
  log('header checkbox state', await page.locator(`${G} [role="columnheader"] .ssg-row-checkbox`).first().getAttribute('data-state'));
  // bulk change to 完了 -> how many rows changed?
  await page.getByRole('textbox', { name: '一括で変える状態' }).click();
  await page.getByRole('option', { name: '保留' }).click();
  await page.getByRole('button', { name: '状態を一括変更' }).click();
  await page.waitForTimeout(800);
  // clear filter and count 保留 status overall via CSV
  await page.locator('.ssg-filter-chip-bar, .ssg-bar').getByText('すべてクリア').first().click().catch(e => log('clear fail', e.message));
  await page.waitForTimeout(800);
  log('bars after clear filter', JSON.stringify(await bars(page)));
  const csv = await page.evaluate(() => {
    return null;
  });
  await page.getByRole('button', { name: 'CSV(小計つき)' }).click();
  await page.waitForTimeout(300);
  const stats = await page.evaluate(() => {
    const csv = window.__lastCsv; const lines = csv.split('\r\n'); const head = lines[0].split(',');
    const si = head.indexOf('状態'), pi = head.indexOf('優先度');
    const c = {}; for (const l of lines.slice(1)) { const f = l.split(','); if (!f[pi]) continue; const k = f[si] + '/' + f[pi]; c[k] = (c[k] || 0) + 1; }
    return { head, c };
  });
  log('csv head', JSON.stringify(stats.head));
  log('status/priority counts', JSON.stringify(stats.c));
  log(logs.join('\n'));
  await browser.close();
})();
