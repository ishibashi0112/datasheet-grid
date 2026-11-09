const { open, shot } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open()
  // 売上明細の 備考 列(text)を選んで Space
  const pos = await page.evaluate(() => {
    const root = document.querySelector('[aria-label="売上明細"]').closest('.ssg-root')
    const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮','').trim() === '備考')
    const hr = h.getBoundingClientRect()
    const row = [...root.querySelectorAll('[role=row][aria-rowindex="3"]')].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
    return { x: hr.x + hr.width / 2, y: row.getBoundingClientRect().y + 18 }
  })
  for (const key of ['Space', 'a']) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.mouse.click(pos.x, pos.y)
    await page.waitForTimeout(200)
    const y0 = await page.evaluate(() => scrollY)
    await page.keyboard.press(key)
    await page.waitForTimeout(300)
    const st = await page.evaluate(() => ({ y: scrollY, editing: !!document.querySelector('.ssg-cell-editor input, .ssg-cell-editor textarea'), val: document.querySelector('.ssg-cell-editor input')?.value, active: document.activeElement.className }))
    console.log(key, 'scrollY', y0, '→', st.y, JSON.stringify(st))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  // チェックボックス列で Space
  const cb = await page.evaluate(() => {
    const root = document.querySelector('[aria-label="売上明細"]').closest('.ssg-root')
    const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮','').trim() === '入金')
    const hr = h.getBoundingClientRect()
    const row = [...root.querySelectorAll('[role=row][aria-rowindex="3"]')].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
    return { x: hr.x + 8, y: row.getBoundingClientRect().y + 18 }
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.mouse.click(cb.x, cb.y)
  await page.waitForTimeout(200)
  await page.keyboard.press('Space')
  await page.waitForTimeout(300)
  console.log('checkbox Space scrollY', await page.evaluate(() => scrollY))
  await browser.close()
})()
