// @vitest-environment jsdom
import { beforeAll, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const cell = (c: HTMLElement, r: number, key: string) => c.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)!
const out = (s: string) => process.stdout.write(s + '\n')
function G({ gridRef, find }: { gridRef: React.Ref<SpreadsheetGridHandle<Item>>; find?: boolean }) {
  const [rows, setRows] = useState(makeItems(20))
  return <SpreadsheetGrid<Item> ref={gridRef} rows={rows} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} find={find} />
}
test('checkbox click on cell vs span', async () => {
  const user = userEvent.setup()
  const ref = createRef<SpreadsheetGridHandle<Item>>()
  const { container } = render(<G gridRef={ref} />)
  await user.click(cell(container, 0, 'discontinued'))
  out(`click cell -> ${within(cell(container, 0, 'discontinued')).getByRole('checkbox').getAttribute('aria-checked')}`)
  await user.click(within(cell(container, 1, 'discontinued')).getByRole('checkbox'))
  out(`click span -> ${within(cell(container, 1, 'discontinued')).getByRole('checkbox').getAttribute('aria-checked')}`)
})
test('drag selection', async () => {
  const user = userEvent.setup()
  const ref = createRef<SpreadsheetGridHandle<Item>>()
  const { container } = render(<G gridRef={ref} />)
  await user.pointer([
    { keys: '[MouseLeft>]', target: cell(container, 0, 'name') },
    { target: cell(container, 1, 'category') },
    { target: cell(container, 2, 'warehouse') },
    { keys: '[/MouseLeft]' },
  ])
  out(`drag sel=${JSON.stringify(ref.current!.getSelection())} elementFromPoint=${typeof document.elementFromPoint}`)
})
test('find bar dom', async () => {
  const user = userEvent.setup()
  const ref = createRef<SpreadsheetGridHandle<Item>>()
  const { container } = render(<G gridRef={ref} find />)
  await user.click(cell(container, 0, 'name'))
  await user.keyboard('{Control>}f{/Control}')
  const bar = document.querySelector('.ssg-find-bar')
  out(`find bar: ${bar?.outerHTML.slice(0, 1500)}`)
  const input = bar?.querySelector('input')
  if (input) {
    await user.type(input, 'モニター')
    await new Promise((r) => setTimeout(r, 200))
    out(`marks=${document.querySelectorAll('.ssg-find-mark').length} bar text=${bar?.textContent}`)
    await user.keyboard('{Enter}')
    out(`active=${JSON.stringify(ref.current!.getActiveCell())}`)
  }
})
