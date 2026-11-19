// 展開トグル列のセルのボタン(▸ / ▾)。React 版の view/DetailToggleButton.tsx と同じ DOM と class。
//   開閉は detail(renderCell の ctx.detail)から。読み上げの名前は文言(localeText)から読みます。
import type { CellDetailContext } from '@ishibashi0112/spreadsheet-grid-core';
import { useGridLocaleText } from '../context/localeText';

export function DetailToggleButton(props: { detail: CellDetailContext }) {
  const texts = useGridLocaleText();
  return (
    <button
      type="button"
      // Tab の順番に入れません(キーボードではトグル列のセルで Enter / Space。dogfood DU-04 / DF-08)。
      tabindex={-1}
      class="ssg-detail-toggle"
      aria-expanded={props.detail.expanded ? 'true' : 'false'}
      aria-label={props.detail.expanded ? texts().hideDetails : texts().showDetails}
      onClick={() => props.detail.toggle()}
      // ▸ / ▾ は開閉だけにして、アクティブセルと選択を動かしません(セルの pointerdown は GridBodyLayer がこのボタンから
      //   始まったものを無視する。dogfood DF-16)。続けてキー操作できるよう、フォーカスはグリッドへ置きます。伝播は止めません
      //   (止めると開いているポップアップが外側の pointerdown で閉じない)。
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        (event.currentTarget as HTMLElement).closest<HTMLElement>('.ssg-shell')?.focus({ preventScroll: true });
      }}
      onDblClick={(event) => event.stopPropagation()}
    >
      {props.detail.expanded ? '▾' : '▸'}
    </button>
  );
}