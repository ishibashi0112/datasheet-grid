// @vitest-environment jsdom
import { beforeAll, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { InventoryPanel } from '../InventoryPanel'
import { makeItems } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })

test('dump editor', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(3)} />)
  const c = container.querySelector('[data-pane="center"].ssg-body-row [data-ssg-col-key="name"]')!
  await user.click(c)
  await user.keyboard('{F2}')
  writeFileSync('../dump-editor.html', document.body.innerHTML.replace(/></g, '>\n<'))
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: '在庫数 の列メニュー' }))
  await new Promise((r) => setTimeout(r, 300))
  writeFileSync('../dump-menu.html', document.body.innerHTML.replace(/></g, '>\n<'))
})
