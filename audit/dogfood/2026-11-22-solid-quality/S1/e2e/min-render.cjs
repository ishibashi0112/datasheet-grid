const { open, click, text } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await open(process.argv[2] || 'http://localhost:5501/min-render.html')
  const calls = () => page.evaluate(() => { const c = window.calls; const r = { k1: c['1'], k2: c['2'], k3: c['3'], total: Object.values(c).reduce((a, b) => a + b, 0) }; return JSON.stringify(r) })
  console.log('init', await calls(), await text(page, 2, 4))
  await click(page, 2, 4) // badge 行 1 をアクティブに
  await page.waitForTimeout(100)
  console.log('activate r1 badge', await calls(), JSON.stringify(await text(page, 2, 4)))
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  console.log('ArrowDown', await calls(), JSON.stringify(await text(page, 2, 4)), JSON.stringify(await text(page, 3, 4)))
  // 行 3 の name を編集
  await click(page, 4, 2, { clickCount: 2 }); await page.keyboard.type('Z'); await page.keyboard.press('Enter'); await page.waitForTimeout(150)
  console.log('edit r3 name', await calls(), JSON.stringify(await text(page, 4, 4)))
  // 並べ替え(qty 降順)で rowIndex が追従するか
  await page.evaluate(() => window.grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }))
  await page.waitForTimeout(300)
  console.log('after sort desc', await calls(), 'first row badge', JSON.stringify(await text(page, 2, 4)))
  // 列を差し替え(列の参照を変える)
  await page.evaluate(() => window.setCols(window.cols.map((c) => ({ ...c }))))
  await page.waitForTimeout(200)
  console.log('columns replaced', await calls())
  console.log(logs.filter((l) => !l.includes('vite')).join('\n'))
  await browser.close()
})()
