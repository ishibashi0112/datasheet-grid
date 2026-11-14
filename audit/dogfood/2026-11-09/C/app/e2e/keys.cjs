const { open, shot, cellRect, clickCell, gridState, snapshot, diff, ensureVisible, dumpLogs } = require('./lib.cjs');
async function where(page) {
  return page.evaluate(() => {
    const g = window.__grid.current;
    const a = g.getActiveCell();
    const sc = document.querySelector('.ssg-scroll-container');
    const ov = document.querySelector('.ssg-active-cell-overlay, [class*="active-cell"]');
    let vis = null;
    if (ov) {
      const r = ov.getBoundingClientRect();
      const s = sc.getBoundingClientRect();
      const header = document.querySelector('.ssg-header-row')?.getBoundingClientRect();
      const total = document.querySelector('.ssg-total-row')?.getBoundingClientRect();
      const sticky = [...document.querySelectorAll('.ssg-label-row')].map((e) => e.getBoundingClientRect()).filter((x) => x.top <= (header?.bottom ?? 0) + 2 && x.bottom > (header?.bottom ?? 0));
      vis = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), viewTop: Math.round(header?.bottom ?? s.top), viewBottom: Math.round(total?.top ?? s.bottom), stickyBottom: sticky[0] ? Math.round(sticky[0].bottom) : null };
    }
    const row = a ? document.querySelector(`.ssg-body-row[data-row-index="${a.row}"]`) : null;
    return { a, key: row?.dataset.rowKey ?? (row ? 'label?' : 'not-rendered'), focus: document.activeElement?.className?.toString().slice(0, 60) || document.activeElement?.tagName, vis };
  });
}
(async () => {
  const { browser, page, logs } = await open();
  await ensureVisible(page, 'S005', 'd10');
  await clickCell(page, 'S005', 'd10');
  const seq = [
    'Home', 'End', 'Home', 'Control+ArrowRight', 'Control+ArrowLeft', 'Control+ArrowDown', 'Control+ArrowUp',
    'Control+End', 'Control+Home', 'PageDown', 'PageDown', 'PageDown', 'PageUp', 'ArrowUp', 'ArrowUp', 'ArrowDown',
  ];
  for (const k of seq) {
    await page.keyboard.press(k);
    await page.waitForTimeout(180);
    console.log(k.padEnd(20), JSON.stringify(await where(page)));
  }
  await shot(page, '16-keys-after-pageup');
  // ラベル行の上で ↑ / ↓
  await ensureVisible(page, 'S031', 'd3');
  await clickCell(page, 'S031', 'd3');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(120);
  console.log('ArrowUp from S031 ->', JSON.stringify(await where(page)));
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(120);
  console.log('ArrowDown from S030 ->', JSON.stringify(await where(page)));
  // Tab / Shift+Tab で出入り
  await ensureVisible(page, 'S010', 'd30');
  await clickCell(page, 'S010', 'd30');
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(100); console.log('Tab', i, JSON.stringify(await where(page))); }
  await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(150);
  console.log('Shift+Tab back in', JSON.stringify(await where(page)));
  // Enter で select エディタ → ↓ → Enter で確定して下へ(ラベル行をまたぐ)
  let snap = await snapshot(page);
  await ensureVisible(page, 'S030', 'd7');
  await clickCell(page, 'S030', 'd7');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const ed = await page.evaluate(() => { const p = document.querySelector('.ssg-select-editor-popover'); return p ? { text: p.innerText.replace(/\n/g, '|'), active: document.activeElement?.className } : null; });
  console.log('select editor', JSON.stringify(ed));
  await shot(page, '17-select-editor');
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  let s = await snapshot(page); console.log('select commit diff', JSON.stringify(diff(snap, s))); snap = s;
  console.log('after commit', JSON.stringify(await where(page)));
  // F2 → Escape
  await page.keyboard.press('F2'); await page.waitForTimeout(150);
  console.log('F2 open?', await page.evaluate(() => !!document.querySelector('.ssg-select-editor-popover')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  console.log('Esc closed?', await page.evaluate(() => !document.querySelector('.ssg-select-editor-popover')), JSON.stringify(await where(page)));
  // 印字キー(英字)で打ち始め
  await page.keyboard.press('h'); await page.waitForTimeout(200);
  console.log('after typing h', await page.evaluate(() => document.querySelector('.ssg-select-editor-popover')?.innerText.replace(/\n/g, '|') ?? 'no editor'));
  await page.keyboard.press('Escape');
  // Delete で消す
  await page.keyboard.press('Delete'); await page.waitForTimeout(150);
  s = await snapshot(page); console.log('Delete diff', JSON.stringify(diff(snap, s))); snap = s;
  dumpLogs(logs);
  await browser.close();
})();
