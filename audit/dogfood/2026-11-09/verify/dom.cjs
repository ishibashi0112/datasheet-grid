const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:5421/?s=paste'); await p.waitForSelector('.ssg-body-row');
  console.log(await p.evaluate(() => { const r = document.querySelector('.ssg-body-row'); return r.outerHTML.slice(0, 900); }));
  console.log(await p.evaluate(() => { const h = document.querySelector('.ssg-header-cell, [role=columnheader]'); return h.outerHTML.slice(0, 600); }));
  await b.close();
})();
