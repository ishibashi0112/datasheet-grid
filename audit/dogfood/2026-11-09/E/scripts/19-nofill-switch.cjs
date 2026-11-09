const { open, shot, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  logs.length = 0;
  await page.click('[data-testid="nofill-switch"]', { force: true });
  await sleep(800);
  const c = await cellBox(page, 3, 12);
  await page.mouse.click(c.x, c.y); await sleep(200);
  console.log('handle without feature', await page.evaluate(() => !!document.querySelector('.ssg-fill-handle')));
  console.log(logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  logs.length = 0;
  await page.click('[data-testid="nofill-switch"]', { force: true });
  await sleep(800);
  await page.mouse.click(c.x, c.y); await sleep(200);
  console.log('handle with feature', await page.evaluate(() => !!document.querySelector('.ssg-fill-handle')));
  // 2 回目の切り替えで警告がまた出るか(prop ごとに 1 回)
  await page.click('[data-testid="nofill-switch"]', { force: true }); await sleep(800);
  console.log('second switch logs:', logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).length);
  await browser.close();
})();
