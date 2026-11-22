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
//     追加(1.3.0 / Solid 版の品質の段 2 S4-09): 選んだ行が rows から消えたら、そのキーを選択から外します(clientSide)。
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
import { createDetailKeysPruner, findKeysIn } from '../logic/detailRow';

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
  // 追加(1.3.0 / Solid 版の品質の段 2 S4-09): 元の rows と行キー(clientSide のとき。serverSide は rows がすべての行では
  //   ないので undefined)。選んだ行を消した後も選択のキーが残り、getSelectedRowKeys() / getSelectedRowCount() が
  //   getSelectedRowData() と食い違っていた(見出しのチェックボックスも残ったキーを数えていた)。
  sourceRows?: SourceRows<T> | undefined;
  dispatch: (action: GridUiAction) => void;
};

export type SourceRows<T> = {
  rows: readonly T[];
  rowKeyGetter: (row: T, index: number) => GridRowKey;
};

const NO_ROWS: readonly never[] = [];
const indexKey = (_row: unknown, index: number): GridRowKey => index;

export type FilteredDataRows<T> = {
  rows: readonly T[];
  order: RowOrder;
  rowKeyGetter: (row: T, index: number) => GridRowKey;
};

export type RowSelectionCommands<T> = {
  update: (args: RowSelectionCommandsArgs<T>) => void;
  commitRowSelection: (next: RowSelectionState) => void;
  // 追加(1.0.2 / 2026-11-09 実アプリの総点検 H-07): onRowSelectionChange を呼んでいる間の新しい選択(それ以外は null)。
  //   命令的 API の読み取り(getSelectedRowCount など)がコールバックの中でも新しい値を返すのに使います。
  pendingRowSelection: () => RowSelectionState | null;
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

  // 変更(1.0.2 / 2026-11-09 実アプリの総点検 H-07): uncontrolled は先に反映してから通知し、通知の間は新しい選択を
  //   pendingRowSelection で見せます(コールバックの中でハンドルの getSelectedRowCount / getSelectedRowKeys を読むと、
  //   1 つ前の値が返っていた。controlled は親が prop を変えるまで反映しないので、通知の間だけ新しい値を見せる)。
  let pending: RowSelectionState | null = null;
  // base: 比べる今の選択(省略 = 描いたときの選択。update の中で controlled の記述子を同期した直後は、同期した選択)。
  const commitRowSelectionFrom = (base: RowSelectionState | undefined, next: RowSelectionState) => {
    const { rowSelectionState, onRowSelectionChange, controlledRowSelectionModel, dispatch } = requireArgs();
    const changed = !rowSelectionStateEquals(base ?? rowSelectionState, next);
    if (controlledRowSelectionModel === undefined) {
      dispatch(gridActions.setRowSelectionState(next));
    }
    if (changed && onRowSelectionChange) {
      const previous = pending;
      pending = next;
      try {
        onRowSelectionChange(rowSelectionToModel(next));
      } finally {
        pending = previous;
      }
    }
  };
  const commitRowSelection = (next: RowSelectionState) => {
    // 全選択をし直したら、消した行の除いた印は捨てます(戻した行も選ばれた状態にする)。
    if (next.mode === 'exclude' && next.keys.size === 0) {
      excludedTombstones.clear();
    }
    commitRowSelectionFrom(undefined, next);
  };
  // 追加(1.3.0 / S4-09): 消えた行のキーを外す処理は、展開行の DF-25 と同じもの(前の rows にあって今の rows に無いキーだけを
  //   外す。行を読み込む前に setRowSelection / selectedRowKeys で渡したキーは残す。rows が変わったときだけ見て、編集では前に
  //   見つけた位置で確かめる)。exclude(全選択)の除いたキーも同じく外します(総数 − 除いた数 が合うように)。
  const keysPruner = createDetailKeysPruner<T>();
  // 追加(1.3.0 の別視点のレビュー): 全選択(exclude)で除いていた行を消したときに外したキーです。その行が戻ったら(元に戻す)
  //   除いたまま戻します(外したままだと、除いていた行が選ばれた状態で戻っていた)。全選択で選ばれていた行は、除いたキーに
  //   無いので選ばれたまま戻ります(どちらも消す前の状態)。exclude の間だけ持ちます。
  const excludedTombstones = new Set<GridRowKey>();
  let tombstoneRows: readonly unknown[] | null = null;

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
      let current = next.rowSelectionState;
      if (!synced || !Object.is(model, lastSyncedModel)) {
        synced = true;
        lastSyncedModel = model;
        if (model !== undefined) {
          const resolved = rowSelectionFromModel(model);
          if (!rowSelectionStateEquals(next.rowSelectionState, resolved)) {
            next.dispatch(gridActions.setRowSelectionState(resolved));
            current = resolved;
          }
        }
      }
      const source = next.sourceRows;
      const rows = source?.rows ?? NO_ROWS;
      const keyOf = source?.rowKeyGetter ?? indexKey;
      keysPruner.update({
        enabled: source !== undefined,
        rows,
        expandedKeys: current.keys,
        keyOf,
        setExpandedKeys: (keys) => {
          const pruned: RowSelectionState = { mode: current.mode, keys: new Set(keys) };
          if (current.mode === 'exclude') {
            for (const key of current.keys) {
              if (!pruned.keys.has(key)) {
                excludedTombstones.add(key);
              }
            }
            tombstoneRows = rows;
          }
          commitRowSelectionFrom(current, pruned);
          current = pruned;
        },
      });
      if (excludedTombstones.size > 0) {
        if (source === undefined || current.mode !== 'exclude') {
          excludedTombstones.clear();
          tombstoneRows = null;
        } else if (rows !== tombstoneRows) {
          tombstoneRows = rows;
          const found = new Map<GridRowKey, number>();
          findKeysIn(rows, keyOf, excludedTombstones, found);
          if (found.size > 0) {
            const keys = new Set(current.keys);
            for (const key of found.keys()) {
              keys.add(key);
              excludedTombstones.delete(key);
            }
            commitRowSelectionFrom(current, { mode: 'exclude', keys });
          }
        }
      }
    },
    commitRowSelection,
    pendingRowSelection: () => pending,
    handleGutterRowSelect,
    handleGutterRowSelectDrag,
    handleToggleSelectAllRows,
  };
};