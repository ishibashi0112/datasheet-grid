const { open, shot } = require('./lib.cjs')
const info = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid=orders-wrap] .ssg-root')
  const sc = root.querySelector('.ssg-scroll-container')
  const rb = root.getBoundingClientRect()
  const wrap = document.querySelector('[data-testid=orders-wrap]').getBoundingClientRect()
  // 見出しと本体の列の左端がそろっているか
  const heads = [...root.querySelectorAll('[role=columnheader][aria-colindex]')]
  const mis = []
  for (const h of heads) {
    const ci = h.getAttribute('aria-colindex')
    const c = root.querySelector(`[role=row][aria-rowindex="2"] [role=gridcell][aria-colindex="${ci}"]`)
    if (!c) continue
    const a = h.getBoundingClientRect(), b = c.getBoundingClientRect()
    if (Math.abs(a.left - b.left) > 0.5 || Math.abs(a.width - b.width) > 0.5) mis.push(`${h.textContent.replace('⋮','')}:${a.left.toFixed(1)}/${b.left.toFixed(1)} w${a.width.toFixed(1)}/${b.width.toFixed(1)}`)
  }
  const cust = heads.find((h) => h.textContent.includes('顧客'))
  return { wrapW: Math.round(wrap.width), rootW: Math.round(rb.width), rootRight: Math.round(rb.right), wrapRight: Math.round(wrap.right), scCW: sc.clientWidth, scW: sc.scrollWidth, scL: sc.scrollLeft, custW: cust && Math.round(cust.getBoundingClientRect().width), mis }
})
;(async () => {
  const { browser, page, logs } = await open()
  await page.locator('[data-testid=split-section]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  console.log('init', JSON.stringify(await info(page)))
  const h = await page.locator('[data-testid=split-handle]').boundingBox()
  const sx = h.x + h.width / 2, sy = h.y + h.height / 2
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(sx - i * 20, sy)
    await page.waitForTimeout(16)
    if (i === 10) { console.log('mid', JSON.stringify(await info(page))); await shot(page, 'split-mid') }
  }
  console.log('end-before-up', JSON.stringify(await info(page)))
  await page.mouse.up()
  await page.waitForTimeout(300)
  console.log('after up', JSON.stringify(await info(page)))
  await shot(page, 'split-shrunk')
  // 横スクロールしてから広げる
  const sc = await page.locator('[data-testid=orders-wrap] .ssg-scroll-container').boundingBox()
  await page.mouse.move(sc.x + sc.width / 2, sc.y + 100)
  await page.mouse.wheel(400, 0)
  await page.waitForTimeout(300)
  console.log('scrolled', JSON.stringify(await info(page)))
  const h2 = await page.locator('[data-testid=split-handle]').boundingBox()
  await page.mouse.move(h2.x + 4, h2.y + 100)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) { await page.mouse.move(h2.x + 4 + i * 20, h2.y + 100); await page.waitForTimeout(16) }
  await page.mouse.up()
  await page.waitForTimeout(300)
  console.log('widened', JSON.stringify(await info(page)))
  await shot(page, 'split-wide')
  // キーボードでの境目(矢印)
  await page.locator('[data-testid=split-handle]').focus()
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(300)
  console.log('kbd', JSON.stringify(await info(page)))
  // ペインで選択して詳細が出るか
  const cell = await page.evaluate(() => { const r = document.querySelector('[data-testid=orders-wrap] [role=row][aria-rowindex="4"] [role=gridcell]'); const b = r.getBoundingClientRect(); return { x: b.x + 10, y: b.y + 10 } })
  await page.mouse.click(cell.x + 150, cell.y)
  await page.waitForTimeout(200)
  console.log('detail', (await page.textContent('[data-testid=order-detail]')).slice(0, 80))
  const l = logs.filter((x) => !x.includes('React DevTools'))
  if (l.length) console.log('logs:', l.join('\n'))
  await browser.close()
})()
