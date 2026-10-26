// サーバーサイド行モデル: 100,000 件の受注を、見えている範囲の分だけサーバーから取ってきます。
//   ソート / フィルターはサーバーが処理し(query で届く)、セルの編集は updateRows で保存します。
import { useState } from 'react'
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type ServerSideDataSource,
} from '@ishibashi0112/spreadsheet-grid'
import '@ishibashi0112/spreadsheet-grid/style.css'
import { CATEGORIES, STATUSES, TOTAL_ORDERS, fetchOrders, saveOrders, setFailSaves, type Order } from './fakeServer'

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }))

// dataSource は作り直さない(コンポーネントの外か useMemo で 1 回だけ作る)。作り直すと読み込み直しになります。
const dataSource: ServerSideDataSource<Order> = {
  // [startIndex, endIndex) の行と、条件に合う全体の件数を返します
  getRows: ({ startIndex, endIndex, query, signal }) => fetchOrders({ startIndex, endIndex, query, signal }),
  // セルを編集すると呼ばれます。画面は先に新しい値になり、失敗(reject)すると元の値へ戻ります
  updateRows: async ({ updates }) => {
    await saveOrders(updates.map((update) => update.row))
  },
  // 最初の応答を待たずに、正しい長さのスクロールバーを出すための件数
  initialRowCount: TOTAL_ORDERS,
}

const columns: GridColumn<Order>[] = [
  { key: 'code', title: '受注番号', width: 130, pinned: 'left', filterType: 'text' },
  { key: 'customer', title: '取引先', width: 140, minWidth: 140, flex: 1, filterType: 'text' },
  // サーバーサイドでは全件が手元に無いので、set フィルターの候補は filterOptions で渡します
  { key: 'category', title: 'カテゴリ', width: 110, filterType: 'set', filterOptions: toOptions(CATEGORIES) },
  {
    key: 'status',
    title: '状態',
    width: 120,
    editable: true,
    editor: { type: 'select', options: toOptions(STATUSES) },
    filterType: 'set',
    filterOptions: toOptions(STATUSES),
  },
  {
    key: 'qty',
    title: '数量',
    width: 100,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    filterType: 'number',
  },
  {
    key: 'price',
    title: '単価',
    width: 120,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
    valueFormatter: numberFormatter(),
    filterType: 'number',
  },
  { key: 'orderedAt', title: '受注日', width: 120, filterType: 'date' },
]

export function App() {
  const [failSaves, setFailSavesChecked] = useState(false)

  return (
    <div className="app">
      <header className="toolbar">
        <h1>受注一覧(サーバーサイド行モデル)</h1>
        <label>
          <input
            type="checkbox"
            checked={failSaves}
            onChange={(event) => {
              setFailSavesChecked(event.target.checked)
              setFailSaves(event.target.checked)
            }}
          />
          保存を失敗させる
        </label>
      </header>
      <p className="hint">
        スクロールすると 100 行ずつ取得(0.4 秒の遅延つき)/ 見出しのメニューのソート・フィルターと上の検索欄はサーバー側で処理 /
        セルを編集すると保存(失敗すると元の値へ戻る)
      </p>
      <div className="grid-area">
        <SpreadsheetGrid
          dataSource={dataSource}
          columns={columns}
          rowKeyGetter={(row) => row.id}
          height="100%"
          theme="auto"
        />
      </div>
    </div>
  )
}