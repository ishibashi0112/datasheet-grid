const { open, shot, wait, clickVisible } = require('./lib.cjs')
async function probe(page, label) {
  const out = []
  for (let i = 0; i < 10; i++) {
    out.push(JSON.stringify(await page.evaluate(() => window.__grid.getActiveCell())))
    await wait(200)
  }
  console.log(label, out.join(' '))
}
;(async () => {
  const url = (process.argv[2] ?? 'http://localhost:5407/') + '?live=1'
  const { browser, page, logs } = await open(url)
  await wait(2500)
  // 追っている最中にクリック
  const info = await clickVisible(page, 10, 'center', 2)
  console.log('clicked', info)
  await probe(page, 'following click:')
  console.log('follow?', await page.locator('.toolbar input[type=checkbox]').nth(1).isChecked())
  await shot(page, 'liveclick-following')
  // ドラッグで範囲選択(追従中)
  const a = await page.evaluate(() => {
    const sc = document.querySelector('.ssg-scroll-container').getBoundingClientRect()
    return { x: sc.left + 700, y: sc.top + 200 }
  })
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(a.x + 50, a.y + 150, { steps: 10 })
  await wait(1200) // 押したまま 1 秒以上(行が増える)
  await page.mouse.up()
  console.log('after drag selection', JSON.stringify(await page.evaluate(() => window.__grid.getSelection())))
  await wait(1500)
  console.log('1.5s later selection', JSON.stringify(await page.evaluate(() => window.__grid.getSelection())), (await page.locator('.ssg-bar--bottom').innerText()).replace(/\s+/g, ' '))
  await page.keyboard.press('Control+c')
  await wait(200)
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  console.log('copied', JSON.stringify(clip.slice(0, 300)))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('DevTools') && !l.includes('auto-height')).slice(0, 30).join('\n'))
  await browser.close()
})()
