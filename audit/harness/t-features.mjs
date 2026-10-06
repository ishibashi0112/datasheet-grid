// 機能別: グルーピング / 展開行 / ラベル行 / 行ドラッグ / auto-height。
import { OUT, open, check, unexpectedPageErrors, summary, errorsOf, renderedRowIndexes, cellText, cell, header, scrollTo, focusGrid, waitIdle, events, clearEvents, pasteText, rows, state } from './pw.mjs';

// ---------- グルーピング ----------
{
  const { page, pageErrors, close } = await open('grouping', { query: 'n=200' });
  const groups = await page.evaluate(() => window.__grid.getGroupRows());
  check('grouping: getGroupRows returns 2-level groups (4 cats × 3 statuses = 16)', groups.length === 16, { n: groups.length, first: groups[0] });
  const rowCount = await page.evaluate(() => document.querySelectorAll('.ssg-body-row[data-pane="center"][data-ssg-group-row]').length);
  check('grouping: group rows rendered', rowCount > 0, rowCount);
  const groupText = await page.evaluate(() => document.querySelector('.ssg-body-row[data-pane="center"][data-ssg-group-row]')?.textContent);
  console.log('first group row text:', groupText);
  // 集計(qty sum)がグループ行に出る
  const aggText = await page.evaluate(() => {
    const gr = document.querySelector('.ssg-body-row[data-pane="center"][data-ssg-group-row]');
    return gr ? [...gr.querySelectorAll('.ssg-body-cell')].map((c) => c.getAttribute('data-ssg-col-key') + '=' + c.textContent.trim()) : null;
  });
  console.log('group row cells:', aggText);
  const qtySum = await page.evaluate(() => {
    const rows = window.__rows().filter((r) => r.category === 'A');
    return rows.reduce((s, r) => s + (r.qty ?? 0), 0);
  });
  check('grouping: category A qty sum shown', aggText && aggText.some((t) => t.startsWith('qty=') && t.replace(/,/g, '').includes(String(qtySum))), { aggText, qtySum });
  // 折りたたみ(API)
  const key0 = groups[0].groupKey;
  const before = (await renderedRowIndexes(page)).length;
  await page.evaluate(() => window.__grid.collapseAllGroups());
  await waitIdle(page, 150);
  const collapsedCount = await page.evaluate(() => document.querySelectorAll('.ssg-center-pane .ssg-body-row').length);
  check('grouping: collapseAll leaves only top-level groups (4)', collapsedCount === 4, collapsedCount);
  await page.evaluate((k) => window.__grid.setGroupCollapsed(k, false), key0);
  await waitIdle(page, 150);
  const afterOne = await page.evaluate(() => document.querySelectorAll('.ssg-center-pane .ssg-body-row').length);
  check('grouping: expand one top group shows its 3 children (7 rows)', afterOne === 7, afterOne);
  // クリック開閉
  await page.locator('.ssg-body-row[data-pane="center"][data-ssg-group-row]').nth(1).locator('.ssg-group-toggle').first().click();
  await waitIdle(page, 150);
  const afterClick = await page.evaluate(() => document.querySelectorAll('.ssg-center-pane .ssg-body-row').length);
  check('grouping: toggle click expands leaf rows', afterClick > 7, afterClick);
  // leaf 行で編集可、グループ行で編集不可
  const leafIdx = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].find((r) => !r.hasAttribute('data-ssg-group-row'))?.getAttribute('data-row-index'));
  await cell(page, Number(leafIdx), 'name').dblclick();
  check('grouping: leaf editable', (await page.locator('.ssg-cell-editor').count()) === 1);
  await page.keyboard.press('Escape');
  await page.locator('.ssg-body-row[data-pane="center"][data-ssg-group-row]').first().locator('.ssg-body-cell').nth(1).dblclick();
  check('grouping: group row not editable', (await page.locator('.ssg-cell-editor').count()) === 0);
  // Ctrl+A → コピーはグループ行を除く
  await cell(page, Number(leafIdx), 'name').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await waitIdle(page, 150);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  console.log('grouping copy lines:', copied.split('\n').length, 'first:', JSON.stringify(copied.split('\n')[0]).slice(0, 80));
  // エクスポート
  const csv = await page.evaluate(() => window.__grid.exportCsv());
  check('grouping: exportCsv excludes group rows & group col (200 data rows)', csv.split('\r\n').length === 201, csv.split('\r\n').length);
  // 折りたたみ中も全 leaf 行を出力する(audit H-1)
  await page.evaluate(() => window.__grid.collapseAllGroups());
  await waitIdle(page, 150);
  const csvCollapsed = await page.evaluate(() => window.__grid.exportCsv());
  check('grouping: exportCsv while all collapsed still has 200 data rows', csvCollapsed.split('\r\n').length === 201, csvCollapsed.split('\r\n').length);
  console.log('grouping csv header:', csv.split('\r\n')[0]);
  // ソート + グルーピング
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'qty', direction: 'desc' }] }));
  await waitIdle(page, 200);
  await page.evaluate(() => window.__grid.expandAllGroups());
  await waitIdle(page, 200);
  const leafQty = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].filter((r) => !r.hasAttribute('data-ssg-group-row')).slice(0, 3).map((r) => r.querySelector('.ssg-body-cell[data-ssg-col-key="qty"]')?.textContent.trim()));
  check('grouping: leaf rows sorted within group', leafQty.length === 3 && Number(leafQty[0].replace(/,/g, '') || -1) >= Number(leafQty[1].replace(/,/g, '') || -1), leafQty);
  // フィルターでグループが空になる
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: 'item-00000', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 300);
  const groupsAfterFilter = await page.evaluate(() => window.__grid.getGroupRows().length);
  console.log('groups after filter (9 rows):', groupsAfterFilter);
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  check('grouping: bottom bar counts leaf rows only', /Rows: 9 \/ 200/.test(bottom), bottom);
  // labelRow と rowGroup 併用 → 警告
  await errorsOf(page);
  await page.evaluate(() => window.__setProps({ labelRow: { isLabelRow: (r) => r.isLabel === true, getLabel: (r) => r.label ?? '' } }));
  await waitIdle(page, 200);
  const warn = await errorsOf(page);
  check('grouping + labelRow → dev warning', warn.some((w) => w.includes('warn')), warn.slice(0, 2));
  await page.evaluate(() => window.__setProps({ labelRow: undefined }));
  // enableRowDrag + grouping → ハンドル列なし
  await page.evaluate(() => window.__setProps({ enableRowDrag: true }));
  await waitIdle(page, 200);
  check('grouping + enableRowDrag → no drag handle column', (await page.locator('.ssg-row-drag-handle').count()) === 0);
  const errs = await errorsOf(page);
  // rowGroup + labelRow の警告は上で意図して出させたもの。
  const unexpectedGrouping = unexpectedPageErrors(pageErrors, ['行グルーピング(rowGroup)とラベル行(labelRow)は併用できません']);
  check('grouping: no console errors', errs.filter((e) => e.startsWith('[error]')).length === 0 && unexpectedGrouping.length === 0, [...errs, ...unexpectedGrouping].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-grouping.png' });
  await close();
}

// ---------- 展開行(Master/Detail) ----------
{
  const { page, pageErrors, close } = await open('detail', { query: 'n=200' });
  const toggles = await page.locator('.ssg-detail-toggle').count();
  check('detail: toggle column rendered', toggles > 0, toggles);
  await clearEvents(page);
  await page.locator('.ssg-body-row[data-row-index="1"] .ssg-detail-toggle').first().click();
  await waitIdle(page, 200);
  const card = await page.locator('[data-testid="detail-card"]').count();
  check('detail: toggle click opens card', card === 1, card);
  check('detail: onExpandedDetailRowKeysChange fired with key 2', JSON.stringify((await events(page, 'onExpandedDetailRowKeysChange')).at(-1)?.payload) === '[2]', (await events(page, 'onExpandedDetailRowKeysChange')).map((e) => e.payload));
  // 帯の分だけ次の行が下にずれる
  const y1 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="1"]').first().boundingBox();
  const y2 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="2"]').first().boundingBox();
  check('detail: row 2 pushed down by ~120px', Math.abs(y2.y - (y1.y + y1.height + 120)) < 2, { y1, y2 });
  // カード内のキー / クリックは本体へ伝播しない(activeCell はトグルのクリックで付くため、キー前後で不変かを見る)
  const activeBeforeKeys = await page.evaluate(() => window.__grid.getActiveCell());
  const row1NameBefore = (await rows(page))[1].name;
  await page.locator('[data-testid="detail-input"]').fill('typing');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Delete');
  const inputVal = await page.locator('[data-testid="detail-input"]').inputValue();
  const activeAfterKeys = await page.evaluate(() => window.__grid.getActiveCell());
  const row1NameAfter = (await rows(page))[1].name;
  check(
    'detail: keyboard inside card does not leak to grid',
    inputVal === 'typing' && JSON.stringify(activeAfterKeys) === JSON.stringify(activeBeforeKeys) && row1NameAfter === row1NameBefore && (await page.locator('.ssg-cell-editor').count()) === 0,
    { inputVal, activeBeforeKeys, activeAfterKeys, row1NameBefore, row1NameAfter },
  );
  await page.locator('[data-testid="detail-card"] button').click();
  check('detail: button click inside card works', (await events(page, 'detail-button')).length === 1);
  // 右クリックはカード内では標準メニュー(onContextMenuOpen なし)
  await page.locator('[data-testid="detail-card"]').click({ button: 'right' });
  await waitIdle(page, 100);
  check('detail: context menu not opened from card', (await events(page, 'onContextMenuOpen')).length === 0 && (await page.locator('.ssg-menu-panel').count()) === 0);
  await page.keyboard.press('Escape');
  // 横スクロールしてもカードは左に残る(sticky)
  await scrollTo(page, undefined, 300);
  await waitIdle(page, 150);
  const cardBox = await page.locator('[data-testid="detail-card"]').boundingBox();
  const paneBox = await page.locator('.ssg-scroll-container').boundingBox();
  check('detail: card stays visible after horizontal scroll', cardBox && cardBox.x >= paneBox.x - 1 && cardBox.x < paneBox.x + 200, { cardX: cardBox?.x, paneX: paneBox.x });
  await scrollTo(page, undefined, 0);
  // isExpandable false の行(id 50 → index 49)
  await page.evaluate(() => window.__grid.scrollToRow(49, { align: 'start' }));
  await waitIdle(page, 150);
  const toggle49 = await page.locator('.ssg-body-row[data-row-index="49"] .ssg-detail-toggle').count();
  check('detail: isExpandable=false row has no toggle', toggle49 === 0, toggle49);
  await page.evaluate(() => window.__grid.setDetailRowExpanded(50, true));
  await waitIdle(page, 100);
  check('detail: API on non-expandable row is no-op', !(await page.evaluate(() => window.__grid.getExpandedDetailRowKeys())).includes(50));
  // API: 複数開く → 高さ合計 / scrollToRow の精度(id 100 は isExpandable = id % 50 !== 0 で展開不可なので 101 を使う)
  await page.evaluate(() => { for (const k of [10, 11, 12, 101]) window.__grid.setDetailRowExpanded(k, true); });
  await waitIdle(page, 200);
  const keys = await page.evaluate(() => window.__grid.getExpandedDetailRowKeys());
  check('detail: expanded keys', keys.sort((a, b) => a - b).join() === '2,10,11,12,101', keys);
  await page.evaluate(() => window.__grid.scrollToRow(150, { align: 'start' }));
  await waitIdle(page, 200);
  const r150 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="150"]').first().boundingBox();
  const sc = await page.locator('.ssg-scroll-container').boundingBox();
  const headerH = 40;
  check('detail: scrollToRow accurate with expanded bands above', r150 && Math.abs(r150.y - (sc.y + headerH)) < 2, { r150y: r150?.y, expected: sc.y + headerH });
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 200);
  check('detail: scrollToBottom reaches last row', (await renderedRowIndexes(page)).at(-1) === 199, (await renderedRowIndexes(page)).at(-1));
  // ソートしても rowKey ベースで展開が追従
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'id', direction: 'desc' }] }));
  await waitIdle(page, 200);
  await page.evaluate(() => window.__grid.scrollToRow(199, { align: 'end' }));
  await waitIdle(page, 200);
  const cardsAfterSort = await page.evaluate(() => [...document.querySelectorAll('[data-testid="detail-card"] strong')].map((e) => e.textContent));
  check('detail: cards follow rows after sort (id 2 at bottom)', cardsAfterSort.includes('詳細 2'), cardsAfterSort);
  // フィルターで除外 → キー保持
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: 'item-000003', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 300);
  check('detail: keys kept while filtered out', (await page.evaluate(() => window.__grid.getExpandedDetailRowKeys())).length === 5);
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 200);
  await page.evaluate(() => window.__grid.collapseAllDetailRows());
  await waitIdle(page, 100);
  check('detail: collapseAll', (await page.evaluate(() => window.__grid.getExpandedDetailRowKeys())).length === 0);
  // 展開中に ↓ キーで行移動 → 帯をまたぐ(アクティブは次の行)
  await page.evaluate(() => window.__grid.setDetailRowExpanded(1, true));
  await cell(page, 0, 'name').click();
  await page.keyboard.press('ArrowDown');
  const ac = await page.evaluate(() => window.__grid.getActiveCell());
  check('detail: ArrowDown skips band to next row', ac && ac.row === 1, ac);
  // Enter 確定後の移動も同様 / 貼り付け
  await page.keyboard.press('ArrowUp');
  await pasteText(page, 'p0\np1\np2');
  const pr = await rows(page);
  check('detail: paste across expanded band writes consecutive rows', pr[0].name === 'p0' && pr[1].name === 'p1' && pr[2].name === 'p2', [pr[0].name, pr[1].name, pr[2].name]);
  const errs = await errorsOf(page);
  check('detail: no console errors', errs.filter((e) => e.startsWith('[error]')).length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-detail.png' });
  await close();
}

// ---------- ラベル行 ----------
{
  const { page, pageErrors, close } = await open('label', { query: 'n=200' });
  // ラベル行を 20 行ごとに差し込む
  await page.evaluate(() => {
    const src = window.__rows();
    const out = [];
    for (let i = 0; i < src.length; i += 1) {
      if (i % 20 === 0) out.push({ ...src[i], id: 100000 + i, isLabel: true, label: `セクション ${i / 20 + 1}`, name: 'LABEL', qty: 999999 });
      out.push(src[i]);
    }
    window.__setRows(out);
  });
  await waitIdle(page, 200);
  const labelCount = await page.evaluate(() => document.querySelectorAll('.ssg-center-pane [class*="label-row"]').length);
  check('label: label rows rendered', labelCount > 0, labelCount);
  const bottom = await page.locator('.ssg-bar--bottom').textContent();
  check('label: counts exclude labels (200 / 200)', /Rows: 200 \/ 200/.test(bottom), bottom);
  // 行番号はデータ行の通し番号
  const rowNo = await page.evaluate(() => document.querySelector('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell')?.textContent?.trim());
  console.log('row header text of view index 1 (first data row):', rowNo);
  // ↑↓ でラベルを読み飛ばす
  await cell(page, 1, 'name').click();
  await page.keyboard.press('ArrowUp');
  let ac = await page.evaluate(() => window.__grid.getActiveCell());
  check('label: ArrowUp at first data row stays (label above skipped)', ac && ac.row === 1, ac);
  await page.evaluate(() => window.__grid.selectCell(20, 1)); // view 20 = last data row of section 1? (label at 0, data 1..20, label 21)
  await page.keyboard.press('ArrowDown');
  ac = await page.evaluate(() => window.__grid.getActiveCell());
  check('label: ArrowDown skips label row (20 → 22)', ac && ac.row === 22, ac);
  // 貼り付けはラベルを飛ばす
  await page.evaluate(() => window.__grid.selectCell(19, 1));
  await pasteText(page, 'a\nb\nc');
  const pr = await rows(page);
  const names = pr.filter((r) => !r.isLabel).slice(18, 21).map((r) => r.name);
  check('label: paste skips label rows', names.join() === 'a,b,c' && pr.filter((r) => r.isLabel).every((r) => r.name === 'LABEL'), { names, labelNames: [...new Set(pr.filter((r) => r.isLabel).map((r) => r.name))] });
  // ソートはセクション内に閉じる
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'qty', direction: 'desc' }] }));
  await waitIdle(page, 200);
  const sec1 = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row:not([data-ssg-sticky-label])')].slice(0, 4).map((r) => ({ i: r.getAttribute('data-row-index'), cls: r.className, qty: r.querySelector('[data-ssg-col-key="qty"]')?.textContent.trim(), txt: r.textContent.trim().slice(0, 30) })));
  console.log('label: first rows after sort:', sec1);
  check('label: label row stays first after sort', sec1[0].i === '0' && (sec1[0].cls.includes('label') || sec1[0].txt.includes('セクション')), sec1[0]);
  // sticky ラベル: スクロールしたらヘッダー直下に現在セクション
  await page.evaluate(() => window.__grid.scrollToRow(50, { align: 'start' }));
  await waitIdle(page, 200);
  const sticky = await page.evaluate(() => { const el = document.querySelector('.ssg-center-pane .ssg-sticky-label-layer'); return el ? { cls: el.className, txt: el.textContent.trim().slice(0, 40), rect: el.getBoundingClientRect().top } : null; });
  console.log('sticky:', sticky);
  check('label: sticky label shows section 3 (rows 42..)', sticky && sticky.txt.includes('セクション 3'), sticky);
  // エクスポート includeLabelRows
  const data = await page.evaluate(() => window.__grid.getExportData({ includeLabelRows: true }));
  check('label: getExportData includeLabelRows has rowKinds', data.rowKinds && data.rowKinds.filter((k) => k === 'label').length === 10 && data.rows.length === 210, { kinds: data.rowKinds?.length, labels: data.rowKinds?.filter((k) => k === 'label').length });
  const csvNoLabel = await page.evaluate(() => window.__grid.exportCsv());
  check('label: exportCsv default excludes labels (201 lines)', csvNoLabel.split('\r\n').length === 201, csvNoLabel.split('\r\n').length);
  // フィルターでセクションが空 → ラベル消える(keepEmptySections false)
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: 'item-00000', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 300);
  const kinds = await page.evaluate(() => window.__grid.getExportData({ includeLabelRows: true }).rowKinds);
  check('label: empty sections hidden under filter (1 label + 9 data)', kinds.filter((k) => k === 'label').length === 1 && kinds.length === 10, { labels: kinds.filter((k) => k === 'label').length, total: kinds.length });
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 200);
  // ラベル行は選択 / 編集不可
  await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="0"]').first().dblclick();
  check('label: label row not editable', (await page.locator('.ssg-cell-editor').count()) === 0);
  // Ctrl+A → コピーにラベル無し
  await cell(page, 1, 'name').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await waitIdle(page, 150);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('label: copy excludes label rows (200 lines)', copied.split('\n').length === 200 && !copied.includes('LABEL'), copied.split('\n').length);
  // 行ドラッグとの併用(ラベル行は掴めない)
  await page.evaluate(() => window.__setProps({ enableRowDrag: true }));
  await waitIdle(page, 200);
  const handleOnLabel = await page.locator('.ssg-body-row[data-row-index="0"] .ssg-row-drag-handle').count();
  const handleOnData = await page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-drag-handle').count();
  console.log('label + rowDrag: handle on label / data =', handleOnLabel, handleOnData);
  const errs = await errorsOf(page);
  check('label: no console errors', errs.filter((e) => e.startsWith('[error]')).length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-label.png' });
  await close();
}

// ---------- 行ドラッグ ----------
{
  const { page, pageErrors, close } = await open('rowdrag', { query: 'n=100' });
  const handles = await page.locator('.ssg-row-drag-handle').count();
  check('rowdrag: handles rendered', handles > 0, handles);
  check('rowdrag: isRowDraggable=false row (id 10 → index 9) has no handle', (await page.locator('.ssg-body-row[data-row-index="9"] .ssg-row-drag-handle').count()) === 0);
  // 行 0 を行 3 の下へドラッグ
  await clearEvents(page);
  const h0 = page.locator('.ssg-body-row[data-row-index="0"] .ssg-row-drag-handle').first();
  const hb = await h0.boundingBox();
  const r3 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="3"]').first().boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 20, { steps: 3 });
  await page.mouse.move(hb.x + hb.width / 2, r3.y + r3.height - 4, { steps: 8 });
  await waitIdle(page, 100);
  const indicator = await page.evaluate(() => [...document.querySelectorAll('.ssg-row-drop-indicator')].filter((e) => getComputedStyle(e).display !== 'none').length);
  check('rowdrag: drop indicator shown while dragging', indicator > 0, indicator);
  await page.mouse.up();
  await waitIdle(page, 400);
  const pr = await rows(page);
  check('rowdrag: row moved 0 → 3', pr[3].id === 1 && pr[0].id === 2, pr.slice(0, 5).map((r) => r.id));
  const mv = await events(page, 'onRowMove');
  check('rowdrag: onRowMove(rowKey 1, 0 → 3) after onRowsChange', mv.length === 1 && mv[0].payload.rowKey === 1 && mv[0].payload.from === 0 && mv[0].payload.to === 3 && (await events(page, 'onRowsChange')).length === 1, mv.map((e) => e.payload));
  // undo で戻る
  await focusGrid(page);
  await page.keyboard.press('Control+z');
  await waitIdle(page, 100);
  check('rowdrag: undo restores order', (await rows(page))[0].id === 1);
  // Escape でキャンセル
  await clearEvents(page);
  const h1 = page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-drag-handle').first();
  const hb1 = await h1.boundingBox();
  await page.mouse.move(hb1.x + 5, hb1.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb1.x + 5, hb1.y + 120, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitIdle(page, 200);
  // ガイド線の要素は常に DOM にあり、display で表示を切り替える
  const indicatorShown = await page.evaluate(() => [...document.querySelectorAll('.ssg-row-drop-indicator')].some((e) => getComputedStyle(e).display !== 'none'));
  check('rowdrag: Escape cancels (no onRowsChange)', (await events(page, 'onRowsChange')).length === 0 && !indicatorShown, { indicatorShown });
  // moveRow API
  await page.evaluate(() => window.__grid.moveRow(5, 0));
  await waitIdle(page, 100);
  check('rowdrag: moveRow(5, 0)', (await rows(page))[0].id === 5);
  await page.evaluate(() => window.__grid.moveRow(99999, 0));
  await page.evaluate(() => window.__grid.moveRow(5, 500));
  check('rowdrag: moveRow unknown key / OOB → no-op', (await rows(page))[0].id === 5);
  // ソート中は無効(淡色)
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'id', direction: 'desc' }] }));
  await waitIdle(page, 200);
  const disabled = await page.locator('.ssg-row-drag-handle--disabled').count();
  check('rowdrag: handles disabled while sorted', disabled > 0, disabled);
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 200);
  // 画面外へドラッグ(autoscroll)→ 末尾へ
  await clearEvents(page);
  const h2 = page.locator('.ssg-body-row[data-row-index="2"] .ssg-row-drag-handle').first();
  const hb2 = await h2.boundingBox();
  const sc = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(hb2.x + 5, hb2.y + 5);
  await page.mouse.down();
  await page.mouse.move(hb2.x + 5, sc.y + sc.height - 5, { steps: 10 });
  await page.waitForTimeout(1500);
  await page.mouse.move(hb2.x + 5, sc.y + sc.height - 30, { steps: 2 });
  await page.mouse.up();
  await waitIdle(page, 400);
  const mv2 = await events(page, 'onRowMove');
  console.log('rowdrag autoscroll move:', mv2.map((e) => e.payload));
  check('rowdrag: autoscroll drag moves row far down', mv2.length === 1 && mv2[0].payload.to > 10, mv2.map((e) => e.payload));
  // readOnly でもハンドル? (仕様: readOnly は編集の無効化。行ドラッグはどうか)
  await page.evaluate(() => window.__setProps({ readOnly: true }));
  await waitIdle(page, 150);
  console.log('rowdrag: handles under readOnly =', await page.locator('.ssg-row-drag-handle').count());
  await page.evaluate(() => window.__setProps({ readOnly: false }));
  const errs = await errorsOf(page);
  check('rowdrag: no console errors', errs.filter((e) => e.startsWith('[error]')).length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

// ---------- auto-height ----------
{
  const { page, pageErrors, close } = await open('autoheight', { query: 'n=3000' });
  await waitIdle(page, 400);
  const heights = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].slice(0, 8).map((r) => ({ i: r.getAttribute('data-row-index'), h: r.getBoundingClientRect().height })));
  check('autoheight: rows have variable heights', new Set(heights.map((h) => h.h)).size > 1, heights);
  const autoCell = await page.locator('.ssg-body-cell--autoheight').count();
  check('autoheight: note cells marked autoheight', autoCell > 0, autoCell);
  // 3 ペインの行高が一致
  const paneMatch = await page.evaluate(() => {
    const idx = 5;
    const hs = ['left', 'center', 'right'].map((p) => document.querySelector(`.ssg-body-row[data-pane="${p}"][data-row-index="${idx}"]`)?.getBoundingClientRect().height);
    return hs;
  });
  check('autoheight: all 3 panes share row height', paneMatch.every((h) => h === paneMatch[0]), paneMatch);
  // 末尾へ → 最終行が見える / 戻って先頭が 0
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 500);
  let idx = await renderedRowIndexes(page);
  check('autoheight: scrollToBottom reaches last row', idx.at(-1) === 2999, idx.at(-1));
  const m = await page.evaluate(() => { const el = document.querySelector('.ssg-scroll-container'); return { st: el.scrollTop, sh: el.scrollHeight, ch: el.clientHeight }; });
  const lastBox = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="2999"]').first().boundingBox();
  const scBox = await page.locator('.ssg-scroll-container').boundingBox();
  check('autoheight: last row bottom aligns with viewport bottom (no gap/overflow)', lastBox && Math.abs(lastBox.y + lastBox.height - (scBox.y + scBox.height)) < 20, { lastBottom: lastBox?.y + lastBox?.height, vpBottom: scBox.y + scBox.height, m });
  // scrollToRow の精度(未測定領域へジャンプ)
  await page.evaluate(() => window.__grid.scrollToRow(1500, { align: 'start' }));
  await waitIdle(page, 500);
  const r1500 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="1500"]').first().boundingBox();
  check('autoheight: scrollToRow(1500, start) lands at top (±2px after measure)', r1500 && Math.abs(r1500.y - (scBox.y + 40)) < 3, { y: r1500?.y, expected: scBox.y + 40 });
  // 上方向へのホイールスクロールでジャンプしないか(測定による補正)
  const positions = [];
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.move(600, 300);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(60);
    positions.push(await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop));
  }
  const jumps = positions.filter((p, i) => i > 0 && (positions[i - 1] - p > 400 || p > positions[i - 1]));
  check('autoheight: upward wheel scroll monotonic without big jumps', jumps.length === 0, { positions, jumps });
  // 編集で行高が変わる(長文→短文)
  await page.evaluate(() => window.__grid.scrollToTop());
  await waitIdle(page, 300);
  const h0 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="0"]').first().boundingBox();
  await cell(page, 0, 'note').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('short');
  await page.keyboard.press('Enter');
  await waitIdle(page, 300);
  const h0b = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="0"]').first().boundingBox();
  check('autoheight: editing to short text shrinks row', h0b.height < h0.height, { before: h0.height, after: h0b.height });
  // 列幅変更で再計測
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: { note: 600 }, filters: { globalText: '', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 400);
  const h5 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="5"]').first().boundingBox();
  check('autoheight: widening note column reduces tall row height', h5.height < heights[5].h, { before: heights[5].h, after: h5.height });
  // autoSize は autoHeight 列を除外
  await header(page, 'note').hover();
  await header(page, 'note').locator('.ssg-icon-btn').click();
  await page.getByText('この列の幅を自動調整').click();
  await waitIdle(page, 400);
  const noteW = (await header(page, 'note').boundingBox()).width;
  check('autoheight: autoSize skips autoHeight column (stays 600)', Math.abs(noteW - 600) < 2, noteW);
  // 行数 > 50,000 で uniform へフォールバック(警告?)
  await errorsOf(page);
  await page.evaluate(() => window.__setRows(window.__makeRows(60000, 3)));
  await waitIdle(page, 600);
  const hs2 = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-body-row')].slice(0, 6).map((r) => r.getBoundingClientRect().height));
  const w2 = await errorsOf(page);
  check('autoheight: >50k rows falls back to uniform', new Set(hs2).size === 1, { hs2, w2: w2.slice(0, 2) });
  const errs = await errorsOf(page);
  // 50k 行超えのフォールバック警告は上で意図して出させたもの。
  const unexpectedAutoHeight = unexpectedPageErrors(pageErrors, ['auto-height は 50000 行まで']);
  check('autoheight: no console errors', errs.filter((e) => e.startsWith('[error]')).length === 0 && unexpectedAutoHeight.length === 0, [...errs, ...unexpectedAutoHeight].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-autoheight.png' });
  await close();
}

// ---------- セル操作の通知(G-1)----------
//   実ブラウザでの click / dblclick の判定(pointerdown の preventDefault 下でも click が届くか・範囲選択ドラッグは
//   クリックにならないか・右クリックは対象外か)と、onActiveCellChange → onCellClick の順を確かめる。
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=50' });
  await clearEvents(page);
  await cell(page, 2, 'name').click();
  await waitIdle(page);
  const ev1 = (await events(page)).filter((e) => e.type === 'onCellClick' || e.type === 'onActiveCellChange');
  check('cell-events: click → onActiveCellChange then onCellClick', ev1.length === 2 && ev1[0].type === 'onActiveCellChange' && ev1[1].type === 'onCellClick' && ev1[1].payload.columnKey === 'name' && ev1[1].payload.rowIndex === 2, ev1.map((e) => [e.type, e.payload]));
  await clearEvents(page);
  await cell(page, 2, 'name').click();
  await waitIdle(page);
  check('cell-events: same cell click → onCellClick only (no active change)', (await events(page, 'onActiveCellChange')).length === 0 && (await events(page, 'onCellClick')).length === 1);
  await clearEvents(page);
  await cell(page, 3, 'qty').click({ modifiers: ['Control'] });
  await waitIdle(page);
  const ctrlEv = await events(page, 'onCellClick');
  check('cell-events: ctrl+click carries event.ctrlKey', ctrlEv.length === 1 && ctrlEv[0].payload.ctrl === true, ctrlEv.map((e) => e.payload));
  // 範囲選択ドラッグ(押したセルと離したセルが違う)はクリックにならない。
  await clearEvents(page);
  const a = await cell(page, 1, 'name').boundingBox();
  const b = await cell(page, 4, 'qty').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await waitIdle(page);
  check('cell-events: range drag is not a click', (await events(page, 'onCellClick')).length === 0);
  // 右クリック / 列ヘッダーは対象外。
  await clearEvents(page);
  await cell(page, 5, 'name').click({ button: 'right' });
  await page.keyboard.press('Escape');
  await header(page, 'qty').click();
  await waitIdle(page);
  check('cell-events: right click / header click → no onCellClick', (await events(page, 'onCellClick')).length === 0);
  // ダブルクリック: 既定は編集開始、preventDefault() で止まる。
  await clearEvents(page);
  await cell(page, 6, 'name').dblclick();
  await waitIdle(page);
  const dbl = await events(page, 'onCellDoubleClick');
  check('cell-events: dblclick notifies (event = dblclick) and starts editing', dbl.length === 1 && dbl[0].payload.type === 'dblclick' && (await page.locator('.ssg-cell-editor').count()) === 1, dbl.map((e) => e.payload));
  await page.keyboard.press('Escape');
  await page.evaluate(() => void (window.__preventDblclick = true));
  await cell(page, 7, 'name').dblclick();
  await waitIdle(page);
  check('cell-events: preventDefault() stops editing on dblclick', (await page.locator('.ssg-cell-editor').count()) === 0);
  await page.keyboard.press('F2');
  await waitIdle(page);
  check('cell-events: F2 still starts editing after preventDefault on dblclick', (await page.locator('.ssg-cell-editor').count()) === 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => void (window.__preventDblclick = false));
  // キー操作でもアクティブセルの変化を通知する。
  await clearEvents(page);
  await page.keyboard.press('ArrowDown');
  await waitIdle(page);
  const act = await events(page, 'onActiveCellChange');
  check('cell-events: ArrowDown → onActiveCellChange (row 8)', act.length === 1 && act[0].payload.rowIndex === 8, act.map((e) => e.payload));
  const errs = await errorsOf(page);
  check('cell-events: no console errors', errs.length === 0 && unexpectedPageErrors(pageErrors).length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

// ---------- セルのメモ(G-3)----------
//   印(::before の 10px の三角。入力エラーの 6px の三角 ::after が上に重なる)と、ツールチップ(エラー → 改行 → メモ)を
//   実ブラウザの計算済みスタイル / 表示で確かめる。
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=50' });
  await page.evaluate(() =>
    window.__setColumns(
      window.__columns().map((c) =>
        c.key === 'name' ? { ...c, cellNote: ({ row }) => (row.id % 2 === 0 ? 'メモ 1 行目\nメモ 2 行目' : undefined) } : c,
      ),
    ),
  );
  await waitIdle(page, 200);
  const noted = await page.evaluate(() =>
    [...document.querySelectorAll('.ssg-center-pane .ssg-body-cell--has-note')].map((el) => el.closest('.ssg-body-row').getAttribute('data-row-index')),
  );
  check('cell-note: only rows with even id get the note class', noted.length > 0 && noted.every((i) => (Number(i) + 1) % 2 === 0), noted.slice(0, 6));
  const marker = await page.evaluate(() => {
    const el = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="1"] .ssg-body-cell[data-ssg-col-key="name"]');
    const before = getComputedStyle(el, '::before');
    return { content: before.content, width: before.borderTopWidth, color: before.borderTopColor, top: before.top, right: before.right, tip: el.getAttribute('data-ssg-tooltip') };
  });
  check('cell-note: ::before is a 10px amber triangle at the top-right', marker.content === '""' && marker.width === '10px' && marker.color === 'rgb(245, 158, 11)' && marker.top === '0px' && marker.right === '0px', marker);
  await cell(page, 1, 'name').hover();
  await waitIdle(page, 600);
  const tip = await page.evaluate(() => {
    const el = document.querySelector('.ssg-tooltip.ssg-tooltip--visible');
    return el ? { text: el.innerText, lines: el.innerText.split('\n').length } : null;
  });
  check('cell-note: hover shows the note with a line break', tip && tip.lines === 2 && tip.text.includes('メモ 2 行目'), tip);
  // 入力エラー(名前は必須)と重ねる: 二重の三角 + 「エラー → 改行 → メモ」。
  await page.mouse.move(5, 5);
  await page.evaluate(() => window.__setRows(window.__rows().map((r, i) => (i === 1 ? { ...r, name: '' } : r))));
  await waitIdle(page, 200);
  const both = await page.evaluate(() => {
    const el = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="1"] .ssg-body-cell[data-ssg-col-key="name"]');
    const after = getComputedStyle(el, '::after');
    return { cls: el.className, afterWidth: after.borderTopWidth, afterColor: after.borderTopColor, tip: el.getAttribute('data-ssg-tooltip') };
  });
  check('cell-note: with invalid → both classes, 6px red ::after over the note', both.cls.includes('ssg-body-cell--invalid') && both.cls.includes('ssg-body-cell--has-note') && both.afterWidth === '6px' && both.afterColor === 'rgb(239, 68, 68)', both);
  check('cell-note: tooltip = error → newline → note', both.tip === '名前は必須です\nメモ 1 行目\nメモ 2 行目', both.tip);
  await page.screenshot({ path: OUT + 'shot-cell-note.png', clip: { x: 0, y: 0, width: 700, height: 300 } });
  const errs = await errorsOf(page);
  check('cell-note: no console errors', errs.length === 0 && unexpectedPageErrors(pageErrors).length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

// ---------- IME オンのままの直接入力(G-2)----------
//   CDP の Input.imeSetComposition / Input.insertText で「変換中 → 確定」を流し、入力受け(imeDirectInput)から編集へ
//   引き継がれることと、入力受けにフォーカスがあってもキー操作 / 貼り付け / Tab が従来どおりであることを確かめる。
//   ※ CDP は変換イベントの模擬で、OS の IME(MS-IME)そのものではない。最終確認は Windows 実機。
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=50' });
  const cdp = await page.context().newCDPSession(page);
  const active = () => page.evaluate(() => {
    const el = document.activeElement;
    return el ? { tag: el.tagName, ime: el.hasAttribute('data-ssg-ime-input'), editor: el.classList.contains('ssg-cell-editor-input'), cls: el.className } : null;
  });
  const imeValue = () => page.evaluate(() => document.querySelector('[data-ssg-ime-input]')?.value ?? null);

  // 対照: 既定(無効)ではルートにフォーカスがあり、変換を流しても何も起きない(打った文字が失われる現象の再現)。
  await cell(page, 2, 'name').click();
  await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.insertText', { text: '漢字' });
  await waitIdle(page, 200);
  check('ime: default (off) → composition on the root is lost', (await page.locator('.ssg-cell-editor').count()) === 0 && (await cellText(page, 2, 'name')) !== '漢字');

  await page.evaluate(() => window.__setProps({ imeDirectInput: true }));
  await waitIdle(page, 200);
  check('ime: enabling moves focus to the IME input', (await active())?.ime === true, await active());
  await cell(page, 3, 'name').click();
  await waitIdle(page);
  check('ime: cell click → focus on the IME input', (await active())?.ime === true, await active());

  // 変換中: 入力受けがセルの上に出る。
  await cdp.send('Input.imeSetComposition', { text: 'か', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
  await waitIdle(page);
  const geo = await page.evaluate(() => {
    const ime = document.querySelector('[data-ssg-ime-input]');
    const c = document.querySelector('.ssg-body-row[data-row-index="3"] .ssg-body-cell[data-ssg-col-key="name"]');
    const a = ime.getBoundingClientRect(); const b = c.getBoundingClientRect();
    return { composing: ime.classList.contains('ssg-ime-input--composing'), opacity: getComputedStyle(ime).opacity, dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width), value: ime.value };
  });
  check('ime: composing → visible over the active cell with the composing text', geo.composing && geo.opacity === '1' && geo.dx < 1 && geo.dy < 1 && geo.dw < 1 && geo.value === 'かんじ', geo);
  // 変換中のキー(isComposing)はグリッドが扱わない(ArrowDown で候補を選んでもセルは動かない)。
  const before = await page.evaluate(() => window.__grid.getActiveCell());
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 229 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 229 });
  await waitIdle(page);
  // 確定(変換確定の Enter に相当)→ 確定した文字列で編集が始まる。
  await cdp.send('Input.insertText', { text: '漢字' });
  await waitIdle(page, 200);
  const editorState = await page.evaluate(() => {
    const ed = document.querySelector('.ssg-cell-editor-input');
    return ed ? { value: ed.value, focused: document.activeElement === ed, caret: ed.selectionStart } : null;
  });
  const after = await page.evaluate(() => window.__grid.getActiveCell());
  check('ime: composing keys do not move the active cell', JSON.stringify(before) === JSON.stringify(after), { before, after });
  check('ime: commit → editor opens with the committed text (focused, caret at end)', editorState && editorState.value === '漢字' && editorState.focused && editorState.caret === 2, editorState);
  check('ime: IME input hidden after hand-off', (await page.locator('.ssg-ime-input--composing').count()) === 0 && (await imeValue()) === '');
  // もう一度 Enter でセルを確定して下へ移動 → フォーカスは入力受けへ戻る。
  await page.keyboard.press('Enter');
  await waitIdle(page, 250);
  check('ime: second Enter commits the cell and moves down', (await cellText(page, 3, 'name')) === '漢字' && JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())) === JSON.stringify({ row: 4, col: after.col }), await page.evaluate(() => window.__grid.getActiveCell()));
  check('ime: focus returns to the IME input after commit', (await active())?.ime === true, await active());

  // 変換を取り消した(空で確定)ときは編集を始めない。
  await cdp.send('Input.imeSetComposition', { text: 'あ', selectionStart: 1, selectionEnd: 1 });
  await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
  await waitIdle(page, 200);
  check('ime: cancelled composition → no editing', (await page.locator('.ssg-cell-editor').count()) === 0 && (await page.locator('.ssg-ime-input--composing').count()) === 0);

  // number エディタの列(text 以外)では変換を捨てる(従来どおり何も入らない)。
  await cell(page, 4, 'qty').click();
  const qtyBefore = await cellText(page, 4, 'qty');
  await cdp.send('Input.imeSetComposition', { text: '１', selectionStart: 1, selectionEnd: 1 });
  const qtyComposing = await page.locator('.ssg-ime-input--composing').count();
  await cdp.send('Input.insertText', { text: '１２' });
  await waitIdle(page, 200);
  check('ime: non-text editor column → composition discarded', qtyComposing === 0 && (await page.locator('.ssg-cell-editor').count()) === 0 && (await cellText(page, 4, 'qty')) === qtyBefore && (await imeValue()) === '');

  // IME を使わない文字キー / F2 / Delete / 矢印 / 貼り付けは従来どおり。
  await cell(page, 5, 'name').click();
  await page.keyboard.press('x');
  await waitIdle(page);
  check('ime: plain printable key still starts editing with that key', (await page.locator('.ssg-cell-editor-input').inputValue().catch(() => null)) === 'x');
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
  check('ime: focus back on the IME input after Escape', (await active())?.ime === true, await active());
  await page.keyboard.press('ArrowDown');
  await waitIdle(page);
  check('ime: ArrowDown moves the active cell', JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())).includes('"row":6'));
  await pasteText(page, '貼り付け');
  check('ime: paste writes the cell (and not into the IME input)', (await cellText(page, 6, 'name')) === '貼り付け' && (await imeValue()) === '');
  await page.keyboard.press('Delete');
  await waitIdle(page);
  check('ime: Delete clears the cell', (await cellText(page, 6, 'name')) === '');
  await page.keyboard.press('F2');
  await waitIdle(page);
  check('ime: F2 starts editing', (await page.locator('.ssg-cell-editor').count()) === 1);
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);

  // 変換中にグリッド外をクリックしたら、編集を始めず(フォーカスを奪わず)変換を捨てる。
  await cell(page, 7, 'name').click();
  await cdp.send('Input.imeSetComposition', { text: 'て', selectionStart: 1, selectionEnd: 1 });
  await page.locator('.ssg-root input[type="text"]:not([data-ssg-ime-input])').first().click();
  await waitIdle(page, 250);
  const outside = await active();
  check('ime: clicking outside while composing → no editing, focus stays outside', (await page.locator('.ssg-cell-editor').count()) === 0 && outside && !outside.ime && !outside.editor && (await cellText(page, 7, 'name')) !== 'て', outside);
  // 変換中に別のセルをクリック → 変換は捨て、クリックしたセルがアクティブになる(編集は始めない)。
  await cell(page, 7, 'name').click();
  await cdp.send('Input.imeSetComposition', { text: 'と', selectionStart: 1, selectionEnd: 1 });
  await cell(page, 9, 'name').click();
  await waitIdle(page, 250);
  check('ime: clicking another cell while composing → that cell becomes active, no editing', (await page.locator('.ssg-cell-editor').count()) === 0 && JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())).includes('"row":9') && (await active())?.ime === true, await active());

  // 端の列の Tab はグリッド外へ(無効時と同じ行き先)。
  const lastKey = await page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell[data-ssg-col-key]')].map((h) => h.getAttribute('data-ssg-col-key')).filter((k) => !k.startsWith('__')).pop());
  const tabTarget = async () => {
    await cell(page, 8, lastKey).click();
    await page.keyboard.press('Tab');
    await waitIdle(page);
    return page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}.${el.className}` : null;
    });
  };
  const withIme = await tabTarget();
  await page.evaluate(() => window.__setProps({ imeDirectInput: false }));
  await waitIdle(page, 200);
  const withoutIme = await tabTarget();
  check('ime: Tab at the last column leaves the grid like when disabled', withIme === withoutIme && !String(withIme).includes('ssg-ime-input'), { withIme, withoutIme });
  check('ime: disabling removes the IME input', (await page.locator('[data-ssg-ime-input]').count()) === 0);

  const errs = await errorsOf(page);
  check('ime: no console errors', errs.length === 0 && unexpectedPageErrors(pageErrors).length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

summary();