const { open, sleep, waitRows, debug, cellBox, serverUser, visibleKeys, shot } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page);
  await debug(page, { failWriteRate: 0 });
  const keys = await visibleKeys(page, 8);
  const id = Number(keys[2]);
  // scroll notes into view
  await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); s.scrollLeft = 10000; });
  await sleep(400);
  let c = await cellBox(page, id, 'notes');
  console.log('notes cell', c && { x: c.x, text: c.text });
  // set a note first
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('temp note');
  await page.keyboard.press('Enter');
  await sleep(1500);
  c = await cellBox(page, id, 'notes');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Delete');
  await sleep(1500);
  console.log('after Delete notes cell', JSON.stringify((await cellBox(page, id, 'notes')).text), 'server', JSON.stringify((await serverUser(page, id)).notes));
  // Delete on required name (reject) -> skipped
  await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); s.scrollLeft = 0; });
  await sleep(300);
  c = await cellBox(page, id, 'name');
  const nm = c.text;
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Delete');
  await sleep(1200);
  console.log('Delete on name (required): cell', (await cellBox(page, id, 'name')).text, 'was', nm);
  // Delete on seats (number, min 1) -> null?
  c = await cellBox(page, id, 'seats');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('Delete');
  await sleep(1500);
  const s = await cellBox(page, id, 'seats');
  console.log('Delete on seats: cell', JSON.stringify(s.text), 'server seats', JSON.stringify((await serverUser(page, id)).seats), 'mrr', (await serverUser(page, id)).mrr);
  console.log('PATCHes:', reqs.filter((r) => r.method === 'PATCH').map((p) => p.post));
  // range Delete across name..email for 2 rows (name required reject -> skipped, email reject -> skipped)
  console.log('logs:', logs.filter((l) => /error|warn/i.test(l)).slice(0, 5));
  await shot(page, '18-delete');
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
