const { open, shot, barText } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: process.env.BTZ })
  const url = process.env.URL ?? 'http://localhost:3508/?date=thisMonth'
  await page.goto(url)
  await page.waitForTimeout(2000)
  console.log('bar:', await barText(page))
  const info = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[role="row"]')]
    return {
      rowCount: rows.length,
      ariaRowCount: document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'),
      sample: rows.slice(0, 6).map((r) => r.getAttribute('data-pane') + ':' + r.textContent.slice(0, 80)),
    }
  })
  console.log(JSON.stringify(info, null, 1))
  await shot(page, process.env.SHOT ?? 'smoke')
  console.log(logs.join('\n'))
  await browser.close()
})()
