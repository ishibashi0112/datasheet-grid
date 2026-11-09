const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const st = (page) => page.evaluate(() => JSON.stringify({ a: window.__app.grid.getActiveCell(), s: window.__app.grid.getSelection() }));
(async () => {
  const { browser, page, logs } = await L.open();
  await page.evaluate(() => navigator.clipboard.writeText('X'));
  // A: Shift+Arrow
  await L.clickCell(page, 14, '摘要');
  console.log('click', await st(page));
  await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowDown');
  console.log('shift+down x2', await st(page));
  await L.shot(page, '19a-shift-range');
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  let rows = await rowsOf(page);
  console.log('A paste X → memos 14..16', rows.slice(13, 16).map((r) => r.memo));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  // B: mouse drag
  const a = await L.cellBox(page, 14, '摘要'); const b = await L.cellBox(page, 16, '摘要');
  await page.mouse.move(a.cx, a.cy); await page.mouse.down(); await page.mouse.move(b.cx, b.cy, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(150);
  console.log('drag', await st(page));
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('B paste X → memos 14..16', rows.slice(13, 16).map((r) => r.memo));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  // C: click + shift+click
  await L.clickCell(page, 14, '摘要');
  const c = await L.cellBox(page, 16, '摘要');
  await page.keyboard.down('Shift'); await page.mouse.click(c.cx, c.cy); await page.keyboard.up('Shift');
  console.log('shift+click', await st(page));
  await page.keyboard.press('Control+v'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('C paste X → memos 14..16', rows.slice(13, 16).map((r) => r.memo));
  console.log('bottom bar', await page.evaluate(() => document.querySelector('.ssg-root').innerText.split('\n').slice(-4).join(' | ')));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
