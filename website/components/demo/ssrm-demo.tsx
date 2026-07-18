'use client';

// SSRM(サーバーサイド行モデル)のデモ: 50,000 行を Route Handler(/api/ssrm)から
// ブロック取得する。遅延・失敗はトグルでシミュレートでき、組み込みのエラーバー /
// 保存失敗バー(ロールバック)を実際に確認できる。
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  numberFormatter,
  type GridColumn,
  type ServerSideDataSource,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';
import type { OrderRow } from '@/lib/ssrm-data';

const CATEGORY_OPTIONS = ['家電', '食品', '衣料', '書籍', '雑貨'].map((v) => ({
  label: v,
  value: v,
}));
const STATUS_OPTIONS = ['受注', '出荷準備', '出荷済', 'キャンセル'].map((v) => ({
  label: v,
  value: v,
}));

const columns: GridColumn<OrderRow>[] = [
  { key: 'id', title: 'ID', width: 90, align: 'right' },
  { key: 'code', title: '受注番号', width: 150, filterType: 'text' },
  { key: 'customer', title: '取引先', width: 170, filterType: 'text' },
  {
    key: 'category',
    title: 'カテゴリ',
    width: 120,
    // SSRM ではクライアントが全行を持たないため、set / select の候補は静的指定が必要
    filterType: 'set',
    filterOptions: CATEGORY_OPTIONS,
  },
  {
    key: 'status',
    title: '状態',
    width: 130,
    filterType: 'set',
    filterOptions: STATUS_OPTIONS,
    editable: true,
    editor: {
      type: 'select',
      options: STATUS_OPTIONS,
    },
  },
  {
    key: 'qty',
    title: '数量',
    width: 100,
    align: 'right',
    filterType: 'number',
    editable: true,
    editor: { type: 'number', min: 0, step: 1 },
  },
  {
    key: 'price',
    title: '単価',
    width: 130,
    align: 'right',
    filterType: 'number',
    valueFormatter: numberFormatter(),
    editable: true,
    editor: { type: 'number', min: 0 },
  },
  { key: 'orderedAt', title: '受注日', width: 140, filterType: 'date' },
];

const selectClass = 'rounded-md border bg-transparent px-2 py-1 text-sm';

export function SSRMDemo() {
  const [latencyMs, setLatencyMs] = useState(300);
  const [failRead, setFailRead] = useState(false);
  const [failWrite, setFailWrite] = useState(false);
  const [lastEvent, setLastEvent] = useState('');
  const gridRef = useRef<SpreadsheetGridHandle<OrderRow>>(null);

  // dataSource は安定参照のまま、最新のトグル値を ref 経由で読む(effect で同期)
  const controlsRef = useRef({ latencyMs, failRead, failWrite });
  useEffect(() => {
    controlsRef.current = { latencyMs, failRead, failWrite };
  }, [latencyMs, failRead, failWrite]);

  const dataSource = useMemo<ServerSideDataSource<OrderRow>>(
    () => ({
      getRows: async ({ startIndex, endIndex, query, signal }) => {
        const { latencyMs, failRead } = controlsRef.current;
        const res = await fetch('/api/ssrm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startIndex,
            endIndex,
            query,
            latencyMs,
            fail: failRead,
          }),
          signal,
        });
        if (!res.ok) throw new Error(`取得失敗 (HTTP ${res.status})`);
        return res.json();
      },
      updateRows: async ({ updates }) => {
        const { latencyMs, failWrite } = controlsRef.current;
        const res = await fetch('/api/ssrm/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates, latencyMs, fail: failWrite }),
        });
        if (!res.ok) throw new Error(`保存失敗 (HTTP ${res.status})`);
      },
      initialRowCount: 50_000,
      blockSize: 100,
    }),
    [],
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1">
          遅延:
          <select
            className={selectClass}
            value={latencyMs}
            onChange={(e) => setLatencyMs(Number(e.target.value))}
          >
            <option value={0}>なし</option>
            <option value={300}>300ms</option>
            <option value={1500}>1500ms</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={failRead}
            onChange={(e) => setFailRead(e.target.checked)}
          />
          取得を失敗させる
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={failWrite}
            onChange={(e) => setFailWrite(e.target.checked)}
          />
          保存を失敗させる
        </label>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.refreshServerSide()}
        >
          再読み込み
        </button>
      </div>
      <SpreadsheetGrid
        dataSource={dataSource}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={380}
        theme="auto"
        ref={gridRef}
        onServerSideLoadError={(_error, params) =>
          setLastEvent(
            `onServerSideLoadError: 行 ${params.startIndex}〜${params.endIndex - 1} の取得に失敗`,
          )
        }
        onServerSideWriteError={(_error, params) =>
          setLastEvent(
            `onServerSideWriteError: ${params.updates.length} 行の保存に失敗(ロールバック済み)`,
          )
        }
      />
      <p className="text-sm text-fd-muted-foreground min-h-5">
        {lastEvent || 'イベント通知はここに表示されます'}
      </p>
    </div>
  );
}