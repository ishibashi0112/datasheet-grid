const { open, shot, cellRect, ensureVisible, dumpLogs } = require('./lib.cjs');
const st = (page) => page.evaluate(() => ({ pop: [...document.querySelectorAll('.ssg-filter-popover')].length, menu: [...document.querySelectorAll('.ssg-menu-panel')].length, active: document.activeElement?.className?.toString().slice(0, 40) || document.activeElement?.tagName }));
async function clickMenuBtn(page, key) {
  const hb = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`).boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.waitForTimeout(200);
  const b = await page.locator(`[role="columnheader"][data-ssg-col-key="${key}"] button[aria-label*="列メニュー"]`).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300);
}
(async () => {
  const { browser, page, logs } = await open();
  await ensureVisible(page, 'S001', 'd20');
  await clickMenuBtn(page, 'd20');
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  console.log('1 filter d20 open', JSON.stringify(await st(page)));
  await clickMenuBtn(page, 'd18');
  console.log('2 click ⋮ of d18', JSON.stringify(await st(page)));
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  console.log('3 フィルター… of d18', JSON.stringify(await st(page)), await page.locator('.ssg-filter-popover').first().innerText().then(t=>t.split('\n')[0]));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('4 Esc', JSON.stringify(await st(page)));
  await clickMenuBtn(page, 'd20');
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  await clickMenuBtn(page, 'd18');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('5 filter+menu then Esc', JSON.stringify(await st(page)));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('6 Esc again', JSON.stringify(await st(page)));
  await shot(page, '58-filter-stuck-after-esc');
  // フィルターの中を押して Esc
  await page.locator('.ssg-filter-popover input[type=text], .ssg-filter-popover .ssg-filter-input').first().click(); await page.waitForTimeout(200);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('6b click inside then Esc', JSON.stringify(await st(page)));
  // 同じ列の ⋮
  await clickMenuBtn(page, 'd20');
  await page.getByText('フィルター…').click(); await page.waitForTimeout(500);
  await clickMenuBtn(page, 'd20');
  console.log('7 same column ⋮ while filter open', JSON.stringify(await st(page)));
  dumpLogs(logs);
  await browser.close();
})();
