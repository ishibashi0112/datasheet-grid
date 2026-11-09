const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}${a.getAttribute('name') ? '[name=' + a.getAttribute('name') + ']' : ''}.${(a.className || '').toString().slice(0, 40)}` : null; });
(async () => {
  const { browser, page, logs } = await L.open();
  await L.clickCell(page, 17, '摘要');
  await page.keyboard.type('abc');
  console.log('editing?', !!(await page.$('.ssg-cell-editor')), await active(page));
  await page.click('input[name="memo"]');
  await page.waitForTimeout(400);
  let rows = await rowsOf(page);
  console.log('after click form: editor?', !!(await page.$('.ssg-cell-editor')), 'memo r17', JSON.stringify(rows[16].memo), 'focus', await active(page));
  await page.keyboard.type('X');
  console.log('form memo value', await page.inputValue('input[name="memo"]'));
  // multiline memo: Enter in form after editing grid
  // global filter tests
  const gf = 'input[placeholder="グローバルフィルター"]';
  for (const q of ['transport', '交通費', '1,200', '43340', '43,340', '提出済み', 'submitted', '2026-10-01', '新宿']) {
    await page.fill(gf, q);
    await page.waitForTimeout(450);
    const n = await page.evaluate(() => window.__app.grid.getExportData().rows.length);
    console.log(`global "${q}" →`, n);
  }
  await page.fill(gf, '');
  // find (Ctrl+F) is not enabled. Column filter on 区分 (set) → choose 交通費
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
