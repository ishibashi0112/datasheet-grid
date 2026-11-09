const { open, shot, sleep, waitRows, openFilter, cellBox, debug, firstKeys, lastGet, visibleKeys } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const gets = () => reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  const st = () => page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container');
    return { url: location.pathname + location.search.slice(0, 40), scrollTop: sc?.scrollTop, visible: !!sc && sc.offsetParent !== null, roots: document.querySelectorAll('.ssg-root').length, chip: (document.querySelector('.ssg-root')?.textContent.match(/Rows\s*[\d,]+\s*of\s*[\d,]+/) || [''])[0] };
  });
  // filter plan != free and scroll
  let pop = await openFilter(page, 'plan');
  await pop.locator('.ssg-filter-option', { hasText: 'Free' }).locator('input').click();
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(1200);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 6000);
  await sleep(1200);
  console.log('before nav', await st());
  const K = await visibleKeys(page, 8);
  // edit and immediately navigate away
  const c = await cellBox(page, K[3], 'country'); console.log('target', K[3], c);
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('NavAway');
  await page.keyboard.press('Enter');
  await sleep(30);
  await page.click('[data-testid="nav-settings"]');
  await page.waitForURL('**/settings');
  await sleep(1500);
  console.log('on settings', await st());
  console.log(await shot(page, '11-settings'));
  await page.click('[data-testid="nav-users"]');
  await page.waitForURL('**/users**');
  await sleep(1500);
  console.log('back on users', await st());
  console.log(await shot(page, '11-back-users'));
  console.log('edited cell now:', JSON.stringify(await cellBox(page, K[3], 'country')));
  // can it still fetch?
  const n = gets().length;
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 8000);
  await sleep(1500);
  console.log('GETs after returning+scroll:', gets().slice(n).map((g) => g.status + ' ' + g.url.slice(0, 50)));
  console.log('after scroll', await st());
  // open a popover
  pop = await openFilter(page, 'role');
  console.log('popover opens:', await pop.isVisible());
  await page.keyboard.press('Escape');
  // edit works?
  const K2 = await visibleKeys(page, 8);
  const c2 = await cellBox(page, K2[2], 'name');
  await page.mouse.dblclick(c2.x, c2.y);
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('edit after return:', JSON.stringify(await cellBox(page, K2[2], 'name')), reqs.filter((r) => r.method === 'PATCH').map((p) => p.status + ' ' + p.post).slice(-3));
  // browser back/forward between routes
  await page.goBack();
  await sleep(1200);
  console.log('after goBack', await st());
  await page.goForward();
  await sleep(1500);
  console.log('after goForward', await st());
  console.log(await shot(page, '11-fwd'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
