// 下だけダーク: ポップアップ(列メニュー・フィルター・select エディタ・日付・右クリック)の色
const { open, clickCell, shot, sleep } = require('./lib.cjs')
const [qs = '?dark=1'] = process.argv.slice(2)
const bg = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('[role=menu], .ssg-filter-popover, .ssg-select-editor-popover, .ssg-date-editor-popover, [class*=popover], .ssg-tooltip, [class*=calendar]')].filter((e) => e.getBoundingClientRect().width > 0)
  return els.map((e) => { const cs = getComputedStyle(e); return `${e.className.toString().split(' ')[0]}:${cs.backgroundColor}/${cs.color}` }).join(' ; ')
})
async function menu(page, label, key) {
  await page.hover(`[role=grid][aria-label="${label}"] [role=columnheader][data-ssg-col-key=${key}]`)
  await page.click(`[role=grid][aria-label="${label}"] [role=columnheader][data-ssg-col-key=${key}] button[aria-haspopup=menu]`)
  await sleep(300)
}
;(async () => {
  const { browser, page, logs } = await open()
  await page.goto('http://localhost:5510/' + qs)
  await page.waitForSelector('[role=grid][aria-label="Orders"] [data-row-key="O00001"]')
  await clickCell(page, 'Orders', 'O00001', 'customer')
  await page.waitForSelector('[role=grid][aria-label="Lines"] [data-row-key="O00001-1"]')
  console.log('roots', await page.$$eval('.ssg-root', (r) => r.map((x) => `${x.getAttribute('data-ssg-theme') ?? x.className.match(/ssg-theme-\w+|dark|light/g)}:${getComputedStyle(x).backgroundColor}`).join(' | ')))
  await menu(page, 'Lines', 'status'); console.log('bottom column menu', await bg(page)); await shot(page, 'dark-menu-bottom'); await page.keyboard.press('Escape'); await sleep(200)
  await menu(page, 'Orders', 'status'); console.log('top column menu', await bg(page)); await shot(page, 'dark-menu-top'); await page.keyboard.press('Escape'); await sleep(200)
  // フィルターのポップオーバー(列メニューの Filter… から)
  await menu(page, 'Lines', 'product')
  const items = await page.$$eval('[role=menu] [role=menuitem]', (e) => e.map((x) => x.textContent.trim()))
  console.log('menu items', JSON.stringify(items))
  const f = items.find((t) => /filter/i.test(t))
  if (f) { await page.click(`[role=menu] [role=menuitem]:has-text("${f}")`); await sleep(400); console.log('bottom filter', await bg(page)); await shot(page, 'dark-filter-bottom'); await page.keyboard.press('Escape'); await sleep(300) }
  // select エディタ
  await clickCell(page, 'Lines', 'O00001-2', 'product', { double: true }); await sleep(400)
  console.log('bottom select editor', await bg(page)); await shot(page, 'dark-select-bottom'); await page.keyboard.press('Escape'); await sleep(200)
  await clickCell(page, 'Lines', 'O00001-2', 'date', { double: true }); await sleep(400)
  console.log('bottom date editor', await bg(page)); await shot(page, 'dark-date-bottom'); await page.keyboard.press('Escape'); await sleep(200)
  await clickCell(page, 'Orders', 'O00001', 'status', { double: true }); await sleep(400)
  console.log('top select editor', await bg(page)); await page.keyboard.press('Escape'); await sleep(200)
  // ツールチップ(下の見出し)
  await page.hover('[role=grid][aria-label="Lines"] [role=columnheader][data-ssg-col-key=status] .ssg-header-grip', { force: true }); await page.mouse.move(1, 1); await page.hover('[role=grid][aria-label="Lines"] [role=columnheader][data-ssg-col-key=status] .ssg-header-grip', { force: true }); await sleep(1200)
  console.log('bottom tooltip', await bg(page)); await shot(page, 'dark-tooltip-bottom')
  // ダークの切り替えをその場で
  await page.click('text=Dark lines'); await sleep(300)
  console.log('after toggle off', await page.$$eval('.ssg-root', (r) => r.map((x) => getComputedStyle(x).backgroundColor).join(' | ')))
  console.log(logs.filter((l) => !l.includes('[vite]') && !l.includes('RELAY_TEAR')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
