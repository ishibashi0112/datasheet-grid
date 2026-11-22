// ?async&tail: 末尾を追う(毎秒 50 行を足す)まま環境を切り替える
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
const extra = process.argv[3] ?? ''
;(async () => {
  const { browser, page, logs } = await open(`http://127.0.0.1:5505/?async&n=20000&tail&delay=2500${extra}`)
  await page.waitForSelector('.ssg-body-cell', { timeout: 30000 }); await sleep(2500)
  const snap = () => page.evaluate(() => `pending=${document.querySelector('[data-testid=pending]')?.textContent} count=${document.querySelector('[data-testid=logcount]')?.textContent} following=${document.querySelector('[data-testid=following]')?.textContent} atBottom=${window.__logGrid?.isAtBottom()}`)
  console.log(`[${label}] tailing:`, await snap())
  await page.selectOption('[data-testid=env]', 'stg')
  for (let i = 1; i <= 8; i++) { await sleep(1000); console.log(`[${label}]  +${i}s`, await snap()) }
  console.log(`[${label}] fetches:`, (await page.evaluate(() => window.__fetches)).join(' | '))
  console.log(logs.filter((l) => !l.includes('[vite]') && !/EFFECT_|STRICT/.test(l)).map((l) => l.split('\n')[0].slice(0, 160)).join('\n'))
  await browser.close()
})()
