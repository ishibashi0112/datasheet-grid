// 追加(英語対応): 展開行トグル列のセルのボタンです(GridShell の renderDetailToggleCell が描きます)。
//   読み上げの名前を文言(localeText)から読むため部品にしました(react-refresh の lint のため GridShell.tsx の外)。
import type { CellRenderContext } from '../model/gridTypes';
import { useGridLocaleText } from '../hooks/useGridLocaleText';

export function DetailToggleButton({ detail }: { detail: NonNullable<CellRenderContext<unknown>['detail']> }) {
  const texts = useGridLocaleText();
  return (
    <button
      type="button"
      // 変更(dogfood DF-08): Tab の順番に入れません(キーボードではトグル列のセルで Enter / Space。DU-04)。
      tabIndex={-1}
      className="ssg-detail-toggle"
      aria-expanded={detail.expanded}
      aria-label={detail.expanded ? texts.hideDetails : texts.showDetails}
      onClick={detail.toggle}
      // 変更(dogfood DF-16): ▸ / ▾ は開閉だけにして、アクティブセルと選択を動かしません(セルの pointerdown は
      //   GridBodyLayer がこのボタンから始まったものを無視する)。これまではトグル列(合成列)がアクティブセルになり、
      //   onActiveCellChange に null が来ていました(アクティブセルに連動させた詳細パネルが、展開しただけで空になる)。
      //   続けてキー操作できるよう、フォーカスはボタンではなくグリッドへ置きます(セルを押したときと同じ)。
      //   変更(別視点のレビュー): 伝播は止めません(止めると window まで届かず、開いている右クリックメニューや
      //   ポップオーバーが外側の pointerdown で閉じなかった)。
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.currentTarget.closest<HTMLElement>('.ssg-shell')?.focus({ preventScroll: true });
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {detail.expanded ? '▾' : '▸'}
    </button>
  );
}