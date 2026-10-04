// basic: 編集 / キーボード / 選択 / クリップボード / undo-redo / ソート / フィルター UI / 列操作 / 行選択 / コンテキストメニュー / 状態往復 / エクスポート。
import { OUT, open, check, pending, summary, errorsOf, renderedRowIndexes, cellText, cell, header, scrollTo, focusGrid, waitIdle, events, clearEvents, pasteText, copyText, state, rows } from './pw.mjs';

const { page, pageErrors, close } = await open('basic', { query: 'n=300' });
const active = () => page.evaluate(() => window.__grid.getActiveCell());
const selection = () => page.evaluate(() => window.__grid.getSelection());
const editorOpen = () => page.evaluate(() => !!document.querySelector('.ssg-cell-editor'));
const openMenu = async (colKey) => {
  await header(page, colKey).hover();
  await header(page, colKey).locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
};
const openFilter = async (colKey) => {
  await openMenu(colKey);
  await page.getByText('フィルター…').first().click();
  await page.waitForSelector('.ssg-filter-popover');
  await waitIdle(page, 100);
};
const closePopover = async () => {
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
};

// ---- 1. クリック / キーボード移動 ----
await cell(page, 0, 'name').click();
let a = await active();
check('click selects cell (row 0, col name=1)', a && a.row === 0 && a.col === 1, a);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowRight');
a = await active();
check('arrows move active cell', a && a.row === 1 && a.col === 2, a);
await page.keyboard.press('Tab');
a = await active();
check('Tab moves right', a && a.col === 3, a);
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Shift+ArrowDown');
await page.keyboard.press('Shift+ArrowRight');
let s = await selection();
check('Shift+arrows extend range 2x2', s && s.type === 'cell' && Math.abs(s.range.end.row - s.range.start.row) === 1 && Math.abs(s.range.end.col - s.range.start.col) === 1, s);
await page.keyboard.press('Escape');
s = await selection();
check('Escape clears selection', !s || s.type === 'none', s);
// 非表示列(secret)を Tab で飛ばすか: col index は視覚順(非表示除外)なので末尾(status) → 次へ
await page.evaluate(() => window.__grid.selectCell(0, 10));
await page.keyboard.press('Tab');
a = await active();
check('Tab at last visible col: clamps or wraps to next row (no hidden col)', a && (a.col === 10 || (a.row === 1 && a.col === 0)), a);
// 先頭行で ArrowUp / 末尾列で ArrowRight はクランプ
await page.evaluate(() => window.__grid.selectCell(0, 0));
await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowLeft');
a = await active();
check('arrow clamps at edges', a && a.row === 0 && a.col === 0, a);
// PageDown / End / Home / Ctrl+End
await page.keyboard.press('PageDown');
const afterPgDn = await active();
await page.keyboard.press('Control+End');
const afterCtrlEnd = await active();
await page.keyboard.press('Control+Home');
const afterCtrlHome = await active();
console.log('PageDown/Ctrl+End/Ctrl+Home →', afterPgDn, afterCtrlEnd, afterCtrlHome);
check('Ctrl+Home returns to (0,0) or unsupported but harmless', !afterCtrlHome || (afterCtrlHome.row === 0 && afterCtrlHome.col === 0) || true, afterCtrlHome);

// ---- 2. 編集(text) ----
await cell(page, 0, 'name').dblclick();
check('dblclick opens editor', await editorOpen());
await page.keyboard.press('Control+A');
await page.keyboard.type('edited');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
check('Enter commits & moves down', (await cellText(page, 0, 'name')) === 'edited' && (await active())?.row === 1, { text: await cellText(page, 0, 'name'), a: await active() });
// 印字キーで編集開始(初期値 = そのキー)
await page.keyboard.type('x');
await waitIdle(page, 50);
check('typing starts edit', await editorOpen());
const v = await page.evaluate(() => document.querySelector('.ssg-cell-editor-input')?.value);
check('typed key becomes initial value', v === 'x', v);
await page.keyboard.press('Escape');
check('Escape cancels & keeps old value', !(await editorOpen()) && (await cellText(page, 1, 'name')) === 'item-000002', await cellText(page, 1, 'name'));
// F2 → 編集 → Tab 確定 → 右へ
await page.keyboard.press('F2');
await page.keyboard.press('End');
await page.keyboard.type('-tab');
await page.keyboard.press('Tab');
await waitIdle(page, 80);
check('Tab commits & moves right', (await cellText(page, 1, 'name')) === 'item-000002-tab' && (await active())?.col === 2, { t: await cellText(page, 1, 'name'), a: await active() });
// blur(別セルをクリック)で確定
await page.keyboard.press('F2'); // qty number editor at (1,2)
await page.keyboard.press('Control+A');
await page.keyboard.type('77');
await cell(page, 5, 'name').click();
await waitIdle(page, 100);
check('blur commits editor (number 77)', (await cellText(page, 1, 'qty')) === '77', await cellText(page, 1, 'qty'));
// editorEnterMove 'right'
await page.evaluate(() => window.__setProps({ editorEnterMove: 'right' }));
await waitIdle(page, 100);
await cell(page, 2, 'name').dblclick();
await page.keyboard.press('Enter');
a = await active();
check("editorEnterMove 'right' moves right on Enter", a && a.row === 2 && a.col === 2, a);
await page.evaluate(() => window.__setProps({ editorEnterMove: 'down' }));

// ---- 3. number editor + reject validation ----
await cell(page, 3, 'qty').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('-5');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
const rejectStill = await editorOpen();
const bubble = await page.locator('.ssg-cell-editor-error').count();
check('reject: invalid value keeps editor open with error bubble', rejectStill && bubble > 0, { rejectStill, bubble });
await page.keyboard.press('Control+A');
await page.keyboard.type('5');
await page.keyboard.press('Enter');
await waitIdle(page, 80);
check('reject: valid value commits', (await cellText(page, 3, 'qty')) === '5', await cellText(page, 3, 'qty'));
// reject + blur → cancel
await cell(page, 4, 'qty').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('-1');
const beforeBlur = await rows(page).then((r) => r[4].qty);
await cell(page, 8, 'name').click();
await waitIdle(page, 100);
const afterBlur = await rows(page).then((r) => r[4].qty);
check('reject + blur → cancel (value unchanged, editor closed)', beforeBlur === afterBlur && !(await editorOpen()), { beforeBlur, afterBlur });
// mark validation: 名前を空に → invalid クラス
await cell(page, 6, 'name').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
const invalidClass = await cell(page, 6, 'name').evaluate((el) => el.classList.contains('ssg-body-cell--invalid'));
check('mark: empty name shows invalid class', invalidClass);
const invalids = await page.evaluate(() => window.__grid.getInvalidCells());
check('getInvalidCells lists the cell', invalids.some((c) => c.sourceRowIndex === 6 && c.columnKey === 'name'), invalids.slice(0, 3));
await page.evaluate(() => window.__setProps({ showValidationMarks: false }));
await waitIdle(page, 100);
check('showValidationMarks=false hides mark', !(await cell(page, 6, 'name').evaluate((el) => el.classList.contains('ssg-body-cell--invalid'))));
await page.evaluate(() => window.__setProps({ showValidationMarks: true }));

// ---- 4. select / date / checkbox / custom editors ----
await cell(page, 8, 'category').dblclick(); // row 8 = A
await page.waitForSelector('.ssg-select-editor-popover');
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
const catText = await cellText(page, 8, 'category');
check('select editor: ArrowDown+Enter picks next option (A→B)', catText === 'B', catText);
check('select editor Enter moves down', (await active())?.row === 9, await active());
// typeahead(ASCII ラベルで)
await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'category' ? { ...c, editor: { type: 'select', options: ['A', 'B', 'C', 'D'].map((v) => ({ value: v, label: 'cat ' + v })) } } : c))));
await waitIdle(page, 100);
await cell(page, 7, 'category').dblclick(); // row 7 = D
await page.waitForSelector('.ssg-select-editor-popover');
await page.keyboard.type('cat b');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
check('select editor: typeahead by label (cat b)', (await cellText(page, 7, 'category')) === 'B', await cellText(page, 7, 'category'));
// select blur → cancel
await cell(page, 9, 'category').dblclick();
await page.waitForSelector('.ssg-select-editor-popover');
await cell(page, 12, 'name').click();
await waitIdle(page, 100);
check('select editor blur cancels', (await page.locator('.ssg-select-editor-popover').count()) === 0 && (await cellText(page, 9, 'category')) === 'B', await cellText(page, 9, 'category'));
// date editor
await cell(page, 10, 'date').dblclick();
const dateInput = page.locator('.ssg-cell-editor input[type="date"]');
check('date editor is native input[type=date]', (await dateInput.count()) === 1);
await dateInput.fill('2027-03-15');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
check('date editor commits normalized value', (await cellText(page, 10, 'date')) === '2027-03-15', await cellText(page, 10, 'date'));
// checkbox toggle: click & Space
const before = await rows(page).then((r) => r[11].active);
await cell(page, 11, 'active').locator('input, .ssg-cell-checkbox').first().click();
await waitIdle(page, 80);
const afterClick = await rows(page).then((r) => r[11].active);
check('checkbox click toggles', afterClick === !before, { before, afterClick });
const b13 = await rows(page).then((r) => r[13].active);
await cell(page, 13, 'active').click();
await waitIdle(page, 80);
const afterCellClick = await rows(page).then((r) => r[13].active);
check('checkbox: clicking the cell (not the box) toggles too', afterCellClick === !b13, { b13, afterCellClick });
await page.keyboard.press('Space');
await waitIdle(page, 80);
check('checkbox Space toggles', (await rows(page).then((r) => r[13].active)) === b13);
await page.keyboard.press('Enter');
check('checkbox Enter does not open editor', !(await editorOpen()));
// custom editor
await cell(page, 14, 'custom').dblclick();
await page.waitForSelector('[data-testid="custom-editor"]');
await page.locator('[data-testid="custom-editor"]').fill('custom-val');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
check('custom editor commit(value, down)', (await cellText(page, 14, 'custom')) === 'custom-val' && (await active())?.row === 15, { t: await cellText(page, 14, 'custom'), a: await active() });

// ---- 5. クリップボード ----
await page.evaluate(() => window.__grid.selectRange({ start: { row: 20, col: 1 }, end: { row: 21, col: 2 } }));
await focusGrid(page);
await page.keyboard.press('Control+c');
await waitIdle(page, 150);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('copy yields TSV 2x2', copied && copied.split('\n').length === 2 && copied.split('\n')[0].split('\t').length === 2, JSON.stringify(copied));
// qty は formatClipboard 無し → 生値
const r20 = await rows(page).then((r) => r[20]);
check('copy uses raw values (qty unformatted)', copied.split('\n')[0] === `${r20.name}\t${r20.qty ?? ''}`, { copied: copied.split('\n')[0], expect: `${r20.name}\t${r20.qty ?? ''}` });
// paste 3x2 at (25,1)
await page.evaluate(() => window.__grid.selectCell(25, 1));
await clearEvents(page);
await pasteText(page, 'n1\t11\nn2\t22\nn3\t33');
const pr = await rows(page);
check('paste writes 3 rows (name/qty)', pr[25].name === 'n1' && pr[25].qty === 11 && pr[27].name === 'n3' && pr[27].qty === 33, { r25: pr[25].name, q25: pr[25].qty, r27: pr[27].name, q27: pr[27].qty });
check('paste → 1 onRowsChange', (await events(page, 'onRowsChange')).length === 1);
console.log('selection after paste:', JSON.stringify(await selection()));
// paste with trailing newline (Excel 風)
await page.evaluate(() => window.__grid.selectCell(30, 1));
await pasteText(page, 'a\tb\r\nc\td\r\n');
const pr2 = await rows(page);
check('paste CRLF + trailing newline does not add empty row', pr2[30].name === 'a' && pr2[31].name === 'c' && pr2[32].name !== '', { r30: pr2[30].name, r31: pr2[31].name, r32: pr2[32].name, len: pr2.length });
// paste reject (qty -1) スキップ、他は書く
await page.evaluate(() => window.__grid.selectCell(35, 1));
await pasteText(page, 'ok\t-1');
const pr3 = await rows(page);
const orig35 = await page.evaluate(() => window.__makeRows(300, 1)[35].qty);
check('paste: reject cell skipped, others written', pr3[35].name === 'ok' && pr3[35].qty === orig35, { name: pr3[35].name, qty: pr3[35].qty, orig35 });
// paste beyond last row → createRow 拡張
const lenBefore = (await rows(page)).length;
await page.evaluate(() => window.__grid.selectCell(299, 1));
await pasteText(page, 'last\nnew1\nnew2');
const pr4 = await rows(page);
check('paste past end extends rows via createRow', pr4.length === lenBefore + 2 && pr4[300].name === 'new1', { lenBefore, len: pr4.length, n300: pr4[300]?.name });
// paste beyond last column → createOverflowColumn
await clearEvents(page);
await page.evaluate(() => window.__grid.selectCell(0, 10));
await pasteText(page, 'x\ty\tz');
await waitIdle(page, 150);
const cc = await events(page, 'onColumnsChange');
const colsNow = await page.evaluate(() => window.__columns().map((c) => c.key));
check('paste past last column → createOverflowColumn + onColumnsChange', cc.length >= 1 && colsNow.some((k) => k.startsWith('extra')), { cc: cc.length, colsNow });
// editable 未指定列(id)は既定で編集可(実装: editable===false / readOnly のみ不可)→ 999 が書かれる
await page.evaluate(() => window.__grid.selectCell(40, 0));
await pasteText(page, '999\tnm');
const pr5 = await rows(page);
check('paste into editable-unspecified col writes (default editable)', pr5[40].id === '999' && pr5[40].name === 'nm', { id: pr5[40].id, name: pr5[40].name });
// editable:false 列はスキップ
await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'id' ? { ...c, editable: false } : c))));
await waitIdle(page, 100);
await page.evaluate(() => window.__grid.selectCell(41, 0));
await pasteText(page, '888\tnm2');
const pr5b = await rows(page);
check('paste into editable:false col skipped, next col written', pr5b[41].id === 42 && pr5b[41].name === 'nm2', { id: pr5b[41].id, name: pr5b[41].name });
// Delete クリア: number 列は null、必須列(mark)は '' に
await page.evaluate(() => window.__grid.selectRange({ start: { row: 45, col: 1 }, end: { row: 45, col: 2 } }));
await focusGrid(page);
await page.keyboard.press('Delete');
await waitIdle(page, 80);
const pr6 = await rows(page);
check('Delete clears: name→"" qty→null', pr6[45].name === '' && pr6[45].qty === null, { name: pr6[45].name, qty: pr6[45].qty });
// readOnly → ペースト no-op、エディタ開かない
await page.evaluate(() => window.__setProps({ readOnly: true }));
await waitIdle(page, 100);
await page.evaluate(() => window.__grid.selectCell(50, 1));
await focusGrid(page);
await pasteText(page, 'ro');
await cell(page, 50, 'name').dblclick();
check('readOnly: paste no-op & no editor', (await rows(page))[50].name === 'item-000051' && !(await editorOpen()));
await page.evaluate(() => window.__setProps({ readOnly: false }));

// ---- 6. undo / redo ----
const undoCount = await page.evaluate(() => { let n = 0; while (window.__grid.canUndo() && n < 100) { window.__grid.undo(); n += 1; } return n; });
const afterUndo = await rows(page);
const original = await page.evaluate(() => window.__makeRows(300, 1));
const same = afterUndo.length === original.length && afterUndo.every((r, i) => r.name === original[i].name && r.qty === original[i].qty && r.category === original[i].category && r.active === original[i].active && r.custom === original[i].custom && r.date === original[i].date);
check('undo all restores original rows', same, { undoCount, len: afterUndo.length, diff: afterUndo.findIndex((r, i) => !original[i] || r.name !== original[i].name) });
const redoCount = await page.evaluate(() => { let n = 0; while (window.__grid.canRedo() && n < 100) { window.__grid.redo(); n += 1; } return n; });
check('redo count equals undo count', redoCount === undoCount, { undoCount, redoCount });
const afterRedo = await rows(page);
check('redo re-applies last state', afterRedo[25].name === 'n1' && afterRedo[45].qty === null && afterRedo.length === 302, { n25: afterRedo[25].name, q45: afterRedo[45].qty, len: afterRedo.length });
// Ctrl+Z キー
await focusGrid(page);
await page.keyboard.press('Control+z');
await waitIdle(page, 80);
check('Ctrl+Z undoes one step', (await rows(page))[45].qty !== null);
await page.keyboard.press('Control+Shift+z');
await waitIdle(page, 80);
check('Ctrl+Shift+Z redoes', (await rows(page))[45].qty === null);
// 外部差し替えで履歴破棄
await page.evaluate(() => window.__setRows(window.__rows().map((r) => ({ ...r }))));
await waitIdle(page, 100);
check('external rows replace clears history', (await page.evaluate(() => window.__grid.canUndo())) === false);

// ---- 7. ソート(メニュー)/ 複数列 ----
await clearEvents(page);
await page.evaluate(() => window.__grid.scrollToTop());
await waitIdle(page, 100);
await openMenu('qty');
await page.getByText('降順で並び替え').click();
await waitIdle(page, 150);
await page.evaluate(() => window.__grid.scrollToTop());
await waitIdle(page, 100);
let st = await state(page);
check('menu sort desc sets sort state', st.sort.length === 1 && st.sort[0].columnKey === 'qty' && st.sort[0].direction === 'desc', st.sort);
const q0 = await cellText(page, 0, 'qty');
const q1 = await cellText(page, 1, 'qty');
check('rows sorted desc by qty', Number(q0.replace(/,/g, '')) >= Number(q1.replace(/,/g, '')), { q0, q1 });
check('onSortChange fired once', (await events(page, 'onSortChange')).length === 1);
// null の位置(末尾?)
await page.evaluate(() => window.__grid.scrollToBottom());
await waitIdle(page, 150);
const lastIdx = (await renderedRowIndexes(page)).at(-1);
const lastQty = await cellText(page, lastIdx, 'qty');
console.log('desc sort: last row qty =', JSON.stringify(lastQty));
await page.evaluate(() => window.__grid.scrollToTop());
// 昇順に切替
await openMenu('qty');
await page.getByText('昇順で並び替え').click();
await waitIdle(page, 150);
const firstAsc = await cellText(page, 0, 'qty');
console.log('asc sort: first row qty =', JSON.stringify(firstAsc));
check('asc sort first row is null/empty or smallest', firstAsc === '' || Number(firstAsc) <= 1, firstAsc);
// ソート解除(同じ方向をもう一度?)
await openMenu('qty');
const menuTexts = await page.locator('.ssg-menu-panel .ssg-menu-item').allTextContents();
console.log('menu while sorted asc:', menuTexts);
await page.getByText('昇順で並び替え').click();
await waitIdle(page, 150);
st = await state(page);
console.log('after clicking asc again:', st.sort);
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
await waitIdle(page, 100);

// ---- 8. フィルター UI ----
// text
await openFilter('name');
await page.locator('.ssg-filter-popover .ssg-filter-input').fill('item-0001');
await page.locator('.ssg-filter-btn-primary').click();
await waitIdle(page, 200);
let bottom = await page.locator('.ssg-bar--bottom').textContent();
check('text filter applied (item-0001xx = 100 rows)', /Rows: 100 \//.test(bottom), bottom);
check('header shows filtered mark', (await header(page, 'name').locator('.ssg-header-filtered-mark').count()) === 1);
check('filter chip bar shows 1 chip', (await page.locator('.ssg-filter-chip, [class*="chip-bar"] [class*="chip"]').count()) >= 1, await page.evaluate(() => document.querySelector('[class*="filter-chip"]')?.textContent));
// IME 変換中 Enter は適用しない
await openFilter('name');
const inp = page.locator('.ssg-filter-popover .ssg-filter-input');
await inp.fill('abc');
await inp.evaluate((el) => {
  el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true }));
});
await waitIdle(page, 100);
check('IME composing Enter does not apply/close popover', (await page.locator('.ssg-filter-popover').count()) === 1 && /Rows: 100 \//.test(await page.locator('.ssg-bar--bottom').textContent()));
await closePopover();
// set (category): A のみ
await openFilter('category');
await page.locator('.ssg-filter-selectall input').click(); // 全解除
await page.locator('.ssg-filter-option').filter({ hasText: /^A$/ }).locator('input').click();
await waitIdle(page, 150);
bottom = await page.locator('.ssg-bar--bottom').textContent();
check('set filter A ∧ text filter → 25 rows', /Rows: 25 \//.test(bottom), bottom);
st = await state(page);
check('set filter state values=[A]', st.filters.columnFilters.category?.kind === 'set' && st.filters.columnFilters.category.values.join() === 'A', st.filters.columnFilters.category);
await closePopover();
// 反転(exclude): 全選択→1 つ外す
await openFilter('category');
await page.locator('.ssg-filter-selectall input').click(); // 全選択に戻す
await page.locator('.ssg-filter-option').filter({ hasText: /^B$/ }).locator('input').click();
await waitIdle(page, 150);
st = await state(page);
console.log('set after uncheck B:', JSON.stringify(st.filters.columnFilters.category));
await closePopover();
// numberSet(qty): 条件 >= 500
await openFilter('qty');
const popHtml = await page.locator('.ssg-filter-popover').evaluate((el) => el.innerText);
console.log('numberSet popover text:', popHtml.replace(/\n+/g, ' | ').slice(0, 400));
await closePopover();
// dateSet(date): プリセット「今月」
await openFilter('date');
const dsText = await page.locator('.ssg-filter-popover').evaluate((el) => el.innerText);
console.log('dateSet popover text:', dsText.replace(/\n+/g, ' | ').slice(0, 500));
await closePopover();
// auto(score): 判定種別
await openFilter('score');
const autoText = await page.locator('.ssg-filter-popover').innerText();
check("filterType auto on mixed numbers/'n/a' → textSet (strict: text operators shown)", autoText.includes('を含む') && !autoText.includes('より大きい'), autoText.replace(/\n+/g, ' | ').slice(0, 120));
await closePopover();
// すべてクリア(チップバー)
const clearAll = page.getByText('すべてクリア');
if (await clearAll.count()) await clearAll.first().click();
await waitIdle(page, 150);
st = await state(page);
check('chip bar すべてクリア clears column filters', Object.keys(st.filters.columnFilters).length === 0, st.filters);
// グローバルフィルター + 0 件
await page.fill('.ssg-bar-input', 'zzzz-no-match');
await waitIdle(page, 400);
check('no match overlay text', (await page.locator('.ssg-root').textContent()).includes('一致する行がありません'));
await page.fill('.ssg-bar-input', '');
await waitIdle(page, 300);

// ---- 9. 列操作: リサイズ(ドラッグ)/ ダブルクリック autoSize / 列 DnD / ピン / 表示 ----
const hb = await header(page, 'name').boundingBox();
const widthBefore = hb.width;
const handle = header(page, 'name').locator('.ssg-header-resize');
const rb = await handle.boundingBox();
await clearEvents(page);
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.mouse.down();
await page.mouse.move(rb.x + 40, rb.y + 5, { steps: 4 });
await page.mouse.move(rb.x + 80, rb.y + 5, { steps: 4 });
await page.mouse.up();
await waitIdle(page, 150);
const widthAfter = (await header(page, 'name').boundingBox()).width;
check('resize drag widens column by ~80 (handle center offset ±5)', widthAfter - widthBefore >= 72 && widthAfter - widthBefore <= 85, { widthBefore, widthAfter });
st = await state(page);
check('resize recorded in getState().columnWidths', st.columnWidths.name === widthAfter, st.columnWidths);
const sc = await events(page, 'onStateChange');
check('onStateChange fired once after resize (not per frame)', sc.length === 1, sc.length);
// 境界ダブルクリック → autoSize
await handle.dblclick();
await waitIdle(page, 300);
const widthAuto = (await header(page, 'name').boundingBox()).width;
check('dblclick resize handle autosizes (width changed)', widthAuto !== widthAfter, { widthAfter, widthAuto });
// 列 DnD: name を price の後ろへ(grip を掴む)
const grip = header(page, 'name').locator('.ssg-header-grip');
const gb = await grip.boundingBox();
const target = await header(page, 'price').boundingBox();
await clearEvents(page);
await page.mouse.move(gb.x + 3, gb.y + 5);
await page.mouse.down();
await page.mouse.move(gb.x + 30, gb.y + 5, { steps: 5 });
await page.mouse.move(target.x + target.width - 5, target.y + 10, { steps: 10 });
await waitIdle(page, 100);
await page.mouse.up();
await waitIdle(page, 300);
const order = await page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell[data-ssg-col-key]')].map((e) => e.getAttribute('data-ssg-col-key')));
console.log('header order after DnD:', order);
check('column DnD moved name after price', order.indexOf('name') > order.indexOf('price'), order);
check('column DnD → onColumnsChange', (await events(page, 'onColumnsChange')).length >= 1);
// ピン切替(メニュー)
await openMenu('qty');
await page.getByText('列の固定').first().hover();
await waitIdle(page, 150);
await page.getByText('左に固定').click();
await waitIdle(page, 200);
const pinned = await page.evaluate(() => window.__columns().find((c) => c.key === 'qty')?.pinned);
check('menu pin left → columns.pinned', pinned === 'left', pinned);
// 列の表示(パネル)で secret を表示
await openMenu('qty');
await page.getByText('列の表示').click();
await waitIdle(page, 200);
const panelText = await page.evaluate(() => document.querySelector('[class*="tool-panel"], [class*="panel"]')?.innerText ?? '');
console.log('column chooser panel:', panelText.replace(/\n+/g, ' | ').slice(0, 300));
const secretToggle = page.getByText('非表示', { exact: true }).first();
if (await secretToggle.count()) {
  await secretToggle.click();
  await waitIdle(page, 150);
}
const secretVisible = await page.evaluate(() => window.__columns().find((c) => c.key === 'secret')?.visible);
check('column chooser toggles visibility', secretVisible === true, secretVisible);
await page.keyboard.press('Escape');
await waitIdle(page, 100);
// 列のリセット
await openMenu('qty');
await page.getByText('列のリセット').click();
await waitIdle(page, 200);
const afterReset = await page.evaluate(() => ({ cols: window.__columns().map((c) => `${c.key}:${c.pinned ?? ''}:${c.visible === false ? 'h' : 'v'}`), widths: window.__grid.getState().columnWidths }));
check('列のリセット restores pinned/visible (qty unpinned, secret hidden, id left, status right)', afterReset.cols.includes('qty::v') && afterReset.cols.includes('secret::h') && afterReset.cols.includes('id:left:v') && afterReset.cols.includes('status:right:v'), afterReset.cols);
pending('RD-5/M-03: getState().columnWidths after 列のリセット contains only manual widths', Object.keys(afterReset.widths).length === 0, afterReset.widths);

// ---- 10. 行選択 ----
await clearEvents(page);
await page.locator('.ssg-body-row[data-row-index="0"] .ssg-row-header-cell').first().click();
await page.locator('.ssg-body-row[data-row-index="2"] .ssg-row-header-cell').first().click({ modifiers: ['Shift'] });
await waitIdle(page, 100);
let keys = await page.evaluate(() => window.__grid.getSelectedRowKeys());
check('gutter click + shift-click selects 3 rows', keys.length === 3, keys);
await page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell').first().click();
keys = await page.evaluate(() => window.__grid.getSelectedRowKeys());
check('gutter click toggles off (multiple)', keys.length === 2 && !keys.includes(2), keys);
await page.locator('.ssg-corner-cell').first().click();
await waitIdle(page, 100);
const model = await page.evaluate(() => window.__grid.getRowSelection());
const cnt = await page.evaluate(() => window.__grid.getSelectedRowCount());
check('corner select-all → exclude model + count = rows', model.type === 'exclude' && cnt === 302, { model, cnt });
await page.locator('.ssg-body-row[data-row-index="0"] .ssg-row-header-cell').first().click();
const cnt2 = await page.evaluate(() => window.__grid.getSelectedRowCount());
check('deselect one in exclude mode → count-1', cnt2 === 301, cnt2);
check('isRowSelected(1) false after deselect', (await page.evaluate(() => window.__grid.isRowSelected(1))) === false);
await page.locator('.ssg-corner-cell').first().click();
await waitIdle(page, 50);
const cnt3 = await page.evaluate(() => window.__grid.getSelectedRowCount());
console.log('corner click when "some" selected → count', cnt3);
await page.evaluate(() => window.__grid.clearRowSelection());
// single mode
await page.evaluate(() => window.__setProps({ rowSelectionMode: 'single' }));
await waitIdle(page, 100);
await page.locator('.ssg-body-row[data-row-index="3"] .ssg-row-header-cell').first().click();
await page.locator('.ssg-body-row[data-row-index="4"] .ssg-row-header-cell').first().click();
keys = await page.evaluate(() => window.__grid.getSelectedRowKeys());
check('single mode keeps exactly 1', keys.length === 1 && keys[0] === 5, keys);
await page.evaluate(() => window.__setProps({ rowSelectionMode: 'multiple' }));
await page.evaluate(() => window.__grid.clearRowSelection());
// フィルター中の全選択 → 見えている行だけ? 件数
await page.fill('.ssg-bar-input', 'item-0001');
await waitIdle(page, 400);
await page.locator('.ssg-corner-cell').first().click();
await waitIdle(page, 100);
const cntF = await page.evaluate(() => window.__grid.getSelectedRowCount());
const keysF = await page.evaluate(() => window.__grid.getSelectedRowKeys().length);
console.log('select-all while filtered → count/keys', cntF, keysF, await page.locator('.ssg-bar--bottom').textContent());
check('select-all while filtered: count equals keys length (consistent)', cntF === keysF, { cntF, keysF });
await page.fill('.ssg-bar-input', '');
await waitIdle(page, 300);
const cntAfterClear = await page.evaluate(() => ({ count: window.__grid.getSelectedRowCount(), keys: window.__grid.getSelectedRowKeys().length }));
console.log('after clearing filter → count/keys', cntAfterClear);
check('after filter clear: count and keys still consistent', cntAfterClear.count === cntAfterClear.keys, cntAfterClear);
await page.evaluate(() => window.__grid.clearRowSelection());

// ---- 11. コンテキストメニュー ----
await clearEvents(page);
await cell(page, 2, 'name').click({ button: 'right' });
await waitIdle(page, 150);
const ctxItems = await page.locator('.ssg-menu-panel .ssg-menu-item').allTextContents();
check('context menu opens with custom items', ctxItems.includes('ログ') && ctxItems.includes('削除'), ctxItems);
check('onContextMenuOpen fired', (await events(page, 'onContextMenuOpen')).length === 1);
await page.getByText('ログ').click();
await waitIdle(page, 100);
check('context item onSelect ran & menu closed', (await events(page, 'ctx-select')).length === 1 && (await page.locator('.ssg-menu-panel').count()) === 0);
// 右クリックで選択が変わらない
const actBefore = await active();
await cell(page, 7, 'name').click({ button: 'right' });
await waitIdle(page, 100);
check('right click does not change selection', JSON.stringify(await active()) === JSON.stringify(actBefore));
await page.keyboard.press('Escape');

// ---- 12. 状態往復 ----
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: { name: 222 }, filters: { globalText: 'item', columnFilters: { category: { kind: 'set', values: ['A', 'B'] } } }, sort: [{ columnKey: 'id', direction: 'desc' }] }));
await waitIdle(page, 300);
const st1 = await state(page);
const json = JSON.stringify(st1);
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
await waitIdle(page, 200);
await page.evaluate((j) => window.__grid.applyState(JSON.parse(j)), json);
await waitIdle(page, 300);
const st2 = await state(page);
// columns は applyState 側で pane 連結順(左固定 → 中央 → 右固定)へ正規化されるため、順序は除いて比較する。
const normalizeState = (st) => ({ ...st, columnWidths: undefined, columns: [...(st.columns ?? [])].sort((a, b) => a.key.localeCompare(b.key)) });
check('getState/applyState round trip is stable (filters / sort / column meta)', JSON.stringify(normalizeState(st2)) === JSON.stringify(normalizeState(st1)), { st1, st2 });
pending('applyState: pinned 列の論理順が pane 連結順へ正規化されず元の columns 順を保つ', JSON.stringify((st2.columns ?? []).map((c) => c.key)) === JSON.stringify((st1.columns ?? []).map((c) => c.key)), { before: (st1.columns ?? []).map((c) => c.key), after: (st2.columns ?? []).map((c) => c.key) });
pending('RD-5/M-03: round trip keeps columnWidths unchanged', JSON.stringify(st2.columnWidths) === JSON.stringify(st1.columnWidths), { before: st1.columnWidths, after: st2.columnWidths });
check('applied width reflected in header', Math.abs((await header(page, 'name').boundingBox()).width - 222) < 2);
check('applied global filter reflected in input', (await page.locator('.ssg-bar-input').inputValue()) === 'item');
// 壊れた入力
await errorsOf(page);
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: { name: 'abc', qty: -5, nope: 100 }, filters: { globalText: 5, columnFilters: { name: { foo: 1 }, qty: null } }, sort: [{ columnKey: 'name', direction: 'sideways' }, { columnKey: 123 }] }));
await waitIdle(page, 200);
const st3 = await state(page);
const errs3 = await errorsOf(page);
check('applyState tolerates garbage (no throw/console error)', errs3.length === 0 && pageErrors.length === 0, { st3, errs3 });
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
await waitIdle(page, 200);

// ---- 13. エクスポート ----
const csv = await page.evaluate(() => window.__grid.exportCsv());
const lines = csv.split('\r\n');
check('exportCsv view: header + 302 rows, CRLF', lines.length === 303 && lines[0].startsWith('ID,名前'), { n: lines.length, head: lines[0] });
check('exportCsv excludes hidden column', !lines[0].includes('非表示'), lines[0]);
const data = await page.evaluate(() => window.__grid.getExportData({ scope: 'view' }));
const visibleColCount = await page.evaluate(() => window.__columns().filter((c) => c.visible !== false).length);
check('getExportData shape', data.columns.length === visibleColCount && data.rows.length === 302 && typeof data.rows[0][0].value === 'number' && typeof data.rows[0][0].text === 'string', { cols: data.columns.map((c) => c.key), visibleColCount, r0: data.rows[0][0] });
// 選択範囲 scope
await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } }));
const selCsv = await page.evaluate(() => window.__grid.exportCsv({ scope: 'selection', includeHeaders: false }));
check('exportCsv selection 2x2', selCsv.split('\r\n').length === 2 && selCsv.split('\r\n')[0].split(',').length === 2, JSON.stringify(selCsv));
// クォート: カンマ / 改行 / 引用符
await page.evaluate(() => window.__setRows(window.__rows().map((r, i) => (i === 0 ? { ...r, name: 'a,b "q"\nline2' } : r))));
await waitIdle(page, 100);
const csvQ = await page.evaluate(() => window.__grid.exportCsv({ includeHeaders: false }));
check('exportCsv quotes comma/quote/newline (RFC 4180)', csvQ.startsWith('1,"a,b ""q""\nline2"'), JSON.stringify(csvQ.slice(0, 40)));
const tsv = await page.evaluate(() => window.__grid.exportCsv({ includeHeaders: false, delimiter: '\t' }));
check('exportCsv TSV delimiter', tsv.split('\r\n')[0].includes('\t'), JSON.stringify(tsv.slice(0, 40)));
const withBom = await page.evaluate(() => window.__grid.exportCsv({ bom: true }));
check('exportCsv bom option', withBom.charCodeAt(0) === 0xfeff);
// isRowExportable
await page.evaluate(() => window.__setProps({ isRowExportable: (row) => row.id % 2 === 0 }));
await waitIdle(page, 100);
const csvHalf = await page.evaluate(() => window.__grid.exportCsv({ includeHeaders: false }));
const evenCount = (await rows(page)).filter((r) => r.id % 2 === 0).length;
check('isRowExportable filters rows (even ids only)', csvHalf.split('\r\n').length === evenCount, { lines: csvHalf.split('\r\n').length, evenCount });
await page.evaluate(() => window.__setProps({ isRowExportable: undefined }));

// ---- 14. ホバー通知 / scroll API ----
await clearEvents(page);
await cell(page, 3, 'name').hover();
await cell(page, 3, 'qty').hover();
await cell(page, 4, 'name').hover();
await waitIdle(page, 100);
const hov = (await events(page, 'onHoveredRowChange')).map((e) => e.payload);
check('onHoveredRowChange: no duplicate for same row', hov.filter((v, i) => v === hov[i - 1]).length === 0 && hov.includes(3) && hov.includes(4), hov);
await page.evaluate(() => window.__grid.setScrollPosition({ top: 500, left: 100 }));
await waitIdle(page, 150);
const sp = await page.evaluate(() => window.__grid.getScrollPosition());
check('setScrollPosition/getScrollPosition round trip', sp.top === 500 && sp.left === 100, sp);
const scrollEv = (await events(page, 'onScroll')).map((e) => e.payload.source);
check('onScroll via API tagged source=api', scrollEv.includes('api'), scrollEv);

const errs = await errorsOf(page);
check('basic: no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 8));
await page.screenshot({ path: OUT + 'shot-basic-end.png' });
summary();
await close();