// スワイプのスクロール量のばらつき(React 本番 / Solid 本番を交互に 4 回ずつ)
const { launch, devices } = require('./lib.cjs')
;(async () => {
  const d = { ...devices[process.env.DEV ?? 'iPad Mini'] }; delete d.defaultBrowserType
  const { browser, ctx } = await launch({ ...d, deviceScaleFactor: 1 })
  const res = { react: [], solid: [] }
  for (let k = 0; k < 4; k++) for (const n of ['react', 'solid']) {
    const page = await ctx.newPage(); await page.goto(`http://localhost:5506/${n}/`); await page.waitForTimeout(1000)
    const cdp = await page.context().newCDPSession(page)
    const vp = page.viewportSize(); const x = vp.width / 2, y = vp.height * 0.7
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - (250 * i) / 8 }] }); await page.waitForTimeout(16) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(1500)
    res[n].push(await page.evaluate(() => Math.round(document.querySelector('.ssg-scroll-container').scrollTop)))
    await page.close()
  }
  console.log(JSON.stringify(res))
  await browser.close()
})()
