const { open, shot, wait, clickVisible, waitCountChange } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open('http://localhost:5407/?rows=20000')
  await wait(800)
  // チップのラベル FATAL! を検索
  await clickVisible(page, 1, 'center', 1)
  await page.keyboard.press('Control+f')
  for (const q of ['FATAL!', 'FATAL']) {
    await page.locator('.ssg-find-bar input').fill(q)
    await wait(1500)
    console.log('find', q, (await page.locator('.ssg-find-bar').innerText()).replace(/\s+/g, ' '))
  }
  await page.keyboard.press('Enter')
  await wait(400)
  await page.screenshot({ path: 'shots/misc-find-fatal.png', clip: { x: 0, y: 90, width: 900, height: 300 } })
  await page.keyboard.press('Escape')
  // compact の折り返し行の余白(20,000 行 → autoHeight が効く)
  await page.screenshot({ path: 'shots/misc-autoheight-compact.png', clip: { x: 300, y: 120, width: 900, height: 260 } })
  const pad = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.ssg-body-cell--autoheight')].find((x) => x.querySelector('.ssg-autoheight-content')?.getBoundingClientRect().height > 30)
    if (!c) return null
    const cb = c.getBoundingClientRect(); const ib = c.querySelector('.ssg-autoheight-content').getBoundingClientRect()
    const row = c.closest('.ssg-body-row').getBoundingClientRect()
    return { cellH: Math.round(cb.height), rowH: Math.round(row.height), contentTopGap: Math.round(ib.top - cb.top), contentBottomGap: Math.round(cb.bottom - ib.bottom), lineHeight: getComputedStyle(c.querySelector('.ssg-autoheight-content')).lineHeight, padding: getComputedStyle(c).padding }
  })
  console.log('autoheight compact cell metrics', JSON.stringify(pad))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools')).slice(0, 30).join('\n'))
  await browser.close()
})()
