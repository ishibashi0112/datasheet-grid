// ?async の株価: 取り直しの間にメモを編集して確定する
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
const extra = process.argv[3] ?? ''
;(async () => {
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?async&tab=stocks&mode=off&delay=4000${extra}`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 30000 }); await sleep(800)
  const snap = () => page.evaluate(() => ({
    pending: document.querySelector('[data-testid=pending]')?.textContent,
    first: [...document.querySelectorAll('.ssg-body-row[data-pane=center]')].filter((r) => r.dataset.rowKey).sort((a, b) => +a.dataset.rowIndex - +b.dataset.rowIndex)[0]?.dataset.rowKey,
    editors: document.querySelectorAll('.ssg-cell-editor').length,
    focus: document.activeElement?.tagName + '.' + String(document.activeElement?.className).slice(0, 25),
    value: document.activeElement?.value,
    memo1308: [...document.querySelectorAll('.ssg-body-row[data-row-key="1308"] [data-ssg-col-key="memo"]')].map((c) => c.textContent).join(),
    top: document.querySelector('.ssg-bar--top')?.innerText.replace(/\s+/g, ' ').slice(0, 30),
  }))
  await page.locator('.ssg-body-row[data-pane="center"][data-row-key="1308"] [data-ssg-col-key="memo"]').click(); await sleep(200)
  await page.keyboard.type('watch'); await sleep(200)
  console.log(`[${label}] editing:`, JSON.stringify(await snap()))
  await page.evaluate(() => window.__setMarket('nyse')); await sleep(500)
  console.log(`[${label}] pending:`, JSON.stringify(await snap()))
  await page.keyboard.type('-list'); await page.keyboard.press('Enter'); await sleep(500)
  console.log(`[${label}] after Enter (pending):`, JSON.stringify(await snap()))
  await sleep(4500)
  console.log(`[${label}] after land:`, JSON.stringify(await snap()))
  await page.evaluate(() => window.__setMarket('tse')); await sleep(5000)
  console.log(`[${label}] back to tse:`, JSON.stringify(await snap()))
  console.log(`[${label}] fetches:`, (await page.evaluate(() => window.__fetches)).join(' | '))
  console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0].slice(0, 200)).join('\n'))
  await browser.close()
})()
