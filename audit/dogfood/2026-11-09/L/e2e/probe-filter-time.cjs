const { launch, iphone, cdpTap, BASE } = require('./lib.cjs')
;(async () => {
  for (const rate of [1, 1, 4]) {
    const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.goto(BASE); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1500)
    await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
    const b = await page.evaluate(() => { const e = [...document.querySelectorAll('button')].find((x) => x.textContent === '不良のみ'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
    await page.evaluate(() => { window.__t = null; const top = document.querySelector('.ssg-bar--top'); new MutationObserver(() => { if (window.__t == null && !/行 640 \/ 640/.test(top.textContent)) window.__t = performance.now() }).observe(top, { subtree: true, childList: true, characterData: true }); document.addEventListener('click', () => { window.__c = performance.now() }, true) })
    await cdpTap(page, cdp, b.x, b.y)
    await page.waitForTimeout(1500)
    const r = await page.evaluate(() => ({ clickToDom: Math.round(window.__t - window.__c), lt: window.__lt }))
    console.log('rate', rate, 'click→上部バー更新', r.clickToDom, 'ms', '長いタスク', JSON.stringify(r.lt))
    await browser.close()
  }
})()
