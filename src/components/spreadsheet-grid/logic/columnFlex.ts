import type { GridColumn } from '../model/gridTypes';
import { getColumnPane } from './geometry';

// ────────────────────────────────────────────────
// 追加(B3): JS 算出 flex(AG Grid の flex 相当)。
//   真の CSS flexbox は使えません(レイアウトが完全な絶対座標 = px 前提のため)。
//   代わりに「利用可能幅 − 固定列合計」を flex 比で px へ配分し、min/max でクランプします。
//   結果は center ペインの列幅として既存の columnWidths 解決の前段に挟まれます
//   (precedence: columnWidths[key] ?? flex算出[key] ?? column.width)。座標系・measurements は不変。
//
//   flex と autoSize の違い(本ライブラリでの整理):
//   - flex     = コンテナの「余り幅」を比率で配分(中身は見ない・コンテナ追従でリアクティブ)。
//   - autoSize = セルの「中身の長さ」に合わせて固定 px を一度だけ算出(コンテナは見ない)。
//   詳細は API_REFERENCE.md の「flex と autoSize」節を参照。
// ────────────────────────────────────────────────

// flex 配分時、minWidth 未指定の flex 列へ課す既定の最小幅(px)です。
//   0 幅や負幅へ潰れるのを防ぎます(明示 minWidth があればそちらを優先)。
export const DEFAULT_FLEX_MIN_WIDTH = 50;

// 列が「今まさに flex する」= center ペイン(非 pinned)かつ flex>0 かを判定します。
//   pinned 列は sticky 配置のため flex 対象外です(flex 指定があっても無視)。
//   ※ 初期 columnWidths 生成 / columns 同期 / center 配分の各所で同じ条件を使うため共有します。
export const isFlexingColumn = <T,>(column: GridColumn<T>): boolean =>
  column.flex != null &&
  column.flex > 0 &&
  getColumnPane(column) === 'center';

// 1 列分の flex 解決入力(内部)。
type FlexEntry = {
  key: string;
  flex: number;
  min: number;
  max: number;
};

// flex 列群へ available をフレックス比で配分し、min/max クランプを反復適用します(内部)。
//   - 暫定配分で min 未満 / max 超過になる列を 1 件ずつ確定してプールから外し、残り space を
//     残りの列で再配分します(AG Grid の flex と同等。1 列の min/max 到達が他列の取り分へ波及)。
//     各反復で必ず 1 列以上プールが縮むため、最大でも entries 件数回で停止します。
//   - クランプ違反が無くなったら残プールを比率で確定します。浮動小数の端数は最後の列へ寄せ、
//     確定幅の合計を space に厳密一致させます(横スクロールバーの誤発生を防ぐため)。
//   - space が固定列合計を下回る(=負)場合、全 flex 列が順に min へクランプされて潰れ、
//     合計が利用可能幅を超えて横スクロールが発生します(仕様)。
const distributeFlexWidths = (
  entries: FlexEntry[],
  available: number,
): Map<string, number> => {
  const result = new Map<string, number>();
  let pool = entries;
  let space = available;

  for (;;) {
    const totalFlex = pool.reduce((sum, entry) => sum + entry.flex, 0);
    if (pool.length === 0 || totalFlex <= 0) {
      break;
    }

    // 暫定配分で min/max 違反を 1 件探し、見つかれば確定してプールを縮める。
    let clampedKey: string | null = null;
    for (const entry of pool) {
      const raw = (space * entry.flex) / totalFlex;
      if (raw < entry.min) {
        result.set(entry.key, entry.min);
        space -= entry.min;
        clampedKey = entry.key;
        break;
      }
      if (raw > entry.max) {
        result.set(entry.key, entry.max);
        space -= entry.max;
        clampedKey = entry.key;
        break;
      }
    }
    if (clampedKey !== null) {
      pool = pool.filter((entry) => entry.key !== clampedKey);
      continue;
    }

    // 違反なし: 残プールを比率で確定(端数=浮動小数誤差は最後の列へ寄せ、合計を space に一致)。
    //   この分岐に到達する時点で space は全列が min 以上を満たす値(= 非負)です。
    let allocated = 0;
    pool.forEach((entry, indexInPool) => {
      if (indexInPool === pool.length - 1) {
        result.set(entry.key, space - allocated);
      } else {
        const width = (space * entry.flex) / totalFlex;
        result.set(entry.key, width);
        allocated += width;
      }
    });
    break;
  }

  return result;
};

// center ペインの列群 + 既存 columnWidths + 利用可能幅 から、flex 列の解決幅 map を返します。
//   - 手動リサイズ済み(columnWidths にエントリあり)の列は「固定」として flex 対象外にし、
//     その幅を available から差し引きます(precedence で columnWidths が優先される性質と整合)。
//   - flex 指定の無い列(および pinned 列)も固定として available から差し引きます。
//   - 残りを flex 列へ配分します。flex 列が無ければ空 map を返します(呼び出し側は素通し)。
//   ※ 返り値は flex 列のキーのみを含みます(固定列は含めません)。
//   ※ flex 判定条件は isFlexingColumn と同一です(TS の narrowing 用にここでは inline 展開)。
export const computeCenterFlexWidths = <T,>(
  centerColumns: GridColumn<T>[],
  columnWidths: Record<string, number>,
  availableWidth: number,
): Record<string, number> => {
  const flexEntries: FlexEntry[] = [];
  let fixedTotal = 0;

  for (const column of centerColumns) {
    // 手動リサイズ済みの列は固定として扱う(flex より columnWidths が優先)。
    const manualWidth = columnWidths[column.key];
    if (manualWidth != null) {
      fixedTotal += manualWidth;
      continue;
    }
    const flex = column.flex;
    if (flex != null && flex > 0 && getColumnPane(column) === 'center') {
      flexEntries.push({
        key: column.key,
        flex,
        min: column.minWidth ?? DEFAULT_FLEX_MIN_WIDTH,
        max: column.maxWidth ?? Number.POSITIVE_INFINITY,
      });
      continue;
    }
    // 固定幅列。
    fixedTotal += column.width;
  }

  if (flexEntries.length === 0) {
    return {};
  }

  const flexSpace = availableWidth - fixedTotal;
  return Object.fromEntries(distributeFlexWidths(flexEntries, flexSpace));
};