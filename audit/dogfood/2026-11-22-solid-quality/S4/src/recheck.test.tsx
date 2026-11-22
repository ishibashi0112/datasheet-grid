// 前の所見の確かめ直し(S4-03 / S4-07 / S4-08 / S4-09)
import { describe, expect, it } from 'vitest'
import { flush } from 'solid-js'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { InventoryGrid } from './InventoryGrid'
import { makeItems, type Item } from './inventory'

const cellAt = (c: HTMLElement, rowKey: number, colIndex: number) =>
  c.querySelector<HTMLElement>(`[data-pane="center"].ssg-body-row[data-row-key="${rowKey}"] [aria-colindex="${colIndex}"]`)!

describe('確かめ直し', () => {
  it('S4-03: selectRange / applyState の直後の exportCsv(flush なし)', () => {
    let grid!: SpreadsheetGridHandle<Item>
    render(() => <InventoryGrid initialRows={makeItems(5)} ref={(h) => (grid = h)} />)
    grid.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } })
    const sel = grid.getSelection()
    const csv1 = grid.exportCsv({ scope: 'selection' })
    grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
    const firstLine = grid.exportCsv().split('\r\n')[1]
    flush()
    const firstLineAfter = grid.exportCsv().split('\r\n')[1]
    console.log('S4-03 getSelection', JSON.stringify(sel), 'csv right after selectRange', JSON.stringify(csv1), '| first data line right after sort', firstLine, '| after flush', firstLineAfter)
  })

  it('S4-07: number の列に 42 を打ち始める(jsdom + user-event)', async () => {
    const user = userEvent.setup()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} />)
    await user.click(cellAt(container, 3, 5))
    await user.keyboard('42{Enter}')
    console.log('S4-07 typed 42 →', cellAt(container, 3, 5).textContent)
  })

  it('S4-08: 値と表示名が別の select 列の set フィルターの候補', async () => {
    const user = userEvent.setup()
    render(() => <InventoryGrid initialRows={makeItems(6)} />)
    fireEvent.contextMenu(screen.getByRole('columnheader', { name: /区分/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'フィルター…' }))
    await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBeGreaterThan(1))
    console.log('S4-08 candidates', screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? c.closest('label')?.textContent).join(','))
  })
})
