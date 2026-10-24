// SpreadsheetGrid の公開コンポーネント(全部入り)です。
// 変更(差し込み式 段階 2): 本体はシェル(GridShell.tsx の useGridShell)へ移し、ここではすべての機能を差し込んだ
//   機能セット(features/full.ts)を渡すだけにしました。挙動 / props / ref ハンドルは従来と同じです。
import { useGridShell } from './GridShell';
import { fullGridFeatures } from './features/full';
import type { SpreadsheetGridProps } from './model/gridTypes';

// 追加(api-docs): 公開コンポーネントの JSDoc です(d.ts に残り、エディタ / AI が最初に読む説明になります)。
/**
 * 仮想化スプレッドシート / データグリッドです。データは clientSide なら `rows`、serverSide(SSRM)なら
 * `dataSource` で渡します(両者は排他)。
 *
 * - CSS の読み込みが必要です: `import '@ishibashi0112/spreadsheet-grid/style.css'`
 *   (カスケードレイヤー運用なら `style.layer.css`)。
 * - 状態は controlled です。編集結果は `onRowsChange` が新しい配列で返すので、受け取った配列をそのまま
 *   `rows` へ戻してください(作り直すと undo 履歴が消えます)。
 * - 行キーは `rowKeyGetter` で安定した値を返してください(既定は index)。
 * - 高さは `height` prop で指定します。`'100%'` でバー込みのグリッド全体が親に収まります(親は確定高さが
 *   必要)。数値はスクロール領域の高さです。
 * - 命令的 API は `ref`(`SpreadsheetGridHandle<T>`)で受け取ります。
 * - props / 列定義 / 命令的 API の全説明は同梱の `API_REFERENCE.md` と各 props の JSDoc にあります。
 *
 * @example
 * ```tsx
 * import { useState } from 'react';
 * import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid';
 * import '@ishibashi0112/spreadsheet-grid/style.css';
 *
 * type Row = { id: number; name: string };
 * const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 200, editable: true }];
 *
 * export function App() {
 *   const [rows, setRows] = useState<Row[]>([{ id: 1, name: 'alpha' }]);
 *   return (
 *     <div style={{ height: 600 }}>
 *       <SpreadsheetGrid
 *         rows={rows}
 *         columns={columns}
 *         onRowsChange={setRows}
 *         rowKeyGetter={(row) => row.id}
 *         height="100%"
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function SpreadsheetGrid<T extends object>(props: SpreadsheetGridProps<T>) {
  return useGridShell(props, fullGridFeatures);
}