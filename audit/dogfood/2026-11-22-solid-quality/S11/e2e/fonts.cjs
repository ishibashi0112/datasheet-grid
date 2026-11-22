const { open } = require('./lib.cjs')
;(async () => {
  for (const [name, url, extra] of [['solid', 'http://localhost:5511/min/index.html'], ['react', 'http://localhost:5508/'], ['solid-portal', 'http://localhost:5511/?popup=shadow&noframe=1']]) {
    const { browser, page } = await open()
    await page.goto(url); await page.waitForTimeout(1500)
    if (name === 'solid-portal') {
      // ページの html { font-size: 20px } / body { line-height: 2; font-family: Georgia }
    } else {
      await page.addStyleTag({ content: 'html { font-size: 20px } body { line-height: 2; font-family: Georgia, serif; letter-spacing: .05em }' })
    }
    await page.waitForTimeout(300)
    const r = await page.evaluate(() => {
      const roots = [document.querySelector('min-grid, stock-widget')?.shadowRoot, document.querySelector('#plain')].filter(Boolean)
      return roots.map((root, i) => {
        const f = (sel) => { const el = root.querySelector(sel); if (!el) return '-'; const cs = getComputedStyle(el); return `${cs.fontFamily.slice(0, 22)} ${cs.fontSize}/${cs.lineHeight}` }
        const rowH = root.querySelector('[role=row][data-row-index="0"]')?.getBoundingClientRect().height
        return `${i === 0 ? 'shadow' : 'plain '} root: ${f('.ssg-root')} | 見出し: ${f('.ssg-header-cell')} | セル: ${f('.ssg-body-cell')} | バー: ${f('.ssg-bar--bottom')} | 行の高さ ${rowH}`
      }).join('\n')
    })
    console.log(`--- ${name}\n${r}`)
    await browser.close()
  }
})()
