// 実際にアプリを作って確かめたチェック(2026-11-07)の段階 2(0.63.0)の回帰確認。jsdom ではフォーカスの既定の移動・
//   CSS の継承・横スクロールの固定・入力欄の中のスクロールが見えないため、実ブラウザ(Chromium / Firefox / WebKit)で見る。
//   修正前の 0.62.0 までは FAIL、修正後は PASS になる。
import { open, check, summary, waitIdle, unexpectedPageErrors, header, cell } from './pw.mjs';

// ---- C-N2: 展開行があるときの Tab の順番(最終列 → その行のカード → 表の外。Shift+Tab は逆順) ----
//   これまではブラウザの既定(DOM の順)で、画面の上の方にある別の行の開いたカードへ入っていた。
{
  const { page, close, pageErrors } = await open('detail', { query: 'n=30' });
  await page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const after = document.createElement('button');
    after.id = 'after';
    after.textContent = 'after';
    root.after(after);
    const rows = window.__rows();
    window.__grid.setDetailRowExpanded(rows[1].id, true);
    window.__grid.setDetailRowExpanded(rows[4].id, true);
  });
  await waitIdle(page, 300);
  const where = () =>
    page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return 'null';
      if (el.id) return `#${el.id}`;
      const band = el.closest('[data-detail-row-index]');
      if (band) return `card${band.getAttribute('data-detail-row-index')}:${el.tagName.toLowerCase()}`;
      const active = window.__grid.getActiveCell();
      return el.classList.contains('ssg-shell') ? `shell(${active?.row},${active?.col})` : el.className || el.tagName;
    });
  const lastCol = await page.evaluate(() => {
    const keys = Array.from(document.querySelectorAll('.ssg-header-row [data-ssg-col-key]')).map((el) => el.getAttribute('data-ssg-col-key'));
    return Math.max(...keys.map((key) => window.__grid.getColIndex(key)));
  });
  const press = async (key) => {
    await page.keyboard.press(key);
    await waitIdle(page, 80);
    return where();
  };
  await page.evaluate((lastCol) => window.__grid.setActiveCell({ row: 4, col: lastCol }, { scrollIntoView: true }), lastCol);
  await page.evaluate(() => window.__grid.focus());
  await waitIdle(page, 100);
  const forward = [await press('Tab'), await press('Tab'), await press('Tab')];
  check('C-N2: last column Tab enters that row\'s card, then leaves the grid (skips row 1\'s card)', JSON.stringify(forward) === JSON.stringify(['card4:input', 'card4:button', '#after']), forward);
  const backward = [await press('Shift+Tab'), await press('Shift+Tab'), await press('Shift+Tab'), await press('Shift+Tab')];
  check(
    'C-N2: Shift+Tab from after the grid goes back through the active row\'s card to its last column',
    JSON.stringify(backward) === JSON.stringify(['card4:button', 'card4:input', `shell(4,${lastCol})`, `shell(4,${lastCol - 1})`]),
    backward,
  );
  await page.evaluate((lastCol) => window.__grid.setActiveCell({ row: 6, col: lastCol }, { scrollIntoView: true }), lastCol);
  await page.evaluate(() => window.__grid.focus());
  await waitIdle(page, 100);
  const noCard = [await press('Tab'), await press('Shift+Tab')];
  check('C-N2: a row without a card leaves the grid directly and comes back to the shell', JSON.stringify(noCard) === JSON.stringify(['#after', `shell(6,${lastCol})`]), noCard);
  check('C-N2: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DU-13: theme="class" は祖先の .dark / data-theme="dark" に合わせ、ポップアップ(body 直下)も同じ ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=50' });
  await page.evaluate(() => window.__setProps({ theme: 'class' }));
  await waitIdle(page, 200);
  const tokens = () =>
    page.evaluate(() => {
      const root = document.querySelector('.ssg-root');
      const menu = document.querySelector('.ssg-menu-panel');
      return {
        rootClass: root.classList.contains('ssg-theme-class'),
        rootScheme: getComputedStyle(root).colorScheme,
        rootBg: getComputedStyle(root).getPropertyValue('--ssg-cell-bg').trim(),
        menuClass: menu ? menu.classList.contains('ssg-theme-class') : null,
        menuScheme: menu ? getComputedStyle(menu).colorScheme : null,
      };
    });
  const light = await tokens();
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await waitIdle(page, 100);
  const dark = await tokens();
  check('DU-13: theme="class" follows html.dark (light → dark)', light.rootClass && light.rootScheme !== 'dark' && dark.rootScheme === 'dark' && light.rootBg !== dark.rootBg, { light, dark });
  await header(page, 'name').hover();
  await header(page, 'name').locator('[data-ssg-tooltip="列メニュー"]').click();
  await page.waitForSelector('.ssg-menu-panel');
  await waitIdle(page, 150);
  const menuDark = await tokens();
  await page.evaluate(() => document.documentElement.classList.remove('dark'));
  await waitIdle(page, 100);
  const menuLight = await tokens();
  check('DU-13: the column menu (portal) follows the class too', menuDark.menuClass === true && menuDark.menuScheme === 'dark' && menuLight.menuScheme !== 'dark', { menuDark, menuLight });
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await waitIdle(page, 100);
  const dataTheme = await tokens();
  check('DU-13: theme="class" follows [data-theme="dark"] too', dataTheme.rootScheme === 'dark', dataTheme);
  check('DU-13: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DU-22: 左固定列が無い表でも、行番号は横にスクロールしても流れない ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=200' });
  await page.setViewportSize({ width: 900, height: 700 });
  await page.evaluate(() => window.__setColumns(window.__columns().map((c) => ({ ...c, pinned: undefined, flex: undefined, width: c.width ?? 120 }))));
  await waitIdle(page, 300);
  const rowHeader = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-pane="left"].ssg-body-row[data-row-index="2"] .ssg-row-header-cell');
      return el ? Math.round(el.getBoundingClientRect().left) : null;
    });
  const before = await rowHeader();
  await page.evaluate(() => {
    document.querySelector('.ssg-scroll-container').scrollLeft = 400;
  });
  await waitIdle(page, 300);
  const after = await rowHeader();
  const scrollLeft = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollLeft);
  check('DU-22: the row number column stays put while scrolling horizontally', before !== null && before === after && scrollLeft > 0, { before, after, scrollLeft });
  // このシナリオは行の選択(enableRowSelection)が有効なので、行番号の列は行のチェックボックス。
  await page.locator('[data-pane="left"].ssg-body-row[data-row-index="3"] .ssg-row-header-cell').click();
  await waitIdle(page, 150);
  const picked = await page.evaluate(() => ({ keys: window.__grid.getSelectedRowKeys(), id: window.__rows()[3].id }));
  check('DU-22: clicking the row number column (while scrolled) acts on that row', picked.keys.length === 1 && picked.keys[0] === picked.id, picked);
  check('DU-22: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DU-14: 複数行のエディタ(Alt+Enter で改行、Enter で改行ごと確定。中がスクロールするときは PageDown を入力欄に任せる) ----
{
  const { page, close, pageErrors } = await open('autoheight', { query: 'n=40' });
  await page.evaluate(() => {
    window.__setColumns(window.__columns().map((c) => (c.key === 'note' ? { ...c, autoHeight: true, editable: true, editor: { type: 'text', multiline: true } } : c)));
    window.__setRows(window.__rows().slice(0, 40).map((r, i) => ({ ...r, note: i === 0 ? 'A\nB' : '至急' })));
  });
  await waitIdle(page, 300);
  const noteCell = (i) => page.locator(`[data-pane="center"].ssg-body-row[data-row-index="${i}"] .ssg-body-cell[data-ssg-col-key="note"]`).first();
  await noteCell(0).click();
  await page.keyboard.press('F2');
  await waitIdle(page, 100);
  const opened = await page.evaluate(() => document.querySelector('textarea.ssg-cell-editor-input')?.value ?? null);
  check('DU-14: F2 opens a textarea with the line break kept', opened === 'A\nB', JSON.stringify(opened));
  // N3-2: 1 行目の位置をセルの文字にそろえる(背の高い行 = 上にそろえたセル、1 行の行 = 真ん中のセル)。違いは枠線の 2px まで。
  //   これまでは背の高い行で余白 6px が足され、文字が 8px 下、入力欄はセルより約 15px 高かった。
  const alignment = (row) =>
    page.evaluate((row) => {
      const ta = document.querySelector('textarea.ssg-cell-editor-input');
      const cell = document.querySelector(`[data-pane="center"].ssg-body-row[data-row-index="${row}"] .ssg-body-cell[data-ssg-col-key="note"]`);
      const content = cell?.querySelector('[data-autoheight-content]');
      if (!ta || !cell || !content) return null;
      const taTop = ta.getBoundingClientRect().top + ta.clientTop + parseFloat(getComputedStyle(ta).paddingTop);
      return {
        textOffset: Math.round((taTop - content.getBoundingClientRect().top) * 10) / 10,
        extraHeight: Math.round(ta.getBoundingClientRect().height - cell.getBoundingClientRect().height),
      };
    }, row);
  const tallAlign = await alignment(0);
  check(
    'N3-2: in a tall row the multiline editor puts its first line where the cell text is (within the 2px border)',
    tallAlign !== null && Math.abs(tallAlign.textOffset) <= 2.5 && tallAlign.extraHeight <= 4,
    tallAlign,
  );
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  await noteCell(1).click();
  await page.keyboard.press('F2');
  await waitIdle(page, 100);
  const singleAlign = await alignment(1);
  check(
    'N3-2: in a one-line row the multiline editor keeps the first line centered like the cell',
    singleAlign !== null && Math.abs(singleAlign.textOffset) <= 2.5 && singleAlign.extraHeight <= 0,
    singleAlign,
  );
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  await noteCell(0).click();
  await page.keyboard.press('F2');
  await waitIdle(page, 100);
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Alt+Enter');
  await page.keyboard.type('C');
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const committed = await page.evaluate(() => ({ open: !!document.querySelector('textarea.ssg-cell-editor-input'), note: window.__rows()[0].note }));
  check('DU-14: Alt+Enter inserts a line break and Enter commits it', !committed.open && committed.note === 'A\nB\nC', committed);
  check('DU-14: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}
// DU-14: 中がスクロールする長い文でも、PageUp / PageDown はグリッドも入力欄も動かさない(Chromium は入力欄に任せると
//   グリッドも一緒にスクロールし、エディタの上の方が見出しの下へ隠れたため、止めたままにした)。
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=40' });
  await page.evaluate(() => {
    window.__setColumns(window.__columns().map((c) => (c.key === 'note' ? { ...c, editable: true, editor: { type: 'text', multiline: true } } : c)));
    window.__setRows(window.__rows().slice(0, 40).map((r, i) => ({ ...r, note: i === 2 ? Array.from({ length: 60 }, (_, k) => `line${k}`).join('\n') : '至急' })));
  });
  await waitIdle(page, 300);
  await cell(page, 2, 'note').click();
  await page.keyboard.press('F2');
  await waitIdle(page, 150);
  await page.keyboard.press('Control+Home');
  await waitIdle(page, 50);
  const snap = () =>
    page.evaluate(() => {
      const ta = document.querySelector('textarea.ssg-cell-editor-input');
      return { open: !!ta, inner: ta?.scrollTop ?? null, scrollable: ta ? ta.scrollHeight > ta.clientHeight : null, grid: document.querySelector('.ssg-scroll-container').scrollTop };
    });
  const beforePage = await snap();
  await page.keyboard.press('PageDown');
  await waitIdle(page, 150);
  await page.keyboard.press('PageDown');
  await waitIdle(page, 150);
  const afterPage = await snap();
  check(
    'DU-14: PageDown in a scrollable multiline editor moves neither the grid nor the editor (editing continues)',
    beforePage.scrollable === true && afterPage.open && afterPage.grid === beforePage.grid && afterPage.inner === beforePage.inner,
    { beforePage, afterPage },
  );
  await page.keyboard.press('Escape');
  check('DU-14: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DU-32: auto-height で伸びた行でも、どのセルも箱は行の高さ(下の枠線が行の途中に出ない) ----
{
  const { page, close, pageErrors } = await open('autoheight', { query: 'n=5' });
  await page.evaluate(() => {
    window.__setColumns(window.__columns().map((c) => (c.key === 'note' || c.key === 'name' ? { ...c, autoHeight: true } : c)));
    window.__setRows(
      window.__rows().slice(0, 3).map((r, i) => ({ ...r, name: i === 1 ? '短い' : r.name, note: i === 1 ? '倉庫 B の棚 3 から。残りは来週入荷。先方へ連絡済み。'.repeat(4) : '至急' })),
    );
  });
  await waitIdle(page, 400);
  const boxes = await page.evaluate(() => {
    const row = document.querySelector('[data-pane="center"].ssg-body-row[data-row-index="1"]');
    const rowHeight = Math.round(row.getBoundingClientRect().height);
    const heights = Array.from(row.querySelectorAll('.ssg-body-cell')).map((cell) => Math.round(cell.getBoundingClientRect().height));
    return { rowHeight, heights: [...new Set(heights)] };
  });
  check('DU-32: every cell box in a grown auto-height row is the row height', boxes.rowHeight > 40 && boxes.heights.length === 1 && Math.abs(boxes.heights[0] - boxes.rowHeight) <= 1, boxes);
  check('DU-32: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DU-24 / DU-11 / G1 / DU-10: 行グルーピングまわり ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=200' });
  await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'category' ? { ...c, rowGroup: false } : c))));
  await waitIdle(page, 200);
  const openMenu = async (key) => {
    await header(page, key).hover();
    await header(page, key).locator('[data-ssg-tooltip="列メニュー"]').click();
    await page.waitForSelector('.ssg-menu-panel');
    await waitIdle(page, 150);
  };
  const labels = () => page.evaluate(() => Array.from(document.querySelectorAll('.ssg-menu-panel .ssg-menu-label')).map((e) => e.textContent));
  await openMenu('category');
  const menu = await labels();
  check('DU-24: the column menu offers 「この列でグループ化」 (and not 「グループ化を外す」 before grouping)', menu.includes('この列でグループ化') && !menu.includes('グループ化を外す'), menu);
  await page.locator('.ssg-menu-item', { hasText: 'この列でグループ化' }).click();
  await waitIdle(page, 300);
  const grouped = await page.evaluate(() => ({
    groups: window.__grid.getGroupRows().length,
    hasAuto: document.querySelector('.ssg-header-row [data-ssg-col-key="__ssg_group__"]') !== null,
    hasCategory: document.querySelector('.ssg-header-row [data-ssg-col-key="category"]') !== null,
  }));
  check('DU-24: grouping by the column shows the auto group column and hides the source column', grouped.groups > 1 && grouped.hasAuto && !grouped.hasCategory, grouped);

  // G1: 自動グループ列のセルの番地は見出しの名前と行番号(下部バー)。
  await page.locator('[data-pane="center"].ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="__ssg_group__"], [data-pane="left"].ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="__ssg_group__"]').first().click();
  await waitIdle(page, 150);
  const bar = await page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.textContent ?? null);
  const groupTitle = await page.evaluate(() => document.querySelector('.ssg-header-row [data-ssg-col-key="__ssg_group__"]')?.textContent?.trim() ?? '');
  check('G1: the bottom bar names an auto group column cell by its header and row number', bar !== null && groupTitle !== '' && bar.includes(`${groupTitle} 1`), { bar, groupTitle });

  // DU-11: グルーピング中もフィルターの管理からグループ元の列の絞り込みを足せる。
  await page.evaluate(() => window.__grid.openFilterManager());
  await waitIdle(page, 200);
  const options = await page.evaluate(() =>
    Array.from(document.querySelector('select[aria-label="フィルターを追加する列を選択"]')?.options ?? []).map((o) => o.value),
  );
  check('DU-11: the filter manager offers the group source column while grouping', options.includes('category'), options);
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);

  // DU-10: 小計の行(includeGroupRows)。出力しない行(isRowExportable)は小計に数えない。
  const exported = await page.evaluate(async () => {
    const all = window.__grid.getExportData({ includeGroupRows: true });
    window.__setProps({ isRowExportable: (row) => row.id % 2 === 0 });
    await new Promise((r) => setTimeout(r, 200));
    const even = window.__grid.getExportData({ includeGroupRows: true });
    const qtyIndex = even.columns.findIndex((c) => c.key === 'qty');
    const groupRows = even.rows.filter((_, i) => even.rowKinds[i] === 'group');
    const dataRows = even.rows.filter((_, i) => even.rowKinds[i] === 'data');
    const subtotalSum = groupRows.reduce((sum, row) => sum + (typeof row[qtyIndex]?.value === 'number' ? row[qtyIndex].value : 0), 0);
    const dataSum = dataRows.reduce((sum, row) => sum + (Number(row[qtyIndex]?.value) || 0), 0);
    window.__setProps({ isRowExportable: undefined });
    return {
      allGroups: all.rowKinds.filter((k) => k === 'group').length,
      evenGroups: groupRows.length,
      dataRows: dataRows.length,
      qtyIndex,
      subtotalSum,
      dataSum,
      firstKinds: all.rowKinds.slice(0, 3),
    };
  });
  check('DU-10: includeGroupRows puts a subtotal row before each group', exported.allGroups > 1 && exported.firstKinds[0] === 'group', exported);
  check(
    'DU-10: subtotals count only exported rows (isRowExportable)',
    exported.qtyIndex >= 0 && exported.dataRows > 0 && exported.subtotalSum === exported.dataSum,
    exported,
  );

  // DU-24: 「グループ化を外す」で元に戻る。
  await openMenu('name');
  await page.locator('.ssg-menu-item', { hasText: 'グループ化を外す' }).click();
  await waitIdle(page, 300);
  const ungrouped = await page.evaluate(() => ({ groups: window.__grid.getGroupRows().length, rowGroup: window.__columns().find((c) => c.key === 'category').rowGroup }));
  check('DU-24: 「グループ化を外す」 ungroups (rowGroup: false)', ungrouped.groups === 0 && ungrouped.rowGroup === false, ungrouped);
  check('grouping: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DF-23: グリッドが隠れたら(display: none のタブへ切り替え)開いていた列メニューを閉じる ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=50' });
  await header(page, 'name').hover();
  await header(page, 'name').locator('[data-ssg-tooltip="列メニュー"]').click();
  await page.waitForSelector('.ssg-menu-panel');
  await waitIdle(page, 150);
  await page.evaluate(() => {
    document.querySelector('.ssg-root').parentElement.style.display = 'none';
  });
  await waitIdle(page, 400);
  const menuLeft = await page.evaluate(() => document.querySelector('.ssg-menu-panel') !== null);
  check('DF-23: hiding the grid closes the open column menu', menuLeft === false, { menuLeft });
  await page.evaluate(() => {
    document.querySelector('.ssg-root').parentElement.style.display = '';
  });
  await waitIdle(page, 200);
  await cell(page, 0, 'name').click();
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  check('DF-23: the grid works again after it is shown', active?.row === 0, active);
  check('DF-23: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();
