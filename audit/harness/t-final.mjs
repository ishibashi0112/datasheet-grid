// 1.0 前の最終チェック(docs/audits/2026-11-05/)の所見のうち、実ブラウザで確かめたもの・実ブラウザでしか見えないものの
//   回帰確認。修正前の 0.60.0 では FAIL、修正後は PASS になる。
import { open, check, skip, SUPPORTS, summary, cell, errorsOf, clearEvents, events, waitIdle, unexpectedPageErrors } from './pw.mjs';

// ---- FC-01: 固定列で ↓ を押し続けても、アクティブセルが見える位置まで縦にスクロールする ----
{
  const { page, close } = await open('basic');
  for (const key of ['id', 'status', 'name']) {
    await page.evaluate(() => window.__grid.scrollToRow?.(0));
    await waitIdle(page, 200);
    await cell(page, 0, key).click();
    for (let i = 0; i < 30; i += 1) await page.keyboard.press('ArrowDown');
    await waitIdle(page, 300);
    const st = await page.evaluate(() => {
      const sc = document.querySelector('.ssg-scroll-container');
      const scBox = sc.getBoundingClientRect();
      const rowEl = document.querySelector('.ssg-body-row[data-row-index="30"]');
      const box = rowEl?.getBoundingClientRect();
      return { scrollTop: sc.scrollTop, rowTop: box?.top, rowBottom: box?.bottom, viewTop: scBox.top, viewBottom: scBox.bottom };
    });
    const last = (await events(page, 'onActiveCellChange')).at(-1)?.payload;
    check(
      `FC-01 ↓×30 from ${key}: scrolled so row 30 is inside the viewport`,
      st.scrollTop > 0 && st.rowBottom !== undefined && st.rowBottom <= st.viewBottom + 0.5,
      { ...st, active: last },
    );
  }
  await close();
}

// ---- FC-02: rowDragMotion="live" / "ghost" で離した後の画面の並びがデータの並びと同じ(rowKeyGetter の有無とも) ----
for (const motion of ['live', 'ghost']) {
  for (const withKey of [true, false]) {
    const label = `${motion} rowKeyGetter=${withKey ? 'あり' : 'なし'}`;
    const { page, close } = await open('rowdrag', { query: 'n=100' });
    await page.evaluate(
      ({ motion, withKey }) =>
        window.__setProps(withKey ? { rowDragMotion: motion } : { rowDragMotion: motion, rowKeyGetter: undefined }),
      { motion, withKey },
    );
    await waitIdle(page, 300);
    const before = await page.evaluate(() => window.__rows().slice(0, 5).map((r) => r.id));
    const handle = page.locator('.ssg-body-row[data-row-index="0"] .ssg-row-drag-handle').first();
    const hb = await handle.boundingBox();
    const r3 = await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="3"]').first().boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + 20, { steps: 3 });
    await page.mouse.move(hb.x + hb.width / 2, r3.y + r3.height - 4, { steps: 8 });
    await waitIdle(page, 150);
    await page.mouse.up();
    await waitIdle(page, 800);
    const after = await page.evaluate(() => window.__rows().slice(0, 5).map((r) => r.id));
    // 中央ペインの行を見た目の上から並べ、その行の data-row-index と transform を見る。
    const visual = await page.evaluate(() =>
      [...document.querySelectorAll('.ssg-center-pane .ssg-body-row[data-row-index]')]
        .map((r) => ({ y: r.getBoundingClientRect().top, idx: Number(r.dataset.rowIndex), tf: r.style.transform }))
        .sort((a, b) => a.y - b.y)
        .slice(0, 5),
    );
    check(`FC-02 ${label}: the row moved`, JSON.stringify(after) !== JSON.stringify(before), { before, after });
    check(
      `FC-02 ${label}: visual order matches the data order`,
      JSON.stringify(visual.map((v) => v.idx)) === JSON.stringify([0, 1, 2, 3, 4]),
      visual,
    );
    // 見えている一番上の行の行番号セルを押して、アクティブになる行がデータの先頭行であること。
    await page.locator('.ssg-center-pane .ssg-body-row[data-row-index="0"] .ssg-body-cell').first().click();
    await waitIdle(page, 150);
    const active = (await events(page, 'onActiveCellChange')).at(-1)?.payload;
    check(`FC-02 ${label}: clicking the top row activates data row 0`, active?.rowIndex === 0, active);
    await close();
  }
}

// ---- FC-03: 合成列(行ドラッグのハンドル列)をコピーの TSV に入れない ----
if (!SUPPORTS.clipboardSeed) {
  skip('FC-03 rowdrag: copied TSV', 'クリップボードを読めない(Chromium 以外)');
} else {
  const { page, close } = await open('rowdrag', { query: 'n=3' });
  await cell(page, 0, 'name').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await waitIdle(page, 200);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  const first = text.split(/\r?\n/)[0] ?? '';
  check('FC-03 rowdrag: copied TSV does not start with an empty synthetic column', text !== '' && !first.startsWith('\t'), JSON.stringify(first.slice(0, 80)));
  await close();
}

// ---- FC-17 / FC-09: number 列を英字から打ち始めるとその文字が見え、ブラウザの警告が出ない / 何も変えない確定は書かない ----
{
  const { page, pageErrors, close } = await open('basic', { query: 'n=50' });
  await cell(page, 0, 'qty').click();
  await page.keyboard.press('x');
  await waitIdle(page, 150);
  const editor = await page.evaluate(() => {
    const input = document.querySelector('.ssg-root input:focus');
    return input ? { type: input.type, value: input.value } : null;
  });
  check('FC-17 number column started with "x": editor shows the typed text', editor?.value === 'x' && editor?.type === 'text', editor);
  await page.keyboard.press('Escape');
  await waitIdle(page, 150);
  const parseWarnings = [...pageErrors, ...(await errorsOf(page))].filter((e) => /cannot be parsed/.test(e));
  check('FC-17 no "cannot be parsed" console warning', parseWarnings.length === 0, parseWarnings);

  for (const key of ['date', 'name', 'qty']) {
    await cell(page, 1, key).click();
    await clearEvents(page);
    await page.keyboard.press('F2');
    await waitIdle(page, 150);
    await page.keyboard.press('Enter');
    await waitIdle(page, 300);
    const changes = await events(page, 'onRowsChange');
    const active = (await events(page, 'onActiveCellChange')).at(-1)?.payload;
    check(`FC-09 F2 → Enter without changes on ${key}: no onRowsChange, moved down`, changes.length === 0 && active?.rowIndex === 2, { changes: changes.length, active });
  }
  check('FC-17/09 no unexpected page errors', unexpectedPageErrors(pageErrors).length === 0, pageErrors);
  await close();
}

summary();