const { open, askBar, barText, state, counts } = require('./lib.cjs');
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? `${a.tagName}.${a.className} [${a.getAttribute('aria-label') ?? a.textContent?.slice(0, 20)}]` : 'none';
});
(async () => {
  const { browser, page, logs } = await open();
  await askBar(page, '関東の 10 万円以上');
  await askBar(page, 'さらに数量 10 以上だけ');
  // Tab で順にたどる
  await page.click('.ssg-ask-input');
  const order = [];
  for (let i = 0; i < 14; i += 1) {
    await page.keyboard.press('Tab');
    order.push(await active(page));
  }
  console.log('Tab order:\n ' + order.join('\n '));
  // 最初のチップの × にフォーカスして Enter
  const xs = page.locator('.ssg-ask-chip button');
  console.log('chip x count', await xs.count(), await xs.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label'))));
  await xs.first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after removing 1st:', await active(page), await counts(page));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after removing 2nd:', await active(page));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after removing 3rd:', await active(page), JSON.stringify(await barText(page)).slice(-80));
  // 元に戻す をキーボードで → フォーカス
  await askBar(page, '状態が未入金のもの');
  await page.getByRole('button', { name: '元に戻す' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after undo via key:', await active(page));
  await page.getByRole('button', { name: '閉じる' }).focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('after close via key:', await active(page));
  // aria-live の領域
  console.log('live regions', await page.$$eval('.ssg-ask [aria-live], .ssg-ask [role=status], .ssg-ask [role=alert]', (es) => es.map((e) => `${e.tagName} live=${e.getAttribute('aria-live')} role=${e.getAttribute('role')}`)));
  console.log('LOGS', logs.filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await browser.close();
})();
