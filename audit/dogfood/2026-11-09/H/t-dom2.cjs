const { open } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open();
  const r = await page.evaluate(() => {
    const g = document.querySelector('[aria-label="タスク一覧"]');
    const root = g.closest('.ssg-root');
    const walk = (el, d) => d > 3 ? '' : [...el.children].map(c => '  '.repeat(d) + c.tagName + '.' + [...c.classList].join('.') + (c.getAttribute('role') ? `[role=${c.getAttribute('role')}]` : '') + '\n' + walk(c, d + 1)).join('');
    return { gTag: g.className, root: walk(root, 0).slice(0, 4000), total: root.querySelector('.ssg-total-row')?.outerHTML.slice(0, 2000) };
  });
  console.log(r.gTag); console.log(r.root); console.log(r.total);
  await browser.close();
})();
