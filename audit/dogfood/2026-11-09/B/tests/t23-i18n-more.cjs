// English scan of filters with blank values (Target numberSet, Memo textSet), date filter + calendar, sort manager with entries.
const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?run=0`);
  const all = [];
  const scan = async (label) => { const r = await scanJapanese(page, label); all.push(...r); return r; };
  const openFilter = async (key) => {
    await page.evaluate((key) => { const g = window.__app.grid(); g.selectCell(0, g.getColIndex(key), { scrollIntoView: true }); g.focus(); }, key);
    await page.waitForTimeout(300);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.ssg-menu-panel');
    const el = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
    const b = await el.boundingBox();
    await page.mouse.click(b.x + 10, b.y + b.height / 2);
    await page.waitForTimeout(600);
  };
  for (const key of ['target', 'memo', 'updatedAt']) {
    await openFilter(key);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-list label')].slice(0, 6).map((l) => l.innerText.trim()));
    console.log(key, 'first labels:', JSON.stringify(labels));
    await shot(page, `23-filter-${key}`);
    await scan(`filter-${key}`);
    if (key === 'updatedAt') {
      // open the calendar of the date input
      const btns = await page.locator('.ssg-filter-popover button, [class*="filter"] button').all();
      const names = [];
      for (const b of btns) names.push(await b.getAttribute('aria-label'));
      console.log('date filter buttons aria-labels:', JSON.stringify(names.filter(Boolean)));
      const cal = page.locator('button[aria-label*="calendar" i], button[aria-label*="Calendar" i]').first();
      if (await cal.count()) {
        const cb = await cal.boundingBox();
        await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
        await page.waitForTimeout(400);
        await shot(page, '23-calendar');
        await scan('calendar');
        console.log('calendar text:', await page.evaluate(() => document.querySelector('[class*="calendar"]')?.innerText.replace(/\s+/g, ' ').slice(0, 200)));
        await page.keyboard.press('Escape');
      }
      // operator options
      console.log('date ops:', await page.evaluate(() => [...document.querySelectorAll('select option')].map((o) => o.textContent).join('|')));
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  // sort manager with two entries
  await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'sector', direction: 'asc' }, { columnKey: 'changePct', direction: 'desc' }] }));
  await page.waitForTimeout(400);
  await page.evaluate(() => { const g = window.__app.grid(); g.selectCell(0, 1, { scrollIntoView: true }); g.focus(); });
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const ms = page.locator('.ssg-menu-item', { hasText: 'Manage sorting' }).first();
  const mb = await ms.boundingBox();
  await page.mouse.click(mb.x + 10, mb.y + mb.height / 2);
  await page.waitForTimeout(500);
  await shot(page, '23-sort-manager');
  await scan('sort-manager-2');
  console.log('sort panel:', await page.evaluate(() => document.querySelector('[role="tabpanel"], [class*="tool-panel"], [class*="toolpanel"]')?.innerText.replace(/\s+/g, ' ').slice(0, 300)));
  await page.keyboard.press('Escape');
  // header tooltips (sorted header): hover the sort indicator
  await page.waitForTimeout(300);
  console.log('\n=== JAPANESE FOUND ===\n' + [...new Set(all)].join('\n'));
  console.log('LOGS', logs);
  await browser.close();
})();
