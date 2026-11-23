// 追加(非依存化 ③-6): セル編集セッションのコントローラです(React 非依存。旧 hooks/useGridEditController の
//   本体を移設)。開始 / 確定 / 取消と、確定後のフォーカス復帰 + 隣接セルへの移動(rAF)を担います。
//   - update(args) はレンダー後に毎回呼ばれる前提(hooks/useController)。最新の args(編集中セル /
//     rows / 列 / rowModel / コールバック)を保持し、メソッドはイベント時点の最新値を読みます。
//   - editorActionGuard は「commit / cancel 直後の rAF まで再入を抑止する」共有フラグで、他の hook
//     (ポインタ系)も参照するため { current } の構造的型で受けます(React の RefObject と互換)。
//   - 書き込み経路は clientSide(rows → onRowsChange)と serverSide(applyServerSideCellEdits)の 2 つ。
//     いずれも列パーサ(parseCommittedValue)→ 検証(decideCellWrite。reject なら { status: 'rejected' })。
import { gridActions, type GridUiAction } from '../model/gridActions';
// 注記: 列 / RowModel の型は logic/(editorValues / validation / serverSideEdits)が現状 React 束縛の
//   gridTypes を参照しているため、ここも同じ束縛を使います(束ね型 F の一般化は ⑤ パッケージ分割で
//   logic/ と一緒に行う)。ランタイムの React 依存はありません。
import type {
  CellCoord,
  EditorCommitDirection,
  EditorCommitResult,
  GridColumn,
  GridRowKey,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { isUnchangedEditorCommit, parseCommittedValue, writeRowsCell } from '../logic/editorValues';
import { decideCellWrite, type ValidationLocaleText } from '../logic/validation';
import { clamp } from '../logic/geometry';
import { findViewRowIndexByKey, isFocusInsideDetailCard, resolveFirstDataColIndex } from '../logic/detailRow';
import { getCellValue, isCellEditable, isViewCellEditable } from '../utils/permissions';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';
import { getActiveElement } from '../utils/shadowDom';

export type EditControllerArgs<T extends object> = {
  uiState: GridUiState;
  rows: T[];
  visibleColumns: GridColumn<T>[];
  rowModel: RowModel<T>;
  setEditorInitialValue: (value: string) => void;
  onRowsChange?: (nextRows: T[]) => void;
  applyServerSideCellEdits?: (edits: ServerSideCellEditInput<T>[]) => number;
  dispatch: (action: GridUiAction) => void;
  // フォーカス復帰先(グリッド root)。未マウントなら null。
  gridRootRef: { readonly current: HTMLElement | null };
  // 再入抑止フラグ(共有・可変)。
  editorActionGuardRef: { current: boolean };
  // 追加(監査 RD-6): 確定時に編集可否を再評価するための props です(開始時のゲートだけでは、編集中に
  //   readOnly へ切り替わった / canEditCell の結果が変わった場合に書き込めてしまうため)。未指定は従来どおり。
  readOnly?: boolean;
  canEditCell?: SpreadsheetGridProps<T>['canEditCell'];
  // 追加(英語対応): reject の検査のメッセージの文言(localeText。未指定は日本語の既定)。
  localeTexts?: ValidationLocaleText;
  // 追加(1.2.0 の確かめ直し K): activeCellFollows: 'row'。確定の後の移動(Enter / Tab)の先を、確定した時点の並びの行キーで
  //   覚え、並びが変わった後もその行へ動かします(並べ替えの列を編集すると、確定で行が動いた後に元の座標へ動いていた)。
  followsRow?: boolean | undefined;
  // 追加(1.3.0 / RV5-3): 今の状態(store の getState)。確定の後処理(次のフレーム)の時点で、もう次の編集が始まって
  //   いるかを見ます(未指定は update で受けた値)。
  getUiState?: (() => GridUiState) | undefined;
  // 追加(1.3.0 / S7-03 / S8-04): 編集していた行が表から消えたとき、その行がまだ rows にあるかを行キーで探します
  //   (未指定は rows の index がキー)。
  rowKeyGetter?: ((row: T, index: number) => GridRowKey) | undefined;
};

// 追加(1.4.1 / AP-11): 開いたままの custom エディタの編集をグリッドが終えた(endEditLeftOpen)後に、そのセッションの ctx.commit
//   を編集していたセルへ書く関数です(onBlur でサーバーの検査を待ってから確定する作りの値を捨てない)。1 回だけ効きます。
export type LateEditCommit = (value: unknown) => EditorCommitResult;
// custom エディタの箱が登録する受け取り口(終えたときに、そのセッションの LateEditCommit を渡す)。
export type LateEditCommitReceiver = (commit: LateEditCommit) => void;

export type EditController<T extends object> = {
  update: (args: EditControllerArgs<T>) => void;
  activateSingleCell: (cell: CellCoord) => void;
  startEditWithValue: (cell: CellCoord, initialValue: string) => void;
  commitEdit: (
    committedValue: unknown,
    direction?: EditorCommitDirection,
  ) => EditorCommitResult;
  cancelEdit: () => void;
  // 追加(1.3.0 / S7-03 / S8-04): 組み込みのエディタ(text / number / date)が、打ちかけを確定する関数を預けます(描くたびに今の
  //   打ちかけで預け直す。select / custom は null)。編集していた行が絞り込みから外れてエディタが先に外れても、その行へ確定できる
  //   ように(エディタが外れると blur を待てない)。
  registerDraftFlush: (flush: (() => void) | null) => void;
  // 追加(1.4.1 / 2026-11-09 実アプリの総点検 AP-11): グリッドの中を押してフォーカスをルートへ移した直後に呼びます(core
  //   pointerInteractionsController)。custom エディタが開いたまま(onBlur で ctx.commit / ctx.cancel を呼ばない作り)なら、
  //   グリッドが編集を終えます(打ちかけは書かない)。これまではエディタが開いたまま残り、別のセルをダブルクリックするまで
  //   グリッドのキー操作が効かなかった。その後に届いた ctx.commit は、登録された受け取り口へ渡す関数で編集していたセルへ書きます
  //   (1.0.1 で押したときに終える直しを戻した理由 = レビュー RA-3 の、onBlur で非同期に確定する作りの値が消えること、への対処)。
  //   組み込みのエディタは blur で自分で確定 / 取り消すので何もしません。
  endEditLeftOpen: () => void;
  // 追加(1.4.1 / AP-11): custom エディタの箱が、遅れて届く ctx.commit の受け取り口を登録します(戻り値で外す。外すのは今も
  //   その受け取り口が登録されているときだけ = 次のセッションの箱が先に登録していても消さない)。
  registerLateCommitReceiver: (receiver: LateEditCommitReceiver) => () => void;
};

// 追加(audit RD-1 / RD-3): 編集セッションの「同一性」です。editingCell は view / 論理 index だけを
//   持つため、編集中に rows が差し替わって行順が変わる(ポーリング更新 / SSRM refresh / 外部からの
//   applyState 等)と、確定値が「同じ index に来た別の行」へ書き込まれていました。開始時の rowKey /
//   columnKey を控えておき、update のたびに index との対応を確かめます(詳細は update 内のコメント)。
type EditIdentity = {
  rowKey: GridRowKey;
  columnKey: string;
  // この同一性が指していた editingCell(前回 update 時点)。
  cell: CellCoord;
};

// 追加(確定後のアクティブセル上書き): 方向なしの確定(エディタの blur / custom の commit(value) / select の
//   候補クリック / editorEnterMove 'none')の時点のアクティブセルと選択です。後処理(rAF)で「編集していたセルを
//   単一選択にする」前に、ここから変わっていないかを参照で比べます(edit/stop はどちらの参照も保ち、セルの
//   クリック / ドラッグ / 行・列ヘッダーの選択 / 命令的 API は新しい参照を作る)。
type SelectionSnapshot = Pick<GridUiState, 'activeCell' | 'selection'>;

const isSelectionChangedSince = (
  snapshot: SelectionSnapshot,
  uiState: GridUiState,
): boolean =>
  uiState.activeCell !== snapshot.activeCell || uiState.selection !== snapshot.selection;

// 追加(編集確定後のフォーカス奪取): commit / cancel 後の rAF でグリッドへフォーカスを戻してよいかです。
//   - どこにもない(null / body)→ 戻す。Enter / Tab / Escape で確定・取消してエディタが外れた直後はここ。
//   - グリッドのルート内(まだ残っているエディタ / セルのクリックでフォーカスを受けたルート / imeDirectInput
//     の入力受け)→ 戻す(ルートへの focus は imeDirectInput 有効時は入力受けへ回る)。
//   - グリッド外の要素(上部バーの入力欄 / ページ内の別フォーム / 別のグリッド)→ 戻さない。エディタの blur で
//     確定したとき、クリック先の入力欄からフォーカスを奪い返さない(ポップオーバーの監査 C-3 と同じ方針)。
//   - 展開行カード内(ルート内だが消費側の UI)→ 従来どおり奪わない。
const shouldRestoreFocusAfterEdit = (root: HTMLElement): boolean => {
  if (isFocusInsideDetailCard(root)) {
    return false;
  }
  const doc = root.ownerDocument;
  const active = getActiveElement(root);
  return (
    active === null ||
    active === doc.body ||
    active === doc.documentElement ||
    root.contains(active)
  );
};

// 追加(1.3.0 / S7-03 / S8-04): フォーカスがどこにも無い(body / html / null = 持っていた要素が外れた)かです。
const isFocusDropped = (root: HTMLElement): boolean => {
  const doc = root.ownerDocument;
  const active = getActiveElement(root);
  return active === null || active === doc.body || active === doc.documentElement;
};

// 追加(1.0.1 / 2026-11-09 実アプリの総点検 AP-05): エディタの中でキー(Enter / Tab / Escape)を押して確定・取消したかです
//   (フォーカスがグリッドのルートの中のエディタ = .ssg-cell-editor にある)。このときは、エディタが外れる前にフォーカスを
//   ルートへ移し、移動も次のフレームを待たずに行います。次のフレームまでフォーカスが body に落ちていたため、速い入力
//   (バーコードリーダー・自動入力)の確定直後のキーが捨てられ、値の頭が欠けたり、別の行へずれたりしていた。
const isFocusInsideEditor = (root: HTMLElement | null): root is HTMLElement => {
  if (root === null) {
    return false;
  }
  const active = getActiveElement(root);
  return (
    active !== null &&
    active !== root &&
    root.contains(active) &&
    typeof active.closest === 'function' &&
    active.closest('.ssg-cell-editor') !== null &&
    !isFocusInsideDetailCard(root)
  );
};

export const createEditController = <T extends object>(): EditController<T> => {
  let args: EditControllerArgs<T> | null = null;
  let identity: EditIdentity | null = null;
  // 追加(1.3.0 / RV5-3): まだ済んでいない確定 / 取消の後処理(次のフレーム)。その前に次の編集が始まったら superseded に
  //   して、後処理はしません(フォーカスをルートへ戻すと、始まったばかりのエディタからフォーカスを奪い、続けて打った文字が
  //   捨てられていた。エディタを開いたまま別のセルを押し、1 フレームの内に打つと先頭の文字しか残らなかった)。
  let pendingAfterEdit: { superseded: boolean } | null = null;
  // 追加(1.3.0 / S7-03 / S8-04): 編集していた行が表から消えたとき(絞り込みから外れた・rows が別の行に替わった)に、エディタの
  //   確定(フォーカスを外して blur で受ける)を書き込む先(行と列のキー。書けなければ commitByKey が書かない)。
  let lostEditTarget: EditIdentity | null = null;
  let lostEditHandled = false;
  // finishLostEdit の中(エディタの blur の確定は lostEditTarget へ。無ければ書かない = 消えた行の座標に来た別の行へ書かない)。
  let finishingLostEdit = false;
  // 今のエディタの打ちかけを確定する関数(registerDraftFlush。編集が終われば null)。
  let draftFlush: (() => void) | null = null;
  // 追加(1.4.1 / AP-11): 今の custom エディタの箱が登録した、遅れて届く ctx.commit の受け取り口。
  let lateCommitReceiver: LateEditCommitReceiver | null = null;

  // 指定セルの rowKey / columnKey を読みます(行が無い = SSRM 未ロード / 範囲外なら null)。
  const readKeysAt = (
    current: EditControllerArgs<T>,
    cell: CellCoord,
  ): { rowKey: GridRowKey; columnKey: string } | null => {
    const column = current.visibleColumns[cell.col];
    if (!column || cell.row < 0 || cell.row >= current.rowModel.getRowCount()) {
      return null;
    }
    if (current.rowModel.getRow(cell.row) === undefined) {
      return null;
    }
    return { rowKey: current.rowModel.getRowKey(cell.row), columnKey: column.key };
  };

  // 同一性から現在の view 座標を探します(行は O(行数) の走査。rows の差し替え時だけ呼ばれます)。
  const locateIdentity = (
    current: EditControllerArgs<T>,
    target: EditIdentity,
  ): CellCoord | null => {
    const col = current.visibleColumns.findIndex(
      (column) => column.key === target.columnKey,
    );
    if (col < 0) {
      return null;
    }
    const rowCount = current.rowModel.getRowCount();
    for (let row = 0; row < rowCount; row += 1) {
      if (
        current.rowModel.getRow(row) !== undefined &&
        Object.is(current.rowModel.getRowKey(row), target.rowKey)
      ) {
        return { row, col };
      }
    }
    return null;
  };

  const update = (next: EditControllerArgs<T>) => {
    args = next;
    const editingCell = next.uiState.editingCell;
    if (!editingCell) {
      identity = null;
      draftFlush = null;
      return;
    }
    const keysHere = readKeysAt(next, editingCell);
    const matchesIdentity =
      identity !== null &&
      keysHere !== null &&
      Object.is(keysHere.rowKey, identity.rowKey) &&
      keysHere.columnKey === identity.columnKey;
    if (matchesIdentity) {
      // 同じ行 / 列を指している(通常の再レンダー、または下の再ターゲット後)。座標だけ更新します。
      identity = { ...identity!, cell: editingCell };
      return;
    }
    const sameCellAsBefore =
      identity !== null &&
      identity.cell.row === editingCell.row &&
      identity.cell.col === editingCell.col;
    if (identity === null || !sameCellAsBefore) {
      // 新しい編集セッションの開始(startEdit 直後)。この時点の行 / 列を同一性として控えます。
      identity = keysHere ? { ...keysHere, cell: editingCell } : null;
      // 追加(1.3.0 / RV5-3): 前の編集の後処理がまだなら取りやめ、再入抑止も外します(新しいエディタの確定が空振りしない)。
      if (pendingAfterEdit !== null) {
        pendingAfterEdit.superseded = true;
        pendingAfterEdit = null;
        next.editorActionGuardRef.current = false;
      }
      return;
    }
    // 座標は変わっていないのに行 / 列のキーが変わった = 編集中に rows / columns が差し替わった。
    //   同一性を手がかりに現在位置を探し、見つかれば editingCell をそこへ再ターゲット(RD-1)、
    //   見つからなければ編集を終了します(RD-3: editingCell が残ってキー操作が全滅するのを防ぐ)。
    const located = locateIdentity(next, identity);
    if (located) {
      identity = { ...identity, cell: located };
      // 変更(1.2.0 の確かめ直し J): アクティブセルと選択も一緒に付いていく(これまでは startEdit で、選択だけ元の位置に残った)。
      next.dispatch(gridActions.retargetEdit(located, next.rowModel.getRowCount()));
    } else {
      const lost = identity;
      identity = null;
      finishLostEdit(next, lost);
    }
  };

  // 追加(1.3.0 / Solid 版の品質の段 2 S7-03 / S8-04): 編集していた行が表から消えたときの終わり方です。これまでは知らせなく
  //   編集を終え(打ちかけは捨てる)、エディタと一緒にフォーカスも消えて body に落ち、押すまでキー操作が効かなかった。
  //   - 行がまだ rows にある(絞り込みから外れた。今日の絞り込みで 0 時をまたいだ など)→ 打ちかけを確定してその行へ書く。
  //   - rows に無い(rows がすべて別の行に替わった)/ serverSide → 取り消す。
  //   どちらもフォーカスはグリッドに残します。打ちかけはエディタが持っているので、組み込みのエディタは預かった関数
  //   (registerDraftFlush)で確定し、それ以外はフォーカスをルートへ移してエディタの blur の確定を受けます。どちらの確定
  //   (commitEdit)も lostEditTarget の行へ向けます(blur で確定しないエディタ = select は取り消し)。
  const finishLostEdit = (next: EditControllerArgs<T>, lost: EditIdentity) => {
    if (next.editorActionGuardRef.current) {
      next.dispatch(gridActions.stopEdit());
      return;
    }
    lostEditTarget = lost;
    lostEditHandled = false;
    const flush = draftFlush;
    draftFlush = null;
    finishingLostEdit = true;
    let movedFocus: boolean;
    try {
      if (flush !== null) {
        // 行が絞り込みから外れると、エディタはこの時点でもう外れている(blur は来ない)。打ちかけをここで確定し、
        //   下の blur の確定は書かない(lostEditTarget を空に)。
        flush();
        lostEditTarget = null;
      }
      movedFocus = moveFocusToRootFromEditor();
    } finally {
      finishingLostEdit = false;
      lostEditTarget = null;
    }
    // エディタと一緒にフォーカスが body に落ちていれば、次のフレームを待たずにルートへ戻します(すぐ打ったキーも効く)。
    const root = next.gridRootRef.current;
    if (!movedFocus && root !== null && root.isConnected && isFocusDropped(root)) {
      root.focus({ preventScroll: true });
      movedFocus = true;
    }
    // エディタの blur で確定 / 取り消しが済んだ(cancelEdit が後処理まで予約した)なら、ここでは何もしません。
    if (lostEditHandled && next.editorActionGuardRef.current) {
      lostEditHandled = false;
      return;
    }
    lostEditHandled = false;
    next.editorActionGuardRef.current = true;
    next.dispatch(gridActions.stopEdit());
    scheduleAfterEdit(null, null, undefined, movedFocus);
  };

  const findSourceIndexByKey = (current: EditControllerArgs<T>, rowKey: GridRowKey): number => {
    const { rows, rowKeyGetter } = current;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row !== undefined && Object.is(rowKeyGetter ? rowKeyGetter(row, index) : index, rowKey)) {
        return index;
      }
    }
    return -1;
  };

  const activateSingleCell = (cell: CellCoord) => {
    if (args === null) {
      return;
    }
    args.dispatch(gridActions.startSelection(cell));
    args.dispatch(gridActions.endSelection());
    args.dispatch(gridActions.activateCell(cell));
  };

  const startEditWithValue = (cell: CellCoord, initialValue: string) => {
    if (args === null) {
      return;
    }
    args.setEditorInitialValue(initialValue);
    args.dispatch(gridActions.startEdit(cell));
  };

  // commit / cancel 直後の後処理(rAF): フォーカスをグリッドへ戻し(グリッド外 / 展開行カード内に
  //   フォーカスがある場合は奪わない = shouldRestoreFocusAfterEdit)、必要なら隣接セルへ移動してから
  //   再入抑止を解除します。ガードを立てるのは呼び出し側(旧実装と同じ順序を保つため)。
  //   変更(確定後のアクティブセル上書き): stayedFrom(方向なしの確定時点のスナップショット)があり、rAF までに
  //   アクティブセル / 選択が変わっていれば、編集していたセルへ戻しません。グリッド内の別のセルや行・列ヘッダーを
  //   押したことで blur 確定した場合、押した操作(アクティブセル / ドラッグ選択の開始)を上書きしていたため。
  //   方向付きの移動(Enter / Tab / commit(value, direction))は従来どおり常に行います。
  //   変更(1.0.1 / AP-05): immediate(エディタの中のキーで確定・取消した)ときは、呼び出し側が stopEdit の前にフォーカスを
  //   ルートへ移し、後処理は stopEdit を反映した描画の直後(マイクロタスク)に行います。描画がまだなら(React の外から
  //   確定したなど)従来どおり次のフレーム。後処理は一度だけです。
  // 縦の移動の先の行(行の数に収め、ラベル行は同じ向きに読み飛ばす。FC-18)。
  const resolveMoveRow = (rowModel: RowModel<T>, nextRow: number, fromRow: number | undefined): number => {
    const rowCount = rowModel.getRowCount();
    let row = clamp(nextRow, 0, Math.max(rowCount - 1, 0));
    // 追加(FC-18): 縦の移動(Enter / Shift+Enter)はラベル行に止まらず、同じ向きに読み飛ばします(↑↓ のキーと同じ。
    //   端までラベル行しか無ければ確定した行に留まる)。従来はラベル行に止まり、続けて打った文字が捨てられていた。
    const { getLabelRow } = rowModel;
    if (getLabelRow && fromRow !== undefined && row !== fromRow) {
      const step = row > fromRow ? 1 : -1;
      while (row >= 0 && row < rowCount && getLabelRow(row)) {
        row += step;
      }
      if (row < 0 || row >= rowCount) {
        row = clamp(fromRow, 0, Math.max(rowCount - 1, 0));
      }
    }
    return row;
  };

  const scheduleAfterEdit = (
    nextCell: CellCoord | null,
    stayedFrom: SelectionSnapshot | null = null,
    // 追加(1.0 前の最終チェック FC-18): 確定した行(縦の移動でラベル行を読み飛ばす向きを決める)。
    fromRow?: number,
    immediate = false,
    // 追加(1.2.0 の確かめ直し K): 移動の先の行のキー('row' のとき。確定した時点の並びで決めたもの)。
    targetRowKey?: GridRowKey,
  ) => {
    const current = args;
    if (current === null) {
      return;
    }
    let done = false;
    const pending = { superseded: false };
    pendingAfterEdit = pending;
    // 確定 / 取消した編集(描いた時点の editingCell。次の編集は新しい値になる)。
    const finishedEditingCell = current.uiState.editingCell;
    const run = (final: boolean) => {
      if (done) {
        return;
      }
      if (pending.superseded) {
        done = true;
        return;
      }
      // 追加(1.3.0 / RV5-3): 描く前に次の編集が始まっていれば(update がまだ受けていない)、後処理はせず再入抑止だけ外します。
      const live = args === null ? null : (args.getUiState?.() ?? null);
      if (live !== null && live.editingCell !== null && live.editingCell !== finishedEditingCell) {
        done = true;
        if (pendingAfterEdit === pending) {
          pendingAfterEdit = null;
        }
        current.editorActionGuardRef.current = false;
        return;
      }
      // マイクロタスクの時点で編集の終了がまだ描かれていなければ(エディタが残っている)、次のフレームに任せます。
      if (!final && (args === null || args.uiState.editingCell !== null)) {
        return;
      }
      done = true;
      if (pendingAfterEdit === pending) {
        pendingAfterEdit = null;
      }
      const root = current.gridRootRef.current;
      if (root !== null && shouldRestoreFocusAfterEdit(root)) {
        root.focus();
      }
      if (
        nextCell !== null &&
        args !== null &&
        !(stayedFrom !== null && isSelectionChangedSince(stayedFrom, args.uiState))
      ) {
        // 行数 / 列数は rAF 時点の最新 args で clamp します(旧 boundsRef 相当)。
        const colCount = args.visibleColumns.length;
        // 変更(1.2.0 の確かめ直し K): 'row' では、確定した時点の並びで決めた行を今の並びで探します(見つからなければ座標)。
        const followed =
          targetRowKey === undefined ? -1 : findViewRowIndexByKey(args.rowModel, targetRowKey, new Map());
        const row = followed >= 0 ? followed : resolveMoveRow(args.rowModel, nextCell.row, fromRow);
        activateSingleCell({
          row,
          col: clamp(nextCell.col, 0, Math.max(colCount - 1, 0)),
        });
      }
      current.editorActionGuardRef.current = false;
    };
    if (immediate) {
      queueMicrotask(() => run(false));
    }
    requestAnimationFrame(() => run(true));
  };

  // 追加(AP-05): エディタの中のキーで確定・取消したときは、エディタが外れる前にフォーカスをルートへ移します(ガードを
  //   立てた後に呼ぶ = 移したことによるエディタの blur の確定は空振りになる)。移したら true。
  const moveFocusToRootFromEditor = (): boolean => {
    const root = args?.gridRootRef.current ?? null;
    if (!isFocusInsideEditor(root)) {
      return false;
    }
    root.focus({ preventScroll: true });
    return true;
  };

  const commitEdit = (
    committedValue: unknown,
    direction?: EditorCommitDirection,
  ): EditorCommitResult => {
    if (args === null) {
      return { status: 'noop' };
    }
    const {
      uiState,
      visibleColumns,
      rowModel,
      rows,
      applyServerSideCellEdits,
      onRowsChange,
      dispatch,
      editorActionGuardRef,
    } = args;
    if (editorActionGuardRef.current || !uiState.editingCell) {
      return { status: 'noop' };
    }
    // 追加(1.3.0 / S7-03 / S8-04): 編集していた行が表から消えた(finishLostEdit がフォーカスを外した blur)。
    if (finishingLostEdit) {
      const target = lostEditTarget;
      lostEditTarget = null;
      return target === null ? { status: 'noop' } : commitByKey(args, target, committedValue, true);
    }

    const editingCell = uiState.editingCell;
    const intendedCell: CellCoord =
      direction === 'down'
        ? { row: editingCell.row + 1, col: editingCell.col }
        : direction === 'up'
          ? { row: editingCell.row - 1, col: editingCell.col }
          : direction === 'right'
            ? { row: editingCell.row, col: editingCell.col + 1 }
            : direction === 'left'
              ? // 変更(1.0.2 / 2026-11-09 実アプリの総点検 F-04): 左は操作用の合成列(行ドラッグのハンドル列・展開トグル列)へ
                //   入りません(先頭のデータ列の Shift+Tab / custom の commit(v, 'left') で、ハンドル列に止まっていた)。
                { row: editingCell.row, col: Math.max(editingCell.col - 1, resolveFirstDataColIndex(visibleColumns)) }
              : editingCell;

    const column = visibleColumns[editingCell.col];
    const originalRowIndex = rowModel.getSourceIndex(editingCell.row);
    const row = applyServerSideCellEdits
      ? rowModel.getRow(editingCell.row)
      : rows[originalRowIndex];
    if (!column || !row) {
      dispatch(gridActions.stopEdit());
      return { status: 'noop' };
    }
    // 追加(監査 RD-6): 確定時点で編集不可(編集中に readOnly へ切替 / canEditCell が false へ変化)なら
    //   書き込まずに編集を終了します(cancel と同じ後処理)。
    if (
      !isViewCellEditable(
        { readOnly: args.readOnly, canEditCell: args.canEditCell },
        rowModel,
        editingCell.row,
        editingCell.col,
        row,
        column,
      )
    ) {
      editorActionGuardRef.current = true;
      dispatch(gridActions.stopEdit());
      scheduleAfterEdit(null);
      return { status: 'noop' };
    }

    // 追加(1.0 前の最終チェック FC-09): 何も変えずに確定したら書き込まず(onRowsChange / updateRows を呼ばず、履歴も
    //   積まない)、確定と同じ後処理(フォーカス復帰 + 方向への移動)だけをします。
    const unchanged = isUnchangedEditorCommit(column, getCellValue(row, column), committedValue);
    if (!unchanged && applyServerSideCellEdits) {
      const parsedValue = parseCommittedValue(column, committedValue, row);
      const decision = decideCellWrite(column, row, parsedValue, args.localeTexts);
      if (decision.action === 'reject') {
        return { status: 'rejected', message: decision.message };
      }
      applyServerSideCellEdits([
        { viewIndex: editingCell.row, column, value: parsedValue },
      ]);
    } else if (!unchanged && onRowsChange) {
      const parsedValue = parseCommittedValue(column, committedValue, row);
      const decision = decideCellWrite(column, row, parsedValue, args.localeTexts);
      if (decision.action === 'reject') {
        return { status: 'rejected', message: decision.message };
      }
      const nextRows = writeRowsCell(rows, originalRowIndex, column, parsedValue);
      onRowsChange(nextRows);
    }

    // 旧実装と同じ順序: ガード → rAF 予約 → stopEdit。
    // 変更(AP-05): エディタの中のキーで確定したときは、予約の前にフォーカスをルートへ移します。
    editorActionGuardRef.current = true;
    const immediate = moveFocusToRootFromEditor();
    // 追加(1.2.0 の確かめ直し K): 'row' では移動の先の行を確定した時点の並び(書き込む前の行モデル)のキーで覚えます。
    let targetRowKey: GridRowKey | undefined;
    if (args.followsRow === true) {
      const targetRow = resolveMoveRow(rowModel, intendedCell.row, editingCell.row);
      if (rowModel.getRow(targetRow) != null || rowModel.getLabelRow?.(targetRow) !== undefined) {
        targetRowKey = rowModel.getRowKey(targetRow);
      }
    }
    scheduleAfterEdit(
      intendedCell,
      direction === undefined
        ? { activeCell: uiState.activeCell, selection: uiState.selection }
        : null,
      editingCell.row,
      immediate,
      targetRowKey,
    );
    dispatch(gridActions.stopEdit());
    return { status: 'committed' };
  };

  const cancelEdit = () => {
    if (args === null || args.editorActionGuardRef.current) {
      return;
    }
    // finishLostEdit の中のエディタの blur の取り消し(select など)。後処理はここで予約します。
    lostEditHandled = true;
    lostEditTarget = null;
    // 旧実装と同じ順序: ガード → stopEdit → rAF 予約。
    args.editorActionGuardRef.current = true;
    const immediate = moveFocusToRootFromEditor();
    args.dispatch(gridActions.stopEdit());
    scheduleAfterEdit(null, null, undefined, immediate);
  };

  const registerDraftFlush = (flush: (() => void) | null) => {
    draftFlush = flush;
  };

  // 行と列のキーで決めたセルへの確定です。消えた行への確定(finishLostEdit の中のエディタの blur。1.3.0 / S7-03 / S8-04)と、
  //   グリッドが終えた custom エディタの編集への遅れて届いた確定(1.4.1 / AP-11)に使います。行と列はキーで今の位置を探します
  //   (押した後に並びが変わっても、編集していたセルへ書く)。書けない(行か列が無い・編集できない・serverSide で行が表に無い)
  //   ときは書きません。アクティブセルとフォーカスは動かしません(押した先の操作を上書きしない)。rejectAsNoop は消えた行の
  //   確定(エディタの blur が rejected を受けると取り消しへ進むため、従来どおり noop を返す)。
  const commitByKey = (
    current: EditControllerArgs<T>,
    target: EditIdentity,
    committedValue: unknown,
    rejectAsNoop?: boolean,
  ): EditorCommitResult => {
    const column = current.visibleColumns.find((candidate) => candidate.key === target.columnKey);
    if (column === undefined) {
      return { status: 'noop' };
    }
    const located = locateIdentity(current, target);
    let row: T | undefined;
    let sourceIndex = -1;
    if (current.applyServerSideCellEdits !== undefined) {
      row = located === null ? undefined : current.rowModel.getRow(located.row);
    } else if (current.onRowsChange !== undefined) {
      sourceIndex = findSourceIndexByKey(current, target.rowKey);
      row = sourceIndex < 0 ? undefined : current.rows[sourceIndex];
    }
    // 編集できるかは今の位置で見ます(表から外れた行は外れる前の位置。finishLostEdit と同じ)。
    const cell = located ?? target.cell;
    if (
      row === undefined ||
      !isCellEditable(
        { readOnly: current.readOnly, canEditCell: current.canEditCell },
        cell.row,
        cell.col,
        row,
        column,
        { sourceRowIndex: sourceIndex >= 0 ? sourceIndex : current.rowModel.getSourceIndex(cell.row), rowKey: target.rowKey },
      )
    ) {
      return { status: 'noop' };
    }
    if (isUnchangedEditorCommit(column, getCellValue(row, column), committedValue)) {
      return { status: 'committed' };
    }
    const parsedValue = parseCommittedValue(column, committedValue, row);
    const decision = decideCellWrite(column, row, parsedValue, current.localeTexts);
    if (decision.action === 'reject') {
      return rejectAsNoop ? { status: 'noop' } : { status: 'rejected', message: decision.message };
    }
    if (current.applyServerSideCellEdits !== undefined && located !== null) {
      current.applyServerSideCellEdits([{ viewIndex: located.row, column, value: parsedValue }]);
    } else if (current.onRowsChange !== undefined && sourceIndex >= 0) {
      current.onRowsChange(writeRowsCell(current.rows, sourceIndex, column, parsedValue));
    }
    return { status: 'committed' };
  };

  const endEditLeftOpen = () => {
    const current = args;
    if (current === null || current.editorActionGuardRef.current) {
      return;
    }
    const editingCell = (current.getUiState?.() ?? current.uiState).editingCell;
    if (editingCell === null) {
      return;
    }
    const column = current.visibleColumns[editingCell.col];
    if (column?.editor?.type !== 'custom') {
      return;
    }
    const keys = identity ?? readKeysAt(current, editingCell);
    const receiver = lateCommitReceiver;
    if (keys !== null && receiver !== null) {
      const target: EditIdentity = { rowKey: keys.rowKey, columnKey: keys.columnKey, cell: editingCell };
      let used = false;
      receiver((committedValue) => {
        if (used || args === null) {
          return { status: 'noop' };
        }
        used = true;
        return commitByKey(args, target, committedValue);
      });
    }
    // 取り消しと同じ終え方(フォーカスは押した処理がルートへ移している。後処理は移動しない)。
    current.editorActionGuardRef.current = true;
    current.dispatch(gridActions.stopEdit());
    scheduleAfterEdit(null);
  };

  const registerLateCommitReceiver = (receiver: LateEditCommitReceiver) => {
    lateCommitReceiver = receiver;
    return () => {
      if (lateCommitReceiver === receiver) {
        lateCommitReceiver = null;
      }
    };
  };

  return {
    update,
    activateSingleCell,
    startEditWithValue,
    commitEdit,
    cancelEdit,
    registerDraftFlush,
    endEditLeftOpen,
    registerLateCommitReceiver,
  };
};