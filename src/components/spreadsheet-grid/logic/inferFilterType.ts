import type { ColumnFilterUiType } from '../model/gridTypes';
import { isBlankCellValue, toDateKey } from './filtering';

// 追加(filter-ext E): filterType: 'auto' の実効種別を推定する純ロジックです。
//   合意済みの方針:
//     1. 判定は「popover を初回に開いた時点」で 1 回だけ行い、以後その列で固定します
//        (呼び出し側でキャッシュ。ただし conclusive=false のときはキャッシュしません)。
//     2. 厳格判定です。空白セルを除いた**全サンプル**が同じ型に見えるときだけ numberSet /
//        dateSet になり、1 件でも外れると textSet(安全側)へ倒れます。
//     3. serverSide はクライアントが全行を持たないため値からの推定はしません
//        (editor ヒントがあればそれで確定、無ければ 'text' へフォールバック)。
//     4. 判定は「値の JS 型」ではなく「値が数値 / 日付として解釈できるか」で行います
//        (DB 型が文字列の '1234' も numberSet 扱い。フィルター判定側の
//        coerceNumberFilterCellValue / toDateKey と同じ規則で一貫させるため)。

// 推定結果として返しうる UI 種別です(auto から解決されうるのはこの 4 つだけ)。
export type InferredColumnFilterType = Extract<
  ColumnFilterUiType,
  'numberSet' | 'textSet' | 'dateSet' | 'text'
>;

export type InferFilterTypeResult = {
  filterType: InferredColumnFilterType;
  // 判定の根拠です。
  //   - 'editor'   : 列の editor 種別(number / date)から確定。値は見ていません。
  //   - 'values'   : 実データのサンプルから確定。
  //   - 'fallback' : 判定材料が無い(非空白サンプル 0 件 / serverSide かつ editor ヒント無し)。
  source: 'editor' | 'values' | 'fallback';
  // 呼び出し側がこの結果をキャッシュ(以後固定)してよいか。fallback は材料不足のため false で、
  //   次回オープン時に再推定されます(初回オープン時にまだ行が空だったケースの救済)。
  conclusive: boolean;
};

// 非空白サンプルの上限です。これに達した時点で走査を打ち切ります。
export const INFER_SAMPLE_LIMIT = 1_000;
// 走査行の上限です。空白だらけの列で 100 万行を舐めないための保険です。
export const INFER_SCAN_LIMIT = 20_000;

// 値が「数値として解釈できるか」です。
//   - number は有限値のみ(NaN / Infinity は不可)。
//   - string は trim 後に有限数値へ変換できること。ただし**先頭ゼロ('0001' 等)は除外**します
//     (品番コード・郵便番号を数値と誤認しないため。Excel も同じ扱いです)。
//   - boolean / Date / オブジェクトは数値とみなしません(Number(true)=1 等の暗黙変換を避ける)。
const looksNumeric = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  // 先頭ゼロ(-0012 / 007 など)。'0' 単体と '0.5' は数値のままです。
  if (/^-?0\d/.test(normalized)) {
    return false;
  }
  return Number.isFinite(Number(normalized));
};

// 値が「日付として解釈できるか」です(判定は filtering の toDateKey と同一)。
const looksDate = (value: unknown): boolean => toDateKey(value) !== null;

type InferFilterTypeInput = {
  // 列の editor 種別(column.editor?.type)。'number' / 'date' はヒントとして最優先します。
  editorType?: string;
  // serverSide か。true のときは値からの推定をしません(クライアントに全行が無いため)。
  isServerSide?: boolean;
  rowCount: number;
  // rows[index] の当該列セル値を返すアクセサ(= getCellValue(rows[index], column))。
  getRawValueAt: (index: number) => unknown;
  sampleLimit?: number;
  scanLimit?: number;
};

export const inferColumnFilterType = ({
  editorType,
  isServerSide = false,
  rowCount,
  getRawValueAt,
  sampleLimit = INFER_SAMPLE_LIMIT,
  scanLimit = INFER_SCAN_LIMIT,
}: InferFilterTypeInput): InferFilterTypeResult => {
  // 1) editor ヒント(最優先)。値を見ないため serverSide でも確実・高速です。
  if (editorType === 'number') {
    return { filterType: 'numberSet', source: 'editor', conclusive: true };
  }
  if (editorType === 'date') {
    return { filterType: 'dateSet', source: 'editor', conclusive: true };
  }

  // 2) serverSide は値からの推定をしません(ロード済みブロックだけでは母集合が偏るため)。
  //    条件欄だけでも使える textSet ではなく、候補リストを持たない text へ倒します。
  if (isServerSide) {
    return { filterType: 'text', source: 'fallback', conclusive: true };
  }

  // 3) 値のサンプリング。空白は判定から除外します(全列に混ざりうるため)。
  const scanCount = Math.min(rowCount, scanLimit);
  let sampled = 0;
  let dateCount = 0;
  let numericCount = 0;
  for (let index = 0; index < scanCount && sampled < sampleLimit; index += 1) {
    const value = getRawValueAt(index);
    if (isBlankCellValue(value)) {
      continue;
    }
    sampled += 1;
    if (looksDate(value)) {
      dateCount += 1;
      continue;
    }
    if (looksNumeric(value)) {
      numericCount += 1;
    }
  }

  // 判定材料なし(全行空白 / 行がまだ無い)。textSet へ倒しつつ、確定はさせません。
  if (sampled === 0) {
    return { filterType: 'textSet', source: 'fallback', conclusive: false };
  }

  // 厳格判定: 全サンプルが同じ型に見えるときだけ専用種別にします。
  if (dateCount === sampled) {
    return { filterType: 'dateSet', source: 'values', conclusive: true };
  }
  if (numericCount === sampled) {
    return { filterType: 'numberSet', source: 'values', conclusive: true };
  }
  return { filterType: 'textSet', source: 'values', conclusive: true };
};
