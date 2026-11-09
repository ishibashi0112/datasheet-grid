const { open, shot, clickCell, ensureVisible, dumpLogs } = require('./lib.cjs');
const state = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('.ssg-filter-popover')];
  return els.map((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height), vis: cs.visibility, disp: cs.display, op: cs.opacity, cls: el.className.slice(0, 80), hidden: el.hidden, ariaHidden: el.getAttribute('aria-hidden') }; });
});
(async () => {
  const { browser, page, logs } = await open();
  console.log('0 before', JSON.stringify(await state(page)));
  await ensureVisible(page, 'S001', 'd31');
  const hb = await page.locator(`[role="columnheader"][data-ssg-col-key="d31"]`).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  const b = await page.locator(`[role="columnheader"][data-ssg-col-key="d31"] button[aria-label*="列メニュー"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250);
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  console.log('1 open', JSON.stringify(await state(page)));
  await shot(page, '55-filter-open');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  console.log('2 after Esc', JSON.stringify(await state(page)));
  await shot(page, '56-filter-after-esc');
  dumpLogs(logs);
  await browser.close();
})();
