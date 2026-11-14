const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
(async () => {
  const { browser, page, logs } = await L.open();
  // 1 セルをコピー → 3 セルを選んで貼り付け
  await L.clickCell(page, 13, '税区分');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(150);
  console.log('clip', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  await L.clickCell(page, 14, '税区分');
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  let rows = await rowsOf(page);
  console.log('paste 1 cell into 3-cell selection', rows.slice(12, 17).map((r) => r.taxType));
  console.log('selection after', JSON.stringify(await page.evaluate(() => window.__app.grid.getSelection())));
  // undo/redo restores active cell
  await L.clickCell(page, 20, '摘要');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  console.log('after undo active', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())), 'sel', JSON.stringify(await page.evaluate(() => window.__app.grid.getSelection())));
  rows = await rowsOf(page);
  console.log('after undo', rows.slice(12, 17).map((r) => r.taxType));
  // fill drag + Escape cancels
  await L.clickCell(page, 13, '金額');
  const h = await page.evaluate(() => { const e = document.querySelector('.ssg-fill-handle'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const b = await L.cellBox(page, 16, '金額');
  const before = (await rowsOf(page)).slice(12, 16).map((r) => r.amount);
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x, h.y + 8, { steps: 2 }); await page.mouse.move(b.cx, b.cy, { steps: 6 });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.mouse.up(); await page.waitForTimeout(300);
  console.log('fill + Escape: before', before, 'after', (await rowsOf(page)).slice(12, 16).map((r) => r.amount));
  // fill with Ctrl → series (+1)
  await page.mouse.move(h.x, h.y); await page.mouse.down(); await page.mouse.move(h.x, h.y + 8, { steps: 2 }); await page.mouse.move(b.cx, b.cy, { steps: 6 });
  await page.keyboard.down('Control'); await page.waitForTimeout(100);
  console.log('tooltip with Ctrl', await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent));
  await page.mouse.up(); await page.keyboard.up('Control'); await page.waitForTimeout(300);
  console.log('fill + Ctrl:', (await rowsOf(page)).slice(12, 16).map((r) => r.amount));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
