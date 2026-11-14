const { open, sleep, waitRows, cellBox, visibleKeys, debug } = require('./lib');
(async () => {
  const { browser, page } = await open();
  await page.goto('http://localhost:3401/users');
  await waitRows(page, 60000);
  await debug(page, { failWriteRate: 0 });
  const keys = await visibleKeys(page, 5);
  const id = Number(keys[2]);
  const c = await cellBox(page, id, 'name');
  await page.mouse.dblclick(c.x, c.y);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('X #fail');
  await page.keyboard.press('Enter');
  await sleep(1500);
  const info = await page.evaluate((id) => {
    const bars = [...document.querySelectorAll('[class*="error-bar"], [class*="save-failed"]')].map((e) => `${e.className} role=${e.getAttribute('role')} aria-live=${e.getAttribute('aria-live')} : ${e.textContent.slice(0, 80)}`);
    const live = [...document.querySelectorAll('[aria-live],[role="alert"],[role="status"]')].map((e) => `${e.tagName}.${e.className} role=${e.getAttribute('role')} live=${e.getAttribute('aria-live')} : ${e.textContent.slice(0, 80)}`);
    const cell = document.querySelector(`[role="row"][data-row-key="${id}"] [role="gridcell"][data-ssg-col-key="name"]`);
    return { bars, live, cellAttrs: [...cell.attributes].map((x) => `${x.name}=${x.value}`).join(' '), cellHtml: cell.innerHTML.slice(0, 200) };
  }, id);
  console.log(JSON.stringify(info, null, 1));
  await debug(page, { failWriteRate: 0.1 });
  await browser.close();
})();
