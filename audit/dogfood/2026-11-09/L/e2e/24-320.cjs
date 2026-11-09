const { launch, shot, iphone, cdpTap, BASE } = require('./lib.cjs')
;(async () => {
  for (const hash of ['#list', '#daily']) {
    const { browser, context, page, logs } = await launch({ ...iphone(), viewport: { width: 320, height: 568 }, locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await page.goto(BASE + hash); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(800)
    const m = await page.evaluate(() => ({ docW: document.scrollingElement.scrollWidth, vw: innerWidth, grid: (() => { const r = document.querySelector('.ssg-root').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)] })(), center: (() => { const c = document.querySelector('.ssg-body-row[data-pane=center]'); return c ? Math.round(c.getBoundingClientRect().width) : null })(), bottomBar: (() => { const b = document.querySelector('.ssg-bar--bottom'); if (!b) return null; const r = b.getBoundingClientRect(); return [Math.round(r.height), b.scrollWidth, b.clientWidth] })() }))
    console.log(hash, JSON.stringify(m))
    // 中央ペインの見える幅(左固定 + 右固定 を引いた残り)
    console.log('panes', await page.evaluate(() => [...document.querySelectorAll('.ssg-body-row[aria-rowindex="2"]')].map((r) => r.dataset.pane + ':' + Math.round(r.getBoundingClientRect().left) + '-' + Math.round(r.getBoundingClientRect().right)).join(' ')))
    console.log(await shot(page, '24-320' + hash.slice(1)))
    console.log(logs.filter((l) => !l.includes('vite')).join('\n'))
    await browser.close()
  }
})()
