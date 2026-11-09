// Next.js 15 Pages Router + React 18.3: SSR の HTML、ハイドレーション、操作、コンソール
const { chromium } = require('playwright')
const BASE = process.env.BASE ?? 'http://localhost:3411'
const MODE = process.env.MODE ?? 'dev'
const shotDir = __dirname + '/shots'
require('fs').mkdirSync(shotDir, { recursive: true })

;(async () => {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const report = {}
  const page = await context.newPage()
  let logs = []
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  const takeLogs = () => { const l = logs; logs = []; return l.filter((x) => !/Download the React DevTools|\[HMR\]|Fast Refresh|webpack-hmr/.test(x)) }

  // 1. SSR の HTML(JS なし)
  const raw = await (await fetch(BASE + '/')).text()
  report.ssrHtml = {
    hasGrid: raw.includes('ssg-root'),
    centerRowsInHtml: (raw.match(/data-pane="center"[^>]*ssg-body-row/g) || []).length,
    leftRows: (raw.match(/data-pane="left"[^>]*ssg-body-row/g) || []).length,
    gridcells: (raw.match(/role="gridcell"/g) || []).length,
    hasStyleLink: /\.css/.test(raw),
    themeClass: raw.includes('ssg-theme-class'),
  }

  // 2. 開いてハイドレーション
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row [role="gridcell"]')
  report.index = { logs: takeLogs() }
  await page.screenshot({ path: `${shotDir}/${MODE}-index.png` })

  // 3. 操作: セルを押して打つ、Enter
  const cell = (r, key) => page.locator(`[data-pane="center"].ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)
  await cell(0, 'name').click()
  await page.keyboard.type('Pen')
  await page.keyboard.press('Enter')
  report.edit = await cell(0, 'name').innerText()
  // 数量に 12 を打って金額と合計行
  await cell(1, 'qty').click()
  await page.keyboard.type('12')
  await page.keyboard.press('Enter')
  report.amount = await cell(1, 'amount').innerText()
  report.totalRowText = await page.locator('.ssg-total-row').first().innerText().catch(() => null)
  // 範囲選択とコピー
  await cell(0, 'name').click()
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowRight'); await page.keyboard.up('Shift')
  await page.keyboard.press('Control+c')
  report.clipboard = await page.evaluate(() => navigator.clipboard.readText())
  // 貼り付け
  await page.evaluate(() => navigator.clipboard.writeText('7\t1,500'))
  await cell(3, 'qty').click()
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(100)
  report.paste = [await cell(3, 'qty').innerText(), await cell(3, 'price').innerText()]
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(100)
  report.undo = [await cell(3, 'qty').innerText(), await cell(3, 'price').innerText()]
  // 列メニューから降順 → URL のクエリ
  await page.getByRole('button', { name: '在庫数 の列メニュー' }).click({ force: true })
  await page.getByRole('button', { name: /降順で並び替え/ }).click()
  await page.waitForTimeout(300)
  report.urlAfterSort = page.url()
  report.firstRowQty = await cell(0, 'qty').innerText()
  // 行を追加(startEditing)
  await page.getByRole('button', { name: '行を追加' }).click()
  await page.waitForTimeout(200)
  report.addLog = await page.getByTestId('log').innerText()
  report.editorOpen = await page.locator('.ssg-cell-editor').count()
  report.activeElement = await page.evaluate(() => document.activeElement?.className)
  await page.keyboard.type('新規品')
  await page.keyboard.press('Enter')
  report.count = await page.getByTestId('count').innerText()
  // 末尾へ(scrollToRow)・グリッドへ(focus)・キー操作
  await page.getByRole('button', { name: '末尾へ' }).click()
  await page.waitForTimeout(300)
  report.afterScrollToEnd = await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); return { top: s.scrollTop, max: s.scrollHeight - s.clientHeight } })
  await page.getByRole('button', { name: 'グリッドへ' }).click()
  report.focusAfterButton = await page.evaluate(() => document.activeElement?.className)
  await page.keyboard.press('Control+Home')
  await page.waitForTimeout(100)
  report.afterCtrlHome = await page.evaluate(() => { const s = document.querySelector('.ssg-scroll-container'); const id = document.querySelector('.ssg-shell').getAttribute('aria-activedescendant'); const el = id && document.getElementById(id); return { top: s.scrollTop, active: el?.textContent, key: el?.getAttribute('data-ssg-col-key') } })
  await page.keyboard.press('PageDown')
  await page.keyboard.press('Control+End')
  await page.waitForTimeout(100)
  report.afterCtrlEnd = await page.evaluate(() => { const id = document.querySelector('.ssg-shell').getAttribute('aria-activedescendant'); const el = id && document.getElementById(id); return { active: el?.textContent, key: el?.getAttribute('data-ssg-col-key'), bar: document.querySelector('.ssg-bar--bottom')?.textContent } })
  // getState
  await page.getByRole('button', { name: '状態' }).click()
  report.state = await page.getByTestId('log').innerText()
  report.afterOps = takeLogs()
  await page.screenshot({ path: `${shotDir}/${MODE}-index-after.png` })

  // 4. URL のクエリから並べ替え(SSR から効くか)
  const rawSorted = await (await fetch(BASE + '/?sort=price.desc')).text()
  const firstSsrRowSku = (rawSorted.match(/data-pane="left"[^>]*data-row-index="0"[^>]*data-row-key="([^"]+)"/) || [])[1]
  report.ssrSorted = { firstSsrRowSku }
  await page.goto(BASE + '/?sort=price.desc', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row [role="gridcell"]')
  report.sortedPage = { firstPrice: await cell(0, 'price').innerText(), logs: takeLogs() }
  // ブラウザの戻る
  await page.goBack({ waitUntil: 'networkidle' })
  report.afterBack = { url: page.url(), logs: takeLogs() }

  // 5. 英語(SSG)
  await page.goto(BASE + '/en', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row [role="gridcell"]')
  report.en = { bar: await page.locator('.ssg-bar--top').innerText(), logs: takeLogs() }
  await page.screenshot({ path: `${shotDir}/${MODE}-en.png` })

  // 6. ダーク(theme="class" + html.dark をクライアントで付ける)
  await page.goto(BASE + '/dark', { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-pane="center"].ssg-body-row [role="gridcell"]')
  report.dark = {
    cellBg: await page.evaluate(() => getComputedStyle(document.querySelector('[data-pane="center"] .ssg-body-cell')).backgroundColor),
    logs: takeLogs(),
  }
  await page.screenshot({ path: `${shotDir}/${MODE}-dark.png` })

  // 7. 包む部品の ref(React 18)
  await page.goto(BASE + '/wrapper', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'ref を確かめる' }).click()
  report.wrapper = { out: await page.getByTestId('out').innerText(), logs: takeLogs() }

  console.log(JSON.stringify(report, null, 2))
  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
