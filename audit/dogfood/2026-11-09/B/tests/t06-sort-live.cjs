const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const base = process.argv[3] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  // sort desc via column menu
  const c = await cellHandle(page, 2, 'changePct');
  const p = await center(page, c);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const el = page.locator('.ssg-menu-item', { hasText: 'Sort descending' }).first();
  const b = await el.boundingBox();
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await page.waitForTimeout(1500);
  const checkOrder = async (label) => {
    await page.evaluate(() => window.__app.setRunning(false));
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[role="row"][data-pane="center"][data-row-key]')]
        .map((el) => ({ idx: Number(el.getAttribute('aria-rowindex')), key: el.getAttribute('data-row-key') }))
        .sort((a, b) => a.idx - b.idx);
      const data = window.__app.getRows();
      const byKey = new Map(data.map((d) => [d.symbol, d]));
      const sorted = [...data].sort((a, b) => b.changePct - a.changePct);
      const expectedTop = sorted.slice(0, rows.length).map((d) => d.symbol);
      const domVals = rows.map((r) => byKey.get(r.key)?.changePct);
      let inversions = 0;
      for (let i = 1; i < domVals.length; i++) if (domVals[i] > domVals[i - 1]) inversions++;
      const firstIdx = rows[0]?.idx;
      return { firstIdx, n: rows.length, inversions, domTop: rows.slice(0, 8).map((r) => r.key), expectedTop: expectedTop.slice(0, 8), domVals: domVals.slice(0, 8) };
    });
    console.log(label, JSON.stringify(r));
    await page.evaluate(() => window.__app.setRunning(true));
  };
  await checkOrder('after-sort');
  await shot(page, `06-sorted-${mode}`);
  // click row 5 symbol cell
  const s = await center(page, await cellHandle(page, 6, 'name'));
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(50);
  const before = await page.evaluate(() => {
    const a = window.__app.grid().getActiveCell();
    return { active: a, detail: document.querySelector('[data-testid=detail] h2')?.textContent };
  });
  console.log('clicked', JSON.stringify(before));
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => {
      const a = window.__app.grid().getActiveCell();
      const rowEl = [...document.querySelectorAll('[role="row"][data-pane="center"]')].find((el) => el.getAttribute('aria-rowindex') === String(a.row + 2));
      const activeOverlay = document.querySelector('.ssg-active-cell, [class*="active-cell"]');
      return { active: a, rowAtActive: rowEl?.getAttribute('data-row-key'), detail: document.querySelector('[data-testid=detail] h2')?.textContent };
    });
    console.log('t+' + (i + 1) * 0.5, JSON.stringify(now));
  }
  await checkOrder('after-ticks');
  // selection range: drag across rows 3..6 Last
  const a1 = await center(page, await cellHandle(page, 3, 'last'));
  const a2 = await center(page, await cellHandle(page, 6, 'changePct'));
  await page.mouse.move(a1.x, a1.y); await page.mouse.down(); await page.mouse.move(a2.x, a2.y, { steps: 4 }); await page.mouse.up();
  const keysAtSel = await page.evaluate(() => window.__app.grid().getSelectedRows().map((r) => r.symbol));
  await page.waitForTimeout(1500);
  const keysAfter = await page.evaluate(() => window.__app.grid().getSelectedRows().map((r) => r.symbol));
  console.log('selected rows at select:', keysAtSel, 'after 1.5s:', keysAfter);
  // burst screenshots to see animation
  for (let i = 0; i < 3; i++) { await shot(page, `06-burst-${mode}-${i}`); await page.waitForTimeout(90); }
  console.log('LOGS', logs);
  await browser.close();
})();
