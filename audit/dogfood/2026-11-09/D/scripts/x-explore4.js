const { open, shot, sleep, waitRows, cellBox, debug } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const rowsHtml = await page.evaluate(() => [...document.querySelectorAll('[role="row"]')].slice(0, 3).map((r) => r.outerHTML.slice(0, 1500)));
  console.log(rowsHtml.join('\n\n'));
  console.log(await cellBox(page, 3, 'name'));
  await browser.close();
})();
