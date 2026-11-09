const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
async function info(page) {
  return page.evaluate(() => {
    const g = window.__grid.current;
    const hdrs = [...document.querySelectorAll('[role="columnheader"][data-ssg-col-key]')].map((h) => h.dataset.ssgColKey);
    const w = (k) => Math.round(document.querySelector(`[role="columnheader"][data-ssg-col-key="${k}"]`)?.getBoundingClientRect().width ?? -1);
    const st = g.getState();
    return {
      month: window.__month,
      colcount: document.querySelector('[role="grid"]').getAttribute('aria-colcount'),
      rowcount: document.querySelector('[role="grid"]').getAttribute('aria-rowcount'),
      lastDay: hdrs.filter((k) => /^d\d+$/.test(k)).pop(),
      active: g.getActiveCell(), sel: g.getSelection(), scroll: g.getScrollPosition(),
      widths: { d5: w('d5'), d28: w('d28'), d30: w('d30'), d31: w('d31') },
      colWidths: st.columnWidths, filters: JSON.stringify(st.filters), sort: JSON.stringify(st.sort),
      bar: document.querySelector('.ssg-status-bar, [class*="bottom-bar"], [class*="statusbar"]')?.innerText.replace(/\n/g, ' | '),
      topbar: document.querySelector('[class*="toolbar"], .ssg-top-bar')?.innerText.replace(/\n/g, ' | '),
      bodyRows: document.querySelectorAll('.ssg-body-row[data-row-key][data-pane="left"]').length,
    };
  });
}
const clickMonth = async (page, key) => { await page.locator(`button[data-month="${key}"]`).click(); await page.waitForTimeout(500); };
(async () => {
  const { browser, page, logs } = await open();
  // d5 を手で広げる
  const rz = await page.locator('[role="columnheader"][data-ssg-col-key="d5"] .ssg-header-resize').boundingBox();
  await page.mouse.move(rz.x + 3, rz.y + 20); await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(rz.x + 3 + i * 5, rz.y + 20); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(200);
  // S050 の d31 をアクティブに、範囲 d25..d31 x 3 行
  await ensureVisible(page, 'S050', 'd31');
  await clickCell(page, 'S050', 'd25');
  const t = await cellRect(page, 'S052', 'd31');
  await page.mouse.click(t.cx, t.cy, { modifiers: ['Shift'] });
  await page.waitForTimeout(150);
  console.log('Dec', JSON.stringify(await info(page)));
  await shot(page, '22-dec-before');
  await clickMonth(page, '2026-11');
  console.log('Nov', JSON.stringify(await info(page)));
  await shot(page, '23-nov-after');
  await clickMonth(page, '2027-02');
  console.log('Feb', JSON.stringify(await info(page)));
  await shot(page, '24-feb-after');
  // キー操作できるか
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100);
  console.log('Feb ArrowRight', JSON.stringify((await gridState(page)).active));
  await clickMonth(page, '2026-12');
  console.log('Dec again', JSON.stringify(await info(page)));
  await shot(page, '25-dec-again');
  dumpLogs(logs);
  await browser.close();
})();
