const { open, shot } = require('./lib.cjs')
const info = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid=dialog] .ssg-root')
  const sc = root.querySelector('.ssg-scroll-container')
  const memo = [...root.querySelectorAll('[role=columnheader]')].find((h) => h.textContent.includes('メモ'))
  const wrap = document.querySelector('[data-testid=dialog-grid-wrap]')
  return { wrapW: wrap.offsetWidth, rootW: root.offsetWidth, scCW: sc.clientWidth, scW: sc.scrollWidth, memoW: memo.offsetWidth, rows: root.querySelectorAll('[role=row][aria-rowindex]').length, scH: sc.clientHeight }
})
;(async () => {
  const { browser, page, logs } = await open()
  await page.click('[data-testid=dialog-open]')
  await page.waitForTimeout(30)
  console.log('30ms', JSON.stringify(await info(page)))
  await page.waitForTimeout(500)
  console.log('530ms', JSON.stringify(await info(page)))
  await shot(page, 'anim-dialog')
  console.log(logs.filter((x) => !x.includes('DevTools')).join('\n'))
  await browser.close()
})()
