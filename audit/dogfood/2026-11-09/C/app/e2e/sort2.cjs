const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const hn = await page.locator('[role="columnheader"][data-ssg-col-key="nightCount"]').boundingBox();
  // 見出しの中央(ラベルの上)を Shift+クリック
  await page.mouse.move(hn.x + hn.width - 15, hn.y + hn.height / 2); await page.waitForTimeout(200);
  await shot(page, '42-header-right-hover', { clip: { x: hn.x - 90, y: hn.y - 5, width: 180, height: 60 } });
  await page.keyboard.down('Shift'); await page.mouse.click(hn.x + hn.width - 15, hn.y + hn.height / 2); await page.keyboard.up('Shift');
  await page.waitForTimeout(400);
  console.log('sort after shift-click label', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().sort)));
  await page.keyboard.down('Shift'); await page.mouse.click(hn.x + hn.width - 15, hn.y + hn.height / 2); await page.keyboard.up('Shift');
  await page.waitForTimeout(600);
  console.log('sort after 2nd', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().sort)));
  const data = await page.evaluate(() => { const d = window.__grid.current.getExportData({ includeLabelRows: true }); return d.rows.slice(0, 36).map((r, i) => (d.rowKinds[i] === 'label' ? '[' + r[0].text + ']' : r[r.length - 1].text)).join(','); });
  console.log('view order nightCount', data);
  await shot(page, '43-sorted');
  // 左端の 20px(右寄せ見出しの操作の場所)を Shift+クリック
  dumpLogs(logs);
  await browser.close();
})();
