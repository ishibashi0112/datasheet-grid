// @vitest-environment jsdom
import { beforeAll, expect, test } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { InventoryPanel } from '../InventoryPanel'
import { makeItems } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const count = (c: HTMLElement) => c.querySelectorAll('[data-pane="center"].ssg-body-row').length
test('global filter is it immediate?', async () => {
  const user = userEvent.setup()
  const { container } = render(<InventoryPanel initialItems={makeItems(16)} />)
  await user.type(screen.getByRole('textbox', { name: 'グローバルフィルター' }), 'モニター')
  const immediate = count(container)
  const t0 = Date.now()
  await waitFor(() => expect(count(container)).toBe(2))
  process.stdout.write(`immediate=${immediate} waited=${Date.now() - t0}ms\n`)
})
test('fireEvent.change on global filter', async () => {
  const { container } = render(<InventoryPanel initialItems={makeItems(16)} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'グローバルフィルター' }), { target: { value: 'モニター' } })
  const immediate = count(container)
  const t0 = Date.now()
  await waitFor(() => expect(count(container)).toBe(2))
  process.stdout.write(`fireEvent immediate=${immediate} waited=${Date.now() - t0}ms\n`)
})
