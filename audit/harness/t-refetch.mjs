// 追加(1.5.0): serverSideRefetch="keep"(SSRM の取り直しの間に前の行を薄く見せる)の実ブラウザでの確かめ。
//   ?s=ssrm に __setProps で serverSideRefetch を渡し、サーバーの遅延(__ssrm.latency)を伸ばして取り直しの間を見る:
//   並べ替えた直後は前の行のまま薄く(本体の見えている所に重ねる面 .ssg-refetch-veil。行そのものは不透明のまま = 固定列の
//   ペインの下の中央の列が透けない)、列見出しの下に線(.ssg-refetch-bar)が流れ、表に aria-busy / 届いたら一度に
//   差し替えて外れる / 前の行を見せている間は Enter でエディタが開かない / refreshServerSide() でも同じ・位置を保つ /
//   見えている範囲の取得に失敗したら前の行をやめて読み込み中の行とエラーバー / motion="off" では線が止まる / 既定(skeleton)は
//   読み込み中の行。React 版と Solid 版(SSG_AUDIT_FRAMEWORK=solid)の両方で回す。スクリーンショットは .out/refetch-*.png。
import { open, check, summary, OUT, FRAMEWORK, BROWSER, unexpectedPageErrors, waitIdle, focusGrid, scrollContainer } from './pw.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tag = `${FRAMEWORK}-${BROWSER}`;

const readState = (page) =>
  page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const grid = document.querySelector('[role="grid"]');
    const bar = document.querySelector('.ssg-refetch-bar');
    const row = document.querySelector('.ssg-body-row[data-pane="center"][data-row-index="2"]');
    const nameCell = row?.querySelector('[data-ssg-col-key="name"]');
    const after = bar ? getComputedStyle(bar, '::after') : null;
    const header = document.querySelector('.ssg-header-cell');
    const veil = document.querySelector('.ssg-refetch-veil');
    const shellTop = document.querySelector('.ssg-shell')?.getBoundingClientRect().top ?? 0;
    const scroller = document.querySelector('.ssg-scroll-container');
    const pinnedRow = document.querySelector('.ssg-body-row[data-pane="right"], .ssg-body-row[data-pane="left"]');
    return {
      refetching: root?.classList.contains('ssg-root--refetching') ?? false,
      busy: grid?.getAttribute('aria-busy') ?? null,
      bar: bar !== null,
      barTop: bar ? Math.round(bar.getBoundingClientRect().top - (document.querySelector('.ssg-shell')?.getBoundingClientRect().top ?? 0)) : null,
      barHeight: bar ? bar.getBoundingClientRect().height : null,
      barAnimation: after ? after.animationName : null,
      barAfterWidth: after ? after.width : null,
      headerBottom: header ? Math.round(header.getBoundingClientRect().bottom - (document.querySelector('.ssg-shell')?.getBoundingClientRect().top ?? 0)) : null,
      rowOpacity: row ? getComputedStyle(row).opacity : null,
      pinnedRowOpacity: pinnedRow ? getComputedStyle(pinnedRow).opacity : null,
      veil: veil !== null,
      veilOpacity: veil ? getComputedStyle(veil).opacity : null,
      veilPointer: veil ? getComputedStyle(veil).pointerEvents : null,
      veilTop: veil ? Math.round(veil.getBoundingClientRect().top - shellTop) : null,
      veilWidth: veil ? Math.round(veil.getBoundingClientRect().width) : null,
      veilBottom: veil ? Math.round(veil.getBoundingClientRect().bottom - shellTop) : null,
      clientWidth: scroller ? scroller.clientWidth : null,
      clientHeight: scroller ? scroller.clientHeight : null,
      name: nameCell?.textContent ?? null,
      skeletons: document.querySelectorAll('[data-skeleton-row]').length,
      editor: document.querySelector('.ssg-cell-editor-input') !== null,
      errorBar: document.querySelector('.ssg-ssrm-error-bar') !== null,
    };
  });

const waitUntil = async (page, fn, timeout = 5000) => {
  const start = Date.now();
  for (;;) {
    const value = await readState(page);
    if (fn(value)) return value;
    if (Date.now() - start > timeout) return value;
    await sleep(50);
  }
};

const sortByQty = async (page) => {
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }));
};

{
  const { page, pageErrors, close } = await open('ssrm', { viewport: { width: 1200, height: 700 } });
  await page.evaluate(() => window.__setProps({ serverSideRefetch: 'keep' }));
  await waitUntil(page, (s) => s.name !== null && s.skeletons === 0);
  const before = await readState(page);
  check('最初: 修飾子・面・線・aria-busy は無い', !before.refetching && !before.veil && !before.bar && before.busy === null, JSON.stringify(before));
  await page.evaluate(() => {
    window.__ssrm.latency = 1200;
  });
  // 並べ替え: query は 0.3 秒の debounce の後に変わる。
  await sortByQty(page);
  const during = await waitUntil(page, (s) => s.refetching, 2000);
  check('並べ替えた後: ルートに .ssg-root--refetching', during.refetching, JSON.stringify(during));
  check('並べ替えた後: 前の行のまま(読み込み中の行にしない)', during.name === before.name && during.skeletons === 0, `${before.name} → ${during.name} / skeletons=${during.skeletons}`);
  check(
    '並べ替えた後: 本体の見えている所に薄くする面(濃さ 0.55 = 行が 0.45 の濃さに見える・ポインタは通す)',
    during.veil && Math.abs(parseFloat(during.veilOpacity ?? '0') - 0.55) < 0.001 && during.veilPointer === 'none',
    JSON.stringify({ opacity: during.veilOpacity, pointer: during.veilPointer }),
  );
  check(
    '並べ替えた後: 面は列見出しの下からスクロールバーの手前まで',
    during.veilTop === during.headerBottom && during.veilWidth === during.clientWidth && during.veilBottom === during.clientHeight,
    JSON.stringify({ top: during.veilTop, headerBottom: during.headerBottom, w: during.veilWidth, cw: during.clientWidth, bottom: during.veilBottom, ch: during.clientHeight }),
  );
  check(
    '並べ替えた後: 行そのもの(中央・固定列のペイン)は不透明のまま',
    during.rowOpacity === '1' && during.pinnedRowOpacity === '1',
    JSON.stringify({ center: during.rowOpacity, pinned: during.pinnedRowOpacity }),
  );
  check('並べ替えた後: 表に aria-busy="true"', during.busy === 'true', String(during.busy));
  check(
    '並べ替えた後: 列見出しのすぐ下に高さ 2px の線が流れる',
    during.bar && during.barTop === during.headerBottom && during.barHeight === 2 && during.barAnimation === 'ssg-refetch-slide',
    JSON.stringify({ top: during.barTop, headerBottom: during.headerBottom, h: during.barHeight, anim: during.barAnimation }),
  );
  await page.screenshot({ path: `${OUT}refetch-${tag}-during.png` });
  // 前の行を見せている間は編集を始めない。
  await page.evaluate(() => window.__grid.setActiveCell({ row: 2, col: 1 }));
  await focusGrid(page);
  await page.keyboard.press('Enter');
  await sleep(80);
  check('前の行を見せている間: Enter でエディタが開かない', !(await readState(page)).editor);
  await page.keyboard.press('Escape');
  const done = await waitUntil(page, (s) => !s.refetching, 4000);
  check('届いたら: 修飾子・面・線・aria-busy が外れる', !done.refetching && !done.veil && !done.bar && done.busy === null, JSON.stringify(done));
  check('届いたら: 新しい並びの行に差し替わる', done.name !== before.name, `${done.name}`);
  await page.screenshot({ path: `${OUT}refetch-${tag}-after.png` });

  // refreshServerSide(): 位置を保ったまま前の行を見せる。
  await page.evaluate(() => {
    window.__ssrm.latency = 30;
  });
  const scroller = await scrollContainer(page);
  await scroller.evaluate((el) => {
    el.scrollTop = 3000;
  });
  await waitIdle(page, 600);
  await waitUntil(page, (s) => s.skeletons === 0, 3000);
  const top = await scroller.evaluate((el) => el.scrollTop);
  await page.evaluate(() => {
    window.__ssrm.latency = 800;
    window.__grid.refreshServerSide();
  });
  const refreshing = await waitUntil(page, (s) => s.refetching, 1000);
  check('refreshServerSide(): 前の行を見せたまま取り直す', refreshing.refetching && refreshing.skeletons === 0, JSON.stringify(refreshing));
  const refreshed = await waitUntil(page, (s) => !s.refetching, 4000);
  const topAfter = await scroller.evaluate((el) => el.scrollTop);
  check('refreshServerSide(): 届いたら外れ、スクロール位置はそのまま', !refreshed.refetching && Math.abs(topAfter - top) < 2, `${top} → ${topAfter}`);

  // 失敗: 見えている範囲の取得に失敗したら、前の行をやめて読み込み中の行とエラーバー。
  await page.evaluate(() => {
    window.__ssrm.latency = 300;
    window.__ssrm.failNext = 10;
    window.__grid.refreshServerSide();
  });
  const failed = await waitUntil(page, (s) => !s.refetching && s.errorBar, 4000);
  check('取り直しに失敗: 前の行をやめて読み込み中の行とエラーバー', !failed.refetching && failed.errorBar && failed.skeletons > 0, JSON.stringify(failed));
  await page.evaluate(() => {
    window.__ssrm.failNext = 0;
    window.__ssrm.latency = 30;
    window.__grid.retryServerSideLoads();
  });
  const retried = await waitUntil(page, (s) => s.skeletons === 0 && !s.errorBar, 4000);
  check('再試行で届く', retried.skeletons === 0 && !retried.errorBar, JSON.stringify(retried));

  // motion="off": 線は止まって全幅。
  await page.evaluate(() => window.__setProps({ motion: 'off' }));
  await page.evaluate(() => {
    window.__ssrm.latency = 1000;
    window.__grid.refreshServerSide();
  });
  const still = await waitUntil(page, (s) => s.refetching, 1000);
  const width = await page.evaluate(() => document.querySelector('.ssg-refetch-bar')?.getBoundingClientRect().width ?? 0);
  check(
    'motion="off": 線は動かず全幅',
    still.bar && still.barAnimation === 'none' && Math.abs(parseFloat(still.barAfterWidth ?? '0') - width) < 1,
    JSON.stringify({ anim: still.barAnimation, after: still.barAfterWidth, width }),
  );
  await waitUntil(page, (s) => !s.refetching, 4000);
  const errs = unexpectedPageErrors(pageErrors);
  check('ページのエラーが無い', errs.length === 0, errs.join(' / '));
  await close();
}

// 既定(skeleton): 取り直しは読み込み中の行で、修飾子も線も付かない。
{
  const { page, pageErrors, close } = await open('ssrm', { viewport: { width: 1200, height: 700 } });
  await waitUntil(page, (s) => s.name !== null && s.skeletons === 0);
  await page.evaluate(() => {
    window.__ssrm.latency = 800;
  });
  await sortByQty(page);
  const during = await waitUntil(page, (s) => s.skeletons > 0, 2000);
  check('既定(skeleton): 読み込み中の行・修飾子と面と線なし', during.skeletons > 0 && !during.refetching && !during.veil && !during.bar && during.busy === null, JSON.stringify(during));
  await waitUntil(page, (s) => s.skeletons === 0, 4000);
  const errs = unexpectedPageErrors(pageErrors);
  check('ページのエラーが無い(既定)', errs.length === 0, errs.join(' / '));
  await close();
}

summary();