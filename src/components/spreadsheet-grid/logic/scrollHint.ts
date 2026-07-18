// 追加(scrollHint): スクロール位置インジケーターの純ロジックです(React 非依存)。
//   大量行(特に 1M 行級)ではスクロールバー 1px の移動が数百〜数千行に相当し、
//   移動中に「今どの行にいるか」を見失います。scrollHint はスクロールバー脇へ
//   行番号バブル(+ batch 2 でルーラー)をオーバーレイ表示して答えます。
//   本ファイルは「オプション解決 / 疑似サム軌道の幾何 / 表示内容(hint)の解決」の
//   3 つの純関数を提供し、view(GridScrollHint)はこれらの合成に徹します。
//   行番号の算出自体は既存の縦ジオメトリ(verticalGeometry の scaleFactor 写像 +
//   RowMetrics.rowAtContentY)へ委譲するため、pixel scaling / auto-height の両経路と
//   常に数値一致します(本ファイルで座標系を二重実装しません)。

import type {
  ScrollHintOptions,
  ScrollHintRenderArgs,
  ScrollHintTrigger,
} from '../model/gridTypes';
import type { ReactNode } from 'react';

// 解決済みオプションです(view 消費用の内部型)。省略項目を既定値で埋めます。
export type ResolvedScrollHintOptions<T> = {
  bubble: boolean;
  ruler: boolean;
  trigger: ScrollHintTrigger;
  hintColumn: string | undefined;
  renderHint: ((args: ScrollHintRenderArgs<T>) => ReactNode) | undefined;
};

// scrollHint prop を解決します。undefined / false は「完全無効」で null を返し、
//   view の描画自体をスキップさせます(既存挙動への影響ゼロ)。true は全既定
//   (バブル + ルーラー / trigger='scroll')。オブジェクトは省略項目を既定で補完します。
//   bubble と ruler の両方を明示 false にした場合も表示物が無いため null です。
export const resolveScrollHintOptions = <T>(
  input: boolean | ScrollHintOptions<T> | undefined,
): ResolvedScrollHintOptions<T> | null => {
  if (input === undefined || input === false) {
    return null;
  }
  const options: ScrollHintOptions<T> = input === true ? {} : input;
  const bubble = options.bubble ?? true;
  const ruler = options.ruler ?? true;
  if (!bubble && !ruler) {
    return null;
  }
  return {
    bubble,
    ruler,
    trigger: options.trigger ?? 'scroll',
    hintColumn: options.hintColumn,
    renderHint: options.renderHint,
  };
};

// 疑似サムの最小高さ(px)です。ネイティブスクロールバーの実サム高は取得できないため、
//   バブルのアンカー位置は「同じ可動域写像の疑似サム」で近似します(macOS の
//   オーバーレイスクロールバーとも視覚的に整合する慣用値)。
export const SCROLL_HINT_MIN_THUMB_PX = 30;

export type ScrollHintTrackParams = {
  // 物理 scrollTop(スクロールコンテナの scrollTop そのもの)。
  scrollTop: number;
  // スクロールコンテナのコンテンツ全高(= headerHeight + physicalBodyHeight)。
  contentHeight: number;
  // スクロールコンテナの可視高さ(clientHeight)。
  viewportHeight: number;
};

export type ScrollHintTrack = {
  // 物理スクロール可動域(= contentHeight - viewportHeight)。
  maxScroll: number;
  // 疑似サムの上端 / 高さ(トラック = viewport 全高基準)。
  thumbTop: number;
  thumbHeight: number;
  // 疑似サム中心の y(バブルのアンカー位置)。
  centerY: number;
};

// 疑似サムの軌道を計算します。スクロール不能(コンテンツが viewport に収まる)なら null を
//   返し、view はインジケーター全体を描画しません(ヒントの出しようがないため)。
export const computeScrollHintTrack = ({
  scrollTop,
  contentHeight,
  viewportHeight,
}: ScrollHintTrackParams): ScrollHintTrack | null => {
  const maxScroll = contentHeight - viewportHeight;
  if (viewportHeight <= 0 || maxScroll <= 0) {
    return null;
  }
  const thumbHeight = Math.min(
    Math.max(
      (viewportHeight * viewportHeight) / contentHeight,
      SCROLL_HINT_MIN_THUMB_PX,
    ),
    viewportHeight,
  );
  const clampedScrollTop = Math.min(Math.max(scrollTop, 0), maxScroll);
  const thumbTop =
    (clampedScrollTop / maxScroll) * (viewportHeight - thumbHeight);
  return {
    maxScroll,
    thumbTop,
    thumbHeight,
    centerY: thumbTop + thumbHeight / 2,
  };
};

// ルーラー目盛りの最小ラベル間隔(px)です。これを下回らない「切りのよい」行数刻みを選びます。
export const SCROLL_HINT_RULER_MIN_TICK_SPACING_PX = 44;

// raw 以上で最小の「切りのよい」刻み(1 / 2 / 2.5 / 5 × 10^k)を返します。
//   2.5 系は 10^k >= 10 のときのみ採用します(整数刻みを保つため。25 / 250 / 2,500 …)。
export const niceStepAtLeast = (raw: number): number => {
  const clamped = Math.max(raw, 1);
  const pow = 10 ** Math.floor(Math.log10(clamped));
  const multipliers = pow < 10 ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  for (const multiplier of multipliers) {
    const step = pow * multiplier;
    if (step >= clamped) {
      return step;
    }
  }
  return pow * 10;
};

// ルーラー目盛りラベルの表示値です。日本語 UI 向けに 1 万以上の切りのよい値は「N万」へ
//   圧縮します(例: 100000 → '10万')。それ以外は桁区切りの数値文字列です。
export const formatScrollHintRulerValue = (value: number): string =>
  value >= 10_000 && value % 10_000 === 0
    ? `${(value / 10_000).toLocaleString()}万`
    : value.toLocaleString();

export type ScrollHintRulerTick = {
  // 目盛りが指す行数値(0 始まりのスケール値。行 id ではなく「ものさし」の目盛りです)。
  row: number;
  // ルーラー領域(ボディ可視域)上端からのオフセット(px)。
  y: number;
  label: string;
};

export type ScrollHintRulerParams = {
  rowCount: number;
  // ルーラーの描画高さ(= viewportHeight - headerHeight)。
  rulerHeight: number;
  minTickSpacingPx?: number;
};

// ルーラーの目盛り列を計算します。0 から rowCount まで、最小ラベル間隔を守る
//   切りのよい刻みで打ちます(rowCount が刻みの倍数でない場合、最終目盛りは
//   rowCount 以下の最大倍数です)。y は行数比例(row / rowCount)のスケール配置です。
export const computeScrollHintRulerTicks = ({
  rowCount,
  rulerHeight,
  minTickSpacingPx = SCROLL_HINT_RULER_MIN_TICK_SPACING_PX,
}: ScrollHintRulerParams): ScrollHintRulerTick[] => {
  if (rowCount <= 0 || rulerHeight <= 0) {
    return [];
  }
  const maxTicks = Math.max(Math.floor(rulerHeight / minTickSpacingPx), 2);
  const step = niceStepAtLeast(rowCount / maxTicks);
  const ticks: ScrollHintRulerTick[] = [];
  for (let value = 0; value <= rowCount; value += step) {
    ticks.push({
      row: value,
      y: (value / rowCount) * rulerHeight,
      label: formatScrollHintRulerValue(value),
    });
  }
  return ticks;
};

// トラック(スクロールバー領域)上のポインタ y から、ネイティブスクロールバーの
//   クリック/ドラッグと同じ写像(サム中心基準)でジャンプ先の物理 scrollTop を求めます。
//   ルーラーのホバープレビュー(「ここに飛ぶと行 N」)の行解決に使います。
export const computeScrollHintTrackPointerScrollTop = (
  pointerY: number,
  track: ScrollHintTrack,
  viewportHeight: number,
): number => {
  const range = viewportHeight - track.thumbHeight;
  if (range <= 0) {
    return 0;
  }
  const fraction = Math.min(
    Math.max((pointerY - track.thumbHeight / 2) / range, 0),
    1,
  );
  return fraction * track.maxScroll;
};

// バブル / ジャンププレビューの「行番号に添える表示内容(detail)」を解決します。
//   優先順位: renderHint > hintColumn > なし(null = 行番号のみの既定表示)。
//   - renderHint の null / undefined / false 返却は「既定表示へフォールバック」の合図です。
//   - hintColumn は rowData 必須です。SSRM の未ロード行・グルーピングのグループ行では
//     rowData が undefined になるため自動的に行番号のみへフォールバックします
//     (プレースホルダ的な誤値を出さないための仕様)。列値の null / undefined / 空文字も
//     同様にフォールバックします。
export const resolveScrollHintDetail = <T>(
  options: Pick<ResolvedScrollHintOptions<T>, 'hintColumn' | 'renderHint'>,
  args: ScrollHintRenderArgs<T>,
): ReactNode => {
  if (options.renderHint !== undefined) {
    const rendered = options.renderHint(args);
    return rendered === undefined || rendered === null || rendered === false
      ? null
      : rendered;
  }
  if (options.hintColumn !== undefined && args.rowData !== undefined) {
    const value = (args.rowData as Record<string, unknown>)[options.hintColumn];
    if (value === undefined || value === null || value === '') {
      return null;
    }
    return String(value);
  }
  return null;
};