const { open, shot, cellRect, clickCell, gridState, rowData, dumpLogs } = require('./lib.cjs');
const readClip = (page) => page.evaluate(() => navigator.clipboard.readText());
const writeClip = (page, t) => page.evaluate((t) => navigator.clipboard.writeText(t), t);
(async () => {
  const { browser, page, logs } = await open();
  // 1) 左固定 → 中央 をまたぐ範囲をドラッグで選んでコピー
  const a = await cellRect(page, 'S001', 'name');
  const b = await cellRect(page, 'S003', 'd3');
  await page.mouse.move(a.cx, a.cy); await page.mouse.down();
  await page.mouse.move((a.cx + b.cx) / 2, (a.cy + b.cy) / 2, { steps: 5 });
  await page.mouse.move(b.cx, b.cy, { steps: 5 }); await page.mouse.up();
  console.log('sel1', JSON.stringify((await gridState(page)).sel));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(100);
  console.log('copy1:', JSON.stringify(await readClip(page)));
  const r1 = await rowData(page, 'S001');
  console.log('S001 d1-3 data:', r1.shifts.slice(0, 3));
  await shot(page, '05-copy-left-center');
  // 2) 中央 → 右固定(計算列)をまたいでコピー
  const c = await cellRect(page, 'S001', 'd20');
  await page.mouse.click(c.cx, c.cy);
  await page.keyboard.press('End'); // 行の末尾へ
  console.log('after End', JSON.stringify((await gridState(page)).active));
  await page.mouse.click(c.cx, c.cy);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  console.log('sel2', JSON.stringify((await gridState(page)).sel));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(100);
  console.log('copy2:', JSON.stringify(await readClip(page)));
  await shot(page, '06-copy-center-right');

  // 3) 中央の右端から貼り付け(右固定の計算列へははみ出さない)
  await page.keyboard.press('Escape');
  await writeClip(page, '早番\t遅\t夜勤\t休\n休\t休\t早\t遅\n');
  const before10 = await rowData(page, 'S010');
  const before11 = await rowData(page, 'S011');
  await clickCell(page, 'S010', 'd29');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  const after10 = await rowData(page, 'S010');
  const after11 = await rowData(page, 'S011');
  console.log('S010 d29-31 before', before10.shifts.slice(28), 'after', after10.shifts.slice(28));
  console.log('S011 d29-31 before', before11.shifts.slice(28), 'after', after11.shifts.slice(28));
  console.log('sel after paste', JSON.stringify((await gridState(page)).sel));
  await shot(page, '07-paste-right-edge');

  // 4) 左固定の編集不可の列から貼る(部署 → d1, d2)
  await writeClip(page, '外科\t早\t遅');
  const b20 = await rowData(page, 'S020');
  await page.evaluate(() => window.__grid.current.scrollToTop());
  await page.waitForTimeout(200);
  // S020 is visible?
  let r20 = await cellRect(page, 'S020', 'dept');
  if (!r20) { await page.evaluate(() => { const g = window.__grid.current; g.scrollToRow(g.getViewRowIndex('S020'), { align: 'center' }); }); await page.waitForTimeout(200); }
  await clickCell(page, 'S020', 'dept');
  await page.evaluate(() => window.__grid.current.focus());
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  const a20 = await rowData(page, 'S020');
  console.log('S020 dept/d1/d2/d3 before', b20.dept, b20.shifts.slice(0, 3), 'after', a20.dept, a20.shifts.slice(0, 3));

  // 5) ラベル行をまたぐ貼り付け(内科の最後 S030 から 3 行)
  await page.evaluate(() => { const g = window.__grid.current; g.scrollToRow(g.getViewRowIndex('S030'), { align: 'center' }); });
  await page.waitForTimeout(200);
  await writeClip(page, '夜\n休\n早');
  const pre = await Promise.all(['S030', 'S031', 'S032'].map((k) => rowData(page, k)));
  await clickCell(page, 'S030', 'd5');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  const post = await Promise.all(['S030', 'S031', 'S032'].map((k) => rowData(page, k)));
  console.log('label cross paste d5:', pre.map((r) => r.shifts[4]), '->', post.map((r) => r.shifts[4]));
  await shot(page, '08-paste-across-label');
  // 6) 不正値の貼り付け
  await writeClip(page, '日勤\tx');
  await clickCell(page, 'S031', 'd10');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(200);
  const s31 = await rowData(page, 'S031');
  console.log('invalid paste S031 d10,d11 =', s31.shifts.slice(9, 11));
  const inv = await page.evaluate(() => window.__grid.current.getInvalidCells());
  console.log('invalid cells', JSON.stringify(inv).slice(0, 400));
  await shot(page, '09-paste-invalid');
  // undo all
  for (let i = 0; i < 5; i++) await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  const u10 = await rowData(page, 'S010');
  const u20 = await rowData(page, 'S020');
  const u31 = await rowData(page, 'S031');
  console.log('after 5x undo S010', u10.shifts.slice(28), 'S020', u20.shifts.slice(0, 3), 'S031', u31.shifts.slice(9, 11));
  dumpLogs(logs);
  await browser.close();
})();
