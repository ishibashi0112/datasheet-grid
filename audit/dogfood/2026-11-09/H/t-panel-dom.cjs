const { open, G, openColumnMenu, clickMenu } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await openColumnMenu(page, 'wbs');
  await clickMenu(page, '列の表示');
  await page.waitForTimeout(1000);
  const html = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('すべての列を初期状態に戻す')); let p = b; for (let i = 0; i < 3; i++) p = p.parentElement; return p.outerHTML.slice(0, 3500); });
  console.log(html);
  await openColumnMenu(page, 'progress');
  await clickMenu(page, '列の固定');
  await page.waitForTimeout(400);
  console.log(await page.evaluate(() => [...document.querySelectorAll('[role="menu"], .ssg-menu-panel')].map(m => m.outerHTML.slice(0, 1500)).join('\n=====\n')));
  await browser.close();
})();
