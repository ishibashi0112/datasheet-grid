const { open, cell, clickCell, rows, shot, ime } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page, logs, cdp } = await open(url)
  const out = []
  const act = () => page.evaluate(() => { const a = document.activeElement; return `${a?.tagName}.${a?.className}` })
  await page.evaluate(() => {
    window.__keys = []
    window.addEventListener('keydown', (e) => window.__keys.push(`${e.key}:${e.isComposing}:${e.keyCode}`), true)
  })
  // 変換中に別のセルを押す → 何も入らず、エディタも開かない
  await clickCell(page, 0, 'memo')
  await cdp.send('Input.imeSetComposition', { text: 'あいう', selectionStart: 3, selectionEnd: 3 })
  await page.waitForTimeout(100)
  await clickCell(page, 2, 'memo')
  await page.waitForTimeout(200)
  out.push(['click during composition', (await rows(page))[0].memo, (await rows(page))[2].memo, await page.evaluate(() => !!document.querySelector('.ssg-cell-editor')), await act(), await page.evaluate(() => document.querySelector('[data-ssg-ime-input]').value)])
  // その後ふつうに打てるか
  await ime(cdp, page, 'ほん', '本')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  out.push(['after', (await rows(page))[2].memo])
  // 変換中の Enter(isComposing)は確定に使わない: 編集中の摘要で
  await clickCell(page, 4, 'memo')
  await ime(cdp, page, 'けーぶる', 'ケーブル')
  await cdp.send('Input.imeSetComposition', { text: 'こうにゅう', selectionStart: 5, selectionEnd: 5 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
  out.push(['enter during composition', await page.evaluate(() => ({ open: !!document.querySelector('.ssg-cell-editor'), value: document.querySelector('.ssg-cell-editor textarea')?.value })), await page.evaluate(() => window.__keys.slice(-2))])
  await cdp.send('Input.insertText', { text: '購入' })
  await page.waitForTimeout(100)
  // 複数行: Alt+Enter で改行
  await page.keyboard.press('Alt+Enter')
  await ime(cdp, page, 'にほん', '2本')
  out.push(['multiline value', await page.evaluate(() => document.querySelector('.ssg-cell-editor textarea')?.value)])
  await shot(page, 'ime-multiline')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  out.push(['committed', JSON.stringify((await rows(page))[4].memo)])
  out.push(['row height after', await page.evaluate(() => { const r = document.querySelector('[role=row][aria-rowindex="6"]'); return r?.getBoundingClientRect().height })])
  // 最終列で Tab → グリッドの外へ
  await clickCell(page, 0, 'receipt')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(100)
  out.push(['tab out', await act()])
  // handle.focus() で入力受けへ戻る
  await page.evaluate(() => window.__grid.focus())
  out.push(['focus()', await act()])
  for (const o of out) console.log(JSON.stringify(o))
  console.log('--- logs')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('what it means') && !l.includes('agent repair') && !l.includes('deeper evidence') && !l.startsWith('  ')).join('\n'))
  await browser.close()
})()
