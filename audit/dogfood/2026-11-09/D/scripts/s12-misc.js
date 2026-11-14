const { open, shot, sleep, waitRows, openFilter, cellBox, debug, visibleKeys, menuAction, lastGet } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const gets = () => reqs.filter((r) => r.method === 'GET' && r.url.startsWith('/api/users?'));
  let K = await visibleKeys(page, 10);

  if (process.env.SKIP1) {} else {
  // 1) find
  let c = await cellBox(page, K[0], 'email');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+f');
  await sleep(300);
  await page.keyboard.type('kim');
  await sleep(800);
  const fb = await page.evaluate(() => document.querySelector('.ssg-find-bar')?.innerText);
  console.log('find bar:', JSON.stringify(fb), 'marks:', await page.evaluate(() => document.querySelectorAll('.ssg-find-mark').length));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await sleep(400);
  console.log('active after 2 next:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild.textContent.match(/Cell \S+/)?.[0]));
  console.log(await shot(page, '12-find'));
  await page.keyboard.press('Escape');
  await sleep(200);

  // 2) copy a 3x3 range (name..role) from visible rows
  K = await visibleKeys(page, 10);
  const a = await cellBox(page, K[1], 'name');
  const b = await cellBox(page, K[3], 'role');
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+c');
  await sleep(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  console.log('clipboard:', JSON.stringify(clip));
  // Ctrl+A copy: loaded rows only
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+c');
  await sleep(500);
  const all = await page.evaluate(() => navigator.clipboard.readText());
  console.log('Ctrl+A copy lines:', all.split(/\r?\n/).filter(Boolean).length);
  console.log('bottom bar after Ctrl+A:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild.textContent));
  await page.keyboard.press('Escape');

  }
  // 3) Pin column without onColumnsChange
  const before = await page.evaluate(() => document.querySelector('[role="columnheader"][data-ssg-col-key="email"]').closest('[data-pane]')?.getAttribute('data-pane'));
  const h = page.locator('[role="columnheader"][data-ssg-col-key="email"]');
  await h.hover();
  await h.locator('button[aria-label^="Column menu"]').click();
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'Pin column' }).hover();
  await sleep(300);
  const sub = await page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel .ssg-menu-item')].map((b) => b.textContent + (b.getAttribute('aria-disabled') ? '(disabled:' + b.getAttribute('data-ssg-tooltip') + ')' : '')));
  console.log('menu items incl submenu:', sub);
  const leftItem = page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: /Pin left|Left/ }).first();
  // disabled without onColumnsChange (has note)
  const after = await page.evaluate(() => document.querySelector('[role="columnheader"][data-ssg-col-key="email"]').closest('[data-pane]')?.getAttribute('data-pane'));
  console.log('email pane before/after pin left:', before, after);
  await page.keyboard.press('Escape');

  // 4) Ctrl+End -> bottom
  K = await visibleKeys(page, 3);
  c = await cellBox(page, K[0], 'name');
  await page.mouse.click(c.x, c.y);
  const n = gets().length;
  await page.keyboard.press('ControlOrMeta+End');
  await sleep(1500);
  console.log('after Ctrl+End GETs:', gets().slice(n).map((g) => g.url.slice(0, 45)), 'bottom:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild.textContent.match(/Cell \S+/)?.[0]));
  console.log(await shot(page, '12-ctrl-end'));
  // PageUp x3 quickly
  for (let i = 0; i < 3; i++) await page.keyboard.press('PageUp');
  await sleep(1200);
  console.log('after PageUp x3:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild.textContent.match(/Cell \S+/)?.[0]));
  // Ctrl+Home
  await page.keyboard.press('ControlOrMeta+Home');
  await sleep(1200);
  console.log('after Ctrl+Home:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild.textContent.match(/Cell \S+/)?.[0]), 'scrollTop', await page.evaluate(() => document.querySelector('.ssg-scroll-container').scrollTop));

  // 5) Autosize all columns (SSRM)
  await menuAction(page, 'name', 'Autosize all columns');
  await sleep(1000);
  console.log(await shot(page, '12-autosize'));
  const widths = await page.evaluate(() => [...document.querySelectorAll('[role="columnheader"][data-ssg-col-key]')].map((h) => h.getAttribute('data-ssg-col-key') + ':' + Math.round(h.getBoundingClientRect().width)));
  console.log('widths after autosize:', widths.join(' '));

  // 6) edit then filter that excludes the row while saving
  K = await visibleKeys(page, 5);
  c = await cellBox(page, K[2], 'plan');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Enter');
  await sleep(200);
  const curPlan = c.text;
  console.log('plan cell', K[2], curPlan);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await sleep(50);
  const pop = await openFilter(page, 'plan');
  await pop.locator('.ssg-filter-option', { hasText: 'Enterprise' }).locator('input').click();
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(2500);
  console.log('PATCH:', reqs.filter((r) => r.method === 'PATCH').slice(-1).map((p) => p.status + ' ' + p.post), 'last GET', JSON.stringify(lastGet(reqs).query));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
