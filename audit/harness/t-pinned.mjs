// 固定行(pinnedTopRows / pinnedBottomRows。1.1.0): 実ブラウザでの位置(列見出しの下 / 合計行の上に留まる)・本体の行が
//   固定行に隠れないこと(スクロール / キーボード / API)・本体の行が固定行の下を流れること・横スクロールと固定列の揃い・
//   表示専用(押しても選択が動かない・ホバーを外す)・範囲選択のドラッグで上へ自動スクロール・列ドラッグ(live)・
//   行が少ないとき・テーマ・エクスポート・100 万行(scroll-space 仮想化)・SSRM との併用。
import { OUT, open, check, unexpectedPageErrors, summary, cell, header, focusGrid, waitIdle, scrollTo } from './pw.mjs';

// 本体の先頭の行から作る固定行(id は本体と重ならない負値)。
//   上の固定行の数が変わると本体の行の縦位置(transform)が変わり、animateRows の行の transition で滑るので、終わるまで待つ。
const setPinned = async (page, { top = 1, bottom = 2, totalRow = true } = {}) => {
  await page.evaluate(
    ({ top, bottom, totalRow }) => {
      const base = window.__rows()[0] ?? { id: 0, name: '' };
      const make = (id, name) => ({ ...base, id, name });
      window.__setProps({
        pinnedTopRows: top > 0 ? Array.from({ length: top }, (_, i) => make(-1 - i, `上${i + 1}`)) : undefined,
        pinnedBottomRows: bottom > 0 ? Array.from({ length: bottom }, (_, i) => make(-101 - i, `下${i + 1}`)) : undefined,
        totalRow: totalRow || undefined,
      });
    },
    { top, bottom, totalRow },
  );
  await page.waitForTimeout(50);
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 3000 }).catch(() => {});
};

// 中央ペインの見出し / 上下の器 / 合計行 / 指定行 / スクロールコンテナ(px。ビューポート座標)。
const geo = (page, rowIndex) =>
  page.evaluate((ri) => {
    const sc = document.querySelector('.ssg-scroll-container');
    const r = sc.getBoundingClientRect();
    const q = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const head = q('.ssg-center-pane .ssg-header-row');
    const top = q('.ssg-center-pane .ssg-pinned-rows--top');
    const bottom = q('.ssg-center-pane .ssg-pinned-rows--bottom');
    const total = q('.ssg-total-row[data-pane="center"]');
    const row = ri === undefined ? undefined : q(`.ssg-center-pane .ssg-body-row[data-row-index="${ri}"]`);
    return {
      visibleTop: r.top + sc.clientTop,
      visibleBottom: r.top + sc.clientTop + sc.clientHeight,
      headerBottom: head?.bottom,
      topTop: top?.top,
      topBottom: top?.bottom,
      bottomTop: bottom?.top,
      bottomBottom: bottom?.bottom,
      totalTop: total?.top,
      totalBottom: total?.bottom,
      rowTop: row?.top,
      rowBottom: row?.bottom,
      scrollTop: sc.scrollTop,
      maxScroll: sc.scrollHeight - sc.clientHeight,
    };
  }, rowIndex);
const near = (a, b, tol = 1) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol;
// 行が上の固定行と下の固定行の間に丸ごと見えている。
const rowFullyVisible = (g) =>
  g.rowTop !== undefined && g.rowTop >= (g.topBottom ?? g.headerBottom) - 1 && g.rowBottom <= (g.bottomTop ?? g.totalTop ?? g.visibleBottom) + 1;

// ---------- 基本(500 行・左右固定列あり・合計行あり) ----------
{
  const { page, pageErrors, close } = await open('basic');
  const before = await geo(page);
  await setPinned(page);
  await waitIdle(page, 250);
  const panes = await page.evaluate(() =>
    [...document.querySelectorAll('.ssg-pinned-row')].map((e) => `${e.getAttribute('data-ssg-pinned')}:${e.getAttribute('data-pane')}`),
  );
  check(
    'pinned: 上 1 行 / 下 2 行を 3 ペインに描く',
    JSON.stringify(panes) === JSON.stringify(['top:left', 'bottom:left', 'bottom:left', 'top:center', 'bottom:center', 'bottom:center', 'top:right', 'bottom:right', 'bottom:right']),
    panes,
  );
  const g0 = await geo(page, 0);
  check('pinned: 上の固定行は列見出しのすぐ下', near(g0.topTop, g0.headerBottom), g0);
  check('pinned: 本体の先頭の行は上の固定行のすぐ下', near(g0.rowTop, g0.topBottom), g0);
  check('pinned: 下の固定行は合計行のすぐ上、合計行は見える範囲の下端', near(g0.bottomBottom, g0.totalTop) && near(g0.totalBottom, g0.visibleBottom), g0);
  check('pinned: 固定行 3 行ぶんだけスクロール範囲が伸びる(合計行と合わせて)', near(g0.maxScroll - before.maxScroll, g0.totalBottom - g0.totalTop + (g0.topBottom - g0.topTop) + (g0.bottomBottom - g0.bottomTop)), {
    before: before.maxScroll,
    after: g0.maxScroll,
  });
  // 途中までスクロール: 固定行は留まり、本体の行はその下を流れる(固定行の上の点は固定行のセル)。
  await scrollTo(page, 3000);
  await waitIdle(page, 150);
  const gMid = await geo(page);
  check('pinned: スクロールしても上下の固定行は留まる', near(gMid.topTop, gMid.headerBottom) && near(gMid.bottomBottom, gMid.totalTop), gMid);
  const hit = await page.evaluate(() => {
    const at = (rect) => document.elementFromPoint(rect.left + 200, rect.top + rect.height / 2)?.closest('.ssg-pinned-cell, .ssg-body-cell');
    const top = document.querySelector('.ssg-center-pane .ssg-pinned-rows--top').getBoundingClientRect();
    const bottom = document.querySelector('.ssg-center-pane .ssg-pinned-rows--bottom').getBoundingClientRect();
    return [at(top)?.className ?? null, at(bottom)?.className ?? null];
  });
  check('pinned: 固定行の位置に見えているのは固定行のセル(本体の行は下を流れる)', hit.every((c) => c?.includes('ssg-pinned-cell')), hit);
  // 最後までスクロール: 最終行は下の固定行のすぐ上
  await scrollTo(page, 1e9);
  await waitIdle(page, 150);
  const gEnd = await geo(page, 499);
  check('pinned: 最後までスクロールすると最終行は下の固定行のすぐ上', near(gEnd.rowBottom, gEnd.bottomTop) && rowFullyVisible(gEnd), gEnd);
  // キーボード: Ctrl+Home / Ctrl+End で隠れない
  await scrollTo(page, 0);
  await cell(page, 0, 'qty').click();
  await focusGrid(page);
  await page.keyboard.press('Control+End');
  await waitIdle(page, 250);
  const gCtrlEnd = await geo(page, 499);
  check('pinned: Ctrl+End の最終行は下の固定行に隠れない', rowFullyVisible(gCtrlEnd), gCtrlEnd);
  await page.keyboard.press('Control+Home');
  await waitIdle(page, 250);
  const gCtrlHome = await geo(page, 0);
  check('pinned: Ctrl+Home の先頭の行は上の固定行に隠れない', rowFullyVisible(gCtrlHome) && near(gCtrlHome.rowTop, gCtrlHome.topBottom), gCtrlHome);
  // ↑ で上の固定行の裏の行へ戻っても見える位置へ
  await page.evaluate(() => window.__grid.scrollToRow(100, { align: 'start' }));
  await waitIdle(page, 200);
  await page.evaluate(() => window.__grid.selectCell(100, 2));
  await page.keyboard.press('ArrowUp');
  await waitIdle(page, 250);
  const gUp = await geo(page, 99);
  check('pinned: ↑ で上の固定行の裏の行へ進むと見える位置までスクロール', rowFullyVisible(gUp), gUp);
  // scrollToRow(end / start)
  await page.evaluate(() => window.__grid.scrollToRow(250, { align: 'end' }));
  await waitIdle(page, 200);
  const gEndAlign = await geo(page, 250);
  check("pinned: scrollToRow(align 'end') は下の固定行の上に揃える", near(gEndAlign.rowBottom, gEndAlign.bottomTop), gEndAlign);
  await page.evaluate(() => window.__grid.scrollToRow(250, { align: 'start' }));
  await waitIdle(page, 200);
  const gStartAlign = await geo(page, 250);
  check("pinned: scrollToRow(align 'start') は上の固定行の下に揃える", near(gStartAlign.rowTop, gStartAlign.topBottom), gStartAlign);
  // 横スクロール: 固定行のセルと見出しの x / 幅が揃う(中央 / 左右固定)
  await scrollTo(page, undefined, 260);
  await waitIdle(page, 150);
  const misaligned = await page.evaluate(() => {
    const out = [];
    for (const cellEl of document.querySelectorAll('.ssg-pinned-row .ssg-pinned-cell[data-ssg-col-key]')) {
      const key = cellEl.getAttribute('data-ssg-col-key');
      const head = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      if (!head) continue;
      const a = cellEl.getBoundingClientRect();
      const b = head.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 1 || Math.abs(a.width - b.width) > 1) out.push({ key, cell: [a.left, a.width], head: [b.left, b.width] });
    }
    return out;
  });
  check('pinned: 横スクロール中も固定行のセルが見出しと揃う(固定列含む)', misaligned.length === 0, misaligned);
  await scrollTo(page, undefined, 0);
  // 本体の行から下の固定行へポインタを移すと行ホバーが外れる
  {
    const b = await page.locator('.ssg-center-pane .ssg-pinned-rows--bottom').boundingBox();
    await page.mouse.move(b.x + 300, b.y - 10);
    await waitIdle(page, 120);
    const onRow = await page.evaluate(() => document.querySelectorAll('.ssg-body-cell--row-hovered').length);
    await page.mouse.move(b.x + 300, b.y + 10, { steps: 4 });
    await waitIdle(page, 150);
    const onPinned = await page.evaluate(() => document.querySelectorAll('.ssg-body-cell--row-hovered').length);
    check('pinned: 行から固定行へ移ると行ホバーが外れる', onRow > 0 && onPinned === 0, { onRow, onPinned });
  }
  // 表示専用: 固定行を押してもアクティブセル / 選択は動かず、編集も始まらない
  await page.evaluate(() => window.__grid.selectCell(120, 2, { scrollIntoView: true }));
  await waitIdle(page, 200);
  const beforeActive = await page.evaluate(() => window.__grid.getActiveCell());
  const topCell = page.locator('.ssg-center-pane .ssg-pinned-rows--top .ssg-pinned-cell[data-ssg-col-key="qty"]');
  await topCell.click();
  await topCell.dblclick();
  await waitIdle(page, 150);
  const afterActive = await page.evaluate(() => window.__grid.getActiveCell());
  const editors = await page.locator('[role="group"][aria-label$="を編集"]').count();
  check('pinned: 固定行を押してもアクティブセルは動かず編集も始まらない', JSON.stringify(beforeActive) === JSON.stringify(afterActive) && editors === 0, {
    beforeActive,
    afterActive,
    editors,
  });
  // 範囲選択のドラッグを上の固定行へ動かすと上へ自動スクロール
  {
    await page.evaluate(() => window.__grid.scrollToRow(200, { align: 'start' }));
    await waitIdle(page, 200);
    const start = await cell(page, 205, 'qty').boundingBox();
    const top = await page.locator('.ssg-center-pane .ssg-pinned-rows--top').boundingBox();
    const before = (await geo(page)).scrollTop;
    await page.mouse.move(start.x + 10, start.y + start.height / 2);
    await page.mouse.down();
    await page.mouse.move(start.x + 10, top.y + top.height / 2, { steps: 6 });
    await page.waitForTimeout(500);
    await page.mouse.up();
    await waitIdle(page, 150);
    const after = (await geo(page)).scrollTop;
    const sel = await page.evaluate(() => window.__grid.getSelection());
    check('pinned: 範囲選択のドラッグで上の固定行へ動かすと上へ自動スクロール', after < before && sel !== null, { before, after, sel });
  }
  // ARIA
  const aria = await page.evaluate(() => ({
    rowcount: document.querySelector('.ssg-scroll-container').getAttribute('aria-rowcount'),
    top: document.querySelector('.ssg-pinned-row[data-ssg-pinned="top"][data-pane="center"]').getAttribute('aria-rowindex'),
    bottom: [...document.querySelectorAll('.ssg-pinned-row[data-ssg-pinned="bottom"][data-pane="center"]')].map((e) => e.getAttribute('aria-rowindex')),
    total: document.querySelector('.ssg-total-row[data-pane="center"]').getAttribute('aria-rowindex'),
    header: document.querySelector('.ssg-pinned-row[data-ssg-pinned="top"][data-pane="left"] [role="rowheader"] [role="img"]')?.getAttribute('aria-label'),
  }));
  check(
    'pinned: aria-rowcount と行の番号(見出し 1 → 上 2 → 本体 3〜502 → 下 503・504 → 合計 505)',
    aria.rowcount === '505' && aria.top === '2' && JSON.stringify(aria.bottom) === '["503","504"]' && aria.total === '505' && aria.header === '上に固定 1',
    aria,
  );
  // エクスポート
  const exported = await page.evaluate(() => {
    const data = window.__grid.getExportData({ includePinnedRows: true, includeTotalRow: true });
    return { kinds: [data.rowKinds?.[0], data.rowKinds?.at(-3), data.rowKinds?.at(-2), data.rowKinds?.at(-1)], length: data.rows.length };
  });
  check('pinned: エクスポートの includePinnedRows(上は先頭、下は合計行の前)', JSON.stringify(exported.kinds) === '["pinned","pinned","pinned","total"]' && exported.length === 504, exported);
  // スクリーンショット(ライト / ダーク)
  await page.evaluate(() => window.__grid.scrollToRow(150, { align: 'start' }));
  await waitIdle(page, 200);
  await page.locator('.ssg-root').first().screenshot({ path: OUT + 'pinned-light.png' });
  await page.evaluate(() => window.__setProps({ theme: 'dark' }));
  await waitIdle(page, 200);
  const darkBg = await page.evaluate(() => getComputedStyle(document.querySelector('.ssg-pinned-cell')).backgroundColor);
  check('pinned: ダークのプリセットで固定行の背景が暗い色', /rgb\((\d+), (\d+), (\d+)\)/.test(darkBg) && Number(darkBg.match(/\d+/)[0]) < 80, darkBg);
  await page.locator('.ssg-root').first().screenshot({ path: OUT + 'pinned-dark.png' });
  await page.evaluate(() => window.__setProps({ theme: undefined }));
  check('pinned: 予期しないページエラーなし(基本)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 列ドラッグ(live)で固定行のセルも付いてくる ----------
{
  const { page, pageErrors, close } = await open('basic');
  await setPinned(page, { top: 1, bottom: 1, totalRow: false });
  await page.evaluate(() => window.__setProps({ columnDragMotion: 'live' }));
  await waitIdle(page, 250);
  // Firefox のヘッドレスは (hover: none) = タッチの扱いで、120px より細い見出しには grip を出さないので広げる(t-total と同じ)。
  if (await page.evaluate(() => matchMedia('(hover: none)').matches)) {
    await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'qty' ? { ...c, width: 130 } : c))));
    await waitIdle(page, 200);
  }
  const grip = header(page, 'qty').locator('.ssg-header-grip');
  await header(page, 'qty').hover();
  await waitIdle(page, 100);
  const gb = await grip.boundingBox();
  const target = await header(page, 'category').boundingBox();
  await page.mouse.move(gb.x + 3, gb.y + 5);
  await page.mouse.down();
  await page.mouse.move(gb.x + 30, gb.y + 5, { steps: 5 });
  await page.mouse.move(target.x + target.width - 5, target.y + 10, { steps: 12 });
  await waitIdle(page, 300);
  // 退避した列の固定行のセルが見出しと同じ位置にいる
  const during = await page.evaluate(() => {
    const out = {};
    for (const key of ['price', 'category']) {
      const a = document.querySelector(`.ssg-center-pane .ssg-pinned-rows--top .ssg-pinned-cell[data-ssg-col-key="${key}"]`)?.getBoundingClientRect();
      const b = document.querySelector(`.ssg-center-pane .ssg-header-cell[data-ssg-col-key="${key}"]`)?.getBoundingClientRect();
      out[key] = a && b ? Math.round(a.left - b.left) : null;
    }
    return out;
  });
  check('pinned(live): ドラッグ中に退避した列の固定行のセルも見出しと揃う', during.price === 0 && during.category === 0, during);
  await page.mouse.up();
  await waitIdle(page, 600);
  const order = await page.evaluate(() => [...document.querySelectorAll('.ssg-center-pane .ssg-header-cell[data-ssg-col-key]')].map((e) => e.getAttribute('data-ssg-col-key')));
  const after = await page.evaluate(() => {
    const out = [];
    for (const cellEl of document.querySelectorAll('.ssg-pinned-row .ssg-pinned-cell[data-ssg-col-key]')) {
      const key = cellEl.getAttribute('data-ssg-col-key');
      const head = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      const a = cellEl.getBoundingClientRect();
      const b = head.getBoundingClientRect();
      if (Math.abs(a.left - b.left) > 1) out.push(key);
    }
    return out;
  });
  check('pinned(live): ドロップ後も固定行のセルが見出しと揃う', order.indexOf('qty') > order.indexOf('price') && after.length === 0, { order, after });
  check('pinned: 予期しないページエラーなし(列ドラッグ)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 行が少ないとき(3 行): 下の固定行は最後の行の直後 ----------
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=3' });
  await setPinned(page, { top: 1, bottom: 1, totalRow: true });
  await waitIdle(page, 250);
  const g = await geo(page, 2);
  check('pinned: 行が少ないと下の固定行は最後の行の直後、合計行はその直後', near(g.bottomTop, g.rowBottom) && near(g.totalTop, g.bottomBottom), g);
  check('pinned: 予期しないページエラーなし(少ない行)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 100 万行(scroll-space 仮想化) ----------
{
  const { page, pageErrors, close } = await open('big');
  await setPinned(page, { top: 1, bottom: 1, totalRow: false });
  await waitIdle(page, 400);
  await page.evaluate(() => window.__grid.scrollToBottom());
  await waitIdle(page, 400);
  const g = await geo(page, 999_999);
  // 100 万行は物理のスクロール 1px が約 2.4px なので 2px まで許す(Firefox は scrollTop が最大の 1px 手前で止まり、合計行だけの
  //   ときも最終行が 1px ほど下へ重なる。1.0.2 から同じ)。
  check('pinned: 100 万行で最後までスクロールしても最終行は下の固定行のすぐ上', near(g.rowBottom, g.bottomTop, 2) && g.rowTop >= g.topBottom - 1 && g.rowBottom <= g.bottomTop + 2, g);
  await page.evaluate(() => window.__grid.scrollToRow(500_000, { align: 'start' }));
  await waitIdle(page, 400);
  const gMid = await geo(page, 500_000);
  check('pinned: 100 万行の中ほどの scrollToRow(start) も上の固定行の下', near(gMid.rowTop, gMid.topBottom, 2), gMid);
  check('pinned: 予期しないページエラーなし(100 万行)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 合計行の下に置く(1.2.0 / RV3-要望 pinnedBottomRowsPlacement: 'belowTotal') ----------
{
  const { page, pageErrors, close } = await open('basic');
  await setPinned(page);
  await page.evaluate(() => window.__setProps({ pinnedBottomRowsPlacement: 'belowTotal' }));
  await waitIdle(page, 250);
  const g0 = await geo(page, 0);
  check('pinned(belowTotal): 合計行は下の固定行のすぐ上、下の固定行は見える範囲の下端', near(g0.totalBottom, g0.bottomTop) && near(g0.bottomBottom, g0.visibleBottom), g0);
  await scrollTo(page, 3000);
  await waitIdle(page, 150);
  const gMid = await geo(page);
  check('pinned(belowTotal): スクロールしても合計行と下の固定行は留まる', near(gMid.totalBottom, gMid.bottomTop) && near(gMid.bottomBottom, gMid.visibleBottom), gMid);
  await scrollTo(page, 1e9);
  await waitIdle(page, 150);
  const gEnd = await geo(page, 499);
  check('pinned(belowTotal): 最後までスクロールすると最終行は合計行のすぐ上', near(gEnd.rowBottom, gEnd.totalTop), gEnd);
  await page.evaluate(() => window.__grid.scrollToRow(250, { align: 'end' }));
  await waitIdle(page, 200);
  const gAlign = await geo(page, 250);
  check('pinned(belowTotal): scrollToRow(end) の行は合計行に隠れない', near(gAlign.rowBottom, gAlign.totalTop), gAlign);
  const order = await page.evaluate(() =>
    [...document.querySelectorAll('[role="row"][aria-rowindex]')]
      .filter((e) => e.matches('.ssg-total-row[data-pane="center"], .ssg-pinned-row[data-ssg-pinned="bottom"][data-pane="center"]'))
      .map((e) => `${e.classList.contains('ssg-total-row') ? 'total' : 'pinned'}:${e.getAttribute('aria-rowindex')}`),
  );
  check('pinned(belowTotal): aria-rowindex は合計行 → 下の固定行の順', JSON.stringify(order) === JSON.stringify(['total:503', 'pinned:504', 'pinned:505']), order);
  // 行が少ないとき: 最後の行の直後に合計行、その直後に下の固定行。
  await page.evaluate(() => window.__setRows(window.__rows().slice(0, 3)));
  await waitIdle(page, 300);
  const gFew = await geo(page, 2);
  check('pinned(belowTotal): 行が少ないときは 最後の行 → 合計行 → 下の固定行', near(gFew.rowBottom, gFew.totalTop) && near(gFew.totalBottom, gFew.bottomTop) && gFew.bottomBottom < gFew.visibleBottom - 10, gFew);
  await page.screenshot({ path: `${OUT}/pinned-below-total.png` });
  check('pinned(belowTotal): 予期しないページエラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- SSRM ----------
{
  const { page, pageErrors, close } = await open('ssrm');
  await page.waitForSelector('.ssg-center-pane .ssg-body-row[data-row-index="0"]:not([data-skeleton-row])', { timeout: 10_000 });
  await page.evaluate(() => {
    window.__setProps({
      pinnedTopRows: [{ id: -1, name: '目標', qty: 1, price: 1, category: 'A', date: '2026-01-01', active: true, note: '', score: null, custom: '', status: '受注', secret: '' }],
    });
  });
  await waitIdle(page, 300);
  const g = await geo(page, 0);
  check('pinned: SSRM でも上の固定行の下から本体の行', near(g.rowTop, g.topBottom) && near(g.topTop, g.headerBottom), g);
  check('pinned: 予期しないページエラーなし(SSRM)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

summary('t-pinned');