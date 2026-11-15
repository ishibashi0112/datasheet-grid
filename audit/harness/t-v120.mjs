// 1.2.0 の追加と修正を実ブラウザで: 範囲を埋める貼り付け(A-08 / pasteFillsSelection)・並びが変わってもアクティブセルを
//   行に付ける(B-04 / activeCellFollows)・末尾にいるか(isAtBottom / onScroll の atBottom)・右クリックメニューの名前
//   (RV3-H2)・背の高い行の上にそろえたセルの 1 行のエディタ(上ぞろえ)・行ドラッグの落とせる先(E-07 / canDropRow)・
//   タッチが主の端末の的の大きさ(L-12。Chromium の CDP のタッチの模擬だけ)。最後に、1.2.0 の見直し(QG / QH)の修正。
import { open, check, skip, unexpectedPageErrors, summary, cell, header, focusGrid, waitIdle, scrollTo, pasteText, SUPPORTS } from './pw.mjs';

// 表示の行 r の列 key の値(エクスポートの view の値)。
const viewValue = (page, r, key) =>
  page.evaluate(
    ({ r, key }) => {
      const data = window.__grid.getExportData({ scope: 'view' });
      const col = data.columns.findIndex((c) => c.key === key);
      return data.rows[r]?.[col]?.value;
    },
    { r, key },
  );
const viewIdAt = (page, r) => viewValue(page, r, 'id');

// ---------- 範囲を埋める貼り付け(A-08) ----------
{
  const { page, pageErrors, close } = await open('basic');
  const qty = await page.evaluate(() => window.__grid.getColIndex('qty'));
  const before = await Promise.all([0, 1, 2, 3, 4].map((r) => viewValue(page, r, 'qty')));
  await cell(page, 0, 'name').click();
  await focusGrid(page);
  await page.evaluate((c) => window.__grid.selectRange({ start: { row: 0, col: c }, end: { row: 3, col: c } }), qty);
  await pasteText(page, '7');
  const filled = await Promise.all([0, 1, 2, 3, 4].map((r) => viewValue(page, r, 'qty')));
  check('A-08: 1 セルのコピーを 4 行の範囲へ貼ると範囲いっぱいに書く(範囲の外は変えない)', filled.slice(0, 4).every((v) => v === 7) && filled[4] === before[4], { before, filled });
  await page.keyboard.press('Control+z');
  await waitIdle(page, 150);
  const undone = await Promise.all([0, 1, 2, 3, 4].map((r) => viewValue(page, r, 'qty')));
  check('A-08: 元に戻す 1 回で貼る前へ', JSON.stringify(undone) === JSON.stringify(before), { before, undone });
  // 2 行のコピーを 4 行へ = 繰り返す。
  await page.evaluate((c) => window.__grid.selectRange({ start: { row: 0, col: c }, end: { row: 3, col: c } }), qty);
  await pasteText(page, '11\r\n22');
  const repeated = await Promise.all([0, 1, 2, 3].map((r) => viewValue(page, r, 'qty')));
  check('A-08: 2 行のコピーを 4 行の範囲へ貼ると繰り返す', JSON.stringify(repeated) === JSON.stringify([11, 22, 11, 22]), repeated);
  await page.keyboard.press('Control+z');
  await waitIdle(page, 150);
  // pasteFillsSelection={false} は 1.1 と同じく左上から 1 回だけ。
  await page.evaluate(() => window.__setProps({ pasteFillsSelection: false }));
  await waitIdle(page, 150);
  await page.evaluate((c) => window.__grid.selectRange({ start: { row: 0, col: c }, end: { row: 3, col: c } }), qty);
  await pasteText(page, '9');
  const once = await Promise.all([0, 1, 2, 3].map((r) => viewValue(page, r, 'qty')));
  check('A-08: pasteFillsSelection={false} は左上の 1 セルだけ', once[0] === 9 && once.slice(1).every((v, i) => v === before[i + 1]), { before, once });
  check('A-08: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 並びが変わってもアクティブセルを行に付ける(B-04) ----------
for (const mode of ['position', 'row']) {
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate((mode) => {
    window.__acc = [];
    window.__setProps({ activeCellFollows: mode, onActiveCellChange: (c) => window.__acc.push(c && c.rowKey) });
    window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  }, mode);
  await waitIdle(page, 300);
  await cell(page, 2, 'qty').click();
  await waitIdle(page, 150);
  const id = await viewIdAt(page, 2);
  await page.evaluate(() => (window.__acc = []));
  const top0 = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
  // その行の数量を最小へ(一番下へ動く)。
  await page.evaluate((id) => window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -1000 } : row))), id);
  await waitIdle(page, 300);
  const after = await page.evaluate(() => ({
    active: window.__grid.getActiveCell(),
    acc: window.__acc,
    top: document.querySelector('.ssg-scroll-container').scrollTop,
  }));
  const idNow = await viewIdAt(page, after.active.row);
  if (mode === 'position') {
    check("B-04: 既定の 'position' は表示位置に残り、onActiveCellChange が呼ばれる", after.active.row === 2 && idNow !== id && after.acc.length === 1, { id, idNow, after });
  } else {
    // 数量が空の行は昇順・降順とも末尾なので、-1000 の行はその手前(画面の外)へ動く。
    check("B-04: 'row' は押した行に付いていく(画面の外の下の方へ)", idNow === id && after.active.row > 20, { id, idNow, after });
    check("B-04: 'row' は表をスクロールせず、位置だけ動いたときは onActiveCellChange を呼ばない", after.top === top0 && after.acc.length === 0, { top0, after });
    // 矢印キーでそのセルまで動く(見える所へスクロールする)。
    await focusGrid(page);
    await page.keyboard.press('ArrowUp');
    await waitIdle(page, 300);
    const moved = await page.evaluate(() => ({ active: window.__grid.getActiveCell(), top: document.querySelector('.ssg-scroll-container').scrollTop, acc: window.__acc }));
    check("B-04: 'row' で画面の外へ動いた後、矢印キーでそのセルまでスクロールし通知する", moved.active.row === after.active.row - 1 && moved.top > top0 && moved.acc.length === 1, moved);
  }
  check(`B-04(${mode}): 予期しないページエラーなし`, unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 末尾にいるか(isAtBottom / onScroll の atBottom) ----------
for (const scenario of ['basic', 'big']) {
  const { page, pageErrors, close } = await open(scenario);
  await page.evaluate(() => {
    window.__scrollEvents = [];
    window.__setProps({ onScroll: (p) => window.__scrollEvents.push(p) });
  });
  await waitIdle(page, 200);
  const atTop = await page.evaluate(() => window.__grid.isAtBottom());
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 500);
  const bottom = await page.evaluate(() => ({ at: window.__grid.isAtBottom(), last: window.__scrollEvents.at(-1)?.atBottom }));
  const sc = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  await page.mouse.wheel(0, -200);
  await waitIdle(page, 500);
  const up = await page.evaluate(() => ({ at: window.__grid.isAtBottom(), last: window.__scrollEvents.at(-1) }));
  check(`isAtBottom(${scenario}): 先頭は false、scrollToBottom の後は true(onScroll の atBottom も)`, atTop === false && bottom.at === true && bottom.last === true, { atTop, bottom });
  check(`isAtBottom(${scenario}): ホイールで上へ戻すと false(onScroll の source は user)`, up.at === false && up.last?.atBottom === false && up.last?.source === 'user', up);
  check(`isAtBottom(${scenario}): 予期しないページエラーなし`, unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 右クリックメニューの名前(RV3-H2) ----------
{
  const { page, pageErrors, close } = await open('basic');
  await cell(page, 1, 'name').click({ button: 'right' });
  await waitIdle(page, 250);
  const cellMenu = await page.evaluate(() => document.querySelector('.ssg-menu-panel[role="menu"]')?.getAttribute('aria-label') ?? null);
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
  await page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-header-cell').first().click({ button: 'right' });
  await waitIdle(page, 250);
  const rowMenu = await page.evaluate(() => document.querySelector('.ssg-menu-panel[role="menu"]')?.getAttribute('aria-label') ?? null);
  await page.keyboard.press('Escape');
  check('RV3-H2: 右クリックメニューの名前はセルで「セルのメニュー」、行番号で「行のメニュー」', cellMenu === 'セルのメニュー' && rowMenu === '行のメニュー', { cellMenu, rowMenu });
  check('RV3-H2: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 背の高い行の上にそろえたセルの 1 行のエディタ ----------
{
  const { page, pageErrors, close } = await open('autoheight');
  await page.evaluate(() => window.__setProps({ verticalAlign: 'top' }));
  await waitIdle(page, 500);
  const target = await page.evaluate(() => {
    for (const r of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
      if (r.getBoundingClientRect().height > 70) return Number(r.getAttribute('data-row-index'));
    }
    return null;
  });
  const results = [];
  for (const key of ['name', 'qty', 'date', 'category']) {
    const c = page.locator(`.ssg-center-pane .ssg-body-row[data-row-index="${target}"] .ssg-body-cell[data-ssg-col-key="${key}"]`).first();
    if ((await c.count()) === 0) continue;
    await c.click();
    await waitIdle(page, 200);
    const textTop = await c.evaluate((el) => {
      const value = el.querySelector('.ssg-cell-value') ?? el.firstElementChild;
      return value ? value.getBoundingClientRect().top : null;
    });
    await page.keyboard.press('F2');
    await waitIdle(page, 300);
    const editor = await page.evaluate(() => {
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement)) return null;
      const r = input.getBoundingClientRect();
      const cs = getComputedStyle(input);
      return { top: r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop), height: r.height, lineHeight: cs.lineHeight };
    });
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);
    results.push({ key, textTop, editor });
  }
  // 入力欄の文字の行の上端(枠 + 上の余白の下)がセルの文字の上端から数 px 以内(中央にあると 20px 以上ずれる)。
  const ok = target !== null && results.length >= 3 && results.every((r) => r.editor && r.textTop !== null && Math.abs(r.editor.top - r.textTop) <= 6);
  check('1 行のエディタ: 背の高い行の上にそろえたセルでは、エディタの文字の行がセルの 1 行目に出る(text / number / date / select)', ok, { target, results });
  check('1 行のエディタ: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 行ドラッグの落とせる先(E-07 / canDropRow) ----------
{
  const { page, pageErrors, close } = await open('basic');
  // 先頭の 2 行より上へは落とせない。
  await page.evaluate(() => window.__setProps({ enableRowDrag: true, canDropRow: ({ toIndex }) => toIndex >= 2 }));
  await waitIdle(page, 250);
  const ids0 = await Promise.all([0, 1, 2, 3, 4].map((r) => viewIdAt(page, r)));
  const drag = async (fromRow, dy) => {
    const handle = page.locator(`.ssg-body-row[data-row-index="${fromRow}"] .ssg-row-drag-handle`).first();
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + dy, { steps: 8 });
    await waitIdle(page, 150);
    const guide = await page.evaluate(() => document.querySelector('[data-grid-drag-indicator], .ssg-row-drop-indicator, [data-ssg-row-drop-indicator]') !== null);
    await page.mouse.up();
    await waitIdle(page, 400);
    return guide;
  };
  // 4 行目を先頭へ(落とせない)。
  const rowH = await page.locator('.ssg-body-row[data-row-index="0"]').first().evaluate((el) => el.getBoundingClientRect().height);
  await drag(4, -4 * rowH - rowH / 3);
  const idsBlocked = await Promise.all([0, 1, 2, 3, 4].map((r) => viewIdAt(page, r)));
  check('E-07: canDropRow が false の位置(先頭)へは離しても動かない', JSON.stringify(idsBlocked) === JSON.stringify(ids0), { ids0, idsBlocked });
  // 4 行目を 3 行目の上(index 2)へ(落とせる)。
  await drag(4, -2 * rowH - rowH / 3);
  const idsMoved = await Promise.all([0, 1, 2, 3, 4].map((r) => viewIdAt(page, r)));
  check('E-07: canDropRow が true の位置へは動く', idsMoved[2] === ids0[4] && idsMoved[0] === ids0[0] && idsMoved[1] === ids0[1], { ids0, idsMoved });
  check('E-07: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- タッチが主の端末の的の大きさ(L-12) ----------
if (!SUPPORTS.cdp) {
  skip('L-12: タッチの端末の的の大きさ', 'CDP のタッチの模擬が要る(Chromium だけ)');
} else {
  const { page, pageErrors, close } = await open('basic');
  const menuItemHeight = async () => {
    await cell(page, 1, 'name').click({ button: 'right' });
    await waitIdle(page, 250);
    const h = await page.evaluate(() => {
      const item = document.querySelector('.ssg-menu-panel[role="menu"] [role="menuitem"]');
      return item ? item.getBoundingClientRect().height : null;
    });
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);
    return h;
  };
  const mouse = await menuItemHeight();
  const coarseBefore = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await waitIdle(page, 200);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false });
  const touch = await menuItemHeight();
  if (!coarse) {
    skip('L-12: タッチの端末の的の大きさ', `CDP のタッチの模擬で (pointer: coarse) にならない(前 ${coarseBefore})`);
  } else {
    check('L-12: マウスの端末ではメニューの項目は今までの高さ(44px 未満)、タッチが主の端末では 44px 以上', mouse !== null && mouse < 44 && touch !== null && touch >= 44, { mouse, touch });
  }
  check('L-12: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}


// ---------- 1.2.0 の見直し(QG / QH)の修正 ----------
// CDP のタッチの模擬で (pointer: coarse) にする(Chromium だけ)。なれば true。
const emulateTouch = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await waitIdle(page, 150);
  return page.evaluate(() => matchMedia('(pointer: coarse)').matches);
};

// QG-1 / QG-4: 'row' の全選択と、列幅のドラッグ中の並びの変化。
{
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => {
    window.__setProps({ activeCellFollows: 'row' });
    window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  });
  await waitIdle(page, 300);
  await cell(page, 1, 'qty').click();
  await focusGrid(page);
  await page.keyboard.press('Control+a');
  await waitIdle(page, 150);
  const before = await page.evaluate(() => ({ sel: window.__grid.getSelection(), active: window.__grid.getActiveCell() }));
  const id = await viewIdAt(page, before.active.row);
  await page.evaluate((id) => window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -1000 } : row))), id);
  await waitIdle(page, 300);
  const after = await page.evaluate(() => ({ sel: window.__grid.getSelection(), active: window.__grid.getActiveCell() }));
  const idNow = await viewIdAt(page, after.active.row);
  check("QG-1: 'row' で全選択(Ctrl+A)は並びが変わっても全選択のまま、アクティブセルは行に付いていく", JSON.stringify(after.sel) === JSON.stringify(before.sel) && before.sel?.type === 'cell' && idNow === id && after.active.row !== before.active.row, { before, after, id, idNow });

  // 列幅のドラッグの間に並びが変わっても、離した後は押した行を指す。
  await cell(page, 2, 'qty').click();
  await waitIdle(page, 150);
  const id2 = await viewIdAt(page, 2);
  const handle = header(page, 'name').locator('.ssg-header-resize');
  const hb = await handle.boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2 + 30, hb.y + hb.height / 2, { steps: 5 });
  await page.evaluate((id) => window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -2000 } : row))), id2);
  await waitIdle(page, 200);
  await page.mouse.move(hb.x + hb.width / 2 + 40, hb.y + hb.height / 2, { steps: 2 });
  await page.mouse.up();
  await waitIdle(page, 300);
  const afterResize = await page.evaluate(() => window.__grid.getActiveCell());
  const id2Now = await viewIdAt(page, afterResize.row);
  check("QG-4: 'row' で列幅をドラッグしている間に並びが変わっても、押した行に付いていく", id2Now === id2, { id2, id2Now, afterResize });
  check('QG-1 / QG-4: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// QH-6: 下の固定行がある表で、見えている最後の行のエラーの吹き出しは固定行の下に隠れない。
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=40' });
  await page.evaluate(() => {
    const base = window.__rows()[0];
    window.__setProps({ pinnedBottomRows: [{ ...base, id: -101, name: '下1' }, { ...base, id: -102, name: '下2' }], totalRow: true });
  });
  await waitIdle(page, 400);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 400);
  const last = await page.evaluate(() => {
    const bottom = document.querySelector('.ssg-center-pane .ssg-pinned-rows--bottom').getBoundingClientRect().top;
    let best = null;
    for (const r of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
      const b = r.getBoundingClientRect();
      if (b.bottom <= bottom + 1 && (best === null || b.bottom > best.bottom)) best = { index: Number(r.getAttribute('data-row-index')), bottom: b.bottom };
    }
    return { pinnedTop: bottom, row: best?.index ?? null };
  });
  await cell(page, last.row, 'qty').dblclick();
  await waitIdle(page, 200);
  await page.keyboard.press('Control+a');
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await waitIdle(page, 300);
  const bubble = await page.evaluate(() => {
    const el = document.querySelector('.ssg-cell-editor-error');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom };
  });
  check('QH-6: 下の固定行の上の行のエラーの吹き出しは固定行に重ならない(上へ出す)', bubble !== null && bubble.bottom <= last.pinnedTop + 1, { last, bubble });
  await page.keyboard.press('Escape');
  check('QH-6: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

if (!SUPPORTS.cdp) {
  skip('QH-1〜5 / QH-3 / QH-7: タッチの端末 / IME の変換', 'CDP のタッチ / IME の模擬が要る(Chromium だけ)');
} else {
  // QH-2: タッチでは右クリックメニューを描いた後の高さで置き直し、画面の外へ出さない。
  {
    const { page, pageErrors, close } = await open('basic', { viewport: { width: 1280, height: 600 } });
    await page.evaluate(() =>
      window.__setProps({
        getContextMenuItems: () => Array.from({ length: 8 }, (_, i) => ({ label: `項目 ${i + 1}`, onSelect: () => {} })),
      }),
    );
    await waitIdle(page, 200);
    const coarse = await emulateTouch(page);
    const target = await page.evaluate(() => {
      for (const r of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
        const b = r.getBoundingClientRect();
        if (b.top <= 303 && b.bottom >= 303) return Number(r.getAttribute('data-row-index'));
      }
      return null;
    });
    const box = await cell(page, target, 'name').boundingBox();
    await page.mouse.click(box.x + 20, 303, { button: 'right' });
    await waitIdle(page, 300);
    const menu = await page.evaluate(() => {
      const p = document.querySelector('.ssg-menu-panel[role="menu"]');
      if (!p) return null;
      const r = p.getBoundingClientRect();
      const item = p.querySelector('[role="menuitem"]').getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, item: item.height, inner: innerHeight };
    });
    check('QH-2: タッチ(項目 44px)の 8 項目の右クリックメニューは画面の中に収まる', coarse && menu !== null && menu.item >= 44 && menu.top >= 0 && menu.bottom <= menu.inner, { coarse, menu });
    await page.keyboard.press('Escape');
    check('QH-2: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
    await close();
  }

  // QH-1 / QH-4 / QH-5: タッチの select の候補・右寄せの見出しの ⋮・列フィルターとツールパネルの的。
  {
    const { page, pageErrors, close } = await open('basic');
    const coarse = await emulateTouch(page);
    await cell(page, 1, 'category').click();
    await page.keyboard.press('F2');
    await waitIdle(page, 300);
    const list = await page.evaluate(() => {
      const el = document.querySelector('.ssg-select-editor-popover');
      return el ? { scroll: el.scrollHeight, client: el.clientHeight, options: el.querySelectorAll('[role="option"]').length } : null;
    });
    check('QH-1: タッチの select の候補(44px)は一覧の高さに収まる(スクロールが要らない)', coarse && list !== null && list.options <= 8 && list.scroll <= list.client + 1, { coarse, list });
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);

    // 右寄せの見出し(数量)のつまみ(grip)の左端は ⋮ の押せる範囲に食われない(見出しに乗せて操作を出す)。
    await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'qty' ? { ...c, width: 200 } : c))));
    await waitIdle(page, 200);
    await header(page, 'qty').hover();
    await waitIdle(page, 300);
    const grip = await page.evaluate(() => {
      const h = document.querySelector('.ssg-header-cell[data-ssg-col-key="qty"]');
      const g = h?.querySelector('.ssg-header-grip');
      const b = h?.querySelector('.ssg-header-actions .ssg-icon-btn');
      if (!g || !b) return null;
      const gr = g.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const hit = (x) => document.elementFromPoint(x, gr.top + gr.height / 2);
      return {
        gripRightOfMenu: gr.left >= br.right - 1,
        atGripLeft: hit(gr.left + 1)?.closest('.ssg-header-grip') !== null,
        atMenu: hit(br.left + br.width / 2)?.closest('.ssg-icon-btn') !== null,
        visible: getComputedStyle(g).visibility !== 'hidden' && gr.width > 0,
      };
    });
    if (grip === null || !grip.visible || !grip.gripRightOfMenu) {
      skip('QH-4: 右寄せの見出しの ⋮ とつまみ', `見出しの操作が出ていない(${JSON.stringify(grip)})`);
    } else {
      check('QH-4: 右寄せの見出しで、つまみの左端はつまみ、⋮ は ⋮', grip.atGripLeft && grip.atMenu, grip);
    }

    // 日付の列(dateSet)のフィルター: 節の「クリア」・プリセット・ツリーの開閉・カレンダーのボタン。
    await header(page, 'date').locator('.ssg-header-actions .ssg-icon-btn').click();
    await waitIdle(page, 300);
    await page.locator('.ssg-menu-panel [role="menuitem"]').filter({ hasText: 'フィルター' }).first().click();
    await page.waitForSelector('.ssg-filter-popover');
    await waitIdle(page, 400);
    const sizes = await page.evaluate(() => {
      const min = (sel, dim) => {
        const els = [...document.querySelectorAll(`.ssg-filter-popover ${sel}`)];
        return els.length === 0 ? null : Math.min(...els.map((el) => el.getBoundingClientRect()[dim]));
      };
      return {
        secClear: min('.ssg-filter-sec-clear', 'height'),
        chip: min('.ssg-filter-preset-chip', 'height'),
        treeToggle: min('.ssg-filter-tree-toggle', 'width'),
        calBtn: min('.ssg-dp-cal-btn', 'width'),
      };
    });
    const present = Object.values(sizes).filter((v) => v !== null).length;
    check('QH-5: タッチの列フィルターの節の「クリア」・プリセット 32px 以上、ツリーの開閉 32px 以上、カレンダーのボタン 40px 以上', coarse && present >= 3 && (sizes.secClear ?? 99) >= 32 && (sizes.chip ?? 99) >= 32 && (sizes.treeToggle ?? 99) >= 32 && (sizes.calBtn ?? 99) >= 40, { coarse, sizes });
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);
    // ツールパネルの「列」のタブの表示の切り替え。
    await page.evaluate(() => window.__grid.openFilterManager());
    await page.waitForSelector('.ssg-toolpanel', { timeout: 5000 }).catch(() => {});
    await page.locator('.ssg-toolpanel [role="tab"][id$="-tab-columns"]').first().click().catch(() => {});
    await waitIdle(page, 300);
    const toggle = await page.evaluate(() => {
      const els = [...document.querySelectorAll('.ssg-toolpanel .ssg-chooser-toggle')];
      return els.length === 0 ? null : Math.min(...els.map((el) => el.getBoundingClientRect().height));
    });
    check('QH-5: タッチのツールパネルの列の表示の切り替えは 40px 以上', coarse && toggle !== null && toggle >= 40, { coarse, toggle });
    check('QH-1 / QH-4 / QH-5: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
    await close();
  }

  // QH-3 / QH-7: IME の変換中の入力受けは、上が見出しに隠れたセルでは見えている所に、拡大縮小の中ではセルと同じ位置と大きさ。
  {
    const { page, pageErrors, close } = await open('autoheight');
    await page.evaluate(() => window.__setProps({ verticalAlign: 'top', imeDirectInput: true }));
    await waitIdle(page, 500);
    const cdp = await page.context().newCDPSession(page);
    const target = await page.evaluate(() => {
      for (const r of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
        const i = Number(r.getAttribute('data-row-index'));
        if (i > 2 && r.getBoundingClientRect().height > 90) return i;
      }
      return null;
    });
    await cell(page, target, 'name').click();
    await waitIdle(page, 200);
    // セルの上を見出しの下へ 30px 隠す。
    const pos = await page.evaluate((ri) => {
      const sc = document.querySelector('.ssg-scroll-container');
      const head = document.querySelector('.ssg-center-pane .ssg-header-row').getBoundingClientRect().bottom;
      const c = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"] .ssg-body-cell[data-ssg-col-key="name"]`).getBoundingClientRect();
      return { scrollTop: sc.scrollTop + (c.top - head) + 30 };
    }, target);
    await scrollTo(page, pos.scrollTop);
    await waitIdle(page, 300);
    await cdp.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
    await waitIdle(page, 200);
    const hidden = await page.evaluate((ri) => {
      const ime = document.querySelector('[data-ssg-ime-input]').getBoundingClientRect();
      const head = document.querySelector('.ssg-center-pane .ssg-header-row').getBoundingClientRect().bottom;
      const c = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"] .ssg-body-cell[data-ssg-col-key="name"]`).getBoundingClientRect();
      return { imeTop: ime.top, imeBottom: ime.bottom, head, cellTop: c.top, cellBottom: c.bottom };
    }, target);
    check('QH-3: 上が見出しに隠れたセルでは、変換中の入力受けを見えている所(見出しの下)から出す', hidden.cellTop < hidden.head && hidden.imeTop >= hidden.head - 1 && Math.abs(hidden.imeBottom - hidden.cellBottom) <= 1, hidden);
    await cdp.send('Input.insertText', { text: '' });
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);
    await close();

    // 拡大縮小(0.8)の中。
    const scaled = await open('basic', { query: 'n=50' });
    await scaled.page.evaluate(() => {
      const root = document.querySelector('.ssg-root');
      root.style.transform = 'scale(0.8)';
      root.style.transformOrigin = '0 0';
      window.__setProps({ imeDirectInput: true });
    });
    await waitIdle(scaled.page, 300);
    const cdp2 = await scaled.page.context().newCDPSession(scaled.page);
    await cell(scaled.page, 3, 'name').click();
    await waitIdle(scaled.page, 200);
    await cdp2.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
    await waitIdle(scaled.page, 200);
    const geo = await scaled.page.evaluate(() => {
      const a = document.querySelector('[data-ssg-ime-input]').getBoundingClientRect();
      const b = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="3"] .ssg-body-cell[data-ssg-col-key="name"]').getBoundingClientRect();
      return { dx: Math.abs(a.left - b.left), dy: Math.abs(a.top - b.top), dw: Math.abs(a.width - b.width), dh: Math.abs(a.height - b.height) };
    });
    check('QH-7: 拡大縮小(0.8)の中でも、変換中の入力受けはセルと同じ位置と大きさ', geo.dx <= 1.5 && geo.dy <= 1.5 && geo.dw <= 1.5 && geo.dh <= 1.5, geo);
    await cdp2.send('Input.insertText', { text: '' });
    check('QH-3 / QH-7: 予期しないページエラーなし', unexpectedPageErrors([...pageErrors, ...scaled.pageErrors]).length === 0, unexpectedPageErrors([...pageErrors, ...scaled.pageErrors]));
    await scaled.close();
  }
}

// ---------- 1.2.0 の確かめ直し ----------
// H(QG-3 の残り): 中央の列 → 左固定の列 の階層でグループ化し、ほかの列を見出しのドラッグで並べ替えても階層は変わらない。
{
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => {
    const cols = window.__columns().map((c) =>
      c.key === 'category' || c.key === 'status' ? { ...c, rowGroup: true } : c.key === 'active' ? { ...c, rowGroup: true, pinned: 'left' } : c,
    );
    // 階層は 区分 → 状態 → 有効(左固定)。
    const order = ['id', 'name', 'qty', 'price', 'category', 'status', 'active', 'date', 'note', 'score', 'custom', 'secret'];
    window.__setColumns(order.map((key) => cols.find((c) => c.key === key)).filter(Boolean).concat(cols.filter((c) => !order.includes(c.key))));
  });
  await waitIdle(page, 400);
  const groupKeys = () => page.evaluate(() => window.__columns().filter((c) => c.rowGroup === true).map((c) => c.key));
  const before = await groupKeys();
  if (await page.evaluate(() => matchMedia('(hover: none)').matches)) {
    await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'price' ? { ...c, width: 130 } : c))));
    await waitIdle(page, 200);
  }
  await header(page, 'price').hover();
  await waitIdle(page, 100);
  const gb = await header(page, 'price').locator('.ssg-header-grip').boundingBox();
  const target = await header(page, 'name').boundingBox();
  await page.mouse.move(gb.x + 3, gb.y + 5);
  await page.mouse.down();
  await page.mouse.move(gb.x - 20, gb.y + 5, { steps: 5 });
  await page.mouse.move(target.x + 5, target.y + 10, { steps: 12 });
  await waitIdle(page, 300);
  await page.mouse.up();
  await waitIdle(page, 600);
  const after = await groupKeys();
  const moved = await page.evaluate(() => window.__columns().filter((c) => c.rowGroup !== true).map((c) => c.key));
  check(
    'H(QG-3): 見出しのドラッグで列を並べ替えても、ペインをまたいだグループ化の階層(区分 → 状態 → 有効(左固定))は変わらない',
    JSON.stringify(before) === JSON.stringify(['category', 'status', 'active']) &&
      JSON.stringify(after) === JSON.stringify(before) &&
      moved.indexOf('price') >= 0 && moved.indexOf('price') < moved.indexOf('name'),
    { before, after, moved },
  );
  check('H(QG-3): 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}
// B(B-04 の残り): 'row' で、アクティブセルの行は動かず範囲の中のほかの行だけが入れ替わったら、範囲を外して 1 セルにする。
{
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => {
    window.__setProps({ activeCellFollows: 'row' });
    window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  });
  await waitIdle(page, 300);
  await cell(page, 1, 'qty').click();
  await waitIdle(page, 150);
  const qty = await page.evaluate(() => window.__grid.getColIndex('qty'));
  await page.evaluate((c) => window.__grid.selectRange({ start: { row: 1, col: c }, end: { row: 3, col: c } }), qty);
  await waitIdle(page, 150);
  const before = await page.evaluate(() => ({ sel: window.__grid.getSelection(), active: window.__grid.getActiveCell() }));
  const id1 = await viewIdAt(page, 1);
  const id2 = await viewIdAt(page, 2);
  // 範囲の中の 2 行目(表示の 2)を一番下の方へ。アクティブセルの行(表示の 1)は動かない。
  await page.evaluate((id) => window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -1000 } : row))), id2);
  await waitIdle(page, 300);
  const after = await page.evaluate(() => ({ sel: window.__grid.getSelection(), active: window.__grid.getActiveCell() }));
  const idActive = await viewIdAt(page, after.active.row);
  const single = JSON.stringify(after.sel?.range ?? after.sel) === JSON.stringify({ start: after.active, end: after.active });
  check(
    "B(B-04): 'row' で範囲の中のほかの行だけが入れ替わったら、範囲を外してアクティブセルの 1 セルにする(アクティブセルの行はそのまま)",
    idActive === id1 && after.active.row === 1 && single,
    { before, after, id1, idActive },
  );
  check('B(B-04): 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// C-N1 / C-N2: 背の高い行の上にそろえたセルで、上が固定したラベル行の帯(と見出し)の下に隠れたまま編集を始めても、1 行の
//   エディタの文字と IME の変換中の入力受けは見えている所(帯の下)に出る。
{
  const { page, pageErrors, close } = await open('label', { query: 'n=200' });
  await page.evaluate(() => {
    const src = window.__rows();
    const out = [];
    for (let i = 0; i < src.length; i += 1) {
      if (i % 20 === 0) out.push({ ...src[i], id: 100000 + i, isLabel: true, label: `セクション ${i / 20 + 1}`, name: 'LABEL', qty: 999999 });
      // 備考を長くして、auto-height で行を背の高い行にする。
      out.push({ ...src[i], note: 'ながい備考の文章です。'.repeat(6) });
    }
    window.__setRows(out);
    window.__setColumns(window.__columns().map((c) => (c.key === 'note' ? { ...c, autoHeight: true, width: 160 } : c)));
    window.__setProps({ autoHeight: true, verticalAlign: 'top', imeDirectInput: true });
  });
  await waitIdle(page, 400);
  await scrollTo(page, 600);
  await waitIdle(page, 300);
  // 帯のすぐ下にある本体の行を選び、その上を帯の下へ 30px 隠す。
  const pick = await page.evaluate(() => {
    const band = document.querySelector('.ssg-center-pane [data-ssg-sticky-label]')?.getBoundingClientRect().bottom ?? null;
    if (band === null) return null;
    for (const r of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
      const rect = r.getBoundingClientRect();
      if (rect.top >= band && rect.height > 90 && r.querySelector('.ssg-body-cell[data-ssg-col-key="name"]')) {
        return { row: Number(r.getAttribute('data-row-index')), delta: rect.top - (band - 30) };
      }
    }
    return null;
  });
  if (pick === null) {
    check('C-N1: 帯のすぐ下の背の高い行が見つかる', false, pick);
  } else {
    // 見えているうちに押してアクティブセルにしてから、上を帯の下へ隠す(押すと見える所へスクロールするため)。
    await page.locator(`.ssg-center-pane .ssg-body-row[data-row-index="${pick.row}"] .ssg-body-cell[data-ssg-col-key="name"]`).first().click();
    await waitIdle(page, 200);
    await page.evaluate((ri) => {
      const band = document.querySelector('.ssg-center-pane [data-ssg-sticky-label]').getBoundingClientRect().bottom;
      const c = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"] .ssg-body-cell[data-ssg-col-key="name"]`).getBoundingClientRect();
      document.querySelector('.ssg-scroll-container').scrollTop += c.top - (band - 30);
    }, pick.row);
    await waitIdle(page, 300);
    await page.keyboard.press('F2');
    await waitIdle(page, 300);
    const edit = await page.evaluate((ri) => {
      const band = document.querySelector('.ssg-center-pane [data-ssg-sticky-label]').getBoundingClientRect().bottom;
      const c = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"] .ssg-body-cell[data-ssg-col-key="name"]`).getBoundingClientRect();
      const input = document.activeElement;
      if (!(input instanceof HTMLInputElement)) return { band, cellTop: c.top, cellBottom: c.bottom, text: null };
      const r = input.getBoundingClientRect();
      const cs = getComputedStyle(input);
      return { band, cellTop: c.top, cellBottom: c.bottom, text: r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop) };
    }, pick.row);
    check(
      'C-N1: 上が固定したラベル行の帯の下に隠れたセルでも、1 行のエディタの文字は帯の下(見えている所)に出る',
      edit.text !== null && edit.cellTop < edit.band - 20 && edit.text >= edit.band - 1 && edit.text + 16 <= edit.cellBottom,
      edit,
    );
    await page.keyboard.press('Escape');
    await waitIdle(page, 200);
    if (!SUPPORTS.cdp) {
      skip('C-N2: IME の変換中の入力受けは固定したラベル行の帯に重ならない', 'CDP の IME の模擬が要る(Chromium だけ)');
    } else {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Input.imeSetComposition', { text: 'かんじ', selectionStart: 3, selectionEnd: 3 });
      await waitIdle(page, 200);
      const ime = await page.evaluate(() => ({
        band: document.querySelector('.ssg-center-pane [data-ssg-sticky-label]').getBoundingClientRect().bottom,
        top: document.querySelector('[data-ssg-ime-input]').getBoundingClientRect().top,
      }));
      check('C-N2: IME の変換中の入力受けは固定したラベル行の帯に重ならない(帯の下から出す)', ime.top >= ime.band - 1, ime);
      await cdp.send('Input.insertText', { text: '' });
      await page.keyboard.press('Escape');
    }
  }
  check('C-N1 / C-N2: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// J: 編集中に並びが変わると、エディタ・アクティブセルと一緒に選択も付いていく(Escape の後に別の行をコピーしない)。
{
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }));
  await waitIdle(page, 300);
  await cell(page, 2, 'name').click();
  await waitIdle(page, 150);
  const id = await viewIdAt(page, 2);
  await page.keyboard.press('F2');
  await waitIdle(page, 200);
  await page.evaluate((id) => window.__setRows(window.__rows().map((row) => (row.id === id ? { ...row, qty: -1000 } : row))), id);
  await waitIdle(page, 300);
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
  const after = await page.evaluate(() => ({ sel: window.__grid.getSelection(), active: window.__grid.getActiveCell() }));
  const idNow = await viewIdAt(page, after.active.row);
  check(
    'J: 編集中に並びが変わると、アクティブセルと選択がそろって編集していた行に付いていく',
    idNow === id && JSON.stringify(after.sel?.range) === JSON.stringify({ start: after.active, end: after.active }),
    { id, idNow, after },
  );
  check('J: 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// K: 'row' で並べ替えの列を編集して確定すると、Tab は編集した行の右のセル、Enter は前の並びで下にあった行へ付いていく。
for (const key of ['Tab', 'Enter']) {
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => {
    window.__setProps({ activeCellFollows: 'row' });
    window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] });
  });
  await waitIdle(page, 300);
  await cell(page, 1, 'qty').click();
  await waitIdle(page, 150);
  const edited = await viewIdAt(page, 1);
  const below = await viewIdAt(page, 2);
  const qtyCol = await page.evaluate(() => window.__grid.getColIndex('qty'));
  await focusGrid(page);
  await page.keyboard.press('F2');
  await waitIdle(page, 200);
  await page.keyboard.press('Control+a');
  // 数量は検査で 0 以上(reject)なので 0 にする(一番下の方へ動く)。
  await page.keyboard.type('0');
  await page.keyboard.press(key);
  await waitIdle(page, 400);
  const qtyNow = await page.evaluate((id) => window.__rows().find((r) => r.id === id)?.qty, edited);
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  const idNow = await viewIdAt(page, active.row);
  const expected = key === 'Tab' ? edited : below;
  const colOk = key === 'Tab' ? active.col === qtyCol + 1 : active.col === qtyCol;
  check(`K: 'row' で並べ替えの列を編集して ${key} で確定すると、${key === 'Tab' ? '編集した行' : '前の並びで下にあった行'}に付いていく`, qtyNow === 0 && idNow === expected && colOk, { edited, below, idNow, active, qtyCol, qtyNow });
  check(`K(${key}): 予期しないページエラーなし`, unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

summary('t-v120');