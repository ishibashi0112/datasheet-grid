// フィルハンドル(fillHandle prop。機能 features/fillHandle)を Solid へつなぎます。React 版の features/fillHandle.tsx +
//   hooks/useFillHandleController.ts にあたるものです。中身は core の controllers/fillHandleController(ハンドルのドラッグ /
//   ダブルクリック / 埋めたあとのボタンとメニュー)で、ここはコントローラの接続と状態の signal、ハンドルを出す角・ドラッグ中の
//   点線・ボタンの位置の計算(React 版の useMemo と同じ式)です。描画は view/FillHandleLayer。
//   - 有効なのは fillHandle が真で、readOnly でなく、書き込み先(clientSide は onRowsChange、serverSide は書き戻し口)が
//     あるとき(React 版と同じ)。
//   - ポインタの位置(ドラッグ中の値のツールチップ)はツールチップの部品が直接購読します(シェルは描き直さない)。
import { createMemo } from 'solid-js';
import {
  createFillHandleController,
  type FillHandleController,
  type FillHandleControllerArgs,
  type FillHandleSnapshot,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/fillHandleController';
import {
  hasFillableSource,
  resolveFillCornerPlacement,
  resolveFillOptionsChipPosition,
  resolveFillSource,
  type FillCornerPlacement,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/fillHandle';
import {
  resolveSelectionBand,
  resolveSelectionBandSegments,
  resolveSelectionExtents,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/selectionOverlayGeometry';
import type { ColumnPane, GridPaneLayout } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { physicalToLogicalScrollTop } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/verticalGeometry';
import type { VerticalLayoutResolution } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/verticalLayout';
import type { GridSelection, GridUiState } from '@ishibashi0112/spreadsheet-grid-core';
import type { SpreadsheetGridProps } from '../model/gridTypes';
import { connectController } from './controller';
import { createExternalStoreSignal } from './externalStore';

type ControllerArgs<T> = FillHandleControllerArgs<T>;

export type FillHandleInputs<T> = {
  fillHandle: () => SpreadsheetGridProps<T>['fillHandle'];
  readOnly: () => boolean;
  isServerSide: () => boolean;
  rows: () => ControllerArgs<T>['rows'];
  rowModel: () => ControllerArgs<T>['rowModel'];
  orderedColumns: () => ControllerArgs<T>['columns'];
  uiState: () => GridUiState;
  // serverSide の問い合わせのキー / 取り直しの印(表示の条件。変わったら埋めたあとのボタンを消す)。
  serverSideQueryKey: () => string;
  serverSideRefreshToken: () => number | undefined;
  canEditCell: () => ControllerArgs<T>['canEditCell'];
  dispatch: ControllerArgs<T>['dispatch'];
  hitTest: ControllerArgs<T>['hitTest'];
  scrollContainerRef: ControllerArgs<T>['scrollContainerRef'];
  gridRootRef: ControllerArgs<T>['gridRootRef'];
  footerHeight: () => number;
  stickyTopHeight: () => number;
  handleRowsChange: () => ControllerArgs<T>['applyRowsChange'];
  amendRowsChange: ControllerArgs<T>['amendRowsChange'];
  applyServerSideCellEdits: () => ControllerArgs<T>['applyServerSideCellEdits'];
  viewRowCount: () => number;
  paneLayout: () => GridPaneLayout<T>;
  vertical: () => Pick<
    VerticalLayoutResolution,
    'rowMetrics' | 'windowFirstRow' | 'windowLastRow' | 'detailActive' | 'detailExtras' | 'verticalScaleFactor'
  >;
  viewportHeight: () => number;
  scrollTop: () => number;
  headerHeight: () => number;
};

export type FillOverlayRect = { left: number; top: number; width: number; height: number };

export type FillHandleState = {
  controller: Pick<
    FillHandleController<unknown>,
    | 'handlePointerDown'
    | 'toggleMenu'
    | 'closeMenu'
    | 'chooseKind'
    | 'subscribePointer'
    | 'getPointerSnapshot'
    | 'menuPanel'
    | 'chipElement'
  >;
  snapshot: () => FillHandleSnapshot;
  // ドラッグ中か(ルートの .ssg-root--filling)。
  filling: () => boolean;
  // ハンドルを出す角(範囲選択中のドラッグ・編集中・埋める値が無い範囲では null)。
  corner: () => FillCornerPlacement | null;
  // ドラッグ中の点線(元の範囲 + 埋める範囲)のペイン別の矩形(展開行の帯は避ける)。
  previewRects: (pane: ColumnPane) => FillOverlayRect[];
  // 埋めたあとのボタンの位置(埋めた範囲の右下)。
  chip: () => { pane: ColumnPane; position: { x: number; y: number } } | null;
};

export function createFillHandle<T>(inputs: FillHandleInputs<T>): FillHandleState {
  const controller = createFillHandleController<T>();
  const options = createMemo(() => {
    const fillHandle = inputs.fillHandle();
    return typeof fillHandle === 'object' ? fillHandle : undefined;
  });
  const enabled = createMemo(
    () =>
      Boolean(inputs.fillHandle()) &&
      !inputs.readOnly() &&
      (inputs.isServerSide()
        ? inputs.applyServerSideCellEdits() !== undefined
        : inputs.handleRowsChange() !== undefined),
  );
  connectController(controller, () => {
    const ui = inputs.uiState();
    return {
      enabled: enabled(),
      isServerSide: inputs.isServerSide(),
      rows: inputs.rows(),
      rowModel: inputs.rowModel(),
      columns: inputs.orderedColumns(),
      selection: ui.selection,
      activeCell: ui.activeCell,
      editing: ui.editingCell !== null,
      // 表示の条件が変わったら埋めたあとのボタンを消します(並びが変わった行へ選び直さない)。
      viewKey: [
        ui.sort,
        ui.filters,
        ui.collapsedGroupKeys,
        inputs.serverSideQueryKey(),
        inputs.serverSideRefreshToken(),
      ],
      readOnly: inputs.readOnly(),
      canEditCell: inputs.canEditCell(),
      // 列の描画の型(Solid の部品)だけが違う(core は素通しの型)。
      getFillValue: options()?.getFillValue as ControllerArgs<T>['getFillValue'],
      dispatch: inputs.dispatch,
      hitTest: inputs.hitTest,
      scrollContainerRef: inputs.scrollContainerRef,
      gridRootRef: inputs.gridRootRef,
      footerHeight: inputs.footerHeight(),
      stickyTopHeight: inputs.stickyTopHeight(),
      applyRowsChange: inputs.handleRowsChange(),
      amendRowsChange: inputs.amendRowsChange,
      applyServerSideCellEdits: inputs.applyServerSideCellEdits(),
    };
  }, 'render', 'fillHandle');
  const snapshot = createExternalStoreSignal(controller, 'fillHandleStore');
  // 縦のレイアウトは項目ごとに受けます(縦のレイアウトの答えは表の状態が変わるたびに新しいオブジェクトになるので、まるごと読むと
  //   セルを押しただけでボタンの位置を計算し直し、続いてコントローラがボタンを消したときにもう 1 回計算していた = Solid の
  //   開発時の EFFECT_RELAY_TEAR。中の値は core が同じ参照のまま返す)。
  const rowMetrics = createMemo(() => inputs.vertical().rowMetrics);
  const windowFirstRow = createMemo(() => inputs.vertical().windowFirstRow);
  const windowLastRow = createMemo(() => inputs.vertical().windowLastRow);
  const detailActive = createMemo(() => inputs.vertical().detailActive);
  const detailExtras = createMemo(() => inputs.vertical().detailExtras);
  const verticalScaleFactor = createMemo(() => inputs.vertical().verticalScaleFactor);
  // 列の配置 / 見える大きさも、値が変わったときだけ計算し直します(表の状態 / view スライスのほかの項目の変化では動かない)。
  const paneLayout = createMemo(inputs.paneLayout);
  const viewportHeight = createMemo(inputs.viewportHeight);
  const scrollTop = createMemo(inputs.scrollTop);
  const headerHeight = createMemo(inputs.headerHeight);

  const corner = createMemo(() => {
    const ui = inputs.uiState();
    if (!enabled() || ui.editingCell || ui.dragState?.type === 'selection') {
      return null;
    }
    const columns = inputs.orderedColumns();
    const rowModel = inputs.rowModel();
    const source = resolveFillSource(ui.selection, ui.activeCell, inputs.viewRowCount(), columns.length);
    // 合成列だけ / ラベル行・グループ行だけの範囲には出しません(埋める値が無い)。
    if (!source || !hasFillableSource(source, rowModel, columns)) {
      return null;
    }
    return resolveFillCornerPlacement(source, paneLayout(), rowMetrics(), windowFirstRow(), windowLastRow());
  });

  const previewSelection = createMemo<GridSelection>(() => {
    const current = snapshot();
    if (current.status !== 'dragging' || current.target === null) {
      return null;
    }
    const { source, target } = current;
    return {
      type: 'cell',
      range: {
        start: {
          row: Math.min(source.startRow, target.range.startRow),
          col: Math.min(source.startCol, target.range.startCol),
        },
        end: {
          row: Math.max(source.endRow, target.range.endRow),
          col: Math.max(source.endCol, target.range.endCol),
        },
      },
    };
  });
  const previewGeometry = createMemo(() => {
    const selection = previewSelection();
    if (selection === null) {
      return null;
    }
    const extents = resolveSelectionExtents(selection, paneLayout(), inputs.viewRowCount());
    const segments = resolveSelectionBandSegments(
      detailActive(),
      extents,
      windowFirstRow(),
      windowLastRow(),
      rowMetrics(),
      detailExtras(),
    );
    const band = segments ? null : resolveSelectionBand(extents, windowFirstRow(), windowLastRow(), rowMetrics());
    return { extents, segments, band };
  });
  const previewRects = (pane: ColumnPane): FillOverlayRect[] => {
    const geometry = previewGeometry();
    const extent = geometry?.extents?.extents[pane];
    if (!geometry || !extent) {
      return [];
    }
    if (geometry.segments) {
      return geometry.segments.map((segment) => ({
        left: extent.start,
        top: segment.top,
        width: extent.width,
        height: segment.height,
      }));
    }
    return geometry.band
      ? [{ left: extent.start, top: geometry.band.top, width: extent.width, height: geometry.band.height }]
      : [];
  };

  const chip = createMemo(() => {
    const current = snapshot();
    if (current.status !== 'filled') {
      return null;
    }
    const placement = resolveFillCornerPlacement(
      current.range,
      paneLayout(),
      rowMetrics(),
      windowFirstRow(),
      windowLastRow(),
    );
    // 本体の行が見えている下端(合計行があればその上端)を超えるなら角の上へ出します。未計測なら使いません。角は行の
    //   論理座標なので、見えている下端も論理座標で求めます(React 版と同じ)。
    const visibleHeight = viewportHeight();
    const visibleBottom =
      visibleHeight > 0
        ? physicalToLogicalScrollTop(scrollTop(), verticalScaleFactor()) + visibleHeight - headerHeight()
        : Number.POSITIVE_INFINITY;
    return placement
      ? {
          pane: placement.pane,
          position: resolveFillOptionsChipPosition(placement, rowMetrics().totalBodyHeight, visibleBottom),
        }
      : null;
  });

  return {
    controller: controller as unknown as FillHandleState['controller'],
    snapshot,
    // 真偽値が変わったときだけ知らせます(ルートの class の描き直しを、ボタンが消えただけでは起こさない)。
    filling: createMemo(() => snapshot().status === 'dragging'),
    corner,
    previewRects,
    chip,
  };
}