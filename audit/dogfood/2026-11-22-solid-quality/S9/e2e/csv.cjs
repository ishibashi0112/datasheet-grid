const fs = require('fs')
const path = require('path')
const { open, cell, clickCell, rows, shot } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] || 'http://localhost:5509/'
  const { browser, page, logs } = await open(url)
  const out = []
  // 摘要に数式に見える文字を貼る
  const memos = ['=SUM(A1:A3)', '+81 90 1234', '-部長立替', '@channel 共有', '\t先頭タブ', '-5']
  await page.evaluate((t) => navigator.clipboard.writeText(t), memos.map((m) => (m.includes('\t') ? `"${m}"` : m)).join('\r\n') + '\r\n')
  await clickCell(page, 0, 'memo')
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(300)
  out.push(['memos', (await rows(page)).map((r) => r.memo)])
  // 金額に負の数(-1200)
  await clickCell(page, 5, 'amount')
  await page.keyboard.type('-1200')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  const dl = page.waitForEvent('download')
  await page.click('[data-testid=csv]')
  const d = await dl
  const file = path.join(__dirname, '..', 'shots', 'expense.csv')
  await d.saveAs(file)
  const buf = fs.readFileSync(file)
  out.push(['filename', d.suggestedFilename(), 'bom', buf.slice(0, 3).toString('hex')])
  console.log(buf.toString('utf8').replace(/^﻿/, ''))
  // 生の exportCsv(escapeFormulas なし)と比べる
  out.push(['plain', await page.evaluate(() => window.__grid.exportCsv({ includeTotalRow: true }).split('\r\n').slice(0, 3))])
  // コピー(Ctrl+C)の TSV は escapeFormulas なし
  for (const o of out) console.log(JSON.stringify(o))
  console.log('--- logs')
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('what it means') && !l.includes('agent repair') && !l.includes('deeper evidence') && !l.startsWith('  ')).join('\n'))
  await browser.close()
})()
