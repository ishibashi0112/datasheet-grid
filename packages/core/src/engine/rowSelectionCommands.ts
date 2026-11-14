// 追加(本体分解 E-4c): 行選択(チェックボックス選択)のコマンド群です(React 非依存。旧 SpreadsheetGrid.tsx の
//   「行選択(チェックボックス選択)」セクションの useCallback 群 + latest-ref 群 + controlled 同期 effect を移設)。
//   - commitRowSelection: uncontrolled は reducer 反映 + onChange 通知、controlled は onChange のみ(親が prop を
//     更新 → update の同期で reducer 反映)。両モードで変化時に onChange 発火。
//   - handleGutterRowSelect: single = 単一選択 / multiple = トグル、shift = アンカーから範囲。SSRM 未ロード行は無視。
//   - handleGutterRowSelectDrag: ガタードラッグ中の範囲更新(multiple)。single はポインタ下の行を単一選択。
//   - handleToggleSelectAllRows: 全選択済みなら解除、そうでなければ全選択(総数は leaf 行数)。
//     変更(1.0.1 / 実アプリの総点検 AP-03): clientSide のフィルターで行が隠れている間は、見えている行だけを選ぶ /
//     外す(全選択 = exclude のモデルのままだと、フィルターを外したときに見えなかった行まで選ばれていた)。
//   - update: controlled の記述子が変わったとき reducer へ同期します(差分時のみ。旧 useEffect と同じ deps)。
//   shift / ドラッグ範囲のアンカー(view index)は揮発 UI 状態としてコントローラ内に持ちます。
import type { GridRowKey, RowModel, RowSelectionModel, RowSelectionState } from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import type { RowOrder } from '../logic/filtering';
import {
  addRowRange,
  clearRowSelection,
  countSelectedRowsInOrder,
  getSelectAllState,
  rowSelectionFromModel,
  removeRowKeys,
  rowSelectionStateEquals,
  rowSelectionToModel,
  selectAllRows,
  selectRowRange,
  selectSingleRow,
  toggleRowKey,
} from '../logic/rowSelection';

export type RowSelectionCommandsArgs<T> = {
  rowModel: RowModel<T>;
  // 現在の行選択状態(reducer が単一の作業状態)。
  rowSelectionState: RowSelectionState;
  rowSelectionMode: 'single' | 'multiple';
  onRowSelectionChange: ((model: RowSelectionModel) => void) | undefined;
  // controlled の記述子(undefined = uncontrolled)。
  controlledRowSelectionModel: RowSelectionModel | undefined;
  // グループ行を除くデータ行数(全選択トグルの総数)。
  leafRowCount: number;
  // 追加(1.0.1 / AP-03): clientSide のフィルターで隠れている行があるときの、フィルター後のデータ行(order は元 rows の
  //   index)。null / 省略 = 隠れている行が無い(または serverSide)= 全選択は従来どおり exclude のモデル。
  filteredDataRows?: FilteredDataRows<T> | null;
  dispatch: (action: GridUiAction) => void;
};

export type FilteredDataRows<T> = {
  rows: readonly T[];
  order: RowOrder;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
};

export type RowSelectionCommands<T> = {
  update: (args: RowSelectionCommandsArgs<T>) => void;
  commitRowSelection: (next: RowSelectionState) => void;
  handleGutterRowSelect: (viewIndex: number, opts: { shiftKey: boolean }) => void;
  handleGutterRowSelectDrag: (viewIndex: number) => void;
  handleToggleSelectAllRows: () => void;
};

export const createRowSelectionCommands = <T,>(): RowSelectionCommands<T> => {
  let args: RowSelectionCommandsArgs<T> | null = null;
  let anchorIndex: number | null = null;
  let lastSyncedModel: RowSelectionModel | undefined;
  let synced = false;

  const requireArgs = (): RowSelectionCommandsArgs<T> => {
    if (args === null) {
      throw new Error('[SpreadsheetGrid] rowSelectionCommands は update 前に呼べません。');
    }
    return args;
  };

  const commitRowSelection = (next: RowSelectionState) => {
    const { rowSelectionState, onRowSelectionChange, controlledRowSelectionModel, dispatch } = requireArgs();
    if (!rowSelectionStateEquals(rowSelectionState, next)) {
      onRowSelectionChange?.(rowSelectionToModel(next));
    }
    if (controlledRowSelectionModel === undefined) {
      dispatch(gridActions.setRowSelectionState(next));
    }
  };

  // view index 範囲 → 行キー配列(SSRM 未ロードはスキップ)。
  const resolveRowKeysBetween = (rowModel: RowModel<T>, aIndex: number, bIndex: number): GridRowKey[] => {
    const start = Math.min(aIndex, bIndex);
    const end = Math.max(aIndex, bIndex);
    const keys: GridRowKey[] = [];
    for (let i = start; i <= end; i += 1) {
      const row = rowModel.getRow(i);
      if (!row) {
        continue;
      }
      keys.push(rowModel.getRowKey(i) ?? i);
    }
    return keys;
  };

  const handleGutterRowSelect = (viewIndex: number, opts: { shiftKey: boolean }) => {
    const { rowModel, rowSelectionMode, rowSelectionState } = requireArgs();
    const row = rowModel.getRow(viewIndex);
    if (!row) {
      return;
    }
    const rowKey = rowModel.getRowKey(viewIndex) ?? viewIndex;
    if (rowSelectionMode === 'single') {
      anchorIndex = viewIndex;
      commitRowSelection(selectSingleRow(rowKey));
      return;
    }
    if (opts.shiftKey && anchorIndex !== null) {
      commitRowSelection(selectRowRange(resolveRowKeysBetween(rowModel, anchorIndex, viewIndex)));
      return;
    }
    anchorIndex = viewIndex;
    commitRowSelection(toggleRowKey(rowSelectionState, rowKey));
  };

  const handleGutterRowSelectDrag = (viewIndex: number) => {
    const { rowModel, rowSelectionMode } = requireArgs();
    const row = rowModel.getRow(viewIndex);
    if (!row) {
      return;
    }
    if (rowSelectionMode === 'single') {
      commitRowSelection(selectSingleRow(rowModel.getRowKey(viewIndex) ?? viewIndex));
      return;
    }
    if (anchorIndex === null) {
      return;
    }
    commitRowSelection(selectRowRange(resolveRowKeysBetween(rowModel, anchorIndex, viewIndex)));
  };

  const handleToggleSelectAllRows = () => {
    const { rowSelectionState, leafRowCount, filteredDataRows } = requireArgs();
    if (filteredDataRows) {
      const { rows, order, rowKeyGetter } = filteredDataRows;
      const visibleKeys: GridRowKey[] = [];
      for (let i = 0; i < order.length; i += 1) {
        const sourceIndex = order[i];
        visibleKeys.push(rowKeyGetter(rows[sourceIndex], sourceIndex));
      }
      const selectedCount = countSelectedRowsInOrder(rowSelectionState, rows, order, rowKeyGetter);
      const allVisibleSelected = visibleKeys.length > 0 && selectedCount >= visibleKeys.length;
      commitRowSelection(
        allVisibleSelected
          ? removeRowKeys(rowSelectionState, visibleKeys)
          : addRowRange(rowSelectionState, visibleKeys),
      );
      return;
    }
    const current = getSelectAllState(rowSelectionState, leafRowCount);
    commitRowSelection(current === 'all' ? clearRowSelection() : selectAllRows());
  };

  return {
    update: (next) => {
      args = next;
      // controlled: prop の記述子が変わったら reducer へ同期(差分時のみ。reducer 側も同値 no-op)。
      const model = next.controlledRowSelectionModel;
      if (!synced || !Object.is(model, lastSyncedModel)) {
        synced = true;
        lastSyncedModel = model;
        if (model !== undefined) {
          const resolved = rowSelectionFromModel(model);
          if (!rowSelectionStateEquals(next.rowSelectionState, resolved)) {
            next.dispatch(gridActions.setRowSelectionState(resolved));
          }
        }
      }
    },
    commitRowSelection,
    handleGutterRowSelect,
    handleGutterRowSelectDrag,
    handleToggleSelectAllRows,
  };
};