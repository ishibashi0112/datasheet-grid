const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
(async () => {
  const { browser, page, logs } = await L.open();
  await L.shot(page, '02a-labels');
  // 13 行目(下書き)の日付を押す
  await L.clickCell(page, 13, '日付');
  const tsv = [
    '2026/11/1\t交通費\t１，２００\t課税 10%',
    '11/2\t会議費\t3,500\t軽減 8%',
    '2026-11-03\tmeal\t１２００\t非課税',
    '2026年11月4日\t宿泊費\t¥12,000\texempt',
  ].join('\r\n') + '\r\n';
  await page.evaluate((t) => navigator.clipboard.writeText(t), tsv);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
  const rows = await rowsOf(page);
  for (const i of [12, 13, 14, 15]) console.log(JSON.stringify(rows[i]));
  for (const r of [13, 14, 15, 16]) console.log(r, await L.cellText(page, r, '日付'), '|', await L.cellText(page, r, '区分'), '|', await L.cellText(page, r, '金額'), '|', await L.cellText(page, r, '税区分'));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));
  await L.shot(page, '02b-after-paste');
  // invalid cells
  const inv = await page.evaluate(() => window.__app.grid.getInvalidCells());
  console.log('invalid', JSON.stringify(inv));
  // undo
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const rows2 = await rowsOf(page);
  console.log('after undo', JSON.stringify(rows2[12]), JSON.stringify(rows2[13]));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(300);
  const rows3 = await rowsOf(page);
  console.log('after redo', JSON.stringify(rows3[12]));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
