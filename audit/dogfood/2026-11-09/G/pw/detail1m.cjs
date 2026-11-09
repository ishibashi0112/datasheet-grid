const { open, shot, wait } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const { browser, page, logs } = await open(url)
  await wait(800)
  // 3 行目のトグルを押す
  const toggle = page.locator('[data-pane="left"].ssg-body-row').nth(2).locator('[aria-expanded]')
  console.log('toggle count', await toggle.count(), await toggle.first().getAttribute('aria-label'))
  const box = await toggle.first().boundingBox()
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await wait(800)
  const st = await page.evaluate(() => ({
    expanded: document.querySelector('[data-testid=expanded]')?.textContent,
    cards: document.querySelectorAll('.ssg-detail-card').length,
    ariaExpanded: [...document.querySelectorAll('[data-pane="left"].ssg-body-row [aria-expanded]')].slice(0, 4).map((e) => e.getAttribute('aria-expanded')),
  }))
  console.log(st)
  await shot(page, 'detail-1m')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools')).join('\n'))
  await browser.close()
})()
