const { open, sleep } = require('./lib');
(async () => {
  for (const p of ['/repro/static2']) {
    const { browser, page, logs } = await open();
    await page.goto('http://localhost:3401' + p);
    await sleep(4000);
    console.log(p, '\n', logs.filter((l) => !l.includes('DevTools') && !l.includes('HMR')).map((l) => l.split('\n')[0]).join('\n'));
    await browser.close();
  }
})();
