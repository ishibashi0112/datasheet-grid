import { open, check, summary, waitIdle } from './pw.mjs';
const { page, close } = await open('big');
const measure = async (label, fn) => {
  const r = await page.evaluate(async (src) => {
    const fn = new Function('return (' + src + ')')();
    const t0 = performance.now();
    await fn();
    const sync = performance.now() - t0;
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { sync: Math.round(sync), toPaint: Math.round(performance.now() - t0) };
  }, fn.toString());
  console.log(label, r);
  return r;
};
const S = (sort) => `() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: ${JSON.stringify(sort)} })`;
await measure('sort qty desc (numeric, nulls)', new Function('return ' + S([{ columnKey: 'qty', direction: 'desc' }]))());
await waitIdle(page, 300);
await measure('sort none', new Function('return ' + S([]))());
await waitIdle(page, 300);
await measure('sort id asc (numeric)', new Function('return ' + S([{ columnKey: 'id', direction: 'asc' }]))());
await waitIdle(page, 300);
await measure('sort name desc (string)', new Function('return ' + S([{ columnKey: 'name', direction: 'desc' }]))());
await waitIdle(page, 300);
await measure('sort category asc + id desc (2 cols)', new Function('return ' + S([{ columnKey: 'category', direction: 'asc' }, { columnKey: 'id', direction: 'desc' }]))());
await waitIdle(page, 300);
await measure('sort none', new Function('return ' + S([]))());
// 列フィルター(set)
const F = (cf) => `() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: ${JSON.stringify(cf)} }, sort: [] })`;
await measure('set filter category=A', new Function('return ' + F({ category: { kind: 'set', values: ['A'] } }))());
await waitIdle(page, 300);
console.log('bottom:', await page.locator('.ssg-bar--bottom').textContent());
await measure('text filter name contains 0999', new Function('return ' + F({ name: { kind: 'text', value: '0999' } }))());
await waitIdle(page, 300);
console.log('bottom:', await page.locator('.ssg-bar--bottom').textContent());
await measure('clear filters', new Function('return ' + F({}))());
// グローバルフィルター(入力 → 完了まで)
const t0 = Date.now();
await page.fill('.ssg-bar-input', 'item-0999');
await page.waitForFunction(() => /Rows: 100 \//.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 120000 });
console.log('global filter typed→100 rows shown ms', Date.now() - t0);
const t1 = Date.now();
await page.fill('.ssg-bar-input', '');
await page.waitForFunction(() => /Rows: 1000000 \//.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 120000 });
console.log('global filter cleared→1M rows ms', Date.now() - t1);
// 1M 行で Ctrl+A → コピー(TSV)の時間 / メモリ
await page.locator('.ssg-shell').focus();
await page.evaluate(() => window.__grid.selectCell(0, 1));
const t2 = Date.now();
await page.keyboard.press('Control+A');
await waitIdle(page, 100);
console.log('ctrl+A ms', Date.now() - t2, await page.locator('.ssg-bar--bottom').textContent());
const r = await page.evaluate(() => { const t = performance.now(); const csv = window.__grid.exportCsv({ scope: 'view' }); return { ms: Math.round(performance.now() - t), len: csv.length }; });
console.log('exportCsv 1M rows', r);
await close();