const { open, shot, wait } = require('./lib.cjs')
;(async () => {
  const url = process.argv[2] ?? 'http://localhost:5407/'
  const { browser, page, logs, loadMs } = await open(url)
  console.log('loadMs', loadMs)
  await wait(1500)
  console.log('perf', await page.evaluate(() => JSON.stringify(window.__perf)))
  await shot(page, 'smoke-' + (process.argv[3] ?? 'dev'))
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('[data-pane="center"].ssg-body-row').length,
    ariaRowcount: document.querySelector('[role=grid]')?.getAttribute('aria-rowcount'),
    scrollH: document.querySelector('.ssg-scroll-container')?.scrollHeight,
  }))
  console.log(info)
  console.log(logs.join('\n'))
  await browser.close()
})()
