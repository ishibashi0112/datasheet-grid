// 追加(差し込み式 段階 5): フィルター(グローバルフィルター / 列フィルター)の機能です。
//   - エンジン側: 行パイプラインの列フィルターの段(core engine/columnFilterStage)と、相対日付プリセットの日付の
//     変わり目の見張り(core controllers/dateRolloverStore)。
//   - シェル側(どれもシェルにあったときと同じ位置・同じ順番で hook を呼びます):
//     - useFilterOrder: グローバルフィルターの適用(大きなデータは時間分割。hooks/useGlobalFilteredOrder)と、
//       相対日付プリセットの基準日の購読 + 範囲のキー(監査 L-15)。
//     - useFilterPopover: 列フィルターのポップオーバーの controller の接続('auto' 列の種別の推定とキャッシュ込み)。
//     - useFilterPopoverViews: ポップオーバーの部品(別チャンク)の読み込み。
//     - useFilterPopoverContent: 候補の収集(同期 / 時間分割 / getFilterOptions)・派生値・コマンド群(core
//       engine/filterPopoverCommands。差し込み式 段階 5 からはエンジンではなくこの hook が作る)と、ポップオーバーの描画。
//     - useFilterManagement: 適用中フィルターの一覧 / 「フィルターを追加」の候補列(ツールパネルのフィルタータブと
//       フィルターチップバーで共用)と、対象列へ横スクロールしてポップオーバーを開くジャンプ。
//     - FilterChipBar: フィルターチップバー(showFilterChipBar)。
//   機能セットに無い構成では enableColumnFilter / enableGlobalFilter を false として扱い(createSpreadsheetGrid)、
//   行は絞り込みません(代役の useFilterOrder は baseOrder をそのまま返し、ポップオーバーは開かない)。
import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createColumnFilterStage } from '@ishibashi0112/spreadsheet-grid-core/internal/engine/columnFilterStage';
import {
  createFilterPopoverCommands,
  createFilterPopoverDerivedResolver,
} from '@ishibashi0112/spreadsheet-grid-core/internal/engine/filterPopoverCommands';
import { createDateRolloverStore } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/dateRolloverStore';
import { isSelectLikeFilterType } from '@ishibashi0112/spreadsheet-grid-core/internal/controllers/selectOptionsCollector';
import {
  columnFiltersUseRelativeDate,
  columnFilterValueToDraftText,
  isActiveColumnFilterValue,
  isNumberColumnFilterValue,
  isSetColumnFilterValue,
  resolveRelativeDateFilterKey,
  toDateSetKey,
} from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filtering';
import { describeColumnFilterValue } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/filterSummary';
import { normalizeDateFilterPresets } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/dateFilterPresets';
import { inferColumnFilterType } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/inferFilterType';
import { getCellValue } from '@ishibashi0112/spreadsheet-grid-core/internal/utils/permissions';
import { computeSinglePaneColumnExtent } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/geometry';
import { computeHorizontalScrollTarget } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/scrollTargets';
import { isInsideDetailCardOf } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/detailRow';
import { useController, useControllerLifecycle } from '../hooks/useController';
import { useGlobalFilteredOrder } from '../hooks/useGlobalFilteredOrder';
import { useFilterPopoverController } from '../hooks/useFilterPopoverController';
import { useAsyncSelectOptionsSource } from '../hooks/useAsyncSelectOptionsSource';
import useColumnSelectOptionsCollector from '../hooks/useColumnSelectOptionsCollector';
import { filterPopoverModule, useLazyModule, type UseLazyModuleOptions } from '../view/lazyPopups';
import GridFilterChipBar from '../view/GridFilterChipBar';
import type { FilterManagementAddableColumn, FilterManagementEntry } from '../view/FilterManagementPanel';
import type { ColumnFilterUiType, GridColumn } from '../model/gridTypes';
import type {
  FilterOrderFeatureArgs,
  FilterOrderFeatureResult,
  FilterPopoverContentFeatureArgs,
  FilterPopoverFeatureArgs,
  FilterPopoverFeatureResult,
  FilterManagementFeatureArgs,
  FilterManagementFeatureResult,
  ReactGridFeatures,
} from './types';

const useFilterOrder = <T,>({
  rows,
  baseOrder,
  visibleColumns,
  effectiveColumns,
  globalFilterText,
  globalFilterEnabled,
  columnFilterEnabled,
  columnFilters,
  deferredColumnFilters,
  manualFiltering,
  isServerSide,
  dateRollover,
}: FilterOrderFeatureArgs<T>): FilterOrderFeatureResult => {
  // 変更(F-async): globalFilteredOrder の同期 useMemo を時間分割フックへ差し替えます。
  //   返り値の order は「現在表示すべきビュー順」で、計算中は前回確定 order を維持します
  //   (= 下流 columnFiltered / sorted / rowModel は order 参照が安定する限りスキップ＝
  //   進捗 tick では本体行は再描画されず、トップバーの進捗表示だけが更新されます)。
  //   status / progress は下のバーコンテキストへ渡してローディング表示に使います。
  const {
    order: globalFilteredOrder,
    status: globalFilterStatus,
    progress: globalFilterProgress,
  } = useGlobalFilteredOrder({
    rows,
    baseOrder,
    columns: visibleColumns,
    globalText: globalFilterText,
    // 変更(manual-mode): 手動フィルターでは走らせない(order は baseOrder のまま)。
    enabled: globalFilterEnabled && !manualFiltering,
  });

  // 追加(監査 L-15): 相対日付プリセット(今日 / 今月 / 過去 30 日 / カスタム)の基準日。プリセットを含む列フィルターが
  //   掛かっている間だけ日付の変わり目を見張り(controllers/dateRolloverStore)、基準日で解決した範囲のキー
  //   (resolveRelativeDateFilterKey)を行パイプラインの入力に足します。日付が変わって範囲も変わると、clientSide は
  //   列フィルターを評価し直し、serverSide は queryKey が変わって取り直します(「今月」の月内など範囲が同じなら何もしない)。
  //   手動フィルター(manualFiltering)では行を絞り込まないため見張りません。
  const relativeDateFilterActive = useMemo(
    () =>
      isServerSide
        ? columnFilterEnabled && columnFiltersUseRelativeDate(columnFilters)
        : !manualFiltering && columnFiltersUseRelativeDate(deferredColumnFilters),
    [isServerSide, columnFilterEnabled, columnFilters, manualFiltering, deferredColumnFilters],
  );
  useControllerLifecycle(dateRollover, { active: relativeDateFilterActive });
  const relativeDateSnapshot = useSyncExternalStore(
    dateRollover.subscribe,
    dateRollover.getSnapshot,
    dateRollover.getSnapshot,
  );
  const relativeDateKey = useMemo(
    () =>
      relativeDateFilterActive
        ? resolveRelativeDateFilterKey(
            effectiveColumns,
            isServerSide ? columnFilters : deferredColumnFilters,
            relativeDateSnapshot,
          )
        : '',
    [relativeDateFilterActive, effectiveColumns, isServerSide, columnFilters, deferredColumnFilters, relativeDateSnapshot],
  );

  return { globalFilteredOrder, globalFilterStatus, globalFilterProgress, relativeDateKey };
};

const useFilterPopover = <T,>({
  visibleColumns,
  columnFilters,
  columnFilterEnabled,
  gridRootRef,
  isServerSide,
  rows,
}: FilterPopoverFeatureArgs<T>): FilterPopoverFeatureResult<T> => {
  // 追加(filter-ext E): filterType: 'auto' の解決結果キャッシュです(列キー → 実効種別)。
  //   合意仕様「初回オープン時に推定して以後固定」を担保します。行の追加 / 編集で推定が
  //   揺れると、適用済み記述子(kind)と UI が食い違うためです。
  //   判定材料が無かった回(conclusive=false: まだ行が空 等)はキャッシュせず、次回再推定します。
  const autoFilterTypeCacheRef = useRef(new Map<string, ColumnFilterUiType>());

  // 追加(filter-ext E): 'auto' 列の実効フィルター種別を解決します(popover の open 時に 1 回)。
  //   優先順位: 適用済み記述子の kind > キャッシュ > editor ヒント / 値サンプリング。
  //   「適用済み記述子が最優先」は applyState で復元された状態(popover を一度も開いていない
  //   列にフィルターが載っている)でも UI と記述子を一致させるためです。
  const resolveAutoColumnFilterType = useCallback(
    (column: GridColumn<T>): ColumnFilterUiType => {
      const currentValue = columnFilters[column.key];
      if (
        currentValue?.kind === 'numberSet' ||
        currentValue?.kind === 'textSet' ||
        currentValue?.kind === 'dateSet' ||
        currentValue?.kind === 'text'
      ) {
        return currentValue.kind;
      }
      const cached = autoFilterTypeCacheRef.current.get(column.key);
      if (cached) {
        return cached;
      }
      const result = inferColumnFilterType({
        editorType: column.editor?.type,
        isServerSide,
        rowCount: rows.length,
        getRawValueAt: (index) => getCellValue(rows[index], column),
      });
      if (result.conclusive) {
        autoFilterTypeCacheRef.current.set(column.key, result.filterType);
      }
      return result.filterType;
    },
    [columnFilters, isServerSide, rows],
  );

  return useFilterPopoverController({
    visibleColumns,
    columnFilterValues: columnFilters,
    enableColumnFilter: columnFilterEnabled,
    gridRootRef,
    resolveColumnFilterType: resolveAutoColumnFilterType,
  });
};

const useFilterPopoverViews = (options: UseLazyModuleOptions) => useLazyModule(filterPopoverModule, options);

const useFilterPopoverContent = <T,>({
  filterPopover,
  views,
  rows,
  columnFilters,
  globalFilterText,
  getFilterOptions,
  isServerSide,
  dispatch,
  renderFilterDateInput,
  popoverSlot,
  portalClassName,
}: FilterPopoverContentFeatureArgs<T>): ReactNode => {
  const {
    filterPopoverState,
    filterPopoverLayout,
    filterPopoverRef,
    filterTextInputRef,
    filterSelectRef,
    openedFilterColumn,
    openedFilterType,
    closeColumnFilterPopover,
    updateFilterPopoverDraft,
    updateFilterPopoverNumberDraft,
    updateFilterPopoverTextDraft,
    updateFilterPopoverDateDraft,
  } = filterPopover;

  // 追加(DS-4 #1): rows[index] の対象列セル値アクセサです。identity は rows/openedFilterColumn に
  //   連動し、これが変わったときだけ候補収集をやり直します(旧 getColumnSelectOptions の [rows]
  //   依存と等価)。set 即時適用の再レンダー(uiState 変化)では rows/openedFilterColumn とも不変の
  //   ため identity が保たれ、収集の再実行は起きません(open 中の再収集なしを維持)。
  // 修正(audit L-06): dateSet 列は照合と同じ正規化日付キー(toDateSetKey)で候補を集めます。Date 値のセルが
  //   String(Date)('Thu Jul 02 2026 …')の候補になり、年月日ツリーに出ず選んでも一致しなかったため。
  //   文字列セルは後段の normalizeDateSetOptions と同じキーになるだけで結果は変わりません。
  const openedFilterIsDateSet = openedFilterType === 'dateSet';
  const getOpenedColumnRawValueAt = useCallback(
    (index: number): unknown => {
      if (!openedFilterColumn) {
        return undefined;
      }
      const value = getCellValue(rows[index], openedFilterColumn);
      return openedFilterIsDateSet ? toDateSetKey(value) : value;
    },
    [rows, openedFilterColumn, openedFilterIsDateSet],
  );

  // 変更(DS-4 #1): 候補収集を「通常規模=同期 / 大規模(>閾値)=時間分割の非同期」へ。
  //   旧実装は open レンダーで同期 useMemo を 1 回走らせる eager 方式で、500k/1M では
  //   その 1 回(reduce + ソート ≈ 0.4〜1s)が主スレッドを塞いでいました(deferred 化は
  //   thrash のため不可)。通常規模はフック内の同期 useMemo で従来どおり即時確定し(チラつき無・
  //   バイト等価)、大規模のみ yieldToMain で時間分割し、収集中は popover を収集中表示にします。
  //   options 配列は同期/非同期いずれも logic/selectOptions の共有コレクタ経由でバイト等価です。
  // 追加(async-options): 開いている列が getFilterOptions の対象か(静的 filterOptions 指定列は従来どおり静的、
  //   候補を使わない種別は対象外)。対象なら rows 収集フックには column=null を渡して収集を止め、非同期ソースの
  //   結果を使います。優先順位: column.filterOptions > getFilterOptions > rows 自動収集。
  const openedColumnUsesAsyncOptions =
    getFilterOptions != null &&
    openedFilterColumn != null &&
    isSelectLikeFilterType(openedFilterType) &&
    !(openedFilterColumn.filterOptions && openedFilterColumn.filterOptions.length > 0);
  const asyncSelectOptions = useAsyncSelectOptionsSource<T>({
    columnKey: openedColumnUsesAsyncOptions ? openedFilterColumn.key : null,
    column: openedColumnUsesAsyncOptions ? openedFilterColumn : null,
    columnFilters: columnFilters,
    globalText: globalFilterText,
    fetch: getFilterOptions ?? null,
  });
  const collectedSelectOptions = useColumnSelectOptionsCollector({
    column: openedColumnUsesAsyncOptions ? null : openedFilterColumn,
    rowCount: rows.length,
    getRawValueAt: getOpenedColumnRawValueAt,
  });
  const {
    options: openedFilterSelectOptions,
    allValues: openedFilterAllValues,
    status: openedFilterOptionsStatus,
    progress: openedFilterOptionsProgress,
    truncated: openedFilterOptionsTruncated,
    errorMessage: openedFilterOptionsErrorMessage,
  } = openedColumnUsesAsyncOptions ? asyncSelectOptions.result : collectedSelectOptions;

  // 変更(本体分解 E-4b): popover の派生値(dateSet 正規化候補 / 全値集合 / set 選択状態 / 反転可否 / 複合列か)と
  //   コマンド群(set のチェック・すべて選択・検索確定・クリア、複合列の条件編集と個別クリア、適用 / クリア)は
  //   engine/filterPopoverCommands.ts(React 非依存)へ移設しました。
  //   差し込み式 段階 5 からは機能の hook がリゾルバ / コマンド群を作ります(エンジンには持たない)。
  const [resolveFilterPopoverDerived] = useState(createFilterPopoverDerivedResolver<T>);
  const filterPopoverDerived = useMemo(
    () =>
      resolveFilterPopoverDerived({
        openedFilterColumn,
        openedFilterType,
        openedFilterSelectOptions,
        openedFilterAllValues,
        columnFilters: columnFilters,
      }),
    [
      resolveFilterPopoverDerived,
      openedFilterColumn,
      openedFilterType,
      openedFilterSelectOptions,
      openedFilterAllValues,
      columnFilters,
    ],
  );
  const {
    openedPopoverSelectOptions,
    openedSetFilterValue,
    openedSetSelection,
  } = filterPopoverDerived;
  const filterPopoverCommands = useController(
    () => createFilterPopoverCommands<T>(),
    {
      filterPopoverState,
      openedFilterColumn,
      openedFilterType,
      columnFilters: columnFilters,
      derived: filterPopoverDerived,
      dispatch,
      closeColumnFilterPopover,
      updateNumberDraft: updateFilterPopoverNumberDraft,
      updateTextDraft: updateFilterPopoverTextDraft,
      updateDateDraft: updateFilterPopoverDateDraft,
    },
  );
  const {
    handleSetFilterValueToggle,
    handleSetFilterSelectAllChange,
    handleSetFilterReplaceSelection,
    clearSetFilterPopoverValue,
    handleNumberConditionDraftChange,
    handleTextConditionDraftChange,
    handleDateConditionDraftChange,
    handleComboConditionClear,
    handleComboSelectionClear,
    applyFilterPopoverValue,
    clearFilterPopoverValue,
  } = filterPopoverCommands;

  // ── filter popover ────────────────────────────────────
  // 変更(12-A): set フィルター値はオブジェクトのため String() 直書きを避け、
  //             現在値テキストをここで type 別に整形します(set は popover 側で
  //             件数カウンタを表示するため参考表示のみです)。
  const openedFilterCurrentValueText = (() => {
    if (!openedFilterColumn) {
      return '（なし）';
    }
    const rawValue = columnFilters[openedFilterColumn.key];
    if (isSetColumnFilterValue(rawValue)) {
      // 変更(反転set): exclude は「除外中」表示にします(total 非依存で正確)。
      return rawValue.mode === 'exclude'
        ? `${rawValue.values.length}件を除外中`
        : `${rawValue.values.length}件を選択中`;
    }
    // 追加(記述子化 / number): number 記述子は raw(式そのもの)を現在値表示にします。
    if (isNumberColumnFilterValue(rawValue)) {
      return rawValue.raw;
    }
    // 変更(記述子化): text/date/select は記述子のため String() 直書きでは "[object Object]" に
    //   なります。表示文字列は columnFilterValueToDraftText 経由で取り出します(custom は空 → なし)。
    const text = columnFilterValueToDraftText(rawValue);
    return text.trim() ? text : '（なし）';
  })();

  // 追加(preset-opt): 開いている列のプリセット構成(正規形)です。popover のチップ描画・
  //   候補連動・サマリーのラベル逆引きが共有します(dateSet 以外の列では実質未使用)。
  const openedDatePresets = openedFilterColumn
    ? normalizeDateFilterPresets(openedFilterColumn.dateFilterPresets)
    : undefined;

  // 追加(filter-ext B/C): 複合(numberSet / textSet)popover のフッター上サマリーです
  //   (「10 以上 かつ 3 件を選択」)。即時適用モデルのため、適用済み記述子からそのまま
  //   生成すれば表示と結果が常に一致します。
  const openedComboSummaryText =
    openedSetFilterValue && isActiveColumnFilterValue(openedSetFilterValue)
      ? describeColumnFilterValue(openedSetFilterValue, openedDatePresets)
      : 'フィルターなし';

  // 変更(lazy-popups): 部品(別チャンク)の読み込み前は描画しません(読み込み完了でシェルごと再描画)。
  const renderedFilterPopover = openedFilterColumn && views ? (
    <views.default
      popoverSlot={popoverSlot}
      themeClassName={portalClassName}
      isOpen={Boolean(filterPopoverState)}
      title={openedFilterColumn.title || openedFilterColumn.key}
      filterType={openedFilterType ?? 'text'}
      // 追加(stage ②): serverSide では set/select 候補をクライアントが自動収集できないため、
      //   候補空時の空表示文言を出し分けます(filterOptions 指定列は従来どおり候補が出ます)。
      // 変更(async-options): 非同期供給の列では「候補が未指定」文言を出さない(空は本当に空)。
      isServerSide={isServerSide && !openedColumnUsesAsyncOptions}
      draftValue={filterPopoverState?.draftValue ?? ''}
      numberConditionDraft={filterPopoverState?.numberDraft ?? null}
      onNumberConditionDraftChange={handleNumberConditionDraftChange}
      textConditionDraft={filterPopoverState?.textDraft ?? null}
      onTextConditionDraftChange={handleTextConditionDraftChange}
      dateConditionDraft={filterPopoverState?.dateDraft ?? null}
      onDateConditionDraftChange={handleDateConditionDraftChange}
      datePresets={openedDatePresets}
      // 追加(date-input): 公開契約(FilterDateInputContext)の columnKey はここで付与します
      //   (popover は列を知らないため)。未指定はネイティブ input(従来挙動)。
      renderDateInput={
        renderFilterDateInput
          ? (ctx) =>
              renderFilterDateInput({
                ...ctx,
                columnKey: openedFilterColumn.key,
              })
          : undefined
      }
      onComboConditionClear={handleComboConditionClear}
      onComboSelectionClear={handleComboSelectionClear}
      comboSummaryText={openedComboSummaryText}
      currentValueText={openedFilterCurrentValueText}
      layout={filterPopoverLayout}
      selectOptions={openedPopoverSelectOptions}
      setSelection={openedSetSelection}
      optionsStatus={openedFilterOptionsStatus}
      optionsProgress={openedFilterOptionsProgress}
      optionsTruncated={openedFilterOptionsTruncated}
      optionsErrorMessage={openedFilterOptionsErrorMessage}
      onOptionsRetry={openedColumnUsesAsyncOptions ? asyncSelectOptions.retry : undefined}
      popoverRef={filterPopoverRef}
      textInputRef={filterTextInputRef}
      selectRef={filterSelectRef}
      onRequestClose={closeColumnFilterPopover}
      onDraftChange={updateFilterPopoverDraft}
      onApply={applyFilterPopoverValue}
      onClear={clearFilterPopoverValue}
      onSetValueToggle={handleSetFilterValueToggle}
      onSetSelectAllChange={handleSetFilterSelectAllChange}
      onSetClear={clearSetFilterPopoverValue}
      onSetReplaceSelection={handleSetFilterReplaceSelection}
    />
  ) : null;

  return renderedFilterPopover;
};

const useFilterManagement = <T,>({
  columns,
  orderedColumns,
  visibleColumns,
  columnFilters,
  scrollContainerRef,
  gridRootRef,
  paneLayout,
  leftPaneTotalWidth,
  centerLeadingWidth,
  rightPaneTotalWidth,
  openColumnFilterPopover,
}: FilterManagementFeatureArgs<T>): FilterManagementFeatureResult => {
  // 追加(FM-1): パネルへ渡す「適用中フィルター」一覧です。可視列(視覚順)→ 非表示列
  //   (columns 定義順)の順で、isActiveColumnFilterValue な値だけを載せます。非表示列も
  //   出すのは「見えない列に絞り込みが残っている」という発見性の穴を塞ぐのが本機能の主目的
  //   のためです(非表示列はジャンプ先が無いため ✎ 不可・× のみ可 = isHidden で view が判別)。
  const filterManagerEntries = useMemo<FilterManagementEntry[]>(() => {
    const entries: FilterManagementEntry[] = [];
    const pushEntry = (column: GridColumn<T>, isHidden: boolean) => {
      const value = columnFilters[column.key];
      if (!value || !isActiveColumnFilterValue(value)) {
        return;
      }
      entries.push({
        columnKey: column.key,
        title: column.title || column.key,
        // 変更(preset-opt): dateSet はカスタムプリセットのラベル逆引き用に列のプリセット
        //   構成を渡します(他 kind は未使用のため従来どおり)。
        summaryText: describeColumnFilterValue(
          value,
          value.kind === 'dateSet'
            ? normalizeDateFilterPresets(column.dateFilterPresets)
            : undefined,
        ),
        isHidden,
      });
    };
    for (const column of orderedColumns) {
      pushEntry(column, false);
    }
    for (const column of columns) {
      if (column.visible === false) {
        pushEntry(column, true);
      }
    }
    return entries;
  }, [columnFilters, columns, orderedColumns]);

  // 追加(FM-1): 「フィルターを追加」の候補列です(可視・filterType あり・未適用)。
  //   非表示列は除外します(追加 = ✎ と同じ「ジャンプ + popover」で、非表示列は開けないため)。
  //   filterType 条件は列メニューの「フィルター…」項目(canFilter)と同じ規約です。
  const filterManagerAddableColumns = useMemo<
    FilterManagementAddableColumn[]
  >(
    () =>
      visibleColumns
        .filter(
          (column) =>
            Boolean(column.filterType) &&
            !isActiveColumnFilterValue(columnFilters[column.key]),
        )
        .map((column) => ({
          key: column.key,
          title: column.title || column.key,
        })),
    [columnFilters, visibleColumns],
  );

  // 追加(FM-1): 対象列まで横スクロールしてからフィルター popover を開きます(パネルの
  //   ✎ 編集 / フィルターを追加)。openColumnFilterPopover は anchor(ヘッダーセル
  //   data-ssg-col-key)を開いた時点の DOM から解決するため、列仮想化で対象列が未描画の
  //   まま開くと layout=null で表示されません。そこで
  //     ① 横スクロール(center ペインのみ。固定列は常時可視のためスクロール不要)
  //     ② rAF リトライ(上限 8 フレーム)でヘッダーセルの出現を待つ
  //     ③ open + ジャンプ先ヘッダーのフラッシュ(ssg-header-cell--jump-flash)
  //   の順に組み立てます。リトライは上限付きの有限ループでゾンビ化しません(13-B3-7 の
  //   自己停止ガードと同趣旨)。上限まで出現しなければ開かず終了します(非表示化直後など。
  //   無表示 popover 状態を作らないため)。
  const jumpToColumnFilter = useCallback(
    (columnKey: string) => {
      const el = scrollContainerRef.current;
      const colIndex = orderedColumns.findIndex(
        (column) => column.key === columnKey,
      );
      if (colIndex < 0) {
        return;
      }
      const column = orderedColumns[colIndex];
      if (el) {
        const single = computeSinglePaneColumnExtent(paneLayout, colIndex);
        if (single && single.pane === 'center') {
          const target = computeHorizontalScrollTarget({
            cellLeft:
              leftPaneTotalWidth + centerLeadingWidth + single.extent.start,
            cellWidth: single.extent.width,
            leftPaneWidth: leftPaneTotalWidth,
            rightPaneWidth: rightPaneTotalWidth,
            viewportWidth: el.clientWidth,
            currentScrollLeft: el.scrollLeft,
            align: 'auto',
            maxScrollLeft: el.scrollWidth - el.clientWidth,
          });
          if (target !== el.scrollLeft) {
            el.scrollTo({ left: target, behavior: 'auto' });
          }
        }
      }
      const findHeaderCell = (): HTMLElement | null => {
        const root = gridRootRef.current;
        const cells = root?.querySelectorAll<HTMLElement>('[data-ssg-col-key]');
        if (!root || !cells) {
          return null;
        }
        return (
          Array.from(cells).find(
            (cell) =>
              cell.dataset.ssgColKey === columnKey &&
              // 追加(detail ④): 展開行カード内にネストしたグリッドの同名列は対象外です。
              !isInsideDetailCardOf(root, cell),
          ) ?? null
        );
      };
      const tryOpen = (attempt: number) => {
        // unmount 後の遅延実行ガードです(root が消えていたら何もしません)。
        if (!gridRootRef.current) {
          return;
        }
        const cell = findHeaderCell();
        if (cell === null) {
          if (attempt < 8) {
            requestAnimationFrame(() => tryOpen(attempt + 1));
          }
          return;
        }
        openColumnFilterPopover(column);
        // ジャンプ先の視認補助フラッシュです。React はヘッダーセルの className prop が
        //   変化したときだけ属性を書き戻すため、直付けクラスは通常アニメ完了まで残ります
        //   (途中で hover 等により書き戻されても視認補助が早く消えるだけで実害なし)。
        cell.classList.remove('ssg-header-cell--jump-flash');
        // reflow を挟み、連続ジャンプでも再アニメーションさせます。
        void cell.offsetWidth;
        cell.classList.add('ssg-header-cell--jump-flash');
        cell.addEventListener(
          'animationend',
          () => {
            cell.classList.remove('ssg-header-cell--jump-flash');
          },
          { once: true },
        );
      };
      requestAnimationFrame(() => {
        tryOpen(0);
      });
    },
    // 変更(本体分解 E-5): 旧 apiStateRef 経由の読みを直接参照へ(列レイアウト変化で参照が変わるが、
    //   渡し先はパネル / バーのコールバックのみでコールドパス)。
    // 変更(差し込み式 段階 5): scrollContainerRef はシェルの useRef(参照は不変)を引数で受けるため deps に足します。
    [
      gridRootRef,
      scrollContainerRef,
      openColumnFilterPopover,
      orderedColumns,
      paneLayout,
      leftPaneTotalWidth,
      centerLeadingWidth,
      rightPaneTotalWidth,
    ],
  );

  return { filterManagerEntries, filterManagerAddableColumns, jumpToColumnFilter };
};

export const filteringFeature: NonNullable<ReactGridFeatures['filtering']> = {
  createColumnFilterStage,
  createDateRolloverStore,
  useFilterOrder,
  useFilterPopover,
  useFilterPopoverViews,
  useFilterPopoverContent,
  useFilterManagement,
  FilterChipBar: GridFilterChipBar,
};