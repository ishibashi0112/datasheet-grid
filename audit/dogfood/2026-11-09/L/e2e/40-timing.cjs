// 本番で時間を測る(2 回)。iPhone 相当 + CPU 4 倍遅く
const { launch, iphone, cdpTap, cdpTouchDrag, BASE } = require('./lib.cjs')
;(async () => {
  for (const run of [1, 2]) {
    for (const [hash, label] of [['#list', '点検一覧 640 行'], ['#daily', '日常点検表 54 行 × 32 列']]) {
      const { browser, context, page } = await launch({ ...iphone(), locale: 'ja-JP' })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await page.goto(BASE + hash); await page.waitForSelector('.ssg-body-row')
      const first = await page.evaluate(() => Math.round(performance.now()))
      await page.waitForTimeout(1500)
      // 長いタスクを数えながら指で 6 回スクロール
      await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask' }) })
      const g = await page.evaluate(() => { const r = document.querySelector('.ssg-scroll-container').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, h: r.height } })
      const t0 = Date.now()
      for (let i = 0; i < 6; i++) await cdpTouchDrag(page, cdp, { x: g.x, y: g.y + g.h * 0.3 }, { x: g.x, y: g.y - g.h * 0.3 }, 8)
      const scrollMs = Date.now() - t0
      await page.waitForTimeout(500)
      const lt = await page.evaluate(() => window.__lt)
      // タップで選んで、ダブルタップで編集を始めるまで
      await cdpTouchDrag(page, cdp, { x: g.x + 120, y: g.y }, { x: g.x - 60, y: g.y }, 8); await page.waitForTimeout(1500)
      const c = await page.evaluate(() => { const g = document.querySelector('.ssg-scroll-container').getBoundingClientRect(); const cells = [...document.querySelectorAll('.ssg-body-row[data-pane=center] [role=gridcell]')].filter((e) => { const r = e.getBoundingClientRect(); return r.top > g.top + 50 && r.bottom < g.bottom - 10 && r.left > g.left + 120 && r.right < g.right - 2 && e.getAttribute('data-ssg-col-key') !== 'item' && e.getAttribute('data-ssg-col-key') !== 'unit' }); const e = cells[0]; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: e.getAttribute('data-ssg-col-key') } })
      const e0 = await page.evaluate(() => performance.now())
      await cdpTap(page, cdp, c.x, c.y); await page.waitForTimeout(60); await cdpTap(page, cdp, c.x, c.y)
      await page.waitForFunction(() => !!document.querySelector('.ssg-cell-editor'), null, { timeout: 5000 }).catch(() => {})
      const editMs = Math.round((await page.evaluate(() => performance.now())) - e0)
      let filterMs = null
      if (hash === '#list') {
        await page.keyboard.press('Escape'); await page.waitForTimeout(300)
        const b = await page.evaluate(() => { const e = [...document.querySelectorAll('button')].find((x) => x.textContent === '不良のみ'); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
        const f0 = await page.evaluate(() => performance.now())
        await cdpTap(page, cdp, b.x, b.y)
        await page.waitForFunction(() => /行 \d+ \/ 640/.test(document.querySelector('.ssg-bar--top')?.textContent || '') && !/行 640 \/ 640/.test(document.querySelector('.ssg-bar--top').textContent), null, { timeout: 5000 }).catch(() => {})
        filterMs = Math.round((await page.evaluate(() => performance.now())) - f0)
      }
      console.log(`run${run} ${label}: 最初の行 ${first}ms / スクロール 6 回 ${scrollMs}ms 長いタスク ${lt.length} 件 最大 ${Math.max(0, ...lt)}ms / ダブルタップ→エディタ(${c.key}) ${editMs}ms${filterMs != null ? ' / 不良のみ ' + filterMs + 'ms' : ''}`)
      await browser.close()
    }
  }
})()
