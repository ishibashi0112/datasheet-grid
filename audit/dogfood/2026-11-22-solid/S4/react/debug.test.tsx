import { it, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { InventoryGrid, makeItems, type Item } from './InventoryGrid'

const sel = (k: number, c: number) => `[data-pane="center"].ssg-body-row[data-row-key="${k}"] [aria-colindex="${c}"]`
it('type to start editing (React)', async () => {
  const { container } = render(<InventoryGrid initialRows={makeItems(5)} />)
  const user = userEvent.setup()
  for (const [c, keys] of [[3, 'ab'], [5, '42'], [6, '123']] as const) {
    await user.click(container.querySelector<HTMLElement>(sel(2, c))!)
    await user.keyboard(keys)
    const el = document.activeElement as HTMLInputElement
    const during = `${el.tagName}[type=${el.type}] value=${JSON.stringify(el.value)}`
    await user.keyboard('{Enter}')
    console.log(`REACT col ${c} typed ${keys}: during ${during} -> cell ${container.querySelector(sel(2, c))!.textContent}`)
  }
  expect(1).toBe(1)
})
it('handle reads right after set (React)', async () => {
  let grid: SpreadsheetGridHandle<Item> | null = null
  render(<InventoryGrid initialRows={makeItems(5)} ref={(h) => { grid = h }} />)
  const g = grid!
  act(() => {
    g.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } })
    console.log('REACT sel immediately', JSON.stringify(g.getSelection()), 'csv', JSON.stringify(g.exportCsv({ scope: 'selection' })))
    g.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
    console.log('REACT applyState -> csv view first line', g.exportCsv().split('\r\n')[1], 'getViewRowIndex(1)', g.getViewRowIndex(1))
  })
  console.log('REACT after act csv selection', JSON.stringify(g.exportCsv({ scope: 'selection' })), 'view first', g.exportCsv().split('\r\n')[1])
  expect(1).toBe(1)
})
