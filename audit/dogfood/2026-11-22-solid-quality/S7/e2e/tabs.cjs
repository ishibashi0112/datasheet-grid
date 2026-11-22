// タブで 2 つのグリッドを切り替える
const { open, clickCell, getCell, activeInfo, setSettings, shot, sleep } = require('./lib.cjs')
const [tabMode = 'switch', loadMode = 'deferred'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode: 'onFlush', fill: false, tabMode })
  await page.goto('http://localhost:5507/projects/web?minDelay=400&maxDelay=400&loadFail=0&saveFail=0')
  await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
  const st = () => page.evaluate(() => ({
    grids: [...document.querySelectorAll('[role=grid]')].map((g) => g.getAttribute('aria-label')).join(','),
    roots: document.querySelectorAll('.ssg-root').length,
    portals: [...document.body.children].filter((e) => e.id !== 'root' && e.tagName !== 'SCRIPT').map((e) => e.className || e.tagName).join(','),
    focus: document.activeElement?.className,
  }))
  // 1. タスクの列メニューを開いたままタブを切り替える
  const hdr = await page.$('[role=grid][aria-label="タスク"] [role=columnheader][data-ssg-col-key="due"]')
  const hb = await hdr.boundingBox(); await page.mouse.move(hb.x + 20, hb.y + 10)
  await (await hdr.$('button')).click(); await sleep(200)
  console.log('列メニューを開いた', JSON.stringify(await st()))
  await page.click('[role=tab]:has-text("マイルストーン")'); await page.waitForSelector('[role=grid][aria-label="マイルストーン"] [data-row-key]'); await sleep(300)
  console.log('MS へ', JSON.stringify(await st()))
  // 2. マイルストーンで編集 → 元に戻す
  await clickCell(page, 'マイルストーン', 'web-m2', 'progress')
  await page.keyboard.type('55'); await page.keyboard.press('Enter'); await sleep(200)
  console.log('MS 編集', await getCell(page, 'マイルストーン', 'web-m2', 'progress'), await page.evaluate(() => document.querySelector('[data-testid=ms-status]')?.textContent))
  await sleep(800)
  await page.keyboard.press('Control+z'); await sleep(300)
  console.log('MS Ctrl+Z', await getCell(page, 'マイルストーン', 'web-m2', 'progress'))
  await page.keyboard.press('Control+y'); await sleep(300)
  console.log('MS Ctrl+Y', await getCell(page, 'マイルストーン', 'web-m2', 'progress'))
  // 3. 編集中にタブを切り替える
  await clickCell(page, 'マイルストーン', 'web-m3', 'name', { double: true })
  await page.keyboard.press('End'); await page.keyboard.type('!')
  await page.click('[role=tab]:has-text("タスク")'); await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key]'); await sleep(300)
  console.log('編集中にタスクへ', JSON.stringify(await st()))
  await page.click('[role=tab]:has-text("マイルストーン")'); await page.waitForSelector('[role=grid][aria-label="マイルストーン"] [data-row-key]'); await sleep(600)
  console.log('MS へ戻った', await getCell(page, 'マイルストーン', 'web-m3', 'name'), await getCell(page, 'マイルストーン', 'web-m2', 'progress'))
  // 4. 素早く 10 回切り替える
  for (let i = 0; i < 10; i++) { await page.click(`[role=tab]:has-text("${i % 2 ? 'マイルストーン' : 'タスク'}")`); await sleep(60) }
  await sleep(1500)
  console.log('10 回切り替えた', JSON.stringify(await st()))
  await shot(page, `tabs-${tabMode}`)
  // 5. 切り替えた後のタスクの表で編集できるか
  await page.click('[role=tab]:has-text("タスク")'); await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key]'); await sleep(500)
  await clickCell(page, 'タスク', 'web-1', 'estimate'); await page.keyboard.type('3'); await page.keyboard.press('Enter'); await sleep(1500)
  console.log('タスク編集', await getCell(page, 'タスク', 'web-1', 'estimate'), JSON.stringify(await st()))
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
