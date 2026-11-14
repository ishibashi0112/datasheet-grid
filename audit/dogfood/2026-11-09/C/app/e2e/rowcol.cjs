const { open, shot, cellRect, clickCell, gridState, ensureVisible, snapshot, diff, dumpLogs } = require('./lib.cjs');
const rowHeader = (page, key) => page.evaluate((key) => { const e = document.querySelector(`.ssg-body-row[data-row-key="${key}"] [role="rowheader"]`); const r = e.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, key);
(async () => {
  const { browser, page, logs } = await open();
  let snap = await snapshot(page);
  const step = async (label) => { const s = await snapshot(page); const d = diff(snap, s); console.log(`[${label}] ${d.length} changes`, JSON.stringify(d.slice(0, 8)), JSON.stringify((await gridState(page)).sel.range)); snap = s; };
  // 1) 行番号クリック → 行全体 → コピー → 別の行番号 → 貼り付け
  let p = await rowHeader(page, 'S002'); await page.mouse.click(p.cx, p.cy); await page.waitForTimeout(150);
  console.log('row sel', JSON.stringify((await gridState(page)).sel));
  await page.keyboard.press('Control+c'); await page.waitForTimeout(100);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('row copy', JSON.stringify(clip.slice(0, 120)));
  p = await rowHeader(page, 'S006'); await page.mouse.click(p.cx, p.cy); await page.waitForTimeout(150);
  await page.keyboard.press('Control+v'); await page.waitForTimeout(250);
  await step('paste row S002 -> S006');
  const s2 = snap.find((r) => r.id === 'S002'), s6 = snap.find((r) => r.id === 'S006');
  console.log('S006 days == S002 days?', JSON.stringify(s2.s) === JSON.stringify(s6.s), 'S006 name', s6.name);
  // 2) 列見出しクリック(5日)→ 列全体 → コピー → 6日の見出し → 貼り付け
  const h5 = await page.locator('[role="columnheader"][data-ssg-col-key="d5"]').boundingBox();
  await page.mouse.click(h5.x + 10, h5.y + 30); await page.waitForTimeout(150);
  console.log('col sel', JSON.stringify((await gridState(page)).sel));
  await page.keyboard.press('Control+c'); await page.waitForTimeout(100);
  const clip2 = await page.evaluate(() => navigator.clipboard.readText());
  console.log('col copy lines', clip2.split('\n').length, JSON.stringify(clip2.slice(0, 40)));
  const h6 = await page.locator('[role="columnheader"][data-ssg-col-key="d6"]').boundingBox();
  await page.mouse.click(h6.x + 10, h6.y + 30); await page.waitForTimeout(150);
  await page.keyboard.press('Control+v'); await page.waitForTimeout(250);
  await step('paste col d5 -> d6');
  const all56 = snap.every((r) => r.s[4] === r.s[5]);
  console.log('all rows d6 == d5?', all56);
  await shot(page, '44-col-paste');
  // 3) Ctrl+A → Delete → 何が消えるか → undo
  await clickCell(page, 'S001', 'd1');
  await page.keyboard.press('Control+a'); await page.waitForTimeout(150);
  console.log('ctrl+a sel', JSON.stringify((await gridState(page)).sel), await page.evaluate(() => [...document.querySelectorAll('.ssg-root > *')].pop().innerText.replace(/\n/g, ' ')));
  await page.keyboard.press('Delete'); await page.waitForTimeout(400);
  await step('ctrl+a delete');
  console.log('names intact?', snap.every((r) => r.name && r.dept));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
  await step('undo');
  dumpLogs(logs);
  await browser.close();
})();
