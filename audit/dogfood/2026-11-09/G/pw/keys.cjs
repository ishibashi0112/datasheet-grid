const { open, shot, wait, clickVisible } = require('./lib.cjs')
async function state(page) {
  return page.evaluate(() => {
    const ac = window.__grid.getActiveCell()
    const sc = document.querySelector('.ssg-scroll-container')
    const id = document.querySelector('.ssg-shell')?.getAttribute('aria-activedescendant')
    const el = id ? document.getElementById(id) : null
    const r = el?.getBoundingClientRect(); const sr = sc.getBoundingClientRect()
    return { ac, activeVisible: !!r && r.top >= sr.top && r.bottom <= sr.bottom + 1, bar: document.querySelector('.ssg-bar--bottom').innerText.replace(/\s+/g, ' ').replace(/^.*?セル/, 'セル') }
  })
}
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const tag = process.argv[3] ?? 'prod'
  const { browser, page, logs } = await open(url)
  await wait(800)
  await clickVisible(page, 2, 'center', 1)
  for (const k of ['Control+End', 'Control+Home', 'PageDown', 'PageDown', 'PageUp', 'End', 'Home', 'Control+ArrowDown', 'ArrowUp', 'Control+ArrowUp', 'Shift+PageDown', 'Escape']) {
    const t = Date.now()
    await page.keyboard.press(k)
    await wait(250)
    console.log(k.padEnd(18), Date.now() - t, 'ms', JSON.stringify(await state(page)))
  }
  await shot(page, `keys-${tag}`)
  // Tab でグリッドから出る
  await clickVisible(page, 2, 'center', 3)
  await page.keyboard.press('Tab')
  await wait(100)
  console.log('Tab from last col →', await page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className}`), JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
