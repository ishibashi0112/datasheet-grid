const { open, sleep, cellBox } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open((process.argv[2] || 'http://127.0.0.1:5405') + '/repro/date-paste.html' + (process.argv[3] || ''));
  await page.waitForSelector('.ssg-root'); await sleep(500);
  const inputs = await page.evaluate(() => window.__rows.map((r) => r.input));
  await page.evaluate((t) => navigator.clipboard.writeText(t), inputs.join('\n'));
  const c = await cellBox(page, 2, 3);
  await page.mouse.click(c.x, c.y); await sleep(100);
  await page.keyboard.press('Control+v'); await sleep(500);
  const rows = await page.evaluate(() => window.__rows.map((r) => [r.input, r.date]));
  for (const [i, d] of rows) console.log(i.padEnd(14), '→', JSON.stringify(d));
  console.log('today', await page.evaluate(() => new Date().toString()));
  console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
