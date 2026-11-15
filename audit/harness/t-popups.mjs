// 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-07): ダイアログの中のグリッドのポップアップ(`popupContainer`)。
//   ?s=dialog&host=native  … 素の <dialog> を showModal() で開く(トップレイヤー。body の直下だとダイアログの後ろに隠れる)
//   ?s=dialog&host=radixlike … Radix(shadcn/ui)の modal の Dialog の模擬(role="dialog" を translate で真ん中に、body に
//                              pointer-events: none、外へのフォーカスは中へ戻す、外側の pointerdown を記録)
//   ?s=dialog&host=mantinelike … Mantine の Modal の形の模擬(1.1.0 の見直し。pointer-events: none の fixed の inner の中に、
//                              transform + overflow-y: auto の section)。ポップアップは inner へ出し、section の枠で切れない。
//   1.0.2 までは、どちらも列メニューの項目・列フィルターの入力・右クリックメニューの項目・select の候補を押せなかった。
//   見るもの: ポップアップがダイアログの中にあり、置いた場所が見出し / セルの近く(translate のずれを打ち消した)で、本物の
//   マウスで押せる・打てる。ダイアログの外へのフォーカス / 押下が起きない。popupContainer="body" で 1.0 と同じ場所へ戻せる。
import { open, check, summary, waitIdle, unexpectedPageErrors, header, cell, events, clearEvents } from './pw.mjs';

// mantinelike は section の外側の inner(host-layer)の中。
const inDialog = (page, selector) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const dialog = document.querySelector('[data-testid="host-layer"]') ?? document.querySelector('[data-testid="host-dialog"]');
    return el !== null && dialog !== null && dialog.contains(el);
  }, selector);

// 要素の真ん中の点に、本物のマウスで当たる要素がその要素の中か(pointer-events: none や重なりで押せないと false)。
const hittable = (page, selector) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: 'none' };
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 12));
    return { ok: hit !== null && el.contains(hit), hit: hit?.className ?? null };
  }, selector);

const rectOf = (page, selector) =>
  page.evaluate((selector) => {
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null;
  }, selector);

for (const host of process.env.SSG_POPUP_HOSTS?.split(',') ?? ['native', 'radixlike', 'mantinelike']) {
  const { page, close, pageErrors } = await open('dialog', { query: `host=${host}&n=60` });
  await waitIdle(page, 300);
  await clearEvents(page);

  // ---- 列メニュー(見出しの右クリック)----
  const headerBox = await header(page, 'qty').boundingBox();
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, { button: 'right' });
  await waitIdle(page, 200);
  const menuRect = await rectOf(page, '.ssg-menu-panel');
  check(`${host}: 列メニューはダイアログの中`, await inDialog(page, '.ssg-menu-panel'));
  check(
    `${host}: 列メニューは見出しの近く(translate のずれを打ち消す)`,
    menuRect !== null &&
      Math.abs(menuRect.top - (headerBox.y + headerBox.height)) < 40 &&
      menuRect.left > headerBox.x - 320 &&
      menuRect.left < headerBox.x + headerBox.width + 40,
    { menuRect, headerBox },
  );
  check(`${host}: 列メニューを本物のマウスで押せる`, (await hittable(page, '.ssg-menu-panel .ssg-menu-item')).ok, await hittable(page, '.ssg-menu-panel .ssg-menu-item'));
  // 「フィルター…」を押して列フィルターを開き、検索欄に打つ。
  const filterItem = page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'フィルター' }).first();
  const filterBox = await filterItem.boundingBox();
  await page.mouse.click(filterBox.x + filterBox.width / 2, filterBox.y + filterBox.height / 2);
  await waitIdle(page, 400);
  check(`${host}: 列フィルターが開き、ダイアログの中`, await inDialog(page, '.ssg-filter-popover'));
  if (host === 'mantinelike') {
    // section の枠(max-height 300px)で切れず、下の端まで押せる。
    const bottomHit = await page.evaluate(() => {
      const el = document.querySelector('.ssg-filter-popover');
      const section = document.querySelector('[data-testid="host-dialog"]');
      if (!el || !section) return { ok: false };
      const rect = el.getBoundingClientRect();
      const box = section.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 6);
      return { ok: hit !== null && el.contains(hit), popoverBottom: rect.bottom, sectionBottom: box.bottom, hit: hit?.className ?? null };
    });
    check('mantinelike: 列フィルターは section の枠で切れず、下の端まで押せる', bottomHit.ok && bottomHit.popoverBottom > bottomHit.sectionBottom, bottomHit);
  }
  const input = page.locator('.ssg-filter-popover input[type="text"], .ssg-filter-popover input[type="number"], .ssg-filter-popover input:not([type])').first();
  const inputBox = await input.boundingBox();
  if (inputBox) {
    await page.mouse.click(inputBox.x + inputBox.width / 2, inputBox.y + inputBox.height / 2);
    await page.keyboard.type('12');
    await waitIdle(page, 150);
  }
  const typed = await input.inputValue().catch(() => null);
  check(`${host}: 列フィルターの入力欄に打てる`, typed === '12', { typed });
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
  check(`${host}: Escape で列フィルターが閉じる(ダイアログは閉じない)`, (await page.locator('.ssg-filter-popover').count()) === 0 && (await page.locator('[data-testid="host-dialog"] .ssg-root').count()) === 1);

  // ---- 右クリックメニュー ----
  await clearEvents(page);
  const cellBox = await cell(page, 2, 'name').boundingBox();
  await page.mouse.click(cellBox.x + 20, cellBox.y + cellBox.height / 2, { button: 'right' });
  await waitIdle(page, 200);
  const ctxRect = await rectOf(page, '.ssg-menu-panel');
  check(`${host}: 右クリックメニューはダイアログの中で、押した点の近く`, (await inDialog(page, '.ssg-menu-panel')) && ctxRect !== null && Math.abs(ctxRect.left - (cellBox.x + 20)) < 24 && Math.abs(ctxRect.top - (cellBox.y + cellBox.height / 2)) < 24, { ctxRect, at: { x: cellBox.x + 20, y: cellBox.y + cellBox.height / 2 } });
  const logItem = page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'ログ' }).first();
  const logBox = await logItem.boundingBox();
  await page.mouse.click(logBox.x + logBox.width / 2, logBox.y + logBox.height / 2);
  await waitIdle(page, 150);
  check(`${host}: 右クリックメニューの項目を押せる`, (await events(page, 'ctx-select')).length === 1, await events(page, 'ctx-select'));

  // ---- Shift+F10(キーボードで開く)----
  await page.mouse.click(cellBox.x + 20, cellBox.y + cellBox.height / 2);
  await waitIdle(page, 100);
  await page.keyboard.press('Shift+F10');
  await waitIdle(page, 200);
  const focusedInMenu = await page.evaluate(() => document.activeElement?.closest('.ssg-menu-panel') !== null && document.activeElement?.getAttribute('role') === 'menuitem');
  check(`${host}: Shift+F10 で開いたメニューの先頭の項目にフォーカス`, focusedInMenu && (await inDialog(page, '.ssg-menu-panel')));
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);

  // ---- select エディタの候補 ----
  const catBox = await cell(page, 1, 'category').boundingBox();
  await page.mouse.dblclick(catBox.x + catBox.width / 2, catBox.y + catBox.height / 2);
  await waitIdle(page, 250);
  check(`${host}: select の候補はダイアログの中`, await inDialog(page, '.ssg-select-editor-popover'));
  const option = page.locator('.ssg-select-editor-option').nth(2);
  const optionText = (await option.textContent())?.trim();
  const optionBox = await option.boundingBox();
  if (optionBox) {
    await page.mouse.click(optionBox.x + optionBox.width / 2, optionBox.y + optionBox.height / 2);
  }
  await waitIdle(page, 200);
  // セルは値(C)を、候補は表示名(カテゴリ C)を出す。
  check(`${host}: select の候補を押して確定できる`, optionText !== undefined && optionText.endsWith(` ${(await cell(page, 1, 'category').textContent())?.trim()}`), { optionText, now: await cell(page, 1, 'category').textContent() });

  // ---- ツールパネル ----
  await page.evaluate(() => window.__grid.openFilterManager());
  await waitIdle(page, 400);
  check(`${host}: ツールパネルはダイアログの中で押せる`, (await inDialog(page, '.ssg-toolpanel')) && (await hittable(page, '.ssg-toolpanel [role="tab"]')).ok);
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);

  // ---- ツールチップ(⋮ にホバー)----
  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await waitIdle(page, 100);
  const trigger = page.locator('.ssg-header-cell[data-ssg-col-key="qty"] [aria-haspopup="menu"]').first();
  const triggerBox = await trigger.boundingBox();
  if (triggerBox) {
    await page.mouse.move(triggerBox.x + triggerBox.width / 2, triggerBox.y + triggerBox.height / 2);
  }
  await waitIdle(page, 900);
  const tipRect = await rectOf(page, '.ssg-tooltip.ssg-tooltip--visible');
  check(
    `${host}: ツールチップはダイアログの中で、対象の近く`,
    (await inDialog(page, '.ssg-tooltip')) &&
      tipRect !== null &&
      triggerBox !== null &&
      (Math.abs(tipRect.top - (triggerBox.y + triggerBox.height)) < 40 || Math.abs(tipRect.bottom - triggerBox.y) < 40) &&
      Math.abs(tipRect.left - triggerBox.x) < 160,
    { tipRect, triggerBox },
  );

  // ---- 列ドラッグのゴースト ----
  // Firefox のヘッドレスは (hover: none) = タッチの扱いで、120px より細い見出しには grip を出さないので広げる(t-pinned と同じ)。
  if (await page.evaluate(() => matchMedia('(hover: none)').matches)) {
    await page.evaluate(() => window.__setColumns(window.__columns().map((c) => (c.key === 'qty' ? { ...c, width: 130 } : c))));
    await waitIdle(page, 200);
  }
  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2);
  await waitIdle(page, 100);
  const grip = header(page, 'qty').locator('.ssg-header-grip').first();
  const gripBox = await grip.boundingBox().catch(() => null);
  if (gripBox) {
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + 80, gripBox.y + 30, { steps: 6 });
    await waitIdle(page, 100);
    const ghost = await page.evaluate(() => {
      const el = document.querySelector('[data-grid-drag-ghost]');
      const dialog = document.querySelector('[data-testid="host-layer"]') ?? document.querySelector('[data-testid="host-dialog"]');
      const rect = el?.getBoundingClientRect();
      return el ? { inDialog: dialog?.contains(el) ?? false, left: rect.left, top: rect.top } : null;
    });
    check(`${host}: 列ドラッグのゴーストはダイアログの中で、ポインタの近く`, ghost !== null && ghost.inDialog && Math.abs(ghost.left - (gripBox.x + 80)) < 60 && Math.abs(ghost.top - (gripBox.y + 30)) < 60, { ghost, pointer: { x: gripBox.x + 80, y: gripBox.y + 30 } });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await waitIdle(page, 200);
  } else {
    check(`${host}: 列ドラッグの grip が見つかる`, false);
  }

  if (host === 'radixlike') {
    check('radixlike: ダイアログの外へフォーカスが出ない / 外を押さない', (await events(page, 'dialog-focus-outside')).length === 0 && (await events(page, 'dialog-pointer-outside')).length === 0, {
      focus: (await events(page, 'dialog-focus-outside')).length,
      pointer: (await events(page, 'dialog-pointer-outside')).length,
    });
  }

  // ---- popupContainer="body" で 1.0 と同じ場所 ----
  await page.evaluate(() => window.__setProps({ popupContainer: 'body' }));
  await waitIdle(page, 100);
  const headerBoxNow = await header(page, 'qty').boundingBox();
  await page.mouse.click(headerBoxNow.x + headerBoxNow.width / 2, headerBoxNow.y + headerBoxNow.height / 2, { button: 'right' });
  await waitIdle(page, 200);
  const inBody = await page.evaluate(() => document.querySelector('.ssg-menu-panel')?.parentElement === document.body);
  check(`${host}: popupContainer="body" では body の直下`, inBody);
  // 1.0.2 までと同じ場所では使えない(このハーネスが不具合を捉えていることの確かめ)。native はダイアログの後ろで押せない。
  //   radixlike はポップアップの root が pointer-events: auto(1.1.0)なので押せるが、ダイアログの外の押下になる(本物は閉じる)。
  //   mantinelike は body の直下でも押せる(inner が pointer-events: none)。
  if (host === 'native') {
    check(`${host}: body の直下だと列メニューを押せない(1.0.2 までの不具合の再現)`, !(await hittable(page, '.ssg-menu-panel .ssg-menu-item')).ok, await hittable(page, '.ssg-menu-panel .ssg-menu-item'));
  } else if (host === 'radixlike') {
    await clearEvents(page);
    const item = await rectOf(page, '.ssg-menu-panel .ssg-menu-item');
    if (item) {
      await page.mouse.move(item.left + 8, item.top + 6);
      await page.mouse.down();
      await page.mouse.up();
      await waitIdle(page, 150);
    }
    check(`${host}: body の直下だと押下がダイアログの外になる(1.0.2 までの不具合の再現)`, (await events(page, 'dialog-pointer-outside')).length > 0, { item, outside: (await events(page, 'dialog-pointer-outside')).length });
  }
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);

  check(`${host}: ページのエラーが無い`, unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---- ダイアログの外(今までどおり body の直下)----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=60' });
  const headerBox = await header(page, 'qty').boundingBox();
  await page.mouse.click(headerBox.x + headerBox.width / 2, headerBox.y + headerBox.height / 2, { button: 'right' });
  await waitIdle(page, 200);
  const result = await page.evaluate(() => {
    const menu = document.querySelector('.ssg-menu-panel');
    return { inBody: menu?.parentElement === document.body, translate: menu ? menu.style.getPropertyValue('translate') : null };
  });
  check('ダイアログの外: 列メニューは body の直下で、translate を書かない', result.inBody && result.translate === '', result);
  check('ダイアログの外: ページのエラーが無い', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

summary();