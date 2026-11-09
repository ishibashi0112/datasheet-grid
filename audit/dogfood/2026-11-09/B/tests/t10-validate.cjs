const { open, shot, center, cellHandle, scanJapanese } = require('./lib.cjs');
const base = process.argv[2] ?? 'http://127.0.0.1:5402/';
(async () => {
  const { browser, page, logs } = await open(`${base}?run=0`);
  const sel = async (vr, key) => {
    await page.evaluate(([vr, key]) => { const g = window.__app.grid(); g.selectCell(vr, g.getColIndex(key), { scrollIntoView: true }); g.focus(); }, [vr, key]);
    await page.waitForTimeout(250);
  };
  const hoverTip = async (vr, key, name) => {
    const p = await center(page, await cellHandle(page, vr + 2, key));
    await page.mouse.move(p.x - 30, p.y + 40);
    await page.waitForTimeout(200);
    await page.mouse.move(p.x, p.y, { steps: 3 });
    await page.waitForTimeout(1200);
    const tip = await page.evaluate(() => [...document.querySelectorAll('.ssg-tooltip')].map((t) => `${t.innerText} (visible=${getComputedStyle(t).visibility}/${getComputedStyle(t).opacity})`));
    await shot(page, name);
    return tip;
  };
  // built-in min
  await sel(0, 'target');
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('target row0 =', await page.evaluate(() => window.__app.getRows()[0].target));
  console.log('min tooltip:', await hoverTip(0, 'target', '10-min'));
  // validate custom (3x)
  await sel(1, 'target');
  await page.keyboard.type('99999');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('3x tooltip:', await hoverTip(1, 'target', '10-3x'));
  // non numeric text in number column
  await sel(2, 'target');
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('row2 target =', JSON.stringify(await page.evaluate(() => window.__app.getRows()[2].target)));
  console.log('nonnum tooltip:', await hoverTip(2, 'target', '10-nonnum'));
  // full-width digits
  await sel(3, 'target');
  await page.keyboard.type('１，２３４．５');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('row3 target =', JSON.stringify(await page.evaluate(() => window.__app.getRows()[3].target)));
  // memo reject
  await sel(4, 'memo');
  await page.keyboard.press('Enter');
  await page.keyboard.type('y'.repeat(70));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const ed = await page.evaluate(() => ({ editorOpen: !!document.querySelector('.ssg-cell-editor'), memo: window.__app.getRows()[4].memo, tips: [...document.querySelectorAll('.ssg-tooltip, [role="alert"], [class*="invalid"], [class*="reject"]')].map((e) => `${e.className}: ${e.textContent}`) }));
  console.log('reject:', JSON.stringify(ed));
  await shot(page, '10-reject');
  console.log((await scanJapanese(page, 'validate')).join('\n'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  console.log('after esc memo=', JSON.stringify(await page.evaluate(() => window.__app.getRows()[4].memo)));
  // integer etc
  console.log('invalid cells:', JSON.stringify(await page.evaluate(() => window.__app.grid().getInvalidCells())));
  console.log('LOGS', logs);
  await browser.close();
})();
