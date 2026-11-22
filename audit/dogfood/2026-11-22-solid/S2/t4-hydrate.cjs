const { launch, BASE } = require('./lib.cjs')
;(async () => {
  const { browser, page, logs } = await launch()
  await page.addInitScript(() => {
    window.__removed = []
    document.addEventListener('DOMContentLoaded', () => {
      window.__ssrRoot = document.querySelector('.ssg-root')
      window.__ssrHeader = document.querySelector('[role="columnheader"][data-ssg-col-key="name"]')
      window.__ssrSkel = document.querySelector('[data-skeleton-row]')
      window.__ssrNav = document.querySelector('.nav')
      window.__ssrHtmlLen = document.getElementById('app').innerHTML.length
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && (n.classList?.contains('ssg-root') || n.querySelector?.('.ssg-root'))) window.__removed.push(n.className)
      }).observe(document.body, { childList: true, subtree: true })
    })
  })
  const url = process.argv[2] ?? '/users?sort=logins.desc&q=eng'
  await page.goto(BASE + url)
  await page.waitForTimeout(2500)
  const r = await page.evaluate(() => ({
    sameRoot: window.__ssrRoot === document.querySelector('.ssg-root'),
    sameHeader: window.__ssrHeader === document.querySelector('[role="columnheader"][data-ssg-col-key="name"]'),
    sameNav: window.__ssrNav === document.querySelector('.nav'),
    roots: document.querySelectorAll('.ssg-root').length,
    removed: window.__removed,
    ssrHtmlLen: window.__ssrHtmlLen,
    hk: document.querySelectorAll('[_hk]').length,
    sortHeader: document.querySelector('[data-ssg-col-key="logins"][role="columnheader"]')?.getAttribute('aria-sort'),
    globalInput: document.querySelector('input[aria-label="Filter all columns"]')?.value,
  }))
  console.log(JSON.stringify(r, null, 1))
  console.log(logs.join('\n'))
  await browser.close()
})()
