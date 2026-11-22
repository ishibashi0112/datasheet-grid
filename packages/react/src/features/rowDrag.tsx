// 追加(差し込み式 段階 2): 行ドラッグによる並べ替え(enableRowDrag / isRowDraggable / rowDragMotion)の機能です。中身は
//   シェル(GridShell.tsx)にあった節(ゴーストのラベル / controller の接続 / settle の layout effect)と、行ドラッグ
//   ハンドル列のセル・ドロップ位置のガイド線の描画をそのまま移したもので、シェルは元の位置で useRowDrag を呼びます
//   (中の hook の順番はシェルにあったときと同じ)。行の移動の確定(commitRowMove)と命令的 API の moveRow はシェルに
//   残します(ドラッグなしでも使える)。機能セットに無い構成では enableRowDrag を false として扱います
//   (createSpreadsheetGrid。ハンドル列もガイド線も出ない)。
import { useCallback, useMemo } from 'react';
import { useIsomorphicLayoutEffect } from '../hooks/useController';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/cx';
// 追加(英語対応): 行ドラッグの機能だけが使う文言(既定は localeTextRowDrag.ts。機能の localeText でシェルが埋める)。
import { DEFAULT_ROW_DRAG_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { FeatureLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

type RowDragTexts = FeatureLocaleText<typeof DEFAULT_ROW_DRAG_LOCALE_TEXT>;
import {
  createRowDropCheck,
  getDragRowToken,
  locateDragRowToken,
  resolveRowDragLabel,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/rowDragTarget';
import { useRowDragController } from '../hooks/useRowDragController';
import type { GridFeature, GridFeatureParts, RowDragFeatureArgs, RowDragFeatureResult } from './types';

const useRowDragFeature = <T,>({
  rowModel,
  visibleColumns,
  isRowDraggable,
  canDropRow,
  rows,
  resolveRowKey,
  hasRowKeys,
  localeTexts,
  ...controllerArgs
}: RowDragFeatureArgs<T>): RowDragFeatureResult<T> => {
  // 変更(1.3.0 / Solid 版の品質の段 2-9): 落とせるかの判定 / ゴーストのラベル / 掴んだ行の控えと探し直しは core の
  //   logic/rowDragTarget(Solid 版と同じ処理)。ここはメモ化だけを持ちます(コントローラは関数が変わると答えの控えを捨てる /
  //   引いている間の行を探し直すので、変わる回数は前と同じ)。
  const canDropAt = useMemo(
    () => createRowDropCheck(canDropRow, rows, resolveRowKey),
    [canDropRow, rows, resolveRowKey],
  );
  const getRowDragLabel = useCallback(
    (viewIndex: number): string =>
      resolveRowDragLabel(rowModel, visibleColumns, viewIndex, (localeTexts as RowDragTexts).dragRowLabel),
    [rowModel, visibleColumns, localeTexts],
  );
  const getDragRow = useCallback((viewIndex: number) => getDragRowToken(rowModel, viewIndex), [rowModel]);
  const locateDragRow = useCallback(
    (token: unknown, hint: number): number | null => locateDragRowToken(rowModel, hasRowKeys, token, hint),
    [rowModel, hasRowKeys],
  );
  const {
    onRowDragHandlePointerDown,
    leftIndicatorRef: leftRowDropIndicatorRef,
    centerIndicatorRef: centerRowDropIndicatorRef,
    rightIndicatorRef: rightRowDropIndicatorRef,
    applyReorderSettle: applyRowReorderSettle,
  } = useRowDragController({ ...controllerArgs, getRowDragLabel, getDragRow, locateDragRow, canDropAt });
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
            rowDragOperable ? (localeTexts as RowDragTexts).dragRow : (localeTexts as RowDragTexts).dragRowDisabled
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
    [isRowDraggable, rowModel, rowDragOperable, onRowDragHandlePointerDown, localeTexts],
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

export const rowDragFeature = {
  useRowDrag: useRowDragFeature,
  // 追加(英語対応): この機能だけが使う文言の既定(シェルが本体の既定に重ねる)。
  localeText: DEFAULT_ROW_DRAG_LOCALE_TEXT,
} satisfies GridFeatureParts<'rowDrag'> as unknown as GridFeature<'rowDrag'>;