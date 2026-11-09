const { open, shot, center, cellHandle } = require('./lib.cjs');
const mode = process.argv[2] ?? 'replace';
const sorted = process.argv[3] === 'sorted';
const base = process.argv[4] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?mode=${mode}`);
  if (sorted) {
    await page.evaluate(() => window.__app.grid().applyState({ sort: [{ columnKey: 'changePct', direction: 'desc' }] }));
    await page.waitForTimeout(500);
  }
  // scroll memo into view at view row 4
  const viewRow = 4;
  const target = await page.evaluate((vr) => {
    const g = window.__app.grid();
    const col = g.getColIndex('memo');
    g.selectCell(vr, col, { scrollIntoView: true });
    return { col };
  }, viewRow);
  await page.waitForTimeout(400);
  const cell = await cellHandle(page, viewRow + 2, 'memo');
  const pt = await center(page, cell);
  const keyAtStart = await page.evaluate((vr) => {
    const rowEl = [...document.querySelectorAll('[role="row"][data-pane="center"]')].find((el) => el.getAttribute('aria-rowindex') === String(vr + 2));
    return rowEl?.getAttribute('data-row-key');
  }, viewRow);
  await page.mouse.dblclick(pt.x, pt.y);
  await page.waitForTimeout(100);
  const text = 'Watch earnings on Thursday';
  for (const ch of text) {
    await page.keyboard.type(ch);
    await page.waitForTimeout(90);
  }
  const editorState = await page.evaluate((vr) => {
    const ed = document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea');
    const rowEl = [...document.querySelectorAll('[role="row"][data-pane="center"]')].find((el) => el.getAttribute('aria-rowindex') === String(vr + 2));
    const edBox = document.querySelector('.ssg-cell-editor')?.getBoundingClientRect();
    return { value: ed?.value, focused: document.activeElement === ed, keyAtPosNow: rowEl?.getAttribute('data-row-key'), edTop: edBox?.top, rowTop: rowEl?.getBoundingClientRect().top };
  }, viewRow);
  console.log('keyAtStart', keyAtStart, 'editor', JSON.stringify(editorState));
  await shot(page, `07-editing-${mode}${sorted ? '-sorted' : ''}`);
  const pre = await page.evaluate((k) => {
    const g = window.__app.grid();
    const edBox = document.querySelector('.ssg-cell-editor')?.getBoundingClientRect();
    // which body row is under the editor (center pane rows)
    let under = null;
    for (const el of document.querySelectorAll('[role="row"][data-pane="center"][data-row-key]')) {
      const b = el.getBoundingClientRect();
      if (edBox && b.top <= edBox.top + 2 && b.bottom >= edBox.top + 2) under = el.getAttribute('data-row-key');
    }
    return { viewIdxOfStartKey: g.getViewRowIndex(k), active: g.getActiveCell(), under, edTop: edBox?.top, scroll: g.getScrollPosition() };
  }, keyAtStart);
  console.log('pre-commit', JSON.stringify(pre));
  const s1 = await page.evaluate(() => window.__app.getRows().map((r) => [r.symbol, r.updatedAt, r.last]));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(30);
  const after = await page.evaluate(([s1, text]) => {
    const rows = window.__app.getRows();
    const m = new Map(rows.map((r) => [r.symbol, r]));
    let reverted = 0;
    for (const [sym, upd] of s1) { const r = m.get(sym); if (r && r.updatedAt < upd) reverted++; }
    const withMemo = rows.filter((r) => r.memo === text).map((r) => r.symbol);
    const anyMemo = rows.filter((r) => r.memo).map((r) => [r.symbol, r.memo]);
    return { reverted, withMemo, anyMemo };
  }, [s1, text]);
  console.log('after commit', JSON.stringify(after));
  await page.waitForTimeout(1500);
  const later = await page.evaluate((text) => window.__app.getRows().filter((r) => r.memo).map((r) => [r.symbol, r.memo]), text);
  console.log('1.5s later memos', JSON.stringify(later));
  const undoInfo = await page.evaluate(() => ({ canUndo: window.__app.grid().canUndo() }));
  console.log('canUndo after 1.5s', undoInfo);
  // Ctrl+Z
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
  const afterUndo = await page.evaluate((text) => window.__app.getRows().filter((r) => r.memo).map((r) => [r.symbol, r.memo]), text);
  console.log('after Ctrl+Z memos', JSON.stringify(afterUndo));
  console.log('LOGS', logs);
  await browser.close();
})();
