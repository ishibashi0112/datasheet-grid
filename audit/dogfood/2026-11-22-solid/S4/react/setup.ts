import '@testing-library/jest-dom/vitest'
import { beforeAll } from 'vitest'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid/testing'
import { preloadGridPopups } from '@ishibashi0112/spreadsheet-grid'

beforeAll(async () => {
  installJsdomLayoutStubs()
  await preloadGridPopups()
})
