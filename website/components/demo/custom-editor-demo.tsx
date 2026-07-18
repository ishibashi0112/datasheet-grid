'use client';

// カスタムエディタ({ type: 'custom', render })のデモ:
// 星評価ピッカーを編集オーバーレイに描画し、ctx.commit(値) で確定する。
// 非 string を commit するとパーサをバイパスしてドメイン値がそのまま書き込まれる。
import { useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Row = { id: number; name: string; rating: number; note: string };

const columns: GridColumn<Row>[] = [
  { key: 'name', title: 'レストラン', width: 180, editable: true },
  {
    key: 'rating',
    title: '評価(custom editor)',
    width: 180,
    editable: true,
    // 表示: 星
    renderCell: ({ value }) => {
      const n = Math.max(0, Math.min(5, Number(value) || 0));
      return (
        <span className="text-amber-500" aria-label={`評価 ${n} / 5`}>
          {'★'.repeat(n)}
          <span className="text-black/20 dark:text-white/20">
            {'★'.repeat(5 - n)}
          </span>
        </span>
      );
    },
    // 編集: 星ピッカー(クリックで即確定 / Escape 相当は ✕ ボタン)
    editor: {
      type: 'custom',
      render: (ctx) => (
        <span className="inline-flex items-center gap-1 rounded-md border border-fd-border bg-fd-background px-2 py-1 shadow-sm">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className="text-lg leading-none text-amber-500 hover:scale-125 transition-transform"
              onClick={() => ctx.commit(n)}
              title={`${n} に設定`}
            >
              {n <= (Number(ctx.value) || 0) ? '★' : '☆'}
            </button>
          ))}
          <button
            type="button"
            className="ml-1 text-xs text-fd-muted-foreground hover:text-fd-foreground"
            onClick={() => ctx.cancel()}
            title="キャンセル"
          >
            ✕
          </button>
        </span>
      ),
    },
  },
  { key: 'note', title: 'メモ', width: 220, editable: true },
];

const initialRows: Row[] = [
  { id: 1, name: '洋食キッチン こばやし', rating: 4, note: 'オムライスが名物' },
  { id: 2, name: '麺屋 いしばし', rating: 5, note: '朝ラーメンあり' },
  { id: 3, name: 'カフェ みどり', rating: 3, note: '電源席が多い' },
  { id: 4, name: '寿司処 やまと', rating: 0, note: '未訪問' },
];

export function CustomEditorDemo() {
  const [rows, setRows] = useState<Row[]>(initialRows);

  return (
    <SpreadsheetGrid
      rows={rows}
      columns={columns}
      onRowsChange={setRows}
      rowKeyGetter={(row) => row.id}
      height={230}
      theme="auto"
    />
  );
}