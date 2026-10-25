// 編集できる在庫表(10,000 行)。よく使う機能をひととおり入れています。
//   行データ(rows)はアプリが持ち、グリッドでの編集は onRowsChange で受け取ります。
import { useRef, useState } from 'react'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { CATEGORIES, STATUSES, createItem, createItems, type Item } from './data'

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

const columns: GridColumn<Item>[] = [
  // pinned: 横にスクロールしても左に残る列
  { key: 'code', title: '品番', width: 100, pinned: 'left', filterType: 'text' },
  // flex: 横の余りを分け合って広がる列(minWidth より狭くはならない)
  { key: 'name', title: '品名', width: 180, minWidth: 180, flex: 1, editable: true, filterType: 'text' },
  {
    key: 'category',
    title: 'カテゴリ',
    width: 110,
    editable: true,
    editor: { type: 'select', options: toOptions(CATEGORIES) },
    filterType: 'set',
  },
  {
    key: 'qty',
    title: '在庫数',
    width: 120,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    // 文字列を返すと、そのセルに印とメッセージが付きます
    validate: ({ value }) =>
      value === null || (Number.isInteger(value) && Number(value) >= 0) || '0 以上の整数で入力してください',
    valueFormatter: numberFormatter(),
    filterType: 'number',
    aggFunc: 'sum', // 合計行に出す集計
    conditionalFormat: { dataBar: {} }, // 値の大きさを背景の帯で表す
  },
  {
    key: 'price',
    title: '単価',
    width: 110,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
    valueFormatter: numberFormatter({ maximumFractionDigits: 0 }), // 円単位で表示(合計行の平均も)
    filterType: 'number',
    aggFunc: 'avg',
  },
  { key: 'arrivedAt', title: '入荷日', width: 130, editable: true, editor: { type: 'date' }, filterType: 'dateSet' },
  {
    key: 'status',
    title: '状態',
    width: 120,
    editable: true,
    editor: { type: 'select', options: toOptions(STATUSES) },
    filterType: 'set',
    conditionalFormat: { chips: { 販売中: 'good', 入荷待ち: 'warning', 販売終了: 'critical' } },
  },
]

export function App() {
  const [rows, setRows] = useState(() => createItems(10_000))
  const gridRef = useRef<SpreadsheetGridHandle<Item>>(null)

  const addRow = () => {
    setRows((current) => [createItem(Math.max(0, ...current.map((row) => row.id)) + 1), ...current])
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>在庫一覧</h1>
        <button type="button" onClick={addRow}>
          先頭に行を追加
        </button>
        <button type="button" onClick={() => gridRef.current?.downloadCsv('inventory.csv')}>
          CSV をダウンロード
        </button>
      </header>
      <p className="hint">
        ダブルクリックか文字の入力で編集 / ドラッグで範囲選択して Ctrl+C・Ctrl+V / 選択範囲の右下の四角を引いて連続データ /
        見出しのメニューでソート・フィルター / Ctrl+F で検索 / Ctrl+Z で元に戻す
      </p>
      <div className="grid-area">
        <SpreadsheetGrid
          ref={gridRef}
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          height="100%" // 親要素(.grid-area)の高さいっぱいに広げる
          theme="auto" // OS のライト / ダークに合わせる
          fillHandle // 右下の四角を引いて連続データ / コピーで埋める
          find // Ctrl+F のセル内検索
          totalRow // 下端に合計行を固定する(列の aggFunc で集計)
        />
      </div>
    </div>
  )
}