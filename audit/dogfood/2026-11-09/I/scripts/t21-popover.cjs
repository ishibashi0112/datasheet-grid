const { open, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open();
  // 遅い答え(数量 30 以上)を聞いている間に、数量のフィルターを開く
  await page.click('.ssg-ask-input');
  await page.keyboard.type('遅い答え');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const h = page.locator('.ssg-header-cell', { hasText: '数量' }).first();
  await h.hover();
  await page.getByRole('button', { name: '数量 の列メニュー' }).click();
  await page.waitForTimeout(300);
  const menuItems = await page.$$eval('[role=menuitem]', (ms) => ms.map((m) => m.textContent.trim()));
  console.log('menu', menuItems);
  await page.locator('.ssg-menu-item', { hasText: 'フィルター…' }).first().click();
  await page.waitForTimeout(500);
  const pop = async () => page.evaluate(() => {
    const p = document.querySelector('.ssg-filter-popover, [class*="ssg-filter-pop"], [class*="ssg-popover"]');
    if (!p) return null;
    const inputs = [...p.querySelectorAll('input')].map((i) => `${i.type}:${i.value}`);
    return { cls: p.className, text: p.innerText.slice(0, 120).replace(/\n/g, ' / '), inputs };
  });
  console.log('popover before answer', JSON.stringify(await pop()));
  await page.waitForTimeout(5200);
  console.log('after answer bar:', await tail(page), JSON.stringify((await state(page)).filters.columnFilters));
  console.log('popover after answer', JSON.stringify(await pop()));
  await page.screenshot({ path: 'shots/21-popover.png' });
  // ポップオーバーで値を変えずに Enter / 適用 → 状態は?
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  console.log('after Esc popover:', await tail(page), JSON.stringify((await state(page)).filters.columnFilters), await counts(page));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
