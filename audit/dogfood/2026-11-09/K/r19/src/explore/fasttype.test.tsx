// @vitest-environment jsdom
import { beforeAll, expect, test } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const cell = (c: HTMLElement, r: number, key: string) => c.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)!
function C() { const [rows, setRows] = useState(makeItems(5)); return <SpreadsheetGrid<Item> rows={rows} columns={inventoryColumns} onRowsChange={setRows} rowKeyGetter={(r) => r.id} /> }
for (let i = 0; i < 6; i++) {
  test(`続けて打つ ${i}`, async () => {
    const user = userEvent.setup()
    const { container, unmount } = render(<C />)
    await user.click(cell(container, 0, 'note'))
    await user.keyboard('aa{Enter}bb{Enter}cc{Enter}')
    const got = [0, 1, 2].map((r) => cell(container, r, 'note').textContent)
    process.stdout.write(`run ${i}: ${JSON.stringify(got)}\n`)
    unmount()
  })
  test(`Tab の後 waitFor ${i}`, async () => {
    const user = userEvent.setup()
    const { container, unmount } = render(<C />)
    await user.dblClick(cell(container, 0, 'name'))
    await user.keyboard('abc{Tab}')
    const shell = container.querySelector('.ssg-shell')!
    await waitFor(() => expect(document.getElementById(shell.getAttribute('aria-activedescendant') ?? '')?.getAttribute('data-ssg-col-key')).toBe('category'))
    unmount()
  })
}
