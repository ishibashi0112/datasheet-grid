// 追加(差し込み式 段階 2): 列幅の自動調整(列メニューの「この列 / すべての列の幅を自動調整」・列の境界のダブルクリック・
//   autoSizeColumns prop)の機能です。中身は計測の時間分割ランナー(controllers/columnAutosizeRunner)の接続で、シェルは
//   元の位置で useColumnAutosize を呼びます(中の hook の順番は従来どおり)。機能セットに無い構成では代役が受け、
//   列メニューの 2 項目を出さず、境界のダブルクリックは通常のリサイズ、autoSizeColumns は false 扱いです。
import { useColumnAutosizeRunner } from '../hooks/useColumnAutosizeRunner';
import type { ColumnAutosizeFeatureArgs, ColumnAutosizeFeatureResult, ReactGridFeatures } from './types';

const useColumnAutosizeFeature = <T,>(args: ColumnAutosizeFeatureArgs<T>): ColumnAutosizeFeatureResult<T> => {
  const { isAutosizing, runAutosize } = useColumnAutosizeRunner<T>(args);
  return { available: true, isAutosizing, runAutosize };
};

export const columnAutosizeFeature: NonNullable<ReactGridFeatures['columnAutosize']> = {
  useColumnAutosize: useColumnAutosizeFeature,
};