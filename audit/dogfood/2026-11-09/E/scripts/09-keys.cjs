const { open, shot, sleep, cellBox, reveal } = require('./lib.cjs');
(async () => {
  const { browser, page, logs } = await open(process.argv[2]);
  await page.waitForSelector('.ssg-root');
  await sleep(800);
  const st = () => page.evaluate(() => {
    const a = document.querySelector('[id$="-active-cell"]');
    const row = a?.closest('[role="row"]');
    const sc = document.querySelector('.ssg-scroll-container');
    const sticky = [...document.querySelectorAll('.ssg-label-row')].map(e => ({ t: e.textContent, y: Math.round(e.getBoundingClientRect().y) }));
    const ab = a?.getBoundingClientRect();
    return { aria: row?.getAttribute('aria-rowindex') + ':' + a?.getAttribute('aria-colindex'), text: a?.textContent, y: ab ? Math.round(ab.y) : null, scrollTop: Math.round(sc.scrollTop), bar: document.querySelector('[class*="bottom-bar"]')?.textContent?.match(/セル [A-Z]+\d+/)?.[0] };
  });
  const c = await cellBox(page, 3, 5);
  await page.mouse.click(c.x, c.y);
  const log = [];
  const press = async (k, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await sleep(60); } await sleep(150); log.push([k + (n > 1 ? ' x' + n : ''), await st()]); };
  await press('ArrowUp'); // ラベル行には止まらない
  await press('Control+ArrowDown');
  await press('Control+ArrowUp');
  await press('PageDown', 12);
  await press('End');
  await press('Home');
  await press('ArrowLeft');
  await press('ArrowLeft');
  await press('ArrowLeft');
  await press('Control+End');
  await press('Control+Home');
  // C01 の最後の行から ↓ でラベルを飛ばす
  await reveal(page, 418, 5);
  const d = await cellBox(page, 418, 5);
  await page.mouse.click(d.x, d.y);
  await sleep(200);
  log.push(['click 418', await st()]);
  await press('ArrowDown');
  await press('ArrowUp');
  await press('ArrowUp', 3);
  await shot(page, '09-sticky-up');
  // Shift+↓ で範囲がラベルをまたぐ
  await press('Shift+ArrowDown', 3);
  log.push(['range', await page.evaluate(() => document.querySelector('[class*="bottom-bar"]')?.textContent)]);
  for (const [k, s] of log) console.log(k.padEnd(18), JSON.stringify(s));
  console.log('LOGS:\n' + logs.filter(l => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
