// 読み込みの失敗と <Errored> の再試行
const { open, clickCell, getCell, setSettings, shot, sleep } = require('./lib.cjs')
const [loadMode = 'deferred', when = 'switch'] = process.argv.slice(2)
;(async () => {
  const { browser, page, logs } = await open()
  await setSettings(page, { loadMode, saveMode: 'onFlush', fill: false })
  const st = async (label) => console.log(label.padEnd(12), JSON.stringify(await page.evaluate(() => ({ path: location.pathname, error: document.querySelector('.panel-error')?.textContent ?? null, grid: !!document.querySelector('[role=grid][aria-label="タスク"]'), first: document.querySelector('[role=grid][aria-label="タスク"] [data-row-key]')?.getAttribute('data-row-key') ?? null, loading: !!document.querySelector('.panel-loading') }))))
  if (when === 'first') {
    await page.goto('http://localhost:5507/')
    await page.evaluate(() => (window.__api.failNextLoad = 1)) // ページを開き直すと消えるので、URL で失敗率 1 にする
    await page.goto('http://localhost:5507/projects/web?minDelay=300&maxDelay=300&loadFail=1&saveFail=0')
    await sleep(1500); await st('最初の読み込みで失敗')
    await page.evaluate(() => (window.__api.loadFailRate = 0))
    await page.click('.panel-error button'); await sleep(200); await st('再試行 200ms'); await sleep(1200); await st('再試行の後')
  } else {
    await page.goto('http://localhost:5507/projects/web?minDelay=600&maxDelay=600&loadFail=0&saveFail=0')
    await page.waitForSelector('[role=grid][aria-label="タスク"] [data-row-key="web-1"]')
    await page.evaluate(() => (window.__api.failNextLoad = 1))
    await page.click('a[data-project=app]'); await sleep(200); await st('切替 200ms'); await sleep(1000); await st('切替の後')
    await shot(page, `errored-${loadMode}`)
    if (await page.$('.panel-error button')) { await page.click('.panel-error button'); await sleep(200); await st('再試行 200ms'); await sleep(1200); await st('再試行の後') }
    await page.click('a[data-project=web]'); await sleep(1500); await st('web へ')
    await clickCell(page, 'タスク', 'web-1', 'estimate'); await page.keyboard.type('4'); await page.keyboard.press('Enter'); await sleep(1500)
    console.log('編集', await getCell(page, 'タスク', 'web-1', 'estimate'))
  }
  console.log('--- console'); console.log(logs.filter((l) => !l.includes('[vite]')).map((l) => l.split('\n')[0]).join('\n'))
  await browser.close()
})()
