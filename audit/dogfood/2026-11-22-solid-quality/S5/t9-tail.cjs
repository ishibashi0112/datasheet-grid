// ログタブ: 末尾を追うモード(毎秒 50 行を足し、末尾にいるときだけ下へ)
// 使い方: node t9-tail.cjs <label> <n>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const label = process.argv[2] ?? 'x'
  const n = Number(process.argv[3] ?? 20000)
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?n=${n}&tail`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 120000 })
  await sleep(1500)
  const ev = (f, a) => page.evaluate(f, a)
  const out = { label, n }
  await ev(() => {
    window.__lt = []
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(Math.round(e.duration)))).observe({ type: 'longtask' })
  })
  const state = () =>
    ev(() => {
      const sc = document.querySelector('.ssg-scroll-container')
      const rows = [...document.querySelectorAll('.ssg-body-row[data-pane=left] .ssg-row-header-cell')].map((c) => Number(c.textContent)).filter((x) => x > 0)
      return {
        count: document.querySelector('[data-testid=logcount]')?.textContent,
        following: document.querySelector('[data-testid=following]')?.textContent,
        atBottom: window.__logGrid.isAtBottom(),
        scrollTop: Math.round(sc.scrollTop),
        maxRowNo: Math.max(0, ...rows),
        minRowNo: Math.min(...rows),
      }
    })
  out.initial = await state()
  // 末尾へ
  await page.getByRole('button', { name: '末尾へ' }).click()
  await sleep(600)
  out.afterButton = await state()
  await sleep(3200)
  out.after3s = await state()
  await sleep(3000)
  out.after6s = await state()
  // 上へスクロール
  const box = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, -400)
    await sleep(60)
  }
  await sleep(400)
  out.afterScrollUp = await state()
  await sleep(3500)
  out.after3sUp = await state()
  out.jumpedWhileUp = out.after3sUp.scrollTop !== out.afterScrollUp.scrollTop || out.after3sUp.minRowNo !== out.afterScrollUp.minRowNo
  // 末尾へ戻る(ボタン)
  await page.getByRole('button', { name: '末尾へ' }).click()
  await sleep(600)
  out.afterWheelDown = await state()
  await sleep(2500)
  out.after2sDown = await state()
  out.longTasks = await ev(() => window.__lt)
  await page.screenshot({ path: `${__dirname}/shots/t9-${label}-${n}.png` })
  out.logs = logs.filter((l) => !l.includes('[vite]')).slice(0, 10)
  console.log(JSON.stringify(out, null, 1))
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
