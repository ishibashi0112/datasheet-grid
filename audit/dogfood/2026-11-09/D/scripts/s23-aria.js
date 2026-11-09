const { open, sleep, waitRows, cellBox, visibleKeys, debug } = require('./lib');
(async () => {
  const { browser, page } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const keys = await visibleKeys(page, 5);
  const id = Number(keys[3]);
  const c = await cellBox(page, id, 'seats');
  await page.mouse.click(c.x, c.y);
  await page.keyboard.type('0');
  await page.keyboard.press('Enter');
  await sleep(1500);
  const a = await page.evaluate((id) => {
    const el = document.querySelector(`[role="row"][data-row-key="${id}"] [role="gridcell"][data-ssg-col-key="seats"]`);
    return { cls: el.className, attrs: [...el.attributes].map((x) => `${x.name}=${x.value}`), title: el.title, inner: el.innerHTML.slice(0, 300) };
  }, id);
  console.log(JSON.stringify(a, null, 1));
  // keyboard focus on invalid cell -> any live region text?
  const live = await page.evaluate(() => [...document.querySelectorAll('[aria-live]')].map((e) => `${e.className}: ${e.textContent.slice(0, 120)}`));
  console.log('live regions:', live);
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
