// @vitest-environment jsdom
import { beforeAll, expect, test, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
function G() {
  const [rows, setRows] = useState(makeItems(3))
  return <SpreadsheetGrid<Item> rows={rows} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} />
}
test('fake timers steps', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const log = (s: string) => process.stdout.write(`STEP ${s} pending=${vi.getTimerCount()}\n`)
  log('before render')
  const { container } = render(<G />)
  log('after render')
  const c = container.querySelector<HTMLElement>('[data-pane="center"].ssg-body-row [data-ssg-col-key="name"]')!
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  log('setup')
  const p = user.click(c)
  log('click started')
  await p
  log('after click')
  await user.keyboard('a')
  log('after a')
  await user.keyboard('{Enter}')
  log('after enter')
  expect(c).toHaveTextContent('a')
  vi.useRealTimers()
}, 15000)

test('fake timers with fireEvent only', async () => {
  vi.useFakeTimers()
  const { container } = render(<G />)
  const { fireEvent } = await import('@testing-library/react')
  const c = container.querySelector<HTMLElement>('[data-pane="center"].ssg-body-row [data-ssg-col-key="name"]')!
  fireEvent.pointerDown(c, { pointerId: 1, button: 0 })
  fireEvent.pointerUp(c, { pointerId: 1, button: 0 })
  fireEvent.click(c)
  process.stdout.write(`timers after click ${vi.getTimerCount()}\n`)
  act(() => { vi.advanceTimersByTime(100) })
  process.stdout.write(`timers after advance ${vi.getTimerCount()}\n`)
  vi.useRealTimers()
}, 15000)
