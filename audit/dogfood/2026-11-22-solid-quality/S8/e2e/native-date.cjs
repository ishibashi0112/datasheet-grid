// 素の <input type="date"> に 2026 12 24 と打つ(ブラウザだけのふるまい)
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  for (const locale of ['ja-JP', 'en-US']) {
    const ctx = await browser.newContext({ locale })
    const page = await ctx.newPage()
    await page.setContent(`<input id=a type=date value="2026-10-01"> <input id=b type=date value="2026-10-01" max="9999-12-31">`)
    for (const id of ['a', 'b']) {
      await page.focus('#' + id)
      await page.keyboard.type('20261224')
      console.log(locale, id === 'a' ? 'max なし' : 'max=9999-12-31', await page.$eval('#' + id, (e) => e.value))
    }
    await ctx.close()
  }
  await browser.close()
})()
