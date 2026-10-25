// 追加(差し込み式 段階 2): 機能セットに入っていない機能の prop が使われていたら、開発時に 1 回だけ警告します
//   (core logic/featureWarnings)。createSpreadsheetGrid が作るコンポーネントの先頭で呼びます(全部入りの
//   SpreadsheetGrid は全機能がそろっているので呼ばない)。本番では何もしない hook に差し替わり、利用側のバンドラが
//   警告の処理と prop の判定表ごと取り除きます(process.env.NODE_ENV の置き換え)。
import { useEffect } from 'react';
import { warnUnregisteredFeatureProps } from '@ishibashi0112/spreadsheet-grid-core/logic/featureWarnings';
import type { ReactGridFeatures } from '../features/types';
import type { SpreadsheetGridProps } from '../model/gridTypes';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。typeof で守らないのは、守ると
//   本番でも開発用の分岐が消えなくなるためです(置き換えは React 自身(react パッケージ)も前提にしているので、
//   React の入ったバンドルでは必ず行われています)。
declare const process: { env: { NODE_ENV?: string } };

type FeatureName = keyof ReactGridFeatures;

type FeaturePropCheck = {
  prop: string;
  // features: 機能セット(ほかの機能がその prop を使うときに警告しないため)。
  isUsed: <T extends object>(props: SpreadsheetGridProps<T>, features: ReactGridFeatures) => boolean;
};

// 機能ごとの「その機能の prop が使われているか」(1 つの機能に prop が複数あれば並べる)。機能を足すと型がここへの
//   追加を求めます。
const FEATURE_PROPS: { [K in FeatureName]-?: readonly FeaturePropCheck[] } = {
  find: [{ prop: 'find', isUsed: (props) => props.find !== undefined && props.find !== false }],
  fillHandle: [{ prop: 'fillHandle', isUsed: (props) => Boolean(props.fillHandle) }],
  // 列の並べ替えは onColumnsChange で有効になる(リサイズ等と共通の prop なので、それでは警告しない)。
  columnReorder: [{ prop: 'columnDragMotion', isUsed: (props) => props.columnDragMotion !== undefined }],
  rowDrag: [{ prop: 'enableRowDrag', isUsed: (props) => props.enableRowDrag === true }],
  scrollHint: [{ prop: 'scrollHint', isUsed: (props) => props.scrollHint !== undefined && props.scrollHint !== false }],
  imeDirectInput: [{ prop: 'imeDirectInput', isUsed: (props) => props.imeDirectInput === true }],
  totalRow: [{ prop: 'totalRow', isUsed: (props) => props.totalRow !== undefined && props.totalRow !== false }],
  columnAutosize: [
    {
      prop: 'autoSizeColumns',
      isUsed: (props) => props.autoSizeColumns !== undefined && props.autoSizeColumns !== false,
    },
  ],
  contextMenu: [{ prop: 'enableContextMenu', isUsed: (props) => props.enableContextMenu === true }],
  // 列メニューは既定で有効(enableColumnMenu 省略 = true)なので、明示した true だけ警告する。ツールパネルがあれば
  //   enableColumnMenu はその「列」タブの有無に効くので警告しない。
  columnMenu: [
    {
      prop: 'enableColumnMenu',
      isUsed: (props, features) => props.enableColumnMenu === true && features.toolPanel === undefined,
    },
  ],
  // ツールパネルは専用の prop を持たない(タブはフィルター / 列 / 並び替えの各 prop で決まる)。ハンドルの
  //   openFilterManager は呼ばれた時点で警告する(features/resolve.ts)。
  toolPanel: [],
  // 列の指定(GridColumn.conditionalFormat)。どれか 1 列でも指定していれば警告する。
  conditionalFormat: [
    {
      prop: 'columns[].conditionalFormat',
      isUsed: (props) => props.columns.some((column) => column.conditionalFormat !== undefined),
    },
  ],
  // 既定 true の prop なので、明示して true を渡したときだけ警告する(省略しただけでは警告しない)。
  selectionAggregates: [
    {
      prop: 'showSelectionAggregates',
      isUsed: (props) => props.showSelectionAggregates === true,
    },
  ],
  // showCopyRange も既定 true なので明示したときだけ。hoverHighlight は既定の 'row' 以外のとき。
  motionExtras: [
    { prop: 'highlightChanges', isUsed: (props) => props.highlightChanges === true },
    { prop: 'showCopyRange', isUsed: (props) => props.showCopyRange === true },
    { prop: 'hoverHighlight', isUsed: (props) => props.hoverHighlight === 'cross' },
  ],
  // エクスポートは prop ではなくメソッドなので、呼ばれた時点で警告する(features/resolve.ts の代役)。
  export: [],
  // フィルターの 2 つのスイッチは既定 true なので、明示して true を渡したときだけ。列の filterType はどれか 1 列でも
  //   指定していれば警告する。
  filtering: [
    { prop: 'enableColumnFilter', isUsed: (props) => props.enableColumnFilter === true },
    { prop: 'enableGlobalFilter', isUsed: (props) => props.enableGlobalFilter === true },
    { prop: 'columns[].filterType', isUsed: (props) => props.columns.some((column) => column.filterType !== undefined) },
    { prop: 'manualFiltering', isUsed: (props) => props.manualFiltering === true },
    { prop: 'onFiltersChange', isUsed: (props) => props.onFiltersChange !== undefined },
    { prop: 'getFilterOptions', isUsed: (props) => props.getFilterOptions !== undefined },
    { prop: 'showFilterChipBar', isUsed: (props) => props.showFilterChipBar === true },
    { prop: 'renderFilterDateInput', isUsed: (props) => props.renderFilterDateInput !== undefined },
    // 上部バーの検索欄の表示と見た目(showTopBarFilter は既定 true なので明示した true だけ)。
    { prop: 'showTopBarFilter', isUsed: (props) => props.showTopBarFilter === true },
    { prop: 'globalFilterPlaceholder', isUsed: (props) => props.globalFilterPlaceholder !== undefined },
    { prop: 'globalFilterIcon', isUsed: (props) => props.globalFilterIcon !== undefined },
  ],
  // showSaveStatus は既定 true なので、明示して true を渡したときだけ。
  serverSide: [
    { prop: 'dataSource', isUsed: (props) => props.dataSource !== undefined },
    { prop: 'serverSideRefreshToken', isUsed: (props) => props.serverSideRefreshToken !== undefined },
    { prop: 'onServerSideLoadError', isUsed: (props) => props.onServerSideLoadError !== undefined },
    { prop: 'onServerSideWriteError', isUsed: (props) => props.onServerSideWriteError !== undefined },
    { prop: 'showSaveStatus', isUsed: (props) => props.showSaveStatus === true },
  ],
  // 列の autoHeight はグリッドの autoHeight で有効になるので、グリッドの prop だけ見る。
  autoHeight: [{ prop: 'autoHeight', isUsed: (props) => props.autoHeight === true }],
  labelRow: [{ prop: 'labelRow', isUsed: (props) => props.labelRow !== undefined }],
  // 列の指定(GridColumn.rowGroup)。aggFunc は合計行でも使うので警告しない。
  grouping: [
    { prop: 'columns[].rowGroup', isUsed: (props) => props.columns.some((column) => column.rowGroup === true) },
  ],
};

function useUnregisteredFeatureWarningsInDev<T extends object>(
  props: SpreadsheetGridProps<T>,
  features: ReactGridFeatures,
): void {
  // 警告の対象を文字列のキーへ畳みます(中身が変わったときだけ effect を走らせる)。
  const missingKey = (Object.keys(FEATURE_PROPS) as FeatureName[])
    .filter((name) => features[name] === undefined)
    .flatMap((name) => FEATURE_PROPS[name].filter((check) => check.isUsed(props, features)).map((check) => check.prop))
    .join(',');
  useEffect(() => {
    if (missingKey !== '') {
      warnUnregisteredFeatureProps(missingKey.split(','));
    }
  }, [missingKey]);
}

const useUnregisteredFeatureWarningsInProduction: typeof useUnregisteredFeatureWarningsInDev = () => {};

export const useUnregisteredFeatureWarnings =
  process.env.NODE_ENV === 'production'
    ? useUnregisteredFeatureWarningsInProduction
    : useUnregisteredFeatureWarningsInDev;