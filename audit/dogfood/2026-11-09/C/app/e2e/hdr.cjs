const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const h = await page.evaluate(() => document.querySelector('[role="columnheader"][data-ssg-col-key="d5"]').outerHTML);
  console.log(h);
  await browser.close();
})();
