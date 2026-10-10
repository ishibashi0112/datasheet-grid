import Link from 'next/link';
import type { Metadata } from 'next';
import { HeroGridDemo } from '@/components/demo/hero-grid-demo';
import { InstallCommand } from '@/components/install-command';

export const metadata: Metadata = {
  title: 'SpreadsheetGrid — 有料グリッドの機能を、MIT で。',
  description:
    'サーバーサイド行モデル・行グルーピングと集計・Master/Detail・範囲選択とクリップボードを MIT で。IME に強い Excel ライクな編集、100 万行の仮想化、Tailwind / Mantine / HeroUI と共存する React 19 製データグリッド。',
};

// 変更(F-1 / 打ち出し): ヒーローは「有料級の機能を MIT で」を言い切り、直下に根拠(他にない 5 つ → 他社比較表)を置く。
const PROOF_CHIPS = ['SSRM(サーバーサイド行モデル)', '行グルーピング + 集計', 'Master/Detail', '範囲選択 + コピペ', 'set フィルター'];

const BULLETS = [
  '100 万行対応の仮想化 + 3 ペイン固定列',
  'Excel ライクな編集・undo/redo(IME 対応)',
  'Tailwind / Mantine / HeroUI と共存する CSS 設計',
];

// 他にない 5 つ(他社グリッドに相当機能が無い、または日本語環境で差が出るもの)。
const UNIQUE = [
  {
    kicker: 'IME',
    title: 'IME に強い編集',
    body: '変換中の Enter でセルを確定しない。IME をオンのまま直接入力(imeDirectInput)。文節単位の折り返し。',
    href: '/docs/guides/editing',
  },
  {
    kicker: 'LABEL ROW',
    title: 'ラベル行',
    body: '見出し / 区切り行を rows に混ぜて全幅の帯で描画。ヘッダー直下への固定(sticky)にも対応。',
    href: '/docs/guides/label-rows',
  },
  {
    kicker: 'SCROLL HINT',
    title: 'スクロール位置インジケーター',
    body: '100 万行でも「今どの行か」を見失わない行番号バブルとルーラー、ジャンプ先プレビュー。',
    href: '/docs/guides/scroll-hint',
  },
  {
    kicker: 'SSRM',
    title: '書き戻し付き SSRM',
    body: 'サーバー取得だけでなく、セル編集の書き戻し(楽観更新と失敗時ロールバック)まで内蔵。',
    href: '/docs/guides/ssrm',
  },
  {
    kicker: 'CSS',
    title: '共存する CSS 設計',
    body: 'Tailwind v3 / v4、Mantine、HeroUI、StyleX と衝突しない未レイヤー・単一クラスの基底スタイル。',
    href: '/docs/guides/theming',
  },
];

// 他社比較(各社の区分は 2026-10-10 時点の公式ドキュメントの把握。価格は記載しない)。
type Tier = 'mit' | 'free' | 'paid' | 'ent' | 'none';
type CompareRow = { feature: string; cells: [string, string, string, string]; tiers: [Tier, Tier, Tier, Tier] };
const COMPARE_HEADERS = ['機能', 'SpreadsheetGrid', 'AG Grid', 'Handsontable', 'MUI X Data Grid'];
const COMPARE: CompareRow[] = [
  { feature: '仮想化(〜100 万行)', cells: ['MIT', 'Community', '商用有料', 'Community'], tiers: ['mit', 'free', 'paid', 'free'] },
  { feature: '列ピン留め(3 ペイン)', cells: ['MIT', 'Community', '商用有料', 'Pro'], tiers: ['mit', 'free', 'paid', 'ent'] },
  { feature: '範囲選択 + コピー & ペースト', cells: ['MIT', 'Enterprise', '商用有料', 'Premium'], tiers: ['mit', 'ent', 'paid', 'ent'] },
  { feature: '行グルーピング + 集計', cells: ['MIT', 'Enterprise', '—', 'Premium'], tiers: ['mit', 'ent', 'none', 'ent'] },
  { feature: 'Master/Detail(展開行)', cells: ['MIT', 'Enterprise', '—', 'Pro'], tiers: ['mit', 'ent', 'none', 'ent'] },
  { feature: 'サーバーサイド行モデル(+ 書き戻し)', cells: ['MIT', 'Enterprise', '—', 'Pro'], tiers: ['mit', 'ent', 'none', 'ent'] },
  { feature: 'set フィルター(値の一覧で絞り込み)', cells: ['MIT', 'Enterprise', '商用有料', '—'], tiers: ['mit', 'ent', 'paid', 'none'] },
  { feature: 'フィルター管理パネル', cells: ['MIT', 'Enterprise', '—', 'Pro'], tiers: ['mit', 'ent', 'none', 'ent'] },
  { feature: 'コンテキストメニュー', cells: ['MIT', 'Enterprise', '商用有料', '—'], tiers: ['mit', 'ent', 'paid', 'none'] },
  { feature: 'undo / redo', cells: ['MIT', 'Community', '商用有料', '—'], tiers: ['mit', 'free', 'paid', 'none'] },
  { feature: '行ドラッグ並び替え', cells: ['MIT', 'Community', '商用有料', 'Pro'], tiers: ['mit', 'free', 'paid', 'ent'] },
  { feature: 'Excel エクスポート', cells: ['MIT(任意ライター)', 'Enterprise', '—', 'Premium'], tiers: ['mit', 'ent', 'none', 'ent'] },
  { feature: 'IME 対応の編集(変換中 Enter を確定しない)', cells: ['MIT(明示)', '明示なし', '明示なし', '明示なし'], tiers: ['mit', 'none', 'none', 'none'] },
  { feature: 'ラベル行 / スクロール位置インジケーター', cells: ['MIT(独自)', '—', '—', '—'], tiers: ['mit', 'none', 'none', 'none'] },
];

const TIER_CLASS: Record<Tier, string> = {
  mit: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  free: 'bg-fd-muted text-fd-muted-foreground',
  paid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ent: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  none: 'text-fd-muted-foreground',
};

const FEATURES = [
  {
    title: '仮想化',
    body: '〜100 万行をスムーズに',
    href: '/docs/guides/large-data',
  },
  {
    title: '編集',
    body: 'エディタ 6 種 + バリデーション',
    href: '/docs/guides/editing',
  },
  {
    title: 'SSRM',
    body: 'サーバ取得 + 書き戻し',
    href: '/docs/guides/ssrm',
  },
  {
    title: 'グルーピング',
    body: '階層 + 集計',
    href: '/docs/guides/grouping',
  },
];

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-6 py-12 lg:grid-cols-[5fr_7fr] lg:py-16">
        <div>
          <p className="text-xs font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
            MIT LICENSE / REACT 19 / TYPESCRIPT
          </p>
          <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            <span className="inline-block">有料グリッドの機能を、</span>
            <span className="inline-block">MIT で。</span>
          </h1>
          <p className="mt-4 text-fd-muted-foreground">
            サーバーサイド行モデル、行グルーピングと集計、Master/Detail、範囲選択とクリップボード。AG Grid なら
            Enterprise の機能が、ライセンス不要で使えます。
            <span className="lg:hidden">下</span>
            <span className="hidden lg:inline">右</span>
            のグリッドは実物です — セルをダブルクリック(タッチはダブルタップ)して編集してみてください。
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="MIT で使える有料級の機能">
            {PROOF_CHIPS.map((text) => (
              <li
                key={text}
                className="rounded-full border border-emerald-600/40 px-2.5 py-0.5 text-xs text-fd-foreground dark:border-emerald-400/40"
              >
                {text}
              </li>
            ))}
          </ul>
          <ul className="mt-5 space-y-1.5 text-sm">
            {BULLETS.map((text) => (
              <li key={text} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-0.5 text-emerald-600 dark:text-emerald-400"
                >
                  ▣
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/docs"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
            >
              はじめる
            </Link>
            <InstallCommand />
          </div>
        </div>
        <HeroGridDemo />
      </div>

      {/* 他にない 5 つ */}
      <section className="border-t" aria-labelledby="unique-heading">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <h2 id="unique-heading" className="text-lg font-semibold">
            他にない 5 つ
          </h2>
          <p className="mt-1 text-sm text-fd-muted-foreground">日本の業務アプリで差が出るところ。</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {UNIQUE.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group rounded-xl border border-fd-border p-4 transition-colors hover:bg-fd-accent"
              >
                <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                  {item.kicker}
                </p>
                <p className="mt-1 text-sm font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                  {item.title}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-fd-muted-foreground">{item.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 他社比較 */}
      <section className="border-t" aria-labelledby="compare-heading">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <h2 id="compare-heading" className="text-lg font-semibold">
            他社なら有料の機能が、MIT で使えます
          </h2>
          <p className="mt-1 text-sm text-fd-muted-foreground">
            各社の区分は 2026-10-10 時点の公式ドキュメントによるものです。価格は記載していません。相違があればお知らせください。
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr>
                  {COMPARE_HEADERS.map((header, index) => (
                    <th
                      key={header}
                      scope="col"
                      className={
                        'border-b border-fd-border px-3 py-2 text-left text-xs font-medium text-fd-muted-foreground' +
                        (index === 1 ? ' bg-emerald-50 dark:bg-emerald-950/30' : '')
                      }
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="border-b border-fd-border px-3 py-2 text-left font-normal">
                      {row.feature}
                    </th>
                    {row.cells.map((cell, index) => (
                      <td
                        key={COMPARE_HEADERS[index + 1]}
                        className={
                          'border-b border-fd-border px-3 py-2 whitespace-nowrap' +
                          (index === 0 ? ' bg-emerald-50 dark:bg-emerald-950/30' : '')
                        }
                      >
                        <span className={'rounded px-1.5 py-0.5 text-xs ' + TIER_CLASS[row.tiers[index]]}>{cell}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fd-muted-foreground">
            SpreadsheetGrid の「MIT」はすべて追加ライセンス不要。AG Grid の Community は MIT、Enterprise は商用ライセンス。Handsontable は非商用のみ無料。MUI X の Community は MIT、Pro / Premium は商用ライセンス。
          </p>
        </div>
      </section>

      <div className="border-t">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-x divide-fd-border md:grid-cols-4">
          {FEATURES.map((feature) => (
            <Link
              key={feature.title}
              href={feature.href}
              className="group px-5 py-4 transition-colors hover:bg-fd-accent"
            >
              <p className="text-sm font-semibold group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                {feature.title}
              </p>
              <p className="text-xs text-fd-muted-foreground">{feature.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
