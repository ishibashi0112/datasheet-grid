// SSR とハイドレーションの確かめ(段階 4-5)で、サーバー(render.mjs)とクライアント(hydrate.test.tsx)が同じ props で描く表。
import type { JSX } from '@solidjs/web';
import { SpreadsheetGrid } from '../src/index';
import { CLIENT_TODAY, CLIENT_TZ, SERVER_TODAY } from './timeZones';

type Row = { id: number; name: string; qty: number; day: string; status: string };
// サーバーの今日の行が 2 つ、クライアントの今日の行が 1 つ(相対日付の「今日」で絞ると、サーバーは 2 行、クライアントは 1 行)。
const rows: Row[] = [
  { id: 1, name: 'alpha', qty: 3, day: SERVER_TODAY, status: 'open' },
  { id: 2, name: 'bravo', qty: 1, day: CLIENT_TODAY, status: 'done' },
  { id: 3, name: 'charlie', qty: 2, day: SERVER_TODAY, status: 'open' },
  { id: 4, name: 'delta', qty: 4, day: '2026-01-02', status: 'open' },
];
const columns = [
  { key: 'name', title: '名前', width: 160, filterType: 'text', editor: { type: 'text' } },
  { key: 'qty', title: '数量', width: 100, filterType: 'number', aggFunc: 'sum', conditionalFormat: { dataBar: {} } },
  { key: 'day', title: '日付', width: 120, filterType: 'dateSet', editor: { type: 'date' } },
  { key: 'status', title: '状態', width: 120, filterType: 'set', conditionalFormat: { chips: { done: { tone: 'good' } } } },
] as const;
const base = { rows, columns: columns as never, rowKeyGetter: (row: Row) => row.id, height: 300, onRowsChange: () => {} };

function RelativeDate(): JSX.Element {
  return (
    <SpreadsheetGrid
      {...base}
      initialState={{
        filters: { columnFilters: { day: { kind: 'dateSet', condition: { mode: 'preset', preset: 'today' }, set: null } } },
      }}
    />
  );
}

export const fixtures: Record<string, () => JSX.Element> = {
  // OS の配色と視差効果を減らす設定で決まる theme="auto" と motion の既定 'auto'(R4-1)。
  themeMotion: () => <SpreadsheetGrid {...base} theme="auto" />,
  // initialState の絞り込みと並べ替えはサーバーの HTML から効く(React 版の initialState.ssr と同じ)。
  initialState: () => (
    <SpreadsheetGrid
      {...base}
      initialState={{
        filters: { columnFilters: { name: { kind: 'text', value: 'r' } } },
        sort: [{ columnKey: 'qty', direction: 'desc' }],
      }}
    />
  ),
  // 相対日付のプリセット(今日)は、サーバーとクライアントで今日が違えばクライアントの今日に合わせる(R4-2)。
  relativeDate: () => <RelativeDate />,
  // 同じ表を、サーバーとクライアントで今日が同じ(同じタイムゾーン)で描く。
  relativeDateSameDay: () => <RelativeDate />,
  // 主な機能を有効にした構成(サーバーで現在時刻を読まない = React 版の ssrCurrentTime と同じ。ハイドレーションで警告が出ない)。
  features: () => (
    <SpreadsheetGrid
      {...base}
      enableColumnFilter
      enableGlobalFilter
      showFilterChipBar
      totalRow
      find
      enableRowSelection
      enableColumnMenu
      fillHandle
      imeDirectInput
      highlightChanges
      autoSizeColumns="onMount"
      initialState={{
        filters: { columnFilters: { name: { kind: 'text', value: 'a' } } },
        sort: [{ columnKey: 'qty', direction: 'desc' }],
      }}
    />
  ),
};

// サーバーで描いたときに現在時刻を読んでよい表(日付の列の条件を initialState で入れたときは、条件を解くのに読む = React 版と同じ)。
export const READS_CURRENT_TIME = new Set(['relativeDate', 'relativeDateSameDay']);

// サーバーのタイムゾーン(無い表は SERVER_TZ = クライアントと今日が 1 日ずれる)。
export const SERVER_TIME_ZONE_OF: Record<string, string> = { relativeDateSameDay: CLIENT_TZ };