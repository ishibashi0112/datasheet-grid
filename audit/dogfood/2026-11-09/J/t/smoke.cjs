const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  await shot(page, 'smoke-top')
  await shot(page, 'smoke-full', { fullPage: true })
  const info = await page.evaluate(() => [...document.querySelectorAll('.ssg-root')].map((r) => {
    const b = r.getBoundingClientRect()
    const sc = r.querySelector('.ssg-scroll-container')
    return { label: sc?.getAttribute('aria-label'), w: Math.round(b.width), h: Math.round(b.height), rows: r.querySelectorAll('.ssg-body-row').length, cls: r.className, scH: sc?.scrollHeight, scC: sc?.clientHeight, visible: r.offsetParent !== null }
  }))
  console.log(JSON.stringify(info, null, 1))
  console.log(logs.join('\n'))
  await browser.close()
})()
