// 追加(差し込み式 段階 2): React 版の機能セットの型です。エンジン(core)の機能セット(GridCoreFeatures)を広げ、
//   シェルが描画に使う部品(コンポーネント / 純関数)を足します。各機能の値は features/<機能名>.ts にあり、
//   全部入りの表は features/full.ts です。
import type { GridCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/engine/features';
import type { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/logic/find';
import type { GridFindBar } from '../view/GridFindBar';

export type ReactGridFeatures = {
  // セル内検索(F-2): 走査のコントローラ(core)+ 検索バー + セル文字列のヒット分割。
  find?: NonNullable<GridCoreFeatures['find']> & {
    FindBar: typeof GridFindBar;
    splitTextByFindRanges: typeof splitTextByFindRanges;
  };
};