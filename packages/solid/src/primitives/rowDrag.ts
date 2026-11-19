// 行ドラッグによる並べ替え(rowDrag の機能)を Solid へつなぎます。React 版の hooks/useRowDragController.ts +
//   features/rowDrag.tsx(ゴーストのラベル / 掴んだ行の探し直し / 落とせるかの判定 / 確定後の滑り込み)にあたるものです。
//   中身は core の controllers/rowDragController(ドラッグ中はフレームワークの状態を変えず、ガイド線 / ゴースト / live 方式の
//   追従を DOM へ直接書く)。行の移動の確定(commitRowMove)と命令的 API の moveRow はシェルに置きます(React 版と同じ)。
//   - 落とせるかの判定(canDropAt)は canDropRow / rows / 行のキーの関数が変わったときだけ作り直します(コントローラは関数が
//     変わると答えの控えを捨てるので、React 版の useMemo と同じ回数だけ canDropRow を呼ぶように)。
//   - ゴーストのラベル / 掴んだ行の控えと探し直しは、呼ばれた時点の行モデルで答えます(React 版は描くたびに新しい関数)。
//   - 滑り込みは行の並びが変わって DOM を書き終えた後に呼びます(React 版はコミット後・描く前のレイアウト effect)。
import { createEffect, createMemo, untrack } from 'solid-js';
import {
  createRowDragController,
  type RowDragArgs,
  type RowDragController,
} from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/rowDragController';
import { isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { resolveMoveTargetIndex } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowReorder';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
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

type DragRowToken = { row: unknown; rowKey: unknown; rowCount: number };

export function createRowDrag<T>(inputs: RowDragInputs<T>): RowDrag {
  const controller = createRowDragController();
  const leftIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const centerIndicatorRef: { current: HTMLDivElement | null } = { current: null };
  const rightIndicatorRef: { current: HTMLDivElement | null } = { current: null };

  // canDropRow を controller のスロット(行 i の上の境界が i)で聞ける形に(React 版の features/rowDrag と同じ)。
  const canDropAt = createMemo(() => {
    const canDropRow = inputs.canDropRow();
    if (canDropRow === undefined) {
      return undefined;
    }
    const rows = inputs.rows();
    const resolveRowKey = inputs.resolveRowKey();
    return (fromIndex: number, slot: number): boolean => {
      const toIndex = resolveMoveTargetIndex(fromIndex, slot);
      const row = rows[fromIndex];
      if (toIndex === null || row === undefined) return false;
      return canDropRow({
        row,
        rowKey: resolveRowKey(row, fromIndex),
        fromIndex,
        toIndex,
        rowAbove: slot > 0 ? rows[slot - 1] : undefined,
        rowBelow: slot < rows.length ? rows[slot] : undefined,
        rows,
      });
    };
  });
  // ゴーストのラベル: 先頭の(合成列でない)文字を出す表示列の表示値。空なら「行 N」(React 版と同じ)。
  const getRowDragLabel = (viewIndex: number): string => {
    const fallback = formatLocaleText(untrack(inputs.dragRowLabel), { row: viewIndex + 1 });
    const row = untrack(inputs.rowModel).getRow(viewIndex);
    if (!row) {
      return fallback;
    }
    const column = untrack(inputs.visibleColumns).find(
      (candidate) =>
        !isSyntheticColumnKey(candidate.key) &&
        (candidate.renderCell === undefined || candidate.valueFormatter !== undefined) &&
        candidate.editor?.type !== 'checkbox' &&
        candidate.conditionalFormat?.dataBar?.showValue !== false,
    );
    if (!column) {
      return fallback;
    }
    const value = getCellValue(row, column);
    const text = column.valueFormatter ? column.valueFormatter({ value, row, column }) : String(value ?? '');
    return text.trim().length > 0 ? text : fallback;
  };
  // 掴んだ行を控え、離すときに今の並びで探し直す(React 版と同じ。行の参照 → キー → 行数が同じなら掴んだときの位置)。
  const getDragRow = (viewIndex: number): DragRowToken | null => {
    const rowModel = untrack(inputs.rowModel);
    const row = rowModel.getRow(viewIndex);
    if (row === undefined) return null;
    return { row, rowKey: rowModel.getRowKey(viewIndex), rowCount: rowModel.getRowCount() };
  };
  const locateDragRow = (token: unknown, hint: number): number | null => {
    const rowModel = untrack(inputs.rowModel);
    const { row, rowKey, rowCount } = token as DragRowToken;
    if (rowModel.getRow(hint) === row) return hint;
    const count = rowModel.getRowCount();
    for (let index = 0; index < count; index += 1) {
      if (rowModel.getRow(index) === row) return index;
    }
    if (untrack(inputs.hasRowKeys)) {
      for (let index = 0; index < count; index += 1) {
        if (Object.is(rowModel.getRowKey(index), rowKey)) return index;
      }
      return null;
    }
    return count === rowCount && hint < rowCount ? hint : null;
  };

  connectController(controller, () => ({
    ...inputs.controller(),
    leftIndicatorRef,
    centerIndicatorRef,
    rightIndicatorRef,
    getRowDragLabel,
    getDragRow,
    locateDragRow,
    canDropAt: canDropAt(),
  }));
  // 行の並びが変わったら(確定の後)滑り込み。直前のドロップで用意したときだけ動き、それ以外(編集 / フィルター等)はすぐ戻る。
  createEffect(inputs.rowModel, () => {
    controller.applyReorderSettle();
  });

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