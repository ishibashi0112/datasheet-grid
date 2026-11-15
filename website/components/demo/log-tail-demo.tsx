'use client';

// 行が増える表で末尾を追うデモ(1.2.0 の isAtBottom() / onScroll の atBottom): アクセスログが 0.7 秒ごとに増える。
//   行を足す前に isAtBottom() で末尾にいるかを確かめ、末尾にいたら足した後に scrollToBottom() を呼ぶ。上へ戻して
//   読んでいる間は追いかけず、末尾へ戻すとまた追う。
import { useEffect, useRef, useState } from 'react';
import { SpreadsheetGrid, type GridColumn, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid';
import '@ishibashi0112/spreadsheet-grid/style.css';

type LogRow = {
  id: number;
  time: string;
  method: string;
  path: string;
  status: number;
  ms: number;
};

const PATHS = ['/api/orders', '/api/items', '/api/users/me', '/login', '/api/reports/daily', '/healthz'];
const METHODS = ['GET', 'GET', 'GET', 'POST', 'PUT', 'DELETE'];
const STATUSES = [200, 200, 200, 200, 201, 204, 304, 400, 404, 500];

let nextId = 1;
const makeLog = (): LogRow => {
  const id = nextId++;
  const now = new Date();
  return {
    id,
    time: now.toLocaleTimeString('ja-JP', { hour12: false }),
    method: METHODS[id % METHODS.length] ?? 'GET',
    path: PATHS[(id * 7) % PATHS.length] ?? '/',
    status: STATUSES[(id * 3) % STATUSES.length] ?? 200,
    ms: 5 + ((id * 37) % 400),
  };
};

const columns: GridColumn<LogRow>[] = [
  { key: 'id', title: '#', width: 70, align: 'right' },
  { key: 'time', title: '時刻', width: 100 },
  { key: 'method', title: 'メソッド', width: 90 },
  { key: 'path', title: 'パス', width: 200 },
  {
    key: 'status',
    title: '状態',
    width: 80,
    align: 'right',
    cellClassName: ({ value }) =>
      typeof value === 'number' && value >= 400 ? { style: { color: 'var(--ssg-cf-critical)' } } : undefined,
  },
  { key: 'ms', title: '応答(ms)', width: 100, align: 'right' },
];

export function LogTailDemo() {
  const gridRef = useRef<SpreadsheetGridHandle<LogRow>>(null);
  const [rows, setRows] = useState<LogRow[]>(() => Array.from({ length: 30 }, makeLog));
  const [running, setRunning] = useState(true);
  const [following, setFollowing] = useState(true);
  // 足す前に末尾にいたか(足した後の effect で読む)。
  const followRef = useRef(true);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => {
      followRef.current = gridRef.current?.isAtBottom() ?? true;
      setRows((prev) => [...prev, makeLog(), makeLog()].slice(-2000));
    }, 700);
    return () => clearInterval(timer);
  }, [running]);

  // 足した行が描かれた後に末尾へ。
  useEffect(() => {
    if (followRef.current) {
      gridRef.current?.scrollToBottom();
    }
  }, [rows]);

  return (
    <div className="not-prose flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-fd-accent" onClick={() => setRunning((value) => !value)}>
          {running ? 'ログを止める' : 'ログを再開'}
        </button>
        <button type="button" className="rounded-md border px-2 py-1 hover:bg-fd-accent" onClick={() => gridRef.current?.scrollToBottom()}>
          末尾へ
        </button>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${following ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}
        >
          {following ? '末尾を追っています' : '止めて読んでいます(末尾へ戻すと再開)'}
        </span>
      </div>
      <SpreadsheetGrid
        ref={gridRef}
        rows={rows}
        columns={columns}
        rowKeyGetter={(row) => row.id}
        readOnly
        height={320}
        theme="class"
        // 「末尾を追う」の表示に使う(人が上へ戻すと false)。
        onScroll={({ atBottom }) => setFollowing(atBottom ?? false)}
      />
    </div>
  );
}
