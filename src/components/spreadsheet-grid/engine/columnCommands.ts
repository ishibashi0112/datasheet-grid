// 追加(本体分解 E-4a): 列まわりのコマンド群です(React 非依存。旧 SpreadsheetGrid.tsx の「column pinning」
//   「column autosize」「column chooser actions」「filter management panel actions(クリア系)」「列リセット」
//   「sort」「sort management panel actions」の useCallback 群を移設)。
//   - update(args) で最新の props / state / 連携先(メニュー閉鎖 / パネル開閉 / autosize ランナー)を受け取り、
//     各コマンドは呼び出し時点の args を読みます(旧 useCallback の deps 閉包と同じ鮮度。update はレイアウト
//     effect で毎レンダー呼ばれる)。コマンドの参照は恒久安定です(パネル / メニューの memo 維持)。
//   - columns は controlled props のため、列定義の変更は onColumnsChange 経由で反映します(内部 state は持たず、
//     Grid 外から変えた場合と同じ経路に一本化)。その際「現在の解決済み幅」を column defs の width へ書き戻します
//     (columns prop が変わると columnWidths/sync が column.width で state を上書きするため)。
//   - 固定 / 表示 / 並び順の変更は orderedColumns の視覚順(= selection / activeCell の論理 index 空間)を変えるため、
//     選択・アクティブセル・編集を破棄します(AG Grid も pin 変更で range selection をクリア)。
//   - 列リセット用の「初期 column defs スナップショット」は最初の update で退避します(以後 columns が変わっても
//     更新しない = ユーザー操作後の状態を「初期」と誤認しない。Map の挿入順が初期の並び順)。
import type { GridColumn, GridColumnPinned, GridSortState } from '../model/gridTypes';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { reorderColumnsByPane } from '../logic/geometry';
import { buildResetColumns, type InitialColumnState } from '../logic/columnReset';
import type { ToolPanelTab } from '../controllers/toolPanelController';
import {
  addSortEntry,
  moveSortEntry,
  nextSortEntries,
  removeSortEntryAt,
  setSortEntryColumn,
  setSortEntryDirection,
} from '../logic/sorting';

export type ColumnCommandsArgs<T> = {
  // consumer の全列定義(非表示含む)。
  columns: GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  orderedColumns: GridColumn<T>[];
  // 現在の解決済み列幅(flex 解決済み。columns へ書き戻す元)。
  columnWidths: Record<string, number>;
  onColumnsChange: ((columns: GridColumn<T>[]) => void) | undefined;
  dispatch: (action: GridUiAction) => void;
  enableSorting: boolean;
  sort: GridSortState;
  globalFilterText: string;
  // 連携先(いずれも参照安定なコントローラのメソッド)。
  closeColumnMenu: () => void;
  openToolPanel: (tab: ToolPanelTab) => void;
  openColumnFilterPopover: (column: GridColumn<T>) => void;
  runAutosize: (columns: GridColumn<T>[]) => Promise<void> | void;
};

export type SortDirection = 'asc' | 'desc';

export type ColumnCommands<T> = {
  update: (args: ColumnCommandsArgs<T>) => void;
  // 列メニュー
  handleColumnMenuPinnedChange: (columnKey: string, nextPinned: GridColumnPinned | undefined) => void;
  handleColumnMenuAutosizeColumn: (columnKey: string) => void;
  handleColumnMenuAutosizeAllColumns: () => void;
  handleColumnMenuOpenChooser: () => void;
  handleColumnMenuOpenSortManager: () => void;
  handleColumnMenuOpenFilter: (column: GridColumn<T>) => void;
  handleColumnMenuOpenFilterManager: () => void;
  handleColumnMenuResetColumns: () => void;
  handleColumnMenuSortChange: (columnKey: string, direction: SortDirection) => void;
  // フィルター管理パネル(クリア系)
  handleFilterManagerClearFilter: (columnKey: string) => void;
  handleFilterManagerClearAll: () => void;
  handleFilterManagerClearGlobal: () => void;
  // 列チューザー
  handleColumnChooserToggleVisibility: (columnKey: string, nextVisible: boolean) => void;
  handleColumnChooserShowAll: () => void;
  handleColumnChooserHideAll: () => void;
  handleColumnChooserReorder: (orderedKeys: string[]) => void;
  handleColumnChooserReset: () => void;
  // 並べ替え + 任意 pin 変更の共通 commit(ヘッダー D&D も使う)。
  applyColumnOrderAndPin: (orderedKeys: string[], pinOverride?: Map<string, GridColumnPinned | undefined>) => void;
  // 並び替え管理パネル
  handleSortManagerAddLevel: (columnKey: string, direction: SortDirection) => void;
  handleSortManagerChangeDirection: (index: number, direction: SortDirection) => void;
  handleSortManagerChangeColumn: (index: number, columnKey: string) => void;
  handleSortManagerRemoveLevel: (index: number) => void;
  handleSortManagerClearAll: () => void;
  handleSortManagerMove: (from: number, to: number) => void;
  // 列リセット用の初期スナップショット(テスト / 命令的 API 向けの読み取り口)。
  getInitialColumnState: () => Map<string, InitialColumnState> | null;
};

export const createColumnCommands = <T,>(): ColumnCommands<T> => {
  let args: ColumnCommandsArgs<T> | null = null;
  let initialColumnState: Map<string, InitialColumnState> | null = null;

  const requireArgs = (): ColumnCommandsArgs<T> => {
    if (args === null) {
      throw new Error('[SpreadsheetGrid] columnCommands は update 前に呼べません。');
    }
    return args;
  };

  // 列構成変更後の共通後始末(編集停止 / 選択解除 / アクティブセル解除。同一イベント内で自動バッチ)。
  const discardSelectionState = (dispatch: ColumnCommandsArgs<T>['dispatch']) => {
    dispatch(gridActions.stopEdit());
    dispatch(gridActions.clearSelection());
    dispatch(gridActions.activateCell(null));
  };

  const applySort = (next: GridSortState, dispatch: ColumnCommandsArgs<T>['dispatch']) => {
    dispatch(next.length === 0 ? gridActions.clearSort() : gridActions.setSort(next));
  };

  const handleColumnMenuPinnedChange: ColumnCommands<T>['handleColumnMenuPinnedChange'] = (columnKey, nextPinned) => {
    const { closeColumnMenu, onColumnsChange, columns, columnWidths, dispatch } = requireArgs();
    closeColumnMenu();
    if (!onColumnsChange) {
      return;
    }
    const targetColumn = columns.find((column) => column.key === columnKey);
    if (!targetColumn) {
      return;
    }
    const currentPinned = targetColumn.pinned ?? undefined;
    if (currentPinned === nextPinned) {
      // 現在値と同じ項目の選択は閉じるだけの no-op。
      return;
    }
    const nextColumns = columns.map((column) => {
      const resolvedWidth = columnWidths[column.key] ?? column.width;
      if (column.key === columnKey) {
        return { ...column, width: resolvedWidth, pinned: nextPinned };
      }
      // 対象外の列も、リサイズ済みなら幅を defs へ書き戻して保全します。
      return resolvedWidth === column.width ? column : { ...column, width: resolvedWidth };
    });
    onColumnsChange(nextColumns);
    discardSelectionState(dispatch);
  };

  // 幅は内部 state(columnWidths)管理のため onColumnsChange 不要。計測は時間分割ランナーへ委譲(単一経路)。
  const handleColumnMenuAutosizeColumn: ColumnCommands<T>['handleColumnMenuAutosizeColumn'] = (columnKey) => {
    const { closeColumnMenu, visibleColumns, runAutosize } = requireArgs();
    closeColumnMenu();
    const targetColumn = visibleColumns.find((column) => column.key === columnKey);
    if (!targetColumn) {
      return;
    }
    void runAutosize([targetColumn]);
  };
  const handleColumnMenuAutosizeAllColumns = () => {
    const { closeColumnMenu, visibleColumns, runAutosize } = requireArgs();
    closeColumnMenu();
    void runAutosize(visibleColumns);
  };

  // 統合ツールパネルの各タブを開きます(メニューを閉じてから。既に開いていればタブ切替のみ)。
  const handleColumnMenuOpenChooser = () => {
    const { closeColumnMenu, openToolPanel } = requireArgs();
    closeColumnMenu();
    openToolPanel('columns');
  };
  const handleColumnMenuOpenSortManager = () => {
    const { closeColumnMenu, openToolPanel } = requireArgs();
    closeColumnMenu();
    openToolPanel('sort');
  };
  const handleColumnMenuOpenFilterManager = () => {
    const { closeColumnMenu, openToolPanel } = requireArgs();
    closeColumnMenu();
    openToolPanel('filter');
  };
  // openColumnFilterPopover は anchor を列ヘッダーセルから解決するため、起点ボタンが無くても column だけで開けます。
  const handleColumnMenuOpenFilter: ColumnCommands<T>['handleColumnMenuOpenFilter'] = (column) => {
    const { closeColumnMenu, openColumnFilterPopover } = requireArgs();
    closeColumnMenu();
    openColumnFilterPopover(column);
  };

  // パネルの ×(単一クリア)/ すべてクリア / グローバル解除。すべてクリアはグローバルフィルターを保全したまま
  //   columnFilters だけを空にします(setAllFilters のフル置換を 1 dispatch で)。
  const handleFilterManagerClearFilter: ColumnCommands<T>['handleFilterManagerClearFilter'] = (columnKey) => {
    requireArgs().dispatch(gridActions.clearColumnFilter(columnKey));
  };
  const handleFilterManagerClearAll = () => {
    const { dispatch, globalFilterText } = requireArgs();
    dispatch(gridActions.setAllFilters({ globalText: globalFilterText, columnFilters: {} }));
  };
  const handleFilterManagerClearGlobal = () => {
    requireArgs().dispatch(gridActions.setGlobalFilter(''));
  };

  // 列チューザー: 1 列の表示 / 非表示トグル(最後の 1 列は非表示にできない = 二重ガード)。
  const handleColumnChooserToggleVisibility: ColumnCommands<T>['handleColumnChooserToggleVisibility'] = (
    columnKey,
    nextVisible,
  ) => {
    const { onColumnsChange, columns, columnWidths, dispatch } = requireArgs();
    if (!onColumnsChange) {
      return;
    }
    const targetColumn = columns.find((column) => column.key === columnKey);
    if (!targetColumn) {
      return;
    }
    const currentVisible = targetColumn.visible !== false;
    if (currentVisible === nextVisible) {
      return;
    }
    if (!nextVisible) {
      const visibleCount = columns.filter((column) => column.visible !== false).length;
      if (visibleCount <= 1) {
        return;
      }
    }
    const nextColumns = columns.map((column) => {
      const resolvedWidth = columnWidths[column.key] ?? column.width;
      if (column.key === columnKey) {
        return { ...column, width: resolvedWidth, visible: nextVisible };
      }
      return resolvedWidth === column.width ? column : { ...column, width: resolvedWidth };
    });
    onColumnsChange(nextColumns);
    discardSelectionState(dispatch);
  };

  // 全選択(= すべて表示)。非表示列がなければ no-op。
  const handleColumnChooserShowAll = () => {
    const { onColumnsChange, columns, columnWidths, dispatch } = requireArgs();
    if (!onColumnsChange) {
      return;
    }
    if (!columns.some((column) => column.visible === false)) {
      return;
    }
    const nextColumns = columns.map((column) => {
      const resolvedWidth = columnWidths[column.key] ?? column.width;
      const needsWidth = resolvedWidth !== column.width;
      const needsShow = column.visible === false;
      if (!needsWidth && !needsShow) {
        return column;
      }
      return needsShow ? { ...column, width: resolvedWidth, visible: true } : { ...column, width: resolvedWidth };
    });
    onColumnsChange(nextColumns);
    discardSelectionState(dispatch);
  };

  // 全解除(視覚順先頭の 1 列だけ残して非表示)。keep 列 = orderedColumns[0](画面最左の表示列)。
  const handleColumnChooserHideAll = () => {
    const { onColumnsChange, columns, orderedColumns, columnWidths, dispatch } = requireArgs();
    if (!onColumnsChange) {
      return;
    }
    const keepKey = orderedColumns[0]?.key;
    if (keepKey === undefined) {
      return;
    }
    if (!columns.some((column) => column.visible !== false && column.key !== keepKey)) {
      return;
    }
    const nextColumns = columns.map((column) => {
      const resolvedWidth = columnWidths[column.key] ?? column.width;
      const needsWidth = resolvedWidth !== column.width;
      const needsHide = column.visible !== false && column.key !== keepKey;
      if (!needsWidth && !needsHide) {
        return column;
      }
      return needsHide ? { ...column, width: resolvedWidth, visible: false } : { ...column, width: resolvedWidth };
    });
    onColumnsChange(nextColumns);
    discardSelectionState(dispatch);
  };

  // 並べ替え + 任意の pin 変更の共通 commit(13-B3-2)。
  //   - orderedKeys は「全列キーの permutation」。長さ・集合が columns と一致しなければ no-op。
  //   - pinOverride: 列キー → 'left'|'right'|undefined。指定列だけ pinned を上書き(ヘッダー D&D 用)。
  //   - 全列について解決済み幅を defs へ書き戻し、reorderColumnsByPane で pane 連結正規化(冪等)。
  //   - 正規化結果が現在の columns と「順序・幅・pinned」すべて一致なら no-op。
  const applyColumnOrderAndPin: ColumnCommands<T>['applyColumnOrderAndPin'] = (orderedKeys, pinOverride) => {
    const { onColumnsChange, columns, columnWidths, dispatch } = requireArgs();
    if (!onColumnsChange) {
      return;
    }
    if (orderedKeys.length !== columns.length) {
      return;
    }
    const byKey = new Map(columns.map((column) => [column.key, column]));
    if (!orderedKeys.every((key) => byKey.has(key))) {
      return;
    }
    const reordered = orderedKeys.map((key) => {
      const column = byKey.get(key)!;
      const resolvedWidth = columnWidths[column.key] ?? column.width;
      const nextPinned = pinOverride?.has(key) ? pinOverride.get(key) : column.pinned;
      const widthChanged = resolvedWidth !== column.width;
      const pinnedChanged = (column.pinned ?? undefined) !== (nextPinned ?? undefined);
      return widthChanged || pinnedChanged ? { ...column, width: resolvedWidth, pinned: nextPinned } : column;
    });
    const normalized = reorderColumnsByPane(reordered);
    const isNoOp =
      normalized.length === columns.length &&
      normalized.every((column, index) => {
        const prev = columns[index];
        return (
          !!prev &&
          prev.key === column.key &&
          prev.width === column.width &&
          (prev.pinned ?? undefined) === (column.pinned ?? undefined)
        );
      });
    if (isNoOp) {
      return;
    }
    onColumnsChange(normalized);
    discardSelectionState(dispatch);
  };
  const handleColumnChooserReorder: ColumnCommands<T>['handleColumnChooserReorder'] = (orderedKeys) => {
    applyColumnOrderAndPin(orderedKeys);
  };

  // 列リセット(幅 / 固定 / 表示 / 並び順を初回マウント時の状態へ)。すべて初期状態のままなら no-op。
  const handleColumnChooserReset = () => {
    const { onColumnsChange, columns, columnWidths, dispatch } = requireArgs();
    if (!onColumnsChange || !initialColumnState) {
      return;
    }
    const nextColumns = buildResetColumns(columns, initialColumnState, columnWidths);
    if (nextColumns === null) {
      return;
    }
    onColumnsChange(nextColumns);
    discardSelectionState(dispatch);
  };
  // 列メニュー root の「列のリセット」: 先にメニューを閉じてから同じ本体を呼びます(パネル側は閉じない)。
  const handleColumnMenuResetColumns = () => {
    requireArgs().closeColumnMenu();
    handleColumnChooserReset();
  };

  // メニューの「昇順/降順で並び替え」: 現在と同じ方向を再選択したら解除。単一置換(additive=false)。
  const handleColumnMenuSortChange: ColumnCommands<T>['handleColumnMenuSortChange'] = (columnKey, direction) => {
    const { closeColumnMenu, enableSorting, sort, dispatch } = requireArgs();
    closeColumnMenu();
    if (!enableSorting) {
      return;
    }
    applySort(nextSortEntries(sort, columnKey, direction, false), dispatch);
  };

  // 並び替え管理パネル(ライブ編集。パネルは開いたまま)。
  const handleSortManagerAddLevel: ColumnCommands<T>['handleSortManagerAddLevel'] = (columnKey, direction) => {
    const { enableSorting, sort, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.setSort(addSortEntry(sort, columnKey, direction)));
  };
  const handleSortManagerChangeDirection: ColumnCommands<T>['handleSortManagerChangeDirection'] = (index, direction) => {
    const { enableSorting, sort, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.setSort(setSortEntryDirection(sort, index, direction)));
  };
  const handleSortManagerChangeColumn: ColumnCommands<T>['handleSortManagerChangeColumn'] = (index, columnKey) => {
    const { enableSorting, sort, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.setSort(setSortEntryColumn(sort, index, columnKey)));
  };
  const handleSortManagerRemoveLevel: ColumnCommands<T>['handleSortManagerRemoveLevel'] = (index) => {
    const { enableSorting, sort, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    applySort(removeSortEntryAt(sort, index), dispatch);
  };
  const handleSortManagerClearAll = () => {
    const { enableSorting, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.clearSort());
  };
  const handleSortManagerMove: ColumnCommands<T>['handleSortManagerMove'] = (from, to) => {
    const { enableSorting, sort, dispatch } = requireArgs();
    if (!enableSorting) {
      return;
    }
    dispatch(gridActions.setSort(moveSortEntry(sort, from, to)));
  };

  return {
    update: (next) => {
      args = next;
      if (initialColumnState === null) {
        initialColumnState = new Map(
          next.columns.map((column) => [
            column.key,
            { width: column.width, pinned: column.pinned, visible: column.visible },
          ]),
        );
      }
    },
    handleColumnMenuPinnedChange,
    handleColumnMenuAutosizeColumn,
    handleColumnMenuAutosizeAllColumns,
    handleColumnMenuOpenChooser,
    handleColumnMenuOpenSortManager,
    handleColumnMenuOpenFilter,
    handleColumnMenuOpenFilterManager,
    handleColumnMenuResetColumns,
    handleColumnMenuSortChange,
    handleFilterManagerClearFilter,
    handleFilterManagerClearAll,
    handleFilterManagerClearGlobal,
    handleColumnChooserToggleVisibility,
    handleColumnChooserShowAll,
    handleColumnChooserHideAll,
    handleColumnChooserReorder,
    handleColumnChooserReset,
    applyColumnOrderAndPin,
    handleSortManagerAddLevel,
    handleSortManagerChangeDirection,
    handleSortManagerChangeColumn,
    handleSortManagerRemoveLevel,
    handleSortManagerClearAll,
    handleSortManagerMove,
    getInitialColumnState: () => initialColumnState,
  };
};