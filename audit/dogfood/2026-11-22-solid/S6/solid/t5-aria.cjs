// aria の属性と読み上げの木を React 版と比べる
const fs = require('fs'); const { launch, cell } = require('./lib.cjs')
;(async () => {
  const snaps = {}
  for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
    const tag = base.includes('react') ? 'react' : 'solid'
    const { browser, page } = await launch({})
    await page.goto(base); await page.waitForTimeout(1200)
    const attrs = async () => page.evaluate(() => [...document.querySelector('.grid-area .ssg-root').querySelectorAll('*')].filter((e) => e.getAttribute('role') || [...e.attributes].some((a) => a.name.startsWith('aria-')) || e.tagName === 'BUTTON' || e.tagName === 'INPUT' || e.hasAttribute('tabindex')).map((e) => e.tagName.toLowerCase() + ' ' + [...e.attributes].filter((a) => (a.name.startsWith('aria-') || a.name === 'role' || a.name === 'tabindex' || a.name.startsWith('data-ssg')) && !/^(aria-controls|aria-activedescendant|aria-owns|aria-describedby|aria-labelledby)$/.test(a.name)).map((a) => `${a.name}=${a.value}`).sort().join(' ')))
    snaps[tag] = { initial: await attrs() }
    snaps[tag].tree = await page.locator('.grid-area .ssg-root').ariaSnapshot()
    await page.locator('.ssg-body-row[data-row-index="0"] button[aria-expanded]').first().click(); await page.waitForTimeout(400)
    await cell(page, 2, 'item').click(); await page.keyboard.press('Shift+ArrowDown'); await page.waitForTimeout(300)
    snaps[tag].expanded = await attrs()
    snaps[tag].tree2 = await page.locator('.grid-area .ssg-root').ariaSnapshot()
    await cell(page, 3, 'result').dblclick(); await page.waitForTimeout(400)
    snaps[tag].editing = await attrs()
    snaps[tag].tree3 = await page.locator('.grid-area .ssg-root').ariaSnapshot()
    await page.keyboard.press('Escape')
    // ダイアログ
    await page.locator('#open-dialog').click(); await page.waitForTimeout(500)
    snaps[tag].dialog = await page.locator('dialog').ariaSnapshot()
    await browser.close()
  }
  fs.writeFileSync('aria-react.json', JSON.stringify(snaps.react, null, 1)); fs.writeFileSync('aria-solid.json', JSON.stringify(snaps.solid, null, 1))
  for (const k of Object.keys(snaps.react)) {
    const a = Array.isArray(snaps.react[k]) ? snaps.react[k] : snaps.react[k].split('\n'); const b = Array.isArray(snaps.solid[k]) ? snaps.solid[k] : snaps.solid[k].split('\n')
    const diff = []
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff.push(`  #${i}\n   R: ${a[i]}\n   S: ${b[i]}`)
    console.log(k, 'react', a.length, 'solid', b.length, 'diffs', diff.length); console.log(diff.slice(0, 8).join('\n'))
  }
})()
