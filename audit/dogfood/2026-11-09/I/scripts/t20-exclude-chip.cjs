const { open, askBar, barText } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  await askBar(page, '近畿と九州以外');
  await page.waitForTimeout(400);
  console.log('ask chips:', await page.$$eval('.ssg-ask-chip', (cs) => cs.map((c) => `${c.innerText.replace(/\n/g, ' ')} | title=${c.getAttribute('title')}`)));
  console.log('grid chips:', await page.$$eval('.ssg-filter-chip', (cs) => cs.map((c) => `${c.innerText.replace(/\n/g, ' ')} | title=${c.getAttribute('title') ?? c.querySelector('[title]')?.getAttribute('title')}`)));
  await askBar(page, 'ノートかボールペン');
  console.log('ask chips (in):', await page.$$eval('.ssg-ask-chip', (cs) => cs.map((c) => `${c.innerText.replace(/\n/g, ' ')} | title=${c.getAttribute('title')}`)));
  console.log('grid chips (in):', await page.$$eval('.ssg-filter-chip', (cs) => cs.map((c) => `${c.innerText.replace(/\n/g, ' ')}`)));
  await browser.close();
})();
