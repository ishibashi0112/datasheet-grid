const { open, shot, sleep, waitRows, openFilter, menuAction, cellBox, debug } = require('./lib');
const CJK = /[　-ヿ㐀-鿿＀-￯]/;
(async () => {
  const { browser, page, logs, reqs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  const found = new Map();
  const scan = async (label) => {
    const hits = await page.evaluate((src) => {
      const re = new RegExp(src);
      const out = [];
      const walk = (el) => {
        for (const a of ['aria-label', 'title', 'placeholder', 'data-ssg-tooltip', 'aria-roledescription', 'aria-description', 'alt', 'value']) {
          const v = el.getAttribute && el.getAttribute(a);
          if (v && re.test(v)) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} @${a}="${v}"`);
        }
        for (const n of el.childNodes) {
          if (n.nodeType === 3 && re.test(n.textContent)) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} text="${n.textContent.trim().slice(0, 80)}"`);
          else if (n.nodeType === 1) walk(n);
        }
      };
      walk(document.body);
      // live regions too
      return out;
    }, CJK.source);
    for (const h of hits) if (!found.has(h)) found.set(h, label);
    console.log(`[${label}] CJK hits: ${hits.length}`);
  };
  await scan('initial');
  // column menu + pin submenu
  const h = page.locator('[role="columnheader"][data-ssg-col-key="email"]');
  await h.hover();
  await h.locator('button[aria-label^="Column menu"]').click();
  await sleep(300);
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: 'Pin column' }).hover();
  await sleep(400);
  await scan('column menu + pin');
  console.log(await shot(page, '09-pin-submenu'));
  await page.keyboard.press('Escape');
  await sleep(200);
  // number filter applied, reopen to see "Current"
  let pop = await openFilter(page, 'seats');
  await pop.locator('select').selectOption('between');
  await sleep(200);
  const inputs = pop.locator('.ssg-filter-cond-values input');
  console.log('between inputs', await inputs.count());
  await inputs.nth(0).fill('10');
  if (await inputs.count() > 1) await inputs.nth(1).fill('20');
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(1000);
  pop = await openFilter(page, 'seats');
  await scan('seats filter reopened');
  console.log('seats popover text:', await pop.innerText());
  await page.keyboard.press('Escape');
  // header filter icon tooltip
  const fi = page.locator('[role="columnheader"][data-ssg-col-key="seats"] .ssg-header-status *').first();
  if (await fi.count()) { const bb = await fi.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(700); console.log(await shot(page, '09-seats-hdr-hover')); }
  await scan('seats header status hover');
  console.log('tooltip:', await page.evaluate(() => document.querySelector('.ssg-tooltip')?.textContent));
  // dateSet with preset
  pop = await openFilter(page, 'signedUpAt');
  await pop.locator('.ssg-filter-preset-chip', { hasText: 'This month' }).click();
  await sleep(300);
  await scan('dateSet preset');
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(800);
  // text filter on name
  pop = await openFilter(page, 'name');
  await pop.locator('input').fill('a');
  await pop.locator('.ssg-filter-btn-primary').click();
  await sleep(800);
  // top bar summary text
  console.log('top bar:', await page.evaluate(() => document.querySelector('.ssg-root').firstElementChild?.textContent));
  await scan('filters applied');
  // filter manager
  await menuAction(page, 'name', 'Manage filters…');
  await sleep(800);
  await scan('filter manager');
  console.log(await shot(page, '09-filter-manager'));
  console.log('filter manager text:', await page.evaluate(() => [...document.body.children].slice(-1)[0].innerText.slice(0, 1200)));
  await page.keyboard.press('Escape');
  await sleep(300);
  await menuAction(page, 'name', 'Manage sorting…');
  await sleep(800);
  await scan('sort manager');
  await page.keyboard.press('Escape');
  await sleep(300);
  await menuAction(page, 'name', 'Choose columns');
  await sleep(800);
  await scan('choose columns');
  console.log(await shot(page, '09-choose-columns'));
  await page.keyboard.press('Escape');
  await sleep(300);
  // context menu
  const c = await cellBox(page, (await page.evaluate(() => document.querySelector('[role="row"][data-row-key]').getAttribute('data-row-key'))), 'email');
  await page.mouse.click(c.x, c.y, { button: 'right' });
  await sleep(400);
  await scan('context menu');
  console.log(await shot(page, '09-context'));
  await page.keyboard.press('Escape');
  // Ctrl+F find
  await page.mouse.click(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+f');
  await sleep(400);
  await page.keyboard.type('gmail');
  await sleep(600);
  await scan('find bar');
  console.log(await shot(page, '09-find'));
  console.log('find bar:', await page.evaluate(() => document.querySelector('[class*="find"]')?.outerHTML.slice(0, 1200)));
  await page.keyboard.press('Escape');
  await sleep(200);
  // selection aggregates: select range seats..mrr over 5 rows
  const a = await page.evaluate(() => [...document.querySelectorAll('[role="row"][data-row-key]')].slice(0, 6).map((r) => r.getAttribute('data-row-key')));
  const c1 = await cellBox(page, a[0], 'seats');
  const c2 = await cellBox(page, a[4], 'mrr');
  await page.mouse.move(c1.x, c1.y);
  await page.mouse.down();
  await page.mouse.move(c2.x, c2.y, { steps: 5 });
  await page.mouse.up();
  await sleep(500);
  await scan('selection aggregates');
  console.log('bottom bar:', await page.evaluate(() => document.querySelector('.ssg-root').lastElementChild?.textContent));
  console.log(await shot(page, '09-aggregates'));
  // column resize handle tooltip, row checkbox aria
  console.log('\n=== CJK FOUND ===');
  for (const [k, v] of found) console.log(v, '=>', k);
  console.log('\nLOGS\n' + logs.join('\n'));
  await browser.close();
})();
