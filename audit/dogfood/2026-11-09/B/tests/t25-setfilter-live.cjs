// Uncheck one value in the Chg % (numberSet) list while the feed is paused, then let the feed run with the popover open.
const { open, shot, center, cellHandle } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
const col = process.argv[3] ?? 'changePct';
const idx = Number(process.argv[4] ?? 3);
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=replace&run=0`);
  await page.evaluate((col) => { const g = window.__app.grid(); g.selectCell(0, g.getColIndex(col), { scrollIntoView: true }); g.focus(); }, col);
  await page.waitForTimeout(300);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const fi = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
  const fb = await fi.boundingBox();
  await page.mouse.click(fb.x + 10, fb.y + fb.height / 2);
  await page.waitForTimeout(600);
  const label = await page.evaluate((i) => document.querySelectorAll('.ssg-filter-list label')[i]?.innerText.trim(), idx);
  const box = page.locator('.ssg-filter-list label').nth(idx).locator('input');
  const bb = await box.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(300);
  const summary = () => page.evaluate((label) => {
    const pop = document.querySelector('.ssg-filter-list').closest('[class*="popover"]') ?? document.querySelector('.ssg-filter-list').parentElement.parentElement;
    const t = pop.innerText;
    const lab = [...document.querySelectorAll('.ssg-filter-list label')].find((l) => l.innerText.trim() === label);
    const rows = window.__app.getRows();
    const v = Number(label);
    return `${t.match(/Selected[^\n]*/)?.[0]} | ${t.match(/(No filter|Filter[^\n]*applied|[^\n]*will[^\n]*)/i)?.[0] ?? ''} | label rendered=${!!lab} checked=${lab ? lab.querySelector('input').checked : '-'} | rowsWithValue=${rows.filter((r) => r[document.__col ?? 'changePct'] === v).length} | barRows=${document.querySelector('.ssg-bar--bottom .ssg-bar-chip')?.textContent}`;
  }, label);
  console.log('unchecked', label, '=>', await summary());
  await shot(page, `25-unchecked-${col}`);
  await page.evaluate(() => window.__app.setRunning(true));
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); console.log(`t+${(i + 1) * 0.5}s`, await summary()); }
  await shot(page, `25-after-${col}`);
  // Close (apply) and inspect state
  const close = page.locator('button', { hasText: 'Close' }).last();
  const cb = await close.boundingBox();
  await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForTimeout(300);
  console.log('state filters:', JSON.stringify(await page.evaluate(() => window.__app.grid().getState().filters)).slice(0, 400));
  console.log('LOGS', logs);
  await browser.close();
})();
