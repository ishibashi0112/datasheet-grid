// 追加(英語対応): 展開行トグル列のセルのボタンです(GridShell の renderDetailToggleCell が描きます)。
//   読み上げの名前を文言(localeText)から読むため部品にしました(react-refresh の lint のため GridShell.tsx の外)。
//   変更(1.3.0 / 要望): 名前にどの行かを入れます(「行 7 の詳細を開く」。rowNumber は行見出しと同じ番号)。
import type { CellRenderContext } from '../model/gridTypes';
import { formatLocaleText } from '@ishibashi0112/spreadsheet-grid-core/internal/logic/localeText';
import { useGridLocaleText } from '../hooks/useGridLocaleText';

export function DetailToggleButton({
  detail,
  rowNumber,
  onPress,
}: {
  detail: NonNullable<CellRenderContext<unknown>['detail']>;
  rowNumber: number;
  // 追加(1.4.1 / AP-11 のレビュー): 押してフォーカスをグリッドへ移した直後に呼びます(開いたままの custom エディタの編集を
  //   終える。core editController の endEditLeftOpen。セルを押したときと同じ)。
  onPress?: (() => void) | undefined;
}) {
  const texts = useGridLocaleText();
  return (
    <button
      type="button"
      // 変更(dogfood DF-08): Tab の順番に入れません(キーボードではトグル列のセルで Enter / Space。DU-04)。
      tabIndex={-1}
      className="ssg-detail-toggle"
      aria-expanded={detail.expanded}
      aria-label={formatLocaleText(detail.expanded ? texts.hideDetails : texts.showDetails, { row: rowNumber })}
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
        onPress?.();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {detail.expanded ? '▾' : '▸'}
    </button>
  );
}