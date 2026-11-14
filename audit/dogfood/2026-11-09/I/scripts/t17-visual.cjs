const { open, askBar } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.click('[data-testid=toggle-dark]');
  await askBar(page, '関東の 10 万円以上');
  await askBar(page, '範囲外の答え');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'shots/17-dark.png' });
  // 考えている間(ダーク)
  await page.click('.ssg-ask-input');
  await page.keyboard.type('遅い');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'shots/17-dark-thinking.png', clip: { x: 0, y: 0, width: 1400, height: 260 } });
  await page.keyboard.press('Escape');
  await browser.close();
  // 狭い画面
  const n = await open('', { viewport: { width: 390, height: 800 } });
  await askBar(n.page, '関東の 10 万円以上');
  await askBar(n.page, 'さらに数量 10 以上だけ');
  await askBar(n.page, '範囲外の答え');
  await n.page.waitForTimeout(800);
  await n.page.screenshot({ path: 'shots/17-narrow.png' });
  const overflow = await n.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth, bar: document.querySelector('.ssg-ask').scrollWidth, barClient: document.querySelector('.ssg-ask').clientWidth }));
  console.log('narrow overflow', overflow);
  console.log('LOGS', [...logs, ...n.logs].filter((l) => !/vite|DevTools/.test(l)).join('\n'));
  await n.browser.close();
})();
