// 追加(英語対応): 機能だけが使う文言の既定(日本語)です。機能ごとの表で、その機能(React 版の features/<名前>)だけが
//   読み込みます(使わない構成の初期 JS に入れないため。/lite)。キーと意味は gridTypes.core の GridLocaleText、英語は locales/en.ts。
//   表を機能ごとのファイルに分けないのは、全部入りで文言が離れて置かれ gzip が約 0.4KB 増えたため。
import type { GridLocaleText } from '../model/gridTypes.core';

// 選択範囲の集計(selectionAggregates の機能)
export const DEFAULT_AGGREGATES_LOCALE_TEXT = {
  aggregateAverage: '平均',
  aggregateCount: 'データの個数',
  aggregateSum: '合計',
  aggregateComputing: '集計中… {percent}%',
  aggregatePartial: '読み込み済みの行のみ',
} satisfies Partial<GridLocaleText>;

// フィルターのチップのバーと管理(filtering の機能とツールパネル)
export const DEFAULT_FILTERING_LOCALE_TEXT = {
  clearAll: 'すべてクリア',
  groupedColumnTitle: '{column}(グループ化中)',
  filterHiddenColumn: '(非表示列)',
  filterGroupedColumn: '(グループ化中)',
  filterJumpUnavailable: '非表示列のためジャンプ編集できません(× でクリアは可能)',
  filterEditUnderGroup: 'グループの列の見出しの下で編集',
  filterJump: 'この列へジャンプして編集',
  filterEditFor: '{column} のフィルターを編集',
  filterClear: 'この列のフィルターをクリア',
  filterClearFor: '{column} のフィルターをクリア',
  filterCurrentNone: '（なし）',
  filterCurrentExcluded: '{count}件を除外中',
  filterCurrentSelected: '{count}件を選択中',
} satisfies Partial<GridLocaleText>;

// 行グループの行(grouping の機能)
export const DEFAULT_GROUPING_LOCALE_TEXT = {
  expandGroup: '{group} を展開',
  collapseGroup: '{group} を折りたたみ',
  groupRowCount: '({count}件)',
} satisfies Partial<GridLocaleText>;

// 行ドラッグのハンドル(rowDrag の機能)
export const DEFAULT_ROW_DRAG_LOCALE_TEXT = {
  dragRow: 'ドラッグで行を移動',
  dragRowDisabled: 'ソート / フィルター適用中は行を並び替えできません',
  dragRowLabel: '行 {row}',
} satisfies Partial<GridLocaleText>;

// スクロールの吹き出しとものさし(scrollHint の機能)
export const DEFAULT_SCROLL_HINT_LOCALE_TEXT = {
  scrollHintRow: '行 {row}',
  scrollHintJump: '行 {row} へ',
  scrollHintJumpSeparator: '・',
  scrollHintTenThousands: '{value}万',
} satisfies Partial<GridLocaleText>;

// 列メニュー(columnMenu の機能)
export const DEFAULT_COLUMN_MENU_LOCALE_TEXT = {
  menuFilter: 'フィルター…',
  menuSortAscending: '昇順で並び替え',
  menuSortDescending: '降順で並び替え',
  menuManageSort: '並び替えを管理…',
  menuManageFilters: 'フィルターを管理…',
  menuGroupBy: 'この列でグループ化',
  menuUngroup: 'グループ化を外す',
  menuPin: '列の固定',
  menuPinNone: '固定しない',
  menuPinLeft: '左に固定',
  menuPinRight: '右に固定',
  menuPinUnavailable: 'onColumnsChange 未指定のため固定状態を変更できません',
  menuAutosize: 'この列の幅を自動調整',
  menuAutosizeAll: 'すべての列の幅を自動調整',
  menuColumns: '列の表示',
  menuResetColumns: '列のリセット',
  menuResetUnavailable: 'onColumnsChange 未指定のため列をリセットできません',
} satisfies Partial<GridLocaleText>;

// セル内検索のバー(find の機能)
export const DEFAULT_FIND_LOCALE_TEXT = {
  findLabel: 'セル内検索',
  findPlaceholder: '検索',
  findInput: '検索文字列',
  findSearching: '検索中…',
  findNoResults: '0 件',
  findPrevious: '前のヒットへ',
  findPreviousHint: '前へ(Shift+Enter)',
  findNext: '次のヒットへ',
  findNextHint: '次へ(Enter)',
  findClose: '検索を閉じる',
  findCloseHint: '閉じる(Esc)',
} satisfies Partial<GridLocaleText>;

// フィルハンドル(fillHandle の機能)
export const DEFAULT_FILL_HANDLE_LOCALE_TEXT = {
  fillOptions: 'オートフィル オプション',
  fillOptionsCurrent: 'オートフィル オプション({kind})',
  fillSeries: '連続データ',
  fillCopy: 'セルのコピー',
} satisfies Partial<GridLocaleText>;

// サーバーの読み込み / 保存の失敗のバー(serverSide の機能)
export const DEFAULT_SERVER_SIDE_LOCALE_TEXT = {
  loadFailed: '行の取得に失敗しました({count} ブロック)',
  dismissLoadError: 'エラー通知を閉じる',
  saveFailed: '変更の保存に失敗しました({count} 行)。値を元に戻しました',
  dismissSaveError: '保存エラー通知を閉じる',
} satisfies Partial<GridLocaleText>;