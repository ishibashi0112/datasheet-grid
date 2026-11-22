// Tailwind v4 + style.layer.css(ドキュメントのレイヤー順の宣言)で、classNames の Tailwind ユーティリティが効くか
import { render } from '@solidjs/web'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import '../src/index.css'

type Row = { id: number; name: string }
const columns: GridColumn<Row>[] = [{ key: 'name', title: 'Name', width: 200 }]
render(
  () => (
    <SpreadsheetGrid
      rows={[{ id: 1, name: 'a' }]}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      classNames={{ root: 'rounded-none border-4 border-rose-500', bodyCell: 'text-red-600' }}
      height={200}
    />
  ),
  document.getElementById('root')!,
)
