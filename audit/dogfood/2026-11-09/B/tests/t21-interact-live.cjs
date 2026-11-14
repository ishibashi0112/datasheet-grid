// Interactions while the feed runs: scroll stability, keyboard latency, column resize, filter list scroll.
const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(500);
  // wheel scroll
  const g = await center(page, '.ssg-scroll-container');
  await page.mouse.move(g.x, g.y);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(400);
  const tops = [];
  for (let i = 0; i < 8; i++) { tops.push(await page.evaluate(() => window.__app.grid().getScrollPosition().top)); await page.waitForTimeout(250); }
  console.log('scrollTop over 2s (sorted, live):', tops.join(','));
  // keyboard latency: click a cell, press ArrowDown 10 times, measure each keydown -> active cell change
  const nameHdr = await page.locator('[role="columnheader"]', { hasText: 'Company' }).first().boundingBox();
  await page.mouse.click(nameHdr.x + 30, g.y);
  const lat = await page.evaluate(async () => {
    const g = window.__app.grid();
    const el = document.activeElement;
    const out = [];
    for (let i = 0; i < 10; i++) {
      const before = g.getActiveCell().row;
      const t0 = performance.now();
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      const after = g.getActiveCell().row;
      out.push(`${Math.round(performance.now() - t0)}ms(${before}->${after})`);
      await new Promise((r) => setTimeout(r, 120));
    }
    return out;
  });
  console.log('synthetic ArrowDown latency (frame):', lat.join(' '));
  // real keyboard: press PageDown and check
  const before = await page.evaluate(() => window.__app.grid().getActiveCell());
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(300);
  console.log('PageDown', JSON.stringify(before), '->', JSON.stringify(await page.evaluate(() => window.__app.grid().getActiveCell())));
  // column resize drag on "Company" header right edge
  await page.evaluate(() => window.__app.grid().setScrollPosition({ top: 0, left: 0 }));
  await page.waitForTimeout(300);
  const hdr = page.locator('[role="columnheader"]', { hasText: 'Company' }).first();
  const hb = await hdr.boundingBox();
  const startX = hb.x + hb.width - 2, y = hb.y + hb.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(startX + i * 8, y); await page.waitForTimeout(60); }
  await page.mouse.up();
  await page.waitForTimeout(300);
  const nb = await page.locator('[role="columnheader"]', { hasText: 'Company' }).first().boundingBox();
  console.log('Company width', hb.width, '->', nb.width, 'state', JSON.stringify(await page.evaluate(() => window.__app.grid().getState().columnWidths)));
  // filter popover list scroll stability for Chg% (numberSet; candidates change each tick)
  const c = await center(page, await cellHandle(page, 2, 'changePct'));
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const fi = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
  const fb = await fi.boundingBox();
  await page.mouse.click(fb.x + 10, fb.y + fb.height / 2);
  await page.waitForTimeout(500);
  const lst = await center(page, '.ssg-filter-list');
  await page.mouse.move(lst.x, lst.y);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(200);
  const listTops = [];
  for (let i = 0; i < 8; i++) { listTops.push(await page.evaluate(() => `${document.querySelector('.ssg-filter-list')?.scrollTop}/${document.querySelector('.ssg-filter-list')?.parentElement?.innerText.match(/(\d+) total/)?.[1]}`)); await page.waitForTimeout(250); }
  console.log('filter list scrollTop/total over 2s:', listTops.join(' '));
  // uncheck one value, then wait for ticks: does the checkbox state persist?
  const firstBox = page.locator('.ssg-filter-list input[type=checkbox]').nth(3);
  const lb = await firstBox.boundingBox();
  const label = await page.evaluate(() => document.querySelectorAll('.ssg-filter-list label')[3]?.innerText);
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.waitForTimeout(1500);
  const stillUnchecked = await page.evaluate((label) => { const l = [...document.querySelectorAll('.ssg-filter-list label')].find((x) => x.innerText === label); return l ? !l.querySelector('input').checked : 'label not rendered'; }, label);
  console.log('unchecked', label, '-> still unchecked after ticks:', stillUnchecked, 'summary:', await page.evaluate(() => document.querySelector('.ssg-filter-list')?.parentElement?.parentElement?.innerText.match(/Selected[^\n]*/)?.[0]));
  await shot(page, `21-filterlist-${mode}`);
  await page.keyboard.press('Escape');
  console.log('LOGS', logs);
  await browser.close();
})();
