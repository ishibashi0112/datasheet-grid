// 行ドラッグによる並べ替え(rowDrag の機能)を Solid へつなぎます。React 版の hooks/useRowDragController.ts +
//   features/rowDrag.tsx(ゴーストのラベル / 掴んだ行の探し直し / 落とせるかの判定 / 確定後の滑り込み)にあたるものです。
//   中身は core の controllers/rowDragController(ドラッグ中はフレームワークの状態を変えず、ガイド線 / ゴースト / live 方式の
//   追従を DOM へ直接書く)。行の移動の確定(commitRowMove)と命令的 API の moveRow はシェルに置きます(React 版と同じ)。
//   - 落とせるかの判定(canDropAt)は canDropRow / rows / 行のキーの関数が変わったときだけ作り直します(コントローラは関数が
//     変わると答えの控えを捨てるので、React 版の useMemo と同じ回数だけ canDropRow を呼ぶように)。
//   - ゴーストのラベル / 掴んだ行の控えは、呼ばれた時点の行モデルで答えます(React 版は描くたびに新しい関数)。掴んだ行の
//     探し直しは行の並びが変わるたびに作り直します(コントローラは関数が変わったら引いている間の行を探し直す)。
//   - 滑り込みは行の並びが変わって DOM を書き終えた後に呼びます(React 版はコミット後・描く前のレイアウト effect)。
import { createEffect, createMemo, untrack } from 'solid-js';
import {
  createRowDragController,
  type RowDragArgs,
  type RowDragController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/rowDragController';
import {
  createRowDropCheck,
  getDragRowToken,
  locateDragRowToken,
  resolveRowDragLabel,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowDragTarget';
import type { GridColumn as UnboundGridColumn } from '@ishibashi0112/spreadsheet-grid-core/internal/model/gridTypes.unbound';
import type { GridRowKey, RowModel, SpreadsheetGridProps } from '@ishibashi0112/spreadsheet-grid-core';
import { connectController } from './controller';

export type RowDragInputs<T> = {
  // コントローラへそのまま渡す値(ガイド線の ref と、下の関数を除く)。
  controller: () => Omit<
    RowDragArgs,
    'leftIndicatorRef' | 'centerIndicatorRef' | 'rightIndicatorRef' | 'getRowDragLabel' | 'getDragRow' | 'locateDragRow' | 'canDropAt'
  >;
  rowModel: () => RowModel<T>;
  visibleColumns: () => readonly UnboundGridColumn<T>[];
  canDropRow: () => SpreadsheetGridProps<T>['canDropRow'];
  rows: () => readonly T[];
  resolveRowKey: () => (row: T, index: number) => GridRowKey;
  hasRowKeys: () => boolean;
  // 「行 N」(ゴーストに出す値が無いとき)。
  dragRowLabel: () => string;
};

export type RowDrag = {
  onRowDragHandlePointerDown: RowDragController['onRowDragHandlePointerDown'];
  // ガイド線の要素を受け取る ref(ペインごと)。表示 / 位置はコントローラが直接書きます。
  setIndicator: (pane: 'left' | 'center' | 'right', element: HTMLDivElement) => void;
};

export function createRowDrag<T>(inputs: RowDragInputs<T>): RowDrag {
  const controller = createRowDragController();
  const leftIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const centerIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const rightIndicatorRef: { current: HTMLDivElement | null } = { current: null };

  // 変更(1.3.0 / 段 2-9): 落とせるかの判定 / ゴーストのラベル / 掴んだ行の控えと探し直しは core の logic/rowDragTarget
  //   (React 版と同じ処理)。ここは作り直す時機だけを持ちます。
  // 落とせるかの判定は canDropRow / rows / 行のキーの関数が変わったときだけ作り直します。
  const canDropAt = createMemo(() => createRowDropCheck(inputs.canDropRow(), inputs.rows(), inputs.resolveRowKey()));
  // ゴーストのラベル / 掴んだ行の控えは、呼ばれた時点の行モデルで答えます。
  const getRowDragLabel = (viewIndex: number): string =>
    resolveRowDragLabel(untrack(inputs.rowModel), untrack(inputs.visibleColumns), viewIndex, untrack(inputs.dragRowLabel));
  const getDragRow = (viewIndex: number) => getDragRowToken(untrack(inputs.rowModel), viewIndex);
  // 探し直しの関数は行の並び(と行のキーの有無)が変わるたびに作り直します。コントローラは引いている間にこの関数が変わると
  //   掴んだ行を探し直す(行が増えたら新しい位置へ、消えたらやめる。1.0 前の最終チェック FC-12)ので、React 版の
  //   useCallback([rowModel, hasRowKeys]) と同じ回数だけ変わるようにします。
  const locateDragRow = createMemo(() => {
    const rowModel = inputs.rowModel();
    const hasRowKeys = inputs.hasRowKeys();
    return (token: unknown, hint: number): number | null => locateDragRowToken(rowModel, hasRowKeys, token, hint);
  });

  // update は描画の後(ふつうの effect)で呼びます。引いている間に行が変わったときの探し直しは、掴んだ行の印
  //   (data-ssg-row-dragging)を新しい行番号(data-row-index)の要素へ付け直し、live 方式では退避した行の基準位置を
  //   DOM から取り直すので、行の要素を書き終えてからでないと前の行番号の要素に付く(React 版はコミット後のレイアウト effect)。
  //   コントローラは update で args を覚えるだけなので、ほかの読み取りはイベントの時点の args で変わらない。
  connectController(
    controller,
    () => ({
      ...inputs.controller(),
      leftIndicatorRef,
      centerIndicatorRef,
      rightIndicatorRef,
      getRowDragLabel,
      getDragRow,
      locateDragRow: locateDragRow(),
      canDropAt: canDropAt(),
    }),
    'effect',
    'rowDrag',
  );
  // 行の並びが変わったら(確定の後)滑り込み。直前のドロップで用意したときだけ動き、それ以外(編集 / フィルター等)はすぐ戻る。
  createEffect(inputs.rowModel, () => {
    controller.applyReorderSettle();
  }, { name: 'rowDragSettle' });

  return {
    onRowDragHandlePointerDown: controller.onRowDragHandlePointerDown,
    setIndicator: (pane, element) => {
      if (pane === 'left') {
        leftIndicatorRef.current = element;
      } else if (pane === 'center') {
        centerIndicatorRef.current = element;
      } else {
        rightIndicatorRef.current = element;
      }
    },
  };
}