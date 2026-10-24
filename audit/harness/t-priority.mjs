// キーとポインタの優先順位(差し込み式 段階 1 で追加)。機能を本体から差し込み式へ移すとき、リスナや処理の順番が
//   変わると「Escape でどれが閉じるか」「ヘッダーのどこを押すと何が始まるか」が静かに変わりうるため、今の挙動を
//   固定して見張る。ここでの期待値は 2026-10-24 時点(0.52.0)の実際の挙動で、仕様の善し悪しは問わない
//   (変えるときは意図した変更として期待値を直す)。
//   A: Escape が 1 回で 1 つだけ効く順番(編集 → ポップアップ類 → 検索バー → 選択の解除)
//   B: ドラッグ中の Escape(範囲選択 / 列 / フィルハンドル / 行)と、それが選択の解除へ届くかどうか
//   C: ヘッダーとセルのポインタ操作の割り当て(クリック / ⋮ / 右クリック / 幅の境界 / grip / ダブルクリック)
//   D: Ctrl+F(find の有無)/ Ctrl+C 後の Escape / ツールチップ表示中の Escape
import { open, check, summary, unexpectedPageErrors, cell, header, focusGrid, waitIdle, events, clearEvents } from './pw.mjs';

const active = (page) => page.evaluate(() => window.__grid.getActiveCell());
const selection = (page) => page.evaluate(() => window.__grid.getSelection());
const count = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);
const editorOpen = async (page) => (await count(page, '.ssg-cell-editor')) > 0;
const focusInShell = (page) => page.evaluate(() => document.activeElement?.closest('.ssg-shell') != null && !document.activeElement?.closest('.ssg-find-bar'));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const openMenu = async (page, colKey) => {
  await header(page, colKey).hover();
  await header(page, colKey).locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
};
const selectRange = (page, r1, c1, r2, c2) =>
  page.evaluate(([a, b, c, d]) => window.__grid.selectRange({ start: { row: a, col: b }, end: { row: c, col: d } }), [r1, c1, r2, c2]);
const center = async (page, locator) => {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// ---------- A / C / D: basic ----------
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=100' });
  // keydown の defaultPrevented を window(bubble)で記録する(Ctrl+F をグリッドが横取りしたか)。
  await page.evaluate(() => {
    window.__lastKey = null;
    window.addEventListener('keydown', (e) => {
      window.__lastKey = { key: e.key, prevented: e.defaultPrevented };
    });
  });

  // A1: 編集中の Escape は編集の取り消しだけ(選択は残る)。
  await cell(page, 2, 'name').click();
  await page.keyboard.press('Enter');
  await waitIdle(page);
  const editingBefore = await editorOpen(page);
  await page.keyboard.type('zz');
  await page.keyboard.press('Escape');
  await waitIdle(page);
  const nameAfterCancel = await page.evaluate(() => window.__rows()[2].name);
  check('A1 編集中の Escape: エディタだけ閉じ、値は変えず、選択は残る', editingBefore && !(await editorOpen(page)) && nameAfterCancel === 'item-000003' && (await selection(page)) !== null && (await active(page))?.row === 2, {
    editingBefore,
    nameAfterCancel,
    selection: await selection(page),
  });
  // A2: 次の Escape で選択を解除する(アクティブセルは残す)。
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('A2 2 回目の Escape: 選択を解除し、アクティブセルは残る', (await selection(page)) === null && (await active(page))?.row === 2, { selection: await selection(page), active: await active(page) });

  // A3: 列メニュー表示中の Escape はメニューだけ閉じる(選択は残り、フォーカスはグリッドへ)。
  await cell(page, 3, 'qty').click();
  const selBeforeMenu = await selection(page);
  await openMenu(page, 'qty');
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('A3 列メニュー表示中の Escape: メニューだけ閉じ、選択は残る', (await count(page, '.ssg-menu-panel')) === 0 && sameJson(await selection(page), selBeforeMenu) && (await focusInShell(page)), {
    menus: await count(page, '.ssg-menu-panel'),
    selBeforeMenu,
    selection: await selection(page),
    focus: await focusInShell(page),
  });

  // A4: 列フィルターのポップオーバー表示中の Escape はポップオーバーだけ閉じる。
  await openMenu(page, 'name');
  await page.getByText('フィルター…').first().click();
  await page.waitForSelector('.ssg-filter-popover');
  await waitIdle(page, 100);
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  check('A4 フィルター表示中の Escape: ポップオーバーだけ閉じ、選択は残る', (await count(page, '.ssg-filter-popover')) === 0 && sameJson(await selection(page), selBeforeMenu) && (await focusInShell(page)), {
    popovers: await count(page, '.ssg-filter-popover'),
    selection: await selection(page),
    focus: await focusInShell(page),
  });

  // A5: セルの右クリックメニュー表示中の Escape はメニューだけ閉じる。
  await cell(page, 5, 'price').click();
  await cell(page, 5, 'price').click({ button: 'right' });
  await page.waitForSelector('.ssg-menu-panel');
  const selAtContext = await selection(page);
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('A5 右クリックメニュー表示中の Escape: メニューだけ閉じ、選択は残る', (await count(page, '.ssg-menu-panel')) === 0 && selAtContext !== null && sameJson(await selection(page), selAtContext) && (await focusInShell(page)), {
    menus: await count(page, '.ssg-menu-panel'),
    selAtContext,
    selection: await selection(page),
    focus: await focusInShell(page),
  });

  // A6: ツールパネル表示中の Escape はパネルだけ閉じる。
  const selBeforePanel = await selection(page);
  await page.evaluate(() => window.__grid.openFilterManager());
  await page.waitForSelector('.ssg-toolpanel', { timeout: 5000 });
  await waitIdle(page, 100);
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  check('A6 ツールパネル表示中の Escape: パネルだけ閉じ、選択は残る', (await count(page, '.ssg-toolpanel')) === 0 && sameJson(await selection(page), selBeforePanel), {
    panels: await count(page, '.ssg-toolpanel'),
    selection: await selection(page),
  });

  // A7〜A9 / D1: 検索バー(find)。
  await page.evaluate(() => window.__setProps({ find: true }));
  await waitIdle(page, 150);
  await cell(page, 1, 'name').click();
  await page.keyboard.press('Control+f');
  await waitIdle(page, 150);
  const findOpened = (await count(page, '.ssg-find-bar')) === 1;
  const focusInFind = await page.evaluate(() => document.activeElement?.closest('.ssg-find-bar') != null);
  const ctrlFPrevented = await page.evaluate(() => window.__lastKey);
  check('D1 find 有効で Ctrl+F: 検索バーを開いて入力欄へ(ブラウザの検索は止める)', findOpened && focusInFind && ctrlFPrevented?.prevented === true, { findOpened, focusInFind, ctrlFPrevented });
  await page.keyboard.type('item-00004');
  await waitIdle(page, 300);
  // A7: 検索バーで編集を始めて Escape → 編集の取り消しだけで、検索バーは残る(入力で一致したセルへ移っているので、そのセルで)。
  const matched = await active(page);
  await cell(page, matched.row, 'name').click();
  await page.keyboard.press('Enter');
  await waitIdle(page);
  const editingWithFind = await editorOpen(page);
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('A7 検索バーを開いたまま編集中の Escape: 編集だけ取り消し、検索バーは残る', editingWithFind && !(await editorOpen(page)) && (await count(page, '.ssg-find-bar')) === 1, {
    editingWithFind,
    findBars: await count(page, '.ssg-find-bar'),
  });
  // A8: グリッドにフォーカスがあるときの Escape は選択の解除で、検索バーは閉じない。
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('A8 検索バーを開いたままグリッドで Escape: 選択を解除し、検索バーは残る', (await selection(page)) === null && (await count(page, '.ssg-find-bar')) === 1, {
    selection: await selection(page),
    findBars: await count(page, '.ssg-find-bar'),
  });
  // A9: 検索バーの入力欄で Escape → 検索バーを閉じてグリッドへ戻る。
  await page.locator('.ssg-find-bar-input').click();
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  check('A9 検索バーの入力欄で Escape: 検索バーを閉じ、フォーカスはグリッドへ', (await count(page, '.ssg-find-bar')) === 0 && (await focusInShell(page)), {
    findBars: await count(page, '.ssg-find-bar'),
    focus: await focusInShell(page),
  });
  // D2: find 無効で Ctrl+F はブラウザに任せる(横取りしない)。
  await page.evaluate(() => window.__setProps({ find: false }));
  // 検索で下の一致まで動いているので、以降の確認のために先頭へ戻す。
  await page.evaluate(() => window.__grid.scrollToTop());
  await waitIdle(page, 150);
  await cell(page, 1, 'name').click();
  await page.keyboard.press('Control+f');
  await waitIdle(page, 100);
  check('D2 find 無効で Ctrl+F: 横取りしない', (await count(page, '.ssg-find-bar')) === 0 && (await page.evaluate(() => window.__lastKey))?.prevented === false, await page.evaluate(() => window.__lastKey));

  // D3: Ctrl+C 後の Escape は、コピー範囲の点線と選択を同時に消す。
  await selectRange(page, 1, 1, 3, 2);
  await focusGrid(page);
  await page.keyboard.press('Control+c');
  await waitIdle(page, 150);
  const copyShown = (await count(page, '.ssg-copy-range-overlay')) > 0;
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  check('D3 Ctrl+C 後の Escape: コピー範囲の点線と選択が消える', copyShown && (await count(page, '.ssg-copy-range-overlay')) === 0 && (await selection(page)) === null, {
    copyShown,
    copyAfter: await count(page, '.ssg-copy-range-overlay'),
    selection: await selection(page),
  });

  // D4: ツールチップ表示中の Escape は、ツールチップを隠し、選択の解除もする(どちらも効く)。
  //   クリックするとツールチップが隠れ、同じ場所では出し直さないため、選択は API で付けてからセルの外 → 上へ動かす。
  const noteCol = await page.evaluate(() => {
    const cols = window.__columns().filter((c) => c.visible !== false);
    const ordered = [...cols.filter((c) => c.pinned === 'left'), ...cols.filter((c) => !c.pinned), ...cols.filter((c) => c.pinned === 'right')];
    return ordered.findIndex((c) => c.key === 'note');
  });
  await page.evaluate((col) => window.__grid.selectCell(0, col), noteCol);
  await focusGrid(page);
  await page.mouse.move(5, 5);
  await cell(page, 0, 'note').hover();
  await page.waitForSelector('.ssg-tooltip--visible', { timeout: 3000 }).catch(() => {});
  const tooltipShown = (await count(page, '.ssg-tooltip--visible')) > 0;
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  check('D4 ツールチップ表示中の Escape: ツールチップを隠し、選択も解除する', tooltipShown && (await count(page, '.ssg-tooltip--visible')) === 0 && (await selection(page)) === null, {
    tooltipShown,
    tooltipAfter: await count(page, '.ssg-tooltip--visible'),
    selection: await selection(page),
  });
  await page.mouse.move(5, 5);

  // C1: ヘッダーの見出し部分のクリックは列の範囲選択。
  await page.evaluate(() => window.__grid.clearSelection());
  const headerBox = await header(page, 'price').boundingBox();
  await page.mouse.click(headerBox.x + 12, headerBox.y + headerBox.height / 2);
  await waitIdle(page);
  const colSel = await selection(page);
  check('C1 ヘッダーの見出しのクリック: その列の列選択', colSel?.type === 'col' && colSel.startCol === 3 && colSel.endCol === 3 && (await count(page, '.ssg-menu-panel')) === 0, colSel);
  // C2: ⋮ のクリックは列メニューを開くだけで、選択は変えない。
  await openMenu(page, 'qty');
  check('C2 ⋮ のクリック: 列メニューを開き、選択は変えない', (await count(page, '.ssg-menu-panel')) === 1 && sameJson(await selection(page), colSel), await selection(page));
  await page.keyboard.press('Escape');
  await waitIdle(page);
  // C3: ヘッダーの右クリックは列メニュー。
  await page.mouse.click(headerBox.x + 12, headerBox.y + headerBox.height / 2, { button: 'right' });
  await waitIdle(page, 150);
  const menuTitle = await page.evaluate(() => document.querySelector('.ssg-menu-panel .ssg-menu-title')?.textContent ?? null);
  check('C3 ヘッダーの右クリック: その列の列メニューを開く', (await count(page, '.ssg-menu-panel')) === 1 && menuTitle !== null, { menus: await count(page, '.ssg-menu-panel'), menuTitle });
  await page.keyboard.press('Escape');
  await waitIdle(page);
  // C4: 幅の境界のドラッグは幅を変えるだけで、選択もメニューも変えない。
  const selBeforeResize = await selection(page);
  const widthBefore = (await header(page, 'category').boundingBox()).width;
  const resize = header(page, 'category').locator('.ssg-header-resize');
  const rb = await resize.boundingBox();
  await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
  await page.mouse.down();
  await page.mouse.move(rb.x + rb.width / 2 + 40, rb.y + rb.height / 2, { steps: 5 });
  await page.mouse.up();
  await waitIdle(page, 200);
  const widthAfter = (await header(page, 'category').boundingBox()).width;
  check('C4 幅の境界のドラッグ: 幅だけ変わり、選択とメニューは変わらない', Math.abs(widthAfter - widthBefore - 40) <= 2 && sameJson(await selection(page), selBeforeResize) && (await count(page, '.ssg-menu-panel')) === 0, {
    widthBefore,
    widthAfter,
    selection: await selection(page),
  });
  // C5: grip を押して離すだけ(動かさない)は、並び替えも選択の変更もしない。
  await clearEvents(page);
  const selBeforeGrip = await selection(page);
  await header(page, 'date').hover();
  const grip = await center(page, header(page, 'date').locator('.ssg-header-grip'));
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitIdle(page, 200);
  check('C5 grip を押して離すだけ: 並び替えず、選択も変えない', (await events(page, 'onColumnsChange')).length === 0 && sameJson(await selection(page), selBeforeGrip), {
    columnsChanges: (await events(page, 'onColumnsChange')).length,
    selection: await selection(page),
  });
  // C6: セルのダブルクリックは編集の開始。
  await cell(page, 4, 'name').dblclick();
  await waitIdle(page);
  check('C6 セルのダブルクリック: 編集を始める', await editorOpen(page));
  await page.keyboard.press('Escape');
  await waitIdle(page);

  // B1: 範囲選択のドラッグ中の Escape → 現状の挙動を記録(選択の解除が効く)。
  const from = await center(page, cell(page, 2, 'name'));
  const to = await center(page, cell(page, 5, 'price'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitIdle(page, 150);
  const selAfterDragEsc = await selection(page);
  check('B1 範囲選択のドラッグ中の Escape: 選択を解除する', selAfterDragEsc === null, selAfterDragEsc);

  // B2: 列ドラッグ中の Escape は取り消し(並び替えない)。現状はグリッドの Escape(選択の解除)にも届く
  //   (フィルハンドルは届かない = B3。揃えるなら意図した変更として期待値を直す)。
  await cell(page, 3, 'qty').click();
  const selBeforeColDrag = await selection(page);
  await clearEvents(page);
  await header(page, 'name').hover();
  const nameGrip = await center(page, header(page, 'name').locator('.ssg-header-grip'));
  const priceBox = await header(page, 'price').boundingBox();
  await page.mouse.move(nameGrip.x, nameGrip.y);
  await page.mouse.down();
  await page.mouse.move(nameGrip.x + 30, nameGrip.y, { steps: 5 });
  await page.mouse.move(priceBox.x + priceBox.width - 5, priceBox.y + 10, { steps: 8 });
  await waitIdle(page, 100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitIdle(page, 450);
  const orderAfter = await page.evaluate(() => [...document.querySelectorAll('.ssg-header-cell[data-ssg-col-key]')].map((e) => e.getAttribute('data-ssg-col-key')));
  check('B2 列ドラッグ中の Escape: 並び替えず、選択も解除される(現状)', selBeforeColDrag !== null && (await events(page, 'onColumnsChange')).length === 0 && orderAfter.indexOf('name') < orderAfter.indexOf('price') && (await selection(page)) === null, {
    columnsChanges: (await events(page, 'onColumnsChange')).length,
    orderAfter,
    selection: await selection(page),
  });

  // B3: フィルハンドルのドラッグ中の Escape は取り消し(書き込まず、選択は元の範囲のまま)。
  await page.evaluate(() => window.__setProps({ fillHandle: true }));
  await waitIdle(page, 150);
  await cell(page, 2, 'qty').click();
  const selBeforeFill = await selection(page);
  await clearEvents(page);
  const handle = await page.evaluate(() => {
    const el = document.querySelector('.ssg-fill-handle');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const candidates = [[cx, cy], [cx - 3, cy - 3], [cx - 3, cy], [cx, cy - 3]];
    return candidates.find(([x, y]) => document.elementFromPoint(x, y) === el) ?? null;
  });
  const fillTo = await center(page, cell(page, 6, 'qty'));
  if (handle) {
    await page.mouse.move(handle[0], handle[1]);
    await page.mouse.down();
    await page.mouse.move(fillTo.x, fillTo.y, { steps: 6 });
    await waitIdle(page, 80);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await waitIdle(page, 200);
  }
  check('B3 フィルハンドルのドラッグ中の Escape: 書き込まず、選択は元のまま', handle !== null && (await events(page, 'onRowsChange')).length === 0 && sameJson(await selection(page), selBeforeFill), {
    handle,
    rowsChanges: (await events(page, 'onRowsChange')).length,
    selBeforeFill,
    selection: await selection(page),
  });
  await page.evaluate(() => window.__setProps({ fillHandle: false }));

  check('basic: エラーなし', unexpectedPageErrors(pageErrors).length === 0 && (await page.evaluate(() => window.__errors.length)) === 0, [...pageErrors, ...(await page.evaluate(() => window.__errors))].slice(0, 5));
  await close();
}

// ---------- B4: 行ドラッグ ----------
{
  const { page, pageErrors, close } = await open('rowdrag', { query: 'n=50' });
  await cell(page, 4, 'name').click();
  const selBefore = await selection(page);
  await clearEvents(page);
  const handle = page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-drag-handle').first();
  const from = await center(page, handle);
  const to = await center(page, cell(page, 6, 'name'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 10, { steps: 3 });
  await page.mouse.move(from.x, to.y, { steps: 8 });
  await waitIdle(page, 100);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitIdle(page, 450);
  // 列ドラッグ(B2)と同じく、現状はグリッドの Escape(選択の解除)にも届く。
  check('B4 行ドラッグ中の Escape: 移動せず、選択も解除される(現状)', selBefore !== null && (await events(page, 'onRowMove')).length === 0 && (await page.evaluate(() => window.__rows()[1].id)) === 2 && (await selection(page)) === null, {
    rowMoves: (await events(page, 'onRowMove')).length,
    row1: await page.evaluate(() => window.__rows()[1].id),
    selBefore,
    selection: await selection(page),
  });
  check('rowdrag: エラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors.slice(0, 5));
  await close();
}

summary();