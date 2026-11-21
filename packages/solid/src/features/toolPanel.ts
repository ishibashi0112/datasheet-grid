// ツールパネル(フィルター / 列 / 並び替えの 3 タブ)の機能です。パネルのコントローラ(core)の接続と、枠と 3 つのタブの中身の
//   部品の読み込みをシェルへ渡します(React 版の features/toolPanel.ts と同じ。変更(段階 3-3): 部品は別のチャンク
//   view/toolPanelViews.ts で、view/lazyPopups.ts が後から読み込む)。機能セットに無い構成ではパネルを開く入口(列メニューの「並び替えを管理…」「フィルターを管理…」
//   「列の表示」/ 既定の上部バーの絞り込みのチップ)を出しません。列メニューもフィルターも無い構成も、開く入口が無いので同じ扱い
//   (React 版と同じ)。
import { createToolPanel } from '../primitives/toolPanel';
import { createLazyModuleSignal, toolPanelModule, type LazyModuleSignalOptions } from '../view/lazyPopups';
import type { GridFeature, GridFeatureParts } from './types';

const createToolPanelViews = (options: LazyModuleSignalOptions) => createLazyModuleSignal(toolPanelModule, options, 'toolPanelViews');

export const toolPanelFeature = {
  createToolPanel,
  createToolPanelViews,
} satisfies GridFeatureParts<'toolPanel'> as unknown as GridFeature<'toolPanel'>;