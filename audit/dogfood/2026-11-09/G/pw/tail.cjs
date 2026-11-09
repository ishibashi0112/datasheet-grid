const { open, shot, wait, startJank, stopJank, rowCount } = require('./lib.cjs')
async function scrollInfo(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.ssg-scroll-container')
    const rows = [...document.querySelectorAll('[data-pane="left"].ssg-body-row')]
    const r = el.getBoundingClientRect()
    const vis = rows.filter((x) => { const b = x.getBoundingClientRect(); return b.bottom > r.top + 30 && b.top < r.bottom - 5 })
    const nums = vis.map((x) => Number(x.querySelector('[role=rowheader]')?.textContent)).filter((n) => !isNaN(n))
    return {
      top: Math.round(el.scrollTop), max: el.scrollHeight - el.clientHeight, gapToBottom: Math.round(el.scrollHeight - el.clientHeight - el.scrollTop),
      firstVisibleNo: Math.min(...nums), lastVisibleNo: Math.max(...nums),
      follow: document.querySelectorAll('.toolbar input[type=checkbox]')[1].checked,
      total: document.querySelector('.toolbar .muted')?.textContent,
    }
  })
}
;(async () => {
  const url = (process.argv[2] ?? 'http://localhost:5407/') + '?live=1'
  const tag = process.argv[3] ?? 'dev'
  const { browser, page, logs } = await open(url)
  await startJank(page)
  await wait(3500)
  console.log('following', JSON.stringify(await scrollInfo(page)), 'rowCount', await rowCount(page))
  console.log('jank (live, following, no filter)', JSON.stringify(await stopJank(page)))
  await shot(page, `tail-${tag}-following`)
  // ホイールで上へ
  const grid = await page.locator('.ssg-scroll-container').boundingBox()
  await page.mouse.move(grid.x + 600, grid.y + 300)
  await page.mouse.wheel(0, -600)
  await wait(300)
  const s1 = await scrollInfo(page)
  console.log('after wheel up', JSON.stringify(s1))
  await wait(3000)
  const s2 = await scrollInfo(page)
  console.log('3s later (should stay)', JSON.stringify(s2))
  await shot(page, `tail-${tag}-paused`)
  // 一番下までホイール
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 2000); await wait(100) }
  await wait(300)
  console.log('after wheel to bottom', JSON.stringify(await scrollInfo(page)))
  await wait(2500)
  console.log('2.5s later (should follow again)', JSON.stringify(await scrollInfo(page)))
  // キーボード: セルを押して PageUp
  const cell = page.locator('[data-pane="center"].ssg-body-row').nth(5).locator('[role=gridcell]').first()
  const cb = await cell.boundingBox()
  await page.mouse.click(cb.x + 10, cb.y + cb.height / 2)
  await wait(200)
  console.log('after click (follow?)', JSON.stringify(await scrollInfo(page)), JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
  await page.keyboard.press('PageUp')
  await wait(300)
  console.log('after PageUp', JSON.stringify(await scrollInfo(page)))
  await wait(2000)
  console.log('2s later', JSON.stringify(await scrollInfo(page)), JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
  await page.keyboard.press('Control+End')
  await wait(300)
  console.log('after Ctrl+End', JSON.stringify(await scrollInfo(page)))
  await wait(2500)
  console.log('2.5s later', JSON.stringify(await scrollInfo(page)), JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
  await shot(page, `tail-${tag}-ctrlend`)
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
