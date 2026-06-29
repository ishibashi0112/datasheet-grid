import type {
  ColumnFilterValue,
  GridColumn,
  NumberColumnFilterValue,
  ParsedNumberFilter,
  SetColumnFilterValue,
} from '../model/gridTypes';
import { getCellValue } from '../utils/permissions';

// 追加(DS-1 / index ベースパイプライン): 「ビュー順に並んだ元 rows の index 列」です。
//   オブジェクト配列({row, sourceIndex, ...})を各段で割り当て直す従来方式に代えて、
//   フィルタ/ソートはこの index 列(Int32Array)だけを生成・受け渡しします。
//   - 1,000,000 行でも 4MB(= 4byte × N)に収まり、割り当て/GC が行オブジェクト方式から桁で下がります。
//   - 将来 Web Worker へ渡す際に transferable(ゼロコピー)になります。
//   - ビュー位置 i の元行は rows[order[i]] で引きます(この対応付けが後段のシームの土台)。
//   DS-1 は純関数の追加のみで、配線(SpreadsheetGrid 側のチェーン差し替え)は DS-2 で行います。
export type RowOrder = Int32Array;

// 追加(DS-1): 恒等 order [0, 1, ..., rowCount-1] を生成します(パイプラインの起点)。
export const createSourceOrder = (rowCount: number): RowOrder => {
  const order = new Int32Array(rowCount);
  for (let i = 0; i < rowCount; i += 1) {
    order[i] = i;
  }
  return order;
};

// 追加(12-A → 記述子化): set フィルター値の type guard です。
// 変更(記述子化): columnFilters の値が ColumnFilterValue(判別共用体)へ閉じたため、
//   typeof / Array.isArray の実行時ダックタイピングは不要になり、kind の絞り込みだけで足ります。
//   外部呼び出し側(SpreadsheetGrid の表示・署名計算)の narrowing を据え置くため guard は残します。
export const isSetColumnFilterValue = (
  value: ColumnFilterValue | undefined,
): value is SetColumnFilterValue => value?.kind === 'set';

// 追加(12-A): 列フィルター値が「有効」かを判定する共通 helper です。
// 変更理由: 従来は GridHeaderRow(フィルター済みバッジ) / gridBarHelpers(有効件数) /
//   列フィルタの適用処理がそれぞれ String(value).trim() で判定していました。
//   set フィルター値はオブジェクトのため String() 判定が成立しません
//   (空配列 = 全行除外でも「有効」と数える必要があります)。
//   有効判定をここへ一元化し、3 箇所すべてが同じ規則を共有します。
// 変更(記述子化): 判別共用体の kind で網羅判定します。set / number / custom は存在時点で有効
//   (set/number は reducer/build 側で空を clear 済み、custom は利用者が明示的に set した値)。
//   text / date は trim 後非空、select は値非空のときだけ有効です(旧・生文字列時代と等価)。
export const isActiveColumnFilterValue = (
  value: ColumnFilterValue | undefined,
): boolean => {
  if (!value) {
    return false;
  }
  switch (value.kind) {
    case 'set':
    case 'number':
    case 'custom':
      return true;
    case 'select':
      return value.value.length > 0;
    case 'text':
    case 'date':
      return value.value.trim().length > 0;
  }
};

// 注記(記述子化): ParsedNumberFilter 型は gridTypes へ移設しました(ColumnFilterValue が
//   number 記述子を内包する都合)。parse の「ロジック」は引き続きこちらにあります。
// 追加: number フィルター式を解釈します。
export const parseNumberFilterExpression = (
  rawValue: string,
): ParsedNumberFilter | null => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return null;
  }

  const rangeMatch = normalized.match(
    /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (rangeMatch) {
    const first = Number(rangeMatch[1]);
    const second = Number(rangeMatch[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) {
      return null;
    }
    return {
      mode: 'range',
      min: Math.min(first, second),
      max: Math.max(first, second),
    };
  }

  const comparisonMatch = normalized.match(
    /^(<=|>=|=|<|>)?\s*(-?\d+(?:\.\d+)?)$/,
  );
  if (!comparisonMatch) {
    return null;
  }

  return {
    mode: 'comparison',
    operator: (comparisonMatch[1] ?? '=') as '>' | '>=' | '<' | '<=' | '=',
    value: Number(comparisonMatch[2]),
  };
};

// 注記(記述子化 / number): NumberColumnFilterValue 型は gridTypes へ移設しました。
//   raw は再オープン時の draft seed / 現在値表示 / 解釈不可時の contains needle に使い、
//   parsed は commit 時 1 回の parse 結果(B-2 の Float64 key 最適化が依存する形)です。

// 追加(記述子化 / number → 記述子化): number 記述子の type guard です。
// 変更(記述子化): 入力が ColumnFilterValue へ閉じたため kind の絞り込みだけで足ります。
//   外部呼び出し側(B-2 署名計算・現在値表示)の narrowing 据え置きのため guard は残します。
export const isNumberColumnFilterValue = (
  value: ColumnFilterValue | undefined,
): value is NumberColumnFilterValue => value?.kind === 'number';

// 追加(記述子化 / number): 生入力から number 記述子を構築します。
//   - trim 後が空なら null(= フィルターなしへ正規化。呼び出し側で clearColumn 相当に倒す)。
//   - parse は parseNumberFilterExpression 1 回のみ。挙動は従来 applyNumberFilter の
//     「trim → parse → 不可なら contains」と厳密に等価です(raw は trim 済みを保持)。
export const buildNumberColumnFilterValue = (
  rawInput: string,
): NumberColumnFilterValue | null => {
  const raw = rawInput.trim();
  if (!raw) {
    return null;
  }
  return { kind: 'number', raw, parsed: parseNumberFilterExpression(raw) };
};

// 追加(記述子化): 列フィルター値を「テキスト入力の編集用文字列」へ整形します。
//   popover 再オープン時の draft seed の単一窓口です。
// 変更(記述子化): 全種別が記述子になったため kind で分岐します。
//   - number → raw(式そのもの) / text・date・select → value(検索/選択文字列)。
//   - set はチェックボックス UI、custom は自由形 UI のため text 入力 draft を持ちません(空)。
export const columnFilterValueToDraftText = (
  value: ColumnFilterValue | undefined,
): string => {
  if (!value) {
    return '';
  }
  switch (value.kind) {
    case 'number':
      return value.raw;
    case 'text':
    case 'date':
    case 'select':
      return value.value;
    case 'set':
    case 'custom':
      return '';
  }
};

// 追加: number 型フィルターの評価です。
export const applyNumberFilter = (
  cellValue: unknown,
  filterValue: unknown,
) => {
  const normalizedFilter = String(filterValue ?? '').trim();
  if (!normalizedFilter) {
    return true;
  }

  const parsedFilter = parseNumberFilterExpression(normalizedFilter);
  if (!parsedFilter) {
    // 追加: 式として解釈できない場合は contains にフォールバックします。
    return String(cellValue ?? '')
      .toLowerCase()
      .includes(normalizedFilter.toLowerCase());
  }

  const numericCellValue = Number(cellValue);
  if (!Number.isFinite(numericCellValue)) {
    return false;
  }

  if (parsedFilter.mode === 'range') {
    return (
      numericCellValue >= parsedFilter.min &&
      numericCellValue <= parsedFilter.max
    );
  }

  switch (parsedFilter.operator) {
    case '>':
      return numericCellValue > parsedFilter.value;
    case '>=':
      return numericCellValue >= parsedFilter.value;
    case '<':
      return numericCellValue < parsedFilter.value;
    case '<=':
      return numericCellValue <= parsedFilter.value;
    case '=':
    default:
      return numericCellValue === parsedFilter.value;
  }
};

// 列フィルターの「行ループ前の事前コンパイル方式」のための型・helper 群です(12-A)。
//   set フィルターは候補が多い列(例: 品番 5,000 種)でも O(1) 判定にしたく、
//   行ループの外で一度だけ Set を構築する必要があります。また有効な列フィルターだけを
//   predicate へ事前コンパイルすることで、行ループは「有効フィルター数 × 行数」に縮小し、
//   フィルター未設定列ぶんの String(...).trim().toLowerCase() 正規化を省けます
//   (text / number / select の判定結果は単一実装で一意です)。
//   現在の利用者は index 版 filterOrderByColumns です
//   (旧オブジェクト配列版は DS-3-8 で削除しました)。
// 変更(B-2): predicate に sourceIndex を渡せるよう第 2 引数を追加します。
//   number(comparison/range)で「事前計算した Float64 key[sourceIndex]」を引くために使います。
//   TS 上 (row) => boolean は (row, sourceIndex) => boolean へ代入可能なので、
//   key を使わない既存クロージャ(filterFn / set / contains / select / text)は無改修のまま通ります。
type CompiledColumnFilterPredicate<T> = (row: T, sourceIndex: number) => boolean;

// 追加(12-A): 1 列ぶんのフィルター値を predicate へコンパイルします。
//             無効(未設定)なら null を返し、行ループから除外します。
// 変更(記述子化): filterValue を ColumnFilterValue へ閉じ、判別を switch(value.kind) 一本に
//   統一しました(従来の column.filterType 突き合わせ・生文字列 number の後方互換フォールバックを撤去)。
//   合否はいずれも旧経路と厳密に等価です(select=完全一致 / text・date=部分一致 / number=下記)。
const compileSingleColumnFilter = <T,>(
  column: GridColumn<T>,
  filterValue: ColumnFilterValue | undefined,
  // 追加(B-2): この列ぶんの Float64 key(rows 全長・sourceIndex 添字)。
  //   渡されたときだけ comparison/range が key[sourceIndex] を引きます。
  //   未指定(set 列 / key 未構築)なら従来の Number(getCellValue(...)) 経路に倒れ、挙動は等価です。
  numericKey?: Float64Array,
): CompiledColumnFilterPredicate<T> | null => {
  if (!isActiveColumnFilterValue(filterValue)) {
    return null;
  }
  // 注記: isActiveColumnFilterValue を通った時点で filterValue は存在します(undefined 除外)。
  const value = filterValue as ColumnFilterValue;

  // 注記: 従来どおり column.filterFn を最優先します(記述子オブジェクトをそのまま渡す契約。
  //       custom 列の自由形値もここで利用側 filterFn の責務として解釈されます)。
  if (column.filterFn) {
    const filterFn = column.filterFn;
    return (row) => filterFn(row, value);
  }

  switch (value.kind) {
    // 追加(12-A / 反転set): set フィルターは「対象値の Set」を一度だけ構築し、O(1) 照合します。
    //   values は mode により「選択値(include)」か「非選択値(exclude)」のいずれか(常に小さい側)。
    //   include: 行値が対象に含まれれば通過 / exclude: 行値が対象に含まれなければ通過。
    case 'set': {
      const targetValues = new Set(value.values);
      if (value.mode === 'exclude') {
        return (row) =>
          !targetValues.has(String(getCellValue(row, column) ?? ''));
      }
      return (row) => targetValues.has(String(getCellValue(row, column) ?? ''));
    }

    // 追加(記述子化 / number): number 記述子は parse 済みのため、行ループ外で評価器を確定します。
    //   合否は旧 applyNumberFilter と厳密に等価:
    //     - parsed=null  → raw で contains(大文字小文字無視)。
    //     - range        → Number(cell) が有限かつ [min,max]。
    //     - comparison   → Number(cell) が有限かつ op 比較(= は ===)。
    case 'number': {
      const parsed = value.parsed;
      if (parsed === null) {
        const needle = value.raw.toLowerCase();
        return (row) =>
          String(getCellValue(row, column) ?? '')
            .toLowerCase()
            .includes(needle);
      }
      if (parsed.mode === 'range') {
        const { min, max } = parsed;
        // 変更(B-2): numericKey があれば key[sourceIndex] を、無ければ従来どおり
        //   Number(getCellValue(...)) を読みます。値の取得元だけが変わり、判定本体は不変です。
        return (row, sourceIndex) => {
          const numericCellValue = numericKey
            ? numericKey[sourceIndex]
            : Number(getCellValue(row, column));
          return (
            Number.isFinite(numericCellValue) &&
            numericCellValue >= min &&
            numericCellValue <= max
          );
        };
      }
      const { operator, value: threshold } = parsed;
      // 変更(B-2): comparison も numericKey 経路を併設します(無ければ従来 getCellValue 経路)。
      return (row, sourceIndex) => {
        const numericCellValue = numericKey
          ? numericKey[sourceIndex]
          : Number(getCellValue(row, column));
        if (!Number.isFinite(numericCellValue)) {
          return false;
        }
        switch (operator) {
          case '>':
            return numericCellValue > threshold;
          case '>=':
            return numericCellValue >= threshold;
          case '<':
            return numericCellValue < threshold;
          case '<=':
            return numericCellValue <= threshold;
          case '=':
          default:
            return numericCellValue === threshold;
        }
      };
    }

    // 追加(記述子化 / select): 完全一致です(旧 String(filterValue ?? '') と等価)。
    case 'select': {
      const expectedValue = value.value;
      return (row) =>
        String(getCellValue(row, column) ?? '') === expectedValue;
    }

    // 追加(記述子化 / text・date): 部分一致です(旧 text/date と等価)。date は現状 text と
    //   同述語を共有しますが、将来の相対日付は評価時解決の専用分岐をここに足して切り出せます。
    case 'text':
    case 'date': {
      const normalizedFilter = value.value.trim().toLowerCase();
      return (row) =>
        String(getCellValue(row, column) ?? '')
          .toLowerCase()
          .includes(normalizedFilter);
    }

    // 追加(記述子化 / custom): filterFn 不在の custom 列は、旧 text/custom 経路と等価に
    //   String(value) の部分一致へフォールバックします(filterFn を持つ列は上で処理済み)。
    case 'custom': {
      const needle = String(value.value ?? '')
        .trim()
        .toLowerCase();
      return (row) =>
        String(getCellValue(row, column) ?? '')
          .toLowerCase()
          .includes(needle);
    }
  }
};

// ────────────────────────────────────────────────
// 追加(DS-1 / index ベースパイプライン): order(RowOrder)を受けて order を返すフィルタ群。
//   本体のフィルタ経路はこの index 版に一本化済みです(DS-2 で差し替え、
//   旧オブジェクト配列版は DS-3-8 で削除)。いずれも「合格行を元の相対順で詰め直す」処理で、
//   入出力が {row,...}[] ではなく元 rows + index 列(Int32Array)である点が要点です。
//   「全件通過」のときは同一参照(引数 order)を返し、下流 useMemo のスキップを最大化します
//   (.filter は全通過でも新配列を返すため、参照節約という点でも改善です)。
// ────────────────────────────────────────────────

// 追加(F-async): 1 行がグローバルニードルに一致するか(可視列 some の部分一致)を判定します。
//   normalizedNeedle は呼び出し側で trim + toLowerCase 済み・非空である前提です
//   (空ニードルは全件一致＝呼び出し側が order をそのまま返すため、ここには来ません)。
//   時間分割の非同期フィルタ(useGlobalFilteredOrder)が 1 行ごとにこれを呼び、同期版の
//   filterOrderByGlobalText も内部でこれを使うため、両経路の合否は単一実装で一意になります。
export const rowMatchesGlobalText = <T,>(
  row: T,
  columns: GridColumn<T>[],
  normalizedNeedle: string,
): boolean => {
  const columnCount = columns.length;
  for (let c = 0; c < columnCount; c += 1) {
    const value = getCellValue(row, columns[c]);
    if (String(value ?? '').toLowerCase().includes(normalizedNeedle)) {
      return true;
    }
  }
  return false;
};

// 追加(DS-1): グローバルフィルタの index 版です(columns.some の部分一致)。
//   filter 文字列が空なら同一参照を返します。
// 変更(F-async): 1 行判定を rowMatchesGlobalText へ抽出しました(挙動は不変・バイト等価)。
//   これで同期版(本関数)と非同期版(useGlobalFilteredOrder のチャンク走査)が同じ述語を共有します。
export const filterOrderByGlobalText = <T,>(
  rows: T[],
  order: RowOrder,
  columns: GridColumn<T>[],
  globalText: string,
): RowOrder => {
  const normalizedFilter = globalText.trim().toLowerCase();
  if (!normalizedFilter) {
    return order;
  }

  const length = order.length;
  const result = new Int32Array(length);
  let count = 0;

  for (let pos = 0; pos < length; pos += 1) {
    const sourceIndex = order[pos];
    if (rowMatchesGlobalText(rows[sourceIndex], columns, normalizedFilter)) {
      result[count] = sourceIndex;
      count += 1;
    }
  }

  // 全件通過なら参照を変えません(no-op スキップ最大化)。
  if (count === length) {
    return order;
  }
  // 余剰バッファを抱えないよう、右サイズへ slice(コピー)します。
  return result.slice(0, count);
};

// 追加(DS-1): 列フィルタの index 版です(有効フィルタの predicates.every)。
//   事前コンパイルは compileSingleColumnFilter を再利用します
//   (text / number / select / set / filterFn の判定は単一実装)。
//   有効フィルタが 0 件なら同一参照を返します。
export const filterOrderByColumns = <T,>(
  rows: T[],
  order: RowOrder,
  columns: GridColumn<T>[],
  columnFilters: Record<string, ColumnFilterValue>,
  // 追加(B-2): 列キー → Float64 key の table(任意)。number(comparison/range)列のみ収録。
  //   未指定なら全列が従来経路へ倒れ、現状とバイト等価です(set/text/select/filterFn は元から key 不使用)。
  numericKeys?: ReadonlyMap<string, Float64Array>,
): RowOrder => {
  const predicates: CompiledColumnFilterPredicate<T>[] = [];
  for (const column of columns) {
    const predicate = compileSingleColumnFilter(
      column,
      columnFilters[column.key],
      numericKeys?.get(column.key),
    );
    if (predicate) {
      predicates.push(predicate);
    }
  }

  if (predicates.length === 0) {
    return order;
  }

  const length = order.length;
  const predicateCount = predicates.length;
  const result = new Int32Array(length);
  let count = 0;

  for (let pos = 0; pos < length; pos += 1) {
    const sourceIndex = order[pos];
    const row = rows[sourceIndex];
    let ok = true;
    for (let p = 0; p < predicateCount; p += 1) {
      if (!predicates[p](row, sourceIndex)) {
        ok = false;
        break;
      }
    }
    if (ok) {
      result[count] = sourceIndex;
      count += 1;
    }
  }

  if (count === length) {
    return order;
  }
  return result.slice(0, count);
};