const { open, shot, sleep, waitRows, openFilter } = require('./lib');
(async () => {
  const { browser, page, logs } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  for (const key of ['plan', 'seats', 'signedUpAt', 'country', 'lastActiveAt']) {
    const pop = await openFilter(page, key);
    await sleep(700);
    console.log(await shot(page, 'x-pop-' + key));
    console.log(key, (await pop.evaluate((e) => e.outerHTML)).slice(0, 2500));
    await page.keyboard.press('Escape');
    await sleep(300);
  }
  console.log(logs.join('\n'));
  await browser.close();
})();
