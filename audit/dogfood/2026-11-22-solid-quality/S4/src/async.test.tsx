// 利用側のテスト: <Loading> の中の非同期の行、action + createOptimistic で保存
import { describe, expect, it, vi } from 'vitest'
import { createSignal, flush } from 'solid-js'
import { render, screen, waitFor } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import type { SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { AsyncInventory, createFakeServer } from './AsyncInventory'
import { makeItems, type Item } from './inventory'

const rowsIn = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row')]
const cellAt = (c: HTMLElement, rowKey: number, colIndex: number) =>
  c.querySelector<HTMLElement>(`[data-pane="center"].ssg-body-row[data-row-key="${rowKey}"] [aria-colindex="${colIndex}"]`)

function seed() {
  const a = makeItems(4)
  const b = makeItems(7).map((r) => ({ ...r, id: r.id + 100, name: `B品目${r.id}` }))
  return { A: a, B: b }
}

describe('<Loading> の中の非同期の行', () => {
  it('読み込み中を出し、行が来たら描く', async () => {
    const server = createFakeServer(seed())
    const errors = vi.spyOn(console, 'error')
    let handleAt: string | null = null
    const { container } = render(() => (
      <AsyncInventory api={server.api} category="A" ref={(h) => (handleAt = `ref called, getState ok=${!!safe(() => h.getState())}`)} />
    ))
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    console.log('A1 grid while loading', container.querySelectorAll('[role="grid"]').length, 'ref', handleAt)
    const grid = await screen.findByRole('grid', { name: '在庫一覧(サーバー)' })
    expect(grid).toBeInTheDocument()
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    expect(screen.queryByTestId('loading')).toBeNull()
    expect(cellAt(container, 1, 3)).toHaveTextContent('品目1')
    console.log('A1 after load: ref', handleAt, 'console.error', errors.mock.calls.length)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('カテゴリを切り替えると、取り直しの間は前の行のまま「更新中…」、来たら差し替わる', async () => {
    const server = createFakeServer(seed())
    server.setDelay(80)
    const [cat, setCat] = createSignal('A')
    let grid!: SpreadsheetGridHandle<Item>
    const refCalls: number[] = []
    const { container } = render(() => (
      <AsyncInventory api={server.api} category={cat()} ref={(h) => { refCalls.push(Date.now()); grid = h }} />
    ))
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    const gridEl = container.querySelector('[role="grid"]')
    setCat('B')
    flush()
    await new Promise((r) => setTimeout(r, 20))
    console.log('A2 during refetch: rows', rowsIn(container).length, 'status', screen.getByTestId('status').textContent, 'loading', !!screen.queryByTestId('loading'))
    expect(rowsIn(container)).toHaveLength(4)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(7))
    console.log('A2 after: status', screen.getByTestId('status').textContent, 'same grid element', container.querySelector('[role="grid"]') === gridEl, 'ref calls', refCalls.length, 'getRowCount via state', grid.getVisibleRowRange())
    expect(cellAt(container, 101, 3)).toHaveTextContent('B品目1')
  })

  it('<Loading on> で切り替えると読み込み中を出し直す(グリッドは作り直される?)', async () => {
    const server = createFakeServer(seed())
    server.setDelay(80)
    const [cat, setCat] = createSignal('A')
    const handles: SpreadsheetGridHandle<Item>[] = []
    const { container } = render(() => <AsyncInventory api={server.api} category={cat()} rearm ref={(h) => handles.push(h)} />)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    const gridEl = container.querySelector('[role="grid"]')
    setCat('B')
    flush()
    await new Promise((r) => setTimeout(r, 20))
    console.log('A3 during refetch: loading', !!screen.queryByTestId('loading'), 'grid in DOM', !!container.querySelector('[role="grid"]'), 'rows', rowsIn(container).length)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(7))
    console.log('A3 after: same grid element', container.querySelector('[role="grid"]') === gridEl, 'handles', handles.length, 'last handle works', safe(() => JSON.stringify(handles.at(-1)!.getVisibleRowRange())))
  })

  it('読み込みの失敗 → <Errored> → 再試行', async () => {
    const server = createFakeServer(seed())
    server.failList()
    const { container } = render(() => <AsyncInventory api={server.api} category="A" />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('一覧の取得に失敗')
    await userEvent.setup().click(screen.getByRole('button', { name: '再試行' }))
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    console.log('A4 calls', server.calls.join(','))
  })
})

describe('action + createOptimistic で保存', () => {
  it('編集すると楽観的にすぐ出て、保存の後も残る。元に戻すは?', async () => {
    const server = createFakeServer(seed())
    server.setDelay(60)
    const user = userEvent.setup()
    let grid!: SpreadsheetGridHandle<Item>
    const { container } = render(() => <AsyncInventory api={server.api} category="A" ref={(h) => (grid = h)} />)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    await user.dblClick(cellAt(container, 2, 3)!)
    const input = screen.getByRole('textbox', { name: '品名 を編集' })
    await user.clear(input)
    await user.type(input, '楽観{Enter}')
    flush()
    console.log('B1 right after Enter: cell', cellAt(container, 2, 3)?.textContent, 'status', screen.getByTestId('status').textContent, 'canUndo', grid.canUndo())
    expect(cellAt(container, 2, 3)).toHaveTextContent('楽観')
    await waitFor(() => expect(server.db.A![1]!.name).toBe('楽観'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('保存済み'))
    await new Promise((r) => setTimeout(r, 150))
    console.log('B1 after save+refresh: cell', cellAt(container, 2, 3)?.textContent, 'status', screen.getByTestId('status').textContent, 'canUndo', grid.canUndo(), 'calls', server.calls.join(','))
    expect(cellAt(container, 2, 3)).toHaveTextContent('楽観')
    // Ctrl+Z
    await user.click(cellAt(container, 1, 3)!)
    await user.keyboard('{Control>}z{/Control}')
    flush()
    await new Promise((r) => setTimeout(r, 150))
    console.log('B1 after Ctrl+Z: cell', cellAt(container, 2, 3)?.textContent, 'db', server.db.A![1]!.name)
  })

  it('保存に失敗すると元の値へ戻る', async () => {
    const server = createFakeServer(seed())
    server.setDelay(60)
    const user = userEvent.setup()
    const onSaveError = vi.fn()
    let grid!: SpreadsheetGridHandle<Item>
    const { container } = render(() => <AsyncInventory api={server.api} category="A" onSaveError={onSaveError} ref={(h) => (grid = h)} />)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    server.failSave()
    await user.dblClick(cellAt(container, 3, 3)!)
    const input = screen.getByRole('textbox', { name: '品名 を編集' })
    await user.clear(input)
    await user.type(input, '失敗する{Enter}')
    flush()
    const optimistic = cellAt(container, 3, 3)?.textContent
    await waitFor(() => expect(onSaveError).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 100))
    flush()
    console.log('B2 optimistic', optimistic, '→ after failure', cellAt(container, 3, 3)?.textContent, 'status', screen.getByTestId('status').textContent, 'canUndo', grid.canUndo(), 'active', JSON.stringify(grid.getActiveCell()))
    expect(cellAt(container, 3, 3)).toHaveTextContent('品目3')
  })

  // S4-21: onRowsChange から action を始めると、保存が終わるまでエディタが閉じず(表示が止まる)、
  // 保存中に別の行を編集すると前の行のエディタに入って前の行に書かれる。直ったら it.fails を外す
  it.fails('続けて 2 回編集する(1 回目の保存中に 2 回目)', async () => {
    const server = createFakeServer(seed())
    server.setDelay(120)
    const user = userEvent.setup()
    const { container } = render(() => <AsyncInventory api={server.api} category="A" />)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    await user.dblClick(cellAt(container, 1, 3)!)
    await user.clear(screen.getByRole('textbox', { name: '品名 を編集' }))
    await user.type(screen.getByRole('textbox', { name: '品名 を編集' }), '一回目{Enter}')
    // 1 回目の保存中(120ms)に 2 行目を編集
    await user.dblClick(cellAt(container, 2, 3)!)
    await user.clear(screen.getByRole('textbox', { name: '品名 を編集' }))
    await user.type(screen.getByRole('textbox', { name: '品名 を編集' }), '二回目{Enter}')
    flush()
    console.log('B3 right after 2nd: r1', cellAt(container, 1, 3)?.textContent, 'r2', cellAt(container, 2, 3)?.textContent)
    await new Promise((r) => setTimeout(r, 600))
    flush()
    console.log('B3 settled: r1', cellAt(container, 1, 3)?.textContent, 'r2', cellAt(container, 2, 3)?.textContent, 'db', server.db.A!.map((r) => r.name).join(','), 'calls', server.calls.join(','))
    expect(server.db.A![0]!.name).toBe('一回目')
    expect(server.db.A![1]!.name).toBe('二回目')
    expect(cellAt(container, 1, 3)).toHaveTextContent('一回目')
    expect(cellAt(container, 2, 3)).toHaveTextContent('二回目')
  })
})

function safe<T>(f: () => T): T | string {
  try {
    return f()
  } catch (e) {
    return `THROWS ${(e as Error).message}`
  }
}
import { AsyncInventoryDeferred } from './AsyncInventoryDeferred'
describe('回避策: action を setTimeout で回す', () => {
  it('続けて 2 回編集する(1 回目の保存中に 2 回目)', async () => {
    const server = createFakeServer(seed())
    server.setDelay(120)
    const user = userEvent.setup()
    const { container } = render(() => <AsyncInventoryDeferred api={server.api} category="A" />)
    await waitFor(() => expect(rowsIn(container)).toHaveLength(4))
    await user.dblClick(cellAt(container, 1, 3)!)
    await user.clear(screen.getByRole('textbox', { name: '品名 を編集' }))
    await user.type(screen.getByRole('textbox', { name: '品名 を編集' }), '一回目{Enter}')
    await user.dblClick(cellAt(container, 2, 3)!)
    await user.clear(screen.getByRole('textbox', { name: '品名 を編集' }))
    await user.type(screen.getByRole('textbox', { name: '品名 を編集' }), '二回目{Enter}')
    await new Promise((r) => setTimeout(r, 600))
    flush()
    expect(server.db.A!.map((r) => r.name).slice(0, 2)).toEqual(['一回目', '二回目'])
    expect(cellAt(container, 1, 3)).toHaveTextContent('一回目')
    expect(cellAt(container, 2, 3)).toHaveTextContent('二回目')
  })
})
