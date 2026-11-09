const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
(async () => {
  const { browser, page, logs } = await L.open();
  let rows = await rowsOf(page);
  console.log('r15..r18 receipt', rows.slice(14, 18).map((r) => r.receipt));
  for (const r of [15, 16, 17]) {
    const b = await L.cellBox(page, r, '領収書');
    const cb = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el ? el.outerHTML.slice(0, 160) : null; }, { x: b.cx, y: b.cy });
    console.log('elementFromPoint', cb);
    await page.mouse.click(b.cx, b.cy);
    await page.waitForTimeout(250);
    rows = await rowsOf(page);
    console.log(`after 1st click r${r}`, rows[r - 1].receipt);
    await page.mouse.click(b.cx, b.cy);
    await page.waitForTimeout(250);
    rows = await rowsOf(page);
    console.log(`after 2nd click r${r}`, rows[r - 1].receipt);
  }
  // click away from the checkbox but in the cell
  const b = await L.cellBox(page, 18, '領収書');
  await page.mouse.click(b.x + 5, b.cy);
  await page.waitForTimeout(250);
  rows = await rowsOf(page);
  console.log('edge click r18', rows[17].receipt);
  // select via ArrowDown
  await L.clickCell(page, 16, '区分');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  rows = await rowsOf(page);
  console.log('r16 cat after ArrowUp', rows[15].category, 'active', JSON.stringify(await page.evaluate(() => window.__app.grid.getActiveCell())));
  // type-ahead with ascii? labels are Japanese; check typing 'そ' via insertText
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
