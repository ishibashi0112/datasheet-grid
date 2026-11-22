// 追加(非依存化 ③-8): コピー / ペーストのコントローラです(React 非依存。旧 hooks/useGridClipboardController の
//   本体を移設)。
//   - computeIsWholeGridSelected は純関数で、レンダー中に読む値(ヘッダーの全選択表示等)のため
//     アダプタが毎レンダー計算します(コントローラの update を待たない)。
//   - handleCopy / handlePaste はイベント時に最新 args を読みます(hooks/useController の update 前提)。
//     ペーストのイベントは構造的型 ClipboardEventLike で受け、React 合成イベント / ネイティブの両方に
//     対応します。
//   - 書き込み経路は clientSide(rows / columns の拡張を含む)と serverSide(applyServerSideCellEdits)。
import { gridActions, type GridUiAction } from '../model/gridActions';
import type {
  CellCoord,
  GridColumn,
  GridPasteSkippedCell,
  GridRowKey,
  GridSelection,
  GridUiState,
  RowModel,
  SpreadsheetGridProps,
} from '../model/gridTypes.unbound';
import { normalizeCellRange } from '../model/gridSelectors';
import { clamp } from '../logic/geometry';
import { shouldIgnoreGridKeydown } from '../logic/domGuards';
import { isCellEditable, isViewCellEditable } from '../utils/permissions';
import {
  applyClipboardMatrixToRows,
  buildClipboardCellEdits,
  filterClipboardColumns,
  formatClipboardCell,
  joinTsvLines,
  joinTsvRow,
  parseClipboardText,
  type PasteSkip,
  resolvePasteColumnIndexes,
  serializeSelectionToTsv,
  writeTextToClipboard,
} from '../utils/clipboard';
import type { ServerSideCellEditInput } from '../logic/serverSideEdits';
import type { ValidationLocaleText } from '../logic/validation';
import { findFirstPasteRow, resolvePasteTargetViewIndexes } from '../logic/labelRows';
import { expandPasteMatrixToSelection } from '../logic/pasteFill';
import { isEditingAtEvent, readLiveUiState } from './liveUiState';

export type ClipboardEventLike = {
  clipboardData: { getData: (type: string) => string } | null;
  preventDefault: () => void;
  // 追加(audit RD-2): 発火元。エディタ input / renderCell 内の入力要素からの paste はグリッドが扱わない。
  target?: EventTarget | null;
};

export type ClipboardControllerArgs<T extends object> = {
  rows: T[];
  rowModel: RowModel<T>;
  // 追加(audit L-01): consumer が渡した列定義そのもの(論理順・非表示列込み・合成列なし)。列あふれ
  //   貼り付けの onColumnsChange はこれに overflow 列を足して返す(visibleColumns は視覚順 + 合成列の
  //   書き込み用で、そのまま返すと非表示列が消え合成列が混入する)。未指定なら従来どおり visibleColumns 基準。
  columns?: readonly GridColumn<T>[];
  visibleColumns: GridColumn<T>[];
  uiState: GridUiState;
  // 追加(Solid 版 段階 0-1): イベントの時点の状態(store の getState。controllers/liveUiState)。省略は uiState。
  getUiState?: (() => GridUiState) | undefined;
  readOnly: boolean;
  canEditCell: SpreadsheetGridProps<T>['canEditCell'];
  // 追加(audit RD-4): 貼り付けで末尾へ追加した行の rowKey(canEditCell の context)を求めるための行キー解決。
  //   未指定なら元 rows の index(rowKeyGetter 未指定時の既定と同じ)。
  rowKeyGetter?: (row: T, sourceIndex: number) => GridRowKey;
  createRow?: () => T;
  createOverflowColumn?: (columnIndex: number) => GridColumn<T>;
  onRowsChange?: (nextRows: T[]) => void;
  onColumnsChange?: (nextColumns: GridColumn<T>[]) => void;
  applyServerSideCellEdits?: (edits: ServerSideCellEditInput<T>[]) => number;
  isRowExportable?: SpreadsheetGridProps<T>['isRowExportable'];
  dispatch: (action: GridUiAction) => void;
  // 追加(1.1.0 / 2026-11-09 実アプリの総点検 AP-09): 貼り付けで書かなかったセルの通知(1 回の貼り付けで 1 回。無ければ
  //   呼ばない)と、そのメッセージの文言(localeText。省略は日本語の既定)。
  onPasteSkipped?: SpreadsheetGridProps<T>['onPasteSkipped'];
  localeTexts?: ValidationLocaleText;
  // 追加(1.2.0 / 2026-11-09 実アプリの総点検 A-08): 範囲を選んで貼ったとき、コピーが範囲を割り切れれば範囲いっぱいに
  //   繰り返すか(既定 true = Excel と同じ。false で 1.1 までと同じく範囲の左上から 1 回だけ)。
  pasteFillsSelection?: boolean;
  // 追加(motion-4 / M-3): コピーが成功したとき(クリップボードへ書けたとき)に、コピー元の選択を通知します。
  //   シェルはこれで view スライスの copiedRange(動く点線)を立てます。
  onCopied?: (selection: NonNullable<GridSelection>) => void;
};

export type ClipboardController<T extends object> = {
  update: (args: ClipboardControllerArgs<T>) => void;
  handleCopy: () => Promise<void>;
  handlePaste: (event: ClipboardEventLike) => void;
};

// セル範囲選択が「グリッド全体」を覆っているか(行 0..last × 列 0..last)。
export const computeIsWholeGridSelected = (
  selection: GridSelection,
  viewRowCount: number,
  columnCount: number,
): boolean => {
  if (viewRowCount === 0 || columnCount === 0 || selection?.type !== 'cell') {
    return false;
  }
  const { start, end } = selection.range;
  const startRow = Math.min(start.row, end.row);
  const startCol = Math.min(start.col, end.col);
  const endRow = Math.max(start.row, end.row);
  const endCol = Math.max(start.col, end.col);
  return (
    startRow === 0 &&
    startCol === 0 &&
    endRow === viewRowCount - 1 &&
    endCol === columnCount - 1
  );
};

// 追加(1.0.1 / 実アプリの総点検 AP-02): 貼り付けの起点です。範囲を選んでいるときは範囲の左上(Excel と同じ)。
//   従来はいつもアクティブセルから貼っていたため、Shift+↓ で選んだ範囲(アクティブセルが範囲の下端へ動く)では範囲の
//   下から、列見出しで選んだ列では前のアクティブ行から貼られ、範囲の外へ書き込んでいました。列の選択は先頭の行、行の
//   選択は先頭の列(合成列は resolvePasteColumnIndexes が飛ばす)から。アクティブセルが範囲の外にあるときは従来どおり。
export const resolvePasteAnchor = (selection: GridSelection, activeCell: CellCoord): CellCoord => {
  if (selection?.type === 'cell') {
    const range = normalizeCellRange(selection.range);
    const inside =
      activeCell.row >= range.start.row &&
      activeCell.row <= range.end.row &&
      activeCell.col >= range.start.col &&
      activeCell.col <= range.end.col;
    return inside ? range.start : activeCell;
  }
  if (selection?.type === 'col') {
    return { row: 0, col: Math.min(selection.startCol, selection.endCol) };
  }
  if (selection?.type === 'row') {
    return { row: Math.min(selection.startRow, selection.endRow), col: 0 };
  }
  return activeCell;
};

// 追加(1.1.0 / AP-09): 書かなかったセル 1 つぶんの知らせを、onPasteSkipped の形へ直します。
// 追加(1.2.0 の見直し QG-2): 選んだ範囲(セル範囲 / 行選択)に、まだ読み込んでいない行(serverSide のブロック)があるか。
const selectionHasUnloadedRows = <T,>(selection: GridSelection, rowModel: RowModel<T>): boolean => {
  let from: number;
  let to: number;
  if (selection?.type === 'cell') {
    from = Math.min(selection.range.start.row, selection.range.end.row);
    to = Math.max(selection.range.start.row, selection.range.end.row);
  } else if (selection?.type === 'row') {
    from = Math.min(selection.startRow, selection.endRow);
    to = Math.max(selection.startRow, selection.endRow);
  } else {
    return false;
  }
  to = Math.min(to, rowModel.getRowCount() - 1);
  for (let row = Math.max(from, 0); row <= to; row += 1) {
    if (rowModel.getRow(row) == null && rowModel.getLabelRow?.(row) === undefined) {
      return true;
    }
  }
  return false;
};

const toSkippedCell = <T,>(skip: PasteSkip<T>, rowIndex: number, rowKey: GridRowKey): GridPasteSkippedCell<T> => {
  const cell: GridPasteSkippedCell<T> = {
    row: skip.row,
    rowKey,
    rowIndex,
    columnKey: skip.column.key,
    colIndex: skip.colIndex,
    text: skip.text,
    reason: skip.reason,
  };
  if (skip.reason === 'invalid') {
    cell.value = skip.value;
    cell.message = skip.message;
  }
  return cell;
};

export const createClipboardController = <T extends object>(): ClipboardController<T> => {
  let args: ClipboardControllerArgs<T> | null = null;

  const update = (next: ClipboardControllerArgs<T>) => {
    args = next;
  };

  // isRowExportable の行フィルタ(コピー / エクスポート対象行の判定)。
  const rowIncludedFilter = (
    current: ClipboardControllerArgs<T>,
  ): ((row: T, viewRowIndex: number) => boolean) | undefined => {
    const { isRowExportable, rowModel } = current;
    if (!isRowExportable) {
      return undefined;
    }
    return (row, viewRowIndex) =>
      isRowExportable(row, {
        viewRowIndex,
        rowKey: rowModel.getRowKey(viewRowIndex) ?? viewRowIndex,
      });
  };

  const serializeWholeGridToTsv = (current: ClipboardControllerArgs<T>): string => {
    const { rowModel } = current;
    // 変更(FC-03): 合成列(行ドラッグハンドル / 展開トグル / 自動グループ列)は出しません。
    const copyColumns = filterClipboardColumns(current.visibleColumns);
    const rowCount = rowModel.getRowCount();
    if (rowCount === 0 || copyColumns.length === 0) {
      return '';
    }
    const isRowIncluded = rowIncludedFilter(current);
    const lines: string[] = [];
    for (let viewIndex = 0; viewIndex < rowCount; viewIndex += 1) {
      const row = rowModel.getRow(viewIndex);
      if (!row) {
        continue;
      }
      if (isRowIncluded && !isRowIncluded(row, viewIndex)) {
        continue;
      }
      lines.push(joinTsvRow(copyColumns.map((column) => formatClipboardCell(row, column))));
    }
    // 変更(1.0.2 / レビュー QA-10): 範囲のコピーと同じく、最後の行がすべて空なら末尾に改行を足します(RV-C1。1 列の表で
    //   全体を選んでコピーすると、貼り付けで最後の空の行が消えていた)。
    return joinTsvLines(lines);
  };

  const handleCopy = async () => {
    if (args === null) {
      return;
    }
    const current = args;
    const { rowModel, visibleColumns } = current;
    // 変更(Solid 版 段階 0-1): 状態はイベントの時点の store から読みます(getUiState が無いときは update で受けた値)。
    const uiState = readLiveUiState(current);
    // 変更(1.3.0 / Solid 版の品質の段 2 S9-02): 範囲の選択が無いとき(1 セルを選んで Escape を押した後など。見た目は
    //   1 セルを選んでいるときと同じ)は、アクティブセルの 1 セルをコピーします(これまでは何もコピーせず、Delete だけ効いた)。
    const selection: GridSelection =
      uiState.selection ??
      (uiState.activeCell ? { type: 'cell', range: { start: uiState.activeCell, end: uiState.activeCell } } : null);
    const wholeGrid = computeIsWholeGridSelected(
      selection,
      rowModel.getRowCount(),
      visibleColumns.length,
    );
    const text = wholeGrid
      ? serializeWholeGridToTsv(current)
      : serializeSelectionToTsv(
          rowModel.getRow,
          rowModel.getRowCount(),
          visibleColumns,
          selection,
          rowIncludedFilter(current),
        );
    if (!text) {
      return;
    }
    const written = await writeTextToClipboard(text);
    if (written && selection) {
      current.onCopied?.(selection);
    }
  };

  const handlePaste = (event: ClipboardEventLike) => {
    if (args === null) {
      return;
    }
    const {
      rows,
      rowModel,
      columns,
      visibleColumns,
      readOnly,
      canEditCell,
      rowKeyGetter,
      createRow,
      createOverflowColumn,
      onRowsChange,
      onColumnsChange,
      applyServerSideCellEdits,
      onPasteSkipped,
      localeTexts,
      pasteFillsSelection = true,
      dispatch,
    } = args;
    const uiState = readLiveUiState(args);
    // 追加(audit RD-2): セル編集中、またはエディタ / renderCell / renderHeader 内の入力要素が発火元の
    //   paste はその要素のネイティブ貼り付けに委ねます(keydown 側の editingCell ガードと同じ扱い。
    //   従来はここで preventDefault + セル範囲貼り付けが走り、input には貼り付かず rows が直接
    //   書き換わっていました)。
    //   変更(Solid 版 段階 0-1 の見直し): 編集中かは描いた時点か今のどちらか(controllers/liveUiState)。
    if (isEditingAtEvent(args) || shouldIgnoreGridKeydown(event.target ?? null)) {
      return;
    }
    if (
      readOnly ||
      (!onRowsChange && !applyServerSideCellEdits) ||
      !uiState.activeCell
    ) {
      return;
    }

    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) {
      return;
    }

    event.preventDefault();

    const parsedMatrix = parseClipboardText(text);
    if (parsedMatrix.length === 0) {
      return;
    }
    // 追加(1.2.0 / A-08): 1 セル(と、範囲がコピーの大きさの倍数)のコピーは選んだ範囲いっぱいに繰り返します(Excel と同じ)。
    //   起点は今までどおり範囲の左上で、繰り返した文字はちょうど範囲のデータのセルに収まります(logic/pasteFill)。
    const expandedMatrix = pasteFillsSelection
      ? expandPasteMatrixToSelection(parsedMatrix, uiState.selection, uiState.activeCell, rowModel, visibleColumns)
      : null;
    // 変更(1.2.0 の見直し QG-2): serverSide で範囲にまだ読み込んでいない行があるときは埋めず、今までどおり 1 回だけ貼ります
    //   (読み込んだ行にだけ書くと、全選択して貼ったのに大半の行が書かれず、知らせも無かった)。
    const matrix =
      expandedMatrix !== null && applyServerSideCellEdits && selectionHasUnloadedRows(uiState.selection, rowModel)
        ? parsedMatrix
        : (expandedMatrix ?? parsedMatrix);
    // 追加(1.1.0 / AP-09): 書かなかったセル(通知があるときだけ集める)。書き込みと選択を済ませてから 1 回だけ知らせます。
    const skipped: GridPasteSkippedCell<T>[] | null = onPasteSkipped ? [] : null;
    // 変更(1.3.0 / Solid 版の品質の段 2 S9-04): 編集できないセルへ貼った空の文字は数えません(Excel の範囲の空のセルが
    //   計算列などに重なると「書かなかった」に入り、利用者から見て書かれなかったデータより多い件数になっていた)。
    const notifySkipped = () => {
      const cells = skipped?.filter((cell) => !(cell.reason === 'readOnly' && cell.text === ''));
      if (cells !== undefined && cells.length > 0) {
        onPasteSkipped?.({ cells });
      }
    };

    const maxPasteWidth = matrix.reduce(
      (max, currentRow) => Math.max(max, currentRow.length),
      0,
    );
    if (maxPasteWidth === 0) {
      return;
    }

    const pasteAnchor = resolvePasteAnchor(uiState.selection, uiState.activeCell);
    // 起点の行は先頭のデータ行から(先頭がラベル行・グループ行なら次のデータ行)、列は合成列でない最初の列から。
    // 変更(1.0.1 のレビュー RA-2): 範囲の選択(全選択を含む)の左上にも当てます。左上がラベル行 / グループ行だと貼り付けが
    //   何もせず、全選択 / 行の選択の後はアクティブセルが合成列(行ドラッグの掴み手など)に乗っていた。
    const anchor = {
      row: findFirstPasteRow(rowModel, pasteAnchor.row),
      col: resolvePasteColumnIndexes(visibleColumns, pasteAnchor.col, 1)[0] ?? pasteAnchor.col,
    };
    const startFilteredRowIndex = anchor.row;
    const startColIndexForEdits = anchor.col;
    // 追加(FC-03): 貼り付けの最後の列。合成列は 1 列と数えないので、範囲の右端は合成列を飛ばした位置です。
    const pasteColumnIndexes = resolvePasteColumnIndexes(visibleColumns, startColIndexForEdits, maxPasteWidth);
    const lastPasteColIndex = pasteColumnIndexes[pasteColumnIndexes.length - 1] ?? startColIndexForEdits;
    // 追加(label-row ③): ラベル行(getLabelRow)を読み飛ばした貼り付け先の view index 列です。ラベル行が
    //   無ければ startRow からの連番(= 従来どおり)。行オフセット k の行は pasteTargets[k]。
    // 変更(AP-04): グループ行も読み飛ばします(ラベル行と同じ)。
    const hasSkippedRows = rowModel.getLabelRow !== undefined || rowModel.getGroupRow !== undefined;
    const pasteTargets = hasSkippedRows
      ? resolvePasteTargetViewIndexes(rowModel, startFilteredRowIndex, matrix.length)
      : null;
    const targetViewIndex = (viewIndex: number): number =>
      pasteTargets ? pasteTargets[viewIndex - startFilteredRowIndex] : viewIndex;
    const lastTargetViewIndex = pasteTargets
      ? pasteTargets[pasteTargets.length - 1]
      : anchor.row + Math.max(matrix.length - 1, 0);

    if (applyServerSideCellEdits) {
      const edits = buildClipboardCellEdits(
        (viewIndex) => rowModel.getRow(targetViewIndex(viewIndex)),
        visibleColumns,
        matrix,
        startFilteredRowIndex,
        startColIndexForEdits,
        (viewIndex, colIndex, row, column) =>
          isViewCellEditable({ readOnly, canEditCell }, rowModel, targetViewIndex(viewIndex), colIndex, row, column),
        skipped
          ? (skip) => {
              const viewIndex = targetViewIndex(skip.rowIndex);
              skipped.push(toSkippedCell(skip, viewIndex, rowModel.getRowKey(viewIndex) ?? viewIndex));
            }
          : undefined,
        localeTexts,
      ).map((edit) => ({ ...edit, viewIndex: targetViewIndex(edit.viewIndex) }));
      if (edits.length > 0) {
        applyServerSideCellEdits(edits);
      }
      const serverSideEndRow = clamp(
        lastTargetViewIndex,
        0,
        Math.max(rowModel.getRowCount() - 1, 0),
      );
      const serverSideEndCol = clamp(
        lastPasteColIndex,
        0,
        Math.max(visibleColumns.length - 1, 0),
      );
      dispatch(gridActions.startSelection(anchor));
      dispatch(
        gridActions.updateSelection({ row: serverSideEndRow, col: serverSideEndCol }),
      );
      dispatch(gridActions.endSelection());
      dispatch(gridActions.activateCell(anchor));
      // 変更(1.1.0 / AP-09 の見直し): clientSide と同じく、書き込みと選択を済ませてから知らせます(通知の中で選択を変えても
      //   上書きされない)。
      notifySkipped();
      return;
    }
    if (!onRowsChange) {
      return;
    }

    const startOriginalRowIndex = rowModel.getSourceIndex(startFilteredRowIndex);
    if (startOriginalRowIndex === undefined) {
      return;
    }
    const startColIndex = anchor.col;

    const workingRows = [...rows];
    const workingColumns = [...visibleColumns];
    const viewRowCountForPaste = rowModel.getRowCount();
    const appendBaseSource = workingRows.length;
    // view index → source index(ペーストで行が増える分は末尾へ追記した source index を割り当て)。
    // 変更(label-row ③): ラベル行を読み飛ばした貼り付け先(targetViewIndex)で解決します。
    const resolveSourceIndex = (viewIndex: number): number | undefined => {
      const target = targetViewIndex(viewIndex);
      return target < viewRowCountForPaste
        ? rowModel.getSourceIndex(target)
        : appendBaseSource + (target - viewRowCountForPaste);
    };

    // 末尾追記が要る行数: 貼り付け先のうち view 行数を超えるぶん。
    // 変更(audit L-05): 旧式 `startOriginalRowIndex + matrix.length` は view = source(恒等 order)を
    //   前提にしており、ソート / フィルター中は view 末尾を超えた行が追記されず静かに捨てられていた。
    //   ラベル行経路と同じ「view 行数を超えたぶんを末尾へ追記」に統一する(恒等 order では同値)。
    const appendCount = Math.max(lastTargetViewIndex + 1 - viewRowCountForPaste, 0);
    const requiredOriginalRowCount = workingRows.length + appendCount;
    if (requiredOriginalRowCount > workingRows.length && createRow) {
      while (workingRows.length < requiredOriginalRowCount) {
        workingRows.push(createRow());
      }
    }

    const requiredColumnCount = lastPasteColIndex + 1;
    // 変更(1.3.0 / S1-03): 足した列(overflow 列)は、セルを書いたときだけ onColumnsChange で返します(下)。
    const overflowColumns: GridColumn<T>[] = [];
    if (requiredColumnCount > workingColumns.length) {
      if (onColumnsChange && createOverflowColumn) {
        // 変更(audit L-01): overflow 列は書き込み用の workingColumns(視覚順 + 合成列)と、consumer へ
        //   返す列定義の両方へ足す。返すのは consumer の columns(論理順・非表示列込み)+ overflow 列で、
        //   旧実装のように視覚順の可視列 + 合成列を返して非表示列を消したり合成列を混入させない。
        while (workingColumns.length < requiredColumnCount) {
          const overflowColumn = createOverflowColumn(workingColumns.length);
          workingColumns.push(overflowColumn);
          overflowColumns.push(overflowColumn);
        }
      }
    }

    // 貼り付け先の行キー(末尾へ足す行は rowKeyGetter か rows の index)。
    const pasteRowKey = (viewIndex: number, row: T, originalRowIndex: number): GridRowKey =>
      (viewIndex < viewRowCountForPaste
        ? rowModel.getRowKey(viewIndex)
        : (rowKeyGetter?.(row, originalRowIndex) ?? originalRowIndex)) ?? originalRowIndex;

    const nextRows = applyClipboardMatrixToRows(
      workingRows,
      resolveSourceIndex,
      workingColumns,
      matrix,
      startFilteredRowIndex,
      startColIndex,
      // 変更(audit RD-4): canEditCell の rowIndex はビュー行 index(表示 / 編集開始と同じ)。末尾へ追加される行は
      //   追加後の位置(view 行数以降)と、元 rows の index / rowKeyGetter の値を渡します。
      (originalRowIndex, colIndex, row, column, filteredRowIndex) => {
        const viewIndex = targetViewIndex(filteredRowIndex);
        return isCellEditable({ readOnly, canEditCell }, viewIndex, colIndex, row, column, {
          sourceRowIndex: originalRowIndex,
          rowKey: pasteRowKey(viewIndex, row, originalRowIndex),
        });
      },
      skipped
        ? (skip) => {
            const viewIndex = targetViewIndex(skip.rowIndex);
            const sourceIndex = skip.sourceRowIndex ?? viewIndex;
            skipped.push(toSkippedCell(skip, viewIndex, pasteRowKey(viewIndex, skip.row, sourceIndex)));
          }
        : undefined,
      localeTexts,
    );

    // 変更(1.0.2 / 2026-11-09 実アプリの総点検 C-02): 選択範囲は実際に書いた範囲まで。行を足せない(createRow が無い)・列を
    //   足せない(createOverflowColumn が無い)ときに、表の外へはみ出した範囲(無い行 / 列)を選んでいた。
    // 変更(1.3.0 / S1-03): 1 つのセルも書かなかった(書けるセルが無い)ときは、行も列も足さず onRowsChange も呼びません
    //   (履歴も積まない。Delete キーと同じ)。足さなかった行 / 列のセルは表の外なので、書かなかったセルにも数えません。
    //   表の中の書かなかったセルの知らせ(onPasteSkipped)と選択の移動はいつもどおり。
    const wrote = nextRows !== workingRows;
    if (!wrote && skipped !== null) {
      const inside = skipped.filter(
        (cell) => cell.rowIndex < viewRowCountForPaste && cell.colIndex < visibleColumns.length,
      );
      skipped.length = 0;
      skipped.push(...inside);
    }
    const endRow = clamp(
      lastTargetViewIndex,
      0,
      Math.max(wrote && workingRows.length > rows.length ? lastTargetViewIndex : viewRowCountForPaste - 1, 0),
    );
    // 修正(audit C-12): 選択範囲の幅は serverSide 経路と同じく最も長い行の幅にします(先頭行が他の行より短い TSV
    //   (`a\nb\tc` 等)で、実際に貼り付けた範囲より狭くなっていた)。
    const endCol = clamp(lastPasteColIndex, 0, Math.max((wrote ? workingColumns : visibleColumns).length - 1, 0));

    if (wrote) {
      if (overflowColumns.length > 0) {
        onColumnsChange?.(columns ? [...columns, ...overflowColumns] : workingColumns);
      }
      onRowsChange(nextRows);
    }
    dispatch(gridActions.startSelection(anchor));
    dispatch(gridActions.updateSelection({ row: endRow, col: endCol }));
    dispatch(gridActions.endSelection());
    dispatch(gridActions.activateCell(anchor));
    notifySkipped();
  };

  return { update, handleCopy, handlePaste };
};