// 遅延読み込み(lazy-popups): 列フィルターポップオーバーとツールパネルの部品は別チャンク(dev では別モジュール)で、
//   初期の読み込みに含まれず、暇なときに先読み / 開いたときに読み込まれる。読み込みが遅くても、出たあと入力欄へ
//   フォーカスが入り、位置もヘッダーの下に付く。読み込みに失敗してもグリッドは壊れず、次に開いたときに読み直す。
import { open, check, skip, SUPPORTS, unexpectedPageErrors, summary, header, waitIdle } from './pw.mjs';

// 読み込みの観察(page.on('request'))と遅延 / 失敗(page.route)を使うため、それが無いブラウザでは全体を飛ばす。
if (!SUPPORTS.network) {
  skip('lazy: 遅延読み込みの確認すべて', 'page.route / page.on(\'request\') が無い');
  summary();
  process.exit(0);
}

const LAZY_RE = /\/(ColumnFilterPopover|toolPanelViews)\.tsx?(\?|$)|\/(ColumnFilterPopover|toolPanelViews)-[\w-]+\.js$/;
const isFilterModule = (url) => /ColumnFilterPopover/.test(url);
const isToolPanelModule = (url) => /toolPanelViews/.test(url);

// requestIdleCallback を止めて、暇なときの先読みが走らないページを作ります(初期の読み込みに含まれないことの確認用)。
const noIdle = (page) =>
  page.addInitScript(() => {
    window.requestIdleCallback = () => 0;
    window.cancelIdleCallback = () => {};
  });

const trackLazyRequests = (page) => {
  const urls = [];
  page.on('request', (req) => {
    if (LAZY_RE.test(new URL(req.url()).pathname)) urls.push(req.url());
  });
  return urls;
};

const openFilterFromMenu = async (page, colKey) => {
  await header(page, colKey).hover();
  await header(page, colKey).locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await page.locator('.ssg-menu-item', { hasText: 'フィルター…' }).click();
};

// ---------- 初期の読み込みに含まれない / 開いたときに読み込む ----------
{
  let lazyUrls = [];
  const { page, pageErrors, close } = await open('basic', {
    beforeGoto: async (p) => {
      await noIdle(p);
      lazyUrls = trackLazyRequests(p);
    },
  });
  await waitIdle(page, 1500);
  check('lazy: 先読みが走らなければ、初期表示ではフィルターポップオーバー / ツールパネルの部品を読み込まない', lazyUrls.length === 0, lazyUrls);

  await openFilterFromMenu(page, 'name');
  await page.waitForSelector('.ssg-filter-popover', { timeout: 5000 });
  check('lazy: 開いたときにフィルターポップオーバーの部品だけを読み込む', lazyUrls.some(isFilterModule) && !lazyUrls.some(isToolPanelModule), lazyUrls);
  await page.waitForFunction(() => document.activeElement?.closest('.ssg-filter-popover') != null, null, { timeout: 3000 }).catch(() => {});
  const focus = await page.evaluate(() => ({
    inPopover: document.activeElement?.closest('.ssg-filter-popover') != null,
    tag: document.activeElement?.tagName,
    type: document.activeElement?.getAttribute('type'),
  }));
  check('lazy: 初回オープンでも入力欄へフォーカスが入る', focus.inPopover && focus.tag === 'INPUT', focus);
  const placement = await page.evaluate(() => {
    const pop = document.querySelector('.ssg-filter-popover').getBoundingClientRect();
    const head = document.querySelector('.ssg-header-cell[data-ssg-col-key="name"]').getBoundingClientRect();
    return { popTop: pop.top, headBottom: head.bottom, popLeft: pop.left, popRight: pop.right, vw: window.innerWidth };
  });
  check('lazy: ポップオーバーはヘッダーの下・画面内に出る', placement.popTop >= placement.headBottom && placement.popLeft >= 0 && placement.popRight <= placement.vw, placement);
  await page.keyboard.type('a');
  await waitIdle(page);
  const draft = await page.evaluate(() => document.activeElement?.value);
  check('lazy: そのまま入力できる', draft === 'a', draft);
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('lazy: Escape で閉じる', (await page.locator('.ssg-filter-popover').count()) === 0);

  await page.evaluate(() => window.__grid.openFilterManager());
  await page.waitForSelector('.ssg-toolpanel', { timeout: 5000 }).catch(() => {});
  check('lazy: ツールパネルは開いたときに読み込んで出る', (await page.locator('.ssg-toolpanel').count()) === 1 && lazyUrls.some(isToolPanelModule), lazyUrls);
  await page.mouse.click(5, 790);
  await waitIdle(page);
  check('lazy: ツールパネルは外側クリックで閉じる', (await page.locator('.ssg-toolpanel').count()) === 0);
  check('lazy: 初回オープンの経路でエラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 読み込みが遅い(ネットワーク越し)ときの初回オープン ----------
{
  const { page, pageErrors, close } = await open('basic', {
    beforeGoto: async (p) => {
      await noIdle(p);
      await p.route(LAZY_RE, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      });
    },
  });
  await openFilterFromMenu(page, 'qty');
  await waitIdle(page, 200);
  check('lazy(遅い): 読み込み中は何も出ない', (await page.locator('.ssg-filter-popover').count()) === 0);
  await page.waitForSelector('.ssg-filter-popover', { timeout: 5000 });
  await page.waitForFunction(() => document.activeElement?.closest('.ssg-filter-popover') != null, null, { timeout: 3000 }).catch(() => {});
  const focus = await page.evaluate(() => ({
    inPopover: document.activeElement?.closest('.ssg-filter-popover') != null,
    tag: document.activeElement?.tagName,
  }));
  check('lazy(遅い): 出たあと入力欄へフォーカスが入る(数フレーム以上遅れても)', focus.inPopover && focus.tag === 'INPUT', focus);
  // 複合(numberSet)は実測の高さでの再配置がある。画面内に収まること(ResizeObserver が描画後のパネルに付く)。
  const fit = await page.evaluate(() => {
    const pop = document.querySelector('.ssg-filter-popover').getBoundingClientRect();
    return { top: pop.top, bottom: pop.bottom, vh: window.innerHeight };
  });
  check('lazy(遅い): 高さの大きい複合フィルターも画面内に収まる', fit.top >= 0 && fit.bottom <= fit.vh, fit);
  // 読み込み中の Escape で閉じられる(開き直すと読み込み済みなのですぐ出る)。
  await page.keyboard.press('Escape');
  await waitIdle(page);
  await openFilterFromMenu(page, 'name');
  check('lazy(遅い): 読み込み済みの部品は次に開いたときすぐ出る', (await page.locator('.ssg-filter-popover').count()) === 1);
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('lazy(遅い): エラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 読み込み中に Escape で閉じる ----------
{
  const { page, pageErrors, close } = await open('basic', {
    beforeGoto: async (p) => {
      await noIdle(p);
      await p.route(LAZY_RE, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 800));
        await route.continue();
      });
    },
  });
  await openFilterFromMenu(page, 'name');
  await waitIdle(page, 100);
  check('lazy(Escape): 読み込み中はグリッドのキーボード操作を止めている', (await page.evaluate(() => document.querySelector('.ssg-shell')?.tabIndex)) === -1);
  await page.keyboard.press('Escape');
  await waitIdle(page);
  check('lazy(Escape): 読み込み中に Escape で閉じ、キーボード操作が戻る', (await page.evaluate(() => document.querySelector('.ssg-shell')?.tabIndex)) === 0);
  await waitIdle(page, 1200);
  check('lazy(Escape): 読み込みが終わっても出てこない', (await page.locator('.ssg-filter-popover').count()) === 0);
  check('lazy(Escape): エラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 暇なときに先読みする(先読み後は開いた直後に出る) ----------
{
  let lazyUrls = [];
  const { page, pageErrors, close } = await open('basic', {
    beforeGoto: async (p) => {
      lazyUrls = trackLazyRequests(p);
    },
  });
  await page.waitForFunction(() => true);
  await waitIdle(page, 2500);
  check('lazy(先読み): マウント後の暇なときに両方の部品を読み込む', lazyUrls.some(isFilterModule) && lazyUrls.some(isToolPanelModule), lazyUrls);
  const appearedSync = await page.evaluate(async () => {
    const button = document.querySelector('.ssg-header-cell[data-ssg-col-key="name"] [data-ssg-tooltip="列メニュー"]');
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const item = [...document.querySelectorAll('.ssg-menu-item')].find((el) => el.textContent.includes('フィルター…'));
    item.click();
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    return document.querySelector('.ssg-filter-popover') != null;
  });
  check('lazy(先読み): 先読み後は開いた次のフレームで出る', appearedSync);
  check('lazy(先読み): エラーなし', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---------- 読み込みに失敗したとき ----------
{
  let fail = true;
  const { page, pageErrors, close } = await open('basic', {
    beforeGoto: async (p) => {
      await noIdle(p);
      await p.route(LAZY_RE, (route) => (fail ? route.abort() : route.continue()));
    },
  });
  // セルを選んでからメニュー経由で開く(失敗後にキーボードだけで操作が続けられるかを見るため)。
  await page.locator('.ssg-body-row[data-row-index="0"] .ssg-body-cell[data-ssg-col-key="name"]').first().click();
  await openFilterFromMenu(page, 'name');
  await waitIdle(page, 500);
  const logged = pageErrors.some((e) => e.includes('ポップオーバー部品の読み込みに失敗しました'));
  check('lazy(失敗): ポップオーバーは出ず、console.error に理由を出す', (await page.locator('.ssg-filter-popover').count()) === 0 && logged, pageErrors);
  check('lazy(失敗): 未処理の例外にしない(グリッドは壊れない)', !pageErrors.some((e) => e.startsWith('[pageerror]')), pageErrors);
  const shell = await page.evaluate(() => ({
    tabIndex: document.querySelector('.ssg-shell')?.tabIndex,
    focusInGrid: document.activeElement?.closest('.ssg-root') != null,
  }));
  check('lazy(失敗): 開いていた状態は閉じ、グリッドへフォーカスが戻る', shell.tabIndex === 0 && shell.focusInGrid, shell);
  await page.keyboard.press('ArrowDown');
  await waitIdle(page);
  const active = await page.evaluate(() => window.__grid.getActiveCell?.() ?? null);
  check('lazy(失敗): そのままキーボードで操作を続けられる', active !== null && active.row === 1, active);
  // 次に開いたときに読み直す(ブラウザが失敗した import をキャッシュする場合はページの再読み込みまで直らない)。
  fail = false;
  await openFilterFromMenu(page, 'name');
  const retried = await page.waitForSelector('.ssg-filter-popover', { timeout: 3000 }).then(() => true, () => false);
  console.log(`INFO lazy(失敗): 失敗後に開き直したときの再読み込み: ${retried ? '出た' : '出ない(ブラウザが失敗した import をキャッシュ)'}`);
  await close();
}

summary();