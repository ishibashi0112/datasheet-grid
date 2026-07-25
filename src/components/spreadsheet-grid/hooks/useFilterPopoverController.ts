import {
    useEffect,
    useMemo,  
    useCallback,
    useRef,
    useState,
  type RefObject,
} from 'react';
import type {
  ColumnFilterUiType,
  ColumnFilterValue,
  GridColumn,
} from '../model/gridTypes';
// 追加(記述子化): number 記述子を含む列フィルター値を draft 用テキストへ整形します。
import {
  columnFilterValueToDraftText,
  isDateSetColumnFilterValue,
  isNumberColumnFilterValue,
  isNumberSetColumnFilterValue,
  isTextSetColumnFilterValue,
} from '../logic/filtering';
// 追加(filter-ext A): number 列の構造化条件 draft(演算子 + 値 1/2)と、既存フィルター値
//   からの復元です(parsed から構造を逆引き。旧・式構文の保存値も復元できます)。
// 変更(filter-ext B): numberSet は condition から復元します(共有の逆引き実装)。
import {
  numberFilterValueToConditionDraft,
  parsedNumberFilterToConditionDraft,
  type NumberFilterConditionDraft,
} from '../logic/numberFilterCondition';
// 追加(filter-ext C): textSet のテキスト条件 draft と復元です(数値版と同型)。
import {
  parsedTextFilterToConditionDraft,
  type TextFilterConditionDraft,
} from '../logic/textFilterCondition';
// 追加(filter-ext D): dateSet の日付条件 draft と復元です(プリセット含む)。
import {
  parsedDateFilterToConditionDraft,
  type DateFilterConditionDraft,
} from '../logic/dateFilterCondition';

// 追加: 列フィルターポップオーバーの内部状態です。
type HeaderFilterPopoverState = {
  columnKey: string;
  // 追加(filter-ext E): この popover で使う「解決済み」フィルター種別です。
  //   column.filterType が 'auto' の列は open 時に 1 回だけ解決し、開いている間はこの値で固定します
  //   (以後の再オープンでも同じ結果になるよう、解決結果のキャッシュは呼び出し側が持ちます)。
  filterType: ColumnFilterUiType;
  draftValue: string;
  // 追加(filter-ext A): number 系列の構造化条件 draft です(number / numberSet 以外は null)。
  numberDraft: NumberFilterConditionDraft | null;
  // 追加(filter-ext C): textSet のテキスト条件 draft です(textSet 以外は null)。
  textDraft: TextFilterConditionDraft | null;
  // 追加(filter-ext D): dateSet の日付条件 draft です(dateSet 以外は null)。
  dateDraft: DateFilterConditionDraft | null;
};

// 追加: body 直下 portal popover の配置情報です。
export type FilterPopoverLayout = {
  top: number;
  left: number;
  width: number;
};

type UseFilterPopoverControllerArgs<T> = {
  visibleColumns: GridColumn<T>[];
  columnFilterValues: Record<string, ColumnFilterValue>;
  enableColumnFilter: boolean;
  gridRootRef: RefObject<HTMLDivElement | null>;
  // 追加(filter-ext E): filterType: 'auto' を実効種別へ解決するコールバックです
  //   (未指定なら column.filterType をそのまま使う = 従来挙動)。open 時に 1 回だけ呼ばれます。
  resolveColumnFilterType?: (column: GridColumn<T>) => ColumnFilterUiType;
};

const POPUP_WIDTH = 240;
const VIEWPORT_MARGIN = 8;
const OFFSET_Y = 8;
const ESTIMATED_POPUP_HEIGHT = 260;
// 追加(12-A): set フィルターは検索 + Select All + 候補リスト(208px)を含むため、
//             上下フリップ判定用の見積もり高さを別に持ちます。
const ESTIMATED_SET_POPUP_HEIGHT = 400;
// 追加(filter-ext B/C): 複合(numberSet / textSet)は set の内容 + 条件セクション
//   (演算子 + 値入力)ぶん縦に長い。
const ESTIMATED_COMBO_POPUP_HEIGHT = 470;

// 追加: 列フィルター popover の state / ref / focus / outside click / layout をまとめて管理します。
export const useFilterPopoverController = <T,>({
  visibleColumns,
  columnFilterValues,
  enableColumnFilter,
  gridRootRef,
  resolveColumnFilterType,
}: UseFilterPopoverControllerArgs<T>) => {
  const [filterPopoverState, setFilterPopoverState] =
    useState<HeaderFilterPopoverState | null>(null);
  const [filterPopoverLayout, setFilterPopoverLayout] =
    useState<FilterPopoverLayout | null>(null);

  // 追加: popover / anchor / autofocus 対象 input/select の ref 群です。
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const filterPopoverAnchorRef = useRef<HTMLElement | null>(null);
  const filterTextInputRef = useRef<HTMLInputElement | null>(null);
  const filterSelectRef = useRef<HTMLSelectElement | null>(null);

  const isFilterPopoverOpen = filterPopoverState !== null;
  const openedFilterColumnKey = filterPopoverState?.columnKey ?? null;

  // 追加(filter-ext E): open 時に解決した実効フィルター種別です(未オープンは null)。
  //   'auto' が下流(popover / 候補収集 / commit 経路)へ漏れないための単一の窓口です。
  const openedFilterType = filterPopoverState?.filterType ?? null;

  // 変更(filter-ext E): 開いている列は「filterType を解決済みへ差し替えたコピー」を返します。
  //   下流(候補収集 collector / SpreadsheetGrid のハンドラ群)は column.filterType を見て
  //   分岐するため、ここで一度だけ解決しておけば 'auto' の考慮が不要になります。
  const openedFilterColumn = useMemo(() => {
    if (!openedFilterColumnKey) {
      return null;
    }
    const column =
      visibleColumns.find((candidate) => candidate.key === openedFilterColumnKey) ??
      null;
    if (!column || !openedFilterType || column.filterType === openedFilterType) {
      return column;
    }
    return { ...column, filterType: openedFilterType };
  }, [openedFilterColumnKey, visibleColumns, openedFilterType]);

  // 追加: anchor button の位置から portal popover の fixed 座標を計算します。
  const updateFilterPopoverLayout = useCallback(() => {
    if (!openedFilterColumnKey || !filterPopoverAnchorRef.current) {
      setFilterPopoverLayout(null);
      return;
    }

    const anchorRect = filterPopoverAnchorRef.current.getBoundingClientRect();

    // 追加(12-A): set フィルターは popover が縦に長いため、見積もり高さを切り替えます。
    // 変更(filter-ext B/C/D): 複合(numberSet / textSet / dateSet)はさらに条件セクション
    //   ぶん長くなります(dateSet はプリセットチップ行も含む)。
    const estimatedPopupHeight =
      openedFilterColumn?.filterType === 'numberSet' ||
      openedFilterColumn?.filterType === 'textSet' ||
      openedFilterColumn?.filterType === 'dateSet'
        ? ESTIMATED_COMBO_POPUP_HEIGHT
        : openedFilterColumn?.filterType === 'set'
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
  // 変更(③): フィルター操作を列メニュー(⋮)へ集約したため、起点のボタン要素(event)を取りません。
  const openColumnFilterPopover = useCallback(
    (column: GridColumn<T>) => {
      if (!enableColumnFilter) {
        return;
      }

      // 追加: grid root に残っているフォーカスを明示的に外します。
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      gridRootRef.current?.blur();

      // 変更(③): anchor をフィルターボタン → 列ヘッダーセル(data-ssg-col-key)へ移します。
      //   開く起点がメニュー項目でボタン要素が無いため、gridRoot 配下のヘッダーセルを key 一致で
      //   走査して anchor を解決します(キーに特殊文字が含まれてもセレクタ文字列を組まないので安全。
      //   1 列につきヘッダーセルは 1 つ)。横スクロールで対象列が画面外なら見つからず null となり、
      //   updateFilterPopoverLayout 側で layout=null(従来のボタン仮想化時と同等)になります。
      // 変更: NodeList を for...of で回すと lib に DOM.Iterable が無い設定/旧 TS では
      //   TS2488 になるため、lib 非依存の Array.from + find で解決します(列数ぶんの小さな
      //   配列化で早期終了。挙動は同じ。横スクロールで対象列が画面外なら見つからず null)。
      const headerCells =
        gridRootRef.current?.querySelectorAll<HTMLElement>('[data-ssg-col-key]');
      const anchorEl = headerCells
        ? Array.from(headerCells).find(
            (cell) => cell.dataset.ssgColKey === column.key,
          ) ?? null
        : null;
      filterPopoverAnchorRef.current = anchorEl;

      // 追加(filter-ext E): 'auto' 列の実効種別をここで 1 回だけ解決します(以後この popover の
      //   ライフサイクル中は固定。再オープン時の同一性は解決器側のキャッシュが担保します)。
      //   解決器未指定 / 'auto' 以外はそのまま(従来挙動)。
      const filterType: ColumnFilterUiType =
        column.filterType === 'auto' && resolveColumnFilterType
          ? resolveColumnFilterType(column)
          : ((column.filterType ?? 'text') as ColumnFilterUiType);

      // 追加(filter-ext A): number 列は構造化条件 draft(演算子 + 値)で編集します。
      //   既存フィルター値の parsed から復元し、未設定 / 旧 contains 値は既定 draft です。
      // 変更(filter-ext B/C): numberSet / textSet 列は condition から復元します
      //   (逆引きはそれぞれの共有実装)。
      // 変更(filter-ext E): 分岐は解決済み filterType を見ます(auto 列でも正しい draft を張る)。
      const currentValue = columnFilterValues[column.key];
      const numberDraft =
        filterType === 'number'
          ? numberFilterValueToConditionDraft(
              isNumberColumnFilterValue(currentValue) ? currentValue : undefined,
            )
          : filterType === 'numberSet'
            ? parsedNumberFilterToConditionDraft(
                isNumberSetColumnFilterValue(currentValue)
                  ? currentValue.condition
                  : undefined,
              )
            : null;
      const textDraft =
        filterType === 'textSet'
          ? parsedTextFilterToConditionDraft(
              isTextSetColumnFilterValue(currentValue)
                ? currentValue.condition
                : undefined,
            )
          : null;
      const dateDraft =
        filterType === 'dateSet'
          ? parsedDateFilterToConditionDraft(
              isDateSetColumnFilterValue(currentValue)
                ? currentValue.condition
                : undefined,
            )
          : null;

      setFilterPopoverState({
        columnKey: column.key,
        filterType,
        // 変更(記述子化): number 記述子は String() で "[object Object]" になるため、
        //   raw を取り出す columnFilterValueToDraftText 経由にします(他種別は従来と同値)。
        draftValue: columnFilterValueToDraftText(currentValue),
        numberDraft,
        textDraft,
        dateDraft,
      });
    },
    [
      columnFilterValues,
      enableColumnFilter,
      gridRootRef,
      resolveColumnFilterType,
    ],
  );

  // 追加: 列フィルターポップオーバーを閉じます。
  const closeColumnFilterPopover = useCallback(() => {
    setFilterPopoverState(null);
    setFilterPopoverLayout(null);
    filterPopoverAnchorRef.current = null;
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

  // 追加(filter-ext A): number 列の構造化条件 draft を更新します(popover の編集通知)。
  const updateFilterPopoverNumberDraft = useCallback(
    (draft: NumberFilterConditionDraft) => {
      setFilterPopoverState((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          numberDraft: draft,
        };
      });
    },
    [],
  );

  // 追加(filter-ext C): textSet のテキスト条件 draft を更新します(popover の編集通知)。
  const updateFilterPopoverTextDraft = useCallback(
    (draft: TextFilterConditionDraft) => {
      setFilterPopoverState((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          textDraft: draft,
        };
      });
    },
    [],
  );

  // 追加(filter-ext D): dateSet の日付条件 draft を更新します(popover の編集通知)。
  const updateFilterPopoverDateDraft = useCallback(
    (draft: DateFilterConditionDraft) => {
      setFilterPopoverState((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          dateDraft: draft,
        };
      });
    },
    [],
  );

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
        // 変更(filter-ext D): <input type="date">(dateSet の条件値)は setSelectionRange 非対応で
        //   InvalidStateError を投げるため、text 系のときだけ caret を操作します(focus は共通)。
        if (inputElement.type === 'text') {
          const end = inputElement.value.length;
          inputElement.setSelectionRange(end, end);
        }
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

      // 変更(③): フィルター操作は列メニューへ集約され、anchor は列ヘッダーセルになりました。
      //   ヘッダーをクリックしたら(列選択など)フィルターは閉じるべきため、旧「anchor button を
      //   押したら閉じない」除外は撤去します(popover 自身の内側クリックのみ上で除外済み)。
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
    // 追加(filter-ext E): 解決済みフィルター種別('auto' を含まない)。popover / 各 commit 経路は
    //   column.filterType ではなくこちらで分岐します(未オープンは null)。
    openedFilterType,
    openColumnFilterPopover,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
    updateFilterPopoverNumberDraft,
    updateFilterPopoverTextDraft,
    updateFilterPopoverDateDraft,
  };
};

export default useFilterPopoverController;