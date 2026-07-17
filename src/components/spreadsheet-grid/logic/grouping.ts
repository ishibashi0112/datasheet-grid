import type {
  GridAggFunc,
  GridAggFuncName,
  GridColumn,
  GridGroupRow,
  GridRowKey,
} from '../model/gridTypes';
import type { RowOrder } from './filtering';
import { getCellValue } from '../utils/permissions';
import {
  accumulateBuiltinAgg,
  createBuiltinAggAccumulator,
  finalizeBuiltinAgg,
  isBuiltinAggFuncName,
  type BuiltinAggAccumulator,
} from './aggregation';

// 追加(grouping ①): 行グルーピングの純ロジックです。パイプラインの sorted order を入力に、
//   2 段で表示リストを作ります(SpreadsheetGrid 側で別 useMemo に分かれる想定):
//     1. buildGroupTree   … order を 1 パスして「グループツリー + 集計」を構築します。
//        開閉状態に依存しないため、開閉操作では再計算されません(集計の再利用)。
//     2. flattenGroupTree … 開閉状態(collapsedGroupKeys)を適用して DFS 順の表示 order へ
//        展開します。開閉操作ではここだけが再実行されます。
//
//   表示 order のエンコード(GroupedDisplay.displayOrder):
//     - 値 >= 0 … leaf 行(値 = source index。既存 RowOrder と同じ意味)
//     - 値 <  0 … グループ行(-値 - 1 が GroupedDisplay.groups の index)
//   既存パイプラインの Int32Array(RowOrder)をそのまま流用するためのエンコードです。
//   判定は isGroupOrderValue / groupIndexOfOrderValue を使います。
//
//   規約:
//     - グループの並び順は「入力 order 上の初出順」です。グループ列でソートすれば
//       グループもその順に並びます(ソートとの合成を別途定義しない)。
//     - 同値 leaf が order 上で不連続でも 1 グループへ集約します(bucket ベース)。
//     - bucket は「型タグ + String(値)」の文字列です(encodeGroupBucket)。数値 1 と
//       文字列 '1' は別グループ、NaN 同士は同一グループ。オブジェクト値は文字列表現で
//       同一視します(参照ベースにしないのは、データ再取得(行オブジェクト再生成)を
//       またいで bucket と開閉キーを安定させるためです)。
//     - 空値(null / undefined / '')は 1 つの「(空白)」グループへ集約します
//       (value は null、label は GROUP_EMPTY_LABEL)。
//     - groupColumns は 1 本以上であること(0 本のときは呼び出し側がグルーピング自体を
//       バイパスする契約です。SpreadsheetGrid の stage 組み込み参照)。

// 空白グループの表示ラベルです。
export const GROUP_EMPTY_LABEL = '(空白)';

// グループ行キーの接頭辞です(leaf の GridRowKey と衝突しない React key / 行キー空間を作ります)。
export const GROUP_ROW_KEY_PREFIX = '__ssg-group__:';

// グループ行の行キーです(rowModel.getRowKey / React key 用)。
export const groupRowKey = (groupRow: GridGroupRow): GridRowKey =>
  GROUP_ROW_KEY_PREFIX + groupRow.groupKey;

// displayOrder の値がグループ行かを判定します。
export const isGroupOrderValue = (value: number): boolean => value < 0;

// displayOrder のグループ値を GroupedDisplay.groups の index へ復号します。
export const groupIndexOfOrderValue = (value: number): number => -value - 1;

// グループ値の bucket 文字列です(同一グループ判定のキー)。型タグは String() で衝突する
//   別型値(数値 1 と文字列 '1' 等)を別グループに保つためです。
const encodeGroupBucket = (raw: unknown): string => {
  if (raw == null || raw === '') {
    return 'e';
  }
  const type = typeof raw;
  const tag =
    type === 'number'
      ? 'n'
      : type === 'boolean'
        ? 'b'
        : type === 'string'
          ? 's'
          : 'o';
  return `${tag}:${String(raw)}`;
};

// 列定義から「グループ対象列(rowGroup、columns 出現順 = 階層順)」と「集計対象列(aggFunc)」を
//   取り出します。参照同一性は保証しないため、呼び出し側で useMemo するのは列 identity 基準です。
export const collectGroupingColumns = <T,>(
  columns: GridColumn<T>[],
): { groupColumns: GridColumn<T>[]; aggColumns: GridColumn<T>[] } => ({
  groupColumns: columns.filter((column) => column.rowGroup === true),
  aggColumns: columns.filter((column) => column.aggFunc != null),
});

// グループツリーのノードです。groupRow 以外は構築・確定用の実装詳細です(公開バレルには
//   出しません)。leafSourceIndexes は最下層ノードのみ非空です。
export type GroupTreeNode<T> = {
  groupRow: GridGroupRow;
  children: GroupTreeNode<T>[];
  childIndex: Map<string, GroupTreeNode<T>>;
  leafSourceIndexes: number[];
  accumulators: BuiltinAggAccumulator[];
  customValues: (unknown[] | null)[];
  customRows: T[];
};

export type GroupTree<T> = {
  roots: GroupTreeNode<T>[];
  groupCount: number;
};

// 開閉適用後の表示リストです(エンコード仕様はファイル冒頭コメント参照)。
export type GroupedDisplay = {
  displayOrder: RowOrder;
  // displayOrder の負値からの参照先です(表示順 = DFS 順)。
  groups: GridGroupRow[];
};

// グループツリーを構築し、集計値まで確定して返します。order を 1 パスし、各 leaf を
//   祖先ノードすべてへ加算します(O(行数 × 階層数 × 集計列数))。カスタム集計列があるときのみ
//   各ノードに values / rows を全量収集します(組み込みのみなら中間状態は O(1)/ノード)。
export const buildGroupTree = <T,>(
  rows: T[],
  order: RowOrder,
  groupColumns: GridColumn<T>[],
  aggColumns: GridColumn<T>[],
): GroupTree<T> => {
  const levelCount = groupColumns.length;
  const aggCount = aggColumns.length;
  // aggFunc の種別を先に解決します(関数 = カスタム / 組み込み名 / 不正文字列 = スキップ)。
  const customFlags = aggColumns.map(
    (column) => typeof column.aggFunc === 'function',
  );
  const hasCustom = customFlags.includes(true);

  const roots: GroupTreeNode<T>[] = [];
  const rootIndex = new Map<string, GroupTreeNode<T>>();
  let groupCount = 0;

  const createNode = (
    parentKey: string | null,
    column: GridColumn<T>,
    bucket: string,
    raw: unknown,
    level: number,
  ): GroupTreeNode<T> => {
    // 開閉キーの階層区切りは \u0000、列 key と bucket の区切りは \u0001 です
    //   (列 key に混入し得ない制御文字で、階層・列をまたぐ衝突を防ぎます)。
    const segment = `${column.key}\u0001${bucket}`;
    const isEmpty = bucket === 'e';
    groupCount += 1;
    return {
      groupRow: {
        kind: 'group',
        groupKey:
          parentKey === null ? segment : `${parentKey}\u0000${segment}`,
        columnKey: column.key,
        value: isEmpty ? null : raw,
        label: isEmpty ? GROUP_EMPTY_LABEL : String(raw),
        level,
        leafCount: 0,
        aggregates: {},
      },
      children: [],
      childIndex: new Map(),
      leafSourceIndexes: [],
      accumulators: aggColumns.map(() => createBuiltinAggAccumulator()),
      customValues: customFlags.map((isCustom) => (isCustom ? [] : null)),
      customRows: [],
    };
  };

  const orderLength = order.length;
  for (let pos = 0; pos < orderLength; pos += 1) {
    const sourceIndex = order[pos];
    const row = rows[sourceIndex];
    // 集計値は行ごとに 1 回だけ取り出し、全祖先ノードへ同じ値を加算します。
    let aggValues: unknown[] | null = null;
    if (aggCount > 0) {
      aggValues = new Array<unknown>(aggCount);
      for (let j = 0; j < aggCount; j += 1) {
        aggValues[j] = getCellValue(row, aggColumns[j]);
      }
    }

    let siblings = roots;
    let siblingIndex = rootIndex;
    let parentKey: string | null = null;
    for (let level = 0; level < levelCount; level += 1) {
      const column = groupColumns[level];
      const raw = getCellValue(row, column);
      const bucket = encodeGroupBucket(raw);
      let node = siblingIndex.get(bucket);
      if (!node) {
        node = createNode(parentKey, column, bucket, raw, level);
        siblings.push(node);
        siblingIndex.set(bucket, node);
      }
      node.groupRow.leafCount += 1;
      if (aggValues !== null) {
        for (let j = 0; j < aggCount; j += 1) {
          accumulateBuiltinAgg(node.accumulators[j], aggValues[j]);
          const customSlot = node.customValues[j];
          if (customSlot !== null) {
            customSlot.push(aggValues[j]);
          }
        }
        if (hasCustom) {
          node.customRows.push(row);
        }
      }
      if (level === levelCount - 1) {
        node.leafSourceIndexes.push(sourceIndex);
      }
      siblings = node.children;
      siblingIndex = node.childIndex;
      parentKey = node.groupRow.groupKey;
    }
  }

  // 集計の確定です(全ノード DFS)。不正な aggFunc 文字列は aggregates 未設定のまま残します
  //   (表示は空セル)。
  const finalizeNode = (node: GroupTreeNode<T>): void => {
    for (let j = 0; j < aggCount; j += 1) {
      const column = aggColumns[j];
      if (customFlags[j]) {
        node.groupRow.aggregates[column.key] = (
          column.aggFunc as GridAggFunc<T>
        )({
          values: node.customValues[j] ?? [],
          rows: node.customRows,
          column,
        });
      } else if (isBuiltinAggFuncName(column.aggFunc)) {
        node.groupRow.aggregates[column.key] = finalizeBuiltinAgg(
          column.aggFunc as GridAggFuncName,
          node.accumulators[j],
        );
      }
    }
    for (const child of node.children) {
      finalizeNode(child);
    }
  };
  for (const root of roots) {
    finalizeNode(root);
  }

  return { roots, groupCount };
};

// 開閉状態を適用して表示リストへ展開します。collapsed なグループは「グループ行自身は表示・
//   配下(子グループ / leaf)は非表示」です。groups には表示されるグループ行のみが
//   表示順(DFS 順)で入ります。
export const flattenGroupTree = <T,>(
  tree: GroupTree<T>,
  collapsedGroupKeys: ReadonlySet<string>,
): GroupedDisplay => {
  const out: number[] = [];
  const groups: GridGroupRow[] = [];

  const emit = (node: GroupTreeNode<T>): void => {
    groups.push(node.groupRow);
    out.push(-groups.length);
    if (collapsedGroupKeys.has(node.groupRow.groupKey)) {
      return;
    }
    if (node.children.length > 0) {
      for (const child of node.children) {
        emit(child);
      }
      return;
    }
    for (const sourceIndex of node.leafSourceIndexes) {
      out.push(sourceIndex);
    }
  };
  for (const root of tree.roots) {
    emit(root);
  }

  return { displayOrder: Int32Array.from(out), groups };
};

// ツリー内の全 groupKey を DFS 順で返します(「すべて折りたたむ」等の一括開閉操作用)。
export const collectAllGroupKeys = <T,>(tree: GroupTree<T>): string[] => {
  const keys: string[] = [];
  const walk = (node: GroupTreeNode<T>): void => {
    keys.push(node.groupRow.groupKey);
    for (const child of node.children) {
      walk(child);
    }
  };
  for (const root of tree.roots) {
    walk(root);
  }
  return keys;
};