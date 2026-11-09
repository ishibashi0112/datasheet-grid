// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState, type Ref } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import {
  SpreadsheetGrid,
  restoreColumnsFromState,
  type GridState,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

const consoleMessages: string[] = []
const allMessages: { test: string; messages: string[] }[] = []
let restoreStubs: () => void
beforeAll(() => {
  restoreStubs = installJsdomLayoutStubs()
})
afterAll(async () => {
  restoreStubs()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.env.CONSOLE_LOG_HANDLE ?? 'console-log-handle.json', JSON.stringify(allMessages, null, 2))
})
beforeEach(() => {
  consoleMessages.length = 0
  for (const level of ['error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleMessages.push(`[${level}] ${args.map(String).join(' ')}`)
    })
  }
})
afterEach(() => {
  if (consoleMessages.length) allMessages.push({ test: expect.getState().currentTestName ?? '', messages: [...consoleMessages] })
  vi.restoreAllMocks()
})

type HarnessProps = Partial<SpreadsheetGridProps<Item>> & {
  gridRef: Ref<SpreadsheetGridHandle<Item>>
  initial: Item[]
  onRows?: (rows: Item[]) => void
}

function Harness({ gridRef, initial, onRows, ...rest }: HarnessProps) {
  const [rows, setRows] = useState(initial)
  return (
    <SpreadsheetGrid<Item>
      ref={gridRef}
      rows={rows}
      columns={inventoryColumns}
      onRowsChange={(next) => {
        setRows(next)
        onRows?.(next)
      }}
      rowKeyGetter={(r) => r.id}
      {...rest}
    />
  )
}

function centerRows(container: HTMLElement) {
  return container.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row')
}

describe('ハンドル', () => {
  test('ref が入る', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    render(<Harness gridRef={ref} initial={makeItems(3)} />)
    expect(ref.current).not.toBeNull()
    expect(typeof ref.current?.selectCell).toBe('function')
  })

  test('selectCell / getActiveCell / selectRange / getSelection / getSelectedRows', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    render(<Harness gridRef={ref} initial={makeItems(5)} />)
    const grid = ref.current!
    const nameCol = grid.getColIndex('name')
    expect(nameCol).toBe(1)
    act(() => grid.selectCell(2, nameCol))
    expect(grid.getActiveCell()).toEqual({ row: 2, col: nameCol })
    act(() => grid.selectRange({ start: { row: 1, col: nameCol }, end: { row: 3, col: nameCol + 1 } }))
    expect(grid.getSelectedRows().map((r) => r.id)).toEqual(['item-2', 'item-3', 'item-4'])
    expect(grid.getSelection()).toBeTruthy()
  })

  test('selectCell を act の外で呼んでも結果は読める(act 警告の有無も記録)', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    render(<Harness gridRef={ref} initial={makeItems(5)} />)
    ref.current!.selectCell(1, 1)
    expect(ref.current!.getActiveCell()).toEqual({ row: 1, col: 1 })
  })

  test('getState / applyState / onStateChange / getViewRowIndex(並べ替えの後)', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const onStateChange = vi.fn<(s: GridState) => void>()
    const { container } = render(<Harness gridRef={ref} initial={makeItems(6)} onStateChange={onStateChange} />)
    const grid = ref.current!
    act(() => grid.applyState({ sort: [{ columnKey: 'qty', direction: 'desc' }] }))
    expect(grid.getState().sort).toEqual([{ columnKey: 'qty', direction: 'desc' }])
    expect(onStateChange).toHaveBeenCalledTimes(1)
    // qty = 0,7,14,21,28,35 → 降順で item-6 が先頭
    expect(grid.getViewRowIndex('item-6')).toBe(0)
    expect(grid.getRowNumber('item-6')).toBe(1)
    expect(centerRows(container)[0].getAttribute('data-row-key')).toBe('item-6')
    act(() => grid.applyState({ filters: { globalText: 'ノート' } }))
    expect(centerRows(container)).toHaveLength(1)
    expect(grid.getViewRowIndex('item-1')).toBe(-1)
    const saved = JSON.parse(JSON.stringify(grid.getState()))
    expect(saved.version).toBe(2)
    expect(saved.filters.globalText).toBe('ノート')
  })

  test('initialState で最初から並ぶ', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(
      <Harness gridRef={ref} initial={makeItems(6)} initialState={{ sort: [{ columnKey: 'price', direction: 'desc' }] }} />,
    )
    expect(centerRows(container)[0].getAttribute('data-row-key')).toBe('item-5')
  })

  test('startEditing / focus', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    render(
      <>
        <button type="button">外</button>
        <Harness gridRef={ref} initial={makeItems(3)} />
      </>,
    )
    await user.click(screen.getByRole('button', { name: '外' }))
    let started = false
    act(() => {
      started = ref.current!.startEditing(1, ref.current!.getColIndex('note'))
    })
    expect(started).toBe(true)
    const editor = screen.getByRole('group', { name: '備考 を編集' })
    expect(within(editor).getByRole('textbox')).toHaveFocus()
    await user.keyboard('メモ{Enter}')
    expect(screen.getByRole('gridcell', { name: 'メモ' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '外' }))
    act(() => ref.current!.focus())
    expect(document.activeElement).toHaveClass('ssg-shell')
    // 編集できない列は false
    let ok = true
    act(() => {
      ok = ref.current!.startEditing(0, ref.current!.getColIndex('amount'))
    })
    expect(ok).toBe(false)
  })

  test('undo / redo / canUndo / applyRows', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const onRows = vi.fn()
    render(<Harness gridRef={ref} initial={makeItems(3)} onRows={onRows} />)
    const grid = ref.current!
    expect(grid.canUndo()).toBe(false)
    act(() => grid.applyRows(makeItems(2)))
    expect(onRows).toHaveBeenLastCalledWith(makeItems(2))
    expect(grid.canUndo()).toBe(true)
    act(() => grid.undo())
    expect(onRows.mock.lastCall?.[0]).toHaveLength(3)
    expect(grid.canRedo()).toBe(true)
    act(() => grid.redo())
    expect(onRows.mock.lastCall?.[0]).toHaveLength(2)
    void user
  })

  test('getInvalidCells(非表示列も対象)', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const items = makeItems(3)
    items[1] = { ...items[1], qty: -1, note: 'x'.repeat(30) }
    render(<Harness gridRef={ref} initial={items} />)
    const invalid = ref.current!.getInvalidCells()
    expect(invalid.map((c) => c.columnKey).sort()).toEqual(['note', 'qty'])
    expect(invalid.find((c) => c.columnKey === 'note')?.message).toBe('20 文字までです')
  })

  test('exportCsv(scope: selection / view)', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    render(<Harness gridRef={ref} initial={makeItems(3)} />)
    const grid = ref.current!
    act(() => grid.selectRange({ start: { row: 0, col: 1 }, end: { row: 1, col: 2 } }))
    const csv = grid.exportCsv({ scope: 'selection' })
    expect(csv.split(/\r?\n/).filter(Boolean)).toEqual(['品名,カテゴリ', 'ボールペン 1,stationery', 'ノート 1,stationery'])
    const all = grid.exportCsv()
    expect(all.split(/\r?\n/).filter(Boolean)).toHaveLength(4)
  })

  test('scrollToRow で 5000 行目が描かれる(jsdom)', () => {
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(<Harness gridRef={ref} initial={makeItems(10000)} height={400} />)
    expect(centerRows(container).length).toBeLessThan(50)
    act(() => ref.current!.scrollToRow(5000, { align: 'start' }))
    const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container')!
    // jsdom では scrollToRow がスクロールしない(scrollTo が何もしない)。scrollTop を書いて scroll を出す。
    if (scroller.scrollTop === 0) {
      scroller.scrollTop = 5000 * 36
      fireEvent.scroll(scroller)
    }
    const keys = [...centerRows(container)].map((r) => r.getAttribute('data-row-key'))
    expect(keys).toContain('item-5001')
    expect(ref.current!.getVisibleRowRange()?.startIndex).toBeGreaterThan(4900)
  })

  test('restoreColumnsFromState で列の並び / 表示を戻す', () => {
    const saved: GridState = {
      version: 2,
      columnWidths: { name: 300 },
      filters: { globalText: '', columnFilters: {} },
      sort: [],
      columns: [
        { key: 'sku', pinned: 'left' },
        { key: 'qty' },
        { key: 'name' },
        { key: 'note', visible: false },
      ],
    }
    const cols = restoreColumnsFromState(inventoryColumns, saved)
    expect(cols.slice(0, 3).map((c) => c.key)).toEqual(['sku', 'qty', 'name'])
    expect(cols.find((c) => c.key === 'note')?.visible).toBe(false)
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(<Harness gridRef={ref} initial={makeItems(2)} columns={cols} initialState={saved} />)
    const header = container.querySelector<HTMLElement>('[data-pane="center"].ssg-header-row [data-ssg-col-key="name"]')
    expect(header?.style.width).toBe('300px')
    expect(container.querySelector('[data-ssg-col-key="note"]')).toBeNull()
  })
})

describe('偽のタイマー', () => {
  test('vi.useFakeTimers の下で編集できる', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
      const ref = createRef<SpreadsheetGridHandle<Item>>()
      const { container } = render(<Harness gridRef={ref} initial={makeItems(3)} />)
      const c = centerRows(container)[0].querySelector<HTMLElement>('[data-ssg-col-key="name"]')!
      await user.click(c)
      await user.keyboard('abc{Enter}')
      expect(c).toHaveTextContent('abc')
      act(() => {
        vi.runOnlyPendingTimers()
      })
    } finally {
      vi.useRealTimers()
    }
  })
})