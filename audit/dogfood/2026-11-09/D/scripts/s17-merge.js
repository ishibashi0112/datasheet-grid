const { open, sleep, waitRows, debug, cellBox, serverUser, visibleKeys, shot } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto(process.env.BASE_URL || 'http://localhost:3401/users');
  await waitRows(page);
  await debug(page, { failWriteRate: 0 });
  await sleep(500);
  const keys = await visibleKeys(page, 8);
  // find a pro/business user among visible
  let target = null;
  for (const k of keys) {
    const u = await serverUser(page, Number(k));
    if (u.plan !== 'free') { target = u; break; }
  }
  console.log('target', target.id, target.plan, 'seats', target.seats, 'mrr', target.mrr);
  const before = await cellBox(page, target.id, 'mrr');
  console.log('mrr cell before:', before.text);
  const c = await cellBox(page, target.id, 'seats');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.type('7');
  await page.keyboard.press('Enter');
  await sleep(150);
  console.log('seats right after commit:', (await cellBox(page, target.id, 'seats')).text, 'save=', (await cellBox(page, target.id, 'seats')).save);
  await sleep(1500);
  const after = await cellBox(page, target.id, 'mrr');
  const srv = await serverUser(page, target.id);
  console.log('after save: seats cell', (await cellBox(page, target.id, 'seats')).text, '| mrr cell', after.text, '| server mrr', srv.mrr);
  const patches = reqs.filter((r) => r.method === 'PATCH');
  console.log('PATCH bodies:', patches.map((p) => p.post));
  // Ctrl+Z in SSRM
  const nPatch = patches.length;
  await page.keyboard.press('ControlOrMeta+z');
  await sleep(1200);
  console.log('after Ctrl+Z seats', (await cellBox(page, target.id, 'seats')).text, 'PATCH count delta', reqs.filter((r) => r.method === 'PATCH').length - nPatch);
  // Delete key clears seats? (min 1, nullable?)
  const c2 = await cellBox(page, target.id, 'notes');
  await page.mouse.click(c2.x, c2.y);
  await page.keyboard.press('Delete');
  await sleep(1500);
  const srv2 = await serverUser(page, target.id);
  console.log('after Delete on notes: cell', JSON.stringify((await cellBox(page, target.id, 'notes')).text), 'server', JSON.stringify(srv2.notes));
  console.log('last PATCH', reqs.filter((r) => r.method === 'PATCH').slice(-1).map((p) => p.post));
  // email normalisation: type upper-case email -> server lowercases -> cell shows lower?
  const c3 = await cellBox(page, target.id, 'email');
  await page.mouse.dblclick(c3.x, c3.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Mixed.Case@Example.COM');
  await page.keyboard.press('Enter');
  await sleep(1500);
  console.log('email cell after save:', (await cellBox(page, target.id, 'email')).text);
  await shot(page, '17-merge');
  console.log('logs:', logs.filter((l) => /error|warn/i.test(l)).slice(0, 5));
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
