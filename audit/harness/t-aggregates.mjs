// 選択範囲の集計(showSelectionAggregates): 実ブラウザでの値・表示・大きな選択の時間分割・SSRM の部分集計。
import { OUT, open, check, skip, unexpectedPageErrors, summary, cell, focusGrid, waitIdle } from './pw.mjs';

const chips = (page) =>
  page.evaluate(() => [...document.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')].map((c) => c.textContent));
// 表示値(桁区切り / 小数 4 桁)と同じ丸めで期待値を作る。
const fmt = (page, value) =>
  page.evaluate((v) => (Math.round(v * 1e6) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 4 }), value);
// ページ内で __rows から期待値を計算する(数値 / 数値の文字列だけ、空は数えない)。
const expectedOf = (page, r0, r1, keys) =>
  page.evaluate(
    ({ r0, r1, keys }) => {
      const rows = window.__rows();
      let count = 0;
      let numeric = 0;
      let sum = 0;
      for (let i = r0; i <= r1; i += 1) {
        for (const k of keys) {
          const v = rows[i][k];
          if (v === null || v === undefined || v === '') continue;
          count += 1;
          let n;
          if (typeof v === 'number') n = v;
          else if (typeof v === 'string' && v.trim() !== '') n = Number(v);
          if (n !== undefined && Number.isFinite(n)) {
            numeric += 1;
            sum += n;
          }
        }
      }
      return { count, numeric, sum, avg: numeric ? sum / numeric : undefined };
    },
    { r0, r1, keys },
  );

// ---------- バーの高さ / 位置が変わらない(見直しの指摘: 選択のたびにページが上下していた)----------
{
  const { page, pageErrors, close } = await open('basic');
  const measure = () =>
    page.evaluate(() => {
      const bar = document.querySelector('.ssg-bar--bottom');
      const groups = [...bar.querySelectorAll('.ssg-bar-group')].map((g) => {
        const r = g.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      });
      const inner = bar.querySelector('.ssg-bar-aggregates-inner');
      const chipsVisible = inner
        ? [...inner.querySelectorAll('.ssg-bar-chip')].filter((c) => {
            const r = c.getBoundingClientRect();
            const box = inner.getBoundingClientRect();
            return r.width > 0 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
          }).length
        : 0;
      return {
        bar: Math.round(bar.getBoundingClientRect().height),
        root: Math.round(document.querySelector('.ssg-root').getBoundingClientRect().height),
        groups,
        chipsVisible,
      };
    });
  for (const counts of [true, false]) {
    await page.evaluate((c) => window.__setProps({ showBottomBarCounts: c }), counts);
    for (const width of [1400, 900, 600, 420]) {
      // WebDriver の Firefox は窓を 500px より狭くできない(別の幅のまま測らないよう SKIP にする)。
      const sized = await page.setViewportSize({ width, height: 800 }).then(() => true, (e) => {
        if (e.code !== 'WD_VIEWPORT') throw e;
        skip(`agg: ${width}px・件数${counts ? 'あり' : 'なし'}で 2 セル以上を選んでもバーの高さとグループの位置が変わらない`, 'このブラウザでは窓をこの幅にできない');
        return false;
      });
      if (!sized) continue;
      await waitIdle(page, 120);
      await page.evaluate(() => window.__grid.selectCell(1, 2));
      await waitIdle(page);
      const one = await measure();
      await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 5, col: 3 } }));
      await waitIdle(page);
      const many = await measure();
      // グループの位置: 段(top)、左のグループの左端、右寄せの右グループ(件数あり)の右端。右グループの幅は
      //   Selection の表記で変わる(従来どおり)ため、左端は比べない。
      const anchors = (m) => ({
        tops: m.groups.map((g) => g.top),
        firstLeft: m.groups[0].left,
        lastRight: counts && m.groups.length > 1 && m.groups[1].top === m.groups[0].top ? m.groups[m.groups.length - 1].right : null,
      });
      check(
        `agg: ${width}px・件数${counts ? 'あり' : 'なし'}で 2 セル以上を選んでもバーの高さとグループの位置が変わらない`,
        one.bar === many.bar && one.root === many.root && JSON.stringify(anchors(one)) === JSON.stringify(anchors(many)),
        { one, many },
      );
      if (width === 1400) {
        check(`agg: 1400px・件数${counts ? 'あり' : 'なし'}では集計が全部見える`, many.chipsVisible === 3, many);
      }
    }
  }
  await page.evaluate(() => window.__setProps({ showBottomBarCounts: undefined }));
  await page.setViewportSize({ width: 1400, height: 800 });
  check('agg: エラーなし(バーの高さ)', unexpectedPageErrors(pageErrors).length === 0, unexpectedPageErrors(pageErrors));
  await close();
}

// ---------- 基本: ドラッグで範囲選択 ----------
{
  const { page, pageErrors, close } = await open('basic');
  check('agg: 何も選んでいないときは出ない', (await chips(page)).length === 0);
  await cell(page, 0, 'qty').click();
  check('agg: 1 セルだけの選択では出ない', (await chips(page)).length === 0);
  const from = await cell(page, 0, 'qty').boundingBox();
  const to = await cell(page, 5, 'price').boundingBox();
  await page.mouse.move(from.x + 10, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + 10, to.y + 5, { steps: 6 });
  await page.mouse.up();
  await waitIdle(page);
  const exp = await expectedOf(page, 0, 5, ['qty', 'price']);
  const got = await chips(page);
  const want = [`平均:${await fmt(page, exp.avg)}`, `データの個数:${exp.count}`, `合計:${await fmt(page, exp.sum)}`];
  check('agg: ドラッグした範囲の平均 / データの個数 / 合計', JSON.stringify(got) === JSON.stringify(want), { got, want });
  // キーボード(Shift+矢印)で広げると追従する
  await cell(page, 1, 'qty').click();
  for (const key of ['Shift+ArrowDown', 'Shift+ArrowDown', 'Shift+ArrowRight']) await page.keyboard.press(key);
  await waitIdle(page);
  const sel = await page.evaluate(() => window.__grid.getSelection());
  const exp2 = await expectedOf(page, 1, 3, ['qty', 'price']);
  check(
    'agg: Shift+矢印で広げた範囲を集計',
    (await chips(page)).includes(`合計:${await fmt(page, exp2.sum)}`),
    { chips: await chips(page), sel },
  );
  // 文字列だけの列(name)
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 1 }, end: { row: 3, col: 1 } }));
  await waitIdle(page);
  check('agg: 文字だけの範囲はデータの個数だけ', JSON.stringify(await chips(page)) === JSON.stringify(['データの個数:4']), await chips(page));
  // 編集で再計算
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 1, col: 2 } }));
  await waitIdle(page);
  await page.evaluate(() => window.__grid.setActiveCell({ row: 0, col: 2 }));
  await focusGrid(page);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  await waitIdle(page, 200);
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 1, col: 2 } }));
  await waitIdle(page);
  const exp3 = await expectedOf(page, 0, 1, ['qty']);
  check('agg: 編集した値で再計算', (await chips(page)).includes(`合計:${await fmt(page, exp3.sum)}`), { chips: await chips(page), exp3 });
  await page.locator('.ssg-bar--bottom').screenshot({ path: OUT + 'agg-bar.png' });
  // 狭い幅では折り返す(横にはみ出さない)
  await page.setViewportSize({ width: 560, height: 700 });
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 40, col: 3 } }));
  await waitIdle(page, 200);
  const overflow = await page.evaluate(() => {
    const bar = document.querySelector('.ssg-bar--bottom');
    return { scroll: bar.scrollWidth, client: bar.clientWidth };
  });
  check('agg: 狭い幅でもバーが横にはみ出さない', overflow.scroll <= overflow.client + 1, overflow);
  await page.locator('.ssg-bar--bottom').screenshot({ path: OUT + 'agg-bar-narrow.png' });
  check('agg: no page errors (basic)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 100 万行の全選択: 時間分割で集計中 → 確定 ----------
{
  const { page, pageErrors, close } = await open('big');
  await cell(page, 0, 'qty').click();
  await page.evaluate(() => {
    window.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__longTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      /* longtask 非対応 */
    }
  });
  const t0 = Date.now();
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 999_999, col: 3 } }));
  await page.waitForTimeout(30);
  const during = await chips(page);
  check('agg(big): 200 万セルの選択は「集計中…」から始まる', during.some((t) => t.startsWith('集計中')), during);
  // 計算中もスクロールできる(主スレッドが塞がらない)
  const scrolled = await page.evaluate(async () => {
    const sc = document.querySelector('.ssg-scroll-container');
    const before = performance.now();
    sc.scrollTop = 50_000;
    await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    return performance.now() - before;
  });
  check('agg(big): 計算中のスクロールの次フレームまで 200ms 未満', scrolled < 200, Math.round(scrolled));
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')].some((c) => c.textContent.startsWith('合計')),
    null,
    { timeout: 60_000 },
  );
  const elapsed = Date.now() - t0;
  const exp = await expectedOf(page, 0, 999_999, ['qty', 'price']);
  const got = await chips(page);
  check('agg(big): 確定した合計が正しい', got.includes(`合計:${await fmt(page, exp.sum)}`), { got, sum: exp.sum });
  check('agg(big): データの個数が正しい', got.includes(`データの個数:${exp.count.toLocaleString()}`), { got, count: exp.count });
  const longTasks = await page.evaluate(() => window.__longTasks);
  console.log(`  big: 集計 ${elapsed}ms、long task ${longTasks.length} 件、最大 ${Math.round(Math.max(0, ...longTasks))}ms`);
  // 全選択(Ctrl+A)
  await focusGrid(page);
  await page.keyboard.press('Control+a');
  await page.waitForFunction(
    () => [...document.querySelectorAll('.ssg-bar-aggregates .ssg-bar-chip')].some((c) => c.textContent.startsWith('合計')),
    null,
    { timeout: 120_000 },
  );
  check('agg(big): Ctrl+A の全選択でも確定する', (await chips(page)).some((t) => t.startsWith('データの個数')), await chips(page));
  check('agg: no page errors (big)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- SSRM: 未読み込みの行を飛ばして「読み込み済みの行のみ」 ----------
{
  const { page, pageErrors, close } = await open('ssrm');
  await page.waitForSelector('.ssg-body-row[data-row-index="0"] .ssg-body-cell', { timeout: 15000 });
  await waitIdle(page, 400);
  await page.evaluate(() => window.__grid.selectRange({ start: { row: 0, col: 2 }, end: { row: 5000, col: 2 } }));
  await waitIdle(page, 300);
  const got = await chips(page);
  check('agg(ssrm): 未読み込みの行を含む範囲は「読み込み済みの行のみ」', got.includes('読み込み済みの行のみ'), got);
  check('agg: no page errors (ssrm)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();