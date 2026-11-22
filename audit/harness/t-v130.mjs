// 追加(1.3.0 / Solid 版の品質の段 2): 1.3.0 で直した所見の実ブラウザでの確かめ(Shadow DOM は t-shadow.mjs)。
//   - IME の入力受け: PageDown の後(先読みの行へ移ってからスクロールが来る)も、待機中の入力受けがアクティブセルに重なる
//   - S9-02: 範囲の選択を Escape で外した後の Ctrl+C はアクティブセルの 1 セル
//   - S7-03 / S8-04: 編集していた行が絞り込みから外れたら、打ちかけをその行へ確定し、フォーカスはグリッドに残る
//   - RV5-3: エディタを開いたまま別のセルを押してすぐ打った文字が、そのセルのエディタに残る
//   Solid 版は SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/。
import { open, check, skip, summary, waitIdle, unexpectedPageErrors, cell, cellText, header, SUPPORTS } from './pw.mjs';

const { page, close, pageErrors } = await open('basic');
await waitIdle(page, 300);

const shellFocused = () => page.evaluate(() => document.activeElement?.classList.contains('ssg-shell') === true);
const editorValue = () =>
  page.evaluate(() => document.querySelector('.ssg-cell-editor-input')?.value ?? null);

// ── IME の入力受け(PageDown)──
{
  await page.evaluate(() => window.__setProps({ imeDirectInput: true }));
  await waitIdle(page, 300);
  await cell(page, 2, 'name').click();
  await waitIdle(page, 200);
  const offsets = [];
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('PageDown');
    await waitIdle(page, 300);
    offsets.push(
      await page.evaluate(() => {
        const ime = document.querySelector('[data-ssg-ime-input]')?.getBoundingClientRect();
        const id = document.querySelector('.ssg-shell')?.getAttribute('aria-activedescendant');
        const active = id ? document.getElementById(id)?.getBoundingClientRect() : undefined;
        return ime && active ? Math.round(Math.abs(ime.top - active.top) + Math.abs(ime.left - active.left)) : null;
      }),
    );
  }
  check('IME の入力受け: PageDown の後も待機中の入力受けがアクティブセルに重なる', offsets.every((d) => d !== null && d <= 1), { offsets });
  await page.evaluate(() => window.__setProps({ imeDirectInput: false }));
  await page.keyboard.press('ControlOrMeta+Home');
  await waitIdle(page, 300);
}

// ── S9-02: Escape の後の Ctrl+C ──
if (SUPPORTS.clipboardSeed) {
  await cell(page, 1, 'name').click();
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  await page.evaluate(() => navigator.clipboard.writeText('(前の中身)'));
  const selection = await page.evaluate(() => window.__grid.getSelection());
  await page.keyboard.press('ControlOrMeta+c');
  await waitIdle(page, 200);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  const expected = active ? await cellText(page, active.row, 'name') : null;
  check('S9-02: 範囲を Escape で外した後の Ctrl+C はアクティブセルの 1 セル', selection === null && copied === expected, {
    selection,
    active,
    copied,
    expected,
  });
} else {
  skip('S9-02: 範囲を Escape で外した後の Ctrl+C', 'クリップボードを読めないブラウザ');
}

// ── S7-03 / S8-04: 編集していた行が絞り込みから外れる ──
{
  const target = await page.evaluate(() => window.__rows()[0].name);
  await cell(page, 5, 'name').dblclick();
  await waitIdle(page, 150);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('打ちかけ');
  await page.evaluate((text) => window.__grid.applyState({ filters: { globalText: text } }), target);
  await waitIdle(page, 600);
  const written = await page.evaluate(() => window.__rows()[5].name);
  const focused = await shellFocused();
  check('S7-03 / S8-04: 絞り込みから外れた行へ打ちかけを確定し、フォーカスはグリッドに残る', written === '打ちかけ' && focused, {
    written,
    focused,
    editor: await editorValue(),
  });
  await page.evaluate(() => window.__grid.applyState({ filters: { globalText: '' } }));
  await waitIdle(page, 600);
}

// ── RV5-3: 開いたまま別のセルを押してすぐ打つ ──
{
  await cell(page, 0, 'name').dblclick();
  await waitIdle(page, 150);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('先の値');
  await cell(page, 2, 'name').click();
  await page.keyboard.type('xyz');
  await waitIdle(page, 200);
  const value = await editorValue();
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  const names = await page.evaluate(() => [window.__rows()[0].name, window.__rows()[2].name]);
  check('RV5-3: 押してすぐ打った文字が、そのセルのエディタに残る', value === 'xyz' && names[0] === '先の値' && names[1] === 'xyz', {
    value,
    names,
  });
}

// ── S12-05: 横にスクロールした後の Ctrl+Home(先頭の列は左に固定)──
{
  await cell(page, 3, 'name').click();
  await page.evaluate(() => {
    const scroller = document.querySelector('.ssg-scroll-container');
    if (scroller) scroller.scrollLeft = scroller.scrollWidth;
  });
  await waitIdle(page, 300);
  await page.keyboard.press('ControlOrMeta+Home');
  await waitIdle(page, 300);
  const scrollLeft = await page.evaluate(() => document.querySelector('.ssg-scroll-container')?.scrollLeft ?? null);
  const active = await page.evaluate(() => window.__grid.getActiveCell());
  check('S12-05: 横にスクロールした後の Ctrl+Home で左端へ戻る', scrollLeft === 0 && active?.row === 0 && active?.col === 0, { scrollLeft, active });
}

// ── S8-05: select の候補を開いたまま並びが変わる ──
{
  await cell(page, 2, 'category').dblclick();
  await waitIdle(page, 250);
  const gap = () =>
    page.evaluate(() => {
      const list = document.querySelector('.ssg-select-editor-popover')?.getBoundingClientRect();
      const input = document.querySelector('.ssg-cell-editor-input--select')?.getBoundingClientRect();
      return list && input ? Math.round(Math.min(Math.abs(list.top - input.bottom), Math.abs(list.bottom - input.top))) : null;
    });
  const before = await gap();
  const editorTop = () => page.evaluate(() => Math.round(document.querySelector('.ssg-cell-editor-input--select')?.getBoundingClientRect().top ?? -1));
  const topBefore = await editorTop();
  // 先頭の行と 3 行目を入れ替える(編集している 3 行目の行が先頭へ動く。スクロールは起きない)。
  await page.evaluate(() => {
    const next = [...window.__rows()];
    [next[0], next[2]] = [next[2], next[0]];
    window.__setRows(next);
  });
  await waitIdle(page, 400);
  const after = await gap();
  const topAfter = await editorTop();
  check('S8-05: select の候補を開いたまま並びが変わっても、候補の一覧はエディタに付いていく', before !== null && after !== null && after <= 4 && topAfter < topBefore - 30, {
    before,
    after,
    topBefore,
    topAfter,
  });
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const next = [...window.__rows()];
    [next[0], next[2]] = [next[2], next[0]];
    window.__setRows(next);
  });
  await waitIdle(page, 300);
}

// ── S8-02: 列フィルターの日付の入力欄が全角・年月日を読む ──
{
  await header(page, 'date').hover();
  await header(page, 'date').locator('.ssg-header-actions .ssg-icon-btn').click();
  await waitIdle(page, 300);
  await page.locator('.ssg-menu-panel [role="menuitem"]').filter({ hasText: 'フィルター' }).first().click();
  await page.waitForSelector('.ssg-filter-popover');
  await waitIdle(page, 400);
  const start = page.locator('.ssg-filter-popover input[aria-label="開始日"]');
  if ((await start.count()) === 1) {
    await start.fill('２０２６／１１／２０');
    await start.press('Enter');
    await waitIdle(page, 250);
    const invalid = await start.getAttribute('aria-invalid');
    const value = await start.inputValue();
    check('S8-02: 列フィルターの日付の入力欄が全角の日付を読む', invalid === null && value.includes('2026') && value.includes('20'), { invalid, value });
  } else {
    check('S8-02: 列フィルターの開始日の入力欄が見つかる', false, { count: await start.count() });
  }
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
}

check('想定外のエラーが無い', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
await close();

// ── RV5-4: 細い列(46px)の renderHeader の中のボタン(qty = 右寄せ / note = 左寄せ)──
for (const key of ['qty', 'note']) {
  const { page: p2, close: close2, pageErrors: errors2 } = await open('basic', { query: `hb=${key}` });
  await waitIdle(p2, 300);
  const button = p2.locator('[data-testid="hdr-btn"]');
  const box = await button.boundingBox();
  // ボタンの右寄り(つまみと ⋮ の背景がかぶる所)を押す。
  await p2.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  await waitIdle(p2, 200);
  const hit = await p2.evaluate(([x, y]) => {
    const element = document.elementFromPoint(x, y);
    return element?.closest('[data-testid="hdr-btn"]') ? 'button' : (element?.className?.toString() ?? null);
  }, [box.x + box.width - 2, box.y + box.height / 2]);
  await p2.mouse.down();
  await p2.mouse.up();
  await waitIdle(p2, 200);
  const clicked = await p2.evaluate(() => window.__events.filter((e) => e.type === 'hdr-btn').length);
  const selection = await p2.evaluate(() => window.__grid.getSelection());
  // 見出しの空いた所(ボタンの外)では今までどおり ⋮ が出て押せる。
  const header = p2.locator(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
  const headerBox = await header.boundingBox();
  await p2.mouse.move(headerBox.x + headerBox.width - 3, headerBox.y + 3);
  await waitIdle(p2, 250);
  const actionsShown = await p2.evaluate((columnKey) => {
    const actions = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${columnKey}"] .ssg-header-actions`);
    return actions ? Number(getComputedStyle(actions).opacity) : null;
  }, key);
  check(`RV5-4(${key}): 細い列の見出しの中のボタンを押すと onClick が呼ばれ、列は選ばれない`, hit === 'button' && clicked === 1 && selection === null, {
    hit,
    clicked,
    selection,
  });
  check(`RV5-4(${key}): 見出しの空いた所ではつまみと ⋮ が出る`, actionsShown === 1, { actionsShown });
  check(`想定外のエラーが無い(細い列 ${key})`, unexpectedPageErrors(errors2).length === 0, unexpectedPageErrors(errors2));
  await close2();
}

// ── S8-03: 「今日」のフィルターを開いたまま 0 時をまたぐ ──
if (SUPPORTS.clock) {
  // basic の date 列は 2026-01-01 から 7 日おき。10/14 は該当なし、10/15 は 5 行(n=500)。
  const { page: p4, close: close4, pageErrors: errors4 } = await open('basic', {
    query: 'n=500',
    beforeGoto: (p) => p.clock.install({ time: new Date(2026, 9, 14, 23, 59, 30) }),
  });
  await p4.evaluate(() =>
    window.__grid.applyState({ filters: { columnFilters: { date: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } } }),
  );
  await waitIdle(p4, 300);
  await header(p4, 'date').hover();
  await header(p4, 'date').locator('.ssg-header-actions .ssg-icon-btn').click();
  await waitIdle(p4, 300);
  await p4.locator('.ssg-menu-panel [role="menuitem"]').filter({ hasText: 'フィルター' }).first().click();
  await p4.waitForSelector('.ssg-filter-popover');
  await waitIdle(p4, 400);
  const matched = () => p4.evaluate(() => document.querySelector('.ssg-filter-popover')?.textContent?.match(/一致 (\d+) 件/)?.[1] ?? null);
  const before = await matched();
  await p4.clock.fastForward(60_000);
  await waitIdle(p4, 500);
  const after = await matched();
  check('S8-03: 「今日」のフィルターを開いたまま 0 時をまたぐと、値の木も翌日に移る', before === '0' && after !== null && after !== '0', { before, after });
  check('想定外のエラーが無い(0 時)', unexpectedPageErrors(errors4).length === 0, unexpectedPageErrors(errors4));
  await close4();
} else {
  skip('S8-03: 0 時をまたぐ', '時計を進められないブラウザ');
}

// ── S6-21: 2 つのグリッドの列メニュー ──
{
  const { page: p3, close: close3, pageErrors: errors3 } = await open('two');
  await waitIdle(p3, 300);
  const menuButtons = p3.locator('.ssg-header-cell[data-ssg-col-key="name"] .ssg-icon-btn');
  const count = await menuButtons.count();
  if (count >= 2) {
    await p3.locator('.ssg-header-cell[data-ssg-col-key="name"]').nth(0).hover();
    await menuButtons.nth(0).click();
    await waitIdle(p3, 250);
    const first = await p3.locator('[role="menu"]').count();
    await p3.locator('.ssg-header-cell[data-ssg-col-key="name"]').nth(1).hover();
    await menuButtons.nth(1).click();
    await waitIdle(p3, 250);
    const second = await p3.locator('[role="menu"]').count();
    check('S6-21: 別のグリッドの列メニューを開くと、前のグリッドのメニューは閉じる', first === 1 && second === 1, { first, second });
  } else {
    check('S6-21: 2 つのグリッドの ⋮ が見つかる', false, { count });
  }
  check('想定外のエラーが無い(2 つの表)', unexpectedPageErrors(errors3).length === 0, unexpectedPageErrors(errors3));
  await close3();
}

summary();
