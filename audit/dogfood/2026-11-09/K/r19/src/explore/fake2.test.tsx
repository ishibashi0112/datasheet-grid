// @vitest-environment jsdom
import { test, vi, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
test('plain button with fake timers', async () => {
  vi.useFakeTimers()
  const onClick = vi.fn()
  render(<button onClick={onClick}>b</button>)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await user.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalled()
  vi.useRealTimers()
}, 8000)
test('plain button with fake timers, shouldAdvanceTime', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const onClick = vi.fn()
  render(<button onClick={onClick}>b</button>)
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  await user.click(screen.getByRole('button'))
  expect(onClick).toHaveBeenCalled()
  vi.useRealTimers()
}, 8000)
