const { open, shot, cellRect, clickCell, gridState, ensureVisible, dumpLogs } = require('./lib.cjs');
const order = (page) => page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[data-pane="left"]')].sort((a, b) => Number(a.dataset.rowIndex) - Number(b.dataset.rowIndex)).slice(0, 40).map((r) => r.dataset.rowKey ? r.dataset.rowKey + ':' + (r.querySelector('[data-ssg-col-key="name"]')?.textContent ?? '') : '[' + r.getAttribute('aria-label') + ']'));
(async () => {
  const { browser, page, logs } = await open();
  // 夜勤回数で降順(Shift+見出しクリック)
  const hn = await page.locator('[role="columnheader"][data-ssg-col-key="nightCount"]').boundingBox();
  await page.keyboard.down('Shift'); await page.mouse.click(hn.x + 20, hn.y + hn.height / 2); await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  console.log('sort after shift-click', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().sort)));
  await page.keyboard.down('Shift'); await page.mouse.click(hn.x + 20, hn.y + hn.height / 2); await page.keyboard.up('Shift');
  await page.waitForTimeout(600);
  console.log('sort after 2nd shift-click', JSON.stringify(await page.evaluate(() => window.__grid.current.getState().sort)));
  const nights = await page.evaluate(() => window.__grid.current.getExportData({ includeLabelRows: true }).rows.slice(0, 35).map((r) => r[r.length - 1]));
  console.log('nightCount col (export view order)', nights.join(','));
  await shot(page, '38-sorted-desc');
  // 並べ替えたままスクロール → sticky の見出し
  const box = await page.locator('.ssg-scroll-container').boundingBox();
  await page.mouse.move(box.x + 600, box.y + 300);
  await page.mouse.wheel(0, 1200); await page.waitForTimeout(400);
  const sticky = await page.evaluate(() => { const hb = document.querySelector('.ssg-header-row').getBoundingClientRect().bottom; return [...document.querySelectorAll('.ssg-label-row[data-pane="center"], .ssg-label-row')].map((e) => ({ l: e.getAttribute('aria-label'), top: Math.round(e.getBoundingClientRect().top), cls: e.className })).filter((x) => x.top >= hb - 2 && x.top < hb + 40); });
  console.log('sticky near header', JSON.stringify(sticky));
  await shot(page, '39-sorted-scrolled-sticky');
  // グローバルフィルター "ICU"
  await page.locator('input[placeholder="グローバルフィルター"]').fill('ICU');
  await page.waitForTimeout(500);
  console.log('global ICU ->', JSON.stringify((await order(page)).slice(0, 5)), await page.evaluate(() => [...document.querySelectorAll('.ssg-root > *')][0].innerText.replace(/\n/g, ' ')));
  console.log('total row', await page.evaluate(() => [...document.querySelectorAll('.ssg-total-row [data-ssg-col-key]')].map((c) => c.dataset.ssgColKey + '=' + c.textContent).filter((t) => /workDays|nightCount|d1=/.test(t)).join(' ')));
  await shot(page, '40-global-icu');
  await page.locator('input[placeholder="グローバルフィルター"]').fill('');
  await page.waitForTimeout(400);
  // 15日へ ボタン
  await page.locator('button', { hasText: '15日へ' }).click(); await page.waitForTimeout(400);
  console.log('after 15日へ', JSON.stringify(await gridState(page)), 'focus', await page.evaluate(() => document.activeElement?.className));
  await shot(page, '41-jump-15');
  dumpLogs(logs);
  await browser.close();
})();
