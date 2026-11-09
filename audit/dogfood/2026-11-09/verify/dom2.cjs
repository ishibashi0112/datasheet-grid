const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://127.0.0.1:5421/?s=paste'); await p.waitForSelector('.ssg-body-row');
  console.log(await p.evaluate(() => { const r = document.querySelector('[data-pane="center"].ssg-body-row'); return r.outerHTML.slice(0, 700); }));
  console.log(await p.evaluate(() => [...document.querySelectorAll('[role=columnheader]')].map(h=>h.outerHTML.slice(0,200)).join('\n')));
  await b.close();
})();
