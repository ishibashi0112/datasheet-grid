// 追加(editor: checkbox): checkbox 列の既定セル描画です(直接トグル方式・編集セッションなし)。
//   glyph は行選択チェックボックス(RowSelectionCheckbox)を再利用し、role / aria-checked は
//   wrapper に付与します。クリックで即トグルします(セル選択の pointerdown と共存 — click は
//   同一要素で down/up した時のみ発火するため、ドラッグ範囲選択では誤トグルしません)。
//   ダブルクリックは click 2 回(トグル往復)として扱われます(Excel / AG Grid と同様)。
import { RowSelectionCheckbox } from '../view/RowSelectionCheckbox';
import type { GridResolvedSlot } from '../model/gridTypes';

type CheckboxCellProps = {
  checked: boolean;
  readOnly: boolean;
  onToggle: () => void;
  // 追加(slot-props): classNames.checkbox の解決済みスロット(glyph へ転送)。
  slot?: GridResolvedSlot;
};

export function CheckboxCell({
  checked,
  readOnly,
  onToggle,
  slot,
}: CheckboxCellProps) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-disabled={readOnly || undefined}
      className="ssg-cell-checkbox"
      onClick={() => {
        if (!readOnly) {
          onToggle();
        }
      }}
    >
      <RowSelectionCheckbox
        slot={slot}
        state={checked ? 'checked' : 'unchecked'}
        disabled={readOnly}
      />
    </span>
  );
}

export default CheckboxCell;