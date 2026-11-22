import '@testing-library/jest-dom/vitest'
import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@solidjs/testing-library'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-solid/testing'
import { preloadGridPopups } from '@ishibashi0112/spreadsheet-grid-solid'

beforeAll(async () => {
  installJsdomLayoutStubs()
  await preloadGridPopups()
})
// vitest の globals を使わないときは自分で片付ける
afterEach(() => cleanup())
