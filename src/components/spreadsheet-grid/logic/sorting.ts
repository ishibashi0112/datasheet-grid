import type { GridColumn, GridSortState } from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';
import type { RowOrder } from './filtering';

// 追加(DS-1 / perf): 文字列比較用の共有コレーターです。
//   従来は compareUnknownValues 内で String.prototype.localeCompare(_, 'ja', opts) を
//   ペアごとに呼んでおり、これが文字列ソートの致命的なボトルネックでした
//   (20 万行・文字列キーの実測で約 7.5 秒)。同一オプションの Intl.Collator を
//   モジュールスコープで 1 度だけ生成して使い回すと、照合順序は localeCompare と
//   等価のまま約 30 倍高速になります(同条件で約 0.25 秒)。
//   仕様上 String.prototype.localeCompare(that, 'ja', opts) は
//   new Intl.Collator('ja', opts).compare(this, that) と同じ照合(符号が一致)です。
// 変更(Set Filter perf): getColumnSelectOptions の候補ソートからも再利用するため
//   export します(照合オプションは不変・並び順は従来と等価)。
export const STRING_COLLATOR = new Intl.Collator('ja', {
  numeric: true,
  sensitivity: 'base',
});

// 追加: 値比較を行います。数値化できるものは数値比較し、
//       それ以外は文字列比較へフォールバックします。
// 変更(DS-1 / perf): 文字列フォールバックを共有 Intl.Collator 経由にしました
//   (順序は従来と等価)。数値判定・数値パスは不変です。
export const compareUnknownValues = (left: unknown, right: unknown) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const bothNumeric =
    Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  if (bothNumeric) {
    return leftNumber - rightNumber;
  }

  return STRING_COLLATOR.compare(String(left ?? ''), String(right ?? ''));
};

// 追加(MS-2 / マルチソート本体): ソートエントリ配列の「次状態」を返す純関数です。
//   発火口を 1 か所に集約し、列メニュー(単一置換)とヘッダー Shift+click(トグル)で
//   同じロジックを共有します。入力配列は破壊せず、常に新しい配列を返します。
//
//   additive=false (列メニュー / 単一置換):
//     - 現在がちょうど [{columnKey, direction}] の「単一・同方向」なら [](解除)。
//     - それ以外は [{columnKey, direction}] へ置換します(他列のソートは捨てます)。
//     ⇒ MS-1 の handleColumnMenuSortChange の inline 判定と完全同値です。
//
//   additive=true (ヘッダー Shift+click / トグル):
//     - 当該列が未登録            → 末尾(最低優先)に {columnKey, direction} を追加。
//     - 登録済みで direction が別  → 位置を保ったまま direction を更新。
//     - 登録済みで direction が同じ → 当該列のエントリのみ除去。
//   呼び出し側(controller)が direction を
//     existingDir ? 'desc' : 'asc'
//   で決めることで、ユーザー体験としては none → asc → desc → none の
//   サイクルになります(desc のときは direction='desc' を渡し、上記「同方向 → 除去」で
//   消えます)。
export const nextSortEntries = (
  current: GridSortState,
  columnKey: string,
  direction: 'asc' | 'desc',
  additive: boolean,
): GridSortState => {
  if (!additive) {
    const isSameSingle =
      current.length === 1 &&
      current[0].columnKey === columnKey &&
      current[0].direction === direction;
    return isSameSingle ? [] : [{ columnKey, direction }];
  }

  const index = current.findIndex((entry) => entry.columnKey === columnKey);
  if (index === -1) {
    // 未登録 → 末尾(最低優先)に追加。
    return [...current, { columnKey, direction }];
  }
  if (current[index].direction !== direction) {
    // 別方向 → 位置を保ったまま方向だけ更新。
    return current.map((entry, i) =>
      i === index ? { columnKey, direction } : entry,
    );
  }
  // 同方向 → 当該列のみ除去(残りの優先順位は維持)。
  return current.filter((_, i) => i !== index);
};

// 追加(MS-3-1 / 並び替え管理パネル): 管理パネルの明示編集用の純関数群です。
//   nextSortEntries(additive=true) は「同方向＝除去」のトグル意味論で Shift ジェスチャ
//   向けのため、ドロップダウン編集(同方向の再選択は no-op であるべき)・列差し替え・
//   優先順位の入れ替えには素直に乗りません。そこで管理パネル用に下記を分離します。
//   - すべて入力非破壊(常に新しい配列を返す)・単体テスト可で、nextSortEntries と同じ規約です。
//   - 単一ソース(uiState.sort)は不変。呼び出し側(SpreadsheetGrid)が結果を
//     setSort / clearSort へ流します(reducer / actions は不変)。
//
// addSortEntry: 末尾(最低優先)へレベルを追加します。
//   既に同じ列が含まれている場合は何もしません(パネル側は未使用列だけを「追加」候補に
//   出すため通常は起きませんが、純関数としての不変条件『1 列につき高々 1 エントリ』を守ります)。
export const addSortEntry = (
  current: GridSortState,
  columnKey: string,
  direction: 'asc' | 'desc',
): GridSortState => {
  if (current.some((entry) => entry.columnKey === columnKey)) {
    return current;
  }
  return [...current, { columnKey, direction }];
};

// setSortEntryDirection: 指定レベルの方向を「冪等にセット」します(トグルしません)。
//   index 範囲外や同方向(変化なし)のときは元配列をそのまま返します(無駄な参照変化を抑止)。
export const setSortEntryDirection = (
  current: GridSortState,
  index: number,
  direction: 'asc' | 'desc',
): GridSortState => {
  if (index < 0 || index >= current.length) {
    return current;
  }
  if (current[index].direction === direction) {
    return current;
  }
  return current.map((entry, i) =>
    i === index ? { ...entry, direction } : entry,
  );
};

// setSortEntryColumn: 指定レベルの対象列を差し替えます(Excel のレベル列変更相当)。
//   - 方向は当該レベルのものを維持します。
//   - 差し替え先の列が他レベルで既に使われている場合は、その他レベルを除去して
//     『1 列につき高々 1 エントリ』を保ちます(当該レベルの位置・優先順位は維持)。
//     パネル側は他レベルで使用中の列を選択肢から除くため通常は起きませんが、保険です。
//   - index 範囲外、または変化なし(同一列)のときは元配列をそのまま返します。
export const setSortEntryColumn = (
  current: GridSortState,
  index: number,
  columnKey: string,
): GridSortState => {
  if (index < 0 || index >= current.length) {
    return current;
  }
  if (current[index].columnKey === columnKey) {
    return current;
  }
  return current
    .map((entry, i) => (i === index ? { ...entry, columnKey } : entry))
    .filter((entry, i) => i === index || entry.columnKey !== columnKey);
};

// removeSortEntryAt: 指定レベルを除去します(残りの優先順位は維持)。
//   index 範囲外のときは元配列をそのまま返します。
export const removeSortEntryAt = (
  current: GridSortState,
  index: number,
): GridSortState => {
  if (index < 0 || index >= current.length) {
    return current;
  }
  return current.filter((_, i) => i !== index);
};

// 追加(MS-3-2 / 優先順位 DnD): 指定レベルを from から to へ移動します(配列 move)。
//   - 標準的な「配列 move」意味論です。to は除去後の挿入先 index(0..length-1)。
//     ドロップ位置(挿入スロット 0..length)からの -1 補正は呼び出し側(管理パネルの
//     finishDrag)が担います。ColumnChooser で computeSectionReorderedKeys が補正を持ち、
//     配列プリミティブを汚さない役割分担と同じです。
//   - すべて入力非破壊(常に新しい配列を返す)・単体テスト可で、他の sort 純関数と同規約です。
//   - from / to が範囲外、または from === to(動かない)のときは元配列をそのまま返します
//     (no-op ドラッグで参照を変えないため。setSort へ流しても再レンダーを誘発しません)。
export const moveSortEntry = (
  current: GridSortState,
  from: number,
  to: number,
): GridSortState => {
  if (from < 0 || from >= current.length || to < 0 || to >= current.length) {
    return current;
  }
  if (from === to) {
    return current;
  }
  const next = [...current];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

// 追加(DS-1 / index ベースパイプライン): order(RowOrder) を受け、並べ替えた order を
//   返す多列ソートです(本体のソート経路はこれに一本化済み。旧オブジェクト配列版は
//   DS-3-8 で削除)。規約:
//     - 多列の優先順位適用(resolved を先頭から比較、0 のとき次のキーへ)、
//     - 未解決(列が見つからない)エントリのスキップ、有効キー 0 件なら元 order を返す、
//     - 最終タイブレークは元 source index(= order[pos])で安定化、
//   sort が空 / 有効キー 0 件のときは同一参照を返します。
//
//   パフォーマンス上の要点(decorate-sort-undecorate / B-1: 数値列 Float64 typed key):
//     - 比較子の内側で getCellValue を毎回呼ぶ素朴な実装だと、呼び出し回数が
//       O(行数 × log 行数 × ソート列数) に膨らみます。アクティブ sort 列ごとに
//       「order 各位置のセル値」を事前に 1 回だけ取り出して配列化(decorate)し、
//       比較は decorate 済み値に対して行うことで O(行数 × ソート列数) に下げます。
//     - B-1(Float64 typed key): さらに「全アクティブ sort 列が数値」のときは、
//       decorate を unknown[] ではなく Float64Array(typed key)で行い、比較を
//       純粋な数値差分(分岐レス)にします。compareUnknownValues は比較ごとに
//       Number(...) を 2 回・Number.isFinite を 2 回呼ぶため、数値が文字列で
//       hydrate された列(CSV 由来など)では再 coercion が O(行数 × log 行数 × 列数)
//       に膨らみます。typed key 化でこれを「列ごと 1 回(O(行数))」へ前倒しし、比較は
//       key[a] - key[b] のみになります(500k 実測で約 +30〜57%。文字列で持つ数値列ほど効く)。
//     - 等価性: compareUnknownValues は両値が Number.isFinite のときだけ数値比較し、
//       片方でも非有限なら STRING_COLLATOR へフォールバックします(列単位ではなく
//       ペア単位の判定)。よって Float64 経路は「列の全値が Number.isFinite」のときに
//       限り compareUnknownValues の数値枝と恒等です(key は Number(値) を格納し、
//       key[a]-key[b] は Number(a)-Number(b) とビット等価)。非有限値が 1 つでも混じる
//       列があれば、その列だけでなく全体を従来の unknown[] + compareUnknownValues 経路へ
//       フォールバックさせ、コンパレータを単形(分岐レス)に保ちます(混在ソートの安全側)。
//     - 数値判定は filterType に依存させず、compareUnknownValues と同じ「値駆動」で
//       行います(挙動の決定権は一貫して値側にあります)。
//     - 実際の sort 対象は「位置(0..length-1)の number[]」で、確定後に
//       result[i] = order[positions[i]] で undecorate して Int32Array へ書き戻します。
export const sortOrder = <T,>(
  rows: T[],
  order: RowOrder,
  columns: GridColumn<T>[],
  sort: GridSortState,
): RowOrder => {
  if (sort.length === 0) {
    return order;
  }

  // 列解決はソート前に 1 回だけ(比較関数内で find を毎回呼ばない)。
  const resolved = sort
    .map((entry) => {
      const column = columns.find((item) => item.key === entry.columnKey);
      return column
        ? { column, multiplier: entry.direction === 'asc' ? 1 : -1 }
        : null;
    })
    .filter(
      (item): item is { column: GridColumn<T>; multiplier: number } =>
        item !== null,
    );

  if (resolved.length === 0) {
    return order;
  }

  const length = order.length;
  const columnCount = resolved.length;

  const multipliers = resolved.map((item) => item.multiplier);

  // decorate(B-1): まず「全アクティブ sort 列が数値」かを試行しつつ、数値列の
  //   typed key(Float64Array)を構築します。各列は最初の非有限値で打ち切るため、
  //   文字列列はほぼ先頭で抜け(実質ゼロコスト)、全数値列のみ全長を走査します。
  //   非有限値を 1 つでも含む列に当たった時点で allNumeric=false にして以降の列も
  //   試さず、下の fallback(従来 unknown[] 経路)へ倒します(構築済みの typed key は
  //   破棄。fallback は稀かつ Collator 律速のため、この破棄コストは無視できます)。
  const numericKeyColumns: Float64Array[] = new Array<Float64Array>(columnCount);
  let allNumeric = true;
  for (let c = 0; c < columnCount; c += 1) {
    const column = resolved[c].column;
    const keys = new Float64Array(length);
    let columnIsNumeric = true;
    for (let pos = 0; pos < length; pos += 1) {
      const numeric = Number(getCellValue(rows[order[pos]], column));
      if (!Number.isFinite(numeric)) {
        columnIsNumeric = false;
        break;
      }
      keys[pos] = numeric;
    }
    if (!columnIsNumeric) {
      allNumeric = false;
      break;
    }
    numericKeyColumns[c] = keys;
  }

  // 位置(0..length-1)を並べ替えます。比較は decorate 済みキー、
  // タイブレークは元 source index(order[a]/order[b])で安定化します。
  const positions = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    positions[i] = i;
  }

  if (allNumeric) {
    // fast path: 全列が数値。Float64 typed key の差分のみで比較します(分岐レス)。
    //   単一列ソートは最頻ケースのため、列ループ・列添字を畳んだ専用形へ特化します
    //   (この特化で単一数値列でも従来 boxed 経路に対し非回帰になります)。
    if (columnCount === 1) {
      const keys = numericKeyColumns[0];
      const multiplier = multipliers[0];
      positions.sort((a, b) => {
        const diff = keys[a] - keys[b];
        if (diff !== 0) {
          return diff * multiplier;
        }
        return order[a] - order[b];
      });
    } else {
      positions.sort((a, b) => {
        for (let c = 0; c < columnCount; c += 1) {
          const diff = numericKeyColumns[c][a] - numericKeyColumns[c][b];
          if (diff !== 0) {
            return diff * multipliers[c];
          }
        }
        return order[a] - order[b];
      });
    }
  } else {
    // fallback: 1 列でも非数値を含む。従来どおり全列を unknown[] へ decorate し、
    //   compareUnknownValues(ペア単位の数値/文字列判定)で比較します(現状とバイト等価)。
    const keyColumns: unknown[][] = resolved.map(({ column }) => {
      const keys = new Array<unknown>(length);
      for (let pos = 0; pos < length; pos += 1) {
        keys[pos] = getCellValue(rows[order[pos]], column);
      }
      return keys;
    });
    positions.sort((a, b) => {
      for (let c = 0; c < columnCount; c += 1) {
        const compared = compareUnknownValues(
          keyColumns[c][a],
          keyColumns[c][b],
        );
        if (compared !== 0) {
          return compared * multipliers[c];
        }
      }
      return order[a] - order[b];
    });
  }

  // undecorate: 並べ替えた位置を元 source index へ戻して Int32Array を組み立てます。
  const result = new Int32Array(length);
  for (let i = 0; i < length; i += 1) {
    result[i] = order[positions[i]];
  }
  return result;
};