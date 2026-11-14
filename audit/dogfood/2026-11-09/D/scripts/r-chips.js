const { open, shot, sleep } = require('./lib');
(async () => {
  const { browser, page, logs } = await open({ viewport: { width: 600, height: 400 } });
  await page.goto('http://localhost:3401/repro/chips');
  await page.waitForSelector('.ssg-chip', { timeout: 60000 });
  await sleep(1500);
  const info = await page.evaluate(() => [...document.querySelectorAll('[role="gridcell"]')].map((c) => {
    const lab = c.querySelector('.ssg-chip') || c.firstElementChild;
    const inner = c.querySelector('.ssg-chip [class*="label"]') || lab;
    return { key: c.getAttribute('data-ssg-col-key'), cellW: Math.round(c.getBoundingClientRect().width), text: c.textContent, chipW: lab ? Math.round(lab.getBoundingClientRect().width) : null, labelScroll: inner ? inner.scrollWidth : null, labelClient: inner ? inner.clientWidth : null, chipHtml: c.innerHTML.slice(0, 300) };
  }));
  console.log(JSON.stringify(info, null, 1));
  console.log(await shot(page, 'r-chips'));
  console.log(logs.join('\n'));
  await browser.close();
})();
