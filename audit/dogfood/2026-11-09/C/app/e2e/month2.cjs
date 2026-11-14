const { open, shot, cellRect, clickCell, gridState, ensureVisible, snapshot, diff, dumpLogs } = require('./lib.cjs');
const clickMonth = async (page, key) => { await page.locator(`button[data-month="${key}"]`).click(); await page.waitForTimeout(500); };
const bar = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-root > *')].pop().innerText.replace(/\n/g, ' | '));
(async () => {
  const { browser, page, logs } = await open();
  // Dec: S010 の d29 → Shift+クリックで S012 の d31 まで
  await ensureVisible(page, 'S010', 'd31');
  await clickCell(page, 'S010', 'd29');
  const t = await cellRect(page, 'S012', 'd31');
  await page.keyboard.down('Shift'); await page.mouse.click(t.cx, t.cy); await page.keyboard.up('Shift');
  await page.waitForTimeout(150);
  console.log('Dec sel', JSON.stringify(await gridState(page)), await bar(page));
  await clickMonth(page, '2027-02');
  console.log('Feb sel', JSON.stringify(await gridState(page)), await bar(page));
  await shot(page, '26-feb-out-of-range-sel');
  // フォーカスをグリッドへ戻してキー操作
  await page.evaluate(() => window.__grid.current.focus());
  let snap = await snapshot(page);
  await page.keyboard.press('Control+c'); await page.waitForTimeout(150);
  console.log('copy in Feb:', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  await page.keyboard.press('Delete'); await page.waitForTimeout(150);
  let s = await snapshot(page); console.log('Delete diff', JSON.stringify(diff(snap, s))); snap = s;
  await page.evaluate(() => navigator.clipboard.writeText('夜\t夜\t夜'));
  await page.keyboard.press('Control+v'); await page.waitForTimeout(150);
  s = await snapshot(page); console.log('Paste diff', JSON.stringify(diff(snap, s))); snap = s;
  console.log('after paste', JSON.stringify(await gridState(page)), await bar(page));
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  console.log('Enter -> editor?', await page.evaluate(() => !!document.querySelector('.ssg-cell-editor, .ssg-select-editor-popover')), JSON.stringify(await gridState(page)));
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(150);
  console.log('ArrowLeft', JSON.stringify((await gridState(page)).active), await bar(page));
  await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(150);
  console.log('Shift+ArrowRight', JSON.stringify((await gridState(page)).sel));
  // ハンドルの startEditing
  console.log('startEditing()', await page.evaluate(() => window.__grid.current.startEditing()));
  await page.keyboard.press('Escape');
  dumpLogs(logs);
  await browser.close();
})();
