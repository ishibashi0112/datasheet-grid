// サブエージェントの高・中所見を実ブラウザで追試する。
import { open, check, pending, summary, errorsOf, renderedRowIndexes, cellText, cell, header, scrollTo, focusGrid, waitIdle, events, clearEvents, pasteText, rows, state } from './pw.mjs';

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

// ---- RD-5 / M-03: 列幅 state が columns の参照変化で消える / 全列ぶん焼き込まれる ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  const initialWidths = await page.evaluate(() => window.__grid.getState().columnWidths);
  check('RD-5: initial getState().columnWidths is empty (no default widths baked in)', Object.keys(initialWidths).length === 0, { initialWidths });
  await page.evaluate(() => window.__grid.applyState({ ...window.__grid.getState(), columnWidths: { name: 300 } }));
  await waitIdle(page);
  // インライン columns={[...]} 相当: 同内容・別参照の columns を渡し直す
  await page.evaluate(() => window.__setColumns(window.__columns().map((c) => ({ ...c }))));
  await waitIdle(page);
  const afterRerender = await page.evaluate(() => ({
    widths: window.__grid.getState().columnWidths,
    domWidth: Math.round(document.querySelector('[data-ssg-col-key="name"]')?.getBoundingClientRect().width ?? 0),
  }));
  check('RD-5: applyState width survives a new columns reference', afterRerender.widths.name === 300 && afterRerender.domWidth === 300, afterRerender);
  const roundTrip = await page.evaluate(() => {
    const before = JSON.stringify(window.__grid.getState());
    window.__grid.applyState(JSON.parse(before));
    return { before, after: JSON.stringify(window.__grid.getState()) };
  });
  await waitIdle(page);
  const afterApply = await page.evaluate(() => JSON.stringify(window.__grid.getState()));
  check('RD-5: applyState(getState()) is idempotent', afterApply === roundTrip.before, { before: roundTrip.before, afterApply });
  await close();
}

// ---- L-02: 非表示列のフィルター / ソートが効かない ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  await page.evaluate(() => window.__grid.applyState({
    ...window.__grid.getState(),
    filters: { globalText: '', columnFilters: { secret: { kind: 'text', value: 's1' } } },
    sort: [{ columnKey: 'secret', direction: 'desc' }],
  }));
  await waitIdle(page, 300);
  // 先頭列(id = i + 1)で確認する。secret = `s${i}`
  const view = await page.evaluate(() => window.__grid.getExportData({ scope: 'view' }).rows.map((r) => r[0]?.text));
  // s1, s10..s19 の 11 件(n=20 → s0..s19)が secret 降順で並ぶ
  const expected = ['s1', ...Array.from({ length: 10 }, (_, i) => `s1${i}`)].sort().reverse().map((sec) => String(Number(sec.slice(1)) + 1));
  check('L-02: filter / sort on a hidden column apply to rows', JSON.stringify(view) === JSON.stringify(expected), { view });
  await close();
}

// ---- L-07 / L-08: 数値ソートの空値位置 ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  await page.evaluate(() => {
    const next = window.__rows().map((r, i) => (i === 3 ? { ...r, qty: null } : i === 7 ? { ...r, qty: '' } : r));
    window.__setRows(next);
  });
  await waitIdle(page);
  const qtyAt = (dir) => page.evaluate(async (d) => {
    window.__grid.applyState({ ...window.__grid.getState(), sort: [{ columnKey: 'qty', direction: d }] });
    await new Promise((r) => setTimeout(r, 200));
    const data = window.__grid.getExportData({ scope: 'view' });
    const idx = data.columns.findIndex((c) => c.key === 'qty');
    return data.rows.map((r) => r[idx]?.value);
  }, dir);
  const asc = await qtyAt('asc');
  const desc = await qtyAt('desc');
  // 空値(元データの空値 + 追加した null / '')が末尾に連続し、それより前は数値だけであること
  const isBlank = (v) => v === null || v === undefined || v === '';
  const blanksLast = (vals) => {
    const first = vals.findIndex(isBlank);
    return first > 0 && vals.slice(first).every(isBlank) && vals.slice(0, first).every((v) => typeof v === 'number') && vals.length - first >= 2;
  };
  check('L-07: blanks sort last in asc and desc', blanksLast(asc) && blanksLast(desc), { asc: asc.slice(-3), desc: desc.slice(-3) });
  await close();
}

// ---- C-5: Tab / Shift+Tab のキーボードトラップ ----
{
  const { page, close } = await open('basic', { query: 'n=20' });
  await page.evaluate(() => {
    const before = document.createElement('input');
    before.id = 'before-input';
    document.body.prepend(before);
    const after = document.createElement('input');
    after.id = 'after-input';
    document.body.appendChild(after);
  });
  // 最終列(範囲外 index は B-05 でクランプ)で Tab → グリッド外の次の要素へ
  await focusGrid(page);
  await page.evaluate(() => window.__grid.setActiveCell({ row: 0, col: 999 }));
  await waitIdle(page);
  // ヘッダーの列メニューボタン(shell 内でタブ移動可能)を経由して、有限回でグリッド外の input に届くこと
  let presses = 0;
  let afterTab = '';
  for (; presses < 40 && afterTab !== 'after-input'; presses++) {
    await page.keyboard.press('Tab');
    afterTab = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
  }
  check('C-5: Tab on the last column moves focus out of the grid', afterTab === 'after-input', { afterTab, presses });
  // 先頭列で Shift+Tab → グリッド外の前の要素へ
  await focusGrid(page);
  await page.evaluate(() => window.__grid.setActiveCell({ row: 0, col: 0 }));
  await waitIdle(page);
  await page.keyboard.press('Shift+Tab');
  await waitIdle(page);
  const afterShiftTab = await page.evaluate(() => document.activeElement?.id || document.activeElement?.className);
  const shiftTabOutside = await page.evaluate(() => !document.activeElement?.closest('.ssg-shell'));
  check('C-5: Shift+Tab on the first column moves focus out of the grid', shiftTabOutside, { afterShiftTab });
  // 端以外の Tab は従来どおりアクティブセル移動
  await focusGrid(page);
  await page.evaluate(() => window.__grid.setActiveCell({ row: 0, col: 0 }));
  await waitIdle(page);
  await page.keyboard.press('Tab');
  await waitIdle(page);
  const mid = await page.evaluate(() => ({ active: window.__grid.getActiveCell(), focused: document.activeElement?.className }));
  check('C-5: Tab in the middle still moves the active cell', mid.active?.col === 1 && String(mid.focused).includes('ssg-shell'), mid);
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

// ---- B-02: 列チューザーの全解除(マスタートグル)で合成列(detail toggle)が先頭 → consumer 列 0 本 ----
{
  const { page, close } = await open('detail', { query: 'n=20' });
  await header(page, 'name').hover();
  await header(page, 'name').locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.getByText('列の表示').click();
  await waitIdle(page, 200);
  await page.locator('.ssg-chooser-master-btn').click(); // 全表示(secret が非表示なので)
  await waitIdle(page, 200);
  await page.locator('.ssg-chooser-master-btn').click(); // 全解除(最後の 1 列は残す契約)
  await waitIdle(page, 300);
  const visibleCount = await page.evaluate(() => window.__columns().filter((c) => c.visible !== false).length);
  check('B-02: 全解除 keeps exactly 1 consumer column visible (synthetic toggle column present)', visibleCount === 1, { visibleCount, headers: await page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell[data-ssg-col-key]')].map((e) => e.getAttribute('data-ssg-col-key'))) });
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
  await page.locator('.ssg-filter-popover .ssg-filter-input').fill('item-00004'); // item-000040..49 の 10 行
  // Tab で「適用」へ移動して Enter
  await page.locator('.ssg-filter-popover .ssg-filter-btn-primary').focus();
  await page.keyboard.press('Enter');
  await waitIdle(page, 300);
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  const popStill = await page.locator('.ssg-filter-popover').count();
  check('V-02: Enter on focused 適用 button applies filter', /Rows: 10 \//.test(bottom) && popStill === 0, { bottom, popStill });
  await close();
}

// ---- SSRM の bottom bar 分母 "Rows: N / 0" ----
{
  const { page, close } = await open('ssrm');
  await waitIdle(page, 500);
  const top = await page.locator('.ssg-bar--top').textContent();
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  const dupKeyWarnings = (await errorsOf(page)).filter((e) => e.includes('same key'));
  check('B-04: no duplicate React key warnings in SSRM', dupKeyWarnings.length === 0, dupKeyWarnings.slice(0, 2));
  check('SSRM bars: denominator should not be 0', !/Rows: \d+ \/ 0(?!\d)/.test(bottom) && !/Rows: \d+ \/ 0(?!\d)/.test(top), { top, bottom });
  await close();
}

// ---- 選択の範囲外残留(rows 減少) ----
{
  const { page, close } = await open('basic', { query: 'n=10' });
  await page.evaluate(() => { window.__grid.selectRange({ start: { row: 2, col: 1 }, end: { row: 8, col: 3 } }); });
  await page.evaluate(() => window.__setRows(window.__rows().slice(0, 3)));
  await waitIdle(page, 200);
  const sel = await page.evaluate(() => ({ active: window.__grid.getActiveCell(), selection: window.__grid.getSelection(), selectedRows: window.__grid.getSelectedRows().length, csv: window.__grid.exportCsv({ scope: 'selection', includeHeaders: false }) }));
  pending('rows shrink: getSelection/getActiveCell stay in range', (!sel.active || sel.active.row < 3) && (sel.selection.type === 'none' || sel.selection.range.end.row < 3), sel);
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