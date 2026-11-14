const { open, shot } = require('./lib.cjs')
const info = (page) => page.evaluate(() => {
  const root = document.querySelector('[data-testid=orders-wrap] .ssg-root')
  const sc = root.querySelector('.ssg-scroll-container')
  const rb = root.getBoundingClientRect(), wrap = document.querySelector('[data-testid=orders-wrap]').getBoundingClientRect()
  const cust = [...root.querySelectorAll('[role=columnheader]')].find((h) => h.textContent.includes('顧客'))
  const bottom = root.querySelector('.ssg-bar--bottom')?.getBoundingClientRect()
  const vis = [...root.querySelectorAll('[data-pane=center] [role=row][aria-rowindex]')].filter((r) => { const b = r.getBoundingClientRect(); const s = sc.getBoundingClientRect(); return b.top < s.bottom && b.bottom > s.top + 40 }).length
  return { wrap: [Math.round(wrap.width), Math.round(wrap.height)], root: [Math.round(rb.width), Math.round(rb.height)], rootBottom: Math.round(rb.bottom), wrapBottom: Math.round(wrap.bottom), bottomBarBottom: bottom && Math.round(bottom.bottom), scCH: sc.clientHeight, scCW: sc.clientWidth, scW: sc.scrollWidth, custW: cust && cust.offsetWidth, visRows: vis, scrollTop: sc.scrollTop }
})
;(async () => {
  const { browser, page, logs } = await open()
  await page.locator('[data-testid=split-section]').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  console.log('init', JSON.stringify(await info(page)))
  // 縦の境目を上へ 200px ゆっくり
  const h = await page.locator('[data-testid=vsplit-handle]').boundingBox()
  await page.mouse.move(h.x + 100, h.y + h.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) { await page.mouse.move(h.x + 100, h.y + h.height / 2 - i * 10); await page.waitForTimeout(16) }
  console.log('during up-drag', JSON.stringify(await info(page)))
  await shot(page, 'vsplit-during')
  await page.mouse.up()
  await page.waitForTimeout(300)
  console.log('after', JSON.stringify(await info(page)))
  // 縦スクロールしてから境目を下へ戻す
  await page.evaluate(() => { document.querySelector('[data-testid=orders-wrap] .ssg-scroll-container').scrollTop = 100000 })
  await page.waitForTimeout(200)
  const h2 = await page.locator('[data-testid=vsplit-handle]').boundingBox()
  await page.mouse.move(h2.x + 100, h2.y + 4); await page.mouse.down()
  for (let i = 1; i <= 25; i++) { await page.mouse.move(h2.x + 100, h2.y + 4 + i * 10); await page.waitForTimeout(16) }
  await page.mouse.up(); await page.waitForTimeout(300)
  console.log('bottom + widened', JSON.stringify(await info(page)))
  await shot(page, 'vsplit-bottom')
  // 畳む → 開く
  await page.click('[data-testid=collapse-orders]')
  await page.waitForTimeout(400)
  console.log('collapsed', JSON.stringify(await info(page)))
  await page.click('[data-testid=collapse-orders]')
  await page.waitForTimeout(30)
  console.log('expanded+30ms', JSON.stringify(await info(page)))
  await page.waitForTimeout(400)
  console.log('expanded', JSON.stringify(await info(page)))
  await shot(page, 'split-expanded')
  const l = logs.filter((x) => !x.includes('React DevTools'))
  if (l.length) console.log('logs:', l.join('\n'))
  await browser.close()
})()
