const { open, shot, wait, waitCountChange } = require('./lib.cjs')
async function check(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ssg-scroll-container')
    const cards = [...document.querySelectorAll('.ssg-detail-card')].map((c) => {
      const id = c.querySelector('.detail-head strong')?.textContent
      const cb = c.getBoundingClientRect()
      // カードの直前の行(left ペイン)の下端
      const rows = [...document.querySelectorAll('[data-pane="left"].ssg-body-row')].map((r) => r.getBoundingClientRect()).filter((b) => b.bottom <= cb.top + 2).sort((a, b) => b.bottom - a.bottom)
      return { id, top: Math.round(cb.top), gapToRowAbove: rows[0] ? Math.round(cb.top - rows[0].bottom) : null }
    })
    return { gap: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop), cards, follow: document.querySelectorAll('.toolbar input[type=checkbox]')[1].checked }
  })
}
;(async () => {
  const { browser, page, logs } = await open('http://localhost:5407/')
  await wait(800)
  await page.locator('.toolbar button', { hasText: 'ERROR 以上' }).click()
  await waitCountChange(page, 1000000)
  await page.evaluate(() => window.__grid.scrollToBottom())
  await wait(800)
  // 下から 3 行目のトグル
  const t = await page.evaluate(() => {
    const el = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    const ts = [...document.querySelectorAll('[data-pane="left"].ssg-body-row [aria-expanded]')].map((x) => ({ b: x.getBoundingClientRect() })).filter(({ b }) => b.bottom < el.bottom).sort((a, b) => b.b.top - a.b.top)
    const b = ts[2].b
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
  })
  await page.mouse.click(t.x, t.y)
  await wait(500)
  console.log('expanded', await page.evaluate(() => window.__grid.getExpandedDetailRowKeys()), JSON.stringify(await check(page)))
  await page.locator('.toolbar input[type=checkbox]').nth(1).check()
  await page.locator('.toolbar input[type=checkbox]').nth(0).check()
  for (let i = 0; i < 6; i++) { await wait(1000); console.log('t+' + (i + 1) + 's', JSON.stringify(await check(page))) }
  await shot(page, 'detaillive')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
