const { open, center } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
const col = process.argv[3] ?? 'changePct';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=replace`);
  await page.evaluate((col) => { const g = window.__app.grid(); g.selectCell(0, g.getColIndex(col), { scrollIntoView: true }); g.focus(); }, col);
  await page.waitForTimeout(300);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const fi = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
  const fb = await fi.boundingBox();
  await page.mouse.click(fb.x + 10, fb.y + fb.height / 2);
  await page.waitForTimeout(600);
  const lst = await center(page, '.ssg-filter-list');
  await page.mouse.move(lst.x, lst.y);
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(300);
  const seq = await page.evaluate(async (y) => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const el = document.elementFromPoint(document.querySelector('.ssg-filter-list').getBoundingClientRect().left + 40, y);
      out.push(el?.closest('label')?.innerText.trim());
    }
    return out;
  }, lst.y);
  console.log(col, 'label under the pointer every 250ms:', seq.join(' | '));
  await browser.close();
})();
