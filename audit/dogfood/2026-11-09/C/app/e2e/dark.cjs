const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
const colors = (page) => page.evaluate(() => {
  const cs = (s, p = 'backgroundColor') => { const e = document.querySelector(s); return e ? getComputedStyle(e)[p] : null; };
  return {
    html: document.documentElement.className, body: getComputedStyle(document.body).backgroundColor,
    cell: cs('.ssg-body-row[data-row-key="S002"] [data-ssg-col-key="d2"]'), cellText: cs('.ssg-body-row[data-row-key="S002"] [data-ssg-col-key="name"]', 'color'),
    header: cs('[role="columnheader"][data-ssg-col-key="d2"]'), label: cs('.ssg-label-row [class*="label"]'), total: cs('.ssg-total-row [data-ssg-col-key="d2"]'),
    sat: cs('.ssg-body-row[data-row-key="S002"] .shift-sat'), sun: cs('.ssg-body-row[data-row-key="S002"] .shift-sun'),
    chipInfo: cs('.ssg-chip--info'), chipInfoFg: cs('.ssg-chip--info', 'color'), chipNeutral: cs('.ssg-chip--neutral'),
    root: cs('.ssg-root'), colorScheme: cs('.ssg-root', 'colorScheme'),
  };
});
(async () => {
  const { browser, page, logs } = await open();
  console.log('light', JSON.stringify(await colors(page)));
  await page.getByText('ダーク', { exact: true }).click();
  await page.waitForTimeout(500);
  console.log('dark', JSON.stringify(await colors(page)));
  await shot(page, '32-dark');
  // ポップアップ: 列メニュー / select エディタ / ツールチップ / フィルター
  await ensureVisible(page, 'S003', 'd4');
  await clickCell(page, 'S003', 'd4');
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await shot(page, '33-dark-select-editor');
  console.log('select popover bg', await page.evaluate(() => { const p = document.querySelector('.ssg-select-editor-popover'); return p ? getComputedStyle(p).backgroundColor + ' / ' + getComputedStyle(p).color + ' cls=' + p.className : null; }));
  await page.keyboard.press('Escape');
  const hb = await page.locator('[role="columnheader"][data-ssg-col-key="d4"]').boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  await page.locator('[role="columnheader"][data-ssg-col-key="d4"] button[aria-label*="列メニュー"]').click();
  await page.waitForTimeout(300);
  await page.getByText('フィルター…').click();
  await page.waitForTimeout(600);
  await shot(page, '34-dark-filter');
  console.log('filter popover bg', await page.evaluate(() => { const p = document.querySelector('.ssg-filter-popover'); return p ? getComputedStyle(p).backgroundColor + ' / ' + getComputedStyle(p).color : null; }));
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // Ctrl+F の検索バー
  await clickCell(page, 'S003', 'd4');
  await page.keyboard.press('Control+f'); await page.waitForTimeout(300);
  await page.keyboard.type('佐藤'); await page.waitForTimeout(500);
  await shot(page, '35-dark-find');
  console.log('find', await page.evaluate(() => document.querySelector('.ssg-find-bar')?.innerText.replace(/\n/g, ' ')));
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // 戻す
  await page.getByText('ダーク', { exact: true }).click();
  await page.waitForTimeout(400);
  console.log('light again', JSON.stringify(await colors(page)));
  dumpLogs(logs);
  await browser.close();
})();
