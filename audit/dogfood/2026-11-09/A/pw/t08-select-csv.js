const L = require('./lib');
const fs = require('fs');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
async function rowCheckbox(page, rowNumber) {
  await L.ensureVisible(page, rowNumber);
  return page.evaluate((rn) => {
    const el = document.querySelector(`[role="row"][aria-rowindex="${rn + 1}"] [role="rowheader"]`);
    const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, html: el.outerHTML.slice(0, 200) };
  }, rowNumber);
}
(async () => {
  const { browser, page, logs } = await L.open();
  let rows = await rowsOf(page);
  const before = rows.length;
  // 行 14, 15, 16 を選ぶ(14 クリック → 16 Shift+クリック)
  let c = await rowCheckbox(page, 14); await page.mouse.click(c.cx, c.cy);
  c = await rowCheckbox(page, 16); await page.keyboard.down('Shift'); await page.mouse.click(c.cx, c.cy); await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  console.log('selected count', await page.textContent('[data-testid="selected-count"]'), JSON.stringify(await page.evaluate(() => window.__app.grid.getSelectedRowKeys())));
  await L.shot(page, '08a-row-selected');
  // 削除
  await page.click('[data-testid="delete-btn"]');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after delete', before, '→', rows.length, 'message', await page.textContent('[data-testid="message"]'), 'header', await L.headerTotal(page), 'total', await L.totalRowText(page));
  console.log('selected count after delete', await page.textContent('[data-testid="selected-count"]'));
  // Ctrl+Z (focus is on delete button → needs grid focus). Use undo button
  await page.click('[data-testid="undo-btn"]');
  await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after undo', rows.length, rows.slice(13, 16).map((r) => r.id).join(','), 'header', await L.headerTotal(page), 'total', await L.totalRowText(page));
  // 全選択チェック
  const corner = await page.evaluate(() => { const el = document.querySelector('[role="columnheader"] [role="checkbox"], .ssg-corner-cell [role="checkbox"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, label: el.getAttribute('aria-label') }; });
  console.log('corner', corner);
  await page.mouse.click(corner.cx, corner.cy);
  await page.waitForTimeout(200);
  console.log('select all', await page.textContent('[data-testid="selected-count"]'), JSON.stringify(await page.evaluate(() => window.__app.grid.getRowSelection())).slice(0, 100));
  await page.mouse.click(corner.cx, corner.cy);
  await page.waitForTimeout(200);
  console.log('clear all', await page.textContent('[data-testid="selected-count"]'));

  // 提出: 下書きの 13 行目を選ぶ(領収書の不足があればエラー)
  c = await rowCheckbox(page, 13); await page.mouse.click(c.cx, c.cy);
  await page.click('[data-testid="submit-btn"]'); await page.waitForTimeout(250);
  console.log('submit msg', await page.textContent('[data-testid="message"]'));
  // 領収書を付けて再提出
  await L.clickCell(page, 13, '領収書'); await page.waitForTimeout(200);
  console.log('r13 receipt', (await rowsOf(page))[12].receipt);
  await page.click('[data-testid="submit-btn"]'); await page.waitForTimeout(250);
  rows = await rowsOf(page);
  console.log('submit msg2', await page.textContent('[data-testid="message"]'), 'r13 status', rows[12].status);
  await L.clickCell(page, 13, '金額', { dbl: true });
  console.log('submitted now editable?', !!(await page.$('.ssg-cell-editor')));
  // CSV に危険な値を入れる: 摘要に =SUM(A1) と -5
  await L.clickCell(page, 14, '摘要');
  await page.keyboard.type('=HYPERLINK("http://x")');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await L.clickCell(page, 15, '摘要');
  await page.keyboard.type('+81-3-1234');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await L.clickCell(page, 16, '摘要');
  await page.keyboard.type('@user');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('line2, "quoted"');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  // CSV 出力
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="csv-btn"]')]);
  const p = require('path').join(L.DIR, 'expenses.csv');
  await dl.saveAs(p);
  const buf = fs.readFileSync(p);
  console.log('filename', dl.suggestedFilename(), 'bytes', buf.length, 'BOM', buf.slice(0, 3).toString('hex'));
  const text = buf.toString('utf8').replace(/^﻿/, '');
  const lines = text.split('\r\n');
  console.log('lines', lines.length);
  console.log(lines.slice(0, 3).join('\n'));
  console.log('...');
  console.log(lines.slice(13, 18).join('\n'));
  console.log('...');
  console.log(lines.slice(-3).join('\n'));
  // 合計を検算
  rows = await rowsOf(page);
  console.log('header', await L.headerTotal(page), 'sum', rows.reduce((s, r) => s + (r.amount || 0), 0));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
