// 追加(DS-4 #1): select / set フィルター候補の収集ロジックを 1 か所へ集約します。
//   同期一括版(通常規模)と時間分割の非同期版(500k/1M)の双方がここを共有するため、
//   刻み方が違っても収集結果はバイト等価になります(DS-4① の
//   createColumnWidthAccumulator と同じ「共有アキュムレータで等価保証」方針)。
import { STRING_COLLATOR } from './sorting';

// 候補の最小型です。view 層の ColumnFilterPopoverOption と構造的に同一で相互代入可能ですが、
//   logic -> view の依存を作らないため別定義にします。
export type SelectOptionEntry = { label: string; value: string };

// 候補収集アキュムレータです。raw セル値を 1 件ずつ collect し、最後に finalize でソート確定します。
//   String 化・空白ラベル・ソート規則はいずれも旧 getColumnSelectOptions と同一です。
export const createSelectOptionsAccumulator = () => {
  const seen = new Set<string>();
  const options: SelectOptionEntry[] = [];
  return {
    // raw セル値 1 件を候補へ反映します(初出のみ push。走査順=push 順)。
    collect(rawValue: unknown): void {
      const value = String(rawValue ?? '');
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
      options.push({ value, label: value || '（空白）' });
    },
    // 収集済み候補をソート確定します(label の STRING_COLLATOR 比較。旧実装と同一)。
    finalize(): SelectOptionEntry[] {
      return options.sort((left, right) =>
        STRING_COLLATOR.compare(left.label, right.label),
      );
    },
  };
};

// 同期一括版です(通常規模で使用)。旧 getColumnSelectOptions のスキャン本体と等価です。
//   getRawValueAt(index) は rows[index] の対象列セル値(= getCellValue(rows[index], column))を返します。
export const collectSelectOptions = (
  rowCount: number,
  getRawValueAt: (index: number) => unknown,
): SelectOptionEntry[] => {
  const accumulator = createSelectOptionsAccumulator();
  for (let index = 0; index < rowCount; index += 1) {
    accumulator.collect(getRawValueAt(index));
  }
  return accumulator.finalize();
};