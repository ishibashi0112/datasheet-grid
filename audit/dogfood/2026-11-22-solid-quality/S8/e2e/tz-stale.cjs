// TZ がずれた SSR: 固定列と中央の列が同じ行を指しているか / スクロールで直るか / 操作の後
const { open, shot } = require('./lib.cjs')
const enc = encodeURIComponent
const BASE = process.env.BASE ?? 'http://localhost:3508'
;(async () => {
  const { browser, page, logs } = await open({ timezoneId: process.env.BTZ ?? 'Pacific/Honolulu' })
  const f = enc(JSON.stringify({ createdAt: { kind: 'dateSet', condition: { mode: 'range', from: '2026-11-01', to: '2026-11-03' }, set: null } }))
  await page.goto(`${BASE}/?f=${f}&_ssr=${process.env.MODE ?? 'stream'}`)
  await page.waitForTimeout(1500)
  const check = async (label) => {
    const r = await page.evaluate(() => {
      const out = []
      for (const row of document.querySelectorAll('[data-pane="left"][role="row"][data-row-index]')) {
        const i = row.getAttribute('data-row-index')
        const c = document.querySelector(`[data-pane="center"][role="row"][data-row-index="${i}"]`)
        const date = row.textContent.match(/(\d{4})\/(\d{2})\/(\d{2})/)
        const created = c?.textContent.match(/(\d{4})\/(\d{2})\/(\d{2}) \d{2}:/)
        // 登録日時は予約日より前のはず(前でなければ、固定列と中央の列が別の行)
        const bad = date && created ? created.slice(1).join('') >= date.slice(1).join('') : false
        out.push({ i, leftKey: row.getAttribute('data-row-key'), centerKey: c?.getAttribute('data-row-key'), left: row.textContent.trim().slice(0, 16), created: created?.[0], bad })
      }
      const mism = out.filter((o) => o.leftKey !== o.centerKey || o.bad)
      return { rows: out.length, mismatched: mism.length, sample: mism.slice(0, 3), bar: document.querySelector('.ssg-bar--top .ssg-bar-chip')?.textContent, total: document.querySelector('[data-pane="center"] .ssg-total-row, .ssg-total-row')?.textContent?.trim() }
    })
    console.log(label.padEnd(16), JSON.stringify(r))
  }
  await check('ハイドレーション後')
  await shot(page, 'tz-stale-' + (process.env.TAG ?? 'x'))
  await page.mouse.move(600, 400)
  await page.mouse.wheel(0, 200)
  await page.waitForTimeout(600)
  await check('少しスクロール')
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(600)
  await check('上へ戻す')
  await page.evaluate(() => window.__grid.applyState({ sort: [{ columnKey: 'start', direction: 'asc' }] }))
  await page.waitForTimeout(600)
  await check('並び替え')
  console.log(logs.filter((l) => !l.includes('vite')).map((l) => l.slice(0, 150)).join('\n'))
  await browser.close()
})()
