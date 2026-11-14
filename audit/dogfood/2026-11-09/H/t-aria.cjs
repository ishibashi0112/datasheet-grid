const { open, G } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(500);
  const chain = await page.evaluate(() => { let e = document.querySelector('.ssg-detail-card'); const out = []; while (e && !e.matches('[role="grid"]')) { out.push(e.tagName + '.' + [...e.classList].join('.') + (e.getAttribute('role') ? '[role=' + e.getAttribute('role') + ']' : '') + (e.getAttribute('aria-hidden') ? '[aria-hidden]' : '')); e = e.parentElement; } return out; });
  console.log(chain.join('\n'));
  const snap = await page.locator(G).ariaSnapshot().catch(e => e.message);
  console.log(snap.split('\n').slice(0, 40).join('\n'));
  await browser.close();
})();
