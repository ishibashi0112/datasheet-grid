const { open, shot, cellRect, clickCell, ensureVisible, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.evaluate(() => navigator.clipboard.writeText('夜\t早\tx'));
  await ensureVisible(page, 'S004', 'd2');
  await clickCell(page, 'S004', 'd2');
  await page.keyboard.press('Control+v'); await page.waitForTimeout(200);
  await clickCell(page, 'S008', 'd8');
  await page.mouse.move(5, 5); await page.waitForTimeout(400);
  const c = await cellRect(page, 'S004', 'd3');
  await shot(page, '37-invalid-mark-idle', { clip: { x: c.x - 100, y: c.y - 40, width: 300, height: 110 } });
  console.log(await page.evaluate(() => { const e = document.querySelector('.ssg-body-row[data-row-key="S004"] [data-ssg-col-key="d3"]'); const cs = getComputedStyle(e); const a = getComputedStyle(e, '::after'); const b = getComputedStyle(e, '::before'); return { bg: cs.backgroundColor, before: b.content + ' ' + b.borderTopColor + ' ' + b.width, after: a.content + ' ' + a.borderTopColor + ' ' + a.width + ' ' + a.backgroundColor }; }));
  // 同じ列の土日の印
  dumpLogs(logs);
  await browser.close();
})();
