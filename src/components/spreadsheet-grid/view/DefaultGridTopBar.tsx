import type { ReactNode } from 'react';
import type { SpreadsheetGridSlotContext } from '../model/gridTypes';

// 追加(F-filter UI): 既定の左アイコン(検索)です。zero-dep のためインライン SVG で持ち、currentColor で
//   .ssg-bar-input-icon の color を継承します。グローバルフィルタ(全列横断のテキスト検索)を示す虫眼鏡。
const DEFAULT_FILTER_ICON: ReactNode = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.6" y1="10.6" x2="14.5" y2="14.5" />
  </svg>
);

// 追加(F-filter UI): クリア(×)アイコンです。入力枠の内側右に置くボタンに使います。
const CLEAR_ICON: ReactNode = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="4" y1="4" x2="12" y2="12" />
    <line x1="12" y1="4" x2="4" y2="12" />
  </svg>
);

type DefaultGridTopBarProps<T> = {
  context: SpreadsheetGridSlotContext<T>;
  // 追加: 件数/フィルター/ソートの summary chips を表示するかどうかです(既定 true)。
  showSummary?: boolean;
  // 追加: グローバルフィルター入力欄を表示するかどうかです(既定 true)。
  showFilter?: boolean;
  // 追加: summary 内の Rows / Columns 件数 chips を表示するかどうかです(既定 true)。
  //   showSummary=true のときのみ効きます(Filter / Sort chips は本値の影響を受けません)。
  showCounts?: boolean;
  // 追加: グローバルフィルター入力の placeholder です(未指定時は既定文言)。
  globalFilterPlaceholder?: string;
  // 追加: グローバルフィルター入力の左アイコンです。undefined=組み込み検索アイコン / null(など falsy)=
  //   アイコン無し / 任意 ReactNode=差し替え。
  globalFilterIcon?: ReactNode;
  // 追加(FM-3): Filters chip クリック時のハンドラです(SpreadsheetGrid がフィルター管理
  //   パネルのトグルを渡します)。指定時のみ chip を button 化し(.ssg-bar-chip--action)、
  //   未指定時は従来どおり非クリックの span です(フィルター機能無効時の互換)。
  onFilterSummaryClick?: () => void;
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
// 変更(F-filter UI): フィルター入力を adornment 構造にしました。入力枠(.ssg-bar-input-group)の内側に
//       [左アイコン][input][× クリア] を収め、クリアは外出しボタンから入力内側の × へ移行。
//       placeholder は globalFilterPlaceholder、左アイコンは globalFilterIcon で差し替え可能です。
export function DefaultGridTopBar<T>({
  context,
  showSummary = true,
  showFilter = true,
  showCounts = true,
  globalFilterPlaceholder = 'グローバルフィルター',
  globalFilterIcon,
  onFilterSummaryClick,
}: DefaultGridTopBarProps<T>) {
  // 追加: slot context が持つ派生 summary を使います。
  const { derivedSummary } = context;

  // undefined のときだけ既定アイコン。null など falsy なら「アイコン無し」、ReactNode はそのまま差し替え。
  const filterIconNode =
    globalFilterIcon === undefined ? DEFAULT_FILTER_ICON : globalFilterIcon;
  const hasFilterText = context.globalFilterText.trim().length > 0;

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

            {/* 追加(FM-3): onFilterSummaryClick 指定時は Filters chip をクリック可能にします
                (クリックでフィルター管理パネルをトグル)。pointerdown を stopPropagation する
                のは、パネル表示中の chip クリックが「pointerdown の outside-close → click の
                再オープン」と相殺してトグルにならないのを防ぐためです(パネル root と同じ作法)。 */}
            {onFilterSummaryClick ? (
              <button
                type="button"
                className="ssg-bar-chip ssg-bar-chip--emphasis ssg-bar-chip--action"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={onFilterSummaryClick}
                title="フィルター管理パネルを開閉"
                aria-label="フィルター管理パネルを開閉"
              >
                {derivedSummary.filterSummaryText}
              </button>
            ) : (
              <span className="ssg-bar-chip ssg-bar-chip--emphasis">
                {derivedSummary.filterSummaryText}
              </span>
            )}

            <span className="ssg-bar-chip ssg-bar-chip--emphasis">
              {derivedSummary.sortSummaryText}
            </span>
          </div>
        ) : null}

        {showFilter ? (
          // 注記(F-async UX): グローバルフィルタ適用中のローディング表示は、バーのフロー内ではなく
          //   グリッド本体に重ねる overlay(.ssg-filter-overlay / SpreadsheetGrid が描画)へ移しました。
          // 変更(F-filter UI): 入力枠の内側に [左アイコン][input][× クリア] を収めます。枠の border /
          //   背景 / フォーカスリングは .ssg-bar-input-group 側、input 自身は枠なし・透明です。
          <div className="ssg-bar-input-group">
            {filterIconNode ? (
              <span className="ssg-bar-input-icon" aria-hidden="true">
                {filterIconNode}
              </span>
            ) : null}
            <input
              type="text"
              value={context.globalFilterText}
              onChange={(event) => context.setGlobalFilterText(event.target.value)}
              placeholder={globalFilterPlaceholder}
              className="ssg-bar-input"
            />
            {hasFilterText ? (
              <button
                type="button"
                onClick={() => context.setGlobalFilterText('')}
                className="ssg-bar-input-clear"
                aria-label="フィルターをクリア"
                title="クリア"
              >
                {CLEAR_ICON}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DefaultGridTopBar;