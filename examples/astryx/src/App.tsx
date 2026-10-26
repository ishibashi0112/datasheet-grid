// Astryx(Meta のデザインシステム)の中にグリッドを置く例。
//   themes/astryx.css を読み込むと、グリッドの配色が Astryx のテーマ(色・角丸)に揃います。
//   セルの中には Astryx の部品(Badge / Button)をそのまま描けます。
import { useMemo, useState } from 'react'
import { Badge, type BadgeVariant } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl'
import { Theme, useTheme, type ThemeMode } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid'
import '@astryxdesign/core/astryx.css'
import '@astryxdesign/theme-neutral/theme.css'
import '@ishibashi0112/spreadsheet-grid/style.css'
// グリッドのテーマは style.css の後に読み込みます
import '@ishibashi0112/spreadsheet-grid/themes/astryx.css'

type Status = '有効' | '保留' | '停止'
type Row = { id: number; name: string; qty: number; status: Status; owner: string }

const STATUSES: readonly Status[] = ['有効', '保留', '停止']
const OWNERS = ['山田', '佐藤', '鈴木']
const STATUS_VARIANT: Record<Status, BadgeVariant> = { 有効: 'success', 保留: 'warning', 停止: 'error' }

const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120, status: '有効', owner: '山田' },
  { id: 2, name: 'ナット M6', qty: 80, status: '有効', owner: '佐藤' },
  { id: 3, name: 'ワッシャー', qty: 300, status: '保留', owner: '鈴木' },
  { id: 4, name: 'アングル材', qty: 12, status: '有効', owner: '山田' },
  { id: 5, name: 'リベット', qty: 500, status: '停止', owner: '佐藤' },
  { id: 6, name: '六角レンチ', qty: 45, status: '保留', owner: '鈴木' },
  { id: 7, name: 'スプリングピン', qty: 260, status: '有効', owner: '山田' },
  { id: 8, name: '蝶ボルト', qty: 0, status: '停止', owner: '佐藤' },
]

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

const buildColumns = (onOpen: (row: Row) => void): GridColumn<Row>[] => [
  { key: 'name', title: '品目', width: 170, minWidth: 170, flex: 1, editable: true, filterType: 'text' },
  { key: 'qty', title: '数量', width: 100, align: 'right', editable: true, editor: { type: 'number' }, filterType: 'number' },
  {
    key: 'status',
    title: '状態',
    width: 110,
    editable: true,
    editor: { type: 'select', options: toOptions(STATUSES) },
    filterType: 'set',
    renderCell: ({ row }) => <Badge variant={STATUS_VARIANT[row.status]} label={row.status} />,
  },
  { key: 'owner', title: '担当', width: 110, editable: true, editor: { type: 'select', options: toOptions(OWNERS) }, filterType: 'set' },
  {
    key: 'action',
    title: '操作',
    width: 110,
    renderCell: ({ row }) => <Button label="詳細" size="sm" variant="secondary" onClick={() => onOpen(row)} />,
  },
]

// <Theme> の内側で、実際のライト / ダーク(mode が 'system' のときは OS の設定)をグリッドの theme へ渡します。
//   Astryx の色は light-dark() で定義されているので、グリッドにも同じ mode を渡す必要があります。
function InventoryGrid() {
  const { mode } = useTheme()
  const [rows, setRows] = useState(initialRows)
  const [opened, setOpened] = useState<string | null>(null)
  // 列の定義は描画のたびに作り直さないようにします
  const columns = useMemo(() => buildColumns((row) => setOpened(row.name)), [])

  const addRow = () => {
    setRows((current) => {
      const id = Math.max(0, ...current.map((row) => row.id)) + 1
      return [...current, { id, name: `新しい品目 ${id}`, qty: 0, status: '保留', owner: OWNERS[0] }]
    })
  }

  return (
    <>
      <div className="toolbar">
        <Button label="行を追加" variant="primary" onClick={addRow} />
        <Button label="元に戻す" variant="secondary" onClick={() => setRows(initialRows)} />
        <Badge variant="info" label={`${rows.length} 件`} />
        {opened !== null && <span className="note">「{opened}」の詳細を押しました</span>}
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        theme={mode}
        enableRowSelection
        find
      />
    </>
  )
}

export function App() {
  const [mode, setMode] = useState<ThemeMode>('system')

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <div className="app">
        <header className="toolbar">
          <h1>Astryx の中のグリッド</h1>
          <SegmentedControl label="配色" value={mode} onChange={(value) => setMode(value as ThemeMode)}>
            <SegmentedControlItem value="system" label="システム" />
            <SegmentedControlItem value="light" label="ライト" />
            <SegmentedControlItem value="dark" label="ダーク" />
          </SegmentedControl>
        </header>
        <InventoryGrid />
      </div>
    </Theme>
  )
}