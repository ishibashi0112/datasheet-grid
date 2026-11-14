const { open, shot, cellRect, clickCell, gridState, snapshot, diff, ensureVisible, dumpLogs } = require('./lib.cjs');
const writeClip = (page, t) => page.evaluate((t) => navigator.clipboard.writeText(t), t);
async function handle(page) {
  return page.evaluate(() => { const h = document.querySelector('.ssg-fill-handle'); if (!h) return null; const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width }; });
}
async function drag(page, from, to, opts = {}) {
  await page.mouse.move(from.cx, from.cy);
  await page.mouse.down();
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.cx + ((to.cx - from.cx) * i) / steps, from.cy + ((to.cy - from.cy) * i) / steps);
    await page.waitForTimeout(16);
  }
  if (opts.beforeUp) await opts.beforeUp();
  await page.mouse.up();
  await page.waitForTimeout(250);
}
(async () => {
  const { browser, page, logs } = await open();
  let snap = await snapshot(page);
  const step = async (label) => {
    const s = await snapshot(page);
    const st = await gridState(page);
    console.log(`[${label}] diff=`, JSON.stringify(diff(snap, s)), 'sel=', JSON.stringify(st.sel.range ?? st.sel));
    snap = s;
  };
  // 準備: S001 の d1..d3 を 早 遅 夜
  await ensureVisible(page, 'S001', 'd1');
  await writeClip(page, '早\t遅\t夜');
  await clickCell(page, 'S001', 'd1');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  await step('prep');
  // 範囲 d1..d3 が選ばれているはず → ハンドルを d12 まで右へ
  const h = await handle(page);
  console.log('handle', h);
  const t = await cellRect(page, 'S001', 'd12');
  await drag(page, h, { cx: t.cx, cy: t.cy }, { beforeUp: async () => { await shot(page, '13-fill-right-dragging'); console.log('tooltip', await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent)); } });
  await step('fill right d4..d12');
  const after = await page.evaluate(() => window.__rows.find((r) => r.id === 'S001').shifts.slice(0, 12).join(','));
  console.log('S001 d1..d12 =', after);
  await shot(page, '14-fill-right-done');
  console.log('fill options button', await page.evaluate(() => !!document.querySelector('.ssg-fill-options')));
  // 縦: S027 の d2 を 5 行下へ(ラベル行「外科病棟」をまたぐ)
  await ensureVisible(page, 'S029', 'd2');
  await clickCell(page, 'S027', 'd2');
  const v = await rowValue(page, 'S027', 1);
  const h2 = await handle(page);
  const t2 = await cellRect(page, 'S033', 'd2');
  await drag(page, h2, t2);
  await step(`fill down from S027.d2 (${v}) to S033`);
  await shot(page, '15-fill-down-label');
  // Ctrl でコピー ⇔ 連続 の切り替え(早遅夜を Ctrl で)
  await ensureVisible(page, 'S002', 'd1');
  await writeClip(page, '早\t遅\t夜');
  await clickCell(page, 'S002', 'd1');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  await step('prep2');
  const h3 = await handle(page);
  const t3 = await cellRect(page, 'S002', 'd8');
  await drag(page, h3, t3, { beforeUp: async () => { await page.keyboard.down('Control'); await page.waitForTimeout(100); console.log('tooltip with ctrl', await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent)); } });
  await page.keyboard.up('Control');
  await step('fill right with Ctrl');
  // 横に縦 2 行 x 3 列を下へ
  // undo
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  await step('undo');
  // ダブルクリックで下へ(左隣の列に値が続くところまで)
  await ensureVisible(page, 'S003', 'd3');
  await clickCell(page, 'S003', 'd3');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  await step('clear S003.d3');
  // 範囲 S004..S010 の d3 を消してからダブルクリックでフィル
  await clickCell(page, 'S004', 'd3');
  await page.keyboard.down('Shift');
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(100);
  await step('clear S004..S010 d3');
  await clickCell(page, 'S003', 'd3');
  await writeClip(page, '遅');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  const h4 = await handle(page);
  await page.mouse.dblclick(h4.cx, h4.cy);
  await page.waitForTimeout(250);
  await step('dblclick fill');
  dumpLogs(logs);
  await browser.close();
})();
async function rowValue(page, key, idx) { return page.evaluate(([k, i]) => window.__rows.find((r) => r.id === k).shifts[i], [key, idx]); }
