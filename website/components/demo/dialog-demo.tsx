'use client';

// ダイアログの中のグリッド(popupContainer)のデモ: 素の <dialog> を showModal() で開き、その中のグリッドで列メニュー /
// 列フィルター / select の候補 / 右クリックメニューを使う。'body' にすると、ポップアップがダイアログ(トップレイヤー)の
// 後ろに隠れて見えない(1.0.2 までの動き)。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type GridPopupContainer,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; customer: string; region: string; amount: number };

const REGIONS = ['east', 'west', 'north', 'south'];
const REGION_LABELS: Record<string, string> = { east: '東日本', west: '西日本', north: '北海道', south: '九州' };

const columns: GridColumn<Row>[] = [
  { key: 'customer', title: '顧客', width: 180, editable: true, filterType: 'text' },
  {
    key: 'region',
    title: '地域',
    width: 120,
    editable: true,
    editor: { type: 'select', options: REGIONS.map((value) => ({ value, label: REGION_LABELS[value] ?? value })) },
    valueFormatter: ({ value }) => REGION_LABELS[String(value)] ?? String(value ?? ''),
    filterType: 'set',
  },
  {
    key: 'amount',
    title: '取引額',
    width: 130,
    align: 'right',
    editable: true,
    editor: { type: 'number', min: 0 },
    filterType: 'number',
  },
];

const initialRows: Row[] = Array.from({ length: 40 }, (_, index) => ({
  id: index + 1,
  customer: `顧客 ${String(index + 1).padStart(3, '0')}`,
  region: REGIONS[index % REGIONS.length] ?? 'east',
  amount: ((index * 7919) % 90 + 10) * 1000,
}));

export function DialogDemo() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [container, setContainer] = useState<GridPopupContainer>('auto');
  const [picked, setPicked] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="rounded-md border border-fd-border bg-fd-secondary px-3 py-1.5 font-medium hover:bg-fd-accent"
          onClick={() => dialogRef.current?.showModal()}
        >
          ダイアログで開く
        </button>
        <fieldset className="flex items-center gap-3">
          <legend className="sr-only">popupContainer</legend>
          {(['auto', 'body'] as const).map((value) => (
            <label key={value} className="flex items-center gap-1">
              <input type="radio" name="dialog-demo-container" checked={container === value} onChange={() => setContainer(value)} />
              <code>popupContainer=&quot;{value}&quot;</code>
            </label>
          ))}
        </fieldset>
        {picked ? <span className="text-fd-muted-foreground">選んだ顧客: {picked}</span> : null}
      </div>
      <dialog
        ref={dialogRef}
        className="w-[min(640px,92vw)] rounded-lg border border-fd-border bg-fd-background p-4 text-fd-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="mb-3 flex items-center justify-between">
          <strong>顧客を選ぶ</strong>
          <button type="button" className="rounded px-2 py-1 text-sm hover:bg-fd-accent" onClick={() => dialogRef.current?.close()}>
            閉じる
          </button>
        </div>
        <SpreadsheetGrid
          rows={rows}
          columns={columns}
          onRowsChange={setRows}
          rowKeyGetter={(row) => row.id}
          height={300}
          theme="class"
          popupContainer={container}
          enableContextMenu
          getContextMenuItems={({ target }) =>
            target.type === 'cell'
              ? [
                  {
                    label: 'この顧客を選ぶ',
                    onSelect: () => {
                      setPicked(target.row.customer);
                      dialogRef.current?.close();
                    },
                  },
                ]
              : []
          }
        />
        <p className="mt-2 text-xs text-fd-muted-foreground">
          列見出しの ⋮・「地域」のセルのダブルクリック・右クリックで、ポップアップがダイアログの中に出ます。
        </p>
      </dialog>
    </div>
  );
}