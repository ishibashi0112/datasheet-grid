// serverSide(SSRM)の query 構築 / queryKey 直列化を担う純ロジックです(React 非依存・stage ②)。
//
// 役割:
//   - buildServerSideQuery: clientSide の UI 状態(globalText / columnFilters / sort)から、
//     getRows へ載せる ServerSideQuery を組み立てます。空・無効な要素は落として「最小の query」に
//     正規化します(無効フィルターを含めて queryKey を無駄に揺らさないため)。
//   - serializeServerSideQuery: query から安定文字列(queryKey)を導出します。論理的に等価な query は
//     同一文字列になり、useServerSideRowModel の queryKey 駆動キャッシュ無効化が不要な再フェッチを
//     起こさないようにします。
//
// 安定化の要点(なぜ手組み連結でなく JSON か):
//   - columnFilters は Record のため、どの列を先に絞ったか(キー挿入順)で文字列がぶれます。
//     キーを昇順ソートしてから直列化し、挿入順非依存にします。
//   - 区切り文字の自前連結は、フィルター値中の文字(例: text "a|b")と区切りが衝突して
//     別 query が同一文字列になる(=取りこぼし)リスクがあります。構造を JSON.stringify することで
//     エスケープが効き、実用上の単射性を担保します。
//   - 記述子値(ColumnFilterValue)は kind ごとに固定形のリテラルで構築されるため、
//     JSON のキー順も安定します。例外は custom(value:unknown)で、object を入れる場合は
//     利用者がキー順を安定させる責務を負います(揺れると queryKey も揺れ得ます)。
//   - sort は配列順=優先順位の意味を持つため順序を保持します。set の values 配列も順序は保持し
//     (候補順で決定的に生成される想定)、巨大配列のソートコストを避けます。万一順序がぶれても
//     最悪は不要な 1 回の再フェッチに留まり、正しさは損ないません。

import type {
  ColumnFilterValue,
  GridSortState,
  ServerSideQuery,
} from '../model/gridTypes';
import { isActiveColumnFilterValue } from './filtering';

// clientSide の UI 状態 3 種から ServerSideQuery を組み立てます。
//   - globalText は trim 後非空のときだけ載せます。
//   - columnFilters は isActiveColumnFilterValue を通った有効フィルターだけを収集します
//     (空 text / 値なし select 等は除外。clientSide の compileSingleColumnFilter と同じ有効判定)。
//   - sort は非空のときだけ載せます。
//   いずれも無ければそのキー自体を省き、空 query {} を返します(無フィルター時の安定ベースライン)。
export const buildServerSideQuery = (input: {
  globalText: string;
  columnFilters: Record<string, ColumnFilterValue>;
  sort: GridSortState;
}): ServerSideQuery => {
  const query: ServerSideQuery = {};

  const trimmedGlobal = input.globalText.trim();
  if (trimmedGlobal.length > 0) {
    query.globalText = trimmedGlobal;
  }

  const activeFilters: Record<string, ColumnFilterValue> = {};
  let hasActiveFilter = false;
  for (const key of Object.keys(input.columnFilters)) {
    const value = input.columnFilters[key];
    if (isActiveColumnFilterValue(value)) {
      activeFilters[key] = value;
      hasActiveFilter = true;
    }
  }
  if (hasActiveFilter) {
    query.columnFilters = activeFilters;
  }

  if (input.sort.length > 0) {
    query.sort = input.sort;
  }

  return query;
};

// query から安定 queryKey(文字列)を導出します。論理的に等価な query は同一文字列になります。
//   columnFilters はキー昇順で並べ替えてから直列化し、列の絞り込み順に依存しないようにします。
//   sort は順序保持(優先順位)。全体を JSON.stringify して区切り衝突を回避します。
export const serializeServerSideQuery = (query: ServerSideQuery): string => {
  const columnFilters = query.columnFilters ?? {};
  const sortedFilters = Object.keys(columnFilters)
    .sort()
    .map((key): [string, ColumnFilterValue] => [key, columnFilters[key]]);

  const sort = query.sort ?? [];

  return JSON.stringify({
    g: query.globalText ?? '',
    s: sort.map((entry) => [entry.columnKey, entry.direction]),
    c: sortedFilters,
  });
};