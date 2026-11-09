const { open, shot, sleep, waitRows, openFilter, menuAction, lastGet } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  const gets = () => reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  await page.goto('http://localhost:3401/users?sort=mrr.desc&q=vip');
  await waitRows(page, 60000);
  await sleep(800);
  console.log('initial GETs:', gets().map((g) => g.url.slice(0, 120)));
  const hdrState = async () => page.evaluate(() => {
    const t = document.querySelector('.ssg-root').textContent;
    return { sort: (t.match(/Sort:[^R]*?(?=Rows|Filter|$)/) || [''])[0].slice(0, 60), gf: document.querySelector('.ssg-root input[placeholder="Filter all columns"]')?.value, url: location.search, hist: history.length };
  });
  console.log('state', await hdrState());

  // apply plan filter
  let pop = await openFilter(page, 'plan');
  await pop.locator('.ssg-filter-option', { hasText: 'Free' }).locator('input').click();
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(1200);
  console.log('after plan filter', await hdrState());
  // change sort
  await menuAction(page, 'name', 'Sort ascending');
  await sleep(1200);
  console.log('after sort name', await hdrState());
  // type more global text
  const gf = page.locator('.ssg-root input[placeholder="Filter all columns"]');
  await gf.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' cust', { delay: 60 });
  await sleep(1500);
  console.log('after global', await hdrState(), lastGet(reqs).query);
  await page.mouse.click(700, 600);

  // back x1
  const n = gets().length;
  await page.goBack();
  await sleep(1500);
  console.log('BACK1', await hdrState(), 'GET:', JSON.stringify(lastGet(reqs).query), 'new GETs', gets().length - n);
  await page.goBack();
  await sleep(1500);
  console.log('BACK2', await hdrState(), 'GET:', JSON.stringify(lastGet(reqs).query));
  await page.goBack();
  await sleep(1500);
  console.log('BACK3', await hdrState(), 'GET:', JSON.stringify(lastGet(reqs).query));
  console.log(await shot(page, '08-back3'));
  await page.goForward();
  await sleep(1500);
  console.log('FWD1', await hdrState(), 'GET:', JSON.stringify(lastGet(reqs).query));
  await page.goForward();
  await page.goForward();
  await sleep(1500);
  console.log('FWD3', await hdrState(), 'GET:', JSON.stringify(lastGet(reqs).query));
  console.log(await shot(page, '08-fwd3'));
  // reload keeps state (initialState from URL)
  reqs.length = 0;
  await page.reload();
  await waitRows(page, 60000).catch(() => {});
  await sleep(1000);
  console.log('RELOAD', await hdrState(), 'GETs:', gets().map((g) => g.url.slice(0, 200)));
  console.log(await shot(page, '08-reload'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
