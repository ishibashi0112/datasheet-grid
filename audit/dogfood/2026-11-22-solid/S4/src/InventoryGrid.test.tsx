import { describe, expect, it, vi } from 'vitest'
import { flush } from 'solid-js'
import { render, screen, fireEvent, waitFor } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { InventoryGrid } from './InventoryGrid'
import { makeItems, type Item } from './inventory'

const centerRows = (c: HTMLElement) => c.querySelectorAll('[data-pane="center"].ssg-body-row')
// 中央のペインの行の中の aria-colindex のセル(行番号 1、最初のデータ列 2)
const cellAt = (c: HTMLElement, rowKey: number, colIndex: number, pane = 'center') =>
  c.querySelector<HTMLElement>(`[data-pane="${pane}"].ssg-body-row[data-row-key="${rowKey}"] [aria-colindex="${colIndex}"]`)!

describe('在庫一覧', () => {
  it('行と見出しを描く', () => {
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} />)
    expect(centerRows(container)).toHaveLength(5)
    expect(screen.getByRole('grid', { name: '在庫一覧' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /品名/ })).toBeInTheDocument()
    expect(cellAt(container, 1, 3)).toHaveTextContent('品目1')
    expect(cellAt(container, 1, 4)).toHaveTextContent('文具')
  })

  it('ダブルクリックで編集して Enter で確定する', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} onRowsChange={onRowsChange} />)
    await user.dblClick(cellAt(container, 2, 3))
    const input = screen.getByRole('textbox', { name: '品名 を編集' })
    await user.clear(input)
    await user.type(input, '新しい名前{Enter}')
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    expect(onRowsChange.mock.calls[0]![0][1].name).toBe('新しい名前')
    expect(cellAt(container, 2, 3)).toHaveTextContent('新しい名前')
  })

  it('文字を打ち始めて編集し、Ctrl+Z で戻す', async () => {
    const user = userEvent.setup()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} />)
    await user.click(cellAt(container, 3, 5))
    // number の列で '42' を打ち始めると jsdom + user-event では '24' になる(実ブラウザは 42)ので 1 文字だけ
    await user.keyboard('7{Enter}')
    expect(cellAt(container, 3, 5)).toHaveTextContent('7')
    await user.keyboard('{Control>}z{/Control}')
    expect(cellAt(container, 3, 5)).toHaveTextContent('14')
  })

  it('Shift+矢印で範囲を選んでコピーする', async () => {
    const user = userEvent.setup()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} />)
    await user.click(cellAt(container, 1, 3))
    await user.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}')
    await user.keyboard('{Control>}c{/Control}')
    await waitFor(async () => expect(await navigator.clipboard.readText()).toBe('品目1\t文具\n品目2\t日用品'))
  })

  it('貼り付ける(user.paste)', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} onRowsChange={onRowsChange} />)
    await user.click(cellAt(container, 1, 3))
    await user.paste('貼り\t食品\t１，２００')
    const next: Item[] = onRowsChange.mock.calls.at(-1)![0]
    expect(next[0]).toMatchObject({ name: '貼り', category: 'C', qty: 1200 })
  })

  it('ハンドル: selectRange と exportCsv と getState / applyState', async () => {
    let grid!: SpreadsheetGridHandle<Item>
    const { container } = render(() => <InventoryGrid initialRows={makeItems(5)} ref={(h) => (grid = h)} />)
    grid.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } })
    flush() // 選択した直後の exportCsv は flush() の後(React 版は act の後)
    expect(grid.exportCsv({ scope: 'selection' })).toBe('品名,区分\r\n品目1,文具\r\n品目2,日用品')
    grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] })
    expect(grid.getState().sort).toEqual([{ columnKey: 'qty', direction: 'desc' }])
    // 並べ替えの後の先頭の行(qty が最大)
    await waitFor(() => expect(centerRows(container)[0]).toHaveAttribute('data-row-key', '5'))
  })

  it('列メニューから set フィルターで絞り込む', async () => {
    const user = userEvent.setup()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(6)} />)
    const header = screen.getByRole('columnheader', { name: /区分/ })
    fireEvent.contextMenu(header)
    await user.click(await screen.findByRole('menuitem', { name: 'フィルター…' }))
    // 候補は値(A / B / C)のまま。表示名で出すには列に filterOptions を書く
    await user.click(await screen.findByRole('checkbox', { name: 'A' }))
    await waitFor(() => expect(centerRows(container)).toHaveLength(4))
  })

  it('date エディタに fireEvent.change で値を入れる', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container } = render(() => <InventoryGrid initialRows={makeItems(3)} onRowsChange={onRowsChange} />)
    await user.click(cellAt(container, 1, 8))
    await user.keyboard('{F2}')
    const input = container.ownerDocument.activeElement as HTMLInputElement
    expect(input.type).toBe('date')
    fireEvent.change(input, { target: { value: '2026-11-09' } })
    await user.keyboard('{Enter}')
    expect(onRowsChange.mock.calls.at(-1)![0][0].due).toBe('2026-11-09')
  })
})
