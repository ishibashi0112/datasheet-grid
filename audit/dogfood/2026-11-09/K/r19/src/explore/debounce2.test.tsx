// @vitest-environment jsdom
import { beforeAll, test } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { InventoryPanel } from '../InventoryPanel'
import { makeItems } from '../inventory'

beforeAll(() => { installJsdomLayoutStubs() })
const count = (c: HTMLElement) => c.querySelectorAll('[data-pane="center"].ssg-body-row').length
test('timeline', async () => {
  const { container } = render(<InventoryPanel initialItems={makeItems(16)} />)
  const input = screen.getByRole('textbox', { name: 'グローバルフィルター' })
  fireEvent.change(input, { target: { value: 'モニター' } })
  const tl: string[] = [`t0 count=${count(container)} filters=${screen.getByTestId('filters').textContent} grid=${container.querySelector('.ssg-scroll-container')?.getAttribute('aria-rowcount')}`]
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
    tl.push(`t${(i + 1) * 30} count=${count(container)} filters=${screen.getByTestId('filters').textContent} rowcount=${container.querySelector('.ssg-scroll-container')?.getAttribute('aria-rowcount')}`)
  }
  process.stdout.write(tl.join('\n') + '\n')
})
