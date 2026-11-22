// 最小の再現: 親から iframe の document へ描いた表(列の幅・フィルハンドル・ツールチップ・列メニューの矢印と Escape)
const { open, shot } = require('./lib.cjs')
const URL_ = process.env.URL ?? 'http://localhost:5511/min/portal.html'
const NAME = process.env.NAME ?? 'solid'
;(async () => {
  const { browser, page, logs } = await open({ viewport: { width: 900, height: 600 } })
  await page.goto(URL_); await page.waitForTimeout(2000)
  const fr = page.frames().find((f) => f !== page.mainFrame())
  const scope = page.frameLocator('#pf').locator('body')
  const cell = (r, c) => scope.locator(`[role="row"][data-row-index="${r}"] [role="gridcell"]`).nth(c)
  const out = []
  // 列の幅
  const hdr = scope.locator('[role=columnheader][data-ssg-col-key="name"]'); const h = await hdr.boundingBox()
  await page.mouse.move(h.x + h.width - 2, h.y + h.height / 2); await page.mouse.down(); await page.mouse.move(h.x + h.width + 50, h.y + h.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300)
  out.push(`列の幅 ${Math.round(h.width)}→${Math.round((await hdr.boundingBox()).width)}`)
  // フィルハンドル
  await cell(0, 1).click({ position: { x: 20, y: 14 } }); await page.waitForTimeout(200)
  const fh = scope.locator('.ssg-fill-handle').first()
  if (await fh.count()) { const f = await fh.boundingBox(); const t = await cell(2, 1).boundingBox(); await page.mouse.move(f.x + 3, f.y + 3); await page.mouse.down(); await page.mouse.move(t.x + 30, t.y + 14, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(400) }
  out.push(`フィル ${(await Promise.all([0, 1, 2].map(async (r) => (await cell(r, 1).textContent()).trim()))).join(',')}(元 0,10,20)`)
  // ツールチップ
  await page.mouse.move(5, 5); await page.waitForTimeout(300)
  await cell(2, 0).hover({ position: { x: 40, y: 14 } }); await page.waitForTimeout(900)
  out.push('ツールチップ ' + await fr.evaluate(() => { const t = document.querySelector('.ssg-tooltip'); return t ? (t.classList.contains('ssg-tooltip--visible') ? 'visible' : 'hidden') : 'なし' }))
  // 列メニュー
  await cell(1, 1).click({ position: { x: 20, y: 14 } })
  await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(400)
  const f1 = await fr.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 8))
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  const f2 = await fr.evaluate(() => document.activeElement?.textContent?.trim().slice(0, 8))
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  out.push(`列メニュー ${f1} →↓ ${f2} → Escape 後のメニュー ${await scope.locator('[role=menu]').count()}`)
  console.log(NAME, out.join(' | '))
  await shot(page, `min-portal-${NAME}`)
  console.log(logs.filter((l) => !/HUGE_FAN_OUT|subscribers|in <|at http|vite/.test(l)).join('\n'))
  await browser.close()
})()
