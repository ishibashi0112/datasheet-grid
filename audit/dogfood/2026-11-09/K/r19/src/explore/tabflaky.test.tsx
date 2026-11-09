// @vitest-environment jsdom
import { beforeAll, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const cell = (c: HTMLElement, r: number, key: string) => c.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)!
for (let i = 0; i < 12; i++) {
  test(`tab run ${i}`, async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const { container, unmount } = render(<SpreadsheetGrid<Item> rows={makeItems(3)} columns={inventoryColumns} onRowsChange={onRowsChange} rowKeyGetter={(r) => r.id} />)
    await user.dblClick(cell(container, 0, 'name'))
    const editorAfterDbl = !!document.querySelector('.ssg-cell-editor input')
    const activeEl1 = document.activeElement?.className
    await user.keyboard('{Control>}a{/Control}abc{Tab}')
    const shell = container.querySelector('.ssg-shell')!
    const el = document.getElementById(shell.getAttribute('aria-activedescendant') ?? '')
    process.stdout.write(`run ${i}: editorAfterDbl=${editorAfterDbl} focus=${activeEl1} calls=${onRowsChange.mock.calls.length} name=${onRowsChange.mock.calls[0]?.[0]?.[0]?.name} active=${el?.closest('.ssg-body-row')?.getAttribute('data-row-index')}:${el?.getAttribute('data-ssg-col-key')} focusAfter=${document.activeElement?.className}\n`)
    unmount()
  })
}
