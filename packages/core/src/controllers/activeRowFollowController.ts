// 追加(1.2.0 / 2026-11-09 実アプリの総点検 B-04): 並びが変わる表(ソート中に値が変わる株価ボードなど)で、アクティブセルを
//   表示位置ではなく行に付いていかせるコントローラです(`activeCellFollows: 'row'`。React 非依存)。
//
// これまで(と既定の 'position')は、アクティブセルと選択は表示位置(何行目か)に残り、並びが変わると同じ位置に来た別の行を
//   指していました(Excel と同じ)。'row' では:
//   - アクティブセルを動かしたとき(押す・矢印キー・selectCell など。並びの変化以外)に、その行のキーを覚える。
//   - 並び(行モデル)だけが変わったとき、覚えた行が別の位置にあれば、そこへアクティブセルを動かす
//     (reducer の selection/followActiveRow。アクティブセルの行だけの範囲は一緒に動き、何行かの範囲は 1 セルになる)。
//   - アクティブセルの行は動かず、何行かにまたがる範囲の中の行だけが入れ替わったときも、範囲を外してアクティブセルの 1 セルに
//     する(reducer の selection/collapseToActiveCell。選んだつもりの無い行をコピー・削除・貼り付けしないため。全部の行に
//     またがる範囲はそのまま。1.2.0 の確かめ直し B)。
//   - 覚えた行が消えた・絞り込みで隠れたときは今と同じく位置に残し、その位置の行を覚え直す(はみ出しは B-05 の詰め)。
//   - 表はスクロールしない(見ている場所を勝手に動かさない。矢印キーを押せばそのセルまで動く)。アクティブセルが動くと
//     viewportSyncController がそのセルを見える所へスクロールするので、動かした先かを isFollowMove で教える。
//   - 選択のドラッグ中と編集中は動かさない(編集中のセルは editController が行キーで付いていく)。
//   - onActiveCellChange は呼ばない(engine/notifiers が、動かすと決めた描画の途中の位置を通知せず、動いた後は行キーと列キーで
//     比べる)。
// 接続: update はレイアウト effect で毎描画(動かす dispatch は描く前に反映される)。serverSide では呼び出し側が enabled を
//   false にする(並べ替えはサーバーで、取り直すまで並びが変わらないため)。
import type { CellCoord, GridRowKey, GridSelection, RowModel } from '../model/gridTypes.unbound';
import { gridActions, type GridUiAction } from '../model/gridActions';
import { findViewRowIndexByKey } from '../logic/detailRow';

export type ActiveRowFollowArgs<T> = {
  enabled: boolean;
  activeCell: CellCoord | null;
  // 追加(1.2.0 の確かめ直し B): 何行かにまたがる範囲の中の行が入れ替わったかを見るため。
  selection: GridSelection | null;
  rowModel: RowModel<T>;
  // セル / 行の選択のドラッグ中 / 編集中(どちらも動かさない)。
  // 変更(1.2.0 の見直し QG-4): ドラッグ中に並びが変わったときは、追う行を覚えたまま待ち、ドラッグが終わった描画で付いていく
  //   (これまではその位置の行を覚え直していた)。列幅のドラッグなど選択でないドラッグは含めない(呼び出し側)。
  dragging: boolean;
  editing: boolean;
  dispatch: (action: GridUiAction) => void;
};

export type ActiveRowFollowController<T> = {
  update: (args: ActiveRowFollowArgs<T>) => void;
  // 今の描画のレイアウト effect で動かすと決めたか(次の描画で動く)。アクティブセルの通知が途中の位置を通知しないために読む。
  isFollowPending: () => boolean;
  // cell が並びの変化に付いていって動かした先か(次にアクティブセルが別の所へ動くまで)。viewportSyncController が
  //   そこへスクロールしないために読む。
  isFollowMove: (cell: CellCoord) => boolean;
  dispose: () => void;
};

const NO_KEY: unique symbol = Symbol('no-key');

const isSameCoord = (a: CellCoord, b: CellCoord): boolean => a.row === b.row && a.col === b.col;

export const createActiveRowFollowController = <T,>(): ActiveRowFollowController<T> => {
  let prevActiveCell: CellCoord | null = null;
  let prevRowModel: RowModel<T> | null = null;
  let tracked: GridRowKey | typeof NO_KEY = NO_KEY;
  let pending = false;
  // 動かした先(座標)。アクティブセルがほかの所へ動いたら外す。
  let followTarget: CellCoord | null = null;
  // ドラッグ中に並びが変わって、付いていくのを待っているか。
  let deferred = false;
  const indexCache = new Map<GridRowKey, number>();

  const keyAt = (rowModel: RowModel<T>, row: number): GridRowKey | typeof NO_KEY =>
    row < rowModel.getRowCount() && (rowModel.getRow(row) != null || rowModel.getLabelRow?.(row) !== undefined)
      ? rowModel.getRowKey(row)
      : NO_KEY;

  // 何行かにまたがるセル範囲 / 行選択(全部の行にまたがるものは除く)の中で、前の並びと行が入れ替わったか。最初に違う行で
  //   止めます(入れ替わりが無いときだけ範囲の行数ぶん見る)。
  const rangeRowsChanged = (selection: GridSelection | null, before: RowModel<T>, after: RowModel<T>): boolean => {
    let first: number;
    let last: number;
    if (selection?.type === 'cell') {
      first = Math.min(selection.range.start.row, selection.range.end.row);
      last = Math.max(selection.range.start.row, selection.range.end.row);
    } else if (selection?.type === 'row') {
      first = Math.min(selection.startRow, selection.endRow);
      last = Math.max(selection.startRow, selection.endRow);
    } else {
      return false;
    }
    const rowCount = after.getRowCount();
    if (first === last || (first <= 0 && last >= rowCount - 1)) {
      return false;
    }
    for (let row = first; row <= last; row += 1) {
      if (!Object.is(keyAt(before, row), keyAt(after, row))) {
        return true;
      }
    }
    return false;
  };

  return {
    update: (args) => {
      const { activeCell, rowModel } = args;
      const previousRowModel = prevRowModel;
      const activeChanged = !Object.is(prevActiveCell, activeCell);
      const rowModelChanged = prevRowModel !== null && !Object.is(prevRowModel, rowModel);
      prevActiveCell = activeCell;
      prevRowModel = rowModel;
      pending = false;
      if (followTarget !== null && (activeCell === null || !isSameCoord(activeCell, followTarget))) {
        followTarget = null;
      }
      if (!args.enabled || activeCell === null) {
        tracked = NO_KEY;
        deferred = false;
        return;
      }
      if (activeChanged || tracked === NO_KEY) {
        tracked = keyAt(rowModel, activeCell.row);
        deferred = false;
        return;
      }
      if ((!rowModelChanged && !deferred) || args.editing) {
        return;
      }
      const here = keyAt(rowModel, activeCell.row);
      if (here !== NO_KEY && Object.is(here, tracked)) {
        deferred = false;
        // 追加(1.2.0 の確かめ直し B): アクティブセルの行は同じ位置でも、範囲の中のほかの行が入れ替わったら 1 セルにする。
        if (
          rowModelChanged &&
          previousRowModel !== null &&
          !args.dragging &&
          rangeRowsChanged(args.selection, previousRowModel, rowModel)
        ) {
          args.dispatch(gridActions.collapseSelectionToActiveCell());
        }
        return;
      }
      if (args.dragging) {
        // ドラッグ中: 動かさず、追う行は覚えたまま(終わった描画で付いていく)。
        deferred = true;
        return;
      }
      deferred = false;
      const row = findViewRowIndexByKey(rowModel, tracked, indexCache);
      if (row < 0) {
        // 追う行が消えた / 隠れた: 位置に残し、その位置の行を覚え直す。
        tracked = here;
        return;
      }
      pending = true;
      followTarget = { row, col: activeCell.col };
      args.dispatch(gridActions.followActiveRow(row, rowModel.getRowCount()));
    },
    isFollowPending: () => pending,
    isFollowMove: (cell) => followTarget !== null && isSameCoord(cell, followTarget),
    dispose: () => {
      prevActiveCell = null;
      prevRowModel = null;
      tracked = NO_KEY;
      pending = false;
      followTarget = null;
      deferred = false;
      indexCache.clear();
    },
  };
};