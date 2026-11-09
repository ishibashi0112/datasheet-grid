const { open, askBar, barText, state, counts } = require('./lib.cjs');
const tail = async (page) => (await barText(page)).split('\n').slice(7).join(' / ');
(async () => {
  const { browser, page, logs } = await open();
  await askBar(page, '状態が未入金のもの');
  await page.click('.ssg-ask-input');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('遅い答え さらに');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  // 聞いている間に手で並べ替え(Shift+見出し)とグローバル検索
  await page.keyboard.down('Shift');
  await page.locator('.ssg-header-cell', { hasText: '日付' }).first().click();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(5300);
  console.log('answered:', await tail(page), JSON.stringify(await state(page).then((s) => ({ f: s.filters.columnFilters, s: s.sort }))));
  await page.getByRole('button', { name: '元に戻す' }).click().catch((e) => console.log('no undo', e.message.slice(0, 60)));
  await page.waitForTimeout(500);
  console.log('after undo:', await tail(page), JSON.stringify(await state(page).then((s) => ({ f: s.filters.columnFilters, s: s.sort }))));
  await browser.close();
})();
