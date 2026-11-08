// 英語対応(localeTextEn)の確認。jsdom の結合テスト(SpreadsheetGrid.localeEn.integration.test.tsx)では見えない、
//   実ブラウザでのポップアップ(列メニュー・列フィルター・日付のカレンダー・ツールパネル・右クリックメニュー・フィルハンドルの
//   メニュー)・ツールチップ・セル内検索・下部バーの番地と集計・グループの行・開発時の警告(2 行)を見る。
//   ハーネスのデータ(列の見出し・値・利用側の検査のメッセージ・右クリックメニューの項目)は日本語なので、それを除いた
//   グリッドの文言に日本語が残っていないことを確かめる。
import { open, check, summary, waitIdle, unexpectedPageErrors, cell } from './pw.mjs';

// ハーネスが渡す日本語(グリッドの文言ではない)。長いものから消す。
const DATA_TEXTS = [
  '長いテキストの備考です。日本語の折り返しを確認します。',
  '名前は必須です',
  '0 以上',
  'カテゴリ',
  'カスタム',
  '非表示',
  'スコア',
  '名前',
  '数量',
  '単価',
  '日付',
  '有効',
  '備考',
  '状態',
  '操作',
  '削除',
  'ログ',
];
const ATTRIBUTES = ['aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'title', 'placeholder', 'data-ssg-tooltip', 'alt'];

// 画面(ポータルを含む body 全体)の文字と読み上げ / ツールチップの属性から、ハーネスのデータを除いて日本語が残るもの。
const japaneseUi = (page) =>
  page.evaluate(
    ({ data, attributes }) => {
      const jp = /[\u3000-\u30ff\u3400-\u9fff\uff01-\uff60]/;
      const strip = (text) => data.reduce((acc, item) => acc.split(item).join(''), text);
      const found = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (node.parentElement?.closest('script, style')) continue;
        const text = node.textContent ?? '';
        if (jp.test(strip(text))) found.push(`text: ${text.trim().slice(0, 60)}`);
      }
      for (const element of document.body.querySelectorAll('*')) {
        for (const name of attributes) {
          const value = element.getAttribute(name);
          if (value && jp.test(strip(value))) found.push(`${name}: ${value.slice(0, 60)}`);
        }
      }
      return [...new Set(found)].slice(0, 20);
    },
    { data: DATA_TEXTS, attributes: ATTRIBUTES },
  );

const bottomBar = (page) => page.evaluate(() => document.querySelector('.ssg-bar--bottom')?.textContent ?? '');
const topBar = (page) => page.evaluate(() => document.querySelector('.ssg-bar--top')?.textContent ?? '');
const closeAll = async (page) => {
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
};
// 列メニューはアクティブセルの Alt+↓ で開く(右固定の列の見出しのボタンは WebKitGTK の WebDriver で隠れて押せないことが
//   あるため。ボタンの名前とツールチップ(Column menu)は最初の描画の確認で見ている)。
const openColumnMenu = async (page, key) => {
  await page.evaluate((k) => {
    window.__grid.setActiveCell({ row: 0, col: window.__grid.getColIndex(k) }, { scrollIntoView: true });
    window.__grid.focus();
  }, key);
  await waitIdle(page, 100);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  await waitIdle(page, 150);
};
const clickMenuItem = async (page, label) => {
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: label }).first().click();
  await waitIdle(page, 250);
};

// ---- 本体: バー・見出し・ツールチップ・列メニュー・列フィルター(文字 / 数値 / 候補 / 日付)・カレンダー ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=60&lang=en' });
  check('i18n: no Japanese in the bars, headers and tooltips on first render', (await japaneseUi(page)).length === 0, await japaneseUi(page));
  const menuButtons = await page.evaluate(() => document.querySelectorAll('.ssg-header-row [data-ssg-tooltip="Column menu"]').length);
  check('i18n: the header column menu buttons are named "Column menu"', menuButtons > 0, menuButtons);
  const top = await topBar(page);
  check('i18n: top bar is English', top.includes('Rows 60 of 60') && top.includes('Filter: —') && top.includes('Sort: —'), top);

  for (const key of ['id', 'name', 'qty', 'category', 'date', 'note', 'score', 'status']) {
    await openColumnMenu(page, key);
    const menuJp = await japaneseUi(page);
    check(`i18n: column menu of ${key} has no Japanese`, menuJp.length === 0, menuJp);
    await clickMenuItem(page, 'Filter…');
    const popover = await page.locator('.ssg-filter-popover').count();
    const popoverJp = await japaneseUi(page);
    check(`i18n: filter popover of ${key} opens with no Japanese`, popover === 1 && popoverJp.length === 0, { popover, popoverJp });
    await closeAll(page);
  }

  // 日付の条件(dateSet の「範囲」。下限と上限の間の印)とカレンダー: 曜日 / 月の画面。
  await openColumnMenu(page, 'date');
  await clickMenuItem(page, 'Filter…');
  const separator = await page.evaluate(() => document.querySelector('.ssg-filter-popover .ssg-filter-cond-tilde')?.textContent ?? null);
  check('i18n: the range separator is English (–)', separator === '–', separator);
  await page.locator('.ssg-filter-popover .ssg-dp-cal-btn').first().click();
  await waitIdle(page, 200);
  const weekdays = await page.evaluate(() => Array.from(document.querySelectorAll('.ssg-dp-dow > *')).map((e) => e.textContent));
  check('i18n: calendar weekdays are English (Su … Sa)', weekdays.length === 7 && weekdays.every((w) => /^[A-Z][a-z]$/.test(w ?? '')), weekdays);
  const calendarJp = await japaneseUi(page);
  check('i18n: calendar has no Japanese', calendarJp.length === 0, calendarJp);
  await page.locator('.ssg-dp-nav-title').click();
  await waitIdle(page, 150);
  const months = await page.evaluate(() => Array.from(document.querySelectorAll('.ssg-dp-grid > *')).map((e) => e.textContent));
  check('i18n: calendar months are English', months.length === 12 && months[0] === 'Jan' && months[11] === 'Dec', months);
  const monthsJp = await japaneseUi(page);
  check('i18n: month view has no Japanese', monthsJp.length === 0, monthsJp);
  await closeAll(page);
  await closeAll(page);

  check('i18n: no unexpected page errors (columns / filters)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- ツールパネル・セル内検索・右クリックメニュー・集計・合計行・検査の印のツールチップ・フィルハンドルのメニュー ----
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=60&lang=en' });
  await page.evaluate(() => window.__setProps({ find: true, totalRow: true, fillHandle: true }));
  await page.evaluate(() =>
    window.__grid.applyState({ filters: { globalText: '', columnFilters: { status: { kind: 'select', value: 'open' } } }, sort: [{ columnKey: 'id', direction: 'asc' }] }),
  );
  await waitIdle(page, 300);
  const top = await topBar(page);
  check('i18n: filter / sort summary is English', top.includes('Filter: 1 column') && top.includes('(ascending)'), top);
  const chipsJp = await japaneseUi(page);
  check('i18n: filter chips and total row have no Japanese', chipsJp.length === 0, chipsJp);

  await page.evaluate(() => window.__grid.openFilterManager());
  await page.waitForSelector('.ssg-toolpanel-seg button');
  const tabs = page.locator('.ssg-toolpanel-seg button');
  const tabNames = [];
  for (let i = 0; i < (await tabs.count()); i += 1) {
    await tabs.nth(i).click();
    await waitIdle(page, 200);
    tabNames.push(await tabs.nth(i).textContent());
    const panelJp = await japaneseUi(page);
    check(`i18n: tool panel tab ${i} has no Japanese`, panelJp.length === 0, panelJp);
  }
  check('i18n: tool panel has 3 English tabs', tabNames.length === 3, tabNames);
  await page.evaluate(() => window.__grid.closeFilterManager());
  await waitIdle(page, 200);

  await page.evaluate(() => window.__grid.openFind('item'));
  await page.waitForSelector('.ssg-find-bar');
  await waitIdle(page, 300);
  const findJp = await japaneseUi(page);
  check('i18n: find bar has no Japanese', findJp.length === 0, findJp);
  await page.evaluate(() => window.__grid.closeFind());
  await waitIdle(page, 150);

  await cell(page, 2, 'name').click({ button: 'right' });
  await page.waitForSelector('.ssg-menu-panel');
  await waitIdle(page, 150);
  const contextJp = await japaneseUi(page);
  check('i18n: context menu has no Japanese (besides the harness items)', contextJp.length === 0, contextJp);
  await closeAll(page);

  // 選択範囲の集計(数量・単価の 2 列 × 3 行)。
  const qtyCol = await page.evaluate(() => window.__grid.getColIndex('qty'));
  const priceCol = await page.evaluate(() => window.__grid.getColIndex('price'));
  await page.evaluate(([a, b]) => window.__grid.selectRange({ start: { row: 0, col: a }, end: { row: 2, col: b } }), [qtyCol, priceCol]);
  await waitIdle(page, 300);
  const bottom = await bottomBar(page);
  check(
    'i18n: bottom bar shows English cell / range / size / aggregates',
    /Cell [A-Z]+\d/.test(bottom) && /Range [A-Z]+\d+:[A-Z]+\d+/.test(bottom) && bottom.includes('6 cells / 3 rows') && bottom.includes('Sum') && bottom.includes('Average'),
    bottom,
  );

  // 組み込みの検査のメッセージ(数量の min: 0。ハーネスの validate は先に効いて日本語を返すので外す)。
  await page.evaluate(() => {
    window.__setColumns(window.__columns().map((c) => (c.key === 'qty' ? { ...c, validate: undefined } : c)));
    const rows = window.__rows().slice();
    rows[1] = { ...rows[1], qty: -5 };
    window.__setRows(rows);
  });
  await waitIdle(page, 250);
  const invalid = await page.evaluate(() => window.__grid.getInvalidCells().map((c) => c.message));
  check('i18n: built-in check messages are English', invalid.includes('Enter 0 or more') && !invalid.some((m) => /[぀-ヿ㐀-鿿]/.test(m ?? '')), invalid);
  const markJp = await japaneseUi(page);
  check('i18n: invalid marks and their tooltips have no Japanese', markJp.length === 0, markJp);

  // フィルハンドル: 2 行を選んで 2 行下へ引き、埋めたあとのボタンとメニュー。
  await page.evaluate((c) => window.__grid.selectRange({ start: { row: 0, col: c }, end: { row: 1, col: c } }), priceCol);
  await waitIdle(page, 200);
  const handle = await page.locator('.ssg-fill-handle').boundingBox();
  if (handle) {
    const target = await cell(page, 3, 'price').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
    await waitIdle(page, 120);
    const dragJp = await japaneseUi(page);
    check('i18n: fill handle tooltip has no Japanese', dragJp.length === 0, dragJp);
    await page.mouse.up();
    await waitIdle(page, 250);
    const chip = await page.evaluate(() => document.querySelector('.ssg-fill-options')?.getAttribute('aria-label') ?? null);
    await page.click('.ssg-fill-options');
    await waitIdle(page, 200);
    const fillMenu = await page.evaluate(() => Array.from(document.querySelectorAll('.ssg-fill-menu [role="menuitemradio"]')).map((e) => e.textContent));
    check('i18n: fill options button and menu are English', chip !== null && fillMenu.length === 2 && (await japaneseUi(page)).length === 0, { chip, fillMenu, jp: await japaneseUi(page) });
    await closeAll(page);
  } else {
    check('i18n: fill handle is shown', false, 'no .ssg-fill-handle');
  }

  check('i18n: no unexpected page errors (panels / bars)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- L-N1: 展開トグル列 / 行ドラッグのハンドル列のセルの番地 ----
{
  const { page, close, pageErrors } = await open('detail', { query: 'n=30&lang=en' });
  await page.evaluate(() => window.__grid.setActiveCell({ row: 6, col: 0 }));
  await waitIdle(page, 200);
  const detailBar = await bottomBar(page);
  check('L-N1: the detail toggle column cell is "Cell Details 7"', detailBar.includes('Cell Details 7'), detailBar);
  const toggleJp = await japaneseUi(page);
  check('i18n: detail toggle labels have no Japanese', toggleJp.filter((t) => !t.includes('詳細')).length === 0, toggleJp);
  check('i18n: no unexpected page errors (detail)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}
{
  const { page, close, pageErrors } = await open('rowdrag', { query: 'n=30&lang=en' });
  await page.evaluate(() => window.__grid.setActiveCell({ row: 4, col: 0 }));
  await waitIdle(page, 200);
  const dragBar = await bottomBar(page);
  check('L-N1: the row drag handle column cell is "Cell Move 5"', dragBar.includes('Cell Move 5'), dragBar);
  const handleJp = await japaneseUi(page);
  check('i18n: row drag handles have no Japanese', handleJp.length === 0, handleJp);
  check('i18n: no unexpected page errors (row drag)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- 行グループの行 ----
{
  const { page, close, pageErrors } = await open('grouping', { query: 'n=60&lang=en' });
  await waitIdle(page, 200);
  const groupJp = await japaneseUi(page);
  check('i18n: group rows and the group column have no Japanese', groupJp.length === 0, groupJp);
  check('i18n: no unexpected page errors (grouping)', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- 開発時の警告: 日本語の行と英語の行の 2 行(言語によらず) ----
{
  const { page, close } = await open('basic', { query: 'n=10' });
  await page.evaluate(() => {
    window.__errors.length = 0;
    window.__grid.refreshServerSide();
  });
  await waitIdle(page, 100);
  const warnings = await page.evaluate(() => window.__errors.filter((e) => e.includes('refreshServerSide')));
  const lines = (warnings[0] ?? '').replace(/^\[warn\] /, '').split('\n');
  check(
    'i18n: a development warning has a Japanese line and an English line',
    warnings.length === 1 && lines.length === 2 && /[぀-ヿ]/.test(lines[0]) && !/[぀-ヿ㐀-鿿]/.test(lines[1]) && lines[1].includes('does nothing with clientSide rows'),
    warnings,
  );
  await close();
}

summary();
