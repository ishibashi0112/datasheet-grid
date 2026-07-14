// 追加(editor: checkbox): checkbox 列の既定セル描画です(直接トグル方式・編集セッションなし)。
//   glyph は行選択チェックボックス(RowSelectionCheckbox)を再利用し、role / aria-checked は
//   wrapper に付与します。クリックで即トグルします(セル選択の pointerdown と共存 — click は
//   同一要素で down/up した時のみ発火するため、ドラッグ範囲選択では誤トグルしません)。
//   ダブルクリックは click 2 回(トグル往復)として扱われます(Excel / AG Grid と同様)。
import { RowSelectionCheckbox } from '../view/RowSelectionCheckbox';

type CheckboxCellProps = {
  checked: boolean;
  readOnly: boolean;
  onToggle: () => void;
};

export function CheckboxCell({ checked, readOnly, onToggle }: CheckboxCellProps) {
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
        state={checked ? 'checked' : 'unchecked'}
        disabled={readOnly}
      />
    </span>
  );
}

export default CheckboxCell;