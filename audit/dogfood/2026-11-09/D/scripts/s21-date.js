const { open, sleep, waitRows, shot, cellBox, visibleKeys, serverUser, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const keys = await visibleKeys(page, 5);
  const id = Number(keys[1]);
  const d = await cellBox(page, id, 'signedUpAt');
  console.log('signedUp before', d.text);
  await page.mouse.dblclick(d.x, d.y);
  await sleep(400);
  const de = await page.evaluate(() => ({ tag: document.activeElement?.tagName, type: document.activeElement?.getAttribute('type'), value: document.activeElement?.value }));
  console.log('date editor:', JSON.stringify(de));
  await shot(page, '21-date-open');
  // type a new date (native date input: type digits)
  if (de.type === 'date') {
    await page.keyboard.type('03152024');
  } else {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('2024-03-15');
  }
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('after', (await cellBox(page, id, 'signedUpAt')).text, 'server', (await serverUser(page, id)).signedUpAt);
  // type-to-start on date cell with a slash format
  const d2 = await cellBox(page, id, 'signedUpAt');
  await page.mouse.click(d2.x, d2.y);
  await page.keyboard.type('2');
  await sleep(300);
  const de2 = await page.evaluate(() => ({ tag: document.activeElement?.tagName, type: document.activeElement?.getAttribute('type'), value: document.activeElement?.value }));
  console.log('type-to-start date editor:', JSON.stringify(de2));
  await page.keyboard.press('Escape');
  // paste a date string in other format
  await page.evaluate(() => navigator.clipboard.writeText('2024/4/1'));
  await page.mouse.click(d2.x, d2.y);
  await page.keyboard.press('ControlOrMeta+v');
  await sleep(1500);
  console.log('paste 2024/4/1 ->', (await cellBox(page, id, 'signedUpAt')).text, 'server', (await serverUser(page, id)).signedUpAt);
  await page.evaluate(() => navigator.clipboard.writeText('April 2, 2024'));
  await page.keyboard.press('ControlOrMeta+v');
  await sleep(1500);
  const cb = await cellBox(page, id, 'signedUpAt');
  console.log('paste "April 2, 2024" ->', cb.text, 'invalid', cb.invalid, 'cls', cb.cls.match(/invalid\S*/g), 'server', (await serverUser(page, id)).signedUpAt);
  console.log('PATCH:', reqs.filter((r) => r.method === 'PATCH').map((p) => p.post));
  console.log('logs:', logs.filter((l) => !/DevTools|HMR|Fast Refresh/.test(l)).slice(0, 6));
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
