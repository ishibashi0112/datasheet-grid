const { open, shot, sleep, waitRows, cellBox, serverUser, debug, menuAction, lastGet } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const patches = () => reqs.filter((r) => r.method === 'PATCH');
  const editCell = async (id, key, text, commitKey = 'Enter') => {
    const c = await cellBox(page, id, key);
    await page.mouse.dblclick(c.x, c.y);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type(text);
    await page.keyboard.press(commitKey);
  };

  // D) edit country (visible), scroll away while pending, back
  await editCell(15, 'country', 'JP');
  await sleep(50);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 5000);
  await sleep(300);
  console.log(await shot(page, '05-scrolled-away'));
  await page.mouse.wheel(0, -5000);
  await sleep(100);
  console.log('D back while pending:', JSON.stringify(await cellBox(page, 15, 'country')));
  await sleep(1200);
  console.log('D after:', JSON.stringify(await cellBox(page, 15, 'country')), 'server:', (await serverUser(page, 15)).country);

  // E) consecutive edits same row: first fails (#fail), second succeeds
  await editCell(16, 'name', 'Bad #fail', 'Tab');
  await sleep(50);
  await page.keyboard.press('Enter');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('second16@example.com');
  await page.keyboard.press('Enter');
  await sleep(150);
  console.log('E pending:', (await cellBox(page, 16, 'name')).text, '/', (await cellBox(page, 16, 'email')).text);
  await sleep(1500);
  console.log('E after:', (await cellBox(page, 16, 'name')).text, '/', (await cellBox(page, 16, 'email')).text);
  const s16 = await serverUser(page, 16);
  console.log('E server:', s16.name, s16.email);

  // F) same cell edited twice: first succeeds slowly, second fails -> rollback to first value
  await editCell(17, 'name', 'Kenji One');
  await sleep(60);
  await editCell(17, 'name', 'Kenji Two #fail');
  await sleep(2000);
  console.log('F after:', (await cellBox(page, 17, 'name')).text, 'server:', (await serverUser(page, 17)).name);

  // G) edit then sort immediately while saving
  await sleep(4500);
  await editCell(18, 'name', 'Sort Wait');
  await sleep(30);
  await menuAction(page, 'id', 'Sort descending');
  await sleep(100);
  console.log(await shot(page, '05-sort-during-save'));
  await sleep(2500);
  const g = lastGet(reqs);
  console.log('G last GET', JSON.stringify(g?.query), 'top rows:', await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-row-key]')].slice(0, 3).map((r) => r.getAttribute('data-row-key'))));
  // undo sort
  await menuAction(page, 'id', 'Sort ascending');
  await sleep(1800);
  console.log('G row18 after:', JSON.stringify(await cellBox(page, 18, 'name')), 'server:', (await serverUser(page, 18)).name);
  // order of GET and PATCH timing
  const timeline = reqs.filter((r) => r.t > Date.now() - 12000).map((r) => `${r.t % 100000} ${r.method} ${r.status} ${r.url.slice(0, 60)} ${r.post ? r.post.slice(0, 60) : ''}`);
  console.log(timeline.join('\n'));

  // H) refresh during save, with failure
  await editCell(19, 'name', 'Refresh #fail');
  await sleep(30);
  await page.click('[data-testid="refresh"]');
  await sleep(150);
  console.log('H during:', JSON.stringify(await cellBox(page, 19, 'name')));
  await sleep(2500);
  console.log('H after:', JSON.stringify(await cellBox(page, 19, 'name')), 'server:', (await serverUser(page, 19)).name);
  const bars = await page.evaluate(() => [...document.querySelectorAll('.ssg-ssrm-error-bar-msg')].map((e) => e.textContent));
  console.log('H bars:', bars, 'toasts:', await page.locator('[data-testid="toasts"]').innerText());
  console.log(await shot(page, '05-refresh-fail'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
