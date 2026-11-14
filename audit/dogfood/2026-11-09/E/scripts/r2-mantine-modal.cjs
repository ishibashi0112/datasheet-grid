const { open, sleep, cellBox } = require('./lib.cjs');
(async () => {
  for (const q of ['', '?closeOnEscape=false']) {
    const { browser, page, logs } = await open((process.argv[2] || 'http://127.0.0.1:5405') + '/repro/mantine-modal.html' + q);
    await page.evaluate(() => window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__esc = { prevented: e.defaultPrevented, target: e.target.className }; }));
    await page.click('#open');
    await page.waitForSelector('.ssg-root'); await sleep(600);
    const c = await cellBox(page, 3, 2);
    await page.mouse.click(c.x, c.y); await page.keyboard.type('abc'); await sleep(200);
    const editing = await page.evaluate(() => !!document.querySelector('.ssg-cell-editor'));
    await page.keyboard.press('Escape'); await sleep(800);
    console.log(q || '(default)', { editing, modalAfterEsc: await page.evaluate(() => !!document.querySelector('.mantine-Modal-content')), cell: (await cellBox(page, 3, 2))?.text, bubbleEsc: await page.evaluate(() => window.__esc) });
    console.log(logs.filter(l => !l.includes('vite') && !l.includes('DevTools')).join('\n'));
    await browser.close();
  }
})();
