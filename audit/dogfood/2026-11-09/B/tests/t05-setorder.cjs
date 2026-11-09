const { open, shot, center, cellHandle } = require('./lib.cjs');
const col = process.argv[2] ?? 'changePct';
(async () => {
  const { browser, page, logs } = await open('http://127.0.0.1:5402/?run=0');
  const c = await cellHandle(page, 2, col);
  const p = await center(page, c);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForSelector('.ssg-menu-panel');
  const el = page.locator('.ssg-menu-item', { hasText: 'Filter' }).first();
  const b = await el.boundingBox();
  await page.mouse.click(b.x + 10, b.y + b.height / 2);
  await page.waitForTimeout(600);
  const order = await page.evaluate(async () => {
    const cb = document.querySelectorAll('input[type=checkbox]')[2];
    let sc = cb.parentElement;
    while (sc && !(sc.scrollHeight > sc.clientHeight + 5 && getComputedStyle(sc).overflowY !== 'visible')) sc = sc.parentElement;
    const seen = [];
    const set = new Set();
    for (let top = 0; top <= sc.scrollHeight; top += 100) {
      sc.scrollTop = top;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (const l of sc.querySelectorAll('label')) {
        const t = l.innerText.trim();
        if (!set.has(t)) { set.add(t); seen.push(t); }
      }
    }
    return { cls: sc.className, seen };
  });
  console.log(order.cls, order.seen.length);
  console.log(order.seen.join(' '));
  await browser.close();
})();
