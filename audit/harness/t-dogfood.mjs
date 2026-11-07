// 実際にアプリを作って確かめたチェック(docs/audits/2026-11-07/)の所見のうち、実ブラウザでしか見えないもの・実ブラウザで
//   確かめたものの回帰確認。修正前の 0.61.0 では FAIL、修正後は PASS になる。
import { open, check, summary, cell, events, clearEvents, waitIdle, unexpectedPageErrors } from './pw.mjs';

const activeOf = async (page) => page.evaluate(() => window.__grid.getActiveCell());
const scrollTopOf = async (page) => page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);

// ---- DF-08: 最終列で Tab を 1 回押すとグリッドの外へ出る(見出しの ⋮ / グループ行の開閉 / 展開トグルを渡らない) ----
for (const scenario of ['basic', 'grouping', 'detail']) {
  const { page, close } = await open(scenario);
  if (scenario === 'detail') {
    // 展開行のカードの中の入力欄は Tab で止まってよい(利用側の部品)。ここでは開かずに見る。
    await waitIdle(page, 200);
  }
  await cell(page, 2, 'name').click();
  await page.keyboard.press('End');
  await waitIdle(page, 150);
  await page.keyboard.press('Tab');
  await waitIdle(page, 100);
  const focus = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, cls: String(a?.className ?? '').slice(0, 40), inGrid: a?.closest('.ssg-root') != null };
  });
  check(`DF-08 ${scenario}: one Tab from the last column leaves the grid`, !focus.inGrid, focus);
  await close();
}

// ---- DF-08 の見直し: スクロールする要素の余白を押したときも、フォーカスはキー操作を受けるシェルへ ----
{
  const { page, close } = await open('basic', { query: 'n=3' });
  const box = await page.locator('.ssg-scroll-container').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 20);
  await waitIdle(page, 150);
  const focused = await page.evaluate(() => String(document.activeElement?.className ?? ''));
  check('DF-08 clicking the empty area of the scroll container focuses the shell', focused.includes('ssg-shell'), focused);
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 100);
  check('DF-08 keys work after clicking the empty area', (await activeOf(page)) !== null, await activeOf(page));
  await close();
}

// ---- DU-01: PageDown / Ctrl+End / Ctrl+Home / Home / End ----
{
  const { page, close } = await open('basic');
  await cell(page, 0, 'name').click();
  await waitIdle(page, 100);
  await page.keyboard.press('PageDown');
  await waitIdle(page, 300);
  const afterPage = await activeOf(page);
  const st = await page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container');
    const row = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${window.__grid.getActiveCell().row}"]`);
    const box = row?.getBoundingClientRect();
    const view = sc.getBoundingClientRect();
    return { scrollTop: sc.scrollTop, rowBottom: box?.bottom, viewBottom: view.bottom };
  });
  // 高さ 420 の表(見出し 40)で 36px の行 → 1 画面は約 10 行。
  check('DU-01 PageDown moves about one screen', afterPage && afterPage.row >= 8 && afterPage.row <= 12, afterPage);
  check('DU-01 PageDown keeps the active cell visible', st.scrollTop > 0 && st.rowBottom <= st.viewBottom + 0.5, st);
  await page.keyboard.press('Control+End');
  await waitIdle(page, 300);
  const last = await activeOf(page);
  const count = await page.evaluate(() => window.__rows().length);
  check('DU-01 Ctrl+End goes to the last row', last?.row === count - 1, { last, count });
  await page.keyboard.press('Control+Home');
  await waitIdle(page, 300);
  const first = await activeOf(page);
  check('DU-01 Ctrl+Home goes to row 0', first?.row === 0, first);
  check('DU-01 Ctrl+Home scrolls back to the top', (await scrollTopOf(page)) === 0, await scrollTopOf(page));
  await close();
}

// ---- DF-13: select / date エディタで End / PageDown を押してもグリッドがスクロールしない ----
for (const key of ['category', 'date', 'name']) {
  const { page, close } = await open('basic');
  await cell(page, 3, key).dblclick();
  await waitIdle(page, 200);
  const before = await scrollTopOf(page);
  for (const k of ['End', 'PageDown']) {
    await page.keyboard.press(k);
    await waitIdle(page, 150);
  }
  const after = await scrollTopOf(page);
  const editing = await page.evaluate(() => document.querySelector('.ssg-cell-editor-input') != null);
  check(`DF-13 ${key}: End / PageDown in the editor do not scroll the grid`, before === after && editing, { before, after, editing });
  await close();
}

// ---- DF-17: 右クリックメニューを開いたまま ↓ を押すと、項目へフォーカスが移り、グリッドはスクロールせずメニューも閉じない ----
{
  const { page, close } = await open('basic');
  await cell(page, 4, 'name').click();
  await cell(page, 4, 'name').click({ button: 'right' });
  await waitIdle(page, 200);
  const before = await scrollTopOf(page);
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 200);
  const st = await page.evaluate(() => ({
    open: document.querySelector('[role="menu"].ssg-menu-panel') != null,
    focused: document.activeElement?.textContent?.trim(),
    scrollTop: document.querySelector('.ssg-scroll-container').scrollTop,
  }));
  check('DF-17 ↓ in the context menu focuses the first item and does not scroll', st.open && st.focused?.includes('ログ') && st.scrollTop === before, { ...st, before });
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 100);
  await clearEvents(page);
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const selected = await events(page, 'ctx-delete');
  check('DF-17 ↓ then Enter runs the second item', selected.length === 1, selected);
  await close();
}

// ---- DF-01: グループ行のセルを押すとアクティブセルになり、Enter でそのグループが開閉する ----
{
  const { page, close } = await open('grouping');
  await waitIdle(page, 200);
  // 葉のセルを先に選んでおく。
  await page.evaluate(() => window.__grid.setActiveCell({ row: 2, col: 3 }));
  const group = page.locator('.ssg-center-pane [data-ssg-group-row][data-row-index="0"] .ssg-body-cell').last();
  await group.click();
  await waitIdle(page, 150);
  const active = await activeOf(page);
  check('DF-01 clicking a group row cell activates it', active?.row === 0, active);
  const expandedOf = () =>
    page.evaluate(() => document.querySelector('[data-ssg-group-row][data-row-index="0"] .ssg-group-toggle')?.getAttribute('aria-expanded') ?? null);
  const before = await expandedOf();
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const st = {
    expanded: await expandedOf(),
    editing: await page.evaluate(() => document.querySelector('.ssg-cell-editor-input') != null),
  };
  check('DF-01 Enter toggles the clicked group (no editing)', before !== null && st.expanded !== before && !st.editing, { before, ...st });
  await close();
}

// ---- DF-16 / DU-04: ▸ はアクティブセルを動かさない。トグル列の Enter で開閉 ----
{
  const { page, close } = await open('detail');
  await cell(page, 5, 'name').click();
  await waitIdle(page, 100);
  await clearEvents(page);
  const [id1, id6] = await page.evaluate(() => [window.__rows()[1].id, window.__rows()[6].id]);
  await page.locator('.ssg-body-row[data-row-index="1"] .ssg-detail-toggle').first().click();
  await waitIdle(page, 200);
  const active = await activeOf(page);
  const changes = await events(page, 'onActiveCellChange');
  const expanded = await page.evaluate(() => window.__grid.getExpandedDetailRowKeys());
  check('DF-16 clicking ▸ expands without moving the active cell', active?.row === 5 && changes.length === 0 && expanded.includes(id1), { active, changes, expanded, id1 });
  // その後もキー操作が効く(フォーカスはグリッド)。
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 100);
  check('DF-16 keys still work after clicking ▸', (await activeOf(page))?.row === 6, await activeOf(page));
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft');
  await waitIdle(page, 100);
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const expanded2 = await page.evaluate(() => window.__grid.getExpandedDetailRowKeys());
  check('DU-04 Enter on the toggle column opens the detail row', expanded2.includes(id6), { expanded2, id6 });
  await close();
}

// ---- DF-02: rowDragMotion="live" で展開中の行を掴むと、帯も一緒に付いてきて、後ろの行を覆わない ----
{
  const { page, close, pageErrors } = await open('detail');
  await page.evaluate(() => window.__setProps({ enableRowDrag: true, rowDragMotion: 'live' }));
  await waitIdle(page, 200);
  await page.evaluate(() => {
    window.__draggedId = window.__rows()[1].id;
    window.__grid.setDetailRowExpanded(window.__draggedId, true);
  });
  await waitIdle(page, 300);
  const handle = page.locator('.ssg-body-row[data-row-index="1"] .ssg-row-drag-handle').first();
  const hb = await handle.boundingBox();
  const r5 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="5"]').first().boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 20, { steps: 3 });
  await page.mouse.move(hb.x + hb.width / 2, r5.y + r5.height - 4, { steps: 10 });
  await waitIdle(page, 400);
  const mid = await page.evaluate(() => {
    const row = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="1"]').getBoundingClientRect();
    const band = document.querySelector('.ssg-center-pane .ssg-detail-band[data-detail-row-index="1"]').getBoundingClientRect();
    const others = [2, 3, 4, 5].map((i) => document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${i}"]`).getBoundingClientRect());
    return {
      gap: Math.round(band.top - row.bottom),
      covered: others.filter((r) => r.top < band.bottom - 1 && r.bottom > band.top + 1).length,
    };
  });
  check('DF-02 live drag: the band follows the dragged row', Math.abs(mid.gap) <= 1, mid);
  check('DF-02 live drag: the band does not cover the shifted rows', mid.covered === 0, mid);
  await page.mouse.up();
  await waitIdle(page, 800);
  const after = await page.evaluate(() => {
    const ids = window.__rows().slice(0, 6).map((r) => r.id);
    const idx = ids.indexOf(window.__draggedId);
    const row = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${idx}"]`)?.getBoundingClientRect();
    const band = document.querySelector(`.ssg-center-pane .ssg-detail-band[data-detail-row-index="${idx}"]`);
    const bandBox = band?.getBoundingClientRect();
    return { ids, dragged: window.__draggedId, gap: row && bandBox ? Math.round(bandBox.top - row.bottom) : null, transform: band?.style.transform ?? null };
  });
  check('DF-02 live drag: after drop the band sits under the moved row and has no leftover transform', after.ids.indexOf(after.dragged) > 1 && after.gap === 0 && !after.transform, after);
  check('DF-02 no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DF-07 / DF-14: SSRM の書き戻しで、保存中に取り直すと保存を待つ・スクロールで戻ったセルにも保存中の印 ----
{
  const { page, pageErrors, close } = await open('ssrm');
  const ssrmCellText = (rowIndex, colKey) =>
    cell(page, rowIndex, colKey).evaluate((el) => {
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.ssg-save-indicator, .ssg-save-failed-chip').forEach((node) => node.remove());
      return clone.textContent?.trim();
    });
  await page.waitForFunction(() => {
    const el = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="0"]');
    return el && !el.querySelector('.ssg-skeleton-bar') && (el.textContent ?? '').trim() !== '';
  });
  // DF-07: 保存中(800ms)に refreshServerSide() → 決着の後に取り直すので、直前の編集が古い値に戻らない
  await page.evaluate(() => { window.__ssrm.updateLatency = 800; window.__ssrm.calls.length = 0; });
  await cell(page, 3, 'name').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('saved-before-refresh');
  await page.keyboard.press('Enter');
  await waitIdle(page, 50);
  await page.evaluate(() => window.__grid.refreshServerSide());
  await waitIdle(page, 300);
  const during = await page.evaluate(() => ({
    calls: window.__ssrm.calls.length,
    skeleton: document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="3"]')?.hasAttribute('data-skeleton-row') ?? null,
  }));
  check('DF-07 while a save is in flight, refresh waits (no fetch, skeleton)', during.calls === 0 && during.skeleton === true, during);
  await page.waitForFunction(() => {
    const el = document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="3"]');
    return el && !el.hasAttribute('data-skeleton-row');
  }, null, { timeout: 5000 });
  await waitIdle(page, 200);
  check('DF-07 after the save settles, the refreshed row shows the saved value', (await ssrmCellText(3, 'name')) === 'saved-before-refresh', await ssrmCellText(3, 'name'));

  // DF-14: 保存中(3 秒)にスクロールで外して戻すと、保存中の印が付き直す
  await page.evaluate(() => { window.__ssrm.updateLatency = 3000; });
  await cell(page, 4, 'name').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('pending-across-scroll');
  await page.keyboard.press('Enter');
  await waitIdle(page, 150);
  const markOf = () => cell(page, 4, 'name').evaluate((el) => el.getAttribute('data-ssg-save')).catch(() => 'missing');
  const before = await markOf();
  await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollTop = 3000; });
  await waitIdle(page, 300);
  const gone = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="4"]').count();
  await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollTop = 0; });
  await waitIdle(page, 300);
  const after = await markOf();
  check('DF-14 the pending mark comes back on a cell that scrolled out and back', before === 'pending' && gone === 0 && after === 'pending', { before, gone, after });
  await waitIdle(page, 3200);
  check('DF-14 after the save the mark is no longer pending', (await markOf()) !== 'pending', await markOf());
  await page.evaluate(() => { window.__ssrm.updateLatency = 10; });
  check('DF-07 / DF-14 no page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- DD-25: custom エディタの中身はクリックを受ける(枠の pointer-events: none を継承して下のセルに当たっていた) ----
{
  const { page, close } = await open('basic');
  await cell(page, 1, 'custom').dblclick();
  await waitIdle(page, 200);
  const hit = async () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="custom-editor"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el;
    });
  check('DD-25 the custom editor receives clicks', (await hit()) === true, await hit());
  const editor = page.locator('[data-testid="custom-editor"]');
  await editor.fill('');
  await page.keyboard.type('ab');
  await editor.click();
  await page.keyboard.press('Home');
  await page.keyboard.type('X');
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const value = await page.evaluate(() => window.__rows()[1].custom);
  check('DD-25 clicking inside the custom editor keeps editing (caret moves, value commits)', value === 'Xab', value);
  // 組み込みのエディタの吹き出しは今までどおりクリックを受けない(入力欄はそのまま受ける)。
  await cell(page, 2, 'name').dblclick();
  await waitIdle(page, 150);
  const builtIn = await page.evaluate(() => {
    const input = document.querySelector('.ssg-cell-editor-input');
    return input ? getComputedStyle(input).pointerEvents : null;
  });
  check('DD-25 the built-in editor input still receives clicks', builtIn === 'auto', builtIn);
  await page.keyboard.press('Escape');
  await close();
}

summary();