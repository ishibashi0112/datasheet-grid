// 相対日付のプリセット(今日)を URL から入れて SSR。サーバーの TZ とブラウザの TZ がずれるとき
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:3501'
const TZ = process.env.BROWSER_TZ ?? 'Pacific/Pago_Pago'
const preset = process.env.PRESET ?? 'today'
const f = (k) => encodeURIComponent(JSON.stringify({ [k]: { kind: 'dateSet', condition: { mode: 'preset', preset }, set: null } }))
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 700 }, deviceScaleFactor: 1, timezoneId: TZ })
  const server = await (await ctx.request.get(BASE + '/api/_today')).json()
  for (const p of [`/activity?f=${f('at')}`, `/users?f=${f('reviewDue')}`, `/activity?stream=1&f=${f('at')}`]) {
    const page = await ctx.newPage()
    const logs = []
    page.on('console', (m) => { const t = m.text(); if (!/\[vite\]|solid-performance|Download the/.test(t)) logs.push(`[${m.type()}] ${t.split('\n')[0].slice(0, 300)}`) })
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
    const reqs = []
    page.on('request', (r) => { if (r.url().includes('/api/users?')) reqs.push(decodeURIComponent(new URL(r.url()).searchParams.get('query'))) })
    const html = await (await ctx.request.get(BASE + p)).text()
    const chips = [...html.matchAll(/class="ssg-bar-chip[^"]*"[^>]*>(.*?)<\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/<!--.*?-->/g, ''))
    await page.addInitScript(() => {
      window.__txt = []
      document.addEventListener('DOMContentLoaded', () => { window.__chipsAtDcl = [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent) })
    })
    await page.goto(BASE + p)
    await page.waitForTimeout(2500)
    const r = await page.evaluate(() => ({
      browserToday: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })(),
      chips: [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent),
      dates: [...new Set([...document.querySelectorAll('.ssg-body-row:not([data-skeleton-row]) [data-ssg-col-key="at"], .ssg-body-row:not([data-skeleton-row]) [data-ssg-col-key="reviewDue"]')].map((e) => e.textContent))],
      rows: document.querySelectorAll('.ssg-body-row:not([data-skeleton-row])').length,
      empty: document.querySelector('.ssg-empty, [class*="empty"]')?.textContent ?? null,
    }))
    // フィルターのポップオーバーを開いてプリセットの表示を見る
    const key = p.includes('activity') ? 'at' : 'reviewDue'
    const h = page.locator(`[role="columnheader"][data-ssg-col-key="${key}"]`).first()
    await h.hover(); await page.waitForTimeout(150)
    const mb = h.locator('button[aria-haspopup="menu"]')
    let pop = null
    if (await mb.count()) {
      const b = await mb.first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(300)
      await page.locator('[role="menu"] .ssg-menu-item', { hasText: 'Filter…' }).click()
      await page.waitForTimeout(800)
      pop = await page.evaluate(() => { const p = document.querySelector('.ssg-filter-popover'); return p ? { text: p.textContent.replace(/\s+/g, ' ').slice(0, 300), pressed: [...p.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"]')].map((e) => e.textContent.trim()).slice(0, 10) } : null })
      await page.screenshot({ path: `out/shot-tz-${key}-${TZ.replace('/', '_')}.png` })
      await page.keyboard.press('Escape')
    }
    console.log(JSON.stringify({ p: p.slice(0, 40), server, ssrChips: chips, ...r, pop, reqs: reqs.slice(0, 2) }))
    if (logs.length) console.log('  logs:', logs.join('\n   '))
    await page.close()
  }
  await browser.close()
})()
