// 利用側のテスト: <Show> でグリッドを出し入れしたときの ref
import { describe, expect, it } from 'vitest'
import { createEffect, createSignal, flush, Show } from 'solid-js'
import { render, screen } from '@solidjs/testing-library'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, makeItems, type Item } from './inventory'

function setup(initiallyVisible: boolean) {
  const [visible, setVisible] = createSignal(initiallyVisible)
  const [rows, setRows] = createSignal<Item[]>(makeItems(50))
  const log: string[] = []
  let grid!: SpreadsheetGridHandle<Item>
  const r = render(() => {
    createEffect(
      () => visible(),
      (v) => {
        if (!v) return
        try {
          grid.selectCell(20, 1)
          log.push(`effect: active=${JSON.stringify(grid.getActiveCell())}`)
        } catch (e) {
          log.push(`effect THROWS ${(e as Error).message}`)
        }
      },
    )
    return (
      <>
        <button type="button" onClick={() => setVisible((v) => !v)}>
          出し入れ
        </button>
        <Show when={visible()}>
          <SpreadsheetGrid ref={grid} rows={rows()} columns={inventoryColumns} rowKeyGetter={(x) => x.id} onRowsChange={setRows} />
        </Show>
      </>
    )
  })
  return { ...r, log, rows, setRows, setVisible, grid: () => grid }
}

describe('<Show> と ref', () => {
  it('最初から出しているとき、親の最初の effect でハンドルを使える', () => {
    const t = setup(true)
    flush()
    expect(t.log).toEqual(['effect: active={"row":20,"col":1}'])
  })

  it('あとから出したとき、出した直後の effect でハンドルを使える', () => {
    const t = setup(false)
    flush()
    expect(t.log).toEqual([])
    t.setVisible(true)
    flush()
    expect(t.log).toEqual(['effect: active={"row":20,"col":1}'])
    expect(screen.getByRole('grid')).toBeInTheDocument()
  })

  it('隠して出し直すと ref の変数は新しいハンドルに替わる', () => {
    const t = setup(true)
    flush()
    const first = t.grid()
    t.setVisible(false)
    flush()
    expect(screen.queryByRole('grid')).toBeNull()
    t.setVisible(true)
    flush()
    expect(t.grid()).not.toBe(first)
    expect(t.log).toHaveLength(2)
    expect(t.grid().getActiveCell()).toEqual({ row: 20, col: 1 })
  })

  // S4-22: 隠している間も ref の変数は外したグリッドのハンドルのまま。呼ぶと古い行で親の行を上書きする
  it('隠している間に ref の変数のハンドルを呼ぶと?', () => {
    const t = setup(true)
    flush()
    t.setVisible(false)
    flush()
    t.setRows([...t.rows(), { ...makeItems(1)[0]!, id: 999, name: '隠している間に足した行' }])
    flush()
    expect(t.rows()).toHaveLength(51)
    let threw = ''
    try {
      t.grid().applyRows((prev) => prev.filter((r) => r.id !== 1))
    } catch (e) {
      threw = (e as Error).message
    }
    flush()
    console.log('S4-22 after stale applyRows: threw', JSON.stringify(threw), 'rows', t.rows().length, 'has 999', t.rows().some((r) => r.id === 999))
    // 期待: 何もしない(または例外)。実際: 外したグリッドの古い行(50 行)から 1 行を消した 49 行で上書きし、999 が消える
    expect(t.rows().some((r) => r.id === 999)).toBe(false)
  })
})