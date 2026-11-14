import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup, configure } from '@testing-library/react'

if (process.env.STRICT === '1') configure({ reactStrictMode: true })

afterEach(() => {
  cleanup()
})
