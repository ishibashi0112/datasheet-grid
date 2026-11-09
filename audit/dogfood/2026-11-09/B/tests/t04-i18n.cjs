const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?run=0`);
  const all = [];
  const scan = async (label) => { const r = await scanJapanese(page, label); all.push(...r); return r; };
  const clickText = async (sel, text) => {
    const el = page.locator(sel, { hasText: text }).first();
    const b = await el.boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  };
  const openMenu = async (row, key) => {
    const c = await cellHandle(page, row, key);
    const p = await center(page, c);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Alt+ArrowDown');
    await page.waitForSelector('.ssg-menu-panel');
    await page.waitForTimeout(200);
  };
  await scan('initial');
  // selection aggregates
  {
    const a = await center(page, await cellHandle(page, 2, 'last'));
    const b = await center(page, await cellHandle(page, 6, 'volume'));
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    console.log('bottom bar:', await page.locator('.ssg-bar--bottom').innerText());
    await scan('aggregates');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await scan('copy');
    await page.keyboard.press('Escape');
  }
  // filters
  for (const key of ['symbol', 'name', 'sector', 'exchange', 'last', 'changePct']) {
    await openMenu(2, key);
    await scan(`menu-${key}`);
    await clickText('.ssg-menu-item', 'Filter');
    await page.waitForTimeout(500);
    await shot(page, `04-filter-${key}`);
    const txt = await page.evaluate(() => [...document.querySelectorAll('[class*="filter-popover"], [class*="popover"]')].map((e) => e.innerText).join('\n---\n').slice(0, 800));
    console.log(`=== filter ${key}\n${txt}`);
    await scan(`filter-${key}`);
    // open the operator select if any
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // pin submenu
  await openMenu(2, 'name');
  await clickText('.ssg-menu-item', 'Pin column');
  await page.waitForTimeout(300);
  await shot(page, '04-pin-submenu');
  await scan('pin-submenu');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // manage sorting
  await openMenu(2, 'name');
  await clickText('.ssg-menu-item', 'Manage sorting');
  await page.waitForTimeout(500);
  await shot(page, '04-sort-manager');
  await scan('sort-manager');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // manage filters
  await openMenu(2, 'name');
  await clickText('.ssg-menu-item', 'Manage filters');
  await page.waitForTimeout(500);
  await shot(page, '04-filter-manager');
  await scan('filter-manager');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // choose columns (tool panel)
  await openMenu(2, 'name');
  await clickText('.ssg-menu-item', 'Choose columns');
  await page.waitForTimeout(800);
  await shot(page, '04-toolpanel');
  await scan('toolpanel');
  // click each tab in the tool panel
  const tabs = await page.locator('[role="tab"]').all();
  for (let i = 0; i < tabs.length; i++) {
    const b = await tabs[i].boundingBox();
    if (!b) continue;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(400);
    await shot(page, `04-toolpanel-tab${i}`);
    await scan(`toolpanel-tab${i}`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // find bar
  {
    const p = await center(page, await cellHandle(page, 3, 'name'));
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Control+f');
    await page.waitForTimeout(300);
    await page.keyboard.type('Iron');
    await page.waitForTimeout(600);
    await shot(page, '04-find');
    await scan('find');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('zzzz');
    await page.waitForTimeout(500);
    await scan('find-nohit');
    await shot(page, '04-find-nohit');
    await page.keyboard.press('Escape');
  }
  // context menu
  {
    const p = await center(page, await cellHandle(page, 4, 'symbol'));
    await page.mouse.click(p.x, p.y, { button: 'right' });
    await page.waitForTimeout(300);
    await shot(page, '04-context');
    await scan('context');
    await page.keyboard.press('Escape');
  }
  // global filter no match + chip bar
  {
    const input = page.locator('.ssg-bar--top input').first();
    const b = await input.boundingBox();
    await page.mouse.click(b.x + 20, b.y + b.height / 2);
    await page.keyboard.type('qqqqqq');
    await page.waitForTimeout(800);
    await shot(page, '04-nomatch');
    await scan('nomatch');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(500);
  }
  // validation: target negative (built-in min), and > 3x
  {
    const p = await center(page, await cellHandle(page, 2, 'target'));
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('-5');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const c = await cellHandle(page, 2, 'target');
    const q = await center(page, c);
    await page.mouse.move(q.x, q.y);
    await page.waitForTimeout(1200);
    await shot(page, '04-invalid-min');
    console.log('invalid tooltip:', await page.evaluate(() => document.querySelector('.ssg-tooltip')?.innerText));
    await scan('invalid-min');
    // integer? set 1.234 -> fine. memo reject
    const m = await center(page, await cellHandle(page, 3, 'memo'));
    await page.mouse.click(m.x, m.y);
    await page.keyboard.press('Enter');
    await page.keyboard.type('x'.repeat(70));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    await shot(page, '04-reject');
    console.log('after reject: memo row3 =', JSON.stringify(await page.evaluate(() => window.__app.getRows()[1].memo)));
    await scan('reject');
    const mm = await center(page, await cellHandle(page, 3, 'memo'));
    await page.mouse.move(mm.x, mm.y);
    await page.waitForTimeout(1200);
    console.log('reject tooltip:', await page.evaluate(() => document.querySelector('.ssg-tooltip')?.innerText));
    await shot(page, '04-reject-hover');
    await page.keyboard.press('Escape');
  }
  // header tooltips: hover over header cells
  {
    const h = page.locator('[role="columnheader"]', { hasText: 'Volume' }).first();
    const b = await h.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(800);
    await shot(page, '04-header-hover');
    await scan('header-hover');
  }
  console.log('\n=== JAPANESE FOUND ===\n' + [...new Set(all)].join('\n'));
  console.log('LOGS', logs);
  await browser.close();
})();
