const { open, shot } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5402/?run=0');
  await page.waitForTimeout(800);
  await shot(page, '01-initial');
  const info = await page.evaluate(() => {
    const cell = document.querySelector('.ssg-body-cell');
    const row = cell.closest('[role="row"]');
    return {
      cellAttrs: cell.getAttributeNames().map((a) => `${a}=${cell.getAttribute(a)}`),
      cellHTML: cell.outerHTML.slice(0, 400),
      rowAttrs: row && row.getAttributeNames().map((a) => `${a}=${row.getAttribute(a)}`),
      grid: [...document.querySelectorAll('[role="grid"]')].map((g) => g.getAttributeNames().map((a) => `${a}=${g.getAttribute(a)}`)),
      bottom: document.querySelector('.ssg-bottom-bar, [class*="bottom"]')?.outerHTML.slice(0, 600),
      total: document.querySelector('[class*="total"]')?.outerHTML.slice(0, 600),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  console.log('LOGS', logs);
  await browser.close();
})();
