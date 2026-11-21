// 開発時の警告(段階 3-1)。React 版と同じ条件・同じ文言・同じ回数で console.warn します。
//   - 機能セットに無い機能の prop(React 版の hooks/useUnregisteredFeatureWarnings.ts の表と同じ)。1 つの prop につき 1 回。
//   - 機能セットに無い機能のメソッド(exportCsv / downloadCsv / getExportData / openFilterManager。React 版の
//     features/resolve.ts の代役)と、フィルターの機能が無いのに入ったフィルターの状態。それぞれ 1 回。
//   - シェルの警告(React 版の GridShell.tsx): サーバーサイドで rowGroup / 行のグループ化とラベル行の併用 /
//     auto-height が使えない(サーバーサイド・行数の上限)/ 展開行が描けない高さ / サーバーサイドの moveRow()。
//   判定は利用側のバンドラが置き換える process.env.NODE_ENV で行い、本番では何もしない関数に差し替わります(警告の処理と
//   prop の判定表ごと消える)。React 版と core と同じ(import.meta.env.DEV はライブラリのビルド時に固定されるので使わない)。
//   React 版の「コンポーネントの中で createSpreadsheetGrid を呼んで描くたびに作り直している」の警告は入れません(Solid の
//   部品の関数は 1 回しか呼ばれないので、部品の中で呼んでも描き直しのたびに作り直すことは無い)。
import { createEffect, createMemo } from 'solid-js';
import { AUTO_HEIGHT_MAX_ROWS, MAX_BODY_PX } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import { createInertExportCommands } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/features';
import {
  warnUnregisteredFeatureMethod,
  warnUnregisteredFeatureProps,
  warnUnregisteredFeatureState,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/featureWarnings';
import type { GridFeatureName, SolidGridFeatures } from './features/types';
import type { SpreadsheetGridProps } from './model/gridTypes';

// 型だけの宣言です(利用側のバンドラが process.env.NODE_ENV を文字列へ置き換える)。
declare const process: { env: { NODE_ENV?: string } };

const noop = () => {};

// 値が変わったときだけ effect を走らせる(React 版の useEffect の deps と同じ)。Solid 2.0 の createEffect は compute の値を
//   比べない(compute が読む memo が新しいオブジェクトを返すたびに、値が同じでも effect が走る)ので、compute を memo
//   (=== で比べる)に通してからつなぐ。
const createChangeEffect = <V>(compute: () => V, effect: (value: V) => void): void => {
  createEffect(createMemo(compute), effect, { name: 'devWarning' });
};

type FeaturePropCheck = {
  prop: string;
  // features: 機能セット(ほかの機能がその prop を使うときに警告しないため)。
  isUsed: <T extends object>(props: SpreadsheetGridProps<T>, features: SolidGridFeatures) => boolean;
};

// 機能ごとの「その機能の prop が使われているか」(React 版の FEATURE_PROPS と同じ。機能を足すと型がここへの追加を求めます)。
const FEATURE_PROPS: { [K in GridFeatureName]-?: readonly FeaturePropCheck[] } = {
  find: [{ prop: 'find', isUsed: (props) => props.find !== undefined && props.find !== false }],
  fillHandle: [{ prop: 'fillHandle', isUsed: (props) => Boolean(props.fillHandle) }],
  // 列の並べ替えは onColumnsChange で有効になる(リサイズ等と共通の prop なので、それでは警告しない)。
  columnReorder: [{ prop: 'columnDragMotion', isUsed: (props) => props.columnDragMotion !== undefined }],
  rowDrag: [{ prop: 'enableRowDrag', isUsed: (props) => props.enableRowDrag === true }],
  scrollHint: [{ prop: 'scrollHint', isUsed: (props) => props.scrollHint !== undefined && props.scrollHint !== false }],
  imeDirectInput: [{ prop: 'imeDirectInput', isUsed: (props) => props.imeDirectInput === true }],
  totalRow: [{ prop: 'totalRow', isUsed: (props) => props.totalRow !== undefined && props.totalRow !== false }],
  pinnedRows: [
    { prop: 'pinnedTopRows', isUsed: (props) => (props.pinnedTopRows?.length ?? 0) > 0 },
    { prop: 'pinnedBottomRows', isUsed: (props) => (props.pinnedBottomRows?.length ?? 0) > 0 },
  ],
  columnAutosize: [
    {
      prop: 'autoSizeColumns',
      isUsed: (props) => props.autoSizeColumns !== undefined && props.autoSizeColumns !== false,
    },
  ],
  contextMenu: [{ prop: 'enableContextMenu', isUsed: (props) => props.enableContextMenu === true }],
  // 列メニューは既定で有効なので、明示した true だけ警告する。ツールパネルがあれば enableColumnMenu はその「列」タブの
  //   有無に効くので警告しない。
  columnMenu: [
    {
      prop: 'enableColumnMenu',
      isUsed: (props, features) => props.enableColumnMenu === true && features.toolPanel === undefined,
    },
  ],
  // ツールパネルは専用の prop を持たない。ハンドルの openFilterManager は呼ばれた時点で警告する(下の withOpenToolPanelWarnings)。
  toolPanel: [],
  conditionalFormat: [
    {
      prop: 'columns[].conditionalFormat',
      isUsed: (props) => props.columns.some((column) => column.conditionalFormat !== undefined),
    },
  ],
  // 既定 true の prop なので、明示して true を渡したときだけ警告する。
  selectionAggregates: [{ prop: 'showSelectionAggregates', isUsed: (props) => props.showSelectionAggregates === true }],
  motionExtras: [
    { prop: 'highlightChanges', isUsed: (props) => props.highlightChanges === true },
    { prop: 'showCopyRange', isUsed: (props) => props.showCopyRange === true },
    { prop: 'hoverHighlight', isUsed: (props) => props.hoverHighlight === 'cross' },
  ],
  // エクスポートは prop ではなくメソッドなので、呼ばれた時点で警告する(下の inertExportFeature)。
  export: [],
  filtering: [
    { prop: 'enableColumnFilter', isUsed: (props) => props.enableColumnFilter === true },
    { prop: 'enableGlobalFilter', isUsed: (props) => props.enableGlobalFilter === true },
    {
      prop: 'columns[].filterType',
      isUsed: (props) => props.enableColumnFilter !== false && props.columns.some((column) => column.filterType !== undefined),
    },
    { prop: 'manualFiltering', isUsed: (props) => props.manualFiltering === true },
    { prop: 'getFilterOptions', isUsed: (props) => props.getFilterOptions !== undefined },
    { prop: 'showFilterChipBar', isUsed: (props) => props.showFilterChipBar === true },
    { prop: 'renderFilterDateInput', isUsed: (props) => props.renderFilterDateInput !== undefined },
    { prop: 'showTopBarFilter', isUsed: (props) => props.showTopBarFilter === true },
    { prop: 'globalFilterPlaceholder', isUsed: (props) => props.globalFilterPlaceholder !== undefined },
    { prop: 'globalFilterIcon', isUsed: (props) => props.globalFilterIcon !== undefined },
  ],
  serverSide: [
    { prop: 'dataSource', isUsed: (props) => props.dataSource !== undefined },
    { prop: 'serverSideRefreshToken', isUsed: (props) => props.serverSideRefreshToken !== undefined },
    { prop: 'onServerSideLoadError', isUsed: (props) => props.onServerSideLoadError !== undefined },
    { prop: 'onServerSideWriteError', isUsed: (props) => props.onServerSideWriteError !== undefined },
    { prop: 'showSaveStatus', isUsed: (props) => props.showSaveStatus === true },
  ],
  autoHeight: [{ prop: 'autoHeight', isUsed: (props) => props.autoHeight === true }],
  labelRow: [{ prop: 'labelRow', isUsed: (props) => props.labelRow !== undefined }],
  // 列の rowGroup。サーバーサイドで動くとき(dataSource と serverSide の機能がある)は grouping を入れても効かない(別に
  //   警告が出る)ので勧めない。serverSide の機能が無ければ dataSource は外されて clientSide になるので警告する。
  grouping: [
    {
      prop: 'columns[].rowGroup',
      isUsed: (props, features) =>
        props.columns.some((column) => column.rowGroup === true) &&
        (props.dataSource === undefined || features.serverSide === undefined),
    },
  ],
};

// 機能セットに無い機能の prop の警告(createSpreadsheetGrid が作る部品の先頭で呼ぶ。props は機能が無いときの置き換えの前)。
//   警告の対象を「機能:prop」の文字列のキーへ畳み、中身が変わったときだけ警告する(React 版と同じ)。
function createUnregisteredFeatureWarningsInDev<T extends object>(
  props: SpreadsheetGridProps<T>,
  features: SolidGridFeatures,
): void {
  createChangeEffect(
    () =>
      (Object.keys(FEATURE_PROPS) as GridFeatureName[])
        .filter((name) => features[name] === undefined)
        .flatMap((name) =>
          FEATURE_PROPS[name].filter((check) => check.isUsed(props, features)).map((check) => `${name}:${check.prop}`),
        )
        .join(','),
    (missingKey) => {
      if (missingKey === '') {
        return;
      }
      for (const entry of missingKey.split(',')) {
        const separator = entry.indexOf(':');
        warnUnregisteredFeatureProps([entry.slice(separator + 1)], entry.slice(0, separator));
      }
    },
  );
}

export const createUnregisteredFeatureWarnings: typeof createUnregisteredFeatureWarningsInDev =
  process.env.NODE_ENV === 'production' ? noop : createUnregisteredFeatureWarningsInDev;

// エクスポートが無い構成の代役: 何も出力しない(エンジンの代役と同じ)うえで、呼ばれたら 1 回だけ警告する(React 版の
//   features/resolve.ts の inertExportFeature と同じ)。
const inertExportFeature: NonNullable<SolidGridFeatures['export']> = {
  createExportCommands: <T>() => {
    const inert = createInertExportCommands<T>();
    return {
      exportCsv: (options) => {
        warnUnregisteredFeatureMethod('exportCsv', 'export');
        return inert.exportCsv(options);
      },
      downloadCsv: (filename, options) => {
        warnUnregisteredFeatureMethod('downloadCsv', 'export');
        inert.downloadCsv(filename, options);
      },
      getExportData: (options) => {
        warnUnregisteredFeatureMethod('getExportData', 'export');
        return inert.getExportData(options);
      },
    };
  },
};

// 開発時だけ、エクスポートの無い機能セットへ警告する代役を入れます(本番は機能セットのまま = エンジンの代役)。
export const withMethodWarningFeatures = (features: SolidGridFeatures): SolidGridFeatures =>
  process.env.NODE_ENV !== 'production' && features.export === undefined
    ? { ...features, export: inertExportFeature }
    : features;

type OpenToolPanel = (tab: 'filter' | 'columns' | 'sort') => void;

// ハンドルの openFilterManager などがツールパネルを開く関数に、足りない機能の警告を足します(React 版の features/resolve.ts の
//   createInertToolPanelFeature / withFilterManagerWarning と同じ)。
//   - パネルを作っていない(ツールパネルが無い / 列メニューもフィルターも無く入口が無い): 呼ばれたら警告して何もしない。
//     足すべき機能はツールパネルが無ければ toolPanel、あればフィルターのタブに要る filtering。
//   - パネルはあるがフィルターが無い(列メニューはある): フィルターのタブを開こうとしたら filtering を警告して、そのまま渡す。
function withOpenToolPanelWarningsInDev(open: OpenToolPanel | undefined, features: SolidGridFeatures): OpenToolPanel {
  if (open === undefined) {
    const missing = features.toolPanel === undefined ? 'toolPanel' : 'filtering';
    return () => {
      warnUnregisteredFeatureMethod('openFilterManager', missing);
    };
  }
  if (features.filtering !== undefined) {
    return open;
  }
  return (tab) => {
    if (tab === 'filter') {
      warnUnregisteredFeatureMethod('openFilterManager', 'filtering');
    }
    open(tab);
  };
}

export const withOpenToolPanelWarnings: typeof withOpenToolPanelWarningsInDev =
  process.env.NODE_ENV === 'production' ? (open) => open ?? noop : withOpenToolPanelWarningsInDev;

// グリッド 1 つにつき種類(id)ごとに 1 回だけ出します(React 版の warnOncePerGrid)。
const warnOncePerGrid = (warned: Set<string>, id: string, message: string) => {
  if (warned.has(id)) {
    return;
  }
  warned.add(id);
  console.warn(message);
};

export type ShellDevWarningArgs = {
  // 機能セットにフィルターがあるか(無いのにフィルターの状態が入ったら警告する)。
  filteringAvailable: boolean;
  isServerSide: () => boolean;
  groupColumnCount: () => number;
  rowGroupingActive: () => boolean;
  labelRowEnabled: () => boolean;
  autoHeight: () => boolean;
  hasAutoHeightColumn: () => boolean;
  viewRowCount: () => number;
  detailRowEnabled: () => boolean;
  detailExtraCount: () => number;
  detailActive: () => boolean;
  globalFilterText: () => string;
  columnFilterCount: () => number;
};

// シェルの警告(React 版の GridShell.tsx の useEffect と同じ条件と回数)。
function createShellDevWarningsInDev(args: ShellDevWarningArgs): void {
  // サーバーサイドで rowGroup の列があるとき(例外は投げず、グループ化を無視して表示する)。React 版は [isServerSide,
  //   groupColumns.length] が変わるたびに出す。
  createChangeEffect(
    () => (args.isServerSide() ? args.groupColumnCount() : 0),
    (count) => {
      if (count > 0) {
        console.warn(
          '[SpreadsheetGrid] serverSide(dataSource)では行グルーピング(rowGroup)は未対応です。rowGroup 指定を無視して通常表示します。\n' +
            '[SpreadsheetGrid] Row grouping (rowGroup) is not supported with serverSide (dataSource). rowGroup is ignored and rows are shown ungrouped.',
        );
      }
    },
  );
  // 行のグループ化とラベル行の併用(グループ化している間はラベル行を出さない)。
  createChangeEffect(
    () => args.rowGroupingActive() && args.labelRowEnabled(),
    (both) => {
      if (both) {
        console.warn(
          '[SpreadsheetGrid] 行グルーピング(rowGroup)とラベル行(labelRow)は併用できません。rowGroup 有効中はラベル行を表示しません。\n' +
            '[SpreadsheetGrid] Row grouping (rowGroup) cannot be combined with label rows (labelRow). Label rows are hidden while rows are grouped.',
        );
      }
    },
  );
  const warned = new Set<string>();
  // auto-height が使えないとき(サーバーサイド / 行数の上限。uniform の行の高さにする)。
  createChangeEffect(
    () =>
      args.autoHeight() && args.hasAutoHeightColumn()
        ? args.isServerSide()
          ? 'serverSide'
          : args.viewRowCount() > AUTO_HEIGHT_MAX_ROWS
            ? args.viewRowCount()
            : null
        : null,
    (reason) => {
      if (reason === 'serverSide') {
        warnOncePerGrid(
          warned,
          'autoHeightServerSide',
          '[SpreadsheetGrid] serverSide(dataSource)では auto-height は未対応です(未ロード行の高さが不明なため)。uniform 行高にフォールバックします。\n' +
            '[SpreadsheetGrid] auto-height is not supported with serverSide (dataSource) because rows that are not loaded have no height. Falling back to a uniform row height.',
        );
      } else if (typeof reason === 'number') {
        warnOncePerGrid(
          warned,
          'autoHeightMaxRows',
          `[SpreadsheetGrid] auto-height は ${AUTO_HEIGHT_MAX_ROWS} 行までです(現在 ${reason} 行)。uniform 行高にフォールバックします。\n` +
            `[SpreadsheetGrid] auto-height supports up to ${AUTO_HEIGHT_MAX_ROWS} rows (currently ${reason}). Falling back to a uniform row height.`,
        );
      }
    },
  );
  // 展開行が描けない高さ(行の高さの合計 + 帯の高さが上限を超える。開いた状態は保つ)。
  createChangeEffect(
    () => args.detailRowEnabled() && args.detailExtraCount() > 0 && !args.detailActive(),
    (overflow) => {
      if (overflow) {
        warnOncePerGrid(
          warned,
          'detailMaxBody',
          `[SpreadsheetGrid] 展開行は論理全高(行高合計 + 帯高)が ${MAX_BODY_PX}px 以内のときだけ描画します(行数上限超過)。展開状態は保持されますが帯は描かれません。\n` +
            `[SpreadsheetGrid] Detail rows are drawn only while the total height (rows + details) is at most ${MAX_BODY_PX}px (too many rows). The expanded state is kept, but the details are not drawn.`,
        );
      }
    },
  );
  // フィルターの機能が無いのにフィルターの状態(applyState / setGlobalFilterText)が入ったとき(効かないことに気づけるように)。
  if (!args.filteringAvailable) {
    createChangeEffect(
      () => args.globalFilterText().trim() !== '' || args.columnFilterCount() > 0,
      (hasFilterState) => {
        if (hasFilterState) {
          warnUnregisteredFeatureState(
            'フィルターの状態(applyState / setGlobalFilterText)',
            'The filter state (applyState / setGlobalFilterText)',
            'filtering',
          );
        }
      },
    );
  }
}

export const createShellDevWarnings: typeof createShellDevWarningsInDev =
  process.env.NODE_ENV === 'production' ? noop : createShellDevWarningsInDev;

// サーバーサイドで moveRow() が呼ばれたとき(clientSide 専用。何もしない)。
export const warnMoveRowOnServerSide = (): void => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      '[SpreadsheetGrid] moveRow() は clientSide(rows + onRowsChange)専用です。serverSide では無効です。\n' +
        '[SpreadsheetGrid] moveRow() works only with clientSide rows (rows + onRowsChange). It does nothing with serverSide.',
    );
  }
};