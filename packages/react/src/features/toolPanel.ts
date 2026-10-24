// 追加(差し込み式 段階 3): ツールパネル(フィルター / 列 / 並び替えの 3 タブ。UP-1)の機能です。中身はパネルの controller の
//   接続(hooks/useToolPanelController)と、パネルの部品(別チャンク view/toolPanelViews)の遅延読み込みです。シェルは
//   それぞれ元の位置で useToolPanel / useToolPanelViews を呼びます(hook の順番は従来どおり)。機能セットに無い構成では
//   代役が受け(available: false = 閉じたまま、部品は読み込まない)、シェルはパネルを開く入口(列メニューの「並び替えを
//   管理…」「フィルターを管理…」「列の表示」/ 既定の上部バーの Filters チップ)を出しません。
import { useToolPanelController } from '../hooks/useToolPanelController';
import { toolPanelModule, useLazyModule } from '../view/lazyPopups';
import type { UseLazyModuleOptions } from '../view/lazyPopups';
import type { ReactGridFeatures, ToolPanelFeatureArgs, ToolPanelFeatureResult } from './types';

const useToolPanelFeature = (args: ToolPanelFeatureArgs): ToolPanelFeatureResult => ({
  available: true,
  ...useToolPanelController(args),
});

const useToolPanelViewsFeature = (options: UseLazyModuleOptions) => useLazyModule(toolPanelModule, options);

export const toolPanelFeature: NonNullable<ReactGridFeatures['toolPanel']> = {
  useToolPanel: useToolPanelFeature,
  useToolPanelViews: useToolPanelViewsFeature,
};