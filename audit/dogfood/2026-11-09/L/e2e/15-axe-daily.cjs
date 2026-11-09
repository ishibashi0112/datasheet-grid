const fs = require('fs'); const path = require('path')
const { launch, iphone, BASE } = require('./lib.cjs')
const axeSrc = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')
async function runAxe(page, label) {
  await page.evaluate(axeSrc)
  const res = await page.evaluate(async () => { const r = await window.axe.run(document.querySelector('.ssg-root')); return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes.slice(0, 2).map((n) => n.html.slice(0, 140) + ' → ' + n.any.concat(n.all, n.none).map((c) => c.message).join('|').slice(0, 160)) })) })
  console.log(`=== ${label}`); for (const v of res) console.log(`- ${v.id} [${v.impact}] x${v.n}\n   ${v.ex.join('\n   ')}`)
}
;(async () => {
  const { browser, page } = await launch({ viewport: { width: 1100, height: 700 }, locale: 'ja-JP' })
  await page.goto(BASE + '#daily'); await page.waitForSelector('.ssg-body-row'); await page.waitForTimeout(1000)
  await runAxe(page, 'daily-top')
  await page.evaluate(() => { document.querySelector('.ssg-scroll-container').scrollTop = 600 }); await page.waitForTimeout(500)
  await runAxe(page, 'daily-scrolled-sticky')
  await browser.close()
})()
