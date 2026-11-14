const { launch, shot, BASE } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await launch({ viewport: { width: 1100, height: 700 }, locale: 'ja-JP' })
  await page.goto(BASE + '#daily'); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1000)
  await page.evaluate(() => { const sc = document.querySelector('.ssg-scroll-container'); sc.scrollTop = 600 }); await page.waitForTimeout(600)
  const r = await page.evaluate(() => [...document.querySelectorAll('.ssg-label-row')].filter((e) => !e.getAttribute('aria-rowindex')).map((e) => {
    const chain = []; let p = e; while (p && p !== document.body) { if (p.getAttribute('aria-hidden') || p.getAttribute('role')) chain.push(`${p.tagName}.${p.className.toString().slice(0, 30)} role=${p.getAttribute('role')} hidden=${p.getAttribute('aria-hidden')}`); p = p.parentElement }
    return { html: e.outerHTML.slice(0, 300), chain }
  }))
  console.log(JSON.stringify(r, null, 1))
  await browser.close()
})()
