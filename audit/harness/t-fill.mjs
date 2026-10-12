// フィルハンドル(fillHandle): 実ブラウザでのハンドルの位置・ドラッグ(点線 / 値のツールチップ / 自動スクロール)・
//   連続データ / コピー・Ctrl で入れ替え・Escape・ドラッグ中のキーを流さない・上 / 左へ・固定ペインをまたぐ・
//   validate の reject / 編集不可を飛ばす・埋めたあとのボタンとメニュー(マウス / キーボード)・元に戻す / やり直し・
//   ダブルクリック・ボタンが消える条件・readOnly / 編集中は出さない・ダークテーマ・グルーピング / ラベル行 / SSRM /
//   100 万行との併用。
import { OUT, open, check, unexpectedPageErrors, summary, cell, focusGrid, waitIdle, scrollTo } from './pw.mjs';

// ハンドル(1 つだけのはず)の中心座標と数。press は実際に押せる点(固定ペインや表の端で半分隠れるときは
//   見えている側。当たり判定は ::before で広げてある)。
const handleInfo = (page) =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll('.ssg-fill-handle')];
    if (els.length !== 1) return { count: els.length };
    const r = els[0].getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const candidates = [[cx, cy], [cx - 3, cy - 3], [cx - 3, cy], [cx, cy - 3], [cx - 6, cy - 6]];
    const press = candidates.find(([x, y]) => document.elementFromPoint(x, y) === els[0]) ?? null;
    return { count: 1, x: cx, y: cy, w: r.width, h: r.height, press };
  });
const cellCenter = async (page, rowIndex, key) => {
  const box = await cell(page, rowIndex, key).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const cellCorner = async (page, rowIndex, key) => {
  const box = await cell(page, rowIndex, key).boundingBox();
  return { x: box.x + box.width, y: box.y + box.height };
};
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;
// ハンドルを押して指定セルまで引く(離さない)。
const pressAndMove = async (page, rowIndex, key) => {
  const h = await handleInfo(page);
  if (h.count !== 1) throw new Error(`ハンドルが ${h.count} 個`);
  if (!h.press) throw new Error('ハンドルを押せる点がない');
  await page.mouse.move(h.press[0], h.press[1]);
  await page.mouse.down();
  const to = await cellCenter(page, rowIndex, key);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await waitIdle(page, 80);
};
const dragTo = async (page, rowIndex, key) => {
  await pressAndMove(page, rowIndex, key);
  await page.mouse.up();
  await waitIdle(page, 150);
};
const selectRange = (page, r1, c1, r2, c2) =>
  page.evaluate(
    ([a, b, c, d]) => window.__grid.selectRange({ start: { row: a, col: b }, end: { row: c, col: d } }),
    [r1, c1, r2, c2],
  );
// 列 key → 論理列 index(視覚順 左→中央→右。非表示列を除く)。
const colIndex = (page, key) =>
  page.evaluate((k) => {
    const cols = window.__columns().filter((c) => c.visible !== false);
    const ordered = [
      ...cols.filter((c) => c.pinned === 'left'),
      ...cols.filter((c) => !c.pinned),
      ...cols.filter((c) => c.pinned === 'right'),
    ];
    return ordered.findIndex((c) => c.key === k);
  }, key);
const values = (page, key, from, to) =>
  page.evaluate(([k, a, b]) => window.__rows().slice(a, b + 1).map((r) => r[k]), [key, from, to]);
// rows の一部を差し替える(外からの差し替え = 履歴はリセット)。
const patchRows = (page, key, map) =>
  page.evaluate(
    ([k, m]) => window.__setRows(window.__rows().map((r, i) => (i in m ? { ...r, [k]: m[i] } : r))),
    [key, map],
  );
const chip = (page) =>
  page.evaluate(() => {
    const el = document.querySelector('.ssg-fill-options');
    return el ? { label: el.getAttribute('aria-label'), expanded: el.getAttribute('aria-expanded') } : null;
  });
const menuItems = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.ssg-fill-menu [role="menuitemradio"]')].map((e) => ({
      text: e.textContent.replace('✓', ''),
      checked: e.getAttribute('aria-checked'),
      disabled: e.disabled,
      focused: document.activeElement === e,
    })),
  );
// 指定行が見える位置までスクロールする(その行を先頭に。ハンドルは見える範囲でしか押せない)。
const show = async (page, rowIndex) => {
  await page.evaluate((r) => window.__grid.scrollToRow(r, { align: 'start' }), rowIndex);
  await waitIdle(page, 120);
};
const selection = (page) => page.evaluate(() => window.__grid.getSelection());
const rangeOf = (r1, c1, r2, c2) => ({ type: 'cell', range: { start: { row: r1, col: c1 }, end: { row: r2, col: c2 } } });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- 基本(500 行・左右固定列あり) ----------
{
  const { page, pageErrors, close } = await open('basic');
  const QTY = await colIndex(page, 'qty');
  const NAME = await colIndex(page, 'name');
  await cell(page, 1, 'qty').click();
  await waitIdle(page);
  check('fill: 既定(fillHandle なし)ではハンドルを出さない', (await handleInfo(page)).count === 0);

  await page.evaluate(() => window.__setProps({ fillHandle: true }));
  await waitIdle(page, 150);
  const corner = await cellCorner(page, 1, 'qty');
  const h1 = await handleInfo(page);
  check('fill: アクティブセルの右下の角にハンドル', h1.count === 1 && near(h1.x, corner.x) && near(h1.y, corner.y), { h1, corner });
  check('fill: ハンドルは 8px 四方', near(h1.w, 8, 0.6) && near(h1.h, 8, 0.6), h1);
  const cursor = await page.evaluate(() => getComputedStyle(document.querySelector('.ssg-fill-handle')).cursor);
  check('fill: ハンドルのカーソルは十字', cursor === 'crosshair', cursor);
  // 当たり判定は見えている四角 ± 2px(隣のセルのクリック / ダブルクリックを奪わない)。
  const hit = await page.evaluate(({ x, y }) => {
    const handle = document.querySelector('.ssg-fill-handle');
    const at = (dx, dy) => document.elementFromPoint(x + dx, y + dy) === handle;
    return { in5: at(5, 5), out7: at(7, 7), outRight: at(8, 0), outBelow: at(0, 8) };
  }, { x: h1.x, y: h1.y });
  check('fill: 当たり判定は見えている四角 ± 2px まで(その外は隣のセル)', hit.in5 && !hit.out7 && !hit.outRight && !hit.outBelow, hit);

  // 範囲選択の右下に付く
  await selectRange(page, 1, QTY - 1, 2, QTY);
  await waitIdle(page);
  const h2 = await handleInfo(page);
  const corner2 = await cellCorner(page, 2, 'qty');
  check('fill: 範囲選択の右下の角にハンドル', h2.count === 1 && near(h2.x, corner2.x) && near(h2.y, corner2.y), { h2, corner2 });

  // ── 下へ引く: 10, 20 → 30, 40, 50(連続データ)──
  await patchRows(page, 'qty', { 1: 10, 2: 20, 3: null, 4: null, 5: null, 6: 999 });
  await waitIdle(page);
  await selectRange(page, 1, QTY, 2, QTY);
  await waitIdle(page);
  await pressAndMove(page, 5, 'qty');
  const mid = await page.evaluate(() => ({
    previews: [...document.querySelectorAll('.ssg-fill-preview')].map((e) => {
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, border: getComputedStyle(e).borderTopStyle };
    }),
    tip: document.querySelector('.ssg-fill-tooltip')?.textContent ?? null,
    tipStyle: (() => {
      const el = document.querySelector('.ssg-fill-tooltip');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { whiteSpace: cs.whiteSpace, transition: cs.transitionDuration };
    })(),
    filling: document.querySelector('.ssg-root').classList.contains('ssg-root--filling'),
    bodyCursor: getComputedStyle(document.querySelector('.ssg-body-cell')).cursor,
  }));
  const top1 = (await cell(page, 1, 'qty').boundingBox()).y;
  const bottom5 = await cellCorner(page, 5, 'qty');
  check(
    'fill: ドラッグ中は元の範囲 + 埋める範囲を点線で囲む',
    mid.previews.length === 1 && near(mid.previews[0].top, top1, 2) && near(mid.previews[0].bottom, bottom5.y, 2) && mid.previews[0].border === 'dashed',
    { mid, top1, bottom5 },
  );
  check('fill: いちばん遠いセルへ入る値をツールチップに出す(valueFormatter 込み)', mid.tip === '50', mid.tip);
  check('fill: ツールチップは折り返さず、遅れずに付いてくる(.ssg-tooltip より強い指定)', mid.tipStyle?.whiteSpace === 'nowrap' && mid.tipStyle?.transition === '0s', mid.tipStyle);
  check('fill: ドラッグ中はルートに .ssg-root--filling(カーソルは十字)', mid.filling && mid.bodyCursor === 'crosshair', mid);
  // ドラッグ中のキーはグリッドへ流さない
  const activeBefore = await page.evaluate(() => window.__grid.getActiveCell());
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 60);
  const activeAfter = await page.evaluate(() => window.__grid.getActiveCell());
  check('fill: ドラッグ中の矢印キーでアクティブセルが動かない', same(activeBefore, activeAfter), { activeBefore, activeAfter });
  await page.mouse.up();
  await waitIdle(page, 200);
  check('fill: 10, 20 を下へ → 30, 40, 50', same(await values(page, 'qty', 1, 6), [10, 20, 30, 40, 50, 999]), await values(page, 'qty', 1, 6));
  check('fill: 離すと元の範囲 + 埋めた範囲を選ぶ', same(await selection(page), rangeOf(1, QTY, 5, QTY)), await selection(page));
  const after = await page.evaluate(() => ({
    previews: document.querySelectorAll('.ssg-fill-preview').length,
    tip: document.querySelectorAll('.ssg-fill-tooltip').length,
    filling: document.querySelector('.ssg-root').classList.contains('ssg-root--filling'),
  }));
  check('fill: 離すと点線 / ツールチップ / filling クラスを片付ける', after.previews === 0 && after.tip === 0 && !after.filling, after);
  const c1 = await chip(page);
  check('fill: 埋めたあとにボタン(連続データ)', c1 !== null && c1.label.includes('連続データ') && c1.expanded === 'false', c1);
  const chipBox = await page.locator('.ssg-fill-options').boundingBox();
  check('fill: ボタンは埋めた範囲の右下の外', chipBox.x >= bottom5.x - 1 && chipBox.y >= bottom5.y - 1, { chipBox, bottom5 });
  await page.screenshot({ path: OUT + 'fill-chip.png', clip: { x: 0, y: 0, width: 900, height: 420 } });

  // ── メニュー(マウス): セルのコピーへ選び直す ──
  await page.click('.ssg-fill-options');
  await waitIdle(page, 120);
  const items1 = await menuItems(page);
  check(
    'fill: メニューは「連続データ(選択中・フォーカス)/ セルのコピー」',
    same(items1.map((i) => [i.text, i.checked, i.disabled, i.focused]), [
      ['連続データ', 'true', false, true],
      ['セルのコピー', 'false', false, false],
    ]),
    items1,
  );
  check('fill: メニューを開くと aria-expanded=true', (await chip(page))?.expanded === 'true');
  await page.screenshot({ path: OUT + 'fill-menu.png', clip: { x: 0, y: 0, width: 900, height: 420 } });
  await page.click('.ssg-fill-menu [role="menuitemradio"]:nth-child(2)');
  await waitIdle(page, 150);
  check('fill: セルのコピーへ選び直し → 10, 20, 10, 20, 10', same(await values(page, 'qty', 1, 6), [10, 20, 10, 20, 10, 999]), await values(page, 'qty', 1, 6));
  check('fill: 選び直すとメニューが閉じ、ボタンの表示が変わる', (await page.locator('.ssg-fill-menu').count()) === 0 && (await chip(page))?.label.includes('セルのコピー'));
  const focusAfterChoose = await page.evaluate(() => document.activeElement?.classList.contains('ssg-shell'));
  check('fill: 選び直したあとフォーカスはグリッドへ戻る', focusAfterChoose === true);
  await page.keyboard.press('Control+z');
  await waitIdle(page, 150);
  check('fill: 元に戻す 1 回で埋める前へ', same(await values(page, 'qty', 1, 6), [10, 20, null, null, null, 999]), await values(page, 'qty', 1, 6));
  check('fill: 元に戻すとボタンが消える', (await chip(page)) === null);
  check('fill: 元に戻すと選択も埋める前へ', same(await selection(page), rangeOf(1, QTY, 2, QTY)), await selection(page));
  await page.keyboard.press('Control+Shift+z');
  await waitIdle(page, 150);
  check('fill: やり直しは選び直したあとの値(コピー)', same(await values(page, 'qty', 1, 6), [10, 20, 10, 20, 10, 999]), await values(page, 'qty', 1, 6));

  // ── メニュー(キーボード)──
  await patchRows(page, 'qty', { 1: 10, 2: 20, 3: null, 4: null, 5: null });
  await waitIdle(page);
  await selectRange(page, 1, QTY, 2, QTY);
  await waitIdle(page);
  await dragTo(page, 4, 'qty');
  await page.click('.ssg-fill-options');
  await waitIdle(page, 120);
  await page.keyboard.press('ArrowDown');
  const items2 = await menuItems(page);
  check('fill: ↓ で次の項目へ', items2[1]?.focused === true, items2);
  await page.keyboard.press('Enter');
  await waitIdle(page, 150);
  check('fill: Enter で選ぶ(コピー)', same(await values(page, 'qty', 1, 4), [10, 20, 10, 20]), await values(page, 'qty', 1, 4));
  await page.click('.ssg-fill-options');
  await waitIdle(page, 120);
  await page.keyboard.press('Escape');
  await waitIdle(page, 120);
  const afterEsc = await page.evaluate(() => ({
    menu: document.querySelectorAll('.ssg-fill-menu').length,
    chip: !!document.querySelector('.ssg-fill-options'),
    focus: document.activeElement?.classList.contains('ssg-shell'),
  }));
  check('fill: Escape でメニューだけ閉じ、ボタンと選択は残り、フォーカスはグリッドへ', afterEsc.menu === 0 && afterEsc.chip && afterEsc.focus, afterEsc);
  check('fill: メニューの Escape で選択を消さない', same(await selection(page), rangeOf(1, QTY, 4, QTY)), await selection(page));
  // 選択を変えるとボタンが消える
  await cell(page, 8, 'name').click();
  await waitIdle(page);
  check('fill: 選択を変えるとボタンが消える', (await chip(page)) === null);
  // ソートが変わるとボタンが消える(並びが変わった行へ選び直さない)
  await selectRange(page, 1, QTY, 2, QTY);
  await waitIdle(page);
  await dragTo(page, 3, 'qty');
  check('fill: (ソート前)埋めたあとにボタン', (await chip(page)) !== null);
  await page.evaluate(() => window.__grid.applyState({ ...window.__grid.getState(), sort: [{ columnKey: 'name', direction: 'desc' }] }));
  await waitIdle(page, 150);
  check('fill: ソートが変わるとボタンが消える', (await chip(page)) === null);
  await page.evaluate(() => window.__grid.applyState({ ...window.__grid.getState(), sort: [] }));
  await page.evaluate(() => window.__grid.undo());
  await waitIdle(page, 150);
  // ハンドルを押すと開いているコンテキストメニューを閉じる(ハーネスはコンテキストメニュー有効)
  await cell(page, 8, 'name').click({ button: 'right' });
  await waitIdle(page, 120);
  const ctxOpen = await page.locator('.ssg-menu-panel[role="menu"]').count();
  const hCtx = await handleInfo(page);
  await page.mouse.move(hCtx.press[0], hCtx.press[1]);
  await page.mouse.down();
  await page.mouse.up();
  await waitIdle(page, 120);
  const ctxAfter = await page.locator('.ssg-menu-panel[role="menu"]').count();
  check('fill: ハンドルを押すと開いているコンテキストメニューを閉じる', ctxOpen === 1 && ctxAfter === 0, { ctxOpen, ctxAfter });

  // ── Ctrl で入れ替え: 数値 1 つ → 1 ずつ ──
  await patchRows(page, 'qty', { 10: 7, 11: null, 12: null, 13: null });
  await waitIdle(page);
  await show(page, 10);
  await cell(page, 10, 'qty').click();
  await waitIdle(page);
  await pressAndMove(page, 12, 'qty');
  const tipPlain = await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent ?? null);
  await page.keyboard.down('Control');
  await waitIdle(page, 80);
  const tipCtrl = await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent ?? null);
  const to13 = await cellCenter(page, 13, 'qty');
  await page.mouse.move(to13.x, to13.y, { steps: 3 });
  await page.mouse.up();
  await page.keyboard.up('Control');
  await waitIdle(page, 150);
  check('fill: 数値 1 つはコピー、Ctrl を押すとツールチップが連続データへ', tipPlain === '7' && tipCtrl === '9', { tipPlain, tipCtrl });
  check('fill: Ctrl を押しながら離すと 8, 9, 10', same(await values(page, 'qty', 10, 13), [7, 8, 9, 10]), await values(page, 'qty', 10, 13));
  check('fill: Ctrl で連続データにしたときのボタンは連続データ', (await chip(page))?.label.includes('連続データ'));

  // ── Escape でやめる ──
  await patchRows(page, 'qty', { 20: 5, 21: 6, 22: 7 });
  await waitIdle(page);
  const before20 = await values(page, 'qty', 20, 26);
  await show(page, 20);
  await cell(page, 20, 'qty').click();
  await waitIdle(page);
  await pressAndMove(page, 25, 'qty');
  await page.keyboard.press('Escape');
  await waitIdle(page, 80);
  const escMid = await page.evaluate(() => ({
    previews: document.querySelectorAll('.ssg-fill-preview').length,
    tip: document.querySelectorAll('.ssg-fill-tooltip').length,
  }));
  await page.mouse.up();
  await waitIdle(page, 120);
  check('fill: Escape で点線とツールチップを消す', escMid.previews === 0 && escMid.tip === 0, escMid);
  check('fill: Escape のあと離しても書かない', same(await values(page, 'qty', 20, 26), before20), await values(page, 'qty', 20, 26));
  check('fill: Escape で選択は元のまま(グリッドの Escape に流さない)', same(await selection(page), rangeOf(20, QTY, 20, QTY)), await selection(page));

  // ── 上へ: 3, 4 → 2, 1(上へ続ける)──
  await patchRows(page, 'qty', { 30: null, 31: null, 32: 3, 33: 4 });
  await waitIdle(page);
  await show(page, 30);
  await selectRange(page, 32, QTY, 33, QTY);
  await waitIdle(page);
  await dragTo(page, 30, 'qty');
  check('fill: 上へ引くと逆向きに続く(3, 4 → 1, 2)', same(await values(page, 'qty', 30, 33), [1, 2, 3, 4]), await values(page, 'qty', 30, 33));
  check('fill: 上へ埋めたあとの選択', same(await selection(page), rangeOf(30, QTY, 33, QTY)), await selection(page));

  // ── validate の reject を飛ばす: 2, 1 → 0, (-1 / -2 は 0 以上の validate で reject)──
  await patchRows(page, 'qty', { 40: 2, 41: 1, 42: 50, 43: 50, 44: 50 });
  await waitIdle(page);
  await show(page, 40);
  await selectRange(page, 40, QTY, 41, QTY);
  await waitIdle(page);
  await dragTo(page, 44, 'qty');
  check('fill: validate(reject)で弾かれるセルは書かない', same(await values(page, 'qty', 40, 44), [2, 1, 0, 50, 50]), await values(page, 'qty', 40, 44));

  // ── 左へ / 固定ペインをまたぐ: 中央の「名前」→ 左固定の「ID」──
  await patchRows(page, 'name', { 50: 'item-000051' });
  await waitIdle(page);
  await show(page, 50);
  await cell(page, 50, 'name').click();
  await waitIdle(page);
  await pressAndMove(page, 50, 'id');
  const crossPreview = await page.evaluate(() => document.querySelectorAll('.ssg-fill-preview').length);
  await page.mouse.up();
  await waitIdle(page, 150);
  check('fill: 固定ペインをまたぐと点線は両方のペインに出る', crossPreview === 2, crossPreview);
  check('fill: 左へ(中央 → 左固定)は末尾の数を逆向きに', (await values(page, 'id', 50, 50))[0] === 'item-000050', await values(page, 'id', 50, 50));
  // 右へ: カスタム(中央)→ 状態(右固定)
  await patchRows(page, 'custom', { 52: 'c52' });
  await waitIdle(page);
  await show(page, 50);
  await cell(page, 52, 'custom').click();
  await waitIdle(page);
  await scrollTo(page, undefined, 2000);
  const hEdge = await handleInfo(page);
  check('fill: 右固定ペインとの境目でもハンドルの見えている側を押せる', hEdge.count === 1 && hEdge.press !== null, hEdge);
  await dragTo(page, 52, 'status');
  check('fill: 右へ(中央 → 右固定)', (await values(page, 'status', 52, 52))[0] === 'c53', await values(page, 'status', 52, 52));
  await scrollTo(page, undefined, 0);
  // 右固定列でもハンドルは角に出る
  await cell(page, 54, 'status').click();
  await waitIdle(page);
  const hRight = await handleInfo(page);
  const cornerRight = await cellCorner(page, 54, 'status');
  check('fill: 右固定列のセルでも角にハンドル', hRight.count === 1 && near(hRight.x, cornerRight.x, 6) && near(hRight.y, cornerRight.y), { hRight, cornerRight });

  // ── 編集不可の列は飛ばす(列を editable: false に)──
  await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'price' ? { ...c, editable: false } : c))));
  await waitIdle(page, 120);
  const priceBefore = await values(page, 'price', 60, 62);
  await patchRows(page, 'qty', { 60: 1 });
  await waitIdle(page);
  await show(page, 60);
  await selectRange(page, 60, QTY, 60, QTY + 1);
  await waitIdle(page);
  await dragTo(page, 62, 'price');
  check('fill: 編集できない列(price)は書かない', same(await values(page, 'price', 60, 62), priceBefore), { now: await values(page, 'price', 60, 62), priceBefore });
  check('fill: 同じ範囲の編集できる列(qty)は書く', same(await values(page, 'qty', 60, 62), [1, 1, 1]), await values(page, 'qty', 60, 62));
  await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'price' ? { ...c, editable: true } : c))));
  await waitIdle(page, 120);

  // ── ダブルクリック: 左隣(名前)が続くところまで。埋まっているセルの手前で止まる ──
  await patchRows(page, 'qty', { 70: 1, 71: 2, 72: null, 73: null, 74: null, 75: null, 76: 500 });
  await waitIdle(page);
  await show(page, 70);
  await selectRange(page, 70, QTY, 71, QTY);
  await waitIdle(page);
  const hd = await handleInfo(page);
  await page.mouse.dblclick(hd.press[0], hd.press[1]);
  await waitIdle(page, 200);
  check('fill: ダブルクリックで下へ埋め、値のあるセルの手前で止まる', same(await values(page, 'qty', 70, 76), [1, 2, 3, 4, 5, 6, 500]), await values(page, 'qty', 70, 76));
  check('fill: ダブルクリック後の選択', same(await selection(page), rangeOf(70, QTY, 75, QTY)), await selection(page));

  // ── 自動スクロール: 下端へ寄せて保つと先の行まで埋まる ──
  await scrollTo(page, 0);
  await patchRows(page, 'name', { 0: 'auto-001' });
  await waitIdle(page);
  await selectRange(page, 0, NAME, 0, NAME);
  await waitIdle(page);
  const scBox = await page.locator('.ssg-scroll-container').boundingBox();
  const ha = await handleInfo(page);
  await page.mouse.move(ha.press[0], ha.press[1]);
  await page.mouse.down();
  await page.mouse.move(ha.x, scBox.y + scBox.height - 10, { steps: 8 });
  await page.waitForTimeout(700);
  const scrolled = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
  await page.mouse.up();
  await waitIdle(page, 200);
  const sel = await selection(page);
  const lastRow = sel?.range?.end?.row ?? -1;
  const lastName = (await values(page, 'name', lastRow, lastRow))[0];
  check('fill: 端へ寄せると自動スクロールする', scrolled > 100, scrolled);
  check('fill: 自動スクロールした先まで埋める', lastRow > 15 && lastName === `auto-${String(lastRow + 1).padStart(3, '0')}`, { lastRow, lastName });

  // ── 出さないとき: 編集中 / 行選択 / readOnly ──
  await scrollTo(page, 0);
  await cell(page, 2, 'name').click();
  await waitIdle(page);
  await page.keyboard.press('F2');
  await waitIdle(page, 100);
  check('fill: 編集中はハンドルを出さない', (await handleInfo(page)).count === 0);
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  check('fill: 編集を終えると戻る', (await handleInfo(page)).count === 1);
  // 行番号のチェックボックスを消して、行番号の押下 = 行の選択にする。
  await page.evaluate(() => window.__setProps({ enableRowSelection: false }));
  await waitIdle(page, 120);
  await page.locator('.ssg-body-row[data-row-index="3"] .ssg-row-header-cell').first().click();
  await waitIdle(page);
  const rowSel = await selection(page);
  check('fill: 行の選択中はハンドルを出さない', rowSel?.type === 'row' && (await handleInfo(page)).count === 0, rowSel);
  await page.evaluate(() => window.__setProps({ enableRowSelection: true }));
  await waitIdle(page, 120);
  await cell(page, 3, 'name').click();
  await page.evaluate(() => window.__setProps({ readOnly: true }));
  await waitIdle(page, 120);
  check('fill: readOnly ではハンドルを出さない', (await handleInfo(page)).count === 0);
  await page.evaluate(() => window.__setProps({ readOnly: false }));
  await waitIdle(page, 120);

  // ── ダークテーマ: 点線は文字色 ──
  await page.evaluate(() => window.__setProps({ theme: 'dark' }));
  await waitIdle(page, 120);
  await cell(page, 3, 'name').click();
  await waitIdle(page);
  await pressAndMove(page, 6, 'name');
  const dark = await page.evaluate(() => {
    const preview = document.querySelector('.ssg-fill-preview');
    const root = document.querySelector('.ssg-root');
    const probe = document.createElement('div');
    probe.style.color = 'var(--ssg-cell-text)';
    root.appendChild(probe);
    const text = getComputedStyle(probe).color;
    probe.remove();
    return {
      line: preview && getComputedStyle(preview).borderTopColor,
      text,
      tipBg: getComputedStyle(document.querySelector('.ssg-fill-tooltip')).backgroundColor,
      tipDark: document.querySelector('.ssg-fill-tooltip').classList.contains('ssg-theme-dark'),
    };
  });
  await page.screenshot({ path: OUT + 'fill-dark.png', clip: { x: 0, y: 0, width: 900, height: 420 } });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  check('fill: ダークテーマで点線は文字色(テーマに追従)', dark.line === dark.text, dark);
  check('fill: ツールチップ(ポータル)にテーマのクラス', dark.tipDark, dark);
  await page.evaluate(() => window.__setProps({ theme: 'light' }));
  await waitIdle(page, 120);

  const listeners = await page.evaluate(() => ({ ...window.__listeners }));
  check('fill: エラーなし(基本)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  check('fill: console.error / warn なし(基本)', (await page.evaluate(() => window.__errors)).length === 0, await page.evaluate(() => window.__errors));
  void listeners;
  await close();
}

// ---------- グルーピング(グループ行は飛ばし、位置にも数えない)----------
{
  const { page, pageErrors, close } = await open('grouping');
  // 24 行にすると カテゴリ × 状態 のグループがほぼ 1 行ずつになり、データ行の間にグループ行が挟まる。
  await page.evaluate(() => {
    window.__setRows(window.__makeRows(24));
    window.__setProps({ fillHandle: true });
  });
  await waitIdle(page, 250);
  const layout = await page.evaluate(() =>
    [...document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')]
      .map((e) => ({ i: Number(e.getAttribute('data-row-index')), group: e.hasAttribute('data-ssg-group-row') }))
      .sort((a, b) => a.i - b.i),
  );
  const firstData = layout.find((r) => !r.group)?.i;
  const span = layout.filter((r) => r.i > firstData && r.i <= firstData + 6);
  check('fill(grouping): 埋める範囲にグループ行が挟まる', span.some((r) => r.group) && span.some((r) => !r.group), span);
  const CUSTOM = await colIndex(page, 'custom');
  const sourceId = await page.evaluate((i) => {
    const rows = window.__rows();
    const id = Number(document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${i}"] .ssg-body-cell[data-ssg-col-key="id"]`)?.textContent ?? document.querySelector(`.ssg-body-row[data-row-index="${i}"] .ssg-body-cell[data-ssg-col-key="id"]`)?.textContent);
    return rows.find((r) => r.id === id)?.custom ?? null;
  }, firstData);
  await selectRange(page, firstData, CUSTOM, firstData, CUSTOM);
  await waitIdle(page);
  await page.evaluate(() => window.__setRows(window.__rows().map((r) => ({ ...r, custom: r.id === 1 ? 'g1' : r.custom }))));
  await waitIdle(page, 150);
  const before = await page.evaluate(() => window.__rows().map((r) => r.custom));
  await scrollTo(page, undefined, 2000);
  await dragTo(page, firstData + 6, 'custom');
  const written = await page.evaluate(
    ([from, to]) =>
      [...document.querySelectorAll('.ssg-body-row[data-row-index]')]
        .filter((e) => !e.hasAttribute('data-ssg-group-row') && e.querySelector('.ssg-body-cell[data-ssg-col-key="custom"]'))
        .map((e) => ({ i: Number(e.getAttribute('data-row-index')), v: e.querySelector('.ssg-body-cell[data-ssg-col-key="custom"]').textContent }))
        .filter((r) => r.i > from && r.i <= to)
        .sort((a, b) => a.i - b.i)
        .map((r) => r.v),
    [firstData, firstData + 6],
  );
  const after = await page.evaluate(() => window.__rows().map((r) => r.custom));
  const changed = after.filter((v, i) => v !== before[i]).length;
  const dataRows = span.filter((r) => !r.group).length;
  check('fill(grouping): データ行だけに書き、グループ行は位置にも数えない(g2, g3 …)', changed === dataRows && same(written, Array.from({ length: dataRows }, (_, k) => `g${k + 2}`)), { sourceId, written, changed, dataRows });
  check('fill(grouping): エラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- ラベル行(ラベル行は飛ばす)----------
{
  const { page, pageErrors, close } = await open('label');
  await page.evaluate(() => {
    const rows = window.__makeRows(60);
    const out = [];
    rows.forEach((r, i) => {
      if (i % 5 === 0) out.push({ ...r, id: 10_000 + i, isLabel: true, label: `セクション ${i / 5 + 1}` });
      out.push({ ...r, qty: null });
    });
    window.__setRows(out);
    window.__setProps({ fillHandle: true });
  });
  await waitIdle(page, 200);
  // ビュー行 1(最初のデータ行)に 1、2 を入れて下へ。ビュー行 6 はラベル行。
  await page.evaluate(() => {
    const rows = window.__rows();
    window.__setRows(rows.map((r, i) => (i === 1 ? { ...r, qty: 1 } : i === 2 ? { ...r, qty: 2 } : r)));
  });
  await waitIdle(page, 120);
  const QTY = await colIndex(page, 'qty');
  await selectRange(page, 1, QTY, 2, QTY);
  await waitIdle(page);
  await dragTo(page, 8, 'qty');
  const labelQty = await page.evaluate(() => window.__rows().slice(0, 9).map((r) => (r.isLabel ? 'L' : r.qty)));
  check('fill(label): ラベル行は飛ばし、位置にも数えない', same(labelQty, ['L', 1, 2, 3, 4, 5, 'L', 6, 7]), labelQty);
  check('fill(label): エラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- SSRM(dataSource.updateRows へ書き戻す)----------
{
  const { page, pageErrors, close } = await open('ssrm');
  await page.evaluate(() => window.__setProps({ fillHandle: true }));
  await page.waitForFunction(() => document.querySelectorAll('.ssg-body-row[data-row-index="3"] .ssg-body-cell[data-ssg-col-key="name"]').length > 0);
  await waitIdle(page, 300);
  const NAME = await colIndex(page, 'name');
  await selectRange(page, 0, NAME, 0, NAME);
  await waitIdle(page);
  check('fill(ssrm): updateRows があればハンドルを出す', (await handleInfo(page)).count === 1);
  await dragTo(page, 3, 'name');
  await waitIdle(page, 400);
  const ssrm1 = await page.evaluate(() => ({
    updates: window.__ssrm.updates.length,
    // 保存の印(showSaveStatus の ✓)は除いて比べる。
    names: [0, 1, 2, 3].map((i) => document.querySelector(`.ssg-body-row[data-row-index="${i}"] .ssg-body-cell[data-ssg-col-key="name"]`)?.textContent.replace('✓', '')),
  }));
  check('fill(ssrm): 書き戻しを 1 回送り、末尾の数を進める', ssrm1.updates === 1 && same(ssrm1.names, ['item-000001', 'item-000002', 'item-000003', 'item-000004']), ssrm1);
  await page.click('.ssg-fill-options');
  await waitIdle(page, 120);
  await page.click('.ssg-fill-menu [role="menuitemradio"]:nth-child(2)');
  await waitIdle(page, 400);
  const ssrm2 = await page.evaluate(() => ({
    updates: window.__ssrm.updates.length,
    // 保存の印(showSaveStatus の ✓)は除いて比べる。
    names: [0, 1, 2, 3].map((i) => document.querySelector(`.ssg-body-row[data-row-index="${i}"] .ssg-body-cell[data-ssg-col-key="name"]`)?.textContent.replace('✓', '')),
  }));
  check('fill(ssrm): ボタンでコピーへ選び直すと書き戻しを送り直す', ssrm2.updates === 2 && same(ssrm2.names, ['item-000001', 'item-000001', 'item-000001', 'item-000001']), ssrm2);
  check('fill(ssrm): エラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 100 万行 ----------
{
  const { page, pageErrors, close } = await open('big');
  await page.evaluate(() => window.__setProps({ fillHandle: true }));
  await waitIdle(page, 300);
  await show(page, 999_989);
  const QTY = await colIndex(page, 'qty');
  await page.evaluate(() => {
    const rows = window.__rows().slice();
    rows[999_990] = { ...rows[999_990], qty: 100 };
    rows[999_991] = { ...rows[999_991], qty: 200 };
    window.__setRows(rows);
  });
  await waitIdle(page, 200);
  await selectRange(page, 999_990, QTY, 999_991, QTY);
  await waitIdle(page, 120);
  const t0 = Date.now();
  await dragTo(page, 999_995, 'qty');
  const elapsed = Date.now() - t0;
  check('fill(1M): 末尾付近で埋める', same(await values(page, 'qty', 999_990, 999_995), [100, 200, 300, 400, 500, 600]), await values(page, 'qty', 999_990, 999_995));
  check('fill(1M): ドラッグから反映まで 2 秒以内(dev ビルド)', elapsed < 2000, elapsed);
  // 表の末尾より先へは行を増やさない
  await selectRange(page, 999_999, QTY, 999_999, QTY);
  await waitIdle(page, 120);
  const lenBefore = await page.evaluate(() => window.__rows().length);
  const hEnd = await handleInfo(page);
  await page.mouse.move(hEnd.press[0], hEnd.press[1]);
  await page.mouse.down();
  await page.mouse.move(hEnd.x, hEnd.y + 80, { steps: 4 });
  await page.mouse.up();
  await waitIdle(page, 150);
  check('fill(1M): 表の末尾より先へは行を増やさない', (await page.evaluate(() => window.__rows().length)) === lenBefore);
  check('fill(1M): エラーなし', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

summary();