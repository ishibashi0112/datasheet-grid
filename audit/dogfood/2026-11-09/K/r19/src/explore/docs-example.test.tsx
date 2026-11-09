// @vitest-environment jsdom
import { beforeAll, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'

beforeAll(() => { installJsdomLayoutStubs() })
type Row = { id: number; name: string; qty: number }

test('ドキュメントの例(行 3 つ)', () => {
  const rows: Row[] = [{ id: 1, name: 'a', qty: -1 }, { id: 2, name: 'b', qty: 5 }, { id: 3, name: 'c', qty: -3 }]
  const columns: GridColumn<Row>[] = [
    { key: 'name', width: 100 },
    { key: 'qty', width: 100, cellClassName: ({ value }) => (Number(value) < 0 ? 'my-warn-cell' : undefined) },
  ]
  const { container } = render(<SpreadsheetGrid rows={rows} columns={columns} />)
  expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(rows.length)
  expect(container.querySelectorAll('.ssg-body-cell.my-warn-cell')).toHaveLength(2)
})

for (const n of [20, 30, 100]) {
  test(`行 ${n} で何行描かれるか`, () => {
    const rows = Array.from({ length: n }, (_, i) => ({ id: i, name: `n${i}`, qty: i }))
    const { container } = render(<SpreadsheetGrid rows={rows} columns={[{ key: 'name', width: 100 }]} />)
    process.stdout.write(`rows=${n} rendered=${container.querySelectorAll('[data-pane="center"].ssg-body-row').length}\n`)
  })
}
for (const [n, w] of [[10, 120], [20, 120], [40, 120]] as const) {
  test(`列 ${n} × ${w}px で何列描かれるか`, () => {
    const cols = Array.from({ length: n }, (_, i) => ({ key: `c${i}`, width: w }))
    const rows = [Object.fromEntries(cols.map((c) => [c.key, c.key]))]
    const { container } = render(<SpreadsheetGrid rows={rows} columns={cols} />)
    process.stdout.write(`cols=${n} total=${n * w}px rendered=${container.querySelectorAll('[data-pane="center"].ssg-body-row [role="gridcell"]').length}\n`)
  })
}
test('height 未指定(maxHeight 480)と height=200', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `n${i}`, qty: i }))
  const a = render(<SpreadsheetGrid rows={rows} columns={[{ key: 'name', width: 100 }]} height={200} />)
  process.stdout.write(`height=200 rendered=${a.container.querySelectorAll('[data-pane="center"].ssg-body-row').length}\n`)
})
