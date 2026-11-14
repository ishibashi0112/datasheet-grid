const { open, shot, wait, rowCount } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const { browser, page, logs } = await open(url)
  await wait(1000)
  const input = page.locator('.ssg-bar--top input')
  const sample = async (label, ms) => {
    const out = []
    const t = Date.now()
    while (Date.now() - t < ms) {
      const bar = await page.locator('.ssg-bar--bottom').innerText()
      const m = bar.match(/行\s*(\d+)/)
      const firstMsg = await page.locator('[data-pane="center"].ssg-body-row').first().locator('[role=gridcell]').nth(2).innerText().catch(() => '')
      const ov = await page.evaluate(() => [...document.querySelectorAll('.ssg-root *')].some((e) => /絞り込み中|フィルター中|適用中/.test(e.textContent ?? '') && e.children.length === 0))
      out.push(`${Date.now() - t}ms:${m?.[1]}${ov ? '(busy)' : ''}:${firstMsg.slice(0, 18)}`)
      await wait(100)
    }
    console.log(label, out.join(' | '))
  }
  await input.fill('u-31337')
  await sample('u-31337', 5000)
  await input.fill('')
  await sample('clear', 1500)
  await input.fill('Unhandled exception')
  await sample('Unhandled', 6000)
  await shot(page, 'globalseq')
  await browser.close()
})()
