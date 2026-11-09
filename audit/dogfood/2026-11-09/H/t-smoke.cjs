const { open } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.screenshot({ path: 'shots/smoke.png' });
  const info = await page.evaluate(() => {
    const grids = [...document.querySelectorAll('[role="grid"]')].map(g => ({ label: g.getAttribute('aria-label'), rowcount: g.getAttribute('aria-rowcount'), colcount: g.getAttribute('aria-colcount') }));
    return { grids, title: document.title };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log(logs.join('\n'));
  await browser.close();
})();
