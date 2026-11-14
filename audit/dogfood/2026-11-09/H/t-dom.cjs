const { open } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const html = await page.evaluate(() => {
    const g = document.querySelector('[aria-label="タスク一覧"]');
    const hdr = g.querySelector('[role="columnheader"]');
    const rows = [...g.querySelectorAll('[role="row"]')].slice(0, 5).map(r => r.outerHTML.slice(0, 1500));
    return { hdr: hdr && hdr.outerHTML.slice(0, 1500), rows };
  });
  console.log(html.hdr); console.log('----'); html.rows.forEach(r => console.log(r, '\n----'));
  await browser.close();
})();
