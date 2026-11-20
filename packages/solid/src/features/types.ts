// Solid 版の機能セットの型です(React 版の features/types.ts にあたるもの)。エンジン(core)の機能セット(GridCoreFeatures)を
//   広げ、シェルが描画に使う部品(Solid の部品 / 純関数)を足します。各機能の値は features/<機能名>.ts にあり、全部入りの表は
//   features/full.ts です。
//   - React 版と違い、Solid には hook の呼ぶ順番の決まりが無いので、無い機能の代役は要りません(シェルは features.X が
//     あるときだけ部品を作る / 描く)。
//   - 機能の部品は中身の見えない GridFeature<K> で公開します(React 版と同じ。利用側が推論のまま export しても d.ts を書ける)。
//   段階 2 で 21 の機能を順に足します(足した機能だけがこの表にある)。
import type { GridCoreFeatures } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/features';
import type {
  resolveChipSpec,
  resolveColorScaleBackground,
  resolveDataBar,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/conditionalFormat';
import type {
  formatTotalRowCellText,
  resolveTotalRowCaption,
  resolveTotalRowLabelColumnKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/totalRow';
import type { GridLocaleText } from '@ishibashi0112/spreadsheet-grid-core';
import type { GridChip } from '../view/GridChip';
import type { GridTotalRow } from '../view/GridTotalRow';
import type { GridPinnedRows } from '../view/GridPinnedRows';
import type { GridSelectionAggregates } from '../view/GridSelectionAggregates';
import type { createSelectionAggregates } from '../primitives/selectionAggregates';
import type { GridScrollHint } from '../view/GridScrollHint';
import type { ColumnHoverOverlay, CopyRangeOverlay } from '../view/CopyRangeOverlay';
import type { resolveScrollHintOptions } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollHint';
import type { splitTextByFindRanges } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/find';
import type { GridFindBar } from '../view/GridFindBar';
import type { createColumnAutosize } from '../primitives/columnAutosize';
import type { createColumnReorder } from '../primitives/columnReorder';
import type { createRowDrag } from '../primitives/rowDrag';
import type { RowDragHandle } from '../view/RowDragHandle';
import type { createFillHandle } from '../primitives/fillHandle';
import type { FillHandleLayer, FillHandlePortals } from '../view/FillHandleLayer';
import type { createCellContextMenu } from '../primitives/contextMenu';
import type { CellContextMenuPopover } from '../view/CellContextMenuPopover';
import type { BodyContextMenuInput, CellContextMenuInput } from './contextMenu';
import type { GridContextMenuParams } from '../model/gridTypes';
import type { createFilterOrder } from '../primitives/filterOrder';
import type { createFilterPopover } from '../primitives/filterPopover';
import type { ColumnFilterPopoverHost } from '../view/ColumnFilterPopoverHost';
import type { createFilterManagement } from '../primitives/filterManagement';
import type { GridFilterChipBar } from '../view/GridFilterChipBar';
import type { createToolPanel } from '../primitives/toolPanel';
import type { ToolPanel } from '../view/ToolPanel';
import type { FilterManagementPanel } from '../view/FilterManagementPanel';
import type { ColumnChooserPanel } from '../view/ColumnChooserPanel';
import type { SortManagementPanel } from '../view/SortManagementPanel';
import type { createColumnMenu } from '../primitives/columnMenu';
import type { ColumnMenuPopover } from '../view/ColumnMenuPopover';

// 機能だけが使う文言の既定(core の logic/localeText<機能>.ts の表)。シェルが本体の既定に重ねて部品へ渡します(React 版と同じ)。
type FeatureLocaleDefaults = { localeText?: Readonly<Partial<GridLocaleText>> | undefined };

export type SolidGridFeatures = {
  // エクスポート(命令的 API の exportCsv / downloadCsv / getExportData)。描画の部品は無い。
  export?: NonNullable<GridCoreFeatures['export']> | undefined;
  // 行の高さの実測(autoHeight): 実測のコントローラ + 行高ストア(core)。描画の部品は無い(セルの器はシェルが描く)。
  autoHeight?: NonNullable<GridCoreFeatures['autoHeight']> | undefined;
  // 条件付き書式: min / max の集計(core)+ データバー / カラースケール(本体の行)+ 状態チップ(セルの中身)。
  conditionalFormat?:
    | (NonNullable<GridCoreFeatures['conditionalFormat']> & {
        resolveDataBar: typeof resolveDataBar;
        resolveColorScaleBackground: typeof resolveColorScaleBackground;
        resolveChipSpec: typeof resolveChipSpec;
        GridChip: typeof GridChip;
      })
    | undefined;
  // 合計行(totalRow): 集計(core)+ 各ペインに描く部品 + 表示の純関数。
  totalRow?:
    | (NonNullable<GridCoreFeatures['totalRow']> & {
        TotalRow: typeof GridTotalRow;
        formatTotalRowCellText: typeof formatTotalRowCellText;
        resolveTotalRowCaption: typeof resolveTotalRowCaption;
        resolveTotalRowLabelColumnKey: typeof resolveTotalRowLabelColumnKey;
      })
    | undefined;
  // 固定行(pinnedTopRows / pinnedBottomRows): 表示だけの行を各ペインに描く部品。
  pinnedRows?: (FeatureLocaleDefaults & { PinnedRows: typeof GridPinnedRows }) | undefined;
  // 選択範囲の集計(既定の下部バーの平均 / データの個数 / 合計): 集計を求めるアダプタ(core のコントローラ)+ バーの部品。
  selectionAggregates?:
    | (FeatureLocaleDefaults & {
        createSelectionAggregates: typeof createSelectionAggregates;
        SelectionAggregates: typeof GridSelectionAggregates;
      })
    | undefined;
  // スクロール位置インジケーター(行番号のバブル / カスタムスクロールバー / ルーラー): オプションの解決(core)+ 描画の部品。
  scrollHint?:
    | (FeatureLocaleDefaults & {
        resolveScrollHintOptions: typeof resolveScrollHintOptions;
        ScrollHint: typeof GridScrollHint;
      })
    | undefined;
  // 動きの追加分: 変わったセルのフラッシュ(core のコントローラ)+ コピー範囲の点線 / クロスヘアの列の帯の部品。
  motionExtras?:
    | (NonNullable<GridCoreFeatures['motionExtras']> & {
        CopyRangeOverlay: typeof CopyRangeOverlay;
        ColumnHoverOverlay: typeof ColumnHoverOverlay;
      })
    | undefined;
  // 列幅の自動調整: 計測の時間分割ランナー(core)の接続。描画の部品は無い(計測中の overlay はシェルが描く)。
  columnAutosize?: { createColumnAutosize: typeof createColumnAutosize } | undefined;
  // 列見出しのドラッグによる並べ替え: ドラッグのコントローラ(core)の接続。見出しの grip とドロップの縦線はシェルが描く。
  columnReorder?: { createColumnReorder: typeof createColumnReorder } | undefined;
  // 行ドラッグによる並べ替え: ドラッグのコントローラ(core)の接続 + ハンドル列のセルの部品。ガイド線はシェルが描く。
  rowDrag?: (FeatureLocaleDefaults & { createRowDrag: typeof createRowDrag; RowDragHandle: typeof RowDragHandle }) | undefined;
  // フィルハンドル: コントローラ(core)の接続と位置の計算 + 各ペインのハンドル / 点線 / ボタンとメニュー / ツールチップの部品。
  fillHandle?:
    | (FeatureLocaleDefaults & {
        createFillHandle: typeof createFillHandle;
        FillHandleLayer: typeof FillHandleLayer;
        FillHandlePortals: typeof FillHandlePortals;
      })
    | undefined;
  // 右クリックメニュー: コントローラ(core)の接続 + ポップアップの部品 + 右クリックの対象(セル / 行番号)の解決。
  contextMenu?:
    | (FeatureLocaleDefaults & {
        createCellContextMenu: typeof createCellContextMenu;
        CellContextMenuPopover: typeof CellContextMenuPopover;
        buildBodyContextMenuParams: <T>(input: BodyContextMenuInput<T>) => GridContextMenuParams<T> | null;
        buildCellContextMenuParams: <T>(input: CellContextMenuInput<T>) => GridContextMenuParams<T> | null;
      })
    | undefined;
  // フィルター: 行パイプラインの列フィルターの段 + 相対日付プリセットの日付の変わり目の見張り(いずれも core。エンジンが作る)+
  //   グローバルフィルターの適用(大きな表は時間分割)+ 列フィルターのポップオーバー(コントローラの接続と、候補の収集・
  //   コマンド・描画の部品)+ 適用中のフィルターの一覧と列へ移って開く処理 + フィルターのチップのバー。
  filtering?:
    | (NonNullable<GridCoreFeatures['filtering']> &
        FeatureLocaleDefaults & {
          createFilterOrder: typeof createFilterOrder;
          createFilterPopover: typeof createFilterPopover;
          FilterPopoverHost: typeof ColumnFilterPopoverHost;
          createFilterManagement: typeof createFilterManagement;
          FilterChipBar: typeof GridFilterChipBar;
        })
    | undefined;
  // ツールパネル(フィルター / 列 / 並び替えの 3 タブ): コントローラ(core)の接続 + 枠と 3 つのタブの中身の部品。
  toolPanel?:
    | {
        createToolPanel: typeof createToolPanel;
        ToolPanel: typeof ToolPanel;
        FilterManagementPanel: typeof FilterManagementPanel;
        ColumnChooserPanel: typeof ColumnChooserPanel;
        SortManagementPanel: typeof SortManagementPanel;
      }
    | undefined;
  // 列メニュー: コントローラ(core)の接続 + ポップアップの部品。
  columnMenu?:
    | (FeatureLocaleDefaults & {
        createColumnMenu: typeof createColumnMenu;
        ColumnMenuPopover: typeof ColumnMenuPopover;
      })
    | undefined;
  // IME オンのままの直接入力: 透明な入力受けのコントローラ + 入力してよいセルの判定 + 編集の初期値の決定(いずれも core)。
  imeDirectInput?: NonNullable<GridCoreFeatures['imeDirectInput']> | undefined;
  // セル内検索: 検索のコントローラ(core)+ 右上の検索バーの部品 + ヒットを分ける純関数(既定のセルの <mark>)。
  find?:
    | (NonNullable<GridCoreFeatures['find']> &
        FeatureLocaleDefaults & {
          FindBar: typeof GridFindBar;
          splitTextByFindRanges: typeof splitTextByFindRanges;
        })
    | undefined;
};

declare const gridFeatureBrand: unique symbol;
/** 機能セットのキー(`createSpreadsheetGrid` の `features` のキー)。 */
export type GridFeatureName = keyof SolidGridFeatures;
/** 機能の部品(`exportFeature` など)の型。中身は内部の実装で、型からは見えません。`K` はその部品を入れる機能セットのキーです。 */
export interface GridFeature<K extends GridFeatureName> {
  readonly [gridFeatureBrand]: K;
}
/** `createSpreadsheetGrid` の `features` の型(機能セットのキー → その機能の部品)。どの機能も省略できます。 */
export type GridFeatures = { [K in GridFeatureName]?: GridFeature<K> | undefined };
// 機能の部品の中身の型(内部)。features/<名前> が satisfies で使います。
export type GridFeatureParts<K extends GridFeatureName> = NonNullable<SolidGridFeatures[K]>;