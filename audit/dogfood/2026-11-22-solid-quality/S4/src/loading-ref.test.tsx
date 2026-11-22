// <Loading> の中のグリッドに、親の最初の createEffect / onSettled から保存した状態を戻す
import { describe, expect, it } from 'vitest'
import { createEffect, onSettled } from 'solid-js'
import { render, waitFor } from '@solidjs/testing-library'
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { AsyncInventory, createFakeServer } from './AsyncInventory'
import { makeItems, type Item } from './inventory'

const rowKeys = (c: HTMLElement) => [...c.querySelectorAll('[data-pane="center"].ssg-body-row')].map((r) => r.getAttribute('data-row-key'))

// S4-23: <Loading> の中で行が来る前に親の最初の createEffect / onSettled からハンドルを呼ぶと、黙って捨てられる。直ったら it.fails を外す
describe('<Loading> の中のグリッドへ最初に状態を戻す', () => {
  for (const when of ['createEffect', 'onSettled'] as const) {
    it.fails(when, async () => {
      const server = createFakeServer({ A: makeItems(5) })
      const log: string[] = []
      let grid!: SpreadsheetGridHandle<Item>
      const { container } = render(() => {
        const restore = () => {
          try {
            grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
            grid.selectCell(2, 1)
            log.push(`${when}: ok sort=${JSON.stringify(grid.getState().sort)} active=${JSON.stringify(grid.getActiveCell())}`)
          } catch (e) {
            log.push(`${when}: THROWS ${(e as Error).message}`)
          }
        }
        if (when === 'createEffect') createEffect(() => true, restore)
        else onSettled(restore)
        return <AsyncInventory api={server.api} category="A" ref={(h) => (grid = h)} />
      })
      await waitFor(() => expect(rowKeys(container)).toHaveLength(5))
      await new Promise((r) => setTimeout(r, 50))
      console.log(when, log.join(' | '), '→ after load: sort', JSON.stringify(grid.getState().sort), 'active', JSON.stringify(grid.getActiveCell()), 'order', rowKeys(container).join(','))
      expect(grid.getState().sort).toEqual([{ columnKey: 'qty', direction: 'desc' }])
      expect(rowKeys(container)[0]).toBe('5')
    })
  }
})
