// @vitest-environment jsdom
import { expect, test } from 'vitest'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'

const snap = () => ({
  ch: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  cw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  gbcr: Element.prototype.getBoundingClientRect,
  ro: (globalThis as { ResizeObserver?: unknown }).ResizeObserver,
  st: Element.prototype.scrollTo,
  ownCh: Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'clientHeight'),
})
test('install → restore で元へ', () => {
  const before = snap()
  const restore = installJsdomLayoutStubs({ width: 800, height: 300 })
  const div = document.createElement('div')
  expect(div.clientHeight).toBe(300)
  expect(div.getBoundingClientRect().width).toBe(800)
  restore()
  const after = snap()
  process.stdout.write(`before ro=${typeof before.ro} after ro=${typeof after.ro}; ownCh before=${before.ownCh} after=${after.ownCh}; gbcr same=${before.gbcr === after.gbcr}; st same=${before.st === after.st}\n`)
  expect(document.createElement('div').clientHeight).toBe(0)
  expect(after.ro).toBe(before.ro)
  expect(after.gbcr).toBe(before.gbcr)
})
test('2 回 install → 逆順に restore', () => {
  const before = snap()
  const r1 = installJsdomLayoutStubs()
  const r2 = installJsdomLayoutStubs({ width: 500, height: 100 })
  expect(document.createElement('div').clientHeight).toBe(100)
  r2()
  expect(document.createElement('div').clientHeight).toBe(600)
  r1()
  expect(document.createElement('div').clientHeight).toBe(0)
  expect(snap().ro).toBe(before.ro)
})
test('2 回 install → 同じ順に restore(よくある間違い)', () => {
  const before = snap()
  const r1 = installJsdomLayoutStubs()
  const r2 = installJsdomLayoutStubs({ width: 500, height: 100 })
  r1()
  r2()
  process.stdout.write(`same-order restore: clientHeight=${document.createElement('div').clientHeight} ro restored=${snap().ro === before.ro}\n`)
})
