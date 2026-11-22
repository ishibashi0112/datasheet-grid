// React 版を Node の renderToString で描いたとき、固定していない列の見出しとセルが HTML に出るか
import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { SpreadsheetGrid } from '@ishibashi0112/spreadsheet-grid'
const columns = [
  { key: 'id', title: 'ID', width: 80, pinned: 'left' },
  { key: 'name', title: 'Name', width: 180, pinned: 'left' },
  { key: 'email', title: 'Email', width: 240 },
  { key: 'role', title: 'Role', width: 120 },
]
const rows = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: 'User ' + i, email: `u${i}@example.com`, role: 'admin' }))
const ds = { getRows: async () => ({ rows: [], rowCount: 50 }), initialRowCount: 50 }
for (const [label, props] of [['clientSide', { rows }], ['serverSide', { dataSource: ds }]]) {
  const html = renderToString(h(SpreadsheetGrid, { ...props, columns, rowKeyGetter: (r) => r.id, height: 400 }))
  const heads = [...html.matchAll(/role="columnheader"[^>]*?data-ssg-col-key="([^"]+)"|data-ssg-col-key="([^"]+)"[^>]*?role="columnheader"/g)].map((m) => m[1] ?? m[2])
  const cells = [...html.matchAll(/data-ssg-col-key="(email|role)"/g)].length
  console.log(label, 'len', html.length, 'headers', JSON.stringify(heads), 'email/role cells', cells)
}
