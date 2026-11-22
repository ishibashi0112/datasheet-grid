// React 版のガイド(act / flushSync)を Solid に読み替えたときに何が要るか
import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import { createSignal, flush } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, makeItems, type Item } from './inventory'

function setup() {
  const [rows, setRows] = createSignal<Item[]>(makeItems(5))
  let grid!: SpreadsheetGridHandle<Item>
  const r = render(() => (
    <SpreadsheetGrid ref={grid} rows={rows()} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(x) => x.id} />
  ))
  const shell = r.container.querySelector<HTMLElement>('.ssg-shell')!
  const cell = (k: number, c: number) => r.container.querySelector<HTMLElement>(`[data-pane="center"].ssg-body-row[data-row-key="${k}"] [aria-colindex="${c}"]`)
  return { ...r, rows, setRows, grid: () => grid, shell, cell }
}

describe('タイミング', () => {
  it('外から signal で rows を変えた直後の DOM', () => {
    const t = setup()
    t.setRows(makeItems(2))
    const before = t.container.querySelectorAll('[data-pane="center"].ssg-body-row').length
    flush()
    const after = t.container.querySelectorAll('[data-pane="center"].ssg-body-row').length
    console.log('T1 rows: right after setRows', before, 'after flush()', after)
    expect(after).toBe(2)
  })

  it('selectCell の直後の DOM の印', () => {
    const t = setup()
    t.grid().selectCell(1, 1)
    const sync = t.cell(2, 3)?.getAttribute('aria-selected')
    flush()
    console.log('T2 aria-selected right after selectCell', sync, 'after flush', t.cell(2, 3)?.getAttribute('aria-selected'), 'getActiveCell', JSON.stringify(t.grid().getActiveCell()))
  })

  it('fireEvent だけで 2 回続けて編集する', async () => {
    const t = setup()
    t.grid().selectCell(0, 1)
    t.grid().focus()
    flush()
    fireEvent.keyDown(document.activeElement!, { key: 'a' })
    console.log('T3 activeEl right after keyDown', document.activeElement?.className, 'editor exists', !!document.querySelector('.ssg-cell-editor'))
    flush()
    const input1 = document.activeElement as HTMLInputElement
    console.log('T3 editor after keyDown a:', input1.tagName, JSON.stringify(input1.value))
    fireEvent.input(input1, { target: { value: 'abc' } })
    fireEvent.keyDown(input1, { key: 'Enter' })
    // ガイド: 確定の後の移動はその後のマイクロタスク(React は await act(async () => {}))
    const syncActive = JSON.stringify(t.grid().getActiveCell())
    fireEvent.keyDown(document.activeElement!, { key: 'b' })
    const syncEditor = (document.activeElement as HTMLInputElement).value
    console.log('T3 sync after Enter: active', syncActive, 'name0', t.rows()[0]!.name, 'next keyDown editor value', JSON.stringify(syncEditor), 'activeEl', document.activeElement?.className)
    await Promise.resolve()
    console.log('T3 after microtask: active', JSON.stringify(t.grid().getActiveCell()), 'name0', t.rows()[0]!.name)
  })

  it('fireEvent + await Promise.resolve() を挟む', async () => {
    const t = setup()
    t.grid().selectCell(0, 1)
    t.grid().focus()
    flush()
    fireEvent.keyDown(document.activeElement!, { key: 'a' })
    flush()
    const input1 = document.activeElement as HTMLInputElement
    fireEvent.input(input1, { target: { value: 'abc' } })
    fireEvent.keyDown(input1, { key: 'Enter' })
    await Promise.resolve()
    fireEvent.keyDown(document.activeElement!, { key: 'b' })
    flush()
    const input2 = document.activeElement as HTMLInputElement
    console.log('T4 after microtask: active', JSON.stringify(t.grid().getActiveCell()), 'editor', input2.tagName, JSON.stringify(input2.value), 'name0', t.rows()[0]!.name)
  })
})
