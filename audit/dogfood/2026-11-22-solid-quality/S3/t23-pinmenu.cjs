// 列メニューの「列の固定」の小メニューを開いたまま、別の列のメニューへ移って戻る
// 使い方: node t23-pinmenu.cjs <url> <label> <列名A> <列名B>
const { open, sleep } = require('./lib.cjs')
const url = process.argv[2], label = process.argv[3], A = process.argv[4] ?? '価格', B = process.argv[5] ?? 'ブランド'
;(async () => {
  const { browser, page, logs } = await open(url)
  await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(800)
  const panels = () => page.evaluate(() => [...document.querySelectorAll('.ssg-menu-panel')].map((p) => `${p.className.replace(/ssg-theme-\S+/g, '').trim()}[${[...p.querySelectorAll('.ssg-menu-item')].map((i) => i.textContent.trim()).join('|').slice(0, 70)}]`))
  const openMenu = async (title) => {
    const hdr = page.locator('.ssg-header-cell', { hasText: title }).first()
    await hdr.hover(); await sleep(100)
    await hdr.locator('.ssg-icon-btn').last().click(); await sleep(350)
  }
  await openMenu(A)
  console.log(`[${label}] 1 menu ${A}:`, await panels())
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '列の固定' }).first().click(); await sleep(350)
  console.log(`[${label}] 2 pin submenu open:`, await panels())
  await page.screenshot({ path: `${__dirname}/shots/t23-${label}-1.png` })
  await openMenu(B)
  console.log(`[${label}] 3 menu ${B}:`, await panels())
  await page.screenshot({ path: `${__dirname}/shots/t23-${label}-2.png` })
  await openMenu(A)
  console.log(`[${label}] 4 back to ${A}:`, await panels())
  await page.screenshot({ path: `${__dirname}/shots/t23-${label}-3.png` })
  // キーボードでも: 小メニューを開いて Escape で親へ、別の列へ
  await page.keyboard.press('Escape'); await sleep(200)
  await page.keyboard.press('Escape'); await sleep(200)
  console.log(`[${label}] 5 after Esc x2:`, await panels())
  // 小メニューを開いたまま、同じ列の ⋮ をもう一度押す
  await openMenu(A)
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '列の固定' }).first().click(); await sleep(300)
  await page.locator('.ssg-menu-panel .ssg-menu-item', { hasText: '左に固定' }).first().hover(); await sleep(150)
  await openMenu(B)
  await page.keyboard.press('Escape'); await sleep(250)
  await openMenu(A)
  console.log(`[${label}] 6 open pin, switch to ${B}, Esc, reopen ${A}:`, await panels())
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('HUGE_FAN') && !l.includes('STRICT_READ')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
