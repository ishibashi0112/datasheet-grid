// 各 URL を開いて、最初の描画のコンソールを集める: node t0-console.cjs <url>...
const { open, sleep } = require('./lib.cjs')
;(async () => {
  for (const url of process.argv.slice(2)) {
    const { browser, page, logs } = await open(url)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }).catch(() => logs.push('NO CELLS'))
    await sleep(1500)
    console.log('==', url)
    console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n').slice(0, 3).join(' / ')).join('\n') || '(なし)')
    await browser.close()
  }
})()
