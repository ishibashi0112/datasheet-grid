const { open, shot, sleep, waitRows, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const gets = () => reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  await debug(page, { failReads: true });
  await page.mouse.move(700, 500);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 5000); await sleep(150); }
  await sleep(1500);
  console.log('GETs:', gets().map((g) => g.status + ' ' + g.url.slice(0, 45)));
  console.log('scrollTop', await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop));
  const bar = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent));
  console.log('bar:', bar);
  await debug(page, { failReads: false });
  const n = gets().length;
  const btn = page.locator('.ssg-ssrm-error-bar button', { hasText: 'Retry' });
  if (await btn.count()) await btn.click();
  await sleep(1500);
  console.log('after builtin Retry GETs:', gets().slice(n).map((g) => g.status + ' ' + g.url.slice(0, 45)), 'bar:', await page.evaluate(() => document.querySelectorAll('.ssg-ssrm-error-bar').length));
  // dismiss behaviour: fail again, dismiss with ×, scroll to new area -> bar reappears?
  await debug(page, { failReads: true });
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 5000); await sleep(150); }
  await sleep(1200);
  console.log('bar2:', await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent)));
  await page.locator('.ssg-ssrm-error-bar button[aria-label="Dismiss the error"]').click();
  await sleep(300);
  console.log('after dismiss:', await page.evaluate(() => document.querySelectorAll('.ssg-ssrm-error-bar').length));
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 5000); await sleep(150); }
  await sleep(1200);
  console.log('after new failure:', await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent)));
  await debug(page, { failReads: false });
  // refreshServerSide clears failure state?
  await page.click('[data-testid="refresh"]');
  await sleep(1500);
  console.log('after refresh:', await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent)), 'skeletons', await page.evaluate(() => document.querySelectorAll('[data-skeleton-row]').length));
  console.log(await shot(page, '06b-after-refresh'));
  console.log('\nLOGS\n' + logs.filter((l) => !l.includes('Failed to load')).join('\n'));
  await browser.close();
})();
