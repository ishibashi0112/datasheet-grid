const { open, shot, sleep, waitRows } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  // header of "Name"
  const hdr = await page.evaluate(() => {
    const hs = [...document.querySelectorAll('[role="columnheader"]')];
    return hs.map((h) => ({ text: h.textContent, cls: h.className, html: h.outerHTML.slice(0, 600) }));
  });
  console.log(JSON.stringify(hdr.slice(0, 3), null, 1));
  const name = page.locator('[role="columnheader"]', { hasText: 'Name' }).first();
  await name.hover();
  const btn = name.locator('button').last();
  console.log('buttons in header:', await name.locator('button').count(), await name.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') + '|' + b.className)));
  await btn.click();
  await sleep(500);
  console.log(await shot(page, 'x-colmenu'));
  const menu = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"]');
    return m ? m.outerHTML.slice(0, 4000) : 'no menu';
  });
  console.log(menu);
  console.log(logs.join('\n'));
  await browser.close();
})();
