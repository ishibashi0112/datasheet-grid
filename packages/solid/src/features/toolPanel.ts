// ツールパネル(フィルター / 列 / 並び替えの 3 タブ)の機能です。パネルのコントローラ(core)の接続と、枠と 3 つのタブの中身の
//   部品をシェルへ渡します(React 版の features/toolPanel.ts と同じ。React 版は部品を別のチャンクで遅れて読み込むが、Solid 版は
//   今はそのまま入れる)。機能セットに無い構成ではパネルを開く入口(列メニューの「並び替えを管理…」「フィルターを管理…」
//   「列の表示」/ 既定の上部バーの絞り込みのチップ)を出しません。列メニューもフィルターも無い構成も、開く入口が無いので同じ扱い
//   (React 版と同じ)。
import { createToolPanel } from '../primitives/toolPanel';
import { ToolPanel } from '../view/ToolPanel';
import { FilterManagementPanel } from '../view/FilterManagementPanel';
import { ColumnChooserPanel } from '../view/ColumnChooserPanel';
import { SortManagementPanel } from '../view/SortManagementPanel';
import type { GridFeature, GridFeatureParts } from './types';

export const toolPanelFeature = {
  createToolPanel,
  ToolPanel,
  FilterManagementPanel,
  ColumnChooserPanel,
  SortManagementPanel,
} satisfies GridFeatureParts<'toolPanel'> as unknown as GridFeature<'toolPanel'>;