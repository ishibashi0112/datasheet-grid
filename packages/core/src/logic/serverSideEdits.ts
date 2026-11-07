// SSRM セル編集書き戻し(dataSource.updateRows)の純粋ロジックです(React 非依存)。
//
// 役割と設計(SSRM 書き戻しの急所):
//   - createServerSidePendingEdits: 確定前(updateRows の in-flight 中)の楽観行を viewIndex で
//     保持するオーバーレイです。rowModel.getRow はキャッシュより先にここを引くため、書き込み中に
//     ブロック再取得・LRU 退避が起きても楽観値の表示が消えません(キャッシュは常に「最後に確定した
//     値」だけを持つ、が不変条件)。成功でキャッシュへ確定書き込みした後に外し、失敗ではそのまま
//     外してロールバック(=最後の確定値へ復帰)します。
//   - 同一行への連続編集は writeId(単調増加する世代)と、書き込みごとのセルの変更で管理します。overlay を外すのは
//     その行の保存中の書き込みがすべて決着したときです。古い書き込みの遅延到着(成功/失敗どちらでも)が、後から乗った
//     新しい楽観値を巻き戻さないよう、確定値はセルごとに「どの書き込みで確定したか」を見て進めます(FC-04 / FC-05)。
//   - buildServerSideRowUpdates: セル単位の編集集合を行単位の ServerSideRowUpdate へ集約します
//     (1 ユーザー操作 = 1 updateRows 呼び出しの契約。ペーストの複数セルも行ごとに 1 エントリ)。
//
// viewIndex キーの前提: オーバーレイの寿命は「同一クエリ(ソート/フィルター不変)の間」だけです。
//   クエリ変化・refresh ではフック側が clear() を呼び、in-flight の結果も世代(epoch)で捨てるため、
//   view 空間の行対応がずれたまま書き込まれることはありません。
import type { GridColumn, GridRowKey, ServerSideRowUpdate } from '../model/gridTypes.unbound';
import { getCellValue, setCellValue } from '../utils/permissions';

// 書き戻し 1 件ぶんのセル編集入力です(value はパース済みのドメイン値)。
export type ServerSideCellEditInput<T> = {
  viewIndex: number;
  column: GridColumn<T>;
  value: unknown;
};

// 追加(1.0 前の最終チェック FC-04 / FC-05): 書き込み 1 件の中のセルの変更(楽観行を作った変更)。
export type ServerSidePendingChange<T> = {
  column: GridColumn<T>;
  value: unknown;
};

// 追加(FC-04 / FC-05): 書き込みの結果。成功ならサーバーが返した確定行(ServerSideUpdateRowsResult.rows の該当行)を添えられます。
export type ServerSideWriteResult<T> = { ok: true; serverRow?: T } | { ok: false };

// 追加(FC-04 / FC-05): 決着の処理の結果。
export type ServerSideWriteSettlement<T> = {
  // キャッシュ(最後に確定した値)へ書く行。undefined なら書かない(失敗 / キャッシュから行が退避済み)。
  confirmedRow: T | undefined;
  // この書き込みの変更のうち、同じセルを変える新しい書き込みが保存中でない列(保存状態の印を ok / failed にしてよい列)。
  settledColumnKeys: string[];
};

export type ServerSidePendingEdits<T> = {
  // viewIndex の楽観行を返します(pending が無ければ undefined = キャッシュへフォールバック)。
  getRow: (viewIndex: number) => T | undefined;
  // 楽観行を登録し、この書き込みを識別する writeId を返します。changes はこの書き込みのセルの変更です。
  beginWrite: (viewIndex: number, row: T, changes?: ServerSidePendingChange<T>[]) => number;
  // writeId がその行の最新かを返します。
  isLatestWrite: (viewIndex: number, writeId: number) => boolean;
  // 書き込みの決着です。confirmedBase はキャッシュの今の行(最後に確定した値)。
  //   変更(FC-04 / FC-05): 書き込みごとに変更を持ち、確定値は「変更のぶんだけ」進めます(楽観行をまるごと書くと、同じ行の
  //   新しい書き込みが先に成功したあとで古い書き込みの成功が届いたとき、新しい値が巻き戻っていた)。同じセルに新しい書き込みが
  //   先に確定していれば、古い書き込みはそのセルを書きません。失敗した書き込みの変更は確定値に入らず、まだ保存中の書き込みが
  //   あれば表示は「確定値 + 残りの保存中の変更」に作り直します(古い書き込みが失敗しても、新しい書き込みの楽観行に入っていた
  //   失敗した値が残っていた)。もう決着した / clear 後の writeId は何もしません。
  settleWrite: (
    viewIndex: number,
    writeId: number,
    result: ServerSideWriteResult<T>,
    confirmedBase: T | undefined,
  ) => ServerSideWriteSettlement<T>;
  // 全 pending を破棄します(unmount。取り直し(クエリ変化 / refresh)では捨てずに新しく作り直す = dogfood DF-07)。
  clear: () => void;
  // pending 行数です(テスト・デバッグ用)。
  pendingCount: () => number;
};

export const createServerSidePendingEdits = <T,>(): ServerSidePendingEdits<T> => {
  type PendingWrite = { writeId: number; changes: ServerSidePendingChange<T>[] };
  type Entry = {
    // 保存中の書き込み(writeId の昇順)。
    writes: PendingWrite[];
    // 表示する楽観行。
    display: T;
    // この行で確定したセル(列キー → 確定させた書き込み)。保存中の書き込みがある間だけ持ちます。
    confirmed: Map<string, { writeId: number; column: GridColumn<T> }>;
  };
  const entries = new Map<number, Entry>();
  let nextWriteId = 1;

  const getRow = (viewIndex: number): T | undefined => entries.get(viewIndex)?.display;

  const beginWrite = (viewIndex: number, row: T, changes: ServerSidePendingChange<T>[] = []): number => {
    const writeId = nextWriteId;
    nextWriteId += 1;
    const entry = entries.get(viewIndex);
    if (entry) {
      entry.writes.push({ writeId, changes });
      entry.display = row;
    } else {
      entries.set(viewIndex, { writes: [{ writeId, changes }], display: row, confirmed: new Map() });
    }
    return writeId;
  };

  const isLatestWrite = (viewIndex: number, writeId: number): boolean => {
    const writes = entries.get(viewIndex)?.writes;
    return writes !== undefined && writes.length > 0 && writes[writes.length - 1].writeId === writeId;
  };

  const settleWrite = (
    viewIndex: number,
    writeId: number,
    result: ServerSideWriteResult<T>,
    confirmedBase: T | undefined,
  ): ServerSideWriteSettlement<T> => {
    const entry = entries.get(viewIndex);
    const index = entry ? entry.writes.findIndex((write) => write.writeId === writeId) : -1;
    if (!entry || index < 0) {
      return { confirmedRow: undefined, settledColumnKeys: [] };
    }
    const [write] = entry.writes.splice(index, 1);
    const confirmedLater = (columnKey: string): boolean =>
      (entry.confirmed.get(columnKey)?.writeId ?? 0) > writeId;
    let confirmedRow: T | undefined;
    if (result.ok) {
      if (result.serverRow !== undefined) {
        // サーバーの確定行を使い、この書き込みより新しい書き込みが先に確定させたセルだけは今の確定値を残します。
        let next: T = result.serverRow;
        if (confirmedBase !== undefined) {
          for (const cell of entry.confirmed.values()) {
            if (cell.writeId > writeId) {
              next = setCellValue(next, cell.column, getCellValue(confirmedBase, cell.column));
            }
          }
        }
        confirmedRow = next;
      } else if (confirmedBase !== undefined) {
        let next: T = confirmedBase;
        for (const change of write.changes) {
          if (!confirmedLater(change.column.key)) {
            next = setCellValue(next, change.column, change.value);
          }
        }
        confirmedRow = next;
      }
      for (const change of write.changes) {
        if (!confirmedLater(change.column.key)) {
          entry.confirmed.set(change.column.key, { writeId, column: change.column });
        }
      }
    }
    // 変更(FC-05 の見直し): 同じセルの新しい書き込みが保存中のときだけでなく、先に確定していたときも印を付けません(新しい
    //   書き込みの成功の後に古い書き込みが失敗すると、値は新しいままなのに「失敗・値を戻しました」の印が出ていた)。
    const settledColumnKeys = Array.from(new Set(write.changes.map((change) => change.column.key))).filter(
      (columnKey) =>
        !confirmedLater(columnKey) &&
        !entry.writes.some(
          (pending) => pending.writeId > writeId && pending.changes.some((change) => change.column.key === columnKey),
        ),
    );
    if (entry.writes.length === 0) {
      entries.delete(viewIndex);
    } else {
      // 残りの保存中の変更を確定値に当て直します(確定値が分からない = キャッシュから退避済みなら表示は据え置き)。
      const base = confirmedRow ?? confirmedBase;
      if (base !== undefined) {
        let display: T = base;
        for (const pending of entry.writes) {
          for (const change of pending.changes) {
            if ((entry.confirmed.get(change.column.key)?.writeId ?? 0) < pending.writeId) {
              display = setCellValue(display, change.column, change.value);
            }
          }
        }
        entry.display = display;
      }
    }
    return { confirmedRow, settledColumnKeys };
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