const { open, shot, sleep, waitRows } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const name = page.locator('[role="columnheader"][data-ssg-col-key="name"]');
  await name.hover();
  await name.locator('button[aria-label^="Column menu"]').click();
  await sleep(400);
  const portals = await page.evaluate(() => [...document.body.children].filter((c) => c.tagName !== 'SCRIPT').map((c) => c.outerHTML.slice(0, 2500)));
  console.log(portals.slice(-2).join('\n\n----\n\n'));
  // click Filter...
  await page.getByText('Filter…', { exact: true }).click();
  await sleep(800);
  console.log(await shot(page, 'x-filter-text'));
  const pop = await page.evaluate(() => [...document.body.children].filter((c) => c.tagName !== 'SCRIPT').map((c) => c.outerHTML.slice(0, 3000)).slice(-1)[0]);
  console.log('\n=== FILTER POPOVER ===\n', pop);
  console.log(logs.join('\n'));
  await browser.close();
})();
