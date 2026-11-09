const L = require('./lib');
const rowsOf = (page) => page.evaluate(() => window.__app.rows);
const handle = (page) => page.evaluate(() => { const e = document.querySelector('.ssg-fill-handle'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
async function drag(page, from, to) {
  await page.mouse.move(from.x ?? from.cx, from.y ?? from.cy); await page.mouse.down();
  await page.mouse.move((from.x ?? from.cx), (from.y ?? from.cy) + (to.cy > (from.y ?? from.cy) ? 8 : -8), { steps: 2 });
  await page.mouse.move(to.cx, to.cy, { steps: 10 });
  await page.waitForTimeout(150);
}
async function selectRange(page, r1, c1, r2, c2) {
  await L.clickCell(page, r1, c1);
  const a = await L.cellBox(page, r1, c1);
  const b = await L.cellBox(page, r2, c2);
  await page.mouse.move(a.cx, a.cy); await page.mouse.down(); await page.mouse.move(b.cx, b.cy, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(150);
}
(async () => {
  const { browser, page, logs } = await L.open();
  let rows = await rowsOf(page);
  console.log('seed 13..20', rows.slice(12, 20).map((r) => `${r.date}/${r.amount}/${r.status}`).join(' '));
  // copy
  await selectRange(page, 13, '区分', 14, '税区分');
  await page.keyboard.press('Control+c'); await page.waitForTimeout(200);
  console.log('clipboard:', JSON.stringify(await page.evaluate(() => navigator.clipboard.readText())));
  await L.shot(page, '03-copy-range');
  await page.keyboard.press('Escape');

  // 日付 1 つ(13 行目)から下へ 3 行
  await L.clickCell(page, 13, '日付');
  let h = await handle(page);
  await drag(page, h, await L.cellBox(page, 16, '日付'));
  console.log('fill tooltip', await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent));
  await L.shot(page, '03a-filling-date');
  await page.mouse.up(); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('dates 13..17', rows.slice(12, 17).map((r) => r.date));

  // 金額 2 つ(13,14)→ 下へ 15..18
  await selectRange(page, 13, '金額', 14, '金額');
  h = await handle(page);
  await drag(page, h, await L.cellBox(page, 18, '金額'));
  console.log('fill tooltip', await page.evaluate(() => document.querySelector('.ssg-fill-tooltip')?.textContent));
  await page.mouse.up(); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('amounts 13..19', rows.slice(12, 19).map((r) => r.amount));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));
  await L.shot(page, '03c-filled-amount');
  const opt = await page.$('.ssg-fill-options');
  console.log('fill options', opt ? await opt.getAttribute('aria-label') : null);
  await opt.click(); await page.waitForTimeout(200);
  await L.shot(page, '03d-fill-menu');
  console.log('menu', await page.$$eval('.ssg-fill-menu [role="menuitemradio"]', (els) => els.map((e) => e.textContent + ':' + e.getAttribute('aria-checked'))));
  await page.click('.ssg-fill-menu [role="menuitemradio"]:nth-child(2)'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('amounts after copy', rows.slice(12, 19).map((r) => r.amount));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after undo1', rows.slice(12, 19).map((r) => r.amount));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after undo2 dates', rows.slice(12, 17).map((r) => r.date));
  await page.keyboard.press('Control+y'); await page.waitForTimeout(200);
  await page.keyboard.press('Control+y'); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('after 2 redo', rows.slice(12, 19).map((r) => r.date + '/' + r.amount).join(' '));
  console.log('header', await L.headerTotal(page), 'total row', await L.totalRowText(page));

  // 上へ: 13 行目の日付から 11 行目まで(11,12 は提出済み)
  await L.clickCell(page, 13, '日付');
  h = await handle(page);
  await drag(page, h, await L.cellBox(page, 11, '日付'));
  await page.mouse.up(); await page.waitForTimeout(300);
  rows = await rowsOf(page);
  console.log('upward into submitted', rows.slice(10, 13).map((r) => r.date + '/' + r.status));

  // ダブルクリックで下へ埋める: 摘要の左隣 = 領収書。金額列で試す: 21 行目の金額を選んでダブルクリック
  await L.clickCell(page, 21, '金額');
  h = await handle(page);
  const before = (await rowsOf(page)).slice(20, 40).map((r) => r.amount);
  await page.mouse.dblclick(h.x, h.y); await page.waitForTimeout(300);
  const after = (await rowsOf(page)).slice(20, 40).map((r) => r.amount);
  console.log('dbl before', before.join(','), '\n    after ', after.join(','));
  console.log('LOGS', logs.filter(l=>!l.includes('vite')&&!l.includes('DevTools')).join('\n'));
  await browser.close();
})();
