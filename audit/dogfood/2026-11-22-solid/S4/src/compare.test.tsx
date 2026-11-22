import { it, expect } from 'vitest'
import { render } from '@solidjs/testing-library'
import { createSignal, flush } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'

it('SOLID 行の選択のキーは削除の後も残る?', () => {
  let grid!: SpreadsheetGridHandle<{ id: number; name: string }>
  const [rows, setRows] = createSignal(Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `n${i + 1}` })))
  render(() => <SpreadsheetGrid ref={grid} rows={rows()} columns={[{ key: 'name', width: 100 }]} onRowsChange={setRows} rowKeyGetter={(r) => r.id} enableRowSelection />)
  grid.setRowSelection({ type: 'include', rowKeys: [2, 3] })
  flush()
  grid.applyRows((prev) => prev.filter((r) => r.id !== 2 && r.id !== 3))
  flush()
  console.log('SOLID selected keys after delete', JSON.stringify(grid.getSelectedRowKeys()), 'count', grid.getSelectedRowCount(), 'data', JSON.stringify(grid.getSelectedRowData()))
  expect(1).toBe(1)
})
