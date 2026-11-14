const { open, shot, sleep, waitRows, cellBox, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const chip = () => page.evaluate(() => (document.querySelector('.ssg-root')?.textContent.match(/Rows\s*[\d,]+\s*of\s*[\d,]+/) || [''])[0]);
  console.log('initial', await chip());
  // scroll down a bit so we can see refresh preserves scroll
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 300);
  await sleep(600);
  const scrollBefore = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
  // Form: type name, press Enter inside name input -> submits form; ensure grid not affected
  await page.click('[data-testid="add-name"]');
  await page.keyboard.type('Zed Newcomer');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  console.log('Tab from name moved focus to:', focused);
  await page.keyboard.type('zed@example.com');
  await page.keyboard.press('Enter');
  await sleep(1500);
  const scrollAfter = await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop);
  console.log('after add', await chip(), 'toasts:', await page.locator('[data-testid="toasts"]').innerText(), 'scroll', scrollBefore, '->', scrollAfter);
  await page.mouse.wheel(0, -2000);
  await sleep(800);
  const top = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-row-key]')].slice(0, 2).map((r) => r.getAttribute('data-row-key') + ':' + r.textContent.slice(0, 40)));
  console.log('top rows', top);
  // select 3 rows with checkboxes (incl. the new one)
  for (const key of ['50001', '1', '2']) {
    const cb = page.locator(`[role="row"][data-row-key="${key}"] [role="checkbox"]`).first();
    if (await cb.count()) await cb.click(); else console.log('no checkbox for', key);
    await sleep(100);
  }
  console.log('delete btn:', await page.locator('[data-testid="delete-selected"]').innerText());
  console.log(await shot(page, '07-selected'));
  await page.click('[data-testid="delete-selected"]');
  await sleep(1500);
  console.log('after delete', await chip(), 'btn:', await page.locator('[data-testid="delete-selected"]').innerText());
  const top2 = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-row-key]')].slice(0, 3).map((r) => r.getAttribute('data-row-key') + ':' + r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')));
  console.log('top rows after delete', top2);
  // select-all checkbox in header -> exclude model
  await page.locator('[role="columnheader"] [aria-label="Select all rows"]').click();
  await sleep(300);
  console.log('after select all, btn:', await page.locator('[data-testid="delete-selected"]').innerText(), 'header state:', await page.locator('[aria-label="Select all rows"]').getAttribute('aria-checked'));
  console.log(await shot(page, '07-selectall'));
  // scroll far to unloaded area and check checkboxes are checked there
  await page.mouse.wheel(0, 20000);
  await sleep(1500);
  const deep = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-row-key]')].slice(0, 3).map((r) => r.getAttribute('data-row-key') + ':' + r.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')));
  console.log('deep rows', deep);
  await page.locator('[role="columnheader"] [aria-label="Select all rows"]').click();
  await sleep(300);
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
