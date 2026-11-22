// 上のグリッドでキー操作で行を動かしたときの下の入れ替わり(速さ・ちらつき)
const { open, clickCell, getCell, activeInfo, shot, sleep } = require('./lib.cjs')
const [qs = '', steps = '30', gap = '0'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  // 下の表の変化を記録する(先頭の行のキー、空の印、件数)
  await page.evaluate(() => {
    const g = () => document.querySelector('[role=grid][aria-label="Lines"]')
    window.__frames = []
    let last = ''
    const tick = () => {
      const grid = g()
      const first = grid?.querySelector('[role=row][data-row-key]')?.getAttribute('data-row-key') ?? 'none'
      const empty = !!grid?.closest('.ssg-root')?.querySelector('.ssg-empty, [class*=no-rows], [class*=overlay]')
      const head = document.querySelector('.bottom h2')?.textContent ?? ''
      const count = grid?.closest('.ssg-root')?.querySelector('.ssg-bar--bottom')?.textContent?.match(/Rows \d+ of \d+/)?.[0]
      const sig = `${first}|${empty}|${count}|${head.slice(10, 16)}`
      if (sig !== last) { window.__frames.push({ t: Math.round(performance.now()), sig }); last = sig }
      window.__raf = requestAnimationFrame(tick)
    }
    tick()
  })
  const t0 = Date.now()
  for (let i = 0; i < Number(steps); i++) { await page.keyboard.press('ArrowDown'); if (Number(gap)) await sleep(Number(gap)) }
  const tKeys = Date.now() - t0
  await sleep(500)
  const frames = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__frames })
  const a = await activeInfo(page, 'Orders')
  const head = await page.$eval('.bottom h2', (e) => e.textContent)
  const firstLine = await page.evaluate(() => document.querySelector('[role=grid][aria-label="Lines"] [role=row][data-row-key]')?.getAttribute('data-row-key'))
  console.log(JSON.stringify({ steps, gap, tKeys, topActive: a.active, head, firstLine, frames: frames.length }))
  // 先頭の行と見出しが食い違ったフレーム / 空になったフレーム
  const bad = frames.filter((f) => { const [first, empty, , h] = f.sig.split('|'); return empty === 'true' || (first !== 'none' && !first.startsWith('O' + h.trim())) })
  console.log('食い違い / 空のフレーム', bad.length, JSON.stringify(bad.slice(0, 5)))
  console.log('最初の 6 フレーム', JSON.stringify(frames.slice(0, 6)))
  await shot(page, 'nav')
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
