const { open, shot, sleep, waitRows, cellBox, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const gets = () => reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  // outage on
  await page.click('[data-testid="outage"]');
  await sleep(300);
  const n0 = gets().length;
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 8000); // scroll to ~row 220
  await sleep(1500);
  console.log('GETs after scroll:', gets().slice(n0).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  console.log(await shot(page, '06-outage'));
  const bar = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent));
  console.log('bar:', bar, 'toasts:', await page.locator('[data-testid="toasts"]').innerText());
  // scroll a bit more within failed region and back: should not re-request failed blocks
  const n1 = gets().length;
  await page.mouse.wheel(0, -500);
  await sleep(500);
  await page.mouse.wheel(0, 500);
  await sleep(800);
  console.log('GETs from scroll within failed area:', gets().slice(n1).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  // scroll to new area (should request, fail)
  const n2 = gets().length;
  await page.mouse.wheel(0, 8000);
  await sleep(1200);
  console.log('GETs new area:', gets().slice(n2).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  const bar2 = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent));
  console.log('bar2:', bar2);
  // retry while still down via built-in retry button
  const retryBtn = page.locator('.ssg-ssrm-error-bar button', { hasText: /retry/i });
  console.log('retry buttons:', await retryBtn.count(), await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar button')].map((b) => b.textContent + '|' + b.getAttribute('aria-label'))));
  // close bar
  const n3 = gets().length;
  // outage off then handle.retryServerSideLoads via app button
  await page.click('[data-testid="outage"]');
  await sleep(200);
  await page.click('[data-testid="retry"]');
  await sleep(1500);
  console.log('GETs after retry:', gets().slice(n3).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  const bar3 = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent));
  console.log('bar3:', bar3);
  console.log(await shot(page, '06-recovered'));
  // scroll back up to previously failed area (first failed blocks) - should they be loaded?
  const n4 = gets().length;
  await page.mouse.wheel(0, -8000);
  await sleep(1500);
  console.log('GETs scrolling back:', gets().slice(n4).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  const sk = await page.evaluate(() => document.querySelectorAll('[class*="skeleton"]').length);
  console.log('skeleton els visible:', sk);
  console.log(await shot(page, '06-back'));

  // Built-in retry button path: outage on, scroll new area, outage off, click built-in retry
  await page.click('[data-testid="outage"]');
  await sleep(200);
  await page.mouse.wheel(0, 30000);
  await sleep(1500);
  await page.click('[data-testid="outage"]');
  await sleep(200);
  const n5 = gets().length;
  const btns = page.locator('.ssg-ssrm-error-bar button');
  const labels = await btns.evaluateAll((bs) => bs.map((b) => b.textContent));
  console.log('bar buttons:', labels);
  const idx = labels.findIndex((l) => /retry/i.test(l));
  if (idx >= 0) await btns.nth(idx).click();
  await sleep(1500);
  console.log('GETs after built-in retry:', gets().slice(n5).map((g) => g.status + ' ' + g.url.slice(0, 40)));
  console.log('bar after:', await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar')].map((e) => e.textContent)));
  console.log('\nLOGS\n' + logs.filter((l) => !l.includes('Failed to load resource')).join('\n'));
  console.log('500 errors in console:', logs.filter((l) => l.includes('Failed to load resource')).length);
  await browser.close();
})();
