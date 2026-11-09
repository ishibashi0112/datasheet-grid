const { open, shot, sleep, waitRows, cellBox, serverUser, debug, menuAction, lastGet } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const editCell = async (id, key, text, commitKey = 'Enter') => {
    const c = await cellBox(page, id, key);
    await page.mouse.dblclick(c.x, c.y);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
    await page.keyboard.press(commitKey);
  };
  const probe = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"][data-row-index]')];
    const sk = document.querySelectorAll('[class*="skeleton"]').length;
    return { t: performance.now() | 0, rows: rows.length, keys: rows.slice(0, 3).map((r) => r.getAttribute('data-row-key')), skeletonEls: sk, row5: document.querySelector('[role="row"][data-row-key="5"] [data-ssg-col-key="name"]')?.textContent };
  });

  // G) edit then sort immediately while saving; sample DOM every 100ms
  const t0 = Date.now();
  await editCell(5, 'name', 'Sort Wait 5');
  const tEdit = Date.now();
  await menuAction(page, 'id', 'Sort descending');
  const tSort = Date.now();
  const samples = [];
  for (let i = 0; i < 20; i++) { samples.push({ dt: Date.now() - tSort, ...(await probe()) }); if (i === 2) await shot(page, '05b-during-wait'); await sleep(80); }
  console.log('edit->sort ms', tSort - tEdit);
  console.log(samples.map((s) => JSON.stringify(s)).join('\n'));
  console.log(reqs.filter((r) => r.t >= t0).map((r) => `${r.t - tSort} ${r.method} ${r.status}`).join('\n'));
  await menuAction(page, 'id', 'Sort ascending');
  await sleep(2000);

  // H) refresh during save with failure
  const n0 = reqs.length;
  await editCell(6, 'name', 'Refresh #fail');
  const tE = Date.now();
  await sleep(30);
  await page.click('[data-testid="refresh"]');
  const s2 = [];
  for (let i = 0; i < 15; i++) { s2.push({ dt: Date.now() - tE, ...(await page.evaluate(() => ({ name6: document.querySelector('[role="row"][data-row-key="6"] [data-ssg-col-key="name"]')?.textContent, save: document.querySelector('[role="row"][data-row-key="6"] [data-ssg-col-key="name"]')?.getAttribute('data-ssg-save') }))) }); await sleep(120); }
  console.log(s2.map((s) => JSON.stringify(s)).join('\n'));
  console.log(reqs.slice(n0).map((r) => `${r.t - tE} ${r.method} ${r.status} ${r.post || ''}`).join('\n'));
  await sleep(1000);
  console.log('H after:', JSON.stringify(await cellBox(page, 6, 'name')), 'server:', (await serverUser(page, 6)).name);
  const bars = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar-msg')].map((e) => e.textContent));
  console.log('H bars:', bars, 'toasts:', await page.locator('[data-testid="toasts"]').innerText());
  console.log(await shot(page, '05b-refresh-fail'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
