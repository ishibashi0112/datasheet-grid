// 非同期の行 + <Loading> を renderToStream / renderToString で描いてハイドレーション
const http = require('http')
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
function chunks(url) {
  return new Promise((resolve) => {
    const out = []
    const t0 = Date.now()
    http.get(url, (res) => {
      res.setEncoding('utf8')
      res.on('data', (c) => out.push({ t: Date.now() - t0, len: c.length, loading: c.includes('読み込み中'), grid: c.includes('ssg-root') }))
      res.on('end', () => resolve(out))
    })
  })
}
;(async () => {
  for (const mode of ['stream', 'string']) {
    const c = await chunks(`${BASE}/week?_ssr=${mode}`)
    console.log(`\n== ${mode}: チャンク`, JSON.stringify(c))
    const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
    await page.goto(`${BASE}/week?_ssr=${mode}`)
    await page.waitForTimeout(1500)
    const s = await page.evaluate(() => ({
      bar: document.querySelector('.ssg-bar--top .ssg-bar-chip')?.textContent,
      sort: [...document.querySelectorAll('.ssg-bar--top .ssg-bar-chip')].map((e) => e.textContent).join('|'),
      first: document.querySelector('[data-pane="center"][role="row"][data-row-index="0"]')?.textContent,
      loading: !!document.querySelector('[data-testid=loading]'),
      grids: document.querySelectorAll('.ssg-root').length,
    }))
    console.log('  ハイドレーション後', JSON.stringify(s))
    // 編集して確定
    const cell = page.locator('[data-pane="center"][role="row"][data-row-index="0"] [role="gridcell"]').nth(5)
    await cell.dblclick(); await page.keyboard.press('End'); await page.keyboard.type('(変更)'); await page.keyboard.press('Enter')
    await page.waitForTimeout(400)
    console.log('  編集後', await page.evaluate(() => document.querySelector('[data-pane="center"][role="row"][data-row-index="0"]')?.textContent))
    await page.keyboard.press('Control+z'); await page.waitForTimeout(300)
    console.log('  元に戻す', await page.evaluate(() => document.querySelector('[data-pane="center"][role="row"][data-row-index="0"]')?.textContent))
    await shot(page, 'week-' + mode)
    console.log(logs.filter((l) => !l.includes('vite')).map((l) => l.slice(0, 300)).join('\n'))
    await browser.close()
  }
  // クライアントの遷移で /week へ(サーバーではなくブラウザで非同期に読む)
  const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.goto(`${BASE}/rooms`)
  await page.waitForTimeout(1000)
  await page.locator('nav a', { hasText: '今週' }).click()
  await page.waitForTimeout(100)
  console.log('\n== 遷移直後', await page.evaluate(() => ({ url: location.pathname, loading: !!document.querySelector('[data-testid=loading]'), grids: document.querySelectorAll('.ssg-root').length, title: document.querySelector('.ssg-root .ssg-bar-chip')?.textContent })))
  await page.waitForTimeout(1200)
  console.log('   1.3 秒後', await page.evaluate(() => ({ url: location.pathname, loading: !!document.querySelector('[data-testid=loading]'), grids: document.querySelectorAll('.ssg-root').length, bar: document.querySelector('.ssg-root .ssg-bar-chip')?.textContent, first: document.querySelector('[data-pane="center"][role="row"][data-row-index="0"]')?.textContent })))
  console.log(logs.filter((l) => !l.includes('vite')).map((l) => l.slice(0, 300)).join('\n'))
  await browser.close()
})()
