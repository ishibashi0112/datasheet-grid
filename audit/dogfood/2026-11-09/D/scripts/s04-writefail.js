const { open, shot, sleep, waitRows, cellBox, serverUser, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const patches = () => reqs.filter((r) => r.method === 'PATCH');

  // A) 100% failure -> rollback
  await debug(page, { failWriteRate: 1 });
  let c = await cellBox(page, 11, 'name');
  const orig = c.text;
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Should Rollback');
  await page.keyboard.press('Enter');
  await sleep(150);
  console.log('A pending:', JSON.stringify(await cellBox(page, 11, 'name')));
  await sleep(1100);
  c = await cellBox(page, 11, 'name');
  console.log('A after fail:', c.text, 'save=', c.save, 'orig=', orig);
  console.log(await shot(page, '04-fail'));
  const bars = await page.evaluate(() => [...document.querySelectorAll('.ssg-root [class*="bar"], .ssg-root [role="alert"], .ssg-root [role="status"]')].map((e) => e.className + ' :: ' + e.textContent.trim()).filter((s) => /fail|save|error/i.test(s)));
  console.log('bars:', bars);
  const toasts = await page.locator('[data-testid="toasts"]').innerText();
  console.log('toasts:', toasts);
  console.log('server:', (await serverUser(page, 11)).name);

  // B) paste 3x2 block (name, email) on users 12-14 with 100% failure -> all rollback, one PATCH
  await sleep(4500);
  const n0 = patches().length;
  c = await cellBox(page, 12, 'name');
  await page.mouse.click(c.x, c.y);
  await page.evaluate(() => navigator.clipboard.writeText('P One\tp.one@example.com\r\nP Two\tp.two@example.com\r\nP Three\tbad-email\r\n'));
  await page.keyboard.press('ControlOrMeta+v');
  await sleep(150);
  const mid = [];
  for (const id of [12, 13, 14]) mid.push((await cellBox(page, id, 'name')).text + ' / ' + (await cellBox(page, id, 'email')).text);
  console.log('B optimistic:', mid);
  await sleep(1200);
  const after = [];
  for (const id of [12, 13, 14]) after.push((await cellBox(page, id, 'name')).text + ' / ' + (await cellBox(page, id, 'email')).text);
  console.log('B after fail:', after, 'PATCH calls:', patches().length - n0);
  console.log('B PATCH body:', patches().slice(-1)[0]?.post);
  console.log(await shot(page, '04-paste-fail'));

  // C) success paste
  await debug(page, { failWriteRate: 0 });
  await sleep(500);
  c = await cellBox(page, 12, 'name');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+v');
  await sleep(1500);
  const after2 = [];
  for (const id of [12, 13, 14]) after2.push((await cellBox(page, id, 'name')).text + ' / ' + (await cellBox(page, id, 'email')).text);
  console.log('C after success:', after2);
  console.log('C PATCH body:', patches().slice(-1)[0]?.post);
  const bars2 = await page.evaluate(() => [...document.querySelectorAll('.ssg-root *')].filter((e) => e.children.length === 0 && /fail|could not/i.test(e.textContent)).map((e) => e.className + ' :: ' + e.textContent.trim()));
  console.log('C bars still?', bars2);

  // D) edit, then scroll away while pending, then back
  await debug(page, { failWriteRate: 0 });
  c = await cellBox(page, 15, 'notes');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.type('scroll test');
  await page.keyboard.press('Enter');
  await sleep(50);
  const scroller = await page.evaluate(() => {
    const s = [...document.querySelectorAll('.ssg-root *')].find((e) => e.scrollHeight > e.clientHeight + 100 && getComputedStyle(e).overflowY !== 'visible');
    return s ? s.className : null;
  });
  console.log('scroller', scroller);
  await page.mouse.move(700, 500);
  await page.mouse.wheel(0, 4000);
  await sleep(250);
  await page.mouse.wheel(0, -4000);
  await sleep(150);
  console.log('D back while pending:', JSON.stringify(await cellBox(page, 15, 'notes')));
  await sleep(1200);
  console.log('D after:', JSON.stringify(await cellBox(page, 15, 'notes')), 'server:', (await serverUser(page, 15)).notes);

  // E) consecutive edits same row: name then email before first resolves; first fails, second succeeds? use 100% then 0
  await debug(page, { failWriteRate: 1 });
  c = await cellBox(page, 16, 'name');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('First Edit');
  await page.keyboard.press('Tab');
  await debug(page, { failWriteRate: 0 });
  await page.keyboard.press('Enter'); // opens email editor? (Enter on active cell starts edit)
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('second@example.com');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('E row16:', (await cellBox(page, 16, 'name')).text, '/', (await cellBox(page, 16, 'email')).text, 'server:', JSON.stringify(await serverUser(page, 16)));
  console.log(await shot(page, '04-consecutive'));

  console.log('ALL PATCH:\n' + patches().map((p) => p.status + ' ' + p.post).join('\n'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
