// @vitest-environment jsdom
import { beforeAll, test, vi } from 'vitest'
import { useState } from 'react'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
import { inventoryColumns, makeItems, type Item } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const cell = (c: HTMLElement, r: number, key: string) => c.querySelector<HTMLElement>(`.ssg-body-row[data-row-index="${r}"] [data-ssg-col-key="${key}"]`)!
const modes = ['dbl', 'f2', 'type', 'dbl-wait'] as const
for (const mode of modes) for (let i = 0; i < 8; i++) {
  test(`${mode} ${i}`, async () => {
    const user = userEvent.setup()
    const onRowsChange = vi.fn()
    const events: string[] = []
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Tab') events.push(`tab prevented=${e.defaultPrevented} target=${(e.target as HTMLElement).className}`) }
    window.addEventListener('keydown', onKey)
    function C() { const [rows, setRows] = useState(makeItems(3)); return <SpreadsheetGrid<Item> rows={rows} columns={inventoryColumns} onRowsChange={(n) => { onRowsChange(n); if (process.env.CONTROLLED === '1') setRows(n) }} rowKeyGetter={(r) => r.id} /> }
    const { container, unmount } = render(<C />)
    if (mode === 'dbl' || mode === 'dbl-wait') await user.dblClick(cell(container, 0, 'name'))
    if (mode === 'dbl-wait') await new Promise((r) => setTimeout(r, 50))
    if (mode === 'f2') { await user.click(cell(container, 0, 'name')); await user.keyboard('{F2}') }
    if (mode === 'type') { await user.click(cell(container, 0, 'name')); await user.keyboard('x') }
    await user.keyboard('abc{Tab}')
    const shell = container.querySelector('.ssg-shell')!
    const el = document.getElementById(shell.getAttribute('aria-activedescendant') ?? '')
    process.stdout.write(`${mode} ${i}: active=${el?.getAttribute('data-ssg-col-key')} ${events.join(';')}\n`)
    window.removeEventListener('keydown', onKey)
    unmount()
  })
}
