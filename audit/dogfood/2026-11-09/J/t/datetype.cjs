const { open } = require('./lib.cjs')
const { cellPos, cellText } = require('./dlib.cjs')
const S = '[data-testid=sales-wrap]'
;(async () => {
  for (const [label, keys] of [['Enter→20250315', ['Enter', '20250315']], ['Enter→2025-03-15', ['Enter', '2025-03-15']], ['F2→20250315', ['F2', '20250315']], ['いきなり 2', ['', '20250315']], ['Enter→2025/03/15', ['Enter', '2025/03/15']], ['いきなり 2025/03/15', ['', '2025/03/15']]]) {
    const { browser, page, logs } = await open()
    const p = await cellPos(page, 1, '受注日', S)
    await page.mouse.click(p.x, p.y)
    const d0 = await cellText(page, 1, '受注日', S)
    if (keys[0]) await page.keyboard.press(keys[0])
    await page.waitForTimeout(200)
    const inp = await page.evaluate(() => { const a = document.activeElement; return a && a.tagName === 'INPUT' ? { type: a.type, val: a.value } : a?.className })
    await page.keyboard.type(keys[1])
    await page.waitForTimeout(100)
    const mid = await page.evaluate(() => { const a = document.activeElement; return a && a.tagName === 'INPUT' ? { type: a.type, val: a.value } : a?.className })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(300)
    console.log(label, 'before', d0, 'input', JSON.stringify(inp), 'typed', JSON.stringify(mid), 'after', await cellText(page, 1, '受注日', S))
    if (logs.length > 1) console.log(logs.join('\n'))
    await browser.close()
  }
})()
