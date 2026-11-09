const { launch, iphone, BASE } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await launch({ ...iphone(), locale: 'ja-JP' })
  await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
  const snap = () => page.evaluate(() => {
    const hdr = [...document.querySelectorAll('[role=columnheader]')].map((h) => `${h.getAttribute('aria-colindex')}:${h.textContent.replace('⋮', '').trim().slice(0, 4)}`).join(' ')
    const row = [...document.querySelectorAll('.ssg-body-row[aria-rowindex="5"] [role=gridcell]')].map((c) => `${c.getAttribute('aria-colindex')}:${c.getAttribute('data-ssg-col-key')}`).join(' ')
    return { hdr, row }
  })
  console.log('left', await snap())
  await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollLeft = 600 }); await page.waitForTimeout(500)
  console.log('right', await snap())
  await browser.close()
})()
