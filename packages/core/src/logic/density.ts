// 追加(Solid 版 段階 0-4): density プリセットごとの既定の寸法です(React 版の GridShell.tsx の DENSITY_DIMENSIONS を移設。
//   Solid 版と共用)。明示した rowHeight / headerHeight の prop が常に優先します。'standard' は従来の既定(36 / 40)と同じ値です。
//   CSS 側の寸法トークンの切り替えは styles.css の ssg-root--density-* の修飾子。
import type { GridDensity } from '../model/gridTypes.unbound';

export const GRID_DENSITY_DIMENSIONS: Readonly<Record<GridDensity, { rowHeight: number; headerHeight: number }>> = {
  compact: { rowHeight: 28, headerHeight: 32 },
  standard: { rowHeight: 36, headerHeight: 40 },
  comfortable: { rowHeight: 44, headerHeight: 48 },
};