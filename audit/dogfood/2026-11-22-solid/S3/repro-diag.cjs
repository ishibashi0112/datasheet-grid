// diag.html を開いて操作し、コンソールの診断の種類を数える: node repro-diag.cjs <case>
const { open, sleep } = require('./lib.cjs')
;(async () => {
  const kase = process.argv[2]
  const { browser, page, logs } = await open(`http://127.0.0.1:5503/diag.html?case=${kase}`)
  await page.waitForSelector('.ssg-body-cell')
  await sleep(500)
  const c = page.locator('.ssg-body-row[data-pane=center] [data-ssg-col-key="note"]').nth(5)
  if (kase.startsWith('edit')) { await c.dblclick(); await sleep(200); await page.keyboard.type('abc', { delay: 300 }); await sleep(1500); await page.keyboard.press('Enter') }
  else { await c.click(); await sleep(3000) }
  await sleep(500)
  const diag = logs.filter((l) => /\[[A-Z_]{6,}\]/.test(l)).map((l) => l.split('\n')[0].slice(0, 160))
  console.log(kase, diag.length ? diag.join('\n  ') : '(診断なし)')
  await browser.close()
})()
