const { open, text } = require('./lib.cjs')
;(async () => {
  for (const mode of ['store', 'snapshot']) {
    const { browser, page, logs } = await open(`http://localhost:5501/min-store.html?mode=${mode}`)
    const info = async () => page.evaluate(() => ({ firstCell: document.querySelector('[role="row"][aria-rowindex="2"] [aria-colindex="2"]')?.textContent, rowCountAttr: document.querySelector('[role="grid"]')?.getAttribute('aria-rowcount'), bar: document.querySelector('.ssg-bottom-bar, [class*="bottom"]')?.textContent?.slice(0, 30) }))
    console.log(mode, 'init', JSON.stringify(await info()))
    for (const k of ['field', 'push', 'splice']) {
      await page.evaluate((k) => window.mutate(k), k)
      await page.waitForTimeout(250)
      console.log(mode, k, JSON.stringify(await info()))
    }
    const errs = logs.filter((l) => /error|warning/.test(l)).map((l) => l.split('\n')[0].slice(0, 120))
    console.log(mode, 'logs', [...new Set(errs)])
    await browser.close()
  }
})()
