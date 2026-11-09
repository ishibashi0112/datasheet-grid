const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
async function paste(page, text) {
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(400);
}
(async () => {
  const { browser, page, logs } = await L.open();
  // 1. 領収書(checkbox)への貼り付け
  await L.clickCell(page, 13, '領収書');
  await page.keyboard.press('Escape');
  await L.clickCell(page, 13, '領収書'); // toggles! use keyboard instead
  let rows = await rowsOf(page);
  console.log('r13 receipt after 2 clicks', rows[12].receipt);
  // select cell without toggling: click memo then ArrowLeft
  await L.clickCell(page, 13, '摘要'); await page.keyboard.press('ArrowLeft');
  await paste(page, ['TRUE', 'FALSE', '○', '1', 'はい', '有'].join('\n'));
  rows = await rowsOf(page);
  console.log('receipt paste', rows.slice(12, 18).map((r) => r.receipt));
  // 2. Excel の複数行セル(引用符付き)を摘要へ
  await L.clickCell(page, 14, '摘要');
  await paste(page, '"1行目\n2行目"\t\n"A ""B"" C"\n');
  rows = await rowsOf(page);
  console.log('memo paste', JSON.stringify(rows[13].memo), JSON.stringify(rows[14].memo));
  // 3. 提出済みをまたぐ貼り付け(11〜14 行目の金額)
  await L.clickCell(page, 11, '金額');
  await paste(page, '1\n2\n3\n4');
  rows = await rowsOf(page);
  console.log('amount paste over submitted', rows.slice(10, 14).map((r) => `${r.amount}/${r.status}`));
  // 4. 末尾を超える貼り付け → createRow
  const n0 = rows.length;
  await page.evaluate(() => window.__app.grid.scrollToBottom());
  await page.waitForTimeout(300);
  await L.clickCell(page, n0, '金額');
  await paste(page, '100\n200\n300');
  rows = await rowsOf(page);
  console.log('overflow paste rows', n0, '→', rows.length, rows.slice(-3).map((r) => JSON.stringify(r)).join('\n'));
  console.log('header', await L.headerTotal(page), 'total', await L.totalRowText(page));
  await L.shot(page, '10-overflow-paste');
  // 5. Ctrl+Z
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after undo rows', rows.length);
  // 6. 範囲 Delete(提出済みを含む)
  await page.evaluate(() => window.__app.grid.scrollToTop()); await page.waitForTimeout(200);
  await L.clickCell(page, 11, '摘要');
  const b = await L.cellBox(page, 14, '摘要');
  await page.keyboard.down('Shift'); await page.mouse.click(b.cx, b.cy); await page.keyboard.up('Shift');
  await page.keyboard.press('Delete'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('delete range memo', rows.slice(10, 14).map((r) => `${JSON.stringify(r.memo)}/${r.status}`));
  // Delete on amount (number) → null; on date (required) mark
  await L.clickCell(page, 15, '金額'); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  await L.clickCell(page, 15, '日付'); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  await L.clickCell(page, 15, '区分'); await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  rows = await rowsOf(page);
  console.log('r15 after deletes', JSON.stringify(rows[14]));
  console.log('header', await L.headerTotal(page), 'total', await L.totalRowText(page));
  await L.shot(page, '10-after-deletes');
  console.log('invalid r15', JSON.stringify(await page.evaluate(() => window.__app.grid.getInvalidCells().filter((c) => c.rowKey === 'seed-15'))));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
