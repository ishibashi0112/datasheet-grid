const { open, shot, cellRect, dumpLogs } = require('./lib.cjs');
const hov = (page) => page.evaluate(() => ({
  rowHovered: [...new Set([...document.querySelectorAll('.ssg-body-cell--row-hovered')].map((c) => c.closest('.ssg-body-row')?.dataset.rowKey))],
  colOverlay: [...document.querySelectorAll('.ssg-col-hover-overlay')].map((o) => Math.round(o.getBoundingClientRect().x) + ':' + getComputedStyle(o).display + ':' + getComputedStyle(o).opacity),
  hdr: [...document.querySelectorAll('.ssg-header-cell--hovered')].map((h) => h.dataset.ssgColKey ?? h.textContent),
}));
(async () => {
  const { browser, page, logs } = await open();
  let c = await cellRect(page, 'S003', 'd5');
  await page.mouse.move(c.cx, c.cy); await page.waitForTimeout(250);
  console.log('on S003.d5', JSON.stringify(await hov(page)));
  const l = await page.evaluate(() => { const r = document.querySelector('.ssg-label-row[data-pane="center"]').getBoundingClientRect(); return { x: r.x + 300, y: r.y + r.height / 2 }; });
  // セル → 真上のラベル行へ(S001 から上へ)
  c = await cellRect(page, 'S001', 'd5');
  await page.mouse.move(c.cx, c.cy); await page.waitForTimeout(250);
  console.log('on S001.d5', JSON.stringify(await hov(page)));
  await page.mouse.move(c.cx, l.y, { steps: 3 }); await page.waitForTimeout(250);
  console.log('on label row (same column)', JSON.stringify(await hov(page)));
  await shot(page, '49-hover-label-stale', { clip: { x: 0, y: 140, width: 700, height: 160 } });
  // 合計行の上
  const t = await page.evaluate(() => { const r = document.querySelector('.ssg-total-row [data-ssg-col-key="d8"]').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  c = await cellRect(page, 'S015', 'd8');
  await page.mouse.move(c.cx, c.cy); await page.waitForTimeout(200);
  await page.mouse.move(t.x, t.y, { steps: 4 }); await page.waitForTimeout(250);
  console.log('on total row', JSON.stringify(await hov(page)));
  // グリッドの外へ
  await page.mouse.move(700, 60, { steps: 4 }); await page.waitForTimeout(250);
  console.log('outside grid', JSON.stringify(await hov(page)));
  dumpLogs(logs);
  await browser.close();
})();
