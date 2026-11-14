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
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
// 追加(英語対応): 行ドラッグの機能だけが使う文言(既定は localeTextRowDrag.ts。機能の localeText でシェルが埋める)。
import { DEFAULT_ROW_DRAG_LOCALE_TEXT } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeTextFeatures';
import type { FeatureLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';

type RowDragTexts = FeatureLocaleText<typeof DEFAULT_ROW_DRAG_LOCALE_TEXT>;
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { useRowDragController } from '../hooks/useRowDragController';
import type { GridFeature, GridFeatureParts, RowDragFeatureArgs, RowDragFeatureResult } from './types';

type DragRowToken = { row: unknown; rowKey: unknown; rowCount: number };

const useRowDragFeature = <T,>({
  rowModel,
  visibleColumns,
  isRowDraggable,
  hasRowKeys,
  localeTexts,
  ...controllerArgs
}: RowDragFeatureArgs<T>): RowDragFeatureResult<T> => {
  // ゴーストのラベル: 先頭の(合成列でない)表示列の表示値。空なら「行 N」。
  // 変更(1.0.2 / 2026-11-09 実アプリの総点検 E-06): 値を文字で出さない列(valueFormatter の無い renderCell の列 =
  //   画像など / チェックボックスのエディタ / showValue: false のデータバー)は飛ばし、文字を出す最初の列にします
  //   (先頭が画像の列だと、ゴーストに画像の URL が出てどの行を掴んでいるか分からなかった)。無ければ「行 N」。
  const getRowDragLabel = useCallback(
    (viewIndex: number): string => {
      const fallback = formatLocaleText((localeTexts as RowDragTexts).dragRowLabel, { row: viewIndex + 1 });
      const row = rowModel.getRow(viewIndex);
      if (!row) {
        return fallback;
      }
      const column = visibleColumns.find(
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
      const text = column.valueFormatter
        ? column.valueFormatter({ value, row, column })
        : String(value ?? '');
      return text.trim().length > 0 ? text : fallback;
    },
    [rowModel, visibleColumns, localeTexts],
  );
  // 追加(1.0 前の最終チェック FC-12): 掴んだ行を控え、離すときに今の並びで探し直します(ドラッグ中にポーリング等で
  //   行の並びが変わると、掴んだときの index のまま別の行を動かしていた)。行の参照で探し、見つからなければ
  //   rowKeyGetter があるときだけキーで探します。どちらも無いときは、行数が同じなら掴んだときの index のまま
  //   (行を作り直すだけの再描画で取り消さないため)、行数が変わっていれば取り消します。
  const getDragRow = useCallback(
    (viewIndex: number): DragRowToken | null => {
      const row = rowModel.getRow(viewIndex);
      if (row === undefined) return null;
      return { row, rowKey: rowModel.getRowKey(viewIndex), rowCount: rowModel.getRowCount() };
    },
    [rowModel],
  );
  const locateDragRow = useCallback(
    (token: unknown, hint: number): number | null => {
      const { row, rowKey, rowCount } = token as DragRowToken;
      if (rowModel.getRow(hint) === row) return hint;
      const count = rowModel.getRowCount();
      for (let index = 0; index < count; index += 1) {
        if (rowModel.getRow(index) === row) return index;
      }
      if (hasRowKeys) {
        for (let index = 0; index < count; index += 1) {
          if (Object.is(rowModel.getRowKey(index), rowKey)) return index;
        }
        return null;
      }
      return count === rowCount && hint < rowCount ? hint : null;
    },
    [rowModel, hasRowKeys],
  );
  const {
    onRowDragHandlePointerDown,
    leftIndicatorRef: leftRowDropIndicatorRef,
    centerIndicatorRef: centerRowDropIndicatorRef,
    rightIndicatorRef: rightRowDropIndicatorRef,
    applyReorderSettle: applyRowReorderSettle,
  } = useRowDragController({ ...controllerArgs, getRowDragLabel, getDragRow, locateDragRow });
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