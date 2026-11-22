// サーバーの描画(JS なし)とハイドレーションの後を、URL ごとに比べる
const { chromium } = require('playwright')
const { shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
const BTZ = process.env.BTZ // ブラウザのタイムゾーン
const enc = encodeURIComponent
const URLS = (process.env.URLS ?? '').split(' ').filter(Boolean)
const DEFAULT_URLS = [
  '/',
  '/?date=today',
  '/?date=thisMonth',
  '/?date=last30days',
  '/?from=2026-11-16&to=2026-11-30',
  '/?sort=attendees.desc',
  '/?room=A,B&sort=date.desc',
  '/?f=' + enc(JSON.stringify({ createdAt: { kind: 'dateSet', condition: { mode: 'range', from: '2026-11-01', to: '2026-11-03' }, set: null } })),
  '/?f=' + enc(JSON.stringify({ createdAt: { kind: 'dateSet', condition: null, set: { mode: 'include', values: ['2026-11-02'] } } })),
]

async function snapshot(page) {
  return page.evaluate(() => {
    const bar = [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent.trim()).join(' | ')
    const left = [...document.querySelectorAll('[data-pane="left"][role="row"]')].map((r) => r.textContent.trim()).filter((t) => t && !t.startsWith('#'))
    const aria = document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount')
    const total = document.querySelector('.ssg-total-row, [data-ssg-total-row]')?.textContent?.trim()
    return { bar, aria, first: left.slice(0, 4), lastShown: left.slice(-1)[0], n: left.length }
  })
}

;(async () => {
  const browser = await chromium.launch()
  const noJs = await browser.newContext({ javaScriptEnabled: false, timezoneId: BTZ, deviceScaleFactor: 1, viewport: { width: 1280, height: 800 } })
  const js = await browser.newContext({ timezoneId: BTZ, deviceScaleFactor: 1, viewport: { width: 1280, height: 800 } })
  for (const mode of (process.env.MODES ?? 'stream string').split(' ')) {
    for (const u of URLS.length ? URLS : DEFAULT_URLS) {
      const url = BASE + u + (u.includes('?') ? '&' : '?') + '_ssr=' + mode
      const p1 = await noJs.newPage()
      await p1.goto(url)
      const server = await snapshot(p1)
      await p1.close()
      const p2 = await js.newPage()
      const logs = []
      p2.on('console', (m) => { if (!/\[vite\]/.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
      p2.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
      await p2.goto(url)
      await p2.waitForTimeout(1500)
      const client = await snapshot(p2)
      if (process.env.SHOT) await shot(p2, `${process.env.SHOT}-${mode}-${DEFAULT_URLS.indexOf(u)}`)
      await p2.close()
      const same = server.bar === client.bar && server.aria === client.aria
      console.log(`\n== ${mode} ${decodeURIComponent(u)}  ${same ? 'SAME' : 'DIFF'}`)
      console.log('  server:', JSON.stringify(server))
      console.log('  client:', JSON.stringify(client))
      if (logs.length) console.log('  logs:\n   ' + logs.join('\n   '))
    }
  }
  await browser.close()
})()
