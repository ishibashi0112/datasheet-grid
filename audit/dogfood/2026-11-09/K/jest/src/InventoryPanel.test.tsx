import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid, preloadGridPopups, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { InventoryPanel } from './InventoryPanel'
import { inventoryColumns, makeItems, type Item } from './inventory'

const messages: string[] = []
beforeAll(async () => {
  installJsdomLayoutStubs()
  await preloadGridPopups()
})
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...a) => { messages.push(a.map(String).join(' ')) })
  jest.spyOn(console, 'warn').mockImplementation((...a) => { messages.push(a.map(String).join(' ')) })
})
afterEach(() => jest.restoreAllMocks())
afterAll(() => { if (messages.length) process.stdout.write('CONSOLE:\n' + messages.join('\n---\n') + '\n') })

const cell = (c: HTMLElement, r: number, key: string) =>
  c.querySelectorAll<HTMLElement>('[data-pane="center"].ssg-body-row')[r].querySelector<HTMLElement>(`[data-ssg-col-key="${key}"]`)!

test('描画と編集', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(5)} />)
  expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(5)
  await user.dblClick(cell(container, 1, 'qty'))
  const input = within(screen.getByRole('group', { name: '在庫数 を編集' })).getByRole('spinbutton')
  await user.clear(input)
  await user.type(input, '12{Enter}')
  expect(cell(container, 1, 'amount')).toHaveTextContent('2,400')
})

test('コピーと貼り付け', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(5)} />)
  await user.click(cell(container, 0, 'name'))
  await user.keyboard('{Shift>}{ArrowDown}{/Shift}{Control>}c{/Control}')
  expect(await navigator.clipboard.readText()).toBe('ボールペン 1\nノート 1')
  await user.click(cell(container, 2, 'qty'))
  await user.paste('5\t700')
  expect(cell(container, 2, 'price')).toHaveTextContent('700')
})

test('列フィルター', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(9)} />)
  await user.click(screen.getByRole('button', { name: '倉庫 の列メニュー' }))
  await user.click(await screen.findByRole('button', { name: 'フィルター…' }))
  await user.click(await screen.findByRole('checkbox', { name: '大阪' }))
  await user.click(screen.getByRole('button', { name: '閉じる' }))
  await waitFor(() => expect(container.querySelectorAll('[data-pane="center"].ssg-body-row')).toHaveLength(6))
})

test('ハンドル', () => {
  const ref = createRef<SpreadsheetGridHandle<Item>>()
  function H() {
    const [rows, setRows] = useState(makeItems(5))
    return <SpreadsheetGrid<Item> ref={ref} rows={rows} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
  }
  render(<H />)
  expect(ref.current?.getColIndex('name')).toBe(1)
  expect(ref.current?.exportCsv().split(/\r?\n/)[0]).toContain('SKU')
})
