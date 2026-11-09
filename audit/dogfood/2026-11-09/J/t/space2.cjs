const { open } = require('./lib.cjs')
;(async () => {
  const { browser, page } = await open()
  for (const col of ['受注日', '地域', '数量', '単価', '顧客', 'No.', '金額', '状態']) {
    const pos = await page.evaluate((col) => {
      const root = document.querySelector('[aria-label="売上明細"]').closest('.ssg-root')
      const h = [...root.querySelectorAll('[role=columnheader]')].find((x) => x.textContent.replace('⋮','').trim() === col)
      const hr = h.getBoundingClientRect()
      const row = [...root.querySelectorAll('[role=row][aria-rowindex="3"]')].find((r) => { const b = r.getBoundingClientRect(); return b.left <= hr.left + 2 && b.right >= hr.right - 2 })
      return { x: hr.x + hr.width / 2, y: row.getBoundingClientRect().y + 18 }
    }, col)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(100)
    await page.mouse.click(pos.x, pos.y)
    await page.waitForTimeout(150)
    await page.keyboard.press('Space')
    await page.waitForTimeout(250)
    const st = await page.evaluate(() => ({ y: scrollY, editing: !!document.querySelector('.ssg-cell-editor'), val: document.querySelector('.ssg-cell-editor input')?.value, sel: !!document.querySelector('.ssg-select-editor-popover') }))
    console.log(col, JSON.stringify(st))
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await browser.close()
})()
