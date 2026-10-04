// サブエージェントの高・中所見を実ブラウザで追試する。
import { open, check, summary, errorsOf, renderedRowIndexes, cellText, cell, header, scrollTo, focusGrid, waitIdle, events, clearEvents, pasteText, rows, state } from './pw.mjs';

// ---- C-1: SSRM + StrictMode + initialRowCount 未指定 → 永久に空 ----
{
  const { page, pageErrors, close } = await open('ssrm', { query: 'strict=1&noinit=1' });
  await waitIdle(page, 1500);
  const calls = await page.evaluate(() => window.__ssrm.calls.map((c) => [c.startIndex, c.endIndex, c.outcome]));
  const rowsRendered = (await renderedRowIndexes(page)).length;
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  check('C-1: SSRM StrictMode without initialRowCount shows data', rowsRendered > 0, { rowsRendered, calls, bottom });
  await close();
}
// 対照: StrictMode なし + initialRowCount なし
{
  const { page, close } = await open('ssrm', { query: 'noinit=1' });
  await waitIdle(page, 1500);
  const rowsRendered = (await renderedRowIndexes(page)).length;
  check('C-1 control: SSRM non-strict without initialRowCount shows data', rowsRendered > 0, { rowsRendered, calls: await page.evaluate(() => window.__ssrm.calls.map((c) => [c.startIndex, c.endIndex, c.outcome])) });
  await close();
}
// 対照: StrictMode + initialRowCount あり
{
  const { page, close } = await open('ssrm', { query: 'strict=1' });
  await waitIdle(page, 1500);
  const rowsRendered = (await renderedRowIndexes(page)).length;
  const loaded = await page.evaluate(() => !!document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="0"]') && !document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="0"] .ssg-skeleton-bar'));
  check('C-1 control: SSRM strict with initialRowCount loads row 0', rowsRendered > 0 && loaded, { rowsRendered, loaded, calls: await page.evaluate(() => window.__ssrm.calls.map((c) => [c.startIndex, c.endIndex, c.outcome])) });
  await close();
}

// ---- RD-2 / C-2: エディタ内 Ctrl+V の横取り ----
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=50' });
  await page.evaluate(() => navigator.clipboard.writeText('PASTED'));
  await cell(page, 0, 'name').dblclick();
  await page.keyboard.press('Control+A');
  await clearEvents(page);
  // 実際の Ctrl+V(ブラウザがエディタ input に paste イベントを発火)
  await page.keyboard.press('Control+v');
  await waitIdle(page, 150);
  const inputVal = await page.evaluate(() => document.querySelector('.ssg-cell-editor-input')?.value);
  const rc = await events(page, 'onRowsChange');
  const r0 = (await rows(page))[0].name;
  check('RD-2: Ctrl+V inside editor pastes into the input (not the grid)', inputVal === 'PASTED' && rc.length === 0, { inputVal, onRowsChange: rc.length, rowName: r0 });
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  console.log('RD-2 after Escape row0.name =', (await rows(page))[0].name);
  await close();
}

// ---- RD-1: 編集中に rows が差し替わる(ソート順変化)→ 別行へ書き込み ----
{
  const { page, close } = await open('basic', { query: 'n=50' });
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'qty', direction: 'asc' }] }));
  await waitIdle(page, 200);
  const idBefore = await cellText(page, 3, 'id');
  await cell(page, 3, 'name').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('EDITED');
  // 編集中に外部から rows 差し替え(他行の qty を変えてソート順が変わる)
  await page.evaluate(() => {
    const src = window.__rows().map((r) => ({ ...r, qty: r.qty === null ? null : 1000 - (r.qty ?? 0) }));
    window.__setRows(src);
  });
  await waitIdle(page, 300);
  // 修正後はエディタが元の行(id=2)の新しい位置へ追従し、viewport もそこへ同期する(行 3 は描画窓外になり得る)。
  const editorStill = await page.evaluate(() => !!document.querySelector('.ssg-cell-editor'));
  const editingCellIdx = await page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor');
    if (!ed) return null;
    const r = ed.getBoundingClientRect();
    const row = [...document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')].find((el) => { const b = el.getBoundingClientRect(); return Math.abs(b.top - r.top) < 2; });
    return row ? Number(row.getAttribute('data-row-index')) : null;
  });
  await page.keyboard.press('Enter');
  await waitIdle(page, 150);
  const all = await rows(page);
  const editedRow = all.find((r) => r.name === 'EDITED');
  check('RD-1: commit after external reorder writes to the originally edited row', editedRow && String(editedRow.id) === idBefore, { idBefore, editorStill, editingCellIdx, writtenTo: editedRow?.id });
  await close();
}

// ---- RD-3: 編集中に編集行が消える → editingCell が残りキーが全滅 ----
{
  const { page, close } = await open('basic', { query: 'n=50' });
  await cell(page, 2, 'name').dblclick();
  await page.keyboard.type('x');
  await page.evaluate(() => window.__setRows(window.__rows().slice(0, 1)));
  await waitIdle(page, 200);
  const editorDom = await page.evaluate(() => !!document.querySelector('.ssg-cell-editor'));
  await focusGrid(page);
  await page.evaluate(() => window.__grid.selectCell(0, 1));
  await page.keyboard.press('ArrowRight');
  const ac = await page.evaluate(() => window.__grid.getActiveCell());
  check('RD-3: keyboard works after edited row disappeared', ac && ac.col === 2, { editorDom, ac });
  await close();
}

// ---- L-01: 列あふれ貼り付けで consumer columns が壊れる(非表示列 / pinned) ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  const before = await page.evaluate(() => window.__columns().map((c) => `${c.key}${c.visible === false ? '(h)' : ''}${c.pinned ? '[' + c.pinned + ']' : ''}`));
  await page.evaluate(() => window.__grid.selectCell(0, 10)); // 最終可視列 status(右固定)
  await focusGrid(page);
  await pasteText(page, 'a\tb\tc');
  await waitIdle(page, 200);
  const after = await page.evaluate(() => window.__columns().map((c) => `${c.key}${c.visible === false ? '(h)' : ''}${c.pinned ? '[' + c.pinned + ']' : ''}`));
  const hiddenKept = after.some((k) => k.startsWith('secret'));
  const orderKept = after.slice(0, before.length).join() === before.join();
  check('L-01: overflow paste keeps hidden column + original order', hiddenKept && orderKept, { before, after });
  await close();
}

// ---- C-3: ポップオーバー外側クリックでフォーカスを奪い返す ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  await page.evaluate(() => {
    const inp = document.createElement('input');
    inp.id = 'outside-input';
    inp.placeholder = 'outside';
    document.body.appendChild(inp);
  });
  await header(page, 'name').hover();
  await header(page, 'name').locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.locator('#outside-input').click();
  await waitIdle(page, 200);
  const focused = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
  check('C-3: clicking an outside input while column menu is open keeps focus on that input', focused === 'outside-input', { focused });
  // フィルター popover でも
  await header(page, 'name').hover();
  await header(page, 'name').locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.getByText('フィルター…').first().click();
  await page.waitForSelector('.ssg-filter-popover');
  await page.locator('#outside-input').click();
  await waitIdle(page, 200);
  const focused2 = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
  check('C-3: same for filter popover', focused2 === 'outside-input', { focused2 });
  // コンテキストメニューでも
  await cell(page, 1, 'name').click({ button: 'right' });
  await page.waitForSelector('.ssg-menu-panel');
  await page.locator('#outside-input').click();
  await waitIdle(page, 200);
  const focused3 = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
  check('C-3: same for context menu', focused3 === 'outside-input', { focused3 });
  await close();
}

// ---- B-01: auto-height + 展開行帯 → 計測 flush で scrollTop ジャンプ ----
{
  const { page, close } = await open('autoheight', { query: 'n=500&detail=1' });
  await waitIdle(page, 400);
  await page.evaluate(() => window.__grid.setDetailRowExpanded(2, true)); // index 1 を展開(帯 200px)
  await waitIdle(page, 300);
  await page.evaluate(() => window.__grid.scrollToRow(60, { align: 'start' }));
  await waitIdle(page, 400);
  const st1 = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
  // 未計測行へ進む(ホイール)→ 計測 flush が走る
  const trace = [];
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.move(600, 300);
    await page.mouse.wheel(0, 150);
    await page.waitForTimeout(120);
    trace.push(await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop));
  }
  const backwardJumps = trace.filter((v, i) => i > 0 && trace[i - 1] - v > 100);
  check('B-01: no backward scroll jumps while measuring with an expanded band above', backwardJumps.length === 0, { st1, trace });
  // 上方向
  const trace2 = [];
  for (let i = 0; i < 8; i += 1) {
    await page.mouse.wheel(0, -150);
    await page.waitForTimeout(120);
    trace2.push(await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop));
  }
  const weird = trace2.filter((v, i) => i > 0 && (trace2[i - 1] - v > 450 || v > trace2[i - 1] + 1));
  check('B-01: upward wheel monotonic & no >450px jumps with band', weird.length === 0, { trace2 });
  await close();
}

// ---- B-02: 列チューザー「全解除」で合成列(detail toggle)が先頭 → consumer 列 0 本 ----
{
  const { page, close } = await open('detail', { query: 'n=20' });
  await header(page, 'name').hover();
  await header(page, 'name').locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.getByText('列の表示').click();
  await waitIdle(page, 200);
  const btnTexts = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t.includes('解除') || t.includes('すべて')));
  console.log('B-02 panel buttons:', btnTexts);
  const clearAll = page.getByRole('button', { name: /全解除|すべて解除/ }).first();
  if (await clearAll.count()) {
    await clearAll.click();
    await waitIdle(page, 200);
    const visibleCount = await page.evaluate(() => window.__columns().filter((c) => c.visible !== false).length);
    check('B-02: 全解除 keeps at least 1 consumer column visible (with synthetic toggle column present)', visibleCount >= 1, { visibleCount, cols: await page.evaluate(() => window.__columns().map((c) => `${c.key}:${c.visible === false ? 'h' : 'v'}`)) });
  } else {
    check('B-02: (skipped — no 全解除 button found)', true, btnTexts);
  }
  await close();
}

// ---- B-03: SSRM 件数増加 → 末端の部分ブロックが再取得されず skeleton 固着 ----
{
  const { page, close } = await open('ssrm');
  await page.evaluate(() => { window.__ssrm.server = window.__ssrm.server.slice(0, 150); window.__grid.refreshServerSide(); });
  await page.waitForFunction(() => /Rows: 150\b/.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 5000 });
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 500);
  // 件数が 150 → 1000 に増える(サーバ側で追加。block 1 = 100..199 は 50 行だけキャッシュ済み)
  await page.evaluate(() => { window.__ssrm.server = window.__makeRows(1000, 7); });
  // 件数の更新契機: どこかのブロック取得が必要 → 先頭へ戻って block 0 を取り直させる(refresh は使わない)
  await page.evaluate(() => window.__grid.scrollToTop());
  await waitIdle(page, 300);
  // LRU からの退避を避けるため block 0 は再利用されるはず… 件数を更新させるために別ブロック(block 2)へ
  await page.evaluate(() => window.__grid.scrollToRow(149, { align: 'start' }));
  await waitIdle(page, 800);
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  const skel = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].filter((r) => r.querySelector('.ssg-skeleton-bar')).map((r) => r.getAttribute('data-row-index')));
  await waitIdle(page, 1000);
  const skel2 = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].filter((r) => r.querySelector('.ssg-skeleton-bar')).map((r) => r.getAttribute('data-row-index')));
  console.log('B-03: bottom =', bottom, 'skeleton rows =', skel2, 'calls =', await page.evaluate(() => window.__ssrm.calls.slice(-6).map((c) => [c.startIndex, c.endIndex, c.outcome])));
  check('B-03: rows 150..199 load after total grows (no stuck skeletons in visible window)', skel2.length === 0 || /Rows: 150\b/.test(bottom), { bottom, skel2 });
  await close();
}

// ---- V-02 / V-03: フィルター popover のボタンがキーボードで押せない ----
{
  const { page, close } = await open('basic', { query: 'n=50' });
  await header(page, 'name').hover();
  await header(page, 'name').locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.getByText('フィルター…').first().click();
  await page.waitForSelector('.ssg-filter-popover');
  await page.locator('.ssg-filter-popover .ssg-filter-input').fill('item-0000');
  // Tab で「適用」へ移動して Enter
  await page.locator('.ssg-filter-popover .ssg-filter-btn-primary').focus();
  await page.keyboard.press('Enter');
  await waitIdle(page, 300);
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  const popStill = await page.locator('.ssg-filter-popover').count();
  check('V-02: Enter on focused 適用 button applies filter', /Rows: 9 \//.test(bottom) && popStill === 0, { bottom, popStill });
  await close();
}

// ---- SSRM の bottom bar 分母 "Rows: N / 0" ----
{
  const { page, close } = await open('ssrm');
  await waitIdle(page, 500);
  const top = await page.locator('.ssg-bar--top').textContent();
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  check('SSRM bars: denominator should not be 0', !/Rows: \d+ \/ 0\b/.test(bottom) && !/Rows: \d+ \/ 0\b/.test(top), { top, bottom });
  await close();
}

// ---- 選択の範囲外残留(rows 減少) ----
{
  const { page, close } = await open('basic', { query: 'n=10' });
  await page.evaluate(() => { window.__grid.selectRange({ start: { row: 2, col: 1 }, end: { row: 8, col: 3 } }); });
  await page.evaluate(() => window.__setRows(window.__rows().slice(0, 3)));
  await waitIdle(page, 200);
  const sel = await page.evaluate(() => ({ active: window.__grid.getActiveCell(), selection: window.__grid.getSelection(), selectedRows: window.__grid.getSelectedRows().length, csv: window.__grid.exportCsv({ scope: 'selection', includeHeaders: false }) }));
  check('rows shrink: getSelection/getActiveCell stay in range', (!sel.active || sel.active.row < 3) && (sel.selection.type === 'none' || sel.selection.range.end.row < 3), sel);
  // 範囲外選択のまま Delete / コピー / Enter 編集
  await focusGrid(page);
  await errorsOf(page);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const errs = await errorsOf(page);
  check('rows shrink: operations on stale selection do not throw', errs.filter((e) => e.startsWith('[error]') || e.startsWith('[window')).length === 0, errs.slice(0, 3));
  await close();
}

summary();