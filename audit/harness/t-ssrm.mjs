// SSRM(serverSide)モックでの取得 / 競合 / エラー / 書き戻し / refresh の検証。
import { open, check, summary, errorsOf, renderedRowIndexes, cellText, cell, scrollTo, focusGrid, waitIdle, events, clearEvents } from './pw.mjs';

const { page, pageErrors, close } = await open('ssrm');
const ctl = () => page.evaluate(() => ({ ...window.__ssrm, server: undefined, calls: window.__ssrm.calls.map((c) => ({ ...c })) }));
const waitLoaded = async (rowIndex, timeout = 5000) => {
  await page.waitForFunction((r) => {
    const el = document.querySelector(`.ssg-center-pane .ssg-body-row[data-row-index="${r}"]`);
    return el && !el.querySelector('.ssg-skeleton-bar') && (el.textContent ?? '').trim() !== '';
  }, rowIndex, { timeout });
};

await waitLoaded(0);
let c = await ctl();
check('initial getRows called with [0, ...)', c.calls.length >= 1 && c.calls[0].startIndex === 0, c.calls.map((x) => [x.startIndex, x.endIndex, x.outcome]));
check('initial row content', (await cellText(page, 0, 'name')) === 'item-000001', await cellText(page, 0, 'name'));
const bottomText = await page.locator('.ssg-bar--bottom').textContent();
check('bottom bar shows total 10,000', /10[,.]?000/.test(bottomText), bottomText);

// スクロール連打で abort が効くか・到着順逆転で古いブロックが表示を汚さないか
await page.evaluate(() => { window.__ssrm.latency = 120; window.__ssrm.calls.length = 0; });
for (const top of [2000, 9000, 20000, 40000, 80000, 120000]) await scrollTo(page, top);
await waitIdle(page, 600);
c = await ctl();
const idx = await renderedRowIndexes(page);
await waitLoaded(idx[0], 5000).catch(() => {});
const txt = await cellText(page, idx[0], 'id');
check('after rapid scroll, visible row content matches index', txt === String(idx[0] + 1), { idx0: idx[0], txt, calls: c.calls.map((x) => [x.startIndex, x.endIndex, x.outcome]), maxInflight: c.maxInflight });
check('some requests were aborted or no request bursts (inflight bounded)', c.maxInflight <= 8, { maxInflight: c.maxInflight });

// 末尾へ
await page.evaluate(() => window.__grid.scrollToBottom());
await waitIdle(page, 400);
await waitLoaded(9999, 5000).catch(() => {});
check('last row loaded', (await cellText(page, 9999, 'id')) === '10000', await cellText(page, 9999, 'id'));
c = await ctl();
check('getRows never exceeds total (endIndex <= 10000)', c.calls.every((x) => x.endIndex <= 10000), c.calls.filter((x) => x.endIndex > 10000).map((x) => [x.startIndex, x.endIndex]));

// ソート → query に載る / 先頭へリセット
await page.evaluate(() => { window.__ssrm.latency = 30; window.__ssrm.calls.length = 0; });
await clearEvents(page);
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'id', direction: 'desc' }] }));
await page.waitForFunction(() => window.__ssrm.calls.some((x) => x.query?.sort?.length === 1 && x.outcome === 'ok'), null, { timeout: 5000 });
await waitIdle(page, 300);
c = await ctl();
check('sort sent to server in query', c.calls.some((x) => x.query.sort?.[0]?.columnKey === 'id'), c.calls.map((x) => [x.startIndex, x.endIndex, JSON.stringify(x.query)]));
const st = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
check('query change resets scroll to top', st === 0, st);
await waitLoaded(0);
check('row 0 is id 10000 after desc sort', (await cellText(page, 0, 'id')) === '10000', await cellText(page, 0, 'id'));

// グローバルフィルター(debounce 300ms)→ 件数追従
await page.evaluate(() => { window.__ssrm.calls.length = 0; });
await page.fill('.ssg-bar-input', 'item-00001');
await page.waitForFunction(() => window.__ssrm.calls.some((x) => x.query?.globalText === 'item-00001' && x.outcome === 'ok'), null, { timeout: 5000 });
await waitIdle(page, 300);
const bt = await page.locator('.ssg-bar--bottom').textContent();
check('filtered total reflected (11 rows: item-000010..19 + 000001)', /Rows: 11\b/.test(bt), bt);
c = await ctl();
check('debounced: only few getRows for typed text', c.calls.filter((x) => x.query.globalText && x.query.globalText !== 'item-00001').length <= 2, c.calls.map((x) => x.query.globalText));
await page.fill('.ssg-bar-input', '');
await page.waitForFunction(() => /10[,.]?000/.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 5000 });

// 失敗 → エラーバー → 再試行
await page.evaluate(() => window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [] }));
await waitIdle(page, 500);
await page.evaluate(() => { window.__ssrm.failRanges = [[3000, 3300]]; window.__ssrm.calls.length = 0; });
await clearEvents(page);
await page.evaluate(() => window.__grid.scrollToRow(3050, { align: 'start' }));
await page.waitForSelector('.ssg-ssrm-error-bar', { timeout: 5000 }).catch(() => {});
const barVisible = await page.locator('.ssg-ssrm-error-bar').count();
check('error bar shown on getRows failure', barVisible > 0);
const loadErr = await events(page, 'onServerSideLoadError');
check('onServerSideLoadError fired', loadErr.length >= 1, loadErr.map((e) => e.payload));
const barText = await page.locator('.ssg-ssrm-error-bar').first().textContent().catch(() => '');
console.log('error bar text:', barText);
await page.evaluate(() => { window.__ssrm.failRanges = []; });
await page.locator('.ssg-ssrm-error-bar-retry').first().click().catch(() => {});
await waitLoaded(3050, 5000).catch(() => {});
check('retry recovers row content', (await cellText(page, 3050, 'id')) === '3051', await cellText(page, 3050, 'id'));
await waitIdle(page, 300);
check('error bar hidden after recovery', (await page.locator('.ssg-ssrm-error-bar').count()) === 0);

// 書き戻し: 成功
await page.evaluate(() => window.__grid.scrollToTop());
await waitLoaded(0);
await cell(page, 0, 'name').dblclick();
await waitIdle(page);
const editorVisible = await page.locator('.ssg-cell-editor-input').count();
check('editor opens in SSRM with updateRows', editorVisible > 0);
await page.keyboard.press('Control+A');
await page.keyboard.type('renamed-0');
await page.keyboard.press('Enter');
await waitIdle(page, 100);
check('optimistic value shown immediately', (await cellText(page, 0, 'name')) === 'renamed-0', await cellText(page, 0, 'name'));
await waitIdle(page, 200);
c = await ctl();
check('updateRows called once with 1 update', c.updates.length === 1 && c.updates[0].length === 1, JSON.stringify(c.updates).slice(0, 300));
check('update rowKey is rowKeyGetter value (id=1)', c.updates[0]?.[0]?.rowKey === 1, c.updates[0]?.[0]?.rowKey);
check('server stored the value', await page.evaluate(() => window.__ssrm.server[0].name === 'renamed-0'));

// 書き戻し: 失敗 → ロールバック + バー + 通知
await page.evaluate(() => { window.__ssrm.updateFail = true; });
await clearEvents(page);
await cell(page, 1, 'name').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('will-fail');
await page.keyboard.press('Enter');
await waitIdle(page, 50);
const optimistic = await cellText(page, 1, 'name');
await waitIdle(page, 300);
const rolledBack = await cellText(page, 1, 'name');
check('failed write rolls back', optimistic === 'will-fail' && rolledBack === 'item-000002', { optimistic, rolledBack });
const werr = await events(page, 'onServerSideWriteError');
check('onServerSideWriteError fired', werr.length === 1, werr.map((e) => e.payload));
check('write error bar shown', (await page.locator('.ssg-ssrm-error-bar').count()) > 0, await page.locator('.ssg-ssrm-error-bars').textContent().catch(() => ''));
await page.evaluate(() => { window.__ssrm.updateFail = false; });

// 同一行の連続編集(前の確定前に再編集)
await page.evaluate(() => { window.__ssrm.updateLatency = 400; });
await cell(page, 2, 'name').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('first');
await page.keyboard.press('Enter');
await waitIdle(page, 50);
await cell(page, 2, 'name').dblclick();
await page.keyboard.press('Control+A');
await page.keyboard.type('second');
await page.keyboard.press('Enter');
await waitIdle(page, 1000);
check('rapid double edit keeps latest', (await cellText(page, 2, 'name')) === 'second', await cellText(page, 2, 'name'));
await page.evaluate(() => { window.__ssrm.updateLatency = 10; });

// refreshServerSide: 外部更新を反映・スクロール位置維持
await page.evaluate(() => window.__grid.scrollToRow(200, { align: 'start' }));
await waitLoaded(200);
const stBefore = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
await page.evaluate(() => { window.__ssrm.server[200].name = 'external-200'; window.__grid.refreshServerSide(); });
await page.waitForFunction(() => (document.querySelector('.ssg-center-pane .ssg-body-row[data-row-index="200"] .ssg-body-cell[data-ssg-col-key="name"]')?.textContent ?? '').includes('external'), null, { timeout: 5000 }).catch(() => {});
const stAfter = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
check('refreshServerSide reflects external change', (await cellText(page, 200, 'name')) === 'external-200', await cellText(page, 200, 'name'));
check('refreshServerSide keeps scroll position', stBefore === stAfter, { stBefore, stAfter });

// 件数が減る refresh(total 10000 → 150)
await page.evaluate(() => { window.__ssrm.server = window.__ssrm.server.slice(0, 150); window.__grid.refreshServerSide(); });
await page.waitForFunction(() => /Rows: 150\b/.test(document.querySelector('.ssg-bar--bottom')?.textContent ?? ''), null, { timeout: 5000 }).catch(() => {});
const bt2 = await page.locator('.ssg-bar--bottom').textContent();
check('shrunk total reflected after refresh', /Rows: 150\b/.test(bt2), bt2);
await waitIdle(page, 300);
const idx2 = await renderedRowIndexes(page);
check('no rows rendered beyond new total', idx2.every((i) => i < 150), { max: idx2.at(-1) });
const scm = await page.evaluate(() => { const el = document.querySelector('.ssg-scroll-container'); return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }; });
check('scrollTop clamped within new scrollHeight', scm.scrollTop <= scm.scrollHeight - scm.clientHeight + 1, scm);

// ペースト(複数行)→ updateRows 1 回に集約、未ロード行スキップ
await page.evaluate(() => { window.__ssrm.updates.length = 0; });
await page.evaluate(() => window.__grid.scrollToTop());
await waitLoaded(0);
await page.evaluate(() => window.__grid.selectCell(0, 1));
await focusGrid(page);
await page.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/plain', 'p1\tp2\np3\tp4');
  document.querySelector('.ssg-shell').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await waitIdle(page, 300);
c = await ctl();
check('paste in SSRM → 1 updateRows call with 2 row updates', c.updates.length === 1 && c.updates[0].length === 2, JSON.stringify(c.updates).slice(0, 400));
check('pasted values displayed', (await cellText(page, 0, 'name')) === 'p1' && (await cellText(page, 1, 'name')) === 'p3', [await cellText(page, 0, 'name'), await cellText(page, 1, 'name')]);

// undo は無効(SSRM)
const canUndo = await page.evaluate(() => window.__grid.canUndo());
check('undo disabled in SSRM', canUndo === false, canUndo);
// getInvalidCells は空 + warn
await errorsOf(page);
const inv = await page.evaluate(() => window.__grid.getInvalidCells());
const warns = await errorsOf(page);
check('getInvalidCells in SSRM → [] + warn', Array.isArray(inv) && inv.length === 0 && warns.some((w) => w.startsWith('[warn]')), { inv, warns });
// exportCsv scope raw → warn + view fallback
const csv = await page.evaluate(() => window.__grid.exportCsv({ scope: 'raw' }));
const warns2 = await errorsOf(page);
check('exportCsv raw in SSRM warns and returns loaded rows', typeof csv === 'string' && csv.length > 0 && warns2.length >= 1, { lines: csv.split('\r\n').length, warns2 });

const errs = await errorsOf(page);
check('no unexpected console errors', errs.filter((e) => e.startsWith('[error]') || e.startsWith('[window') || e.startsWith('[unhandled')).length === 0 && pageErrors.filter((e) => !e.includes('mock')).length === 0, [...errs, ...pageErrors].slice(0, 10));
await page.screenshot({ path: 'shot-ssrm.png' });
summary();
await close();