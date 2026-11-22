// メンバー一覧(読み取り専用のグリッド。データは同期)
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import { MEMBERS } from './api'

type Member = { id: number; name: string; role: string; capacity: number }
const rows: Member[] = MEMBERS.map((name, i) => ({ id: i + 1, name, role: i % 3 === 0 ? 'リーダー' : 'メンバー', capacity: 30 + (i % 4) * 5 }))
const columns: GridColumn<Member>[] = [
  { key: 'name', title: '名前', width: 140 },
  { key: 'role', title: '役割', width: 120, filterType: 'set' },
  { key: 'capacity', title: '週の稼働(h)', width: 120, align: 'right', filterType: 'number' },
]

export function MembersPage() {
  return (
    <section class="members">
      <h2>メンバー</h2>
      <SpreadsheetGrid rows={rows} columns={columns} rowKeyGetter={(r) => r.id} readOnly ariaLabel="メンバー" />
    </section>
  )
}
