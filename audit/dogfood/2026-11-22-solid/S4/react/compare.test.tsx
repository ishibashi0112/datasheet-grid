import { it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { InventoryGrid, makeItems, type Item } from './InventoryGrid'
afterEach(() => cleanup())

it('REACT set フィルターの候補は値のまま?', async () => {
  const user = userEvent.setup()
  render(<InventoryGrid initialRows={makeItems(6)} />)
  fireEvent.contextMenu(screen.getByRole('columnheader', { name: /区分/ }))
  await user.click(await screen.findByRole('menuitem', { name: 'フィルター…' }))
  await new Promise((r) => setTimeout(r, 100))
  console.log('REACT CB', screen.queryAllByRole('checkbox').map((c) => c.closest('label')?.textContent).join(' ; '))
  expect(1).toBe(1)
})

it('REACT 行の選択のキーは削除の後も残る?', async () => {
  let grid: SpreadsheetGridHandle<{ id: number; name: string }> | null = null
  function App() {
    const [rows, setRows] = useState(() => Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` })))
    return <SpreadsheetGrid ref={(h) => { grid = h }} rows={rows} columns={[{ key: 'name', width: 100 }]} onRowsChange={setRows} rowKeyGetter={(r) => r.id} enableRowSelection />
  }
  render(<App />)
  act(() => grid!.setRowSelection({ type: 'include', rowKeys: [2, 3] }))
  act(() => grid!.applyRows((prev) => prev.filter((r) => r.id !== 2 && r.id !== 3)))
  console.log('REACT selected keys after delete', JSON.stringify(grid!.getSelectedRowKeys()), 'count', grid!.getSelectedRowCount(), 'data', JSON.stringify(grid!.getSelectedRowData()))
  expect(1).toBe(1)
})
