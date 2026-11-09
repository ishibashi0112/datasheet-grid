const { open, shot, sleep, waitRows, openFilter, menuAction, lastGet } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const rowsChip = async () => page.evaluate(() => {
    const t = document.querySelector('.ssg-root')?.textContent || '';
    const m = t.match(/Rows\s*([\d,]+)\s*of\s*([\d,]+)/);
    return m ? m[0] : t.slice(0, 200);
  });
  const serverCount = async (query) => page.evaluate(async (q) => {
    const r = await fetch('/api/users?start=0&end=1&query=' + encodeURIComponent(JSON.stringify(q)));
    return (await r.json()).totalRowCount;
  }, query);
  const step = async (label) => {
    await sleep(1200);
    const g = lastGet(reqs);
    const sc = g ? await serverCount(g.query) : null;
    console.log(`\n## ${label}\nlast GET start=${g?.start} end=${g?.end} status=${g?.status}\nquery=${JSON.stringify(g?.query)}\nchip=${await rowsChip()} serverCount=${sc} url=${page.url()}`);
  };

  // 1) text filter on Name
  let pop = await openFilter(page, 'name');
  await pop.locator('input.ssg-filter-input').fill('yuki');
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('name contains yuki');

  // 2) set filter on Plan: uncheck Free
  pop = await openFilter(page, 'plan');
  await pop.locator('.ssg-filter-option', { hasText: 'Free' }).locator('input').click();
  await sleep(200);
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('plan without Free');

  // 3) number filter on Seats >= 100
  pop = await openFilter(page, 'seats');
  await pop.locator('select').selectOption('gte');
  await pop.locator('input.ssg-filter-input').fill('100');
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('seats >= 100');

  // 4) dateSet range on Signed up
  pop = await openFilter(page, 'signedUpAt');
  await pop.locator('input[aria-label="Start date"]').fill('2024/1/1');
  await pop.locator('input[aria-label="Start date"]').press('Enter');
  await pop.locator('input[aria-label="End date"]').fill('2025/12/31');
  await pop.locator('input[aria-label="End date"]').press('Enter');
  await sleep(300);
  console.log(await shot(page, '02-dateset-range'));
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('signedUp 2024-01-01..2025-12-31');

  // 5) date (substring) on Last active
  pop = await openFilter(page, 'lastActiveAt');
  await pop.locator('input.ssg-filter-input').fill('2026-');
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('lastActive contains 2026-');

  // 6) country set from getFilterOptions: only JP and US (search)
  pop = await openFilter(page, 'country');
  await sleep(600);
  // uncheck select all then pick JP, US
  await pop.locator('.ssg-filter-selectall input').click();
  await pop.locator('.ssg-filter-option', { hasText: /^JP$/ }).locator('input').click();
  await pop.locator('.ssg-filter-option', { hasText: /^US$/ }).locator('input').click();
  await sleep(200);
  console.log(await shot(page, '02-country'));
  await pop.locator('.ssg-filter-btn-primary').click();
  await step('country in JP,US');

  // options request query
  const opt = reqs.filter((r) => r.url.startsWith('/api/users/options'));
  console.log('\nOPTIONS requests:', opt.map((o) => o.url).join('\n'));

  // 7) sort MRR desc via menu
  await menuAction(page, 'mrr', 'Sort descending');
  await step('sort mrr desc');
  // 8) shift+click Name header to add sort
  const nameHdr = page.locator('[role="columnheader"][data-ssg-col-key="name"] .ssg-header-label');
  await page.keyboard.down('Shift');
  await nameHdr.click();
  await page.keyboard.up('Shift');
  await step('shift+click name');

  // 9) global filter
  const gf = page.locator('.ssg-root input[placeholder="Filter all columns"]');
  await gf.click();
  await page.keyboard.type('vip', { delay: 80 });
  await step('global vip');
  const gets = reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  console.log('\nTotal GETs', gets.length);
  console.log(await shot(page, '02-filters-final'));
  // check first rows sorted desc by mrr
  const vals = await page.evaluate(() => [...document.querySelectorAll('[role="row"]')].slice(1, 12).map((r) => [...r.querySelectorAll('[role="gridcell"]')].map((c) => c.textContent.trim()).join(' | ')));
  console.log(vals.join('\n'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
