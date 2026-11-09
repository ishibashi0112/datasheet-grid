const { open, shot } = require('./lib.cjs');
(async () => {
  const { browser, page } = await open();
  await page.screenshot({ path: require('path').join(require('./lib.cjs').SHOTS, '02-zoom-chips.png'), clip: { x: 280, y: 215, width: 300, height: 120 } });
  const chip = await page.evaluate(() => {
    const c = document.querySelector('.ssg-chip');
    const cs = getComputedStyle(c);
    const cell = c.closest('.ssg-body-cell');
    return { html: cell.innerHTML, w: c.getBoundingClientRect().width, cellW: cell.getBoundingClientRect().width, padding: getComputedStyle(cell).padding, font: cs.font, overflow: cs.overflow, textOverflow: cs.textOverflow, sw: c.scrollWidth, cw: c.clientWidth };
  });
  console.log(chip);
  await browser.close();
})();
