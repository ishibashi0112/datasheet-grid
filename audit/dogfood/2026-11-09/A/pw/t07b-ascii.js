const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.hasAttribute('data-ssg-ime-input') ? '[ime]' : ''}` : null; });
(async () => {
  const { browser, page, logs } = await L.open();
  for (const r of [21, 5 + 12]) {
    const b = await L.clickCell(page, r, '摘要');
    console.log('row', r, 'cell text', b.text, 'active', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())), await active(page));
    await page.keyboard.type('hello');
    await page.waitForTimeout(100);
    console.log(' editor?', !!(await page.$('.ssg-cell-editor')), 'value', await page.evaluate(() => document.querySelector('.ssg-cell-editor textarea, .ssg-cell-editor input')?.value), await active(page));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const rows = await rowsOf(page);
    console.log(' memo', JSON.stringify(rows[r - 1].memo));
  }
  await browser.close();
})();
