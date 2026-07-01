import { memo } from 'react';

// ────────────────────────────────────────────────
// 追加(行選択): CSS 描画のチェックボックス glyph です(body ガター/ヘッダ全選択で共用)。
//   実際の選択操作はガター/コーナーセルの pointer ハンドラ側が担うため、これは視覚専用
//   (aria-hidden)にしています。role/aria-checked は親セル側に付与します。
//   状態は 3 値: unchecked / checked / indeterminate(ヘッダの「一部選択」)。
// ────────────────────────────────────────────────
export type RowCheckboxState = 'unchecked' | 'checked' | 'indeterminate';

type RowSelectionCheckboxProps = {
  state: RowCheckboxState;
  // 未ロード行など、操作不可の見た目にしたいとき true。
  disabled?: boolean;
};

function RowSelectionCheckboxInner({
  state,
  disabled = false,
}: RowSelectionCheckboxProps) {
  return (
    <span
      aria-hidden="true"
      className="ssg-row-checkbox"
      data-state={state}
      data-disabled={disabled ? 'true' : undefined}
    />
  );
}

export const RowSelectionCheckbox = memo(RowSelectionCheckboxInner);

export default RowSelectionCheckbox;