const { open, shot, sleep } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(1500);
  console.log(await shot(page, '01-initial'));
  const info = await page.evaluate(() => {
    const root = document.querySelector('.ssg-root');
    const grid = document.querySelector('[role="grid"], [role="treegrid"]');
    return {
      rootClass: root?.className,
      gridAttrs: grid ? [...grid.attributes].map(a => `${a.name}=${a.value}`) : null,
      headerCells: [...document.querySelectorAll('[role="columnheader"]')].map(h => `${h.getAttribute('aria-colindex')}:${h.textContent.trim()}`),
      firstRows: [...document.querySelectorAll('[role="row"]')].slice(0, 8).map(r => `${r.getAttribute('aria-rowindex')}|${r.className}|${r.textContent.slice(0,80)}`),
      bottom: document.querySelector('.ssg-bottom-bar, [class*="bottom-bar"]')?.textContent,
      top: document.querySelector('[class*="top-bar"]')?.textContent,
    };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('LOGS:\n' + logs.join('\n'));
  await browser.close();
})();
