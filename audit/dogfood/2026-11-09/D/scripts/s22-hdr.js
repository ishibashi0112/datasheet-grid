const { open, sleep, waitRows } = require('./lib');
(async () => {
  const { browser, page } = await open();
  const f = encodeURIComponent(JSON.stringify({ plan: { kind: 'set', mode: 'include', values: ['pro'] }, seats: { kind: 'number', raw: '>=10', parsed: { mode: 'comparison', operator: '>=', value: 10 } } }));
  await page.goto(`http://localhost:3401/users?filters=${f}`);
  await waitRows(page, 60000);
  await sleep(500);
  const info = async (key) => page.evaluate((key) => {
    const h = document.querySelector(`[role="columnheader"][data-ssg-col-key="${key}"]`);
    return [...h.querySelectorAll('button, [class*="filter"], [class*="indicator"], [class*="icon"]')].map((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${e.tagName}.${(e.className.baseVal ?? e.className)} aria=${e.getAttribute('aria-label')} x=${b.x.toFixed(0)} w=${b.width.toFixed(0)} vis=${cs.visibility} op=${cs.opacity} disp=${cs.display}`; });
  }, key);
  for (const key of ['plan', 'seats']) {
    console.log(key, 'idle:', await info(key));
    const h = page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`);
    const b = await h.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await sleep(400);
    console.log(key, 'hover:', await info(key));
    await page.screenshot({ path: `../shots/22-hdr-${key}.png`, clip: { x: b.x - 20, y: b.y - 5, width: b.width + 40, height: b.height + 10 } });
    await page.mouse.move(5, 5);
    await sleep(300);
  }
  await browser.close();
})();
