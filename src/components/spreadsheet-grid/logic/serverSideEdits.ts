// SSRM セル編集書き戻し(dataSource.updateRows)の純粋ロジックです(React 非依存)。
//
// 役割と設計(SSRM 書き戻しの急所):
//   - createServerSidePendingEdits: 確定前(updateRows の in-flight 中)の楽観行を viewIndex で
//     保持するオーバーレイです。rowModel.getRow はキャッシュより先にここを引くため、書き込み中に
//     ブロック再取得・LRU 退避が起きても楽観値の表示が消えません(キャッシュは常に「最後に確定した
//     値」だけを持つ、が不変条件)。成功でキャッシュへ確定書き込みした後に外し、失敗ではそのまま
//     外してロールバック(=最後の確定値へ復帰)します。
//   - 同一行への連続編集は writeId(行ごとに単調増加する世代)で管理します。overlay を外せるのは
//     「その行の最新 writeId の settle」だけです。古い書き込みの遅延到着(成功/失敗どちらでも)が、
//     後から乗った新しい楽観値を巻き戻さないための世代ガードです。
//   - buildServerSideRowUpdates: セル単位の編集集合を行単位の ServerSideRowUpdate へ集約します
//     (1 ユーザー操作 = 1 updateRows 呼び出しの契約。ペーストの複数セルも行ごとに 1 エントリ)。
//
// viewIndex キーの前提: オーバーレイの寿命は「同一クエリ(ソート/フィルター不変)の間」だけです。
//   クエリ変化・refresh ではフック側が clear() を呼び、in-flight の結果も世代(epoch)で捨てるため、
//   view 空間の行対応がずれたまま書き込まれることはありません。
import type { GridColumn, GridRowKey, ServerSideRowUpdate } from '../model/gridTypes';
import { getCellValue, setCellValue } from '../utils/permissions';

// 書き戻し 1 件ぶんのセル編集入力です(value はパース済みのドメイン値)。
export type ServerSideCellEditInput<T> = {
  viewIndex: number;
  column: GridColumn<T>;
  value: unknown;
};

export type ServerSidePendingEdits<T> = {
  // viewIndex の楽観行を返します(pending が無ければ undefined = キャッシュへフォールバック)。
  getRow: (viewIndex: number) => T | undefined;
  // 楽観行を登録/置換し、この書き込みを識別する writeId を返します。
  beginWrite: (viewIndex: number, row: T) => number;
  // writeId がその行の最新かを返します(settle 時の世代ガード)。
  isLatestWrite: (viewIndex: number, writeId: number) => boolean;
  // 書き込みの決着です。writeId が最新のときだけ overlay を外します(確定・ロールバック共通:
  //   確定は直前にキャッシュへ書き込み済み、ロールバックは外すだけで最後の確定値が現れます)。
  //   古い writeId は no-op(新しい pending が表示を支配し続けます)。
  settleWrite: (viewIndex: number, writeId: number) => void;
  // 全 pending を破棄します(クエリ変化 / refresh / unmount)。
  clear: () => void;
  // pending 行数です(テスト・デバッグ用)。
  pendingCount: () => number;
};

export const createServerSidePendingEdits = <T,>(): ServerSidePendingEdits<T> => {
  const entries = new Map<number, { row: T; writeId: number }>();
  let nextWriteId = 1;

  const getRow = (viewIndex: number): T | undefined =>
    entries.get(viewIndex)?.row;

  const beginWrite = (viewIndex: number, row: T): number => {
    const writeId = nextWriteId;
    nextWriteId += 1;
    entries.set(viewIndex, { row, writeId });
    return writeId;
  };

  const isLatestWrite = (viewIndex: number, writeId: number): boolean =>
    entries.get(viewIndex)?.writeId === writeId;

  const settleWrite = (viewIndex: number, writeId: number): void => {
    if (isLatestWrite(viewIndex, writeId)) {
      entries.delete(viewIndex);
    }
  };

  const clear = (): void => {
    entries.clear();
  };

  const pendingCount = (): number => entries.size;

  return { getRow, beginWrite, isLatestWrite, settleWrite, clear, pendingCount };
};

// セル編集の集合を行単位の ServerSideRowUpdate へ集約します(初出順を保持)。
//   - getBaseRow が undefined を返す行(未ロード = スケルトン)はスキップします。
//     base には「いま表示されている行」(pending 楽観値 ?? キャッシュ確定値)を渡してください。
//     previousRow / changes.previousValue はこの base 基準になります。
//   - 同一行への複数編集は setCellValue を順に畳み込み、changes に 1 セル 1 エントリで積みます。
export const buildServerSideRowUpdates = <T,>(
  edits: ServerSideCellEditInput<T>[],
  getBaseRow: (viewIndex: number) => T | undefined,
  getRowKey: (row: T, viewIndex: number) => GridRowKey,
): ServerSideRowUpdate<T>[] => {
  const byRow = new Map<number, ServerSideRowUpdate<T>>();
  for (const edit of edits) {
    let update = byRow.get(edit.viewIndex);
    if (update === undefined) {
      const baseRow = getBaseRow(edit.viewIndex);
      if (baseRow === undefined) {
        continue;
      }
      update = {
        rowKey: getRowKey(baseRow, edit.viewIndex),
        rowIndex: edit.viewIndex,
        row: baseRow,
        previousRow: baseRow,
        changes: [],
      };
      byRow.set(edit.viewIndex, update);
    }
    update.changes.push({
      columnKey: edit.column.key,
      // 同一行の直前の編集を畳み込んだ後の値から読みます(同一セルの重複編集でも連鎖が正しく残る)。
      previousValue: getCellValue(update.row, edit.column),
      newValue: edit.value,
    });
    update.row = setCellValue(update.row, edit.column, edit.value);
  }
  return Array.from(byRow.values());
};