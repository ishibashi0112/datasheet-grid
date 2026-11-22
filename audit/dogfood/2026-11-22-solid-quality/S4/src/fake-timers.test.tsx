// 利用側のテスト: vi.useFakeTimers で擬似 API の遅延を進める
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flush } from 'solid-js'
import { render, screen } from '@solidjs/testing-library'
import userEvent from '@testing-library/user-event'
import { AsyncInventory, createFakeServer } from './AsyncInventory'
import { makeItems } from './inventory'

const rowsIn = (c: HTMLElement) => c.querySelectorAll('[data-pane="center"].ssg-body-row')
afterEach(() => vi.useRealTimers())

describe('偽のタイマー', () => {
  it('advanceTimersByTimeAsync で読み込みを進め、編集して保存する', async () => {
    vi.useFakeTimers()
    const server = createFakeServer({ A: makeItems(4) })
    server.setDelay(500)
    const { container } = render(() => <AsyncInventory api={server.api} category="A" />)
    expect(screen.getByTestId('loading')).toBeInTheDocument()
    await vi.advanceTimersByTimeAsync(600)
    flush()
    expect(rowsIn(container)).toHaveLength(4)
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const cell = container.querySelector<HTMLElement>('[data-pane="center"].ssg-body-row[data-row-key="2"] [aria-colindex="3"]')!
    await user.dblClick(cell)
    await user.keyboard('{Control>}a{/Control}X{Enter}')
    flush()
    await vi.advanceTimersByTimeAsync(1200)
    flush()
    expect(server.db.A![1]!.name).toBe('X')
    expect(screen.getByTestId('status')).toHaveTextContent('保存済み')
  })
})
