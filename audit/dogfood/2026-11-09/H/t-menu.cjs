const { open } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const hdr = page.locator('[aria-label="タスク一覧"] [role="columnheader"][data-ssg-col-key="priority"]');
  await hdr.hover();
  await page.waitForTimeout(200);
  const btns = await hdr.locator('button, [role="button"]').evaluateAll(els => els.map(e => e.outerHTML.slice(0, 300)));
  console.log(btns.join('\n'));
  await hdr.click({ button: 'right' });
  await page.waitForTimeout(400);
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] [role^="menuitem"]')].map(e => e.textContent.trim() + ' | ' + e.getAttribute('aria-disabled')));
  console.log(items.join('\n'));
  await page.screenshot({ path: 'shots/menu-priority.png' });
  console.log(logs.join('\n'));
  await browser.close();
})();
