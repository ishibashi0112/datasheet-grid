// 2026-10-04 監査で見送っていた B-09 / B-10 / M-04 / L-15 の実ブラウザ確認(2026-10-12 に対応)。
//   B-11(同値の dispatch を no-op に)は reducer の単体テストで固定し、ここでは全体の回帰(他のシナリオ)で見る。
import { open, check, summary, waitIdle, cellText, events, clearEvents } from './pw.mjs';

const bottomText = (page) => page.locator('.ssg-bar--bottom').textContent();
const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// ---- B-09: flex の配分幅は整数 px で、合計は利用可能幅を超えない(横スクロールバーが出ない) ----
for (const width of [1001, 1003, 1213, 1366, 1427]) {
  const { page, close } = await open('basic', { query: 'n=50', viewport: { width, height: 700 } });
  await page.evaluate(() => {
    const keep = new Set(['id', 'name', 'price', 'category', 'date']);
    window.__setColumns(
      window
        .__columns()
        .filter((c) => keep.has(c.key))
        .map((c) =>
          c.key === 'price' ? { ...c, flex: 1, minWidth: 60 } : c.key === 'category' ? { ...c, flex: 2, minWidth: 60 } : c.key === 'date' ? { ...c, flex: 1, minWidth: 60 } : c,
        ),
    );
  });
  await waitIdle(page, 250);
  const geo = await page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container');
    const widths = {};
    for (const key of ['price', 'category', 'date']) {
      const el = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      widths[key] = el ? parseFloat(el.style.width) : null;
    }
    return { widths, scrollWidth: sc.scrollWidth, clientWidth: sc.clientWidth };
  });
  const integers = Object.values(geo.widths).every((w) => w !== null && Number.isInteger(w));
  check(`B-09: flex widths are integer px (viewport ${width})`, integers, geo.widths);
  check(`B-09: no horizontal overflow from flex (viewport ${width})`, geo.scrollWidth <= geo.clientWidth, geo);
  await close();
}

// ---- L-15: 相対日付プリセット(今日)が日付をまたぐと自動で翌日の範囲になる ----
//   basic の date 列は 2026-01-01 から 7 日おき。10/14 は該当なし、10/15 は 5 行(n=500)。
const TODAY_STATE = {
  version: 1,
  columnWidths: {},
  filters: { globalText: '', columnFilters: { date: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } },
  sort: [],
};
{
  const { page, pageErrors, close } = await open('basic', {
    query: 'n=500',
    beforeGoto: (p) => p.clock.install({ time: new Date(2026, 9, 14, 23, 59, 30) }),
  });
  await page.evaluate((s) => window.__grid.applyState(s), TODAY_STATE);
  await waitIdle(page, 300);
  const before = await bottomText(page);
  check('L-15: today (2026-10-14) matches no rows', /Rows: 0 \/ 500/.test(before), before);
  // 深夜 0 時を越える(タイマーが発火)。他の入力は何も変えない。
  await page.clock.fastForward(60_000);
  await waitIdle(page, 400);
  const after = await bottomText(page);
  const dates = await page.evaluate(() => window.__grid.getExportData({ scope: 'view' }).rows.map((r) => r[5]));
  check('L-15: after midnight, today follows to 2026-10-15 without other input', /Rows: 5 \/ 500/.test(after), { after, dates });
  // 翌々日の 0 時にも追従する(10/16 は該当なし)。
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  await waitIdle(page, 400);
  const nextDay = await bottomText(page);
  check('L-15: and again on the next midnight (2026-10-16)', /Rows: 0 \/ 500/.test(nextDay), nextDay);
  check('L-15: no page errors', pageErrors.length === 0, pageErrors.slice(0, 3));
  await close();
}
// 見張り中にタブが前面へ戻ったら(スリープ明け)確かめ直す: タイマーを発火させずに時計だけ進めて focus を送る。
{
  const { page, close } = await open('basic', {
    query: 'n=500',
    beforeGoto: (p) => p.clock.install({ time: new Date(2026, 9, 14, 23, 0, 0) }),
  });
  await page.evaluate((s) => window.__grid.applyState(s), TODAY_STATE);
  await waitIdle(page, 300);
  await page.clock.pauseAt(new Date(2026, 9, 14, 23, 30, 0));
  // pauseAt 以降はタイマーが走らない。setSystemTime は時計だけを動かす(タイマーは発火しない)。
  await page.clock.setSystemTime(new Date(2026, 9, 15, 8, 0, 0));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.clock.resume();
  await waitIdle(page, 400);
  const after = await bottomText(page);
  check('L-15: focus after sleep re-checks the date', /Rows: 5 \/ 500/.test(after), after);
  await close();
}
// プリセットが掛かっていなければ見張らない(タイマーで再計算しない): 列フィルターなしで深夜を越えても onStateChange 等は出ない。
{
  const { page, close } = await open('basic', {
    query: 'n=50',
    beforeGoto: (p) => p.clock.install({ time: new Date(2026, 9, 14, 23, 59, 30) }),
  });
  await waitIdle(page, 300);
  await clearEvents(page);
  await page.clock.fastForward(60_000);
  await waitIdle(page, 300);
  const ev = (await events(page)).map((e) => e.type).filter((t) => t !== 'onScroll' && t !== 'onHoveredRowChange');
  check('L-15: without relative presets nothing happens at midnight', ev.length === 0, ev);
  await close();
}
// SSRM: 日付が変わったら取り直す(query は相対のままなので、queryKey に基準日を含めて取り直す)。
{
  const { page, close } = await open('ssrm', {
    beforeGoto: (p) => p.clock.install({ time: new Date(2026, 9, 14, 23, 59, 0) }),
  });
  await waitIdle(page, 800);
  await page.evaluate((s) => window.__grid.applyState(s), TODAY_STATE);
  await page.clock.fastForward(2_000);
  await waitIdle(page, 800);
  const callsBefore = await page.evaluate(() => window.__ssrm.calls.length);
  await page.clock.fastForward(60_000);
  await waitIdle(page, 800);
  await page.clock.fastForward(2_000);
  await waitIdle(page, 800);
  const callsAfter = await page.evaluate(() => window.__ssrm.calls.slice(-2).map((c) => [c.startIndex, c.endIndex, c.outcome]));
  const countAfter = await page.evaluate(() => window.__ssrm.calls.length);
  check('L-15: SSRM refetches after midnight with a relative preset', countAfter > callsBefore, { callsBefore, countAfter, callsAfter });
  await close();
}

// ---- B-10 / M-04: 100 万行(開発ビルドでの計測を含む) ----
{
  const { page, pageErrors, close } = await open('big');
  const time = async (fn, arg) => {
    const t0 = Date.now();
    await page.evaluate(fn, arg);
    await nextFrame(page);
    return Date.now() - t0;
  };
  const sortMs = await time(() =>
    window.__grid.applyState({ version: 1, columnWidths: {}, filters: { globalText: '', columnFilters: {} }, sort: [{ columnKey: 'qty', direction: 'desc' }] }),
  );
  console.log(`  sort 1M (qty desc): ${sortMs} ms`);
  // M-04: 開発ビルドでも数秒以内(従来は 40〜80 秒)。本番ビルドでは 1 秒未満。
  check('M-04: sorting 1M rows does not take tens of seconds', sortMs < 10_000, { sortMs });
  const topIdBefore = await cellText(page, 0, 'id');
  // ソート列以外の編集: 並びは変わらない。
  const editNameMs = await time(() => {
    const r = window.__rows().slice();
    r[123] = { ...r[123], name: 'edited-name' };
    window.__setRows(r);
  });
  const topIdAfterName = await cellText(page, 0, 'id');
  console.log(`  edit name (not sorted): ${editNameMs} ms`);
  check('B-10: editing a non-sorted column keeps the order', topIdAfterName === topIdBefore, { topIdBefore, topIdAfterName });
  // ソート列の編集: その行が先頭へ移る(qty は 0〜999 なので 5000 は最大)。
  const editQtyMs = await time(() => {
    const r = window.__rows().slice();
    r[777] = { ...r[777], qty: 5000 };
    window.__setRows(r);
  });
  await waitIdle(page, 200);
  const topIdAfterQty = await cellText(page, 0, 'id');
  console.log(`  edit qty (sorted column): ${editQtyMs} ms`);
  check('B-10: editing the sorted column moves the row to its new place', topIdAfterQty === '778', { topIdAfterQty });
  // 行オブジェクトをその場で書き換えて新しい配列を渡しても追従する。
  await page.evaluate(() => {
    const r = window.__rows();
    r[999].qty = 6000;
    window.__setRows(r.slice());
  });
  await waitIdle(page, 300);
  const topIdInPlace = await cellText(page, 0, 'id');
  check('B-10: in-place mutation + new array still re-sorts', topIdInPlace === '1000', { topIdInPlace });
  check('B-10 / M-04: no page errors', pageErrors.length === 0, pageErrors.slice(0, 3));
  await close();
}

summary();