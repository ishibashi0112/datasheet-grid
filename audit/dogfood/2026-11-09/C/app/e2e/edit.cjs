const fs = require('fs');
const { open, shot, cellRect, clickCell, gridState, ensureVisible, snapshot, diff, dumpLogs } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  let snap = await snapshot(page);
  const s1 = snap.find((r) => r.id === 'S004');
  console.log('S004 d1..d6', s1.s.slice(0, 6));
  // S004: d2 を 夜 にして d3 を 早 にする → d3 に印
  await ensureVisible(page, 'S004', 'd2');
  await clickCell(page, 'S004', 'd2');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  // 夜勤 をクリックで選ぶ
  await page.locator('.ssg-select-editor-popover').getByText('夜勤').click();
  await page.waitForTimeout(200);
  let s = await snapshot(page); console.log('pick 夜勤 by click', JSON.stringify(diff(snap, s)), JSON.stringify((await gridState(page)).active)); snap = s;
  await clickCell(page, 'S004', 'd3');
  // ダブルクリックで開いて 早番
  const c3 = await cellRect(page, 'S004', 'd3');
  await page.mouse.dblclick(c3.cx, c3.cy); await page.waitForTimeout(250);
  await page.locator('.ssg-select-editor-popover').getByText('早番').click();
  await page.waitForTimeout(250);
  s = await snapshot(page); console.log('pick 早番 by dblclick', JSON.stringify(diff(snap, s))); snap = s;
  const inv = await page.evaluate(() => window.__grid.current.getInvalidCells());
  console.log('invalid', JSON.stringify(inv));
  // 印の見た目 + ホバーでメッセージ
  const c3b = await cellRect(page, 'S004', 'd3');
  await page.mouse.move(c3b.cx, c3b.cy); await page.waitForTimeout(800);
  console.log('tooltip', await page.evaluate(() => [...document.querySelectorAll('.ssg-tooltip')].map((t) => t.textContent)));
  console.log('cell class', await page.evaluate(() => document.querySelector('.ssg-body-row[data-row-key="S004"] [data-ssg-col-key="d3"]').className));
  await shot(page, '36-invalid-mark', { clip: { x: c3b.x - 150, y: c3b.y - 60, width: 360, height: 160 } });
  // 元に戻す ボタン(HeroUI)
  console.log('undo btn disabled?', await page.locator('button', { hasText: '元に戻す' }).isDisabled());
  await page.locator('button', { hasText: '元に戻す' }).click(); await page.waitForTimeout(200);
  s = await snapshot(page); console.log('undo via button', JSON.stringify(diff(snap, s))); snap = s;
  console.log('focus after undo button', await page.evaluate(() => document.activeElement?.className || document.activeElement?.tagName));
  // キーが効くか(グリッドにフォーカスが戻っているか)
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100);
  console.log('after ArrowDown active', JSON.stringify((await gridState(page)).active));
  await page.locator('button', { hasText: 'やり直し' }).click(); await page.waitForTimeout(200);
  s = await snapshot(page); console.log('redo via button', JSON.stringify(diff(snap, s))); snap = s;
  // CSV 出力
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('button', { hasText: 'CSV 出力' }).click()]);
  const p = '../shots/export.csv';
  await dl.saveAs(p);
  const buf = fs.readFileSync(p);
  console.log('csv bytes', buf.length, 'BOM?', buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, 'name', dl.suggestedFilename());
  const text = buf.toString('utf8');
  const lines = text.split(/\r?\n/);
  console.log('csv lines', lines.length);
  console.log(lines.slice(0, 4).join('\n'));
  console.log('...');
  console.log(lines.slice(30, 34).join('\n'));
  console.log('...');
  console.log(lines.slice(-3).join('\n'));
  dumpLogs(logs);
  await browser.close();
})();
