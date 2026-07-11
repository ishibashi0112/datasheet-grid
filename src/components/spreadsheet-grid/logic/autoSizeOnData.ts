// 追加: prop autoSizeColumns による「データ投入時の列幅自動フィット」の発火判定です。
//   計測本体(canvas / 実 DOM)は列メニュー「すべての列の幅を自動調整」と同一エンジン
//   (useColumnAutosizeRunner の runAutosize)を再利用し、本モジュールは「いつ叩くか」だけを
//   純関数として切り出します。jsdom では canvas 計測が no-op になり幅を直接検証できないため、
//   発火判定をここへ分離して単体テスト可能にしています(logic/ への純関数抽出方針)。
import type { AutoSizeColumnsMode } from '../model/gridTypes';

// autoSizeColumns の発火判定です。effect はこの結果に従って runAutosize を呼びます。
//   戻り値:
//     shouldRun               = runAutosize を呼ぶべきか。
//     nextHasAutoSizedOnMount  = 'onMount' の「発火済み」フラグの次値(呼び出し側が ref へ書き戻す)。
export const resolveAutoSizeOnData = (params: {
  // グリッド prop の autoSizeColumns(既定 false)。
  mode: AutoSizeColumnsMode;
  // serverSide(dataSource)か。true のときは常に発火しません(未ロード行を測れないため)。
  isServerSide: boolean;
  // clientSide のビュー元データ件数(= rows.length)。0 のときは測る対象が無いため発火しません。
  rowCount: number;
  // 'onMount' の発火済みフラグの現在値。
  hasAutoSizedOnMount: boolean;
}): { shouldRun: boolean; nextHasAutoSizedOnMount: boolean } => {
  const { mode, isServerSide, rowCount, hasAutoSizedOnMount } = params;

  // 無効 / serverSide / 空データは発火しません(フラグは据え置き)。
  if (mode === false || isServerSide || rowCount === 0) {
    return { shouldRun: false, nextHasAutoSizedOnMount: hasAutoSizedOnMount };
  }

  // 'onMount' は初回にデータが載った一度きり。以後(フラグ true)は発火しません。
  if (mode === 'onMount') {
    return hasAutoSizedOnMount
      ? { shouldRun: false, nextHasAutoSizedOnMount: true }
      : { shouldRun: true, nextHasAutoSizedOnMount: true };
  }

  // 'onDataChange' は rows 変化のたびに発火します(発火済みフラグは使いません)。
  return { shouldRun: true, nextHasAutoSizedOnMount: hasAutoSizedOnMount };
};