// DevBI(spreadsheet-grid を使うアプリ)からの報告(2026-11-07)の回帰確認。jsdom では幅を測れないため実ブラウザで見る。
//   修正前の 0.61.0 では FAIL、修正後は PASS になる。
import { open, check, summary, waitIdle, unexpectedPageErrors, header, cell } from './pw.mjs';

// CSS を足す(WebDriver の wd.mjs には page.addStyleTag が無いので、どのブラウザでも同じ方法で)。
const addStyle = (page, css) =>
  page.evaluate((css) => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }, css);

// ---- 列幅の自動調整のあと、どのセルも「…」で切れない ----
//   offsetWidth は整数へ丸めた値で、実際の幅より最大 0.5px 小さい。その幅に決めた列では、いちばん長い値の末尾が切れていた
//   (0.61.0 の Chromium では sans-serif 12.5px で 6 セル)。scrollWidth と clientWidth はどちらも丸めるので比べても見つからない。
//   文字の幅は Range の getBoundingClientRect で測り、セルの中で使える幅(padding と border を除く)と比べる。
for (const font of ['system-ui, sans-serif; font-size: 11.9px', 'sans-serif; font-size: 12.5px', 'serif; font-size: 13.3px']) {
  for (const density of ['compact', 'standard']) {
    const { page, close, pageErrors } = await open('basic', { query: 'n=300' });
    await addStyle(page, `.ssg-root { font-family: ${font}; }`);
    await page.evaluate((density) => window.__setProps({ density, readOnly: true, autoSizeColumns: 'onDataChange' }), density);
    await waitIdle(page, 200);
    const res = await page.evaluate(async () => {
      const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' });
      const cols = [{ key: 'id', title: 'ID', width: 60 }];
      for (let i = 0; i < 12; i += 1) {
        cols.push({
          key: `price${i}`,
          title: `P${i}`,
          align: i % 2 === 0 ? 'right' : undefined,
          width: 60,
          getValue: (row) => row.id * (1013 + i * 7919) * 37 + i * 131,
          valueFormatter: ({ value }) => yen.format(value),
        });
      }
      window.__setColumns(cols);
      await new Promise((r) => setTimeout(r, 50));
      window.__setRows(window.__rows().slice());
      await new Promise((r) => setTimeout(r, 400));
      let cells = 0;
      const cut = [];
      for (const cell of document.querySelectorAll('.ssg-center-pane .ssg-body-cell')) {
        if (!cell.textContent.startsWith('￥')) continue;
        const target = cell.querySelector(':scope > span') ?? cell;
        const range = document.createRange();
        range.selectNodeContents(target);
        const textWidth = range.getBoundingClientRect().width;
        const cs = getComputedStyle(cell);
        const available =
          cell.getBoundingClientRect().width -
          parseFloat(cs.paddingLeft) -
          parseFloat(cs.paddingRight) -
          parseFloat(cs.borderLeftWidth) -
          parseFloat(cs.borderRightWidth);
        cells += 1;
        if (textWidth > available + 0.001) cut.push({ text: target.textContent, textWidth: +textWidth.toFixed(2), available: +available.toFixed(2) });
      }
      return { cells, cut: cut.slice(0, 3), cutCount: cut.length };
    });
    check(`autosize (${font.split(';')[0]} / ${density}): no value is cut after autosize`, res.cells > 100 && res.cutCount === 0, res);
    check(`autosize (${font.split(';')[0]} / ${density}): no unexpected page errors`, unexpectedPageErrors(pageErrors).length === 0, pageErrors);
    await close();
  }
}

// ---- ポップアップ(body 直下)へ、表で決まったトークンを写す ----
//   0.61.0 までは、利用側が表のまわりで決めた --ssg-* が列メニュー等に届かず、既定の色で出ていた。
//   写すのは「ポップアップの側で変えていない変数」だけ。密度の寸法は写さない。
const tokenOf = (page, selector, name) =>
  page.evaluate(({ selector, name }) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el).getPropertyValue(name).trim() : null;
  }, { selector, name });
const openColumnMenu = async (page, key) => {
  await header(page, key).hover();
  await header(page, key).locator('.ssg-icon-btn').click();
  await page.waitForSelector('.ssg-menu-panel');
  await waitIdle(page, 100);
};
const closeAll = async (page) => {
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
};
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=50' });
  // 何も決めていなければ何も写さない(インラインの --ssg-* が無い)。
  await openColumnMenu(page, 'name');
  const inlineDefault = await page.evaluate(() => document.querySelector('.ssg-menu-panel').getAttribute('style') ?? '');
  check('popup tokens: nothing is copied when the consumer sets no tokens', !inlineDefault.includes('--ssg-'), inlineDefault);
  await closeAll(page);

  // 1) README の書き方: どの表にも当たる `.ssg-root { … }`。
  await addStyle(page, '.ssg-root { --ssg-panel-bg: rgb(10, 20, 30); --ssg-accent: rgb(0, 128, 0); }');
  await openColumnMenu(page, 'name');
  check('popup tokens: global .ssg-root rule reaches the column menu', (await tokenOf(page, '.ssg-menu-panel', '--ssg-panel-bg')) === 'rgb(10, 20, 30)');
  check(
    'popup tokens: column menu background uses it',
    (await page.evaluate(() => getComputedStyle(document.querySelector('.ssg-menu-panel')).backgroundColor)) === 'rgb(10, 20, 30)',
  );
  await closeAll(page);

  // 2) DevBI の書き方: 祖先の要素のクラスと、祖先の変数。
  await page.evaluate(() => {
    const parent = document.querySelector('.ssg-root').parentElement;
    parent.classList.add('devbi-card');
    parent.style.setProperty('--card-head', 'rgb(21, 64, 70)');
  });
  await addStyle(page, '.devbi-card .ssg-root { --ssg-panel-bg: var(--card-head); --ssg-tooltip-bg: var(--card-head); --ssg-ghost-bg: var(--card-head); }');
  await openColumnMenu(page, 'name');
  check('popup tokens: ancestor-scoped rule with an ancestor variable reaches the column menu', (await tokenOf(page, '.ssg-menu-panel', '--ssg-panel-bg')) === 'rgb(21, 64, 70)');
  await closeAll(page);

  // 3) 右クリックメニュー / ツールパネル / ツールチップ / 列のドラッグのゴーストにも届く。
  await cell(page, 2, 'name').click({ button: 'right' });
  await waitIdle(page, 150);
  check('popup tokens: context menu gets it', (await tokenOf(page, '.ssg-menu-panel', '--ssg-panel-bg')) === 'rgb(21, 64, 70)');
  await closeAll(page);
  await page.evaluate(() => window.__grid.openFilterManager());
  await page.waitForSelector('.ssg-toolpanel');
  await waitIdle(page, 150);
  check('popup tokens: tool panel gets it', (await tokenOf(page, '.ssg-toolpanel', '--ssg-panel-bg')) === 'rgb(21, 64, 70)');
  await closeAll(page);
  await header(page, 'name').locator('.ssg-header-label').hover();
  await page.waitForSelector('.ssg-tooltip.ssg-tooltip--visible', { timeout: 3000 }).catch(() => {});
  check('popup tokens: tooltip gets it', (await tokenOf(page, '.ssg-tooltip', '--ssg-tooltip-bg')) === 'rgb(21, 64, 70)');
  await page.evaluate(() => window.__setProps({ columnDragMotion: 'ghost' }));
  await waitIdle(page, 150);
  const grip = header(page, 'name').locator('.ssg-header-grip');
  await header(page, 'name').hover();
  const gb = await grip.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
  await page.mouse.down();
  await page.mouse.move(gb.x + 60, gb.y + 5, { steps: 6 });
  await waitIdle(page, 100);
  check('popup tokens: column drag ghost gets it', (await tokenOf(page, '[data-grid-drag-ghost]', '--ssg-ghost-bg')) === 'rgb(21, 64, 70)');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await waitIdle(page, 200);

  // 4) ポップアップの側で変えている指定(.ssg-menu-panel だけ / classNames.popover の style)は残す。
  await addStyle(page, '.ssg-menu-panel { --ssg-panel-bg: rgb(7, 8, 9); }');
  await openColumnMenu(page, 'name');
  check('popup tokens: a rule written only for the menu is kept', (await tokenOf(page, '.ssg-menu-panel', '--ssg-panel-bg')) === 'rgb(7, 8, 9)');
  check('popup tokens: other tokens still follow the grid', (await tokenOf(page, '.ssg-menu-panel', '--ssg-accent')) === 'rgb(0, 128, 0)');
  await closeAll(page);
  await page.evaluate(() => window.__setProps({ classNames: { popover: { style: { '--ssg-accent': 'rgb(1, 2, 3)' } } } }));
  await waitIdle(page, 100);
  await openColumnMenu(page, 'name');
  check('popup tokens: classNames.popover style is kept', (await tokenOf(page, '.ssg-menu-panel', '--ssg-accent')) === 'rgb(1, 2, 3)');
  await closeAll(page);
  await page.evaluate(() => window.__setProps({ classNames: undefined }));

  // 5) 密度の寸法は写さない(ポップアップは密度の対象外)。テーマを変えると開いたままでも写し直す。
  await page.evaluate(() => window.__setProps({ density: 'compact' }));
  await waitIdle(page, 150);
  await openColumnMenu(page, 'name');
  const iconSize = await tokenOf(page, '.ssg-menu-panel', '--ssg-icon-btn-size');
  check('popup tokens: density sizes are not copied to the menu', iconSize === '20px', { iconSize });
  await page.evaluate(() => window.__setProps({ theme: 'dark' }));
  await waitIdle(page, 200);
  const dark = await page.evaluate(() => {
    const el = document.querySelector('.ssg-menu-panel');
    return el ? { dark: el.classList.contains('ssg-theme-dark'), accent: getComputedStyle(el).getPropertyValue('--ssg-accent').trim(), bg: getComputedStyle(el).getPropertyValue('--ssg-panel-bg').trim() } : null;
  });
  check('popup tokens: theme switch while open keeps the consumer values', dark?.dark === true && dark.accent === 'rgb(0, 128, 0)' && dark.bg === 'rgb(7, 8, 9)', dark);
  await closeAll(page);
  check('popup tokens: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- getRowClassName: 行だけに効かせる書き方(ドキュメントの例)----
//   class と style は行・「#」セル・各セルに付くので、素のクラスの opacity は 2 回掛かり、`.ssg-body-row.<class>` なら 1 回。
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=50' });
  await addStyle(page, '.ssg-body-row.dim-row { opacity: 0.5; } .dim-any { opacity: 0.5; }');
  const effective = (cls) =>
    page.evaluate(async (cls) => {
      window.__setProps({ getRowClassName: (_row, rowIndex) => (rowIndex === 1 ? cls : undefined) });
      await new Promise((r) => setTimeout(r, 150));
      const product = (el) => {
        let value = 1;
        for (let node = el; node && node instanceof Element; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
        return +value.toFixed(3);
      };
      const rows = [...document.querySelectorAll('.ssg-body-row[data-row-index="1"]')];
      const cells = rows.flatMap((row) => [...row.querySelectorAll('.ssg-body-cell, .ssg-row-header-cell')]);
      return { rows: rows.length, cells: cells.length, values: [...new Set(cells.map(product))] };
    }, cls);
  const rowOnly = await effective('dim-row');
  check('getRowClassName: `.ssg-body-row.<class>` dims the # cell and every cell once (0.5)', rowOnly.cells > 3 && rowOnly.values.length === 1 && rowOnly.values[0] === 0.5, rowOnly);
  const plain = await effective('dim-any');
  check('getRowClassName: a bare class compounds (0.25), as the docs warn', plain.values.length === 1 && plain.values[0] === 0.25, plain);
  check('getRowClassName: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

// ---- 列見出しの寄せ(headerAlign。書かなければ align)----
//   右寄せは並びを鏡写し(状態をラベルの左、ホバーの操作も左端)。中央は文字だけ中央。左は 0.61.0 までと同じ。
{
  const { page, close, pageErrors } = await open('basic', { query: 'n=50' });
  await page.evaluate(async () => {
    window.__setColumns([
      { key: 'id', title: 'ID', width: 70 },
      { key: 'name', title: '品名', width: 160 },
      { key: 'qty', title: '数量', width: 110, align: 'right', getValue: (row) => row.id * 3 },
      { key: 'mid', title: '状態', width: 110, align: 'center', getValue: (row) => (row.id % 2 ? '確定' : '保留') },
      { key: 'code', title: 'コード', width: 110, align: 'right', headerAlign: 'left', getValue: (row) => `A-${row.id}` },
    ]);
    window.__setProps({ onColumnsChange: () => {} });
    await new Promise((r) => setTimeout(r, 100));
    const grid = window.__grid;
    grid.applyState({ ...grid.getState(), sort: [{ columnKey: 'qty', direction: 'desc' }, { columnKey: 'mid', direction: 'asc' }] });
    await new Promise((r) => setTimeout(r, 200));
  });
  const measure = (key) =>
    page.evaluate((key) => {
      const cell = document.querySelector(`.ssg-header-cell[data-ssg-col-key="${key}"]`);
      if (!cell) return null;
      const label = cell.querySelector('.ssg-header-label');
      const status = cell.querySelector('.ssg-header-status');
      const actions = cell.querySelector('.ssg-header-actions');
      const resize = cell.querySelector('.ssg-header-resize');
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const cs = getComputedStyle(cell);
      const contentLeft = c.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      const contentRight = c.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const s = status.getBoundingClientRect();
      const a = actions.getBoundingClientRect();
      return {
        textLeft: +(text.left - contentLeft).toFixed(2),
        textRight: +(contentRight - text.right).toFixed(2),
        textCenter: +((text.left + text.right) / 2 - (contentLeft + contentRight) / 2).toFixed(2),
        textCenterInLabel: +((text.left + text.right) / 2 - (label.getBoundingClientRect().left + label.getBoundingClientRect().right) / 2).toFixed(2),
        statusLeftOfText: s.width > 0 ? s.right <= text.left + 0.5 : null,
        statusRightOfText: s.width > 0 ? s.left >= text.right - 0.5 : null,
        // ホバーの無い環境((hover: none)。タッチ端末 / geckodriver の Firefox)では操作は通常の並びの中(余白の内側の端)。
        hoverNone: matchMedia('(hover: none)').matches,
        actionsAtLeft: matchMedia('(hover: none)').matches ? Math.abs(a.left - contentLeft) < 1.5 : Math.abs(a.left - c.left) < 1.5,
        actionsAtRight: matchMedia('(hover: none)').matches ? Math.abs(a.right - contentRight) < 1.5 : Math.abs(a.right - c.right) < 1.5,
        actionsOpacity: Number(getComputedStyle(actions).opacity),
        actionsPadding: `${getComputedStyle(actions).paddingLeft} ${getComputedStyle(actions).paddingRight}`,
        resizeAtRight: resize ? Math.abs(resize.getBoundingClientRect().right - (c.right + 3)) < 1.5 : null,
      };
    }, key);
  const left = await measure('name');
  check('headerAlign: a column without align keeps the label on the left and actions on the right', left && Math.abs(left.textLeft) < 1 && left.actionsAtRight, left);
  const right = await measure('qty');
  check('headerAlign: align right -> the label text ends at the right edge of the cell content', right && Math.abs(right.textRight) < 1, right);
  check('headerAlign: align right -> the sort arrow sits to the left of the label', right?.statusLeftOfText === true, right);
  check('headerAlign: align right -> the resize handle stays on the right edge', right?.resizeAtRight === true, right);
  if (right?.hoverNone) {
    check('headerAlign: no hover (touch) -> the mirrored actions sit in the flow without the overlay padding', right.actionsPadding === '0px 0px', right);
  }
  const center = await measure('mid');
  check('headerAlign: align center -> the label text is centered (status stays on the right)', center && Math.abs(center.textCenterInLabel) < 1 && center.statusRightOfText === true && center.actionsAtRight, center);
  const override = await measure('code');
  check('headerAlign: headerAlign "left" on a right-aligned column keeps the header on the left', override && Math.abs(override.textLeft) < 1 && override.actionsAtRight, override);
  // ホバーで出る操作: 右寄せの列は左端、左寄せの列は右端。
  await page.locator('.ssg-header-cell[data-ssg-col-key="qty"] .ssg-header-label').hover();
  await waitIdle(page, 250);
  const hovered = await measure('qty');
  check('headerAlign: align right -> hover actions appear on the left edge', hovered?.actionsAtLeft === true && hovered.actionsOpacity === 1, hovered);
  await page.locator('.ssg-header-cell[data-ssg-col-key="name"] .ssg-header-label').hover();
  await waitIdle(page, 250);
  const hoveredLeft = await measure('name');
  check('headerAlign: a left column still shows hover actions on the right edge', hoveredLeft?.actionsAtRight === true && hoveredLeft.actionsOpacity === 1, hoveredLeft);
  check('headerAlign: no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();