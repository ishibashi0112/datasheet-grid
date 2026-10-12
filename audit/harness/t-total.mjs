// 合計行(totalRow): 実ブラウザでの値・下端固定・最終行が合計行に隠れないこと(スクロール / キーボード / API)・
//   横スクロールと固定列の揃い・列ドラッグ(live)・行が少ないとき・テーマ・100 万行(scroll-space 仮想化)・
//   auto-height / グルーピング / ラベル行 / SSRM との併用。
import { OUT, open, check, unexpectedPageErrors, summary, cell, header, focusGrid, waitIdle, scrollTo, renderedRowIndexes } from './pw.mjs';

// 中央ペインの合計行・指定行・ヘッダー・スクロールコンテナの見える範囲(px。ビューポート座標)。
const geo = (page, rowIndex) =>
  page.evaluate((ri) => {
    const sc = document.querySelector('.ssg-scroll-container');
    const r = sc.getBoundingClientRect();
    const total = document.querySelector('.ssg-total-row[data-pane="center"]')?.getBoundingClientRect();
    const head = document.querySelector('.ssg-center-pane .ssg-header-row')?.getBoundingClientRect();
    const row =
      ri === undefined
        ? undefined
        : document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"]`)?.getBoundingClientRect();
    return {
      visibleBottom: r.top + sc.clientTop + sc.clientHeight,
      totalTop: total?.top,
      totalBottom: total?.bottom,
      headerBottom: head?.bottom,
      rowTop: row?.top,
      rowBottom: row?.bottom,
      scrollTop: sc.scrollTop,
      maxScroll: sc.scrollHeight - sc.clientHeight,
    };
  }, rowIndex);
const near = (a, b, tol = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
// 行が合計行とヘッダーの間に丸ごと見えている。
const rowFullyVisible = (g) =>
  g.rowTop !== undefined && g.rowTop >= g.headerBottom - 1 && g.rowBottom <= g.totalTop + 1;
const totalCellText = (page, key) =>
  page.evaluate(
    (k) => document.querySelector(`.ssg-total-row .ssg-total-cell[data-ssg-col-key="${k}"]`)?.textContent ?? null,
    key,
  );
const digits = (text) => (text ?? '').replace(/[^0-9.-]/g, '');
// __rows から期待値(数値と数値の文字列だけ。ラベル行は除く)。
const expected = (page, key) =>
  page.evaluate((k) => {
    let sum = 0;
    let n = 0;
    for (const row of window.__rows()) {
      if (row.isLabel) continue;
      const v = row[k];
      const num = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
      if (Number.isFinite(num)) {
        sum += num;
        n += 1;
      }
    }
    return { sum, avg: n ? sum / n : undefined, n };
  }, key);
// formatter の無い列の数値は下部バーの集計と同じ書式(誤差を丸め、小数 4 桁まで、桁区切り)。ページのロケールで作る。
const fmtNumber = (page, v) =>
  page.evaluate((x) => (Math.round(x * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 }), v);

// ---------- 基本(500 行・左右固定列あり) ----------
{
  const { page, pageErrors, close } = await open('basic');
  const before = await geo(page);
  await page.evaluate(() => window.__setProps({ totalRow: true }));
  await waitIdle(page, 200);
  const panes = await page.evaluate(() => [...document.querySelectorAll('.ssg-total-row')].map((e) => e.getAttribute('data-pane')));
  check('total: 3 ペインそれぞれに合計行', JSON.stringify(panes) === JSON.stringify(['left', 'center', 'right']), panes);
  const qty = await expected(page, 'qty');
  const price = await expected(page, 'price');
  check('total: 数量 = 合計', digits(await totalCellText(page, 'qty')) === String(qty.sum), { text: await totalCellText(page, 'qty'), qty });
  const priceText = await totalCellText(page, 'price');
  const wantAvg = await fmtNumber(page, price.avg);
  check('total: 単価 = 平均(種類の見出し付き・下部バーと同じ書式)', priceText === `平均${wantAvg}`, { priceText, wantAvg });
  check('total: 見出しは左固定の先頭列(ID)', (await totalCellText(page, 'id')) === '合計', await totalCellText(page, 'id'));
  check('total: 集計の無い右固定列は空', (await totalCellText(page, 'status')) === '', await totalCellText(page, 'status'));
  const g0 = await geo(page, 0);
  check('total: 先頭で合計行が見える範囲の下端に付く', near(g0.totalBottom, g0.visibleBottom), g0);
  check('total: 合計行のぶんだけスクロール範囲が伸びる', near(g0.maxScroll - before.maxScroll, g0.totalBottom - g0.totalTop), { before: before.maxScroll, after: g0.maxScroll });
  await scrollTo(page, 3000);
  const gMid = await geo(page);
  check('total: 途中までスクロールしても下端に留まる', near(gMid.totalBottom, gMid.visibleBottom), gMid);
  // 最後までスクロール: 最終行は合計行のすぐ上
  await scrollTo(page, 1e9);
  await waitIdle(page, 150);
  const gEnd = await geo(page, 499);
  check('total: 最後までスクロールすると最終行は合計行のすぐ上', near(gEnd.rowBottom, gEnd.totalTop) && rowFullyVisible(gEnd), gEnd);
  // 先頭から最終行のセルを選んで見せる(selectCell + scrollIntoView)→ ↑ で 1 行戻っても見えたまま
  await scrollTo(page, 0);
  await cell(page, 0, 'qty').click();
  await focusGrid(page);
  await page.evaluate(() => window.__grid.selectCell(499, 2, { scrollIntoView: true }));
  await waitIdle(page, 250);
  const gSel = await geo(page, 499);
  check('total: 最終行を選んで見せると合計行に隠れない', rowFullyVisible(gSel), gSel);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 200);
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  const gKey = await geo(page, 499);
  check('total: 矢印キーで最終行へ戻っても合計行に隠れない', active?.row === 499 && rowFullyVisible(gKey), { active, gKey });
  // ArrowDown: 合計行の裏に来る行へ進んでも見える位置へスクロール
  await scrollTo(page, 0);
  await waitIdle(page, 100);
  const lastVisible = await page.evaluate(() => {
    const total = document.querySelector('.ssg-total-row[data-pane="center"]').getBoundingClientRect();
    let best = -1;
    for (const el of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
      if (el.getBoundingClientRect().bottom <= total.top + 0.5) best = Math.max(best, Number(el.getAttribute('data-row-index')));
    }
    return best;
  });
  await cell(page, lastVisible, 'qty').click();
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 200);
  const gDown = await geo(page, lastVisible + 1);
  check('total: ↓ で合計行の裏の行へ進むと見える位置までスクロール', gDown.scrollTop > 0 && rowFullyVisible(gDown), { lastVisible, gDown });
  // scrollToRow(align: 'end')
  await page.evaluate(() => window.__grid.scrollToRow(250, { align: 'end' }));
  await waitIdle(page, 200);
  const gEndAlign = await geo(page, 250);
  check("total: scrollToRow(align 'end') は合計行の上に揃える", near(gEndAlign.rowBottom, gEndAlign.totalTop), gEndAlign);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 200);
  const gBottom = await geo(page, 499);
  check('total: scrollToBottom で最終行が合計行のすぐ上', rowFullyVisible(gBottom) && near(gBottom.rowBottom, gBottom.totalTop), gBottom);
  // 横スクロール: 合計行のセルと見出しの x / 幅が揃う(中央 / 左右固定)
  await scrollTo(page, undefined, 260);
  await waitIdle(page, 150);
  const misaligned = await page.evaluate(() => {
    const out = [];
    for (const cellEl of document.querySelectorAll('.ssg-total-row .ssg-total-cell[data-ssg-col-key]')) {
      const key = cellEl.getAttribute('data-ssg-col-key');
      const head = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      if (!head) continue;
      const a = cellEl.getBoundingClientRect();
      const b = head.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 1 || Math.abs(a.width - b.width) > 1) out.push({ key, cell: [a.left, a.width], head: [b.left, b.width] });
    }
    return out;
  });
  check('total: 横スクロール中も合計行のセルが見出しと揃う(固定列含む)', misaligned.length === 0, misaligned);
  // 本体の行から合計行へポインタを移すと行ホバーが外れる
  {
    const t = await page.locator('.ssg-total-row[data-pane="center"]').boundingBox();
    await page.mouse.move(t.x + 300, t.y - 10);
    await waitIdle(page, 120);
    const onRow = await page.evaluate(() => document.querySelectorAll('.ssg-body-cell--row-hovered').length);
    await page.mouse.move(t.x + 300, t.y + 10, { steps: 4 });
    await waitIdle(page, 150);
    const onTotal = await page.evaluate(() => document.querySelectorAll('.ssg-body-cell--row-hovered').length);
    check('total: 行から合計行へ移ると行ホバーが外れる', onRow > 0 && onTotal === 0, { onRow, onTotal });
  }
  // 表示専用: 合計行を押してもアクティブセル / 選択は動かない
  await cell(page, 0, 'qty').click().catch(() => {});
  await page.evaluate(() => window.__grid.selectCell(495, 2));
  await waitIdle(page, 150);
  const beforeActive = await page.evaluate(() => window.__grid.getActiveCell());
  const priceCell = page.locator('.ssg-total-row[data-pane="center"] .ssg-total-cell[data-ssg-col-key="price"]');
  await priceCell.click();
  await priceCell.dblclick();
  await waitIdle(page, 150);
  const afterActive = await page.evaluate(() => window.__grid.getActiveCell());
  const editors = await page.locator('.ssg-editor, [role="group"][aria-label$="を編集"]').count();
  check('total: 合計行を押してもアクティブセルは動かず編集も始まらない', JSON.stringify(beforeActive) === JSON.stringify(afterActive) && editors === 0, { beforeActive, afterActive, editors });
  // フィルター → 見えている行だけで再計算
  await page.evaluate(() =>
    window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: { category: { kind: 'set', values: ['A'] } } }, sort: [] }),
  );
  await waitIdle(page, 250);
  const filteredSum = await page.evaluate(() =>
    window.__rows().filter((r) => r.category === 'A').reduce((s, r) => s + (typeof r.qty === 'number' ? r.qty : 0), 0),
  );
  check('total: フィルター後の行で再計算', digits(await totalCellText(page, 'qty')) === String(filteredSum), { text: await totalCellText(page, 'qty'), filteredSum });
  await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
  await waitIdle(page, 200);
  // 編集 → 再計算
  await scrollTo(page, 0, 0);
  await cell(page, 1, 'qty').click();
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await waitIdle(page, 250);
  const edited = await page.evaluate(() => window.__rows()[1].qty);
  const qty2 = await expected(page, 'qty');
  check('total: 編集で再計算', edited === 7 && digits(await totalCellText(page, 'qty')) === String(qty2.sum), { text: await totalCellText(page, 'qty'), qty2, edited });
  // ARIA
  const aria = await page.evaluate(() => ({
    rowcount: document.querySelector('.ssg-scroll-container').getAttribute('aria-rowcount'),
    rowindex: document.querySelector('.ssg-total-row[data-pane="center"]').getAttribute('aria-rowindex'),
  }));
  check('total: aria-rowcount に合計行を含み、合計行は最後の行', aria.rowcount === '502' && aria.rowindex === '502', aria);
  // スクリーンショット(ライト / ダーク)
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 200);
  await page.locator('.ssg-root').first().screenshot({ path: OUT + 'total-light.png' });
  await page.evaluate(() => window.__setProps({ theme: 'dark' }));
  await waitIdle(page, 200);
  const darkBg = await page.evaluate(() => ({
    row: getComputedStyle(document.querySelector('.ssg-total-row[data-pane="center"]')).backgroundColor,
    cell: getComputedStyle(document.querySelector('.ssg-total-row[data-pane="center"] .ssg-total-cell')).backgroundColor,
  }));
  check('total: ダークテーマの背景トークン(行 / セル)', darkBg.row === 'rgb(34, 36, 41)' && darkBg.cell === 'rgb(34, 36, 41)', darkBg);
  await page.locator('.ssg-root').first().screenshot({ path: OUT + 'total-dark.png' });
  await page.evaluate(() => window.__setProps({ theme: undefined }));
  // 行が少ない: 合計行は最後の行の直後
  await page.evaluate(() => window.__setRows(window.__makeRows(3)));
  await waitIdle(page, 250);
  const gFew = await geo(page, 2);
  check('total: 行が少ないときは最後の行の直後', near(gFew.totalTop, gFew.rowBottom) && gFew.maxScroll <= 0, gFew);
  await page.locator('.ssg-root').first().screenshot({ path: OUT + 'total-few.png' });
  // OFF に戻すと元のスクロール範囲 / 行数
  await page.evaluate(() => window.__setRows(window.__makeRows(500)));
  await page.evaluate(() => window.__setProps({ totalRow: undefined }));
  await waitIdle(page, 250);
  const off = await geo(page);
  const offCount = await page.locator('.ssg-total-row').count();
  check('total: OFF で合計行が消えスクロール範囲も戻る', offCount === 0 && near(off.maxScroll, before.maxScroll), { offCount, off: off.maxScroll, before: before.maxScroll });
  check('total: no page errors (basic)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 列ドラッグ(live)で合計行のセルも列に付いていく ----------
{
  const { page, pageErrors, close } = await open('basic');
  await page.evaluate(() => window.__setProps({ totalRow: true, columnDragMotion: 'live' }));
  await waitIdle(page, 200);
  const grip = header(page, 'qty').locator('.ssg-header-grip');
  const gb = await grip.boundingBox();
  const target = await header(page, 'category').boundingBox();
  await page.mouse.move(gb.x + 3, gb.y + 5);
  await page.mouse.down();
  await page.mouse.move(gb.x + 30, gb.y + 5, { steps: 5 });
  await page.mouse.move(target.x + target.width - 5, target.y + 10, { steps: 12 });
  await waitIdle(page, 300);
  // 退避した列(price)の合計行セルが見出しと同じ位置にいる
  const during = await page.evaluate(() => {
    const out = {};
    for (const key of ['price', 'category']) {
      const a = document.querySelector(`.ssg-total-row .ssg-total-cell[data-ssg-col-key="${key}"]`)?.getBoundingClientRect();
      const b = document.querySelector(`.ssg-center-pane .ssg-header-cell[data-ssg-col-key="${key}"]`)?.getBoundingClientRect();
      out[key] = a && b ? Math.round(a.left - b.left) : null;
    }
    return out;
  });
  check('total(live): ドラッグ中に退避した列の合計行セルも見出しと揃う', during.price === 0 && during.category === 0, during);
  await page.mouse.up();
  await waitIdle(page, 600);
  const order = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-header-cell[data-ssg-col-key]')].map((e) => e.getAttribute('data-ssg-col-key')));
  const after = await page.evaluate(() => {
    const out = [];
    for (const cellEl of document.querySelectorAll('.ssg-total-row .ssg-total-cell[data-ssg-col-key]')) {
      const key = cellEl.getAttribute('data-ssg-col-key');
      const head = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      const a = cellEl.getBoundingClientRect();
      const b = head.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 1) out.push(key);
    }
    return out;
  });
  check('total(live): ドロップ後も合計行のセルが見出しと揃う', order.indexOf('qty') > order.indexOf('price') && after.length === 0, { order, after });
  check('total(live): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 100 万行(scroll-space 仮想化) ----------
{
  const { page, pageErrors, close } = await open('big');
  const t0 = Date.now();
  await page.evaluate(() => window.__setProps({ totalRow: true }));
  await page.waitForSelector('.ssg-total-row');
  const toggleMs = Date.now() - t0;
  const qty = await expected(page, 'qty');
  check('total(big): 100 万行の合計', digits(await totalCellText(page, 'qty')) === String(qty.sum), { text: await totalCellText(page, 'qty'), qty });
  check('total(big): ON にしてから描画まで 3 秒以内(dev ビルド)', toggleMs < 3000, toggleMs);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 300);
  const idx = await renderedRowIndexes(page);
  const gEnd = await geo(page, 999_999);
  check('total(big): scrollToBottom で最終行が合計行のすぐ上', idx.at(-1) === 999_999 && rowFullyVisible(gEnd), { last: idx.at(-1), gEnd });
  await scrollTo(page, 1e12);
  await waitIdle(page, 300);
  const gMax = await geo(page, 999_999);
  check('total(big): 最大までスクロールしても最終行が合計行の上', rowFullyVisible(gMax), gMax);
  // 途中の位置から最終行のセルを選んで見せる / 合計行の裏に来る行へ ↓ で進む
  await page.evaluate(() => window.__grid.scrollToRow(500_000, { align: 'center' }));
  await waitIdle(page, 300);
  const mid = (await renderedRowIndexes(page))[10];
  await cell(page, mid, 'qty').click();
  await page.evaluate(() => window.__grid.selectCell(999_999, 2, { scrollIntoView: true }));
  await waitIdle(page, 400);
  const gSel = await geo(page, 999_999);
  check('total(big): 最終行を選んで見せると合計行に隠れない', rowFullyVisible(gSel), gSel);
  await page.evaluate(() => window.__grid.scrollToRow(500_000, { align: 'start' }));
  await waitIdle(page, 300);
  const lastAbove = await page.evaluate(() => {
    const total = document.querySelector('.ssg-total-row[data-pane="center"]').getBoundingClientRect();
    let best = -1;
    for (const el of document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')) {
      if (el.getBoundingClientRect().bottom <= total.top + 0.5) best = Math.max(best, Number(el.getAttribute('data-row-index')));
    }
    return best;
  });
  await cell(page, lastAbove, 'qty').click();
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 300);
  const gDown = await geo(page, lastAbove + 1);
  check('total(big): ↓ で合計行の裏の行へ進むと見える位置までスクロール', rowFullyVisible(gDown), { lastAbove, gDown });
  // 編集 → 再計算の時間
  await page.evaluate(() => window.__grid.scrollToTop());
  await waitIdle(page, 300);
  await cell(page, 0, 'qty').click();
  const prevText = await totalCellText(page, 'qty');
  const t1 = Date.now();
  await page.keyboard.type('1');
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (prev) => document.querySelector('.ssg-total-row .ssg-total-cell[data-ssg-col-key="qty"]')?.textContent !== prev,
    prevText,
    { timeout: 5000 },
  ).catch(() => {});
  const editMs = Date.now() - t1;
  const qty2 = await expected(page, 'qty');
  check('total(big): 編集後の再計算(dev ビルドで 3 秒以内)', digits(await totalCellText(page, 'qty')) === String(qty2.sum) && editMs < 3000, { editMs, text: await totalCellText(page, 'qty'), want: qty2.sum });
  // scrollHint(カスタムスクロールバー)のつまみが合計行に重ならない範囲で動く
  const hint = await page.evaluate(() => {
    const el = document.querySelector('.ssg-scroll-hint, [class*="ssg-scroll-hint"]');
    return el ? el.className : null;
  });
  check('total(big): scrollHint が出ている', hint !== null, hint);
  check('total(big): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- auto-height(行の高さを実測するモード) ----------
{
  const { page, pageErrors, close } = await open('autoheight');
  await page.evaluate(() => window.__setProps({ totalRow: true }));
  await waitIdle(page, 300);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 600);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 400);
  const idx = await renderedRowIndexes(page);
  const g = await geo(page, 2999);
  check('total(autoheight): scrollToBottom で最終行が合計行の上', idx.at(-1) === 2999 && rowFullyVisible(g), { last: idx.at(-1), g });
  check('total(autoheight): 合計行は下端', near(g.totalBottom, g.visibleBottom), g);
  check('total(autoheight): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- グルーピング(折りたたんだ行も数える) ----------
{
  const { page, pageErrors, close } = await open('grouping');
  await page.evaluate(() => window.__setProps({ totalRow: true }));
  await waitIdle(page, 250);
  const qty = await expected(page, 'qty');
  const open1 = digits(await totalCellText(page, 'qty'));
  await page.evaluate(() => window.__grid.collapseAllGroups());
  await waitIdle(page, 250);
  const closed = digits(await totalCellText(page, 'qty'));
  check('total(grouping): 開閉に関係なく全 leaf 行の合計', open1 === String(qty.sum) && closed === String(qty.sum), { open1, closed, want: qty.sum });
  const label = await page.evaluate(() => document.querySelector('.ssg-total-row .ssg-total-label')?.textContent ?? null);
  check('total(grouping): 見出しは先頭列(ID または自動グループ列)', label === '合計', label);
  check('total(grouping): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- ラベル行(数えない)+ 縦固定 ----------
{
  const { page, pageErrors, close } = await open('label');
  await page.evaluate(() => window.__setProps({ totalRow: true }));
  await waitIdle(page, 250);
  const qty = await expected(page, 'qty');
  check('total(label): ラベル行を除いた合計', digits(await totalCellText(page, 'qty')) === String(qty.sum), { text: await totalCellText(page, 'qty'), qty });
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 300);
  const g = await geo(page);
  check('total(label): 末尾で合計行は下端', near(g.totalBottom, g.visibleBottom), g);
  check('total(label): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- SSRM(values だけを出す) ----------
{
  const { page, pageErrors, close } = await open('ssrm');
  await waitIdle(page, 400);
  await page.evaluate(() => window.__setProps({ totalRow: { values: { qty: 123456, name: '全 件' } } }));
  await waitIdle(page, 300);
  check('total(ssrm): values の値を出す', digits(await totalCellText(page, 'qty')) === '123456', await totalCellText(page, 'qty'));
  check('total(ssrm): aggFunc だけの列は空(計算しない)', (await totalCellText(page, 'price')) === '', await totalCellText(page, 'price'));
  await page.evaluate(() => window.__grid.scrollToBottom());
  await page.waitForTimeout(800);
  const idx = await renderedRowIndexes(page);
  const last = idx.at(-1);
  const g = await geo(page, last);
  check('total(ssrm): 末尾の行が合計行の上', rowFullyVisible(g), { last, g });
  check('total(ssrm): no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();