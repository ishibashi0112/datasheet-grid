// DevBI(spreadsheet-grid を使うアプリ)からの報告(2026-11-07)の回帰確認。jsdom では幅を測れないため実ブラウザで見る。
//   修正前の 0.61.0 では FAIL、修正後は PASS になる。
import { open, check, summary, waitIdle, unexpectedPageErrors } from './pw.mjs';

// ---- 列幅の自動調整のあと、どのセルも「…」で切れない ----
//   offsetWidth は整数へ丸めた値で、実際の幅より最大 0.5px 小さい。その幅に決めた列では、いちばん長い値の末尾が切れていた
//   (0.61.0 の Chromium では sans-serif 12.5px で 6 セル)。scrollWidth と clientWidth はどちらも丸めるので比べても見つからない。
//   文字の幅は Range の getBoundingClientRect で測り、セルの中で使える幅(padding と border を除く)と比べる。
for (const font of ['system-ui, sans-serif; font-size: 11.9px', 'sans-serif; font-size: 12.5px', 'serif; font-size: 13.3px']) {
  for (const density of ['compact', 'standard']) {
    const { page, close, pageErrors } = await open('basic', { query: 'n=300' });
    await page.addStyleTag({ content: `.ssg-root { font-family: ${font}; }` });
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

summary();
