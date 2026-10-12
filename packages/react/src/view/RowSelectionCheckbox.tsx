import { memo } from 'react';
import { cx } from '@ishibashi0112/spreadsheet-grid-core/logic/cx';
import type { GridResolvedSlot } from '../model/gridTypes';

// ────────────────────────────────────────────────
// 追加(行選択): CSS 描画のチェックボックス glyph です(body ガター/ヘッダ全選択で共用)。
//   実際の選択操作はガター/コーナーセルの pointer ハンドラ側が担うため、これは視覚専用
//   (aria-hidden)にしています。role/aria-checked は親セル側に付与します。
//   状態は 3 値: unchecked / checked / indeterminate(ヘッダの「一部選択」)。
//   変更(audit RD-10): label を渡すと、この要素自体を role="checkbox"(aria-checked / aria-label)にします
//   (行ヘッダー / コーナーのセルは rowheader / columnheader の役割を持つため、チェックボックスの役割は中へ移す)。
// ────────────────────────────────────────────────
export type RowCheckboxState = 'unchecked' | 'checked' | 'indeterminate';

type RowSelectionCheckboxProps = {
  state: RowCheckboxState;
  // 未ロード行など、操作不可の見た目にしたいとき true。
  disabled?: boolean;
  // 追加(slot-props): classNames.checkbox の解決済みスロット(glyph 要素 .ssg-row-checkbox へ)。
  slot?: GridResolvedSlot;
  // 追加(audit RD-10): アクセシブル名。渡すと role="checkbox" として支援技術へ公開します(未指定は aria-hidden)。
  label?: string;
};

function RowSelectionCheckboxInner({
  state,
  disabled = false,
  slot,
  label,
}: RowSelectionCheckboxProps) {
  return (
    <span
      {...(label === undefined
        ? { 'aria-hidden': true }
        : {
            role: 'checkbox',
            'aria-checked': state === 'indeterminate' ? ('mixed' as const) : state === 'checked',
            'aria-label': label,
            'aria-disabled': disabled || undefined,
          })}
      className={cx('ssg-row-checkbox', slot?.className)}
      style={slot?.style}
      data-state={state}
      data-disabled={disabled ? 'true' : undefined}
    />
  );
}

export const RowSelectionCheckbox = memo(RowSelectionCheckboxInner);

export default RowSelectionCheckbox;