const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  for (const r of [9, 10]) {
    await reveal(page, r, 8);
    const b = await cellBox(page, r, 8);
    await page.mouse.click(b.x, b.y);
    await page.keyboard.press('t');
    await sleep(400);
    console.log(r, b.text, await page.evaluate(() => ({ attr: document.querySelector('[data-initial-text]')?.getAttribute('data-initial-text'), value: document.activeElement?.value })));
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await browser.close();
})();
