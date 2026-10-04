// 100 万行(uniform)での縦スクロール / API / ソート / フィルターの検証。
import { OUT, open, check, summary, errorsOf, renderedRowIndexes, cellText, scrollTo, focusGrid, waitIdle, events, clearEvents } from './pw.mjs';

const { page, pageErrors, close } = await open('big');
const N = 1_000_000;
const sc = () => page.evaluate(() => {
  const el = document.querySelector('.ssg-scroll-container');
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
});

check('initial rows rendered', (await renderedRowIndexes(page)).length > 0);
console.log('metrics', await sc());

// 末尾へ(API)
await page.evaluate(() => window.__grid.scrollToBottom());
await waitIdle(page, 200);
let idx = await renderedRowIndexes(page);
check('scrollToBottom renders last row', idx.at(-1) === N - 1, { last: idx.at(-1), count: idx.length, metrics: await sc() });
check('last row text', (await cellText(page, N - 1, 'id')) === String(N), await cellText(page, N - 1, 'id'));
let range = await page.evaluate(() => window.__grid.getVisibleRowRange());
check('getVisibleRowRange end at bottom', range && range.endIndex === N, range);

// 先頭へ
await page.evaluate(() => window.__grid.scrollToTop());
await waitIdle(page, 200);
idx = await renderedRowIndexes(page);
check('scrollToTop renders row 0', idx[0] === 0, { first: idx[0] });

// 任意行へ(align 各種)
for (const align of ['start', 'center', 'end', 'auto']) {
  const target = 123_456;
  await page.evaluate(({ target, align }) => window.__grid.scrollToRow(target, { align }), { target, align });
  await waitIdle(page, 200);
  idx = await renderedRowIndexes(page);
  const visible = await page.evaluate((t) => {
    const el = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${t}"]`);
    if (!el) return null;
    const sc = document.querySelector('.ssg-scroll-container');
    const r = el.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    const header = document.querySelector('.ssg-header-row')?.getBoundingClientRect().height ?? 0;
    return { top: r.top - s.top - header, bottom: r.bottom - s.top, viewportH: s.height, rowH: r.height };
  }, target);
  check(`scrollToRow(${target}, ${align}) target row visible`, visible && visible.top >= -1 && visible.bottom <= visible.viewportH + 1, { align, visible, first: idx[0], last: idx.at(-1) });
  const text = await cellText(page, target, 'id');
  check(`scrollToRow(${align}) row content correct`, text === String(target + 1), text);
}

// 手動スクロール: scrollTop を最大に
const m = await sc();
await scrollTo(page, m.scrollHeight);
await waitIdle(page, 250);
idx = await renderedRowIndexes(page);
check('manual scroll to max renders last row', idx.at(-1) === N - 1, { last: idx.at(-1), metrics: await sc() });

// 中間(scroll-space 圧縮)で行番号と内容の整合
await scrollTo(page, Math.floor(m.scrollHeight * 0.5));
await waitIdle(page, 250);
idx = await renderedRowIndexes(page);
const midText = await cellText(page, idx[0], 'id');
check('mid scroll content matches index', midText === String(idx[0] + 1), { idx0: idx[0], midText });
// 連続する行 index に抜けがないか
const gaps = idx.filter((v, i) => i > 0 && v !== idx[i - 1] + 1);
check('no gaps in rendered window', gaps.length === 0, { gaps, idx });

// ホイール風の細かいスクロール連打で安定か
await page.evaluate(() => window.__grid.scrollToRow(500_000, { align: 'start' }));
await waitIdle(page, 150);
const before = await sc();
for (let i = 0; i < 10; i += 1) {
  await page.mouse.move(700, 300);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(30);
}
await waitIdle(page, 200);
const after = await sc();
idx = await renderedRowIndexes(page);
check('wheel scroll advanced monotonic & content ok', after.scrollTop > before.scrollTop && (await cellText(page, idx[0], 'id')) === String(idx[0] + 1), { before: before.scrollTop, after: after.scrollTop, idx0: idx[0] });

// scrollHint バブル表示(スクロール中)
const bubble = await page.evaluate(() => document.querySelector('[class*="scrollhint"], [class*="scroll-hint"]')?.className ?? null);
console.log('scrollHint elements', await page.evaluate(() => [...document.querySelectorAll('[class*="scrollhint"], [class*="scroll-hint"]')].map((e) => e.className).slice(0, 10)));

// ソート(100 万行)の時間と結果
await clearEvents(page);
const t0 = Date.now();
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'qty', direction: 'desc' }] }));
await page.waitForFunction(() => window.__events.some((e) => e.type === 'onSortChange'), null, { timeout: 60000 });
await waitIdle(page, 500);
const sortMs = Date.now() - t0;
await page.evaluate(() => window.__grid.scrollToTop());
await waitIdle(page, 300);
const q0 = await cellText(page, 0, 'qty');
const q1 = await cellText(page, 1, 'qty');
check('sort desc applied (first >= second)', Number(q0.replace(/,/g, '')) >= Number(q1.replace(/,/g, '')), { q0, q1, sortMs });
console.log('sort 1M rows took ms', sortMs);

// グローバルフィルター(入力)
const t1 = Date.now();
await page.fill('.ssg-bar-input', 'item-0999');
await page.waitForFunction(() => /Rows: \d/.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 60000 });
// 行名は 6 桁ゼロ埋め(item-000001)なので、'item-0999' に一致するのは item-099900..099999 の 100 行。
await page.waitForFunction(() => /Rows: 100 \//.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
await waitIdle(page, 500);
const bottom = await page.locator('.ssg-bar--bottom').textContent();
console.log('global filter took ms', Date.now() - t1, bottom);
check('global filter narrows rows (100 rows: item-099900..099999)', /Rows: 100 \//.test(bottom), bottom);
await page.fill('.ssg-bar-input', '');
await waitIdle(page, 800);

// 件数表示
const bottom2 = await page.locator('.ssg-bar--bottom').textContent();
check('row count restored', bottom2.includes('1,000,000') || bottom2.includes('1000000'), bottom2);

const errs = await errorsOf(page);
check('no console errors', errs.length === 0 && pageErrors.length === 0, [...errs, ...pageErrors].slice(0, 10));
await page.screenshot({ path: OUT + 'shot-big.png' });
summary();
await close();