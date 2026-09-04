'use client';

// 行ドラッグ並び替えのデモ: 先頭のハンドル(⋮⋮)を掴んでタスクの優先順を入れ替える。
//   「確定」行は isRowDraggable で固定し、onRowMove の通知と moveRow() / undo() を確認できる。
import { useRef, useState } from 'react';
import {
  SpreadsheetGrid,
  type GridColumn,
  type RowMoveParams,
  type SpreadsheetGridHandle,
} from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type Task = {
  id: string;
  title: string;
  assignee: string;
  estimate: number;
  status: '未着手' | '進行中' | '確定';
};

const initialTasks: Task[] = [
  { id: 'T-101', title: 'ログイン画面の再設計', assignee: '佐藤', estimate: 5, status: '確定' },
  { id: 'T-102', title: '請求書 PDF の出力', assignee: '鈴木', estimate: 8, status: '進行中' },
  { id: 'T-103', title: '在庫 CSV インポート', assignee: '高橋', estimate: 3, status: '未着手' },
  { id: 'T-104', title: '通知メールのテンプレート化', assignee: '田中', estimate: 2, status: '未着手' },
  { id: 'T-105', title: '監査ログの保持期間設定', assignee: '伊藤', estimate: 3, status: '未着手' },
  { id: 'T-106', title: 'ダッシュボードのグラフ差し替え', assignee: '渡辺', estimate: 5, status: '進行中' },
  { id: 'T-107', title: 'API レート制限の導入', assignee: '山本', estimate: 8, status: '未着手' },
  { id: 'T-108', title: 'モバイル表示の余白調整', assignee: '中村', estimate: 1, status: '未着手' },
];

const columns: GridColumn<Task>[] = [
  { key: 'id', title: 'ID', width: 90, readOnly: true },
  { key: 'title', title: 'タスク', width: 260 },
  { key: 'assignee', title: '担当', width: 100 },
  { key: 'estimate', title: '見積(日)', width: 90, align: 'right', editor: { type: 'number', min: 0 } },
  {
    key: 'status',
    title: '状態',
    width: 100,
    filterType: 'set',
    editor: { type: 'select', options: ['未着手', '進行中', '確定'].map((v) => ({ label: v, value: v })) },
  },
];

export function RowDragDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<Task>>(null);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [lastMove, setLastMove] = useState<string>('(まだ移動していません)');

  const handleRowMove = ({ rowKey, fromIndex, toIndex }: RowMoveParams<Task>) => {
    setLastMove(`${String(rowKey)} を ${fromIndex + 1} 行目 → ${toIndex + 1} 行目へ`);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.moveRow('T-108', 0)}
        >
          T-108 を先頭へ(moveRow)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => gridRef.current?.undo()}
        >
          元に戻す(undo)
        </button>
        <button
          type="button"
          className="rounded-md border px-2 py-1 hover:bg-fd-accent"
          onClick={() => {
            setTasks(initialTasks);
            setLastMove('(リセットしました)');
          }}
        >
          並び順をリセット
        </button>
        <span className="text-fd-muted-foreground">最後の onRowMove: {lastMove}</span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={tasks}
        onRowsChange={setTasks}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        height={360}
        theme="auto"
        enableRowDrag
        // 「確定」のタスクは順番を固定(ハンドルを出さない)
        isRowDraggable={(row) => row.status !== '確定'}
        onRowMove={handleRowMove}
      />
      <p className="text-sm text-fd-muted-foreground">
        現在の順序: {tasks.map((task) => task.id).join(' → ')}
      </p>
    </div>
  );
}