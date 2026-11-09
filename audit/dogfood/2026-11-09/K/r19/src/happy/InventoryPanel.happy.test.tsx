// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { preloadGridPopups } from '@ishibashi0112/spreadsheet-grid'
import { InventoryPanel } from '../InventoryPanel'
import { makeItems, type Item } from '../inventory'

// React の act の警告やグリッドの警告を拾うため console を見張る。
const consoleMessages: string[] = []
let restoreStubs: () => void

beforeAll(async () => {
  restoreStubs = installJsdomLayoutStubs()
  await preloadGridPopups()
})
afterAll(() => restoreStubs())

beforeEach(() => {
  consoleMessages.length = 0
  for (const level of ['error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleMessages.push(`[${level}] ${args.map(String).join(' ')}`)
    })
  }
})
const allMessages: { test: string; messages: string[] }[] = []
afterEach(() => {
  if (consoleMessages.length) allMessages.push({ test: expect.getState().currentTestName ?? '', messages: [...consoleMessages] })
  vi.restoreAllMocks()
})
afterAll(async () => {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(process.env.CONSOLE_LOG ?? 'console-log.json', JSON.stringify(allMessages, null, 2))
})

/** 中央のペインの n 番目(0 始まり)のデータ行。 */
function centerRow(container: HTMLElement, index: number) {
  const rows = container.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row')
  return rows[index]
}
function cell(container: HTMLElement, rowIndex: number, colKey: string) {
  const row =
    centerRow(container, rowIndex) ??
    container.querySelectorAll<HTMLElement>('[data-pane="left"].ssg-body-row')[rowIndex]
  const fromCenter = row?.querySelector<HTMLElement>(`[data-ssg-col-key="${colKey}"]`)
  if (fromCenter) return fromCenter
  const left = container.querySelectorAll<HTMLElement>('[data-pane="left"].ssg-body-row')[rowIndex]
  return left.querySelector<HTMLElement>(`[data-ssg-col-key="${colKey}"]`)!
}

function setup(count = 5, props: Partial<React.ComponentProps<typeof InventoryPanel>> = {}) {
  const user = userEvent.setup()
  const onSave = vi.fn<(items: Item[]) => void>()
  const onExport = vi.fn<(csv: string) => void>()
  const utils = render(<InventoryPanel initialItems={makeItems(count)} onSave={onSave} onExport={onExport} {...props} />)
  return { user, onSave, onExport, ...utils }
}

describe('描画', () => {
  test('行とセルが描かれ、書式が当たる', () => {
    const { container } = setup(5)
    expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(5)
    expect(screen.getByRole('grid', { name: '在庫一覧' })).toHaveAttribute('aria-rowcount', '6')
    expect(cell(container, 1, 'name')).toHaveTextContent('ノート 1')
    expect(cell(container, 4, 'price')).toHaveTextContent('20,500')
    expect(cell(container, 4, 'amount')).toHaveTextContent('573,999'.replace('573,999', String((28 * 20500).toLocaleString('en-US'))))
    expect(cell(container, 0, 'sku')).toHaveTextContent('SKU-0001')
    expect(cell(container, 0, 'category')).toHaveTextContent('文房具')
    expect(screen.getByTestId('count')).toHaveTextContent('5 件')
  })

  test('gridcell を役割と名前で引ける', () => {
    setup(3)
    expect(screen.getByRole('gridcell', { name: 'ノート 1' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox', { name: '廃番' })).toHaveLength(3)
  })
})

describe('セルの編集', () => {
  test('ダブルクリック → 入力 → Enter で書き込み、計算列も変わる', async () => {
    const { user, container } = setup(3)
    await user.dblClick(cell(container, 1, 'qty'))
    const editor = await screen.findByRole('group', { name: '在庫数 を編集' })
    const input = within(editor).getByRole('spinbutton')
    await user.clear(input)
    await user.type(input, '12{Enter}')
    expect(cell(container, 1, 'qty')).toHaveTextContent('12')
    expect(cell(container, 1, 'amount')).toHaveTextContent('2,400')
  })

  test('セルを選んで直接打ち始める', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('万年筆{Enter}')
    expect(cell(container, 0, 'name')).toHaveTextContent('万年筆')
  })

  test('F2 → Escape で取り消し', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{F2}')
    const input = within(screen.getByRole('group', { name: '品名 を編集' })).getByRole('textbox')
    await user.clear(input)
    await user.type(input, 'xxx{Escape}')
    expect(cell(container, 0, 'name')).toHaveTextContent('ボールペン 1')
    expect(screen.queryByRole('group', { name: '品名 を編集' })).not.toBeInTheDocument()
  })

  test('select エディタをキーボードで選ぶ', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'category'))
    await user.keyboard('{Enter}')
    const listbox = await screen.findByRole('listbox')
    await user.click(within(listbox).getByRole('option', { name: '電子機器' }))
    expect(cell(container, 0, 'category')).toHaveTextContent('電子機器')
  })

  test('checkbox を Space で切り替える', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'note'))
    await user.keyboard('{ArrowLeft}')
    await user.keyboard(' ')
    expect(within(cell(container, 0, 'discontinued')).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  })

  test('date エディタ', async () => {
    const { user, container } = setup(3)
    await user.dblClick(cell(container, 0, 'arrivedAt'))
    const editor = await screen.findByRole('group', { name: '入荷日 を編集' })
    const input = editor.querySelector('input')!
    expect(input).toHaveAttribute('type', 'date')
    // date 入力は user.type で打てないので change を送る
    fireEvent.change(input, { target: { value: '2026-12-24' } })
    await user.keyboard('{Enter}')
    expect(cell(container, 0, 'arrivedAt')).toHaveTextContent('2026-12-24')
  })

  test('検査: 負の在庫は印が付き、保存で行番号つきのメッセージ', async () => {
    const { user, container, onSave } = setup(3)
    await user.click(cell(container, 2, 'qty'))
    await user.keyboard('-5{Enter}')
    expect(cell(container, 2, 'qty')).toHaveClass('ssg-body-cell--invalid')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByTestId('message')).toHaveTextContent('3 行目の qty')
    expect(onSave).not.toHaveBeenCalled()
  })

  test('readOnly の列は打っても変わらない', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'amount'))
    await user.keyboard('9{Enter}')
    expect(cell(container, 0, 'amount')).toHaveTextContent('0')
  })
})

describe('キー操作', () => {
  test('矢印 / Tab / Home / End / Ctrl+End でアクティブセルが動く', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}')
    const shell = container.querySelector('.ssg-shell')!
    const activeId = () => shell.getAttribute('aria-activedescendant')
    expect(document.getElementById(activeId()!)).toBe(cell(container, 2, 'category'))
    await user.keyboard('{Tab}')
    expect(document.getElementById(activeId()!)).toBe(cell(container, 2, 'warehouse'))
    await user.keyboard('{End}')
    expect(document.getElementById(activeId()!)).toBe(cell(container, 2, 'note'))
    await user.keyboard('{Home}')
    expect(document.getElementById(activeId()!)).toBe(cell(container, 2, 'sku'))
    await user.keyboard('{Control>}{End}{/Control}')
    expect(document.getElementById(activeId()!)).toBe(cell(container, 4, 'note'))
  })

  test('Delete で値を消し、Ctrl+Z / Ctrl+Y で戻す', async () => {
    const { user, container } = setup(3)
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{Delete}')
    expect(cell(container, 0, 'name')).toHaveTextContent('')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell(container, 0, 'name')).toHaveTextContent('ボールペン 1')
    await user.keyboard('{Control>}y{/Control}')
    expect(cell(container, 0, 'name')).toHaveTextContent('')
  })
})

describe('範囲選択とクリップボード', () => {
  test('Shift+矢印で選んで Ctrl+C', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}')
    expect(cell(container, 1, 'category')).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Control>}c{/Control}')
    const text = await navigator.clipboard.readText()
    expect(text).toBe('ボールペン 1\tstationery\nノート 1\tstationery')
  })

  test('Shift+クリックで範囲を選ぶ', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 0, 'qty'))
    await user.keyboard('{Shift>}')
    await user.click(cell(container, 2, 'price'))
    await user.keyboard('{/Shift}')
    expect(screen.getAllByRole('gridcell', { selected: true })).toHaveLength(6)
  })

  test('Ctrl+V で TSV を貼り付ける', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 1, 'qty'))
    await user.paste('3\t1,200\n4\t９００')
    expect(cell(container, 1, 'qty')).toHaveTextContent('3')
    expect(cell(container, 1, 'price')).toHaveTextContent('1,200')
    expect(cell(container, 2, 'qty')).toHaveTextContent('4')
    expect(cell(container, 2, 'price')).toHaveTextContent('900')
    await user.keyboard('{Control>}z{/Control}')
    expect(cell(container, 1, 'qty')).toHaveTextContent('7')
  })
})

describe('フィルターとソート', () => {
  test('グローバルフィルター', async () => {
    const { user, container } = setup(16)
    await user.type(screen.getByRole('textbox', { name: 'グローバルフィルター' }), 'モニター')
    await waitFor(() => expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(2))
    expect(screen.getByTestId('filters')).toHaveTextContent('検索: モニター')
  })

  test('列メニューからフィルター(set)', async () => {
    const { user, container } = setup(9)
    await user.click(screen.getByRole('button', { name: '倉庫 の列メニュー' }))
    await user.click(await screen.findByRole('button', { name: 'フィルター…' }))
    // 大阪だけ外す
    await user.click(await screen.findByRole('checkbox', { name: '大阪' }))
    await user.click(screen.getByRole('button', { name: '閉じる' }))
    await waitFor(() => expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(6))
    expect(screen.getByTestId('filters')).toHaveTextContent('列: warehouse')
  })

  test('Alt+↓ で列メニュー → 降順', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 0, 'qty'))
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
    await user.click(await screen.findByRole('button', { name: /降順で並び替え/ }))
    expect(screen.getByTestId('sort')).toHaveTextContent('qty:desc')
    expect(cell(container, 0, 'qty')).toHaveTextContent('28')
  })
})

describe('ツールバーとハンドル', () => {
  test('行を追加すると、その行の品名の編集が始まる', async () => {
    const { user, container } = setup(3)
    await user.click(screen.getByRole('button', { name: '行を追加' }))
    const editor = await screen.findByRole('group', { name: '品名 を編集' })
    await user.type(within(editor).getByRole('textbox'), '新しい品{Enter}')
    expect(screen.getByTestId('count')).toHaveTextContent('4 件')
    expect(cell(container, 3, 'name')).toHaveTextContent('新しい品')
  })

  test('選んだ行を削除 → Ctrl+Z で戻る', async () => {
    const { user, container } = setup(5)
    await user.click(cell(container, 1, 'name'))
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}')
    await user.click(screen.getByRole('button', { name: '選択した行を削除' }))
    expect(screen.getByTestId('count')).toHaveTextContent('3 件')
    expect(cell(container, 1, 'name')).toHaveTextContent('デスク 1')
    // グリッドへ戻って元に戻す
    await user.click(cell(container, 0, 'name'))
    await user.keyboard('{Control>}z{/Control}')
    expect(screen.getByTestId('count')).toHaveTextContent('5 件')
  })

  test('CSV', async () => {
    const { user, onExport } = setup(2)
    await user.click(screen.getByRole('button', { name: 'CSV' }))
    expect(onExport).toHaveBeenCalledTimes(1)
    const csv = onExport.mock.calls[0][0]
    expect(csv.split(/\r?\n/)[0]).toContain('SKU')
    expect(csv).toContain('ボールペン 1')
  })
})

