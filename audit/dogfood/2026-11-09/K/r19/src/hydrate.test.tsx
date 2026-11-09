// @vitest-environment jsdom
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { act } from '@testing-library/react'
import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { readFileSync, writeFileSync } from 'node:fs'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { App, variants } from './ssrFixture.mjs'

const html: Record<string, string> = JSON.parse(readFileSync(process.cwd() + '/ssr/server-html.json', 'utf8'))
const report: Record<string, { messages: string[]; centerCellsAfter: number }> = {}
let restore: () => void
beforeAll(() => {
  restore = installJsdomLayoutStubs()
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as never
})
afterAll(() => {
  restore()
  writeFileSync(process.env.HYDRATE_LOG ?? 'hydrate-log.json', JSON.stringify(report, null, 2))
})

for (const variant of Object.keys(variants)) {
  test(`hydrate ${variant}`, async () => {
    const messages: string[] = []
    const spyE = vi.spyOn(console, 'error').mockImplementation((...a) => messages.push('[error] ' + a.map(String).join(' ')))
    const spyW = vi.spyOn(console, 'warn').mockImplementation((...a) => messages.push('[warn] ' + a.map(String).join(' ')))
    const container = document.createElement('div')
    container.innerHTML = html[variant]
    document.body.appendChild(container)
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, createElement(App, { variant }), {
        onRecoverableError: (e: unknown) => messages.push('[recoverable] ' + String((e as Error)?.message ?? e)),
      })
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    const centerCells = container.querySelectorAll('[data-pane="center"].ssg-body-row [role="gridcell"]').length
    report[variant] = { messages, centerCellsAfter: centerCells }
    spyE.mockRestore(); spyW.mockRestore()
    act(() => root!.unmount())
    container.remove()
    expect(messages.filter((m) => /hydrat|did not match|recoverable/i.test(m))).toEqual([])
    expect(centerCells).toBeGreaterThan(0)
  })
}
