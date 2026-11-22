// 会議室の一覧(別のページ。行き来するとグリッドが外れて付く)
import { createSignal } from 'solid-js'
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid'
import { ROOMS, type Room } from '../data'

const columns: GridColumn<Room>[] = [
  { key: 'id', title: 'ID', width: 60, pinned: 'left', editable: false },
  { key: 'name', title: '名前', width: 160 },
  { key: 'capacity', title: '定員', width: 80, align: 'right', editor: { type: 'number', min: 1, integer: true } },
  { key: 'floor', title: '階', width: 60, align: 'right', editor: { type: 'number', min: 1, integer: true } },
]

export function RoomsPage() {
  const [rooms, setRooms] = createSignal(ROOMS.map((room) => ({ ...room })))
  return (
    <div class="grid-area">
      <SpreadsheetGrid rows={rooms()} columns={columns} onRowsChange={(next) => setRooms(next)} rowKeyGetter={(row) => row.id} height="100%" />
    </div>
  )
}
