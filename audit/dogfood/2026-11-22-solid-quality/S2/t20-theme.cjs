// theme="auto" と motion の既定('auto')で SSR → hydrate したとき、OS の設定(emulateMedia)に合うか
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:3501'
const paths = (process.env.PATHS ?? '/users,/activity,/users/1').split(',')
;(async () => {
  const browser = await chromium.launch()
  for (const scheme of ['light', 'dark']) for (const rm of ['no-preference', 'reduce']) for (const p of paths) {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 700 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: rm })
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { const t = m.text(); if (!/\[vite\]|solid-performance|Download the/.test(t)) logs.push(`[${m.type()}] ${t.split('\n')[0].slice(0, 200)}`) })
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const r = document.querySelector('.ssg-root')
        window.__ssr = { root: r, cls: r?.className, shell: document.querySelector('.ssg-shell')?.className }
        window.__changes = []
        if (r) new MutationObserver(() => window.__changes.push([Math.round(performance.now()), r.className])).observe(r, { attributes: true, attributeFilter: ['class'] })
      })
    })
    // サーバーの HTML そのもの
    const html = await (await page.request.get(BASE + p)).text()
    const m = html.match(/class="(ssg-root[^"]*)"/)
    await page.goto(BASE + p)
    await page.locator('.ssg-body-row:not([data-skeleton-row])').first().waitFor({ timeout: 15000 })
    await page.waitForTimeout(800)
    const r = await page.evaluate(() => {
      const root = document.querySelector('.ssg-root')
      const bg = getComputedStyle(document.querySelector('.ssg-shell') ?? root).backgroundColor
      const cell = document.querySelector('.ssg-body-row:not([data-skeleton-row]) .ssg-body-cell')
      return { same: window.__ssr.root === root, roots: document.querySelectorAll('.ssg-root').length, ssrDomCls: window.__ssr.cls, cls: root.className, changes: window.__changes, bg, cellColor: cell && getComputedStyle(cell).color, motionFast: getComputedStyle(root).getPropertyValue('--ssg-motion-fast') }
    })
    // 列メニューを開いてポータルのクラスを見る
    const h = page.locator('[role="columnheader"]').nth(3)
    await h.hover(); await page.waitForTimeout(150)
    const btn = h.locator('button[aria-haspopup="menu"]')
    let menuCls = null
    if (await btn.count()) {
      const b = await btn.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300)
      menuCls = await page.evaluate(() => { const m = document.querySelector('[role="menu"]'); const host = m?.closest('[class*="ssg-"]'); return m ? [m.className, host?.className, getComputedStyle(m).backgroundColor] : null })
      await page.keyboard.press('Escape')
    }
    const tag = `${scheme}/${rm}${p}`
    console.log(JSON.stringify({ tag, serverHtmlCls: m?.[1], ...r, menuCls }))
    if (logs.length) console.log('  logs:', logs.join(' / '))
    await page.screenshot({ path: `out/shot-theme-${scheme}-${rm}-${p.replace(/\//g, '_')}.png` })
    await ctx.close()
  }
  await browser.close()
})()
