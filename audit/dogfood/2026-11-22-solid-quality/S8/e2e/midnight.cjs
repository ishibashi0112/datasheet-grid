// 深夜 0 時をまたぐ(page.clock)。相対の期間のフィルターが次の日へ追従するか
const { open, shot } = require('./lib.cjs')
const BASE = process.env.BASE ?? 'http://localhost:3508'
const snap = (page) => page.evaluate(() => {
  const bar = document.querySelector('.ssg-bar--top .ssg-bar-chip')?.textContent.trim()
  const left = [...document.querySelectorAll('[data-pane="left"][role="row"][data-row-index]')].map((r) => r.textContent.trim()).filter((t) => /\d{4}\//.test(t))
  const center = [...document.querySelectorAll('[data-pane="center"][role="row"][data-row-index]')].slice(0, 2).map((r) => r.textContent.trim().slice(0, 40))
  return { bar, first: left[0], last: left[left.length - 1], n: left.length, center }
})
async function scenario(name, preset, startIso, steps, extra) {
  const { browser, page, logs } = await open({ timezoneId: 'Asia/Tokyo' })
  await page.clock.install({ time: new Date(startIso) })
  await page.goto(`${BASE}/?date=${preset}`)
  await page.waitForTimeout(1500)
  console.log(`\n== ${name}: ${preset} から ${startIso}`)
  console.log('  開いたとき', JSON.stringify(await snap(page)), await page.evaluate(() => new Date().toString()))
  if (extra) await extra.before?.(page)
  for (const [how, ms] of steps) {
    if (how === 'runFor') await page.clock.runFor(ms)
    else if (how === 'fastForward') await page.clock.fastForward(ms)
    else if (how === 'focus') await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')) })
    await page.waitForTimeout(800)
    console.log(`  ${how} ${ms}ms 後`, JSON.stringify(await snap(page)), await page.evaluate(() => new Date().toLocaleString('ja-JP')))
  }
  if (extra) await extra.after?.(page)
  await shot(page, `midnight-${name}`)
  const errs = logs.filter((l) => !l.includes('[vite]'))
  if (errs.length) console.log('  logs:', errs.map((l) => l.slice(0, 200)).join('\n   '))
  await browser.close()
}
;(async () => {
  const only = process.env.ONLY
  const run = (n) => !only || only.split(',').includes(n)
  if (run('today')) await scenario('today', 'today', '2026-11-22T23:59:00+09:00', [['runFor', 30_000], ['runFor', 60_000], ['runFor', 60_000]])
  if (run('today-ff')) await scenario('today-ff', 'today', '2026-11-22T23:59:00+09:00', [['fastForward', 3 * 3600_000], ['focus', 0]])
  if (run('month')) await scenario('month', 'thisMonth', '2026-11-30T23:59:30+09:00', [['runFor', 60_000]])
  if (run('last30')) await scenario('last30', 'last30days', '2026-11-22T23:59:30+09:00', [['runFor', 60_000]])
  if (run('popover')) await scenario('popover', 'today', '2026-11-22T23:59:30+09:00', [['runFor', 60_000]], {
    before: async (page) => {
      // 日付の列のフィルターを開いたまま 0 時をまたぐ
      await page.locator('[role=columnheader][data-ssg-col-key="date"]').hover()
      await page.locator('button[aria-label="日付 の列メニュー"]').click()
      await page.locator('[role=menu] [role^=menuitem]', { hasText: 'フィルター…' }).first().click()
      await page.waitForTimeout(500)
      console.log('  開いたポップアップ:', await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-popover')].map((e) => e.querySelector('.ssg-filter-presets')?.innerHTML.replace(/<[^>]+>/g, ' ') + ' / ' + e.querySelector('.ssg-filter-meta')?.textContent + ' / ' + e.querySelector('.ssg-filter-summary')?.textContent)))
    },
    after: async (page) => {
      console.log('  後のポップアップ:', await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-popover')].map((e) => e.querySelector('.ssg-filter-presets')?.innerHTML.replace(/<[^>]+>/g, ' ') + ' / ' + e.querySelector('.ssg-filter-meta')?.textContent + ' / ' + e.querySelector('.ssg-filter-summary')?.textContent + ' / ' + [...e.querySelectorAll('.ssg-filter-option-label')].map((x) => x.textContent).join(','))))
      // 値の木を開いて、今日の日付の候補を見る
      const toggle = page.locator('.ssg-filter-popover .ssg-filter-tree-toggle').first()
      if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(200); await page.locator('.ssg-filter-popover .ssg-filter-tree-toggle').nth(1).click().catch(() => {}); await page.waitForTimeout(200) }
      console.log('  木:', await page.evaluate(() => [...document.querySelectorAll('.ssg-filter-popover .ssg-filter-option')].map((x) => x.textContent.trim() + (x.querySelector('input')?.checked ? '[x]' : x.querySelector('input')?.indeterminate ? '[-]' : '[ ]')).join(', ')))
    },
  })
  if (run('editing')) await scenario('editing', 'today', '2026-11-22T23:59:30+09:00', [['runFor', 60_000]], {
    before: async (page) => {
      // 用途のセルを打ちかけのまま 0 時をまたぐ
      const cell = page.locator('[data-pane="center"][role="row"][data-row-index="0"] [role="gridcell"]').nth(5)
      await cell.dblclick()
      await page.keyboard.type('打ちかけ')
      console.log('  編集中:', await page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.value ?? '')))
    },
    after: async (page) => {
      console.log('  後:', await page.evaluate(() => document.activeElement?.tagName + ' ' + (document.activeElement?.value ?? '')))
      await page.keyboard.press('Enter')
      await page.waitForTimeout(300)
      console.log('  確定後:', JSON.stringify(await snap(page)))
    },
  })
})()
