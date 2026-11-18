// 試作のデモ: 10,000 行の編集できる在庫表(左右の固定列 + 横に長い列で縦横の仮想化を確かめる)。
import { createSignal } from 'solid-js';
import { render } from '@solidjs/web';
import '../../react/src/styles.css';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '../src';

type Item = {
  id: number;
  name: string;
  category: string;
  qty: number;
  price: number;
  note: string;
  extra: Record<string, number>;
};

const CATEGORIES = ['文具', '食品', '家電', '衣料', '工具'];
const EXTRA_KEYS = Array.from({ length: 30 }, (_, i) => `m${i + 1}`);

const createRows = (count: number): Item[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `品目 ${i + 1}`,
    category: CATEGORIES[i % CATEGORIES.length] ?? '',
    qty: (i * 7) % 100,
    price: 100 + ((i * 37) % 900),
    note: '',
    extra: Object.fromEntries(EXTRA_KEYS.map((key, k) => [key, (i * (k + 3)) % 1000])),
  }));

const columns: GridColumn<Item>[] = [
  { key: 'id', title: 'ID', width: 72, pinned: 'left', editable: false },
  { key: 'name', title: '品名', width: 160 },
  { key: 'category', title: '分類', width: 100 },
  { key: 'qty', title: '数量', width: 90, align: 'right', editor: { type: 'number' } },
  { key: 'price', title: '単価', width: 100, align: 'right', editor: { type: 'number' } },
  ...EXTRA_KEYS.map<GridColumn<Item>>((key) => ({
    key,
    title: key.toUpperCase(),
    width: 90,
    align: 'right',
    getValue: (row) => row.extra[key],
    setValue: (row, value) => ({ ...row, extra: { ...row.extra, [key]: Number(value) || 0 } }),
  })),
  { key: 'note', title: 'メモ', width: 180, pinned: 'right' },
];

function App() {
  const [rows, setRows] = createSignal(createRows(10_000));
  const [active, setActive] = createSignal('');
  let handle: SpreadsheetGridHandle<Item> | undefined;
  return (
    <div style={{ padding: '16px', 'font-family': 'system-ui, sans-serif' }}>
      <h1 style={{ 'font-size': '18px', margin: '0 0 8px' }}>Solid 2.0 版の試作</h1>
      <div style={{ display: 'flex', gap: '8px', 'margin-bottom': '8px', 'align-items': 'center' }}>
        <button type="button" data-testid="scroll-bottom" onClick={() => handle?.scrollToRow(9_999)}>
          最後の行へ
        </button>
        <button type="button" data-testid="undo" onClick={() => handle?.undo()}>
          元に戻す
        </button>
        <span data-testid="active">{active()}</span>
      </div>
      <SpreadsheetGrid<Item>
        ref={(h) => {
          handle = h;
          (window as unknown as { gridHandle: unknown }).gridHandle = h;
        }}
        rows={rows()}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        onRowsChange={setRows}
        height={520}
        ariaLabel="在庫表"
        onActiveCellChange={(cell) => setActive(cell ? `${cell.columnKey} / ${String(cell.rowKey)}` : '')}
      />
    </div>
  );
}

render(() => <App />, document.getElementById('app')!);