import { describe, expect, it } from 'vitest'
import { render } from '@solidjs/testing-library'
import { merge, omit } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle, type SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, makeItems, type Item } from './inventory'

// グリッドを包む部品(既定値を足して残りを渡す)
function MyGrid<T extends object>(props: SpreadsheetGridProps<T> & { compact?: boolean | undefined }) {
  const merged = merge({ density: 'standard' as const, height: 300 }, props)
  const rest = omit(merged, 'compact')
  return <SpreadsheetGrid {...rest} density={props.compact ? 'compact' : rest.density} />
}

describe('包む部品', () => {
  it('ref を変数で渡すと包んだ先のハンドルが入る', () => {
    let grid!: SpreadsheetGridHandle<Item>
    render(() => <MyGrid ref={grid} rows={makeItems(3)} columns={inventoryColumns} rowKeyGetter={(r) => r.id} />)
    expect(typeof grid?.getState).toBe('function')
    expect(grid.getVisibleRowRange()).not.toBeNull()
  })
  it('ref を関数で渡す', () => {
    let grid: SpreadsheetGridHandle<Item> | undefined
    render(() => <MyGrid ref={(h) => (grid = h)} rows={makeItems(3)} columns={inventoryColumns} compact />)
    expect(grid?.getColIndex('name')).toBe(1)
    expect(document.querySelector('.ssg-root')?.className).toMatch(/compact/)
  })
})
