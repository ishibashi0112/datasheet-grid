'use client';

// 展開行(Master/Detail)のデモ: 受注行を展開すると、明細(サブグリッド = ネストした
//   SpreadsheetGrid)とメモ入力を持つカードが行の直下に開く。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Line = { id: number; product: string; qty: number; unitPrice: number };
type Order = {
  id: string;
  customer: string;
  status: string;
  orderedAt: string;
  lines: Line[];
};

const columns: GridColumn<Order>[] = [
  { key: 'id', title: '受注 No', width: 110, pinned: 'left' },
  { key: 'customer', title: '得意先', width: 160 },
  { key: 'status', title: '状態', width: 100, filterType: 'set' },
  { key: 'orderedAt', title: '受注日', width: 120, filterType: 'date' },
  {
    key: 'lines',
    title: '明細数',
    width: 90,
    align: 'right',
    getValue: (row) => row.lines.length,
  },
  {
    key: 'total',
    title: '合計',
    width: 130,
    align: 'right',
    getValue: (row) =>
      row.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
    valueFormatter: numberFormatter(),
  },
];

const lineColumns: GridColumn<Line>[] = [
  { key: 'product', title: '商品', width: 200 },
  { key: 'qty', title: '数量', width: 80, align: 'right' },
  {
    key: 'unitPrice',
    title: '単価',
    width: 110,
    align: 'right',
    valueFormatter: numberFormatter(),
  },
  {
    key: 'amount',
    title: '金額',
    width: 120,
    align: 'right',
    getValue: (row) => row.qty * row.unitPrice,
    valueFormatter: numberFormatter(),
  },
];

const orders: Order[] = [
  {
    id: 'SO-2401',
    customer: '株式会社アオイ商事',
    status: '出荷済',
    orderedAt: '2026-08-03',
    lines: [
      { id: 1, product: 'ノート PC 14"', qty: 4, unitPrice: 128_000 },
      { id: 2, product: 'ドッキングステーション', qty: 4, unitPrice: 24_000 },
      { id: 3, product: 'USB-C ケーブル 2m', qty: 8, unitPrice: 1_800 },
    ],
  },
  {
    id: 'SO-2402',
    customer: '北浜テクノ株式会社',
    status: '受注',
    orderedAt: '2026-08-05',
    lines: [
      { id: 1, product: '27" モニター', qty: 6, unitPrice: 42_000 },
      { id: 2, product: 'モニターアーム', qty: 6, unitPrice: 9_800 },
    ],
  },
  {
    id: 'SO-2403',
    customer: '有限会社みなと印刷',
    status: 'キャンセル',
    orderedAt: '2026-08-06',
    lines: [],
  },
  {
    id: 'SO-2404',
    customer: '株式会社アオイ商事',
    status: '出荷準備',
    orderedAt: '2026-08-10',
    lines: [
      { id: 1, product: 'メカニカルキーボード', qty: 10, unitPrice: 15_000 },
      { id: 2, product: 'ワイヤレスマウス', qty: 10, unitPrice: 5_400 },
      { id: 3, product: 'マウスパッド', qty: 10, unitPrice: 1_200 },
      { id: 4, product: 'ヘッドセット', qty: 5, unitPrice: 12_800 },
    ],
  },
  {
    id: 'SO-2405',
    customer: '桜井物産株式会社',
    status: '受注',
    orderedAt: '2026-08-12',
    lines: [{ id: 1, product: 'サーバーラック 42U', qty: 1, unitPrice: 320_000 }],
  },
  {
    id: 'SO-2406',
    customer: '北浜テクノ株式会社',
    status: '出荷済',
    orderedAt: '2026-08-15',
    lines: [
      { id: 1, product: 'NAS 4 ベイ', qty: 2, unitPrice: 98_000 },
      { id: 2, product: 'HDD 8TB', qty: 8, unitPrice: 26_000 },
    ],
  },
];

function OrderDetailCard({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  const [memo, setMemo] = useState('');
  return (
    <div className="flex h-full flex-col gap-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <strong>
          {order.id} / {order.customer} の明細
        </strong>
        <button
          type="button"
          className="rounded-md border px-2 py-0.5 text-xs hover:bg-fd-accent"
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
      {/* カード内にネストした SpreadsheetGrid(外側のキーボード / 選択とは独立に動く) */}
      <SpreadsheetGrid
        rows={order.lines}
        columns={lineColumns}
        rowKeyGetter={(line) => line.id}
        height={130}
        theme="auto"
        density="compact"
        showTopBar={false}
        showBottomBar={false}
        readOnly
      />
      <label className="flex items-center gap-2">
        <span className="shrink-0 text-fd-muted-foreground">メモ</span>
        <input
          className="w-full rounded-md border border-fd-border bg-transparent px-2 py-1"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="カード内の入力は外側のグリッドに影響しません"
        />
      </label>
    </div>
  );
}

export function DetailRowDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Order>>(null);
  const [expandedKeys, setExpandedKeys] = useState<(string | number)[]>([]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.setDetailRowExpanded('SO-2404', true)}
        >
          SO-2404 を開く
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.collapseAllDetailRows()}
        >
          すべて閉じる
        </button>
        <span className="text-fd-muted-foreground">
          展開中: {expandedKeys.length === 0 ? 'なし' : expandedKeys.join(', ')}
        </span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={orders}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={420}
        theme="auto"
        readOnly
        detailRow={{
          height: 230,
          // 明細のない受注(キャンセル)は展開できない
          isExpandable: (row) => row.lines.length > 0,
          render: ({ row, collapse }) => (
            <OrderDetailCard order={row} onClose={collapse} />
          ),
        }}
        onExpandedDetailRowKeysChange={setExpandedKeys}
      />
    </div>
  );
}