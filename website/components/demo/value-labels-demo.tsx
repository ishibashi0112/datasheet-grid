'use client';

// 値と表示名が別の列のデモ(1.1.0): 地域と区分は値がコード('kanto' / 'transport')で、画面は valueFormatter の表示名。
// グループ行の見出し(groupLabel)・グローバルフィルターの照らし合わせ(globalFilterMatch)・select のコピー / 貼り付け
// (clipboard: 'label')を切り替えて、既定(値の文字)との違いを見る。
import { useMemo, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type GridGlobalFilterMatch,
  type GridSelectEditorOption,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; region: string; kind: string; amount: number };

const REGIONS: GridSelectEditorOption[] = [
  { value: 'kanto', label: '関東' },
  { value: 'chubu', label: '中部' },
  { value: 'kinki', label: '近畿' },
];
const KINDS: GridSelectEditorOption[] = [
  { value: 'transport', label: '交通費' },
  { value: 'meal', label: '会議費' },
  { value: 'supplies', label: '消耗品費' },
];
const labelOf = (options: GridSelectEditorOption[]) => {
  const map = new Map(options.map((option) => [option.value, option.label]));
  return ({ value }: { value: unknown }) => map.get(String(value)) ?? String(value ?? '');
};

const initialRows: Row[] = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  region: REGIONS[index % 3]?.value ?? 'kanto',
  kind: KINDS[Math.floor(index / 3) % 3]?.value ?? 'meal',
  amount: ((index * 3571) % 90 + 5) * 100,
}));

const selectClass = 'rounded-md border border-fd-border bg-transparent px-2 py-1 text-sm';

export function ValueLabelsDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [grouped, setGrouped] = useState(true);
  const [groupLabel, setGroupLabel] = useState<'value' | 'formatted'>('formatted');
  const [match, setMatch] = useState<GridGlobalFilterMatch>('both');
  const [clipboard, setClipboard] = useState<'value' | 'label'>('label');

  const columns = useMemo<GridColumn<Row>[]>(
    () => [
      {
        key: 'region',
        title: '地域',
        width: 110,
        editable: true,
        editor: { type: 'select', options: REGIONS, clipboard },
        valueFormatter: labelOf(REGIONS),
        rowGroup: grouped,
        groupLabel,
      },
      {
        key: 'kind',
        title: '区分',
        width: 120,
        editable: true,
        editor: { type: 'select', options: KINDS, clipboard },
        valueFormatter: labelOf(KINDS),
      },
      {
        key: 'amount',
        title: '金額',
        width: 120,
        align: 'right',
        editable: true,
        editor: { type: 'number', min: 0 },
        valueFormatter: numberFormatter(),
        aggFunc: 'sum',
      },
    ],
    [clipboard, grouped, groupLabel],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />
          地域でグループ化
        </label>
        <label className="flex items-center gap-1">
          <code>groupLabel</code>
          <select className={selectClass} value={groupLabel} onChange={(event) => setGroupLabel(event.target.value as 'value' | 'formatted')}>
            <option value="value">value</option>
            <option value="formatted">formatted</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <code>globalFilterMatch</code>
          <select className={selectClass} value={match} onChange={(event) => setMatch(event.target.value as GridGlobalFilterMatch)}>
            <option value="value">value</option>
            <option value="display">display</option>
            <option value="both">both</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <code>clipboard</code>
          <select className={selectClass} value={clipboard} onChange={(event) => setClipboard(event.target.value as 'value' | 'label')}>
            <option value="value">value</option>
            <option value="label">label</option>
          </select>
        </label>
      </div>
      <SpreadsheetGrid
        rows={rows}
        columns={columns}
        onRowsChange={setRows}
        rowKeyGetter={(row) => row.id}
        height={360}
        theme="class"
        globalFilterMatch={match}
      />
      <p className="m-0 text-xs text-fd-muted-foreground">
        上部バーの検索欄に「中部」や「chubu」を入れて違いを見る / 区分のセルを Ctrl(⌘)+C でコピーして別のセルへ貼り付ける(<code>label</code>{' '}
        なら表示名で出て、貼り付けると値に戻る)/ この文字を選んでコピーし、区分のセルへ貼り付ける: <code>消耗品費</code>
      </p>
    </div>
  );
}