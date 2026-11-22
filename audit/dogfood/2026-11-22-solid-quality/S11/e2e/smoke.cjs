const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5511/' + (process.env.Q ?? ''))
  await page.waitForTimeout(2000)
  await shot(page, process.env.SHOT ?? 'smoke')
  const info = await page.evaluate(() => {
    const host = document.querySelector('stock-widget')
    const sr = host.shadowRoot
    const root = sr.querySelector('.ssg-root')
    const cell = sr.querySelector('.ssg-body-cell')
    return { rows: sr.querySelectorAll('[role=row]').length, rootH: root?.getBoundingClientRect().height, cellFont: cell && getComputedStyle(cell).fontSize, cellBox: cell && getComputedStyle(cell).boxSizing, cellLH: cell && getComputedStyle(cell).lineHeight, cellFamily: cell && getComputedStyle(cell).fontFamily }
  })
  console.log(JSON.stringify(info))
  console.log(logs.join('\n'))
  await browser.close()
})()
