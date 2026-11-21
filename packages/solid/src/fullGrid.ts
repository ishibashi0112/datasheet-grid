// 全部入りのグリッド(すべての機能を差し込んだ SpreadsheetGrid)。
import type { JSX } from '@solidjs/web';
import { createSpreadsheetGrid } from './createSpreadsheetGrid';
import { fullGridFeatures } from './features/full';
import type { SpreadsheetGridProps } from './model/gridTypes';

// 変更(段階 3-3 公開の形): 型を書いておきます。推論のままだと tsc が d.ts で props の型を `import(".")`(入口)と書き、
//   nodenext の利用側で解決できない(types:check の Solid 版の nodenext で見つけた)。
/**
 * 仮想化スプレッドシート / データグリッド(Solid 版。React 版と同じ props)です。データは clientSide なら `rows`、
 * serverSide(SSRM)なら `dataSource` で渡します(両者は排他)。
 *
 * - CSS の読み込みが必要です: `import '@ishibashi0112/spreadsheet-grid-solid/style.css'`
 *   (カスケードレイヤー運用なら `style.layer.css`)。
 * - 状態は controlled です。編集結果は `onRowsChange` が新しい配列で返すので、受け取った配列をそのまま
 *   `rows` へ戻してください(作り直すと undo 履歴が消えます)。
 * - 行キーは `rowKeyGetter` で安定した値を返してください(既定は index)。
 * - 高さは `height` prop で指定します。`'100%'` でバー込みのグリッド全体が親に収まります(親は確定高さが
 *   必要)。数値はスクロール領域の高さです。
 * - 命令的 API は `ref` に渡した関数で受け取ります(`SpreadsheetGridHandle<T>`)。
 * - props / 列定義 / 命令的 API の説明は各 props の JSDoc と React 版に同梱の `API_REFERENCE.md` にあります(同じ API)。
 *
 * @example
 * ```tsx
 * import { createSignal } from 'solid-js';
 * import { SpreadsheetGrid, type GridColumn } from '@ishibashi0112/spreadsheet-grid-solid';
 * import '@ishibashi0112/spreadsheet-grid-solid/style.css';
 *
 * type Row = { id: number; name: string };
 * const columns: GridColumn<Row>[] = [{ key: 'name', title: '名前', width: 200, editable: true }];
 *
 * export function App() {
 *   const [rows, setRows] = createSignal<Row[]>([{ id: 1, name: 'alpha' }]);
 *   return (
 *     <div style={{ height: '600px' }}>
 *       <SpreadsheetGrid rows={rows()} columns={columns} onRowsChange={setRows} rowKeyGetter={(row) => row.id} height="100%" />
 *     </div>
 *   );
 * }
 * ```
 */
// モジュール直下の呼び出しは /* @__PURE__ */(使わなければ束ねたときに消える。React 版の規約と同じ)。
export const SpreadsheetGrid: <T extends object, L extends T = T>(props: SpreadsheetGridProps<T, L>) => JSX.Element =
  /* @__PURE__ */ createSpreadsheetGrid({
    features: fullGridFeatures as unknown as Parameters<typeof createSpreadsheetGrid>[0]['features'],
  });