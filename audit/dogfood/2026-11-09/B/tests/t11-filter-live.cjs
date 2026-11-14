const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  // open filter popover for Chg % while feed is running
  const c = await cellHandle(page, 2, 'changePct');
  const p = await center(page, c);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const el = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
  let b = await el.boundingBox();
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await page.waitForTimeout(600);
  // choose operator "Greater than or equal to" (default) and type 1
  const valueInput = page.locator('input[placeholder="Value"]').first();
  b = await valueInput.boundingBox();
  await page.mouse.click(b.x + 20, b.y + b.height / 2);
  for (const ch of '1') { await page.keyboard.type(ch); }
  await page.waitForTimeout(1200); // feed ticks while popover open
  const typed = await valueInput.inputValue();
  console.log('value input after ticks:', typed);
  const totalTxt = await page.evaluate(() => document.querySelector('.ssg-filter-list')?.parentElement?.innerText.slice(0, 60));
  console.log('values area:', JSON.stringify(totalTxt));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  const popoverOpen = await page.evaluate(() => !!document.querySelector('.ssg-filter-list'));
  console.log('popover still open after Enter:', popoverOpen);
  if (popoverOpen) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot(page, `11-filter-live-${mode}`);
  // Check over time that rendered rows satisfy changePct >= 1 (with feed paused at the moment of checking)
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1000);
    await page.evaluate(() => window.__app.setRunning(false));
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => {
      const data = window.__app.getRows();
      const byKey = new Map(data.map((d) => [d.symbol, d]));
      const keys = [...new Set([...document.querySelectorAll('[role="row"][data-pane="center"][data-row-key]')].map((el) => el.getAttribute('data-row-key')))];
      const bad = keys.filter((k) => !(byKey.get(k).changePct >= 1));
      const expectedCount = data.filter((d) => d.changePct >= 1).length;
      const bar = document.querySelector('.ssg-bar--bottom .ssg-bar-chip')?.textContent;
      return { ticks: window.__app.ticks(), rendered: keys.length, bad: bad.map((k) => `${k}:${byKey.get(k).changePct}`), expectedCount, bar };
    });
    console.log('check', i, JSON.stringify(r));
    await page.evaluate(() => window.__app.setRunning(true));
  }
  // chip bar
  console.log('chips:', await page.evaluate(() => [...document.querySelectorAll('[class*="chip-bar"], [class*="filter-chip"]')].map((e) => e.textContent).slice(0, 5)));
  console.log((await scanJapanese(page, 'filter-live')).join('\n'));
  console.log('LOGS', logs);
  await browser.close();
})();
