// Solid 版で動くデモ(Solid のクイックスタート)。このサイトは Next.js(React)なので、Solid の JSX は使わず
// createComponent で書き、React の部品(../solid-basic-grid-demo.tsx)が用意した要素へ @solidjs/web の render で描く。
// 表は React 版のデモ(basic-grid-demo.tsx)と同じ。CSS は同じファイルなので、サイトが読み込んだ style.css が効く。
import { createComponent, createSignal } from 'solid-js';
import { render } from '@solidjs/web';
import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid';

type Row = { id: number; name: string; qty: number; price: number };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: '商品名', width: 200, editable: true, filterType: 'text' },
  {
    key: 'qty',
    title: '数量',
    width: 120,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
    filterType: 'number',
  },
  {
    key: 'price',
    title: '単価',
    width: 140,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
    filterType: 'number',
  },
];

const initialRows: Row[] = [
  { id: 1, name: 'りんご', qty: 3, price: 120 },
  { id: 2, name: 'バナナ', qty: 5, price: 80 },
  { id: 3, name: 'みかん', qty: 8, price: 60 },
  { id: 4, name: 'ぶどう', qty: 2, price: 480 },
];

function BasicGrid() {
  const [rows, setRows] = createSignal<Row[]>(initialRows);
  // JSX の <SpreadsheetGrid rows={rows()} … /> と同じ(props の rows は getter にして signal に追従させる)
  return createComponent(SpreadsheetGrid<Row>, {
    get rows() {
      return rows();
    },
    columns,
    onRowsChange: (next: Row[]) => setRows(next),
    rowKeyGetter: (row: Row) => row.id,
    height: 280,
    theme: 'class',
  });
}

// 描いて、外すための関数を返す
export function mountSolidBasicGrid(element: HTMLElement): () => void {
  return render(() => createComponent(BasicGrid, {}), element);
}