// 追加(差し込み式 段階 2): 行ドラッグによる並べ替え(enableRowDrag / isRowDraggable / rowDragMotion)の機能です。中身は
//   シェル(GridShell.tsx)にあった節(ゴーストのラベル / controller の接続 / settle の layout effect)と、行ドラッグ
//   ハンドル列のセル・ドロップ位置のガイド線の描画をそのまま移したもので、シェルは元の位置で useRowDrag を呼びます
//   (中の hook の順番はシェルにあったときと同じ)。行の移動の確定(commitRowMove)と命令的 API の moveRow はシェルに
//   残します(ドラッグなしでも使える)。機能セットに無い構成では enableRowDrag を false として扱います
//   (createSpreadsheetGrid。ハンドル列もガイド線も出ない)。
import { useCallback } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
import { isSyntheticColumnKey } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import {
  ROW_DRAG_DISABLED_TOOLTIP,
  ROW_DRAG_HANDLE_TOOLTIP,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowReorder';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { useRowDragController } from '../hooks/useRowDragController';
import type { ReactGridFeatures, RowDragFeatureArgs, RowDragFeatureResult } from './types';

const useRowDragFeature = <T,>({
  rowModel,
  visibleColumns,
  isRowDraggable,
  ...controllerArgs
}: RowDragFeatureArgs<T>): RowDragFeatureResult<T> => {
  // ゴーストのラベル: 先頭の(合成列でない)表示列の表示値。空なら「行 N」。
  const getRowDragLabel = useCallback(
    (viewIndex: number): string => {
      const fallback = `行 ${viewIndex + 1}`;
      const row = rowModel.getRow(viewIndex);
      if (!row) {
        return fallback;
      }
      const column = visibleColumns.find(
        (candidate) => !isSyntheticColumnKey(candidate.key),
      );
      if (!column) {
        return fallback;
      }
      const value = getCellValue(row, column);
      const text = column.valueFormatter
        ? column.valueFormatter({ value, row, column })
        : String(value ?? '');
      return text.trim().length > 0 ? text : fallback;
    },
    [rowModel, visibleColumns],
  );
  const {
    onRowDragHandlePointerDown,
    leftIndicatorRef: leftRowDropIndicatorRef,
    centerIndicatorRef: centerRowDropIndicatorRef,
    rightIndicatorRef: rightRowDropIndicatorRef,
    applyReorderSettle: applyRowReorderSettle,
  } = useRowDragController({ ...controllerArgs, getRowDragLabel });
  // 行の並び替え確定(rowModel 差し替え)後に settle アニメを発火します。直前のドロップで armed の
  //   ときだけ動き、それ以外(編集 / フィルター等の rowModel 変化)は即 return するため無害です。
  // 変更(React 18 対応 2026-10-28): React 18 の SSR で警告を出さない useIsomorphicLayoutEffect に(クライアントでは useLayoutEffect のまま)。
  useIsomorphicLayoutEffect(() => {
    applyRowReorderSettle();
  }, [rowModel, applyRowReorderSettle]);

  // 追加(row-drag ③): 行ドラッグハンドル列(合成列)の本体です。掴み手の pointerdown だけで
  //   ドラッグを開始し(セル選択へは伝播させない)、ソート / フィルター中は淡色 + 理由の
  //   ツールチップにします。isRowDraggable が false の行にはハンドルを出しません。
  const rowDragOperable = controllerArgs.enabled;
  const renderHandleCell = useCallback(
    (row: T, rowIndex: number) => {
      if (isRowDraggable) {
        const sourceRowIndex = rowModel.getSourceIndex(rowIndex) ?? rowIndex;
        const rowKey = rowModel.getRowKey(rowIndex) ?? rowIndex;
        if (!isRowDraggable(row, { rowKey, sourceRowIndex })) {
          return null;
        }
      }
      return (
        <span
          className={cx(
            'ssg-row-drag-handle',
            !rowDragOperable && 'ssg-row-drag-handle--disabled',
          )}
          data-ssg-tooltip={
            rowDragOperable ? ROW_DRAG_HANDLE_TOOLTIP : ROW_DRAG_DISABLED_TOOLTIP
          }
          aria-hidden="true"
          onPointerDown={
            rowDragOperable
              ? (event) => onRowDragHandlePointerDown(rowIndex, event)
              : undefined
          }
        >
          <svg
            width="8"
            height="14"
            viewBox="0 0 8 14"
            fill="currentColor"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="2" cy="3" r="1" />
            <circle cx="6" cy="3" r="1" />
            <circle cx="2" cy="7" r="1" />
            <circle cx="6" cy="7" r="1" />
            <circle cx="2" cy="11" r="1" />
            <circle cx="6" cy="11" r="1" />
          </svg>
        </span>
      );
    },
    [isRowDraggable, rowModel, rowDragOperable, onRowDragHandlePointerDown],
  );

  return {
    renderHandleCell,
    // 行ドロップ位置のガイド線(各ペイン分)。class はペインごとにシェルが決めます(左端のペインはキャップ付き)。
    renderDropIndicator: (pane, className) => (
      <div
        ref={
          pane === 'left'
            ? leftRowDropIndicatorRef
            : pane === 'center'
              ? centerRowDropIndicatorRef
              : rightRowDropIndicatorRef
        }
        className={className}
      />
    ),
  };
};

export const rowDragFeature: NonNullable<ReactGridFeatures['rowDrag']> = {
  useRowDrag: useRowDragFeature,
};