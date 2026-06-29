import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

type DefaultGridTopBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
  // 追加: 件数/フィルター/ソートの summary chips を表示するかどうかです(既定 true)。
  showSummary?: boolean;
  // 追加: グローバルフィルター入力欄を表示するかどうかです(既定 true)。
  showFilter?: boolean;
  // 追加: summary 内の Rows / Columns 件数 chips を表示するかどうかです(既定 true)。
  //   showSummary=true のときのみ効きます(Filter / Sort chips は本値の影響を受けません)。
  showCounts?: boolean;
};

// 追加: Grid 上部の既定ツールバーです。summary chips(左) と グローバルフィルター入力(右) の
//       2 パートからなり、それぞれ showSummary / showFilter で独立に出し分けできます。
//       summary 内の Rows / Columns 件数 chips はさらに showCounts で出し分けできます。
//       summary / filter が両方 false の場合は呼び出し側(SpreadsheetGrid)がそもそも本バーを
//       描画しません(空バーは出しません)。
// 変更(UI CSS移行): インライン style(gridBarStyles)を撤去し、styles.css の .ssg-bar-* クラスへ移行。
// 変更(バー内訳): summary / filter を showSummary / showFilter で条件描画します。filter 単独時の
//       左寄せ・幅は styles.css の `.ssg-bar-input-group:only-child` が担います。
// 変更(件数トグル): summary 内の Rows / Columns 件数 chips を showCounts で出し分けます。
export function DefaultGridTopBar<T>({
  context,
  showSummary = true,
  showFilter = true,
  showCounts = true,
}: DefaultGridTopBarProps<T>) {
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  return (
    <div className="ssg-bar--top">
      <div className="ssg-bar-container">
        {showSummary ? (
          <div className="ssg-bar-group ssg-bar-leading">
            <span className="ssg-bar-title">Toolbar</span>

            {showCounts ? (
              <>
                <span className="ssg-bar-chip ssg-bar-chip--emphasis">
                  {derivedSummary.rowSummaryText}
                </span>

                <span className="ssg-bar-chip ssg-bar-chip--emphasis">
                  {derivedSummary.columnSummaryText}
                </span>
              </>
            ) : null}

            <span className="ssg-bar-chip ssg-bar-chip--emphasis">
              {derivedSummary.filterSummaryText}
            </span>

            <span className="ssg-bar-chip ssg-bar-chip--emphasis">
              {derivedSummary.sortSummaryText}
            </span>
          </div>
        ) : null}

        {showFilter ? (
          // 注記(F-async UX): グローバルフィルタ適用中のローディング表示は、バーのフロー内ではなく
          //   グリッド本体に重ねる overlay(.ssg-filter-overlay / SpreadsheetGrid が描画)へ移しました。
          //   バーはローディング UI を持たないため、今後のバー改修で幅調整が不要になります。
          <div className="ssg-bar-input-group">
            <input
              type="text"
              value={context.globalFilterText}
              onChange={(event) => context.setGlobalFilterText(event.target.value)}
              placeholder="グローバルフィルター"
              className="ssg-bar-input"
            />
            {context.globalFilterText.trim().length > 0 ? (
              <button
                type="button"
                onClick={() => context.setGlobalFilterText('')}
                className="ssg-bar-clear-btn"
              >
                クリア
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DefaultGridTopBar;