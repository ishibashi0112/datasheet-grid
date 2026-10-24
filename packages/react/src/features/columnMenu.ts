// 追加(差し込み式 段階 3): 列メニュー(⋮ ボタン + ヘッダーの右クリック。13-A)の機能です。中身は列メニューの controller の
//   接続(hooks/useColumnMenuController)と popover の描画部品で、シェルは元の位置で useColumnMenu を呼びます。
//   機能セットに無い構成では代役が受け(available: false = 閉じたまま)、シェルは ⋮ ボタンもヘッダーの右クリックも
//   出しません(右クリックはブラウザ標準のメニュー)。ツールパネルの「列」タブの可否は従来どおり enableColumnMenu で決まります。
import { useColumnMenuController } from '../hooks/useColumnMenuController';
import { ColumnMenuPopover } from '../view/ColumnMenuPopover';
import type { ColumnMenuFeatureArgs, ColumnMenuFeatureResult, ReactGridFeatures } from './types';

const useColumnMenuFeature = <T,>(args: ColumnMenuFeatureArgs<T>): ColumnMenuFeatureResult<T> => ({
  available: true,
  ...useColumnMenuController<T>(args),
});

export const columnMenuFeature: NonNullable<ReactGridFeatures['columnMenu']> = {
  useColumnMenu: useColumnMenuFeature,
  ColumnMenuPopover,
};