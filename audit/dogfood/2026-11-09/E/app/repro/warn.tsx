// 機能を入れていない /lite のグリッドに、いろいろな機能の prop を渡したときの開発時の警告
import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid/lite';
import '@ishibashi0112/spreadsheet-grid/style.css';

const Grid = createSpreadsheetGrid({ features: {} });

type Row = { id: number; kind?: 'label'; name: string; qty: number; cat: string };
const columns: GridColumn<Row>[] = [
  { key: 'name', title: '名前', width: 160, filterType: 'text', autoHeight: true },
  { key: 'qty', title: '数量', width: 100, filterType: 'number', aggFunc: 'sum', conditionalFormat: { dataBar: {} } },
  { key: 'cat', title: '区分', width: 100, rowGroup: true },
];
function App() {
  const [rows, setRows] = useState<Row[]>(Array.from({ length: 30 }, (_, i) => (i % 10 === 0 ? { id: i, kind: 'label', name: `節 ${i}`, qty: 0, cat: '' } : { id: i, name: `item ${i}`, qty: i, cat: i % 2 ? 'A' : 'B' })));
  const ref = useRef<SpreadsheetGridHandle<Row>>(null);
  (window as unknown as { gridRef: typeof ref }).gridRef = ref;
  return (
    <Grid
      ref={ref}
      rows={rows}
      onRowsChange={setRows}
      onColumnsChange={() => {}}
      columns={columns}
      rowKeyGetter={(r) => r.id}
      height={400}
      fillHandle
      find
      enableRowDrag
      labelRow={{ isLabelRow: (r) => r.kind === 'label', getLabel: (r) => r.name }}
      enableContextMenu
      getContextMenuItems={() => [{ label: 'x', onSelect: () => {} }]}
      totalRow
      imeDirectInput
      scrollHint
      highlightChanges
      hoverHighlight="cross"
      showCopyRange
      autoHeight
      showFilterChipBar
      autoSizeColumns="onMount"
      dataSource={{ getRows: async () => ({ rows: [], totalRowCount: 0 }) }}
      initialState={{ filters: { name: { type: 'text', value: 'item' } } as never }}
    />
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
