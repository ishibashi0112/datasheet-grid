const { open } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')].slice(0, 5);
    return rows.map((r) => ({ attrs: [...r.attributes].map((a) => `${a.name}=${a.value.slice(0,80)}`).join(' '), kids: r.children.length, first: r.children[0]?.outerHTML.slice(0, 200) }));
  });
  console.log(JSON.stringify(info, null, 1));
  const hdr = await page.evaluate(() => [...document.querySelectorAll('[role="columnheader"]')].slice(0, 5).map((h) => [...h.attributes].map((a) => `${a.name}=${a.value.slice(0,60)}`).join(' ')));
  console.log(hdr);
  const lbl = await page.evaluate(() => document.querySelector('.ssg-label-row')?.outerHTML.slice(0, 600));
  console.log(lbl);
  await browser.close();
})();
