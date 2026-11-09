// @vitest-environment jsdom
import { beforeAll, test } from 'vitest'
import { writeFileSync } from 'node:fs'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { preloadGridPopups } from '@ishibashi0112/spreadsheet-grid'
import { InventoryPanel } from '../InventoryPanel'
import { makeItems } from '../inventory'

beforeAll(async () => { installJsdomLayoutStubs(); await preloadGridPopups() })

test('dump filter', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(9)} />)
  await user.click(screen.getByRole('button', { name: '倉庫 の列メニュー' }))
  await user.click(await screen.findByRole('button', { name: 'フィルター…' }))
  writeFileSync('../dump-filter.html', document.body.innerHTML.replace(/></g, '>\n<'))
})
test('dump alt down', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(5)} />)
  const c = container.querySelector('[data-pane="center"].ssg-body-row [data-ssg-col-key="qty"]')!
  await user.click(c)
  console.info('active before', document.activeElement?.className)
  await user.keyboard('{Alt>}{ArrowDown}{/Alt}')
  console.info('active after', document.activeElement?.className, document.activeElement?.textContent)
  writeFileSync('../dump-altdown.html', document.body.innerHTML.replace(/></g, '>\n<'))
})
