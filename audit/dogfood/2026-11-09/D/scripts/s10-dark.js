const { open, shot, sleep, waitRows, openFilter, cellBox, debug, firstKeys } = require('./lib');
(async () => {
  // 1) system dark, JS disabled-ish check: screenshot right at commit
  {
    const { browser, page, logs } = await open({ colorScheme: 'dark' });
    await page.goto('http://localhost:3401/users', { waitUntil: 'commit' });
    await page.waitForSelector('.ssg-root', { timeout: 60000 });
    console.log(await shot(page, '10-dark-early'));
    const early = await page.evaluate(() => ({ html: document.documentElement.className, bg: getComputedStyle(document.querySelector('.ssg-root')).backgroundColor, cellBg: getComputedStyle(document.querySelector('.ssg-root')).getPropertyValue('--ssg-cell-bg') }));
    console.log('early', early);
    await waitRows(page, 60000);
    await sleep(800);
    console.log(await shot(page, '10-dark-loaded'));
    const pop = await openFilter(page, 'plan');
    await sleep(400);
    console.log(await shot(page, '10-dark-popover'));
    await page.keyboard.press('Escape');
    // select editor + tooltip in dark
    const K = await firstKeys(page); const c = await cellBox(page, K[0], 'role');
    await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    await sleep(400);
    console.log(await shot(page, '10-dark-select'));
    await page.keyboard.press('Escape');
    // write fail in dark
    await debug(page, { failWriteRate: 1 });
    const n = await cellBox(page, K[1], 'name');
    await page.mouse.dblclick(n.x, n.y);
    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await sleep(1200);
    console.log(await shot(page, '10-dark-fail'));
    await debug(page, { failWriteRate: 0.1 });
    // toggle to light via app button
    await page.click('[data-testid="mode-toggle"]');
    await sleep(500);
    console.log(await shot(page, '10-toggled-light'));
    const after = await page.evaluate(() => ({ html: document.documentElement.className, cellBg: getComputedStyle(document.querySelector('.ssg-body-cell')).backgroundColor }));
    console.log('after toggle', after);
    console.log('LOGS\n' + logs.join('\n'));
    await browser.close();
  }
})();
