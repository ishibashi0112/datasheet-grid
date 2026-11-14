const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const html = await page.evaluate(() => {
    const row = document.querySelectorAll('.ssg-body-row')[2];
    return row.outerHTML.slice(0, 1500);
  });
  console.log(html);
  const ask = await page.evaluate(() => document.querySelector('.ssg-ask').outerHTML.slice(0, 3000));
  console.log(ask);
  await browser.close();
})();
