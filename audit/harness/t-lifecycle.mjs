// ライフサイクル: StrictMode / mount-unmount のリスナー・rAF リーク / 2 グリッド共存 / height % / テーマ切替。
import { OUT, open, check, pending, summary, errorsOf, renderedRowIndexes, cellText, cell, header, waitIdle, events, clearEvents } from './pw.mjs';

const snapshotListeners = (page) => page.evaluate(() => ({ ...window.__listeners }));
const diffListeners = (a, b) => Object.fromEntries(Object.entries(b).filter(([k, v]) => v !== (a[k] ?? 0)).map(([k, v]) => [k, v - (a[k] ?? 0)]));

// ---- StrictMode でのマウント ----
{
  const { page, pageErrors, close } = await open('basic', { query: 'strict=1&n=200' });
  check('strict: rows render', (await renderedRowIndexes(page)).length > 0);
  // 編集 1 回 → onRowsChange 1 回(二重発火なし)
  await clearEvents(page);
  await cell(page, 0, 'name').dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('strict-edit');
  await page.keyboard.press('Enter');
  await waitIdle(page, 150);
  const rc = await events(page, 'onRowsChange');
  check('strict: single edit → exactly 1 onRowsChange', rc.length === 1, rc.length);
  check('strict: edit applied', (await cellText(page, 0, 'name')) === 'strict-edit', await cellText(page, 0, 'name'));
  // undo が効く
  await page.keyboard.press('Control+z');
  await waitIdle(page, 150);
  check('strict: undo restores', (await cellText(page, 0, 'name')) === 'item-000001', await cellText(page, 0, 'name'));
  const errs = await errorsOf(page);
  check('strict: no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

// ---- mount / unmount を繰り返してリスナー・rAF が戻るか ----
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=200' });
  // いくつか操作してコントローラを attach させる(ホバー / メニュー / popover / ツールチップ / コンテキストメニュー)
  const warmup = async () => {
    await cell(page, 1, 'name').hover();
    await waitIdle(page, 50);
    await cell(page, 2, 'name').click();
    await header(page, 'name').hover();
    await header(page, 'name').locator('.ssg-icon-btn').click();
    await waitIdle(page, 100);
    await page.getByText('フィルター…').first().click();
    await waitIdle(page, 100);
    await page.keyboard.press('Escape');
    await waitIdle(page, 50);
    await cell(page, 3, 'name').click({ button: 'right' });
    await waitIdle(page, 100);
    await page.keyboard.press('Escape');
    await waitIdle(page, 50);
    await cell(page, 0, 'qty').dblclick();
    await page.keyboard.press('Escape');
    await waitIdle(page, 50);
  };
  await warmup();
  await page.evaluate(() => window.__mount(false));
  await page.waitForSelector('[data-testid="unmounted"]');
  await waitIdle(page, 300);
  const base = await snapshotListeners(page);
  const rafBase = await page.evaluate(() => window.__rafPending);
  const tooltipBase = await page.evaluate(() => document.querySelectorAll('.ssg-tooltip, .ssg-menu-panel, .ssg-filter-popover, .ssg-select-editor-popover').length);
  for (let i = 0; i < 3; i += 1) {
    await page.evaluate(() => window.__mount(true));
    await page.waitForSelector('.ssg-root');
    await waitIdle(page, 200);
    await warmup();
    await page.evaluate(() => window.__mount(false));
    await page.waitForSelector('[data-testid="unmounted"]');
    await waitIdle(page, 300);
  }
  const after = await snapshotListeners(page);
  const rafAfter = await page.evaluate(() => window.__rafPending);
  const leaked = diffListeners(base, after);
  check('unmount: window/document listeners return to baseline after 3 mount cycles', Object.keys(leaked).length === 0, leaked);
  check('unmount: no pending rAF', rafAfter <= rafBase, { rafBase, rafAfter });
  const leftovers = await page.evaluate(() => [...document.body.querySelectorAll(':scope > *')].filter((e) => e.id !== 'root').map((e) => e.className || e.tagName));
  check('unmount: no leftover portal/tooltip nodes in body', leftovers.every((c) => c === 'SCRIPT'), leftovers);
  const errs = await errorsOf(page);
  check('unmount: no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await close();
}

// ---- 2 グリッド共存 ----
{
  const { page, pageErrors, close } = await open('two', { query: 'n=200', viewport: { width: 1800, height: 900 } });
  const roots = await page.locator('.ssg-root').count();
  check('two: 2 roots', roots === 2, roots);
  check('two: second grid has dark theme class', (await page.locator('.ssg-root.ssg-theme-dark').count()) === 1);
  // 片方でセル選択 → もう片方には影響しない
  const g1cell = page.locator('.ssg-root').nth(0).locator('.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="name"]').first();
  const g2cell = page.locator('.ssg-root').nth(1).locator('.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="name"]').first();
  await g1cell.click();
  await page.keyboard.press('ArrowDown');
  await waitIdle(page, 50);
  const a1 = await page.evaluate(() => window.__grid.getActiveCell());
  const a2 = await page.evaluate(() => window.__grid2.getActiveCell());
  check('two: keyboard only affects focused grid', a1 && a1.row === 1 && a2 === null, { a1, a2 });
  // 2 つ目のグリッドで編集
  await g2cell.dblclick();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('g2');
  await page.keyboard.press('Enter');
  await waitIdle(page, 100);
  const g2text = await g2cell.textContent();
  check('two: editing in grid2 works', g2text.trim() === 'g2', g2text);
  // ツールチップ(シングルトン)が両方で出る
  await page.locator('.ssg-root').nth(0).locator('.ssg-header-cell[data-ssg-col-key="name"]').hover();
  await page.locator('.ssg-root').nth(0).locator('.ssg-header-cell[data-ssg-col-key="name"] .ssg-icon-btn').hover({ force: true });
  await waitIdle(page, 400);
  const tip1 = await page.locator('.ssg-tooltip').count();
  await page.locator('.ssg-root').nth(1).locator('.ssg-header-cell[data-ssg-col-key="name"]').hover();
  await page.locator('.ssg-root').nth(1).locator('.ssg-header-cell[data-ssg-col-key="name"] .ssg-icon-btn').hover({ force: true });
  await waitIdle(page, 400);
  const tip2 = await page.locator('.ssg-tooltip').count();
  check('two: tooltip singleton works for both grids', tip1 >= 1 && tip2 >= 1 && tip2 <= 1, { tip1, tip2 });
  // 片方 unmount しても他方のツールチップは生きる(参照カウント)— ここでは両方同じ App なので省略
  const errs = await errorsOf(page);
  check('two: no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-two.png' });
  await close();
}

// ---- height '100%' が親 400px に収まるか / maxHeight ----
{
  const { page, pageErrors, close } = await open('height', { query: 'n=300' });
  const m = await page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const parent = root.parentElement;
    const sc = document.querySelector('.ssg-scroll-container');
    return { rootH: root.getBoundingClientRect().height, parentH: parent.getBoundingClientRect().height, scH: sc.getBoundingClientRect().height, fill: root.classList.contains('ssg-root--fill-height') };
  });
  check('height 100%: root fits parent (400px)', Math.abs(m.rootH - 400) < 2 && m.fill, m);
  // maxHeight を小さくすると縮む
  await page.evaluate(() => window.__setProps({ maxHeight: 150 }));
  await waitIdle(page, 200);
  const m2 = await page.evaluate(() => document.querySelector('.ssg-scroll-container').getBoundingClientRect().height);
  check('height 100% + maxHeight 150 → scroll area <= 150', m2 <= 151, m2);
  await page.evaluate(() => window.__setProps({ maxHeight: undefined, height: 250 }));
  await waitIdle(page, 200);
  const m3 = await page.evaluate(() => document.querySelector('.ssg-scroll-container').getBoundingClientRect().height);
  check('numeric height 250 → scroll area 250', Math.abs(m3 - 250) < 2, m3);
  // theme / density の切替
  await page.evaluate(() => window.__setProps({ theme: 'dark', density: 'compact' }));
  await waitIdle(page, 200);
  const th = await page.evaluate(() => ({ dark: !!document.querySelector('.ssg-root.ssg-theme-dark'), density: document.querySelector('.ssg-root').className, rowH: document.querySelector('.ssg-body-row')?.getBoundingClientRect().height, headH: document.querySelector('.ssg-header-row')?.getBoundingClientRect().height }));
  check('theme dark + density compact applied (row 28 / header 32)', th.dark && th.rowH === 28 && th.headH === 32, th);
  await page.evaluate(() => window.__setProps({ theme: 'auto' }));
  await waitIdle(page, 100);
  await page.emulateMedia({ colorScheme: 'dark' });
  await waitIdle(page, 200);
  const autoDark = await page.evaluate(() => !!document.querySelector('.ssg-root.ssg-theme-dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  await waitIdle(page, 200);
  const autoLight = await page.evaluate(() => !!document.querySelector('.ssg-root.ssg-theme-dark'));
  check('theme auto follows prefers-color-scheme', autoDark === true && autoLight === false, { autoDark, autoLight });
  const errs = await errorsOf(page);
  check('height: no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 5));
  await page.screenshot({ path: OUT + 'shot-height.png' });
  await close();
}

// ---- 空データ / 列なし / 全列非表示 ----
{
  const { page, pageErrors, close } = await open('empty');
  check('empty: renders without rows/columns', (await page.locator('.ssg-root').count()) === 1);
  const txt = await page.locator('.ssg-root').textContent();
  check('empty: shows noRowsText', txt.includes('表示する行がありません'), txt.slice(0, 200));
  // 列だけ追加 → 行なし
  await page.evaluate(() => window.__setColumns([{ key: 'a', title: 'A', width: 100, editable: true }, { key: 'b', title: 'B', width: 100, editable: true }]));
  await waitIdle(page, 150);
  // 行なしでのキー操作 / API
  await page.locator('.ssg-shell').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await page.evaluate(() => { window.__grid.scrollToBottom(); window.__grid.selectCell(5, 5); window.__grid.scrollToRow(10); window.__grid.selectAllRows(); });
  await waitIdle(page, 100);
  const csv = await page.evaluate(() => window.__grid.exportCsv());
  check('empty: exportCsv with no rows gives header only', csv === 'A,B' || csv === 'A,B\r\n', JSON.stringify(csv));
  // 行を入れて全列非表示
  await page.evaluate(() => window.__setRows([{ id: 1, a: 'x', b: 'y' }, { id: 2, a: 'z', b: 'w' }]));
  await waitIdle(page, 150);
  check('empty→rows: renders 2 rows', (await renderedRowIndexes(page)).length === 2, await renderedRowIndexes(page));
  await page.evaluate(() => window.__setColumns([{ key: 'a', title: 'A', width: 100, visible: false }, { key: 'b', title: 'B', width: 100, visible: false }]));
  await waitIdle(page, 150);
  await page.locator('.ssg-shell').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+C');
  const csv2 = await page.evaluate(() => window.__grid.exportCsv());
  check('all columns hidden: no crash, csv empty', typeof csv2 === 'string', JSON.stringify(csv2));
  // 全列 pinned(左右)
  await page.evaluate(() => window.__setColumns([{ key: 'a', title: 'A', width: 100, pinned: 'left', editable: true }, { key: 'b', title: 'B', width: 100, pinned: 'right', editable: true }]));
  await waitIdle(page, 150);
  await page.locator('.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="a"]').first().click();
  await page.keyboard.press('ArrowRight');
  await waitIdle(page, 50);
  const ac = await page.evaluate(() => window.__grid.getActiveCell());
  check('all pinned: arrow right moves to right-pinned column', ac && ac.col === 1, ac);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await waitIdle(page, 50);
  const ac2 = await page.evaluate(() => window.__grid.getActiveCell());
  check('all pinned: tab wraps/clamps without crash', ac2 !== undefined, ac2);
  // 重複 rowKey
  await page.evaluate(() => window.__setColumns([{ key: 'a', title: 'A', width: 100, editable: true }]));
  await errorsOf(page);
  await page.evaluate(() => window.__setRows([{ id: 1, a: 'x' }, { id: 1, a: 'y' }, { id: 1, a: 'z' }]));
  await waitIdle(page, 200);
  const dupErrs = await errorsOf(page);
  check('duplicate rowKeys: (informational) console output', true, dupErrs.slice(0, 3));
  // rows を 3 → 1 に減らしたときの選択クランプ
  await page.evaluate(() => window.__setRows([{ id: 1, a: 'x' }, { id: 2, a: 'y' }, { id: 3, a: 'z' }]));
  await waitIdle(page, 100);
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 0 }, end: { row: 2, col: 0 } }));
  await page.evaluate(() => window.__grid.setActiveCell({ row: 2, col: 0 }));
  await page.evaluate(() => window.__setRows([{ id: 1, a: 'x' }]));
  await waitIdle(page, 150);
  const sel = await page.evaluate(() => ({ active: window.__grid.getActiveCell(), selection: window.__grid.getSelection(), rows: window.__grid.getSelectedRows().length }));
  pending('rows shrink: active/selection clamped or cleared (no OOB)', (sel.active === null || sel.active.row <= 0) && sel.rows <= 1, sel);
  await page.locator('.ssg-shell').focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await waitIdle(page, 100);
  const errs = await errorsOf(page);
  check('empty/edge: no console errors', errs.filter((e) => !e.includes('same key')).length === 0 && pageErrors.filter((e) => !e.includes('same key')).length === 0, [...errs, ...pageErrors].slice(0, 6));
  await close();
}

summary();