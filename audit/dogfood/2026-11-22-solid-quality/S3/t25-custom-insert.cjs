// custom エディタで打っている途中に上へ行が足されたとき(グループあり / なし、グループの先頭の行 / 2 行目)
// 使い方: node t25-custom-insert.cjs <label>
const { open, sleep } = require('./lib.cjs')
const label = process.argv[2] ?? 'x'
;(async () => {
  for (const [q, key] of [['', 'B1'], ['', 'B2'], ['&nogroup', 'B1'], ['&nogroup', 'B2']]) {
    const { browser, page, logs } = await open('http://127.0.0.1:5503/group.html?x' + q)
    await page.waitForSelector('.ssg-body-cell', { timeout: 15000 }); await sleep(600)
    await page.locator(`.ssg-body-row[data-pane="center"][data-row-key="${key}"] [data-ssg-col-key="city"]`).dblclick(); await sleep(300)
    await page.keyboard.press('Control+a'); await page.keyboard.type('abc'); await sleep(150)
    const m0 = await page.evaluate(() => window.__mounts)
    await page.evaluate(() => window.__insertTop()); await sleep(400)
    const st = await page.evaluate(() => ({ mounts: window.__mounts, value: document.activeElement?.value, focus: document.activeElement?.tagName }))
    await page.keyboard.type('d'); await page.keyboard.press('Enter'); await sleep(300)
    const saved = await page.evaluate((k) => window.__rows().find((r) => r.id === k).city, key)
    console.log(`[${label}] ${q || 'group'} ${key}: mounts ${m0}→${st.mounts} after insert value=${JSON.stringify(st.value)} focus=${st.focus} saved=${JSON.stringify(saved)}`)
    await browser.close()
  }
})()
