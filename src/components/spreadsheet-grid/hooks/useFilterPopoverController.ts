import {
    useEffect,
    useMemo,  
    useCallback,
    useRef,
    useState,
  type PointerEvent,
  type RefObject,
} from 'react';
import type { GridColumn } from '../model/gridTypes';
// 追加(記述子化): number 記述子を含む列フィルター値を draft 用テキストへ整形します。
import { columnFilterValueToDraftText } from '../logic/filtering';

// 追加: 列フィルターポップオーバーの内部状態です。
type HeaderFilterPopoverState = {
  columnKey: string;
  draftValue: string;
};

// 追加: body 直下 portal popover の配置情報です。
export type FilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

type UseFilterPopoverControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  columnFilterValues: Record<string, unknown>;
  enableColumnFilter: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
};

const POPUP_WIDTH = 240;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 8;
const ESTIMATED_POPUP_HEIGHT = 260;
// 追加(12-A): set フィルターは検索 + Select All + 候補リスト(208px)を含むため、
//             上下フリップ判定用の見積もり高さを別に持ちます。
const ESTIMATED_SET_POPUP_HEIGHT = 400;

// 追加: 列フィルター popover の state / ref / focus / outside click / layout をまとめて管理します。
export const useFilterPopoverController = <T,>({
  visibleColumns,
  columnFilterValues,
  enableColumnFilter,
  gridRootRef,
}: UseFilterPopoverControllerArgs<T>) => {
  const [filterPopoverState, setFilterPopoverState] =
    useState<HeaderFilterPopoverState | null>(null);
  const [filterPopoverLayout, setFilterPopoverLayout] =
    useState<FilterPopoverLayout | null>(null);

  // 追加: popover / anchor / autofocus 対象 input/select の ref 群です。
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverAnchorButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterTextInputRef = useRef<HTMLInputElement | null>(null);
  const filterSelectRef = useRef<HTMLSelectElement | null>(null);

  const isFilterPopoverOpen = filterPopoverState !== null;
  const openedFilterColumnKey = filterPopoverState?.columnKey ?? null;

  const openedFilterColumn = useMemo(
    () =>
      openedFilterColumnKey
        ? visibleColumns.find((column) => column.key === openedFilterColumnKey) ??
          null
        : null,
    [openedFilterColumnKey, visibleColumns],
  );

  // 追加: anchor button の位置から portal popover の fixed 座標を計算します。
  const updateFilterPopoverLayout = useCallback(() => {
    if (!openedFilterColumnKey || !filterPopoverAnchorButtonRef.current) {
      setFilterPopoverLayout(null);
      return;
    }

    const anchorRect = filterPopoverAnchorButtonRef.current.getBoundingClientRect();

    // 追加(12-A): set フィルターは popover が縦に長いため、見積もり高さを切り替えます。
    const estimatedPopupHeight =
      openedFilterColumn?.filterType === 'set'
        ? ESTIMATED_SET_POPUP_HEIGHT
        : ESTIMATED_POPUP_HEIGHT;

    let left = anchorRect.right - POPUP_WIDTH;
    left = Math.max(VIEWPORT_MARGIN, left);
    left = Math.min(left, window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN);

    let top = anchorRect.bottom + OFFSET_Y;
    if (top + estimatedPopupHeight > window.innerHeight - VIEWPORT_MARGIN) {
      top = anchorRect.top - estimatedPopupHeight - OFFSET_Y;
    }
    top = Math.max(VIEWPORT_MARGIN, top);

    setFilterPopoverLayout((current) => {
      if (
        current &&
        current.top === top &&
        current.left === left &&
        current.width === POPUP_WIDTH
      ) {
        return current;
      }

      return {
        top,
        left,
        width: POPUP_WIDTH,
      };
    });
    // 変更(12-A): 見積もり高さ切替のため openedFilterColumn(filterType)へ依存を追加します。
  }, [openedFilterColumnKey, openedFilterColumn]);

  // 追加: 列フィルターポップオーバーを開きます。
  const openColumnFilterPopover = useCallback(
    (column: GridColumn<T>, event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!enableColumnFilter) {
        return;
      }

      // 追加: grid root に残っているフォーカスを明示的に外します。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();

      // 追加: anchor button を保持し、portal popover の位置計算に使います。
      filterPopoverAnchorButtonRef.current = event.currentTarget;

      setFilterPopoverState({
        columnKey: column.key,
        // 変更(記述子化): number 記述子は String() で "[object Object]" になるため、
        //   raw を取り出す columnFilterValueToDraftText 経由にします(他種別は従来と同値)。
        draftValue: columnFilterValueToDraftText(columnFilterValues[column.key]),
      });
    },
    [columnFilterValues, enableColumnFilter, gridRootRef],
  );

  // 追加: 列フィルターポップオーバーを閉じます。
  const closeColumnFilterPopover = useCallback(() => {
    setFilterPopoverState(null);
    setFilterPopoverLayout(null);
    filterPopoverAnchorButtonRef.current = null;
    filterTextInputRef.current = null;
    filterSelectRef.current = null;

    // 追加: close 後は grid root にフォーカスを戻し、従来の keyboard 操作へ復帰させます。
    requestAnimationFrame(() => {
      gridRootRef.current?.focus();
    });
  }, [gridRootRef]);

  // 追加: フィルター draft を更新します。
  const updateFilterPopoverDraft = useCallback((value: string) => {
    setFilterPopoverState((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        draftValue: value,
      };
    });
  }, []);

  // 追加: portal popover の位置を open / resize / scroll に応じて再計算します。
  useEffect(() => {
    if (!openedFilterColumnKey) {
      return;
    }

    updateFilterPopoverLayout();

    const handleReposition = () => {
      updateFilterPopoverLayout();
    };

    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [openedFilterColumnKey, updateFilterPopoverLayout]);

  // 追加: popover が実際に描画され、かつ「開いた直後 / 別列へ切替時」にだけ
  //       input / select へ自動 focus します。
  useEffect(() => {
    if (!openedFilterColumn || !filterPopoverLayout) {
      return;
    }

    const filterType = openedFilterColumn.filterType ?? 'text';

    let frameId1 = 0;
    let frameId2 = 0;

    frameId1 = requestAnimationFrame(() => {
      frameId2 = requestAnimationFrame(() => {
        if (filterType === 'select') {
          filterSelectRef.current?.focus();
          return;
        }

        const inputElement = filterTextInputRef.current;
        if (!inputElement) {
          return;
        }

        inputElement.focus();
        // 追加: 全文選択ではなく末尾へ caret を置き、半角入力時の全文置換を避けます。
        const end = inputElement.value.length;
        inputElement.setSelectionRange(end, end);
      });
    });

    return () => {
      cancelAnimationFrame(frameId1);
      cancelAnimationFrame(frameId2);
    };
  }, [
    openedFilterColumn,
    filterPopoverLayout?.top,
    filterPopoverLayout?.left,
    filterPopoverLayout?.width,
  ]);

  // 追加: ポップオーバー表示中は、外側クリックで閉じます。
  useEffect(() => {
    if (!isFilterPopoverOpen) {
      return;
    }

    const handleWindowPointerDown = (event: globalThis.PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }

      if (filterPopoverRef.current?.contains(targetNode)) {
        return;
      }

      // 追加: anchor button を押したケースでは close の native listener と競合させません。
      if (filterPopoverAnchorButtonRef.current?.contains(targetNode)) {
        return;
      }

      closeColumnFilterPopover();
    };

    window.addEventListener('pointerdown', handleWindowPointerDown);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
    };
  }, [closeColumnFilterPopover, isFilterPopoverOpen]);

  return {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef,
    filterTextInputRef,
    filterSelectRef,
    isFilterPopoverOpen,
    openedFilterColumn,
    openColumnFilterPopover,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
  };
};

export default useFilterPopoverController;