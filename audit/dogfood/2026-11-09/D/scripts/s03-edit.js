const { open, shot, sleep, waitRows, cellBox, serverUser, debug } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const patches = () => reqs.filter((r) => r.method === 'PATCH');

  // 1) edit name of user 3
  let c = await cellBox(page, 3, 'name');
  await page.mouse.dblclick(c.x, c.y);
  await sleep(200);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Aiden Smithers');
  await page.keyboard.press('Enter');
  await sleep(100);
  c = await cellBox(page, 3, 'name');
  console.log('after enter:', c.text, 'save=', c.save);
  await sleep(100);
  console.log(await shot(page, '03-pending'));
  await sleep(1200);
  c = await cellBox(page, 3, 'name');
  console.log('after save:', c.text, 'save=', c.save);
  console.log('server:', (await serverUser(page, 3)).name);
  console.log('PATCH body:', patches().slice(-1)[0]?.post);

  // 2) email invalid with reject
  c = await cellBox(page, 4, 'email');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('F2');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('not-an-email');
  await page.keyboard.press('Enter');
  await sleep(400);
  console.log(await shot(page, '03-reject'));
  const editorOpen = await page.evaluate(() => !!document.querySelector('.ssg-cell-editor'));
  const bubble = await page.evaluate(() => [...document.querySelectorAll('[class*="invalid"], [class*="error"], [role="alert"]')].map((e) => e.className + ':' + e.textContent.trim()).slice(0, 5));
  console.log('editor still open:', editorOpen, 'bubble:', bubble);
  await page.keyboard.press('Escape');
  await sleep(200);
  console.log('email after esc:', (await cellBox(page, 4, 'email')).text, 'patches so far', patches().length);

  // 3) email uppercase -> server normalizes
  c = await cellBox(page, 4, 'email');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Chen.DAVIS@Example.COM');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('email after normalize:', (await cellBox(page, 4, 'email')).text, 'server:', (await serverUser(page, 4)).email);

  // 4) select editor role for user 5: Enter opens
  c = await cellBox(page, 5, 'role');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Enter');
  await sleep(300);
  console.log(await shot(page, '03-select-open'));
  const opts = await page.evaluate(() => [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent + (o.getAttribute('aria-selected') === 'true' ? '*' : '')));
  console.log('select options:', opts);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('role after:', (await cellBox(page, 5, 'role')).text, 'server:', (await serverUser(page, 5)).role);

  // 5) seats number: type 0 (min 1) -> mark mode
  c = await cellBox(page, 6, 'seats');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await sleep(1500);
  c = await cellBox(page, 6, 'seats');
  console.log('seats after 0:', c.text, 'invalid=', c.invalid, c.cls, 'server:', (await serverUser(page, 6)).seats);
  await page.mouse.move(c.x, c.y);
  await sleep(800);
  const tip = await page.evaluate(() => document.querySelector('.ssg-tooltip')?.textContent);
  console.log('tooltip:', tip);
  console.log(await shot(page, '03-mark'));

  // 6) seats with text 'abc'
  c = await cellBox(page, 7, 'seats');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await sleep(1500);
  c = await cellBox(page, 7, 'seats');
  console.log('seats after abc:', JSON.stringify(c.text), 'invalid=', c.invalid, 'server:', JSON.stringify((await serverUser(page, 7)).seats));

  // 7) date editor signedUpAt user 8
  c = await cellBox(page, 8, 'signedUpAt');
  await page.mouse.dblclick(c.x, c.y);
  await sleep(300);
  const editorHtml = await page.evaluate(() => document.querySelector('.ssg-cell-editor')?.outerHTML.slice(0, 500));
  console.log('date editor:', editorHtml);
  await page.keyboard.type('03152025');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('date after:', (await cellBox(page, 8, 'signedUpAt')).text, 'server:', (await serverUser(page, 8)).signedUpAt);

  // 8) Delete key on notes (clear)
  c = await cellBox(page, 9, 'notes');
  await page.mouse.click(c.x, c.y);
  const before = c.text;
  await page.keyboard.press('Delete');
  await sleep(1500);
  console.log('notes before:', JSON.stringify(before), 'after:', JSON.stringify((await cellBox(page, 9, 'notes')).text), 'server:', JSON.stringify((await serverUser(page, 9)).notes));

  // 9) Delete on name (reject: required)
  c = await cellBox(page, 10, 'name');
  await page.mouse.click(c.x, c.y);
  const n = reqs.filter((r) => r.method === 'PATCH').length;
  await page.keyboard.press('Delete');
  await sleep(1000);
  console.log('name after delete (reject):', (await cellBox(page, 10, 'name')).text, 'new patches:', reqs.filter((r) => r.method === 'PATCH').length - n);

  console.log('ALL PATCH bodies:\n' + patches().map((p) => p.status + ' ' + p.post).join('\n'));
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
