// prefers-reduced-motion と forcedColors
const crypto = require('crypto'); const { launch, cell } = require('./lib.cjs')
;(async () => {
  for (const media of [{ reducedMotion: 'reduce' }, { forcedColors: 'active' }, { colorScheme: 'dark' }]) {
    const hashes = {}
    for (const base of ['http://localhost:5506/react/', 'http://localhost:5506/solid/']) {
      const tag = base.includes('react') ? 'react' : 'solid'
      const { browser, page } = await launch({})
      await page.emulateMedia(media)
      await page.goto(base); await page.waitForTimeout(1200)
      await cell(page, 2, 'item').click(); await page.keyboard.press('Shift+ArrowDown'); await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(400)
      const info = await page.evaluate(() => {
        const root = document.querySelector('.grid-area .ssg-root')
        const portalsOff = [...document.querySelectorAll('.ssg-motion-off')].length
        const act = document.querySelector('[class*=active-cell]')
        const sel = document.querySelector('[class*=selection]')
        const cs = (e) => e ? (({ transitionDuration, animationName, outlineStyle, outlineColor, borderTopColor, backgroundColor, forcedColorAdjust }) => ({ transitionDuration, animationName, outlineStyle, outlineColor, borderTopColor, backgroundColor, forcedColorAdjust }))(getComputedStyle(e)) : null
        return { rootCls: root.className, motionOff: portalsOff, active: act && act.className, activeCs: cs(act), selCls: sel && sel.className, selCs: cs(sel) }
      })
      // メニューも開く
      await cell(page, 3, 'value').click({ button: 'right' }); await page.waitForTimeout(400)
      const menuCs = await page.evaluate(() => { const m = document.querySelector('[role=menu]'); return m ? [m.className, getComputedStyle(m).animationName, getComputedStyle(m).transitionDuration, getComputedStyle(m).borderTopStyle] : null })
      const shot = await page.screenshot({ path: `shot-media-${Object.values(media)[0]}-${tag}.png`, clip: { x: 0, y: 0, width: 900, height: 420 } })
      hashes[tag] = crypto.createHash('md5').update(shot).digest('hex').slice(0, 8)
      console.log(JSON.stringify(media), tag, JSON.stringify(info), JSON.stringify(menuCs))
      await browser.close()
    }
    console.log('  screenshots identical:', hashes.react === hashes.solid, JSON.stringify(hashes))
  }
})()
