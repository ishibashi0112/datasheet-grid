// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import {
  SpreadsheetGrid,
  preloadGridPopups,
  type GridColumn,
  type SpreadsheetGridHandle,
  type SpreadsheetGridProps,
} from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from './inventory'

const consoleMessages: string[] = []
const allMessages: { test: string; messages: string[] }[] = []
let restoreStubs: () => void
beforeAll(async () => {
  restoreStubs = installJsdomLayoutStubs()
  await preloadGridPopups()
})
afterAll(async () => {
  restoreStubs()
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.env.CONSOLE_LOG_MORE ?? 'console-log-more.json', JSON.stringify(allMessages, null, 2))
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

const centerRows = (c: HTMLElement) => c.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row')
const cell = (c: HTMLElement, r: number, key: string) =>
  c.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)!

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    for (const v of Object.values(o)) deepFreeze(v)
  }
  return o
}

describe('onRowsChange のスパイ(rows を戻さない書き方)', () => {
  test('1 セルの編集で新しい配列が 1 回渡る', async () => {
    const user = userEvent.setup()
    const rows = makeItems(3)
    const onRowsChange = vi.fn()
    const { container } = render(
      <SpreadsheetGrid<Item> rows={rows} columns={inventoryColumns} onRowsChange={onRowsChange} rowKeyGetter={(r) => r.id} />,
    )
    await user.click(cell(container, 1, 'name'))
    await user.keyboard('X{Enter}')
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    const next = onRowsChange.mock.calls[0][0] as Item[]
    expect(next).not.toBe(rows)
    expect(next[1].name).toBe('X')
    expect(next[0]).toBe(rows[0])
    expect(rows[1].name).toBe('ノート 1')
  })
})

describe('凍結した rows(Redux / Immer)', () => {
  function Frozen({ gridRef }: { gridRef?: React.Ref<SpreadsheetGridHandle<Item>> }) {
    const [rows, setRows] = useState(() => deepFreeze(makeItems(6)))
    return (
      <SpreadsheetGrid<Item>
        ref={gridRef}
        rows={rows}
        columns={inventoryColumns}
        onRowsChange={(next) => setRows(deepFreeze(next))}
        rowKeyGetter={(r) => r.id}
      />
    )
  }
  test('編集・貼り付け・削除・元に戻す・並べ替えで例外が出ない', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(<Frozen gridRef={ref} />)
    await user.click(cell(container, 0, 'qty'))
    await user.keyboard('9{Enter}')
    expect(cell(container, 0, 'qty')).toHaveTextContent('9')
    await user.click(cell(container, 0, 'name'))
    await user.paste('a\tstationery\nb\tfurniture')
    expect(cell(container, 1, 'name')).toHaveTextContent('b')
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}{Delete}')
    expect(cell(container, 0, 'name')).toHaveTextContent('')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell(container, 0, 'name')).toHaveTextContent('a')
    act(() => ref.current!.applyState({ sort: [{ columnKey: 'price', direction: 'desc' }] }))
    expect(centerRows(container)[0].getAttribute('data-row-key')).toBe('item-5')
    await user.click(within(cell(container, 0, 'discontinued')).getByRole('checkbox'))
    expect(within(cell(container, 0, 'discontinued')).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })
})

describe('エディタをキーボードだけで', () => {
  test('select を ↓ と Enter で選ぶ', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container } = render(
      <SpreadsheetGrid<Item> rows={makeItems(3)} columns={inventoryColumns} onRowsChange={onRowsChange} rowKeyGetter={(r) => r.id} />,
    )
    await user.click(cell(container, 0, 'category'))
    await user.keyboard('{Enter}')
    await screen.findByRole('listbox')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    expect((onRowsChange.mock.calls[0][0] as Item[])[0].category).toBe('furniture')
  })

  test('Tab で確定して右へ、Shift+Tab で左へ', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container } = render(
      <SpreadsheetGrid<Item> rows={makeItems(3)} columns={inventoryColumns} onRowsChange={onRowsChange} rowKeyGetter={(r) => r.id} />,
    )
    await user.dblClick(cell(container, 0, 'name'))
    await user.keyboard('{Control>}a{/Control}abc{Tab}')
    expect((onRowsChange.mock.calls[0][0] as Item[])[0].name).toBe('abc')
    const shell = container.querySelector('.ssg-shell')!
    expect(document.getElementById(shell.getAttribute('aria-activedescendant')!)).toBe(cell(container, 0, 'category'))
  })

  test('custom エディタ', async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const columns: GridColumn<Item>[] = [
      ...inventoryColumns.slice(0, 2),
      {
        key: 'warehouse',
        title: '倉庫',
        width: 120,
        editor: {
          type: 'custom',
          render: (ctx) => (
            <div role="listbox" aria-label="倉庫を選ぶ">
              {['東京', '大阪', '名古屋'].map((w) => (
                <button key={w} type="button" role="option" aria-selected={ctx.value === w} onClick={() => ctx.commit(w, 'down')}>
                  {w}
                </button>
              ))}
              <button type="button" onClick={() => ctx.cancel()}>やめる</button>
            </div>
          ),
        },
      },
    ]
    const { container } = render(
      <SpreadsheetGrid<Item> rows={makeItems(3)} columns={columns} onRowsChange={onRowsChange} rowKeyGetter={(r) => r.id} />,
    )
    await user.dblClick(cell(container, 0, 'warehouse'))
    await user.click(within(screen.getByRole('listbox', { name: '倉庫を選ぶ' })).getByRole('option', { name: '名古屋' }))
    expect((onRowsChange.mock.calls[0][0] as Item[])[0].warehouse).toBe('名古屋')
  })
})

describe('マウスのドラッグで範囲選択(jsdom)', () => {
  test('user.pointer で押したまま動かす', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(
      <SpreadsheetGrid<Item> ref={ref} rows={makeItems(5)} columns={inventoryColumns} rowKeyGetter={(r) => r.id} />,
    )
    await user.pointer([
      { keys: '[MouseLeft>]', target: cell(container, 0, 'name') },
      { target: cell(container, 1, 'category') },
      { target: cell(container, 2, 'warehouse') },
      { keys: '[/MouseLeft]' },
    ])
    // jsdom ではドラッグの当たり判定が座標で決まるため再現できない(記録だけ)
    const sel = ref.current!.getSelection()
    process.stdout.write(`drag selection in jsdom: ${JSON.stringify(sel)}\n`)
  })
})

describe('右クリックメニュー', () => {
  test('項目を押す', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const { container } = render(
      <SpreadsheetGrid<Item>
        rows={makeItems(3)}
        columns={inventoryColumns}
        rowKeyGetter={(r) => r.id}
        enableContextMenu
        getContextMenuItems={({ target }) =>
          target.type === 'cell' ? [{ label: `${target.column.key} を調べる`, onSelect: () => onSelect(target.rowKey) }] : []
        }
      />,
    )
    await user.pointer({ keys: '[MouseRight]', target: cell(container, 1, 'qty') })
    const menu = await screen.findByRole('menu')
    await user.click(within(menu).getByRole('menuitem', { name: 'qty を調べる' }))
    expect(onSelect).toHaveBeenCalledWith('item-2')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('セル内検索', () => {
  test('Ctrl+F → 打つ → Enter', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const { container } = render(
      <SpreadsheetGrid<Item> ref={ref} rows={makeItems(20)} columns={inventoryColumns} rowKeyGetter={(r) => r.id} find />,
    )
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{Control>}f{/Control}')
    const bar = screen.getByRole('search', { name: 'セル内検索' })
    const input = within(bar).getByRole('textbox', { name: '検索文字列' })
    await user.type(input, 'モニター')
    await waitFor(() => expect(document.querySelectorAll('.ssg-find-mark').length).toBeGreaterThan(0))
    await user.keyboard('{Enter}')
    await waitFor(() => expect(ref.current!.getActiveCell()?.row).toBeGreaterThanOrEqual(4))
  })
})

describe('rows を外から差し替える(rerender)', () => {
  test('rerender で行が変わり、アクティブセルは範囲内へ', async () => {
    const user = userEvent.setup()
    const ref = createRef<SpreadsheetGridHandle<Item>>()
    const props: SpreadsheetGridProps<Item> = { rows: makeItems(10), columns: inventoryColumns, rowKeyGetter: (r) => r.id }
    const { container, rerender } = render(<SpreadsheetGrid<Item> ref={ref} {...props} />)
    await user.click(cell(container, 9, 'name'))
    rerender(<SpreadsheetGrid<Item> ref={ref} {...props} rows={makeItems(3)} />)
    expect(centerRows(container)).toHaveLength(3)
    expect(ref.current!.getActiveCell()?.row).toBe(2)
  })
})