import type { GridColumn, SetColumnFilterValue } from '../model/gridTypes';
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

// 追加(12-A): set フィルター値の type guard です。
export const isSetColumnFilterValue = (
  value: unknown,
): value is SetColumnFilterValue =>
  typeof value === 'object' &&
  value !== null &&
  (value as SetColumnFilterValue).kind === 'set' &&
  Array.isArray((value as SetColumnFilterValue).values);

// 追加(12-A): 列フィルター値が「有効」かを判定する共通 helper です。
// 変更理由: 従来は GridHeaderRow(フィルター済みバッジ) / gridBarHelpers(有効件数) /
//   列フィルタの適用処理がそれぞれ String(value).trim() で判定していました。
//   set フィルター値はオブジェクトのため String() 判定が成立しません
//   (空配列 = 全行除外でも「有効」と数える必要があります)。
//   有効判定をここへ一元化し、3 箇所すべてが同じ規則を共有します。
//   set 以外は従来どおり「非空文字列のみ有効」で挙動等価です。
export const isActiveColumnFilterValue = (value: unknown): boolean => {
  if (isSetColumnFilterValue(value)) {
    // 注記: 全選択時は reducer 側で clearColumn 済みのため、値が存在する時点で有効です。
    return true;
  }
  // 追加(記述子化 / number): number 記述子は buildNumberColumnFilterValue で
  //   raw 非空のときだけ生成されるため、存在する時点で有効です(set と同じ規則)。
  if (isNumberColumnFilterValue(value)) {
    return true;
  }
  return String(value ?? '').trim().length > 0;
};

// 追加: number フィルターの解釈結果です。
export type ParsedNumberFilter =
  | {
      mode: 'comparison';
      operator: '>' | '>=' | '<' | '<=' | '=';
      value: number;
    }
  | {
      mode: 'range';
      min: number;
      max: number;
    };

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

// 追加(記述子化 / number): number フィルターのタグ付き記述子です。
//   set({ kind:'set' })に続く 2 種目の判別共用体メンバーで、columnFilters[key] に
//   この形が入っているときだけ「コンパイル済み number フィルター」が有効です。
//   - raw   : ユーザー入力(trim 済み)。再オープン時の draft seed / 現在値表示 /
//             式として解釈不可だった場合の contains フォールバック needle に使います。
//   - parsed: 式の解釈結果。null = 解釈不可(→ raw で contains)。従来 applyNumberFilter が
//             行ループ内で毎回行っていた parse を「commit 時 1 回」へ前倒しするための field です。
//   注記: text / select / date は本バッチでは生文字列のまま据え置きます(後続で同じ型へ寄せる)。
export type NumberColumnFilterValue = {
  kind: 'number';
  raw: string;
  parsed: ParsedNumberFilter | null;
};

// 追加(記述子化 / number): number 記述子の type guard です(set と同型)。
export const isNumberColumnFilterValue = (
  value: unknown,
): value is NumberColumnFilterValue =>
  typeof value === 'object' &&
  value !== null &&
  (value as NumberColumnFilterValue).kind === 'number';

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
//   popover 再オープン時の draft seed の単一窓口です(従来は呼び出し側で String(value) 直書き)。
//   - number 記述子 → raw(式そのもの)。
//   - それ以外(text/select/date の生文字列等)→ 従来どおり String(value ?? '')。
//   set はチェックボックス UI のため text 入力 draft を使わず、ここへは到達しません。
//   後続で text/select も記述子化する際、この関数へ分岐を足せば draft seed 側は無改修で済みます。
export const columnFilterValueToDraftText = (value: unknown): string => {
  if (isNumberColumnFilterValue(value)) {
    return value.raw;
  }
  return String(value ?? '');
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
type CompiledColumnFilterPredicate<T> = (row: T) => boolean;

// 追加(12-A): 1 列ぶんのフィルター値を predicate へコンパイルします。
//             無効(未設定)なら null を返し、行ループから除外します。
const compileSingleColumnFilter = <T,>(
  column: GridColumn<T>,
  filterValue: unknown,
): CompiledColumnFilterPredicate<T> | null => {
  if (!isActiveColumnFilterValue(filterValue)) {
    return null;
  }

  // 注記: 従来どおり column.filterFn を最優先します(set 値が渡るケースも
  //       利用側 filterFn の責務とし、挙動の優先順位は変えません)。
  if (column.filterFn) {
    const filterFn = column.filterFn;
    return (row) => filterFn(row, filterValue);
  }

  // 追加(12-A / 反転set): set フィルターは「対象値の Set」を一度だけ構築し、O(1) 照合します。
  //   values は mode により「選択値(include)」か「非選択値(exclude)」のいずれか(常に小さい側)。
  //   include: 行値が対象に含まれれば通過 / exclude: 行値が対象に含まれなければ通過。
  //   注記: スキャン収集列では universe=全行値のため include(S) ≡ exclude(U−S) が成立します。
  if (isSetColumnFilterValue(filterValue)) {
    const targetValues = new Set(filterValue.values);
    if (filterValue.mode === 'exclude') {
      return (row) => !targetValues.has(String(getCellValue(row, column) ?? ''));
    }
    return (row) => targetValues.has(String(getCellValue(row, column) ?? ''));
  }

  // 追加(記述子化 / number): number 記述子は parse 済みのため、行ループ外で評価器を確定します
  //   (従来 applyNumberFilter は行ごとに parseNumberFilterExpression を呼んでいた)。
  //   合否は applyNumberFilter と厳密に等価:
  //     - parsed=null  → raw で contains(大文字小文字無視)。
  //     - range        → Number(cell) が有限かつ [min,max]。
  //     - comparison   → Number(cell) が有限かつ op 比較(= は ===)。
  //   注記: filterFn を持つ列は上の filterFn 分岐が優先するため、ここへは到達しません
  //         (その場合 filterFn は本記述子オブジェクトを受け取ります。set と同じ契約)。
  if (isNumberColumnFilterValue(filterValue)) {
    const parsed = filterValue.parsed;
    if (parsed === null) {
      const needle = filterValue.raw.toLowerCase();
      return (row) =>
        String(getCellValue(row, column) ?? '')
          .toLowerCase()
          .includes(needle);
    }
    if (parsed.mode === 'range') {
      const { min, max } = parsed;
      return (row) => {
        const numericCellValue = Number(getCellValue(row, column));
        return (
          Number.isFinite(numericCellValue) &&
          numericCellValue >= min &&
          numericCellValue <= max
        );
      };
    }
    const { operator, value } = parsed;
    return (row) => {
      const numericCellValue = Number(getCellValue(row, column));
      if (!Number.isFinite(numericCellValue)) {
        return false;
      }
      switch (operator) {
        case '>':
          return numericCellValue > value;
        case '>=':
          return numericCellValue >= value;
        case '<':
          return numericCellValue < value;
        case '<=':
          return numericCellValue <= value;
        case '=':
        default:
          return numericCellValue === value;
      }
    };
  }

  const filterType = column.filterType ?? 'text';

  if (filterType === 'number') {
    // 注記(記述子化): commit を通った number は上の記述子分岐で処理されます。ここは
    //   生文字列 number 値(未移行 / 外部 hydrate)のための後方互換フォールバックです。
    return (row) => applyNumberFilter(getCellValue(row, column), filterValue);
  }

  if (filterType === 'select') {
    const expectedValue = String(filterValue ?? '');
    return (row) => String(getCellValue(row, column) ?? '') === expectedValue;
  }

  // text / date / custom(filterFn なし)は従来どおり部分一致です。
  const normalizedFilter = String(filterValue ?? '').trim().toLowerCase();
  return (row) =>
    String(getCellValue(row, column) ?? '')
      .toLowerCase()
      .includes(normalizedFilter);
};

// ────────────────────────────────────────────────
// 追加(DS-1 / index ベースパイプライン): order(RowOrder)を受けて order を返すフィルタ群。
//   本体のフィルタ経路はこの index 版に一本化済みです(DS-2 で差し替え、
//   旧オブジェクト配列版は DS-3-8 で削除)。いずれも「合格行を元の相対順で詰め直す」処理で、
//   入出力が {row,...}[] ではなく元 rows + index 列(Int32Array)である点が要点です。
//   「全件通過」のときは同一参照(引数 order)を返し、下流 useMemo のスキップを最大化します
//   (.filter は全通過でも新配列を返すため、参照節約という点でも改善です)。
// ────────────────────────────────────────────────

// 追加(DS-1): グローバルフィルタの index 版です(columns.some の部分一致)。
//   filter 文字列が空なら同一参照を返します。
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
  const columnCount = columns.length;
  const result = new Int32Array(length);
  let count = 0;

  for (let pos = 0; pos < length; pos += 1) {
    const sourceIndex = order[pos];
    const row = rows[sourceIndex];
    let matched = false;
    for (let c = 0; c < columnCount; c += 1) {
      const value = getCellValue(row, columns[c]);
      if (String(value ?? '').toLowerCase().includes(normalizedFilter)) {
        matched = true;
        break;
      }
    }
    if (matched) {
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
  columnFilters: Record<string, unknown>,
): RowOrder => {
  const predicates: CompiledColumnFilterPredicate<T>[] = [];
  for (const column of columns) {
    const predicate = compileSingleColumnFilter(
      column,
      columnFilters[column.key],
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
      if (!predicates[p](row)) {
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