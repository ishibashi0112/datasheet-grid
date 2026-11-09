const { open, sleep, waitRows, lastGet, shot, cellBox, visibleKeys, serverUser, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  const f = encodeURIComponent(JSON.stringify({ bogus: { kind: 'text', value: 'x' }, plan: { kind: 'set', mode: 'include', values: ['pro'] } }));
  await page.goto(`http://localhost:3401/users?sort=bogus.asc,mrr.desc&filters=${f}`);
  await waitRows(page, 60000);
  await sleep(1000);
  console.log('GET query:', JSON.stringify(lastGet(reqs).query));
  console.log('dev logs (unknown col):', logs.filter((l) => !/Download the React DevTools|HMR|Fast Refresh/.test(l)).slice(0, 6));
  logs.length = 0;
  await debug(page, { failWriteRate: 0 });
  // select editor via mouse: role column
  const keys = await visibleKeys(page, 5);
  const id = Number(keys[1]);
  const c = await cellBox(page, id, 'role');
  const before = c.text;
  await page.mouse.dblclick(c.x, c.y);
  await sleep(400);
  await shot(page, '20-select-open');
  const ed = await page.evaluate(() => {
    const a = document.activeElement;
    const lb = document.querySelector('[role="listbox"]');
    return { tag: a?.tagName, role: a?.getAttribute('role'), cls: a?.className, listbox: !!lb, opts: lb ? [...lb.querySelectorAll('[role=option]')].map((o) => o.textContent) : null };
  });
  console.log('select editor:', JSON.stringify(ed));
  if (ed.listbox) {
    const target = ed.opts.find((o) => o !== before) || ed.opts[0];
    await page.locator('[role="listbox"] [role="option"]', { hasText: target }).click();
  } else if (ed.tag === 'SELECT') {
    const opts = await page.evaluate(() => [...document.activeElement.options].map((o) => o.value));
    await page.selectOption('select:focus', opts.find((o) => o.toLowerCase() !== before.toLowerCase()));
  }
  await sleep(1500);
  console.log('role before', before, 'after', (await cellBox(page, id, 'role')).text, 'server', (await serverUser(page, id)).role);
  // date editor via keyboard
  const d = await cellBox(page, id, 'lastActiveAt');
  await page.mouse.dblclick(d.x, d.y);
  await sleep(300);
  const de = await page.evaluate(() => ({ tag: document.activeElement?.tagName, type: document.activeElement?.getAttribute('type'), value: document.activeElement?.value }));
  console.log('date editor:', JSON.stringify(de));
  await shot(page, '20-date-open');
  await page.keyboard.press('Escape');
  await sleep(300);
  console.log('dev logs (edit):', logs.filter((l) => !/Download the React DevTools|HMR|Fast Refresh/.test(l)).slice(0, 6));
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
