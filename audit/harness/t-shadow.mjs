// 追加(1.3.0 / Solid 版の品質の段 2 S11-01〜05): Shadow DOM の中のグリッド(?s=shadow。shared.ts の mountPoint が open の
//   Shadow root の中に CSS の <style> と包む要素 .shadow-app を置き、その中にグリッドを描く)。
//   1.2.x では、ツールチップが出ない(S11-01)・imeDirectInput の変換の確定で編集が始まらない(S11-02)・列メニューと右クリック
//   メニューの ↓ がいつも先頭へ / ↑ がいつも末尾へ(S11-03)・ツールパネルを開いてもフォーカスが移らない(S11-04)・ポップアップが
//   document.body の直下に出て見た目が付かない(S11-05)だった。見るもの: どれも本物のマウス / キーで効き、ポップアップは
//   .shadow-app の中に出て Shadow root の中の CSS が当たる。Solid 版は SSG_AUDIT_FRAMEWORK=solid HARNESS_BASE=http://127.0.0.1:5179/。
import { open, check, skip, summary, waitIdle, unexpectedPageErrors, events, clearEvents, BROWSER } from './pw.mjs';

const { page, close, pageErrors } = await open('shadow', { query: 'n=60' });
await waitIdle(page, 300);

// Shadow root の中を見る小道具(page.evaluate の document.querySelector は Shadow root の中を見ない)。
const inShadow = (fn, arg) =>
  page.evaluate(
    ({ source, arg }) => {
      const shadow = document.querySelector('[data-testid="shadow-host"]').shadowRoot;
      return new Function('shadow', 'arg', `return (${source})(shadow, arg);`)(shadow, arg);
    },
    { source: fn.toString(), arg },
  );
const rectIn = (selector) =>
  inShadow((shadow, selector) => {
    const rect = shadow.querySelector(selector)?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;
  }, selector);
const clickIn = async (selector, options) => {
  const rect = await rectIn(selector);
  if (!rect) throw new Error(`見つかりません: ${selector}`);
  await page.mouse.click(rect.x + rect.width / 2, rect.y + Math.min(rect.height / 2, 12), options);
};
const focused = () =>
  inShadow((shadow) => {
    const el = shadow.activeElement;
    return el ? { tag: el.tagName, cls: el.className, text: el.textContent?.trim() ?? '', role: el.getAttribute('role') } : null;
  });

// ---- CSS とグリッドの置き場 ----
const placement = await inShadow((shadow) => ({
  inShadow: shadow.querySelector('.shadow-app .ssg-root') !== null,
  inDocument: document.querySelector('.ssg-root') !== null,
  // Shadow root の中の CSS が当たっていれば、.ssg-root にトークンが決まる。
  token: getComputedStyle(shadow.querySelector('.ssg-root')).getPropertyValue('--ssg-panel-bg').trim(),
}));
check('グリッドは Shadow root の中(document からは見えない)', placement.inShadow && !placement.inDocument, placement);
check('Shadow root の中の CSS が当たる(.ssg-root にトークン)', placement.token !== '', placement);

// ---- S11-01 ツールチップ(本物のマウスで、見出しの ⋮ = data-ssg-tooltip に乗る)----
await page.mouse.move(5, 5);
await waitIdle(page, 200);
const tipTarget = await inShadow((shadow) => {
  const el = [...shadow.querySelectorAll('.ssg-root [data-ssg-tooltip]')].find((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.getAttribute('data-ssg-tooltip') };
});
if (tipTarget) {
  await page.mouse.move(tipTarget.x, tipTarget.y, { steps: 4 });
  await waitIdle(page, 900);
  const tip = await inShadow((shadow) => {
    const el = shadow.querySelector('.ssg-tooltip');
    return el ? { visible: el.classList.contains('ssg-tooltip--visible'), text: el.textContent, bg: getComputedStyle(el).backgroundColor } : null;
  });
  check('S11-01: ツールチップが Shadow root の中に出る', tip?.visible === true && tip.text === tipTarget.text, { tip, tipTarget });
  check('S11-01: ツールチップに Shadow root の中の CSS が当たる(背景が透明でない)', tip !== null && tip.bg !== 'rgba(0, 0, 0, 0)', tip);
  await page.mouse.move(5, 5);
  await waitIdle(page, 300);
} else {
  check('S11-01: data-ssg-tooltip の要素がある', false);
}

// ---- S11-03 / S11-05 列メニュー(Alt+↓)----
await clickIn('.ssg-body-row[data-row-index="1"] .ssg-body-cell[data-ssg-col-key="qty"]');
await waitIdle(page, 200);
await page.keyboard.press('Alt+ArrowDown');
await waitIdle(page, 400);
const menu = await inShadow((shadow) => {
  const panel = shadow.querySelector('.ssg-menu-panel');
  return panel
    ? { parent: panel.parentElement?.className ?? null, bg: getComputedStyle(panel).backgroundColor, position: getComputedStyle(panel).position, inBody: document.body.querySelector(':scope > .ssg-menu-panel') !== null }
    : null;
});
check('S11-05: 列メニューは Shadow root の中のグリッドを包む要素の中', menu?.parent === 'shadow-app' && menu.inBody === false, menu);
check('S11-05: 列メニューに見た目が付く(背景が透明でない・fixed)', menu !== null && menu.bg !== 'rgba(0, 0, 0, 0)' && menu.position === 'fixed', menu);
const items = await inShadow((shadow) => [...shadow.querySelectorAll('.ssg-menu-panel .ssg-menu-item:not(:disabled)')].map((e) => e.textContent.trim()));
const first = await focused();
await page.keyboard.press('ArrowDown');
await waitIdle(page, 80);
const second = await focused();
await page.keyboard.press('ArrowDown');
await waitIdle(page, 80);
const third = await focused();
await page.keyboard.press('ArrowUp');
await waitIdle(page, 80);
const back = await focused();
check(
  'S11-03: 列メニューの ↓ で 1 つずつ下へ、↑ で 1 つ上へ',
  first?.text === items[0] && second?.text === items[1] && third?.text === items[2] && back?.text === items[1],
  { items: items.slice(0, 3), first: first?.text, second: second?.text, third: third?.text, back: back?.text },
);
// 「フィルター…」の列フィルターの入力に本物のキーで打てる(Shadow root の中のポップオーバー)。
const hasFilterItem = await inShadow((shadow) => {
  const item = [...shadow.querySelectorAll('.ssg-menu-panel .ssg-menu-item:not(:disabled)')].find((e) => e.textContent.trim().startsWith('フィルター'));
  item?.setAttribute('data-test-target', 'filter');
  return item !== undefined;
});
if (hasFilterItem) {
  await clickIn('[data-test-target="filter"]');
  await waitIdle(page, 500);
  const popover = await inShadow((shadow) => {
    const el = shadow.querySelector('.ssg-filter-popover');
    return el ? { parent: el.parentElement?.className ?? null, active: shadow.activeElement?.tagName ?? null } : null;
  });
  if (popover) {
    check('S11-05: 列フィルターは Shadow root の中で、中の入力欄にフォーカス', popover.parent === 'shadow-app' && popover.active === 'INPUT', popover);
    await page.keyboard.press('Escape');
    await waitIdle(page, 300);
  } else {
    check('S11-05: 列フィルターが開く', false);
  }
}
await page.keyboard.press('Escape');
await waitIdle(page, 300);

// ---- S11-03 右クリックメニュー(Shift+F10)と、中の押下で閉じない ----
await clickIn('.ssg-body-row[data-row-index="2"] .ssg-body-cell[data-ssg-col-key="name"]');
await waitIdle(page, 200);
await clearEvents(page);
await page.keyboard.press('Shift+F10');
await waitIdle(page, 400);
const ctxItems = await inShadow((shadow) => [...shadow.querySelectorAll('.ssg-context-menu [role="menuitem"]:not([aria-disabled="true"]), [role="menu"] [role="menuitem"]')].map((e) => e.textContent.trim()));
const ctxFirst = await focused();
await page.keyboard.press('ArrowDown');
await waitIdle(page, 80);
const ctxSecond = await focused();
check('S11-03: 右クリックメニューの ↓ で次の項目へ', ctxFirst?.text === ctxItems[0] && ctxSecond?.text === ctxItems[1], { ctxItems, first: ctxFirst?.text, second: ctxSecond?.text });
const ctxParent = await inShadow((shadow) => shadow.querySelector('[role="menu"]')?.parentElement?.className ?? null);
check('S11-05: 右クリックメニューは Shadow root の中', ctxParent === 'shadow-app', { ctxParent });
// 「ログ」を本物のマウスで押すと、項目が動いて閉じる(1.2.x は押下を外側と見て、先に閉じていた)。
await inShadow((shadow) => {
  const item = [...shadow.querySelectorAll('[role="menu"] [role="menuitem"]')].find((e) => e.textContent.trim() === 'ログ');
  item?.setAttribute('data-test-target', 'log');
});
await clickIn('[data-test-target="log"]');
await waitIdle(page, 300);
const selected = await events(page, 'ctx-select');
const ctxOpen = await inShadow((shadow) => shadow.querySelector('[role="menu"]') !== null);
check('S11-03: 右クリックメニューの項目を本物のマウスで押せる', selected.length === 1 && !ctxOpen, { selected: selected.length, ctxOpen });

// ---- 外側の押下でメニューが閉じる(Shadow root の外 = ページの余白)----
await clickIn('.ssg-body-row[data-row-index="2"] .ssg-body-cell[data-ssg-col-key="name"]');
await page.keyboard.press('Shift+F10');
await waitIdle(page, 300);
const viewport = page.viewportSize?.() ?? { width: 1400, height: 800 };
await page.mouse.click(viewport.width - 10, viewport.height - 10);
await waitIdle(page, 300);
check('Shadow root の外を押すと右クリックメニューが閉じる', !(await inShadow((shadow) => shadow.querySelector('[role="menu"]') !== null)));

// ---- S11-04 ツールパネルのフォーカスと Escape ----
await clickIn('.ssg-body-row[data-row-index="1"] .ssg-body-cell[data-ssg-col-key="name"]');
await waitIdle(page, 200);
await page.evaluate(() => window.__grid.openFilterManager());
await waitIdle(page, 700);
const panel = await inShadow((shadow) => {
  const el = shadow.querySelector('.ssg-toolpanel');
  const tab = el?.querySelector('[role="tab"][aria-selected="true"]');
  return el ? { parent: el.parentElement?.className ?? null, focusedTab: tab !== null && shadow.activeElement === tab } : null;
});
check('S11-04: ツールパネルは Shadow root の中で、開くと選ばれたタブへフォーカス', panel?.parent === 'shadow-app' && panel.focusedTab === true, panel);
await page.keyboard.press('Escape');
await waitIdle(page, 500);
const afterPanel = await inShadow((shadow) => ({
  open: shadow.querySelector('.ssg-toolpanel--open') !== null,
  inGrid: shadow.querySelector('.ssg-shell')?.contains(shadow.activeElement) === true,
  docActive: document.activeElement?.tagName ?? null,
}));
check('S11-04: Escape で閉じ、フォーカスはグリッドへ戻る(BODY に落ちない)', !afterPanel.open && afterPanel.inGrid && afterPanel.docActive !== 'BODY', afterPanel);

// ---- S11-02 imeDirectInput(CDP の IME の模擬。Chromium だけ)----
if (BROWSER !== 'chromium') {
  skip('S11-02: imeDirectInput の変換の確定で編集が始まる', 'CDP の IME の模擬が要る(Chromium だけ)');
} else {
  await page.evaluate(() => window.__setProps({ imeDirectInput: true }));
  await waitIdle(page, 300);
  await clickIn('.ssg-body-row[data-row-index="3"] .ssg-body-cell[data-ssg-col-key="name"]');
  await waitIdle(page, 300);
  const imeFocused = await inShadow((shadow) => shadow.activeElement?.hasAttribute('data-ssg-ime-input') === true);
  check('S11-02: セルを押すと入力受けにフォーカス', imeFocused);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.imeSetComposition', { text: 'てすと', selectionStart: 3, selectionEnd: 3 });
  await waitIdle(page, 150);
  await cdp.send('Input.insertText', { text: 'テスト' });
  await waitIdle(page, 500);
  const editor = await inShadow((shadow) => shadow.querySelector('.ssg-cell-editor-input')?.value ?? null);
  check('S11-02: 変換を確定すると、その文字で編集が始まる', editor === 'テスト', { editor });
  await page.keyboard.press('Escape');
  await waitIdle(page, 200);
}

check('想定外のエラーが無い', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
await close();
summary();