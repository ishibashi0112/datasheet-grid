import type { GridColumn } from '@ishibashi0112/spreadsheet-grid'
type Row = { id: number; cat: string }
const OPTS = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] as const
export const cols: GridColumn<Row>[] = [{ key: 'cat', width: 100, editor: { type: 'select', options: OPTS }, filterOptions: OPTS }]
