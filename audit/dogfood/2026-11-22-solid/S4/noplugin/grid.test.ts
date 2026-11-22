// @solidjs/vite-plugin を入れずに(JSX を使わずに)描いたとき
import { it, expect } from 'vitest'
import { render } from '@solidjs/web'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid-solid'
import { installJsdomLayoutStubs } from '@ishibashi0112/spreadsheet-grid-solid/testing'

it('no plugin', () => {
  installJsdomLayoutStubs()
  const div = document.createElement('div')
  document.body.appendChild(div)
  render(() => SpreadsheetGrid({ rows: [{ id: 1, name: 'a' }], columns: [{ key: 'name', width: 100 }] }), div)
  expect(div.querySelectorAll('.ssg-body-cell').length).toBeGreaterThan(0)
})
