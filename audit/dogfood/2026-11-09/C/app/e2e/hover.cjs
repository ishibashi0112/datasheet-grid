const { open, shot, cellRect, clickCell, gridState, ensureVisible, snapshot, diff, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  let c = await cellRect(page, 'S005', 'name');
  await page.mouse.move(c.cx, c.cy); await page.waitForTimeout(300);
  await shot(page, '45-hover-pinned-left');
  c = await cellRect(page, 'S005', 'workDays');
  await page.mouse.move(c.cx, c.cy); await page.waitForTimeout(300);
  await shot(page, '46-hover-pinned-right');
  // ラベル行の上
  const l = await page.evaluate(() => { const r = document.querySelector('.ssg-label-row[data-pane="center"]').getBoundingClientRect(); return { x: r.x + 200, y: r.y + r.height / 2 }; });
  await page.mouse.move(l.x, l.y); await page.waitForTimeout(300);
  await shot(page, '47-hover-label');
  // フィル: d29..d31 を右の固定列へ引く
  let snap = await snapshot(page);
  await ensureVisible(page, 'S007', 'd31');
  await clickCell(page, 'S007', 'd29');
  const e = await cellRect(page, 'S007', 'd31');
  await page.keyboard.down('Shift'); await page.mouse.click(e.cx, e.cy); await page.keyboard.up('Shift');
  const h = await page.evaluate(() => { const h = document.querySelector('.ssg-fill-handle'); const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  const t = await cellRect(page, 'S007', 'nightCount');
  await page.mouse.move(h.cx, h.cy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(h.cx + ((t.cx - h.cx) * i) / 10, h.cy); await page.waitForTimeout(20); }
  await shot(page, '48-fill-into-right-pinned');
  await page.mouse.up(); await page.waitForTimeout(300);
  let s = await snapshot(page); console.log('fill into right pinned diff', JSON.stringify(diff(snap, s))); snap = s;
  console.log('sel', JSON.stringify((await gridState(page)).sel));
  // 氏名列(編集不可)を選んだときのハンドル
  await clickCell(page, 'S007', 'name');
  console.log('handle on name col?', await page.evaluate(() => !!document.querySelector('.ssg-fill-handle')));
  // 名前列 + d1..d2 を左固定 → 中央 へ下に引く
  await ensureVisible(page, 'S007', 'd1');
  await clickCell(page, 'S007', 'dept');
  const e2 = await cellRect(page, 'S007', 'd2');
  await page.keyboard.down('Shift'); await page.mouse.click(e2.cx, e2.cy); await page.keyboard.up('Shift');
  const h2 = await page.evaluate(() => { const h = document.querySelector('.ssg-fill-handle'); if (!h) return null; const r = h.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  console.log('handle for dept..d2', h2);
  if (h2) {
    const t2 = await cellRect(page, 'S009', 'd2');
    await page.mouse.move(h2.cx, h2.cy); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(h2.cx, h2.cy + ((t2.cy - h2.cy) * i) / 10); await page.waitForTimeout(20); }
    await page.mouse.up(); await page.waitForTimeout(300);
    s = await snapshot(page); console.log('fill dept..d2 down diff', JSON.stringify(diff(snap, s))); snap = s;
  }
  dumpLogs(logs);
  await browser.close();
})();
