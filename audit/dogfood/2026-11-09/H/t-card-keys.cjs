const { open, G, cell, bars } = require('./lib.cjs');
const log = (...a) => console.log(...a);
(async () => {
  const { browser, page, logs } = await open();
  await page.locator(`${G} [data-row-key="T-00001"] button.ssg-detail-toggle`).first().click();
  await page.waitForTimeout(500);
  const tc = await cell(page, 'T-00118', 'title');
  await tc.click();
  // focus card button via Tab path: click the button with mouse (it triggers add); instead focus it
  await page.locator(`${G} .ssg-detail-card`).first().getByRole('button', { name: '閉じる' }).focus();
  for (const k of ['Delete', 'Control+a', 'ArrowDown', 'Control+c', 'F2', 'x']) {
    await page.keyboard.press(k); await page.waitForTimeout(150);
  }
  log('outer T-00118 title', await tc.innerText(), 'bars', JSON.stringify((await bars(page))[1]), 'editor', await page.locator('.ssg-cell-editor').count());
  log('focus', await page.evaluate(() => document.activeElement?.textContent));
  log(logs.filter(l => !l.includes('DevTools')).join('\n'));
  await browser.close();
})();
