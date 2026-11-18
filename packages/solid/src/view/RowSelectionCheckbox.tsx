// チェックボックスの見た目(行の選択 / 全選択 / checkbox エディタのセルで共用)。React 版の view/RowSelectionCheckbox.tsx と
//   同じ DOM と class。label を渡したときだけ読み上げの名前と役割(checkbox)を持ちます(無いときは飾り = aria-hidden)。
import type { GridResolvedSlot } from '../model/gridTypes';

export type RowCheckboxState = 'unchecked' | 'checked' | 'indeterminate';

type RowSelectionCheckboxProps = {
  state: RowCheckboxState;
  disabled?: boolean | undefined;
  slot?: GridResolvedSlot | undefined;
  label?: string | undefined;
};

export function RowSelectionCheckbox(props: RowSelectionCheckboxProps) {
  const labelled = () => props.label !== undefined;
  return (
    <span
      aria-hidden={labelled() ? undefined : 'true'}
      role={labelled() ? 'checkbox' : undefined}
      aria-checked={
        labelled() ? (props.state === 'indeterminate' ? 'mixed' : props.state === 'checked' ? 'true' : 'false') : undefined
      }
      aria-label={props.label}
      aria-disabled={labelled() && props.disabled ? 'true' : undefined}
      class={['ssg-row-checkbox', props.slot?.className]}
      style={props.slot?.style}
      data-state={props.state}
      data-disabled={props.disabled ? 'true' : undefined}
    />
  );
}