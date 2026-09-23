'use client';

// ラベル行(見出し / 区切り行)のデモ: 見積明細を工程ごとの見出し行で区切る。
//   見出し行は rows の中に混在させ(kind: 'label')、labelRow prop で識別 / 描画する。
//   縦固定(sticky)・セクション内ソート・件数表示・エクスポートの includeLabelRows を確認できる。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = {
  id: string;
  kind?: 'label';
  code: string;
  name: string;
  spec: string;
  qty: number;
  unitPrice: number;
  status: '有効' | '保留';
};

const label = (id: string, name: string): Row => ({
  id,
  kind: 'label',
  code: '',
  name,
  spec: '',
  qty: 0,
  unitPrice: 0,
  status: '有効',
});

const rows: Row[] = [
  label('s1', 'ベルトコンベヤー(TAC23A0042)'),
  { id: 'a1', code: '3B0620AEZ6', name: 'ベアリング', spec: '6204ZZ', qty: 3, unitPrice: 570, status: '有効' },
  { id: 'a2', code: '6FA000B357', name: 'ステッピングモータ', spec: 'B-20 A70UPRJ00', qty: 1, unitPrice: 1_710, status: '有効' },
  { id: 'a3', code: '7641205200', name: 'スペーサー', spec: 'STKM-13C', qty: 2, unitPrice: 50, status: '保留' },
  { id: 'a4', code: '7641205401', name: 'スペーサー', spec: 'STKM-13A', qty: 1, unitPrice: 7_200, status: '有効' },
  label('s2', 'パターンフィーダー(MDST)'),
  { id: 'b1', code: 'GA23930PB1', name: 'スプロケット', spec: 'RS40-20T', qty: 1, unitPrice: 8_400, status: '有効' },
  { id: 'b2', code: 'GA23938PS1', name: 'ローラー', spec: 'φ50 × 300', qty: 2, unitPrice: 1_500, status: '有効' },
  { id: 'b3', code: '6DA000B450', name: 'スペーサー', spec: 'STKM13C φ26 × φ25 × 37.4', qty: 1, unitPrice: 162_000, status: '保留' },
  { id: 'b4', code: 'GA23941PB2', name: 'チェーン', spec: 'RS40-1 96L', qty: 1, unitPrice: 4_200, status: '有効' },
  label('s3', '搬送ローラー モジュール台'),
  { id: 'c1', code: '6DA006B450', name: 'ナット', spec: 'KX45', qty: 1, unitPrice: 11_800, status: '有効' },
  { id: 'c2', code: '6A00380198', name: 'キャップボルト', spec: 'M6×16', qty: 2, unitPrice: 200, status: '有効' },
  { id: 'c3', code: '6FFA000B60', name: 'ナット', spec: 'K-115-1 M8', qty: 1, unitPrice: 400, status: '有効' },
  { id: 'c4', code: '6A00380221', name: 'キャップボルト', spec: 'M8×20', qty: 4, unitPrice: 240, status: '保留' },
  label('s4', '制御盤(CB-2)'),
  { id: 'd1', code: '9C0011A001', name: 'PLC', spec: 'FX5U-32MR', qty: 1, unitPrice: 68_000, status: '有効' },
  { id: 'd2', code: '9C0011A014', name: '端子台', spec: 'TB-10', qty: 6, unitPrice: 320, status: '有効' },
  { id: 'd3', code: '9C0011A027', name: 'リレー', spec: 'MY4N DC24V', qty: 4, unitPrice: 1_100, status: '有効' },
  { id: 'd4', code: '9C0011A033', name: '電源ユニット', spec: 'S8VK-G12024', qty: 1, unitPrice: 9_800, status: '有効' },
];

const columns: GridColumn<Row>[] = [
  { key: 'code', title: '品番', width: 120, pinned: 'left' },
  { key: 'name', title: '品名', width: 160 },
  { key: 'spec', title: '仕様', width: 220 },
  { key: 'qty', title: '数量', width: 80, align: 'right', editor: { type: 'number', min: 0 } },
  { key: 'unitPrice', title: '販売単価', width: 110, align: 'right', valueFormatter: numberFormatter() },
  {
    key: 'amount',
    title: '販売金額',
    width: 120,
    align: 'right',
    getValue: (row) => row.qty * row.unitPrice,
    valueFormatter: numberFormatter(),
  },
  { key: 'status', title: '状態', width: 90, filterType: 'set' },
];

export function LabelRowDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Row>>(null);
  const [data, setData] = useState<Row[]>(rows);
  const [sticky, setSticky] = useState(true);
  const [csv, setCsv] = useState<string>('');

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={sticky} onChange={(event) => setSticky(event.target.checked)} />
          見出しを縦固定(sticky)
        </label>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => setCsv(gridRef.current?.exportCsv({ includeLabelRows: true }) ?? '')}
        >
          CSV(見出し込み)を見る
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1"
          onClick={() => setCsv(gridRef.current?.exportCsv() ?? '')}
        >
          CSV(見出しなし)を見る
        </button>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={data}
        columns={columns}
        onRowsChange={setData}
        rowKeyGetter={(row) => row.id}
        height={360}
        labelRow={{
          isLabelRow: (row) => row.kind === 'label',
          getLabel: (row) => row.name,
          height: 34,
          sticky,
          render: ({ label: text, sectionRowCount }) => (
            <>
              <span className="rounded bg-blue-600 px-1.5 text-[11px] leading-[18px] text-white">工程</span>
              <span className="truncate">{text}</span>
              <span className="text-xs font-normal text-gray-500">{sectionRowCount} 件</span>
            </>
          ),
        }}
      />
      {csv !== '' && (
        <pre className="max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-xs dark:bg-gray-900">{csv}</pre>
      )}
    </div>
  );
}
