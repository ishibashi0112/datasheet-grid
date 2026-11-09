import { useMemo, useRef, useState } from 'react'
import {
  SpreadsheetGrid,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid'

// 日常点検表: 行 = 設備、列 = 日(1〜30)。階ごとの見出しはラベル行。
type Mark = '○' | '△' | '×' | ''
type Section = { kind: 'label'; id: string; floor: string }
type Equip = { kind: 'item'; id: string; floor: string; equipment: string } & Record<`d${number}`, Mark>
export type DailyRow = Section | Equip

const DAYS = 30
const floors = ['1F', '2F', '3F', '4F', '5F', '屋上']
const equipments = ['空調機', '換気扇', '照明', '非常灯', '消火器', '給水ポンプ', '排水ポンプ', '分電盤']
const weekday = ['日', '月', '火', '水', '木', '金', '土']

function createRows(): DailyRow[] {
  const rows: DailyRow[] = []
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const floor of floors) {
    rows.push({ kind: 'label', id: `L-${floor}`, floor })
    for (const eq of equipments) {
      const row = { kind: 'item', id: `${floor}-${eq}`, floor, equipment: eq } as Equip
      for (let d = 1; d <= DAYS; d++) {
        const r = rand()
        row[`d${d}`] = d > 9 ? '' : r < 0.85 ? '○' : r < 0.95 ? '△' : '×'
      }
      rows.push(row)
    }
  }
  return rows
}

const markOptions = [
  { label: '○ 異常なし', value: '○' },
  { label: '△ 要観察', value: '△' },
  { label: '× 異常', value: '×' },
  { label: '(未点検)', value: '' },
]

function dayColumns(): GridColumn<DailyRow>[] {
  const cols: GridColumn<DailyRow>[] = []
  for (let d = 1; d <= DAYS; d++) {
    const date = new Date(2026, 10, d)
    const wd = weekday[date.getDay()]
    cols.push({
      key: `d${d}`,
      title: `${d}日(${wd})`,
      width: 56,
      align: 'center',
      editor: { type: 'select', options: markOptions },
      conditionalFormat: { chips: { '○': { tone: 'good', icon: false }, '△': { tone: 'warning', icon: false }, '×': { tone: 'critical', icon: false } } },
      renderHeader: () => (
        <span className={date.getDay() === 0 || date.getDay() === 6 ? 'day-head weekend' : 'day-head'}>
          {d}
          <small>{wd}</small>
        </span>
      ),
      aggFunc: ({ values }) => values.filter((v) => v === '×').length || '',
    })
  }
  return cols
}

const columns: GridColumn<DailyRow>[] = [
  { key: 'equipment', title: '設備', width: 110, pinned: 'left', editable: false },
  ...dayColumns(),
  {
    key: 'ng',
    title: '異常',
    width: 64,
    pinned: 'right',
    align: 'right',
    editable: false,
    getValue: (row) => {
      if (row.kind !== 'item') return null
      let n = 0
      for (let d = 1; d <= DAYS; d++) if (row[`d${d}`] === '×') n++
      return n
    },
    aggFunc: 'sum',
  },
]

export function DailySheet() {
  const gridRef = useRef<SpreadsheetGridHandle<DailyRow>>(null)
  const [rows, setRows] = useState<DailyRow[]>(createRows)
  const today = 9
  const goToday = () => {
    const grid = gridRef.current
    const col = grid?.getColIndex(`d${today}`) ?? -1
    if (grid && col >= 0) {
      grid.selectCell(1, col, { scrollIntoView: true })
      grid.focus()
    }
  }
  const labelRow = useMemo(
    () => ({
      isLabelRow: (row: DailyRow): row is Section => row.kind === 'label',
      getLabel: (row: Section) => row.floor,
      sticky: true,
    }),
    [],
  )
  return (
    <div className="daily">
      <div className="daily-tools">
        <button type="button" onClick={goToday}>
          今日({today}日)へ
        </button>
      </div>
      <div className="app-grid">
        <SpreadsheetGrid<DailyRow, Section>
          ref={gridRef}
          ariaLabel="日常点検表 2026年11月"
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          labelRow={labelRow}
          totalRow={{ label: '異常' }}
          height="100%"
          enableColumnFilter={false}
          enableGlobalFilter={false}
        />
      </div>
    </div>
  )
}
