'use client';

// デザインシステムのデモ(guides/design-systems)で共通の部品: 行データ・列・サイトのライト / ダークの購読。
// 各デザインシステムの画面(*-frame.tsx)は iframe の中の別ページ(app/ds-frame/*)で動かす。デザインシステムの
// CSS(リセットや :root の変数)がドキュメントのページへ漏れず、テーマ同士も混ざらないようにするため。
import { useSyncExternalStore, type ReactNode } from 'react';
import type { GridColumn } from '@ishibashi0112/spreadsheet-grid';

export type Status = '有効' | '保留' | '停止';
export type Row = { id: number; name: string; qty: number; status: Status; owner: string };

export const STATUSES: readonly Status[] = ['有効', '保留', '停止'];
export const OWNERS = ['山田', '佐藤', '鈴木'];

export const initialRows: Row[] = [
  { id: 1, name: 'ボルト M6', qty: 120, status: '有効', owner: '山田' },
  { id: 2, name: 'ナット M6', qty: 80, status: '有効', owner: '佐藤' },
  { id: 3, name: 'ワッシャー', qty: 300, status: '保留', owner: '鈴木' },
  { id: 4, name: 'アングル材', qty: 12, status: '有効', owner: '山田' },
  { id: 5, name: 'リベット', qty: 500, status: '停止', owner: '佐藤' },
  { id: 6, name: '六角レンチ', qty: 45, status: '保留', owner: '鈴木' },
  { id: 7, name: 'スプリングピン', qty: 260, status: '有効', owner: '山田' },
  { id: 8, name: '蝶ボルト', qty: 0, status: '停止', owner: '佐藤' },
];

export const nextRow = (rows: Row[]): Row => {
  const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
  return { id, name: `新しい品目 ${id}`, qty: 0, status: '保留', owner: OWNERS[0] };
};

// 状態の列と操作の列は、各デザインシステムの部品(バッジ / ボタン)で描く。
export const buildColumns = (render: {
  status: (status: Status) => ReactNode;
  action: (row: Row) => ReactNode;
}): GridColumn<Row>[] => [
  { key: 'name', title: '品目', width: 170, editable: true, filterType: 'text' },
  {
    key: 'qty',
    title: '数量',
    width: 100,
    align: 'right',
    editable: true,
    editor: { type: 'number' },
    filterType: 'number',
  },
  {
    key: 'status',
    title: '状態',
    width: 110,
    filterType: 'set',
    editable: true,
    editor: { type: 'select', options: STATUSES.map((value) => ({ value, label: value })) },
    renderCell: ({ row }) => render.status(row.status),
  },
  {
    key: 'owner',
    title: '担当',
    width: 110,
    editable: true,
    editor: { type: 'select', options: OWNERS.map((value) => ({ value, label: value })) },
    filterType: 'set',
  },
  { key: 'action', title: '操作', width: 110, renderCell: ({ row }) => render.action(row) },
];

// サイトのダークモード(next-themes が <html> に付ける dark クラス)を購読する。iframe の中でも、next-themes が
// localStorage の変化(親のページでの切り替え)を受けて dark クラスを付け替える。サーバーとハイドレーションの間は
// まだ分からないので null(各画面はそのあいだ何も描かない。ダークのときにライトの画面が一瞬見えるのを防ぐ)。
const subscribeSiteTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
};
const getSiteDark = () => document.documentElement.classList.contains('dark');
const getServerSiteDark = () => null;

export const useSiteDark = (): boolean | null =>
  useSyncExternalStore<boolean | null>(subscribeSiteTheme, getSiteDark, getServerSiteDark);

export const gridProps = {
  rowKeyGetter: (row: Row) => row.id,
  height: 330,
  enableRowSelection: true,
  find: true,
} as const;