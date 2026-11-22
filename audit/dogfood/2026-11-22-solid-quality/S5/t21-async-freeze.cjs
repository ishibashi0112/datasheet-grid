// 取り直し(delay ms)の間にグリッドを操作して、画面が反応するかを見る
// 使い方: node t21-async-freeze.cjs <label> [query]
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
const extra = process.argv[3] ?? ''
;(async () => {
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?async&n=50000&delay=5000${extra}`)
  const ev = (f, a) => page.evaluate(f, a)
  await page.waitForSelector('.ssg-body-cell', { timeout: 60000 }); await sleep(1500)
  await page.locator('.ssg-body-row[data-pane="center"] [data-ssg-col-key="service"]').nth(2).click(); await sleep(300)
  const snap = () => ev(() => {
    const vp = document.querySelector('.ssg-root [style*="overflow"]')
    const scrollers = [...document.querySelectorAll('.ssg-root *')].filter((d) => d.scrollHeight > d.clientHeight + 100 && /auto|scroll/.test(getComputedStyle(d).overflowY))
    const sc = scrollers[0]
    const rows = [...document.querySelectorAll('.ssg-body-row[data-pane=center]')].filter((r) => r.dataset.rowKey)
    const idx = rows.map((r) => +r.dataset.rowIndex).sort((a, b) => a - b)
    const scRect = sc?.getBoundingClientRect()
    // ビューポートの真ん中に描かれている行(無ければ空白)
    const mid = scRect ? document.elementFromPoint(scRect.left + 300, scRect.top + scRect.height / 2) : null
    const act = document.querySelector('.ssg-active-cell, [class*="active-cell"]')
    return {
      pending: document.querySelector('[data-testid=pending]')?.textContent,
      scrollTop: sc ? Math.round(sc.scrollTop) : null,
      renderedIdx: idx.length ? `${idx[0]}..${idx.at(-1)}` : 'none',
      midHit: mid ? (mid.closest('.ssg-body-row')?.dataset.rowIndex ?? mid.className.toString().slice(0, 30)) : null,
      barActive: document.querySelector('.ssg-bar--bottom')?.innerText.match(/セル\s*(\S+)/)?.[1] ?? null,
      activeOverlayTop: act ? Math.round(act.getBoundingClientRect().top) : null,
      globalInput: document.querySelector('.ssg-bar--top input')?.value,
      menus: document.querySelectorAll('.ssg-menu-panel').length,
    }
  })
  console.log(`[${label}] idle:`, JSON.stringify(await snap()))
  await page.selectOption('[data-testid=env]', 'stg'); await sleep(300)
  const t0 = Date.now()
  const at = () => `${Date.now() - t0}ms`
  console.log(`[${label}] pending start ${at()}:`, JSON.stringify(await snap()))
  await page.mouse.move(700, 450); await page.mouse.wheel(0, 3000); await sleep(400)
  console.log(`[${label}] after wheel ${at()}:`, JSON.stringify(await snap()))
  await page.screenshot({ path: `${__dirname}/shots/t21-${label}-wheel.png` })
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await sleep(300)
  console.log(`[${label}] after keys ${at()}:`, JSON.stringify(await snap()))
  const hdr = page.locator('.ssg-header-cell', { hasText: 'サービス' })
  await hdr.hover(); await hdr.locator('.ssg-icon-btn').last().click({ timeout: 3000 }).catch((e) => console.log('menu click failed', e.message.split('\n')[0])); await sleep(400)
  console.log(`[${label}] after column menu ${at()}:`, JSON.stringify(await snap()))
  await page.keyboard.press('Escape'); await sleep(200)
  await page.screenshot({ path: `${__dirname}/shots/t21-${label}-pending.png` })
  for (let i = 0; i < 12; i++) { await sleep(500); const s = await snap(); if (s.pending !== '更新中…') { console.log(`[${label}] landed ${at()}:`, JSON.stringify(s)); break } }
  await sleep(800)
  console.log(`[${label}] settled ${at()}:`, JSON.stringify(await snap()))
  await page.screenshot({ path: `${__dirname}/shots/t21-${label}-landed.png` })
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0].slice(0, 200)).join('\n'))
  await browser.close()
})()
