const { open, shot, sleep, waitRows, gridText } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  const t0 = Date.now();
  await page.goto(process.env.BASE_URL || 'http://localhost:3401/users', { waitUntil: 'load' });
  await waitRows(page, 60000);
  console.log('rows visible after', Date.now() - t0, 'ms');
  await sleep(1500);
  console.log(await shot(page, '01-load-light'));
  console.log((await gridText(page)).join('\n'));
  console.log('REQS', JSON.stringify(reqs.slice(0, 10), null, 1));
  console.log('LOGS\n' + logs.join('\n'));
  await browser.close();
})();
