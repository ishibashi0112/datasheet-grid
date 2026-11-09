// @vitest-environment jsdom
import { beforeAll, expect, test } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'
import { InventoryPanel } from '../InventoryPanel'

beforeAll(() => { installJsdomLayoutStubs() })
function G({ gridRef }: { gridRef: React.RefObject<SpreadsheetGridHandle<Item> | null> }) {
  const [rows, setRows] = useState(makeItems(10000))
  return <SpreadsheetGrid<Item> ref={gridRef} rows={rows} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} height={400} />
}
const keys = (c: HTMLElement) => [...c.querySelectorAll('[data-pane="center"].ssg-body-row')].map((r) => r.getAttribute('data-row-key'))
test('scrollTo exists?', () => {
  process.stdout.write(`Element.prototype.scrollTo before stubs? ${typeof Element.prototype.scrollTo}\n`)
})
test('manual scrollTop + scroll event', () => {
  const ref = createRef<SpreadsheetGridHandle<Item>>()
  const { container } = render(<G gridRef={ref} />)
  const scroller = container.querySelector<HTMLElement>('.ssg-scroll-container')!
  process.stdout.write(`scrollHeight=${scroller.scrollHeight} clientHeight=${scroller.clientHeight}\n`)
  act(() => ref.current!.scrollToRow(5000, { align: 'start' }))
  process.stdout.write(`after scrollToRow scrollTop=${scroller.scrollTop} pos=${JSON.stringify(ref.current!.getScrollPosition())}\n`)
  scroller.scrollTop = 5000 * 36
  fireEvent.scroll(scroller)
  process.stdout.write(`after manual: scrollTop=${scroller.scrollTop} keys=${keys(container).slice(0,3)} range=${JSON.stringify(ref.current!.getVisibleRowRange())}\n`)
})
test('add row at end of 10000 and edit', async () => {
  const user = userEvent.setup()
  render(<InventoryPanel initialItems={makeItems(10000)} />)
  await user.click(screen.getByRole('button', { name: '行を追加' }))
  const ed = screen.queryByRole('group', { name: '品名 を編集' })
  process.stdout.write(`editor shown after add (10000 rows): ${!!ed}\n`)
})
