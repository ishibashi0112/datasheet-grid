const { open, shot, sleep, waitRows, cellBox, debug, visibleKeys } = require('./lib');
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const patches = () => reqs.filter((r) => r.method === 'PATCH');
  let K = await visibleKeys(page, 10);
  // 1) open editor, wheel scroll while editing
  let c = await cellBox(page, K[4], 'name');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' WIP');
  await page.mouse.move(700, 600);
  await page.mouse.wheel(0, 300);
  await sleep(500);
  const st = await page.evaluate(() => ({ editor: !!document.querySelector('.ssg-cell-editor'), active: document.activeElement?.className, edPos: document.querySelector('.ssg-cell-editor')?.getBoundingClientRect().top }));
  console.log('editor after wheel:', st);
  console.log(await shot(page, '13-edit-wheel'));
  await page.keyboard.press('Enter');
  await sleep(1300);
  console.log('after enter:', JSON.stringify(await cellBox(page, K[4], 'name')), 'patch:', patches().slice(-1).map((p) => p.post));
  // 2) wheel back
  await page.mouse.wheel(0, -300);
  await sleep(500);
  // 3) Scroll far fast and type into skeleton cell
  await page.mouse.wheel(0, 200000);
  await sleep(50);
  const skel = await page.evaluate(() => {
    const r = [...document.querySelectorAll('[role="row"][data-row-index]')].find((x) => !x.getAttribute('data-row-key') || x.querySelector('[class*="skeleton"]'));
    if (!r) return null;
    const cell = r.querySelector('[role="gridcell"][aria-colindex="3"]') || r.querySelector('[role="gridcell"]');
    const b = cell.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2, html: r.outerHTML.slice(0, 300) };
  });
  console.log('skeleton row:', skel && skel.html);
  const n = patches().length;
  if (skel) {
    await page.mouse.click(skel.x, skel.y);
    await page.keyboard.type('zzz');
    await page.keyboard.press('Enter');
    await sleep(1500);
    console.log('editor open?', await page.evaluate(() => !!document.querySelector('.ssg-cell-editor')), 'new patches:', patches().length - n, patches().slice(n).map((p) => p.post));
    console.log(await shot(page, '13-skeleton-type'));
  }
  // 4) column resize by drag (name)
  await page.keyboard.press('Escape');
  await page.mouse.wheel(0, -200000);
  await sleep(1200);
  const rh = await page.evaluate(() => { const b = document.querySelector('[role="columnheader"][data-ssg-col-key="email"] .ssg-header-resize').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  const w0 = await page.evaluate(() => document.querySelector('[role="columnheader"][data-ssg-col-key="email"]').getBoundingClientRect().width);
  await page.mouse.move(rh.x, rh.y);
  await page.mouse.down();
  await page.mouse.move(rh.x + 80, rh.y, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const w1 = await page.evaluate(() => document.querySelector('[role="columnheader"][data-ssg-col-key="email"]').getBoundingClientRect().width);
  console.log('email width', w0, '->', w1);
  // 5) context menu action
  K = await visibleKeys(page, 5);
  c = await cellBox(page, K[0], 'email');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await sleep(300);
  const items = await page.evaluate(() => [...document.querySelectorAll('[class*="context"] button, [role="menuitem"]')].map((b) => b.textContent + (b.disabled || b.getAttribute('aria-disabled') ? '(disabled)' : '')));
  console.log('ctx items:', items);
  await page.getByText('Copy email').click();
  await sleep(300);
  console.log('clipboard after Copy email:', await page.evaluate(() => navigator.clipboard.readText()), 'expected', c.text);
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
