// checkbox エディタの列のセル(押すと値を反転)。React 版の editors/CheckboxCell.tsx と同じ DOM と class。
import type { GridResolvedSlot } from '../model/gridTypes';
import { RowSelectionCheckbox } from '../view/RowSelectionCheckbox';
import { markClickTarget } from '../primitives/clickTarget';

type CheckboxCellProps = {
  checked: boolean;
  readOnly: boolean;
  onToggle: () => void;
  slot?: GridResolvedSlot | undefined;
  label?: string | undefined;
};

export function CheckboxCell(props: CheckboxCellProps) {
  return (
    <span
      role="checkbox"
      aria-checked={props.checked ? 'true' : 'false'}
      aria-label={props.label}
      aria-disabled={props.readOnly ? 'true' : undefined}
      class="ssg-cell-checkbox"
      ref={markClickTarget}
      onClick={() => {
        if (!props.readOnly) {
          props.onToggle();
        }
      }}
    >
      <RowSelectionCheckbox slot={props.slot} state={props.checked ? 'checked' : 'unchecked'} disabled={props.readOnly} />
    </span>
  );
}