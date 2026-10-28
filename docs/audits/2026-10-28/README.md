# ブラウザ対応と React 18 対応の調査(2026-10-28・v0.57.0 時点・調査のみ、ライブラリの修正なし)

広める計画の残り 2 件(⑥ ブラウザ対応の確認 / ⑦ React 18 対応の調査)の記録。ライブラリのソースは変更していない。変更したのは監査ハーネス(`audit/harness/`)だけで、Chromium 以外でも回せるようにした(使い方は同ディレクトリの README の「他のブラウザで回す」)。

## 1. 進め方と前提

- 対象: main の d72a656(v0.57.0 + ドキュメントの変更のみ)。
- 実ブラウザ: 監査ハーネス 12 本を 3 つのブラウザで回した。クラウド環境からは Playwright の Firefox / WebKit の配布元へ届かないため、次の方法で動かした。
  - Chromium 153: 従来どおり Playwright。
  - WebKit: Ubuntu の `webkit2gtk-driver`(WebKitGTK 2.52.6、Safari と同じ WebKit の Linux 版)+ Xvfb。W3C WebDriver で操作する薄い層 `audit/harness/wd.mjs` を足した。
  - Firefox 159.0: conda-forge の `firefox` / `geckodriver` パッケージ(`.conda` を展開しただけ。sha256 を repodata と照合)。同じく `wd.mjs`。Playwright の実験的な WebDriver BiDi(`firefox-bidi`)はダブルクリックが届かず使えなかった。
- WebKit だけで落ちた操作は、X のマウスイベントを直接送る `xdotool` でも試し、自動操作側の癖か本当の挙動かを切り分けた。
- WebDriver では使えない確認(CDP の IME 変換 / `page.route` / `page.clock` / `emulateMedia`)は SKIP にした: `t-lazy` 全体、`t-features` の IME(G-2)、`t-leftovers` の L-15、`t-lifecycle` の `theme="auto"` の追従。
- React 18: リポジトリの写しに React / React DOM 18.3.1 と `@types/react` 18 を入れ、jsdom のテスト・ハーネス(Chromium)・利用側アプリ(Vite)で確かめた。
- 使っている CSS / JS の機能は、ソースと dist を検索して MDN の互換データ(`@mdn/browser-compat-data`)と caniuse で対応版を引いた。

## 2. ブラウザ別の結果

PASS / 実行した確認の数(SKIP は数に入れない)。

| シナリオ | Chromium 153 | WebKitGTK 2.52.6 | Firefox 159 |
| --- | --- | --- | --- |
| t-basic | 104 / 104 | 104 / 104 | 104 / 104 |
| t-ssrm | 36 / 36 | 36 / 36 | 35 / 36(BR-1) |
| t-lifecycle | 31 / 31 | 30 / 30 | 29 / 30(BR-1) |
| t-features | 124 / 124 | 93 / 94(BR-1) | 92 / 94(BR-1 ×2) |
| t-verify | 49 / 49 | 49 / 49 | 49 / 49 |
| t-aggregates | 27 / 27 | 26 / 27(BR-2) | 26 / 27(BR-1) |
| t-total | 49 / 49 | 48 / 49(BR-5) | 48 / 49(BR-1) |
| t-fill | 74 / 74 | 72 / 74(BR-4 ×2) | 74 / 74 |
| t-big | 21 / 21 | 21 / 21 | 21 / 21 |
| t-leftovers | 24 / 24 | 15 / 15 | 15 / 15 |
| t-lazy | 25 / 25 | SKIP | SKIP |
| t-priority | 25 / 25 | 24 / 25(BR-3) | 25 / 25 |
| 計 | 589 / 589 | 518 / 524 | 518 / 524 |

- WebKit の t-fill は、BR-4 でハンドルを押せずにスクリプトが止まるため、その 2 か所だけ飛ばした写しで残りを回した数。
- React 18.3.1(後述の forwardRef の写し)でも Chromium で 589 / 589。
- Chromium はハーネスの変更後に全部回し直した。t-fill の「ハンドルを押すと開いているコンテキストメニューを閉じる」が 1 回だけ落ち(右クリックのメニューが 120ms 以内に開かなかった)、続けて 2 回回して通った。

## 3. 所見(ライブラリ側。未対応)

| ID | 重さ | ブラウザ | 実機 | 要約 | 場所 |
| --- | --- | --- | --- | --- | --- |
| BR-1 | 中 | Firefox・WebKit | ✅ | レイアウトが変わるとき(窓を 1,200px → 1,400px に広げて横スクロールバーが消えて出直す、2 つのグリッドでページのスクロールバーが出入りする、auto-height)に `ResizeObserver loop completed with undelivered notifications` が window の error として出る。表示は次のフレームで正しくなるが、エラー監視(Sentry など)に記録される。Chromium では同じ操作で出ない。ResizeObserver を包んで追うと、出る直前に動いていたのはスクロール同期の観測(見える高さ / 幅を view スライスへ書く)と `@tanstack/virtual-core` の観測で、スクロール領域が 1370×420 → 1370×408 と 1 フレームで揺れていた | `core/controllers/scrollSyncController.ts:94-99`、`react/hooks/useVirtualizerCore.ts`(virtual-core の `useAnimationFrameWithResizeObserver` は既定 false) |
| BR-2 | 低 | 全ブラウザ(幅は別) | ✅ | 件数表示あり(`showBottomBarCounts`)で 2 セル以上を選ぶと、右の件数の表記が数 px 伸びて次の行へ折り返し、下部バーが 27px → 49px に伸びて表全体がずれる。WebKit は窓 600px、Chromium は 608px で起きた(文字の幅で境目が変わる。ハーネスの 600px の確認は Chromium の文字幅でだけ通っていた) | `react/src/styles.css` の `.ssg-bar--bottom` まわり、`audit/harness/t-aggregates.mjs:80` |
| BR-3 | 低 | WebKit(要 Safari 実機) | ✅(xdotool) | 列の幅の境界をドラッグした直後、マウスが見出しの行から出るまで、他の列の見出しで並べ替えのつまみ(grip)と ⋮ が出ない。つまみの位置を押すと見出しの押下 = 列の選択になる。WebKit が `:hover` を見出しの行(`.ssg-header-row`)で止めたまま更新しない(pointermove はラベルに届くが pointerover が来ない)。幅が変わらない押下・縦に外れるドラッグでは起きず、素のページで同じ形(pointerdown を preventDefault して幅を変える)を作っても再現しないので、原因は未特定 | `react/src/styles.css:3339-3360`(`.ssg-header-actions` を `:hover` で出す)、`core/engine/columnCommands.ts:417` |
| BR-4 | 低 | WebKit(要 Mac 実機) | ✅ | 右端の列・最下行のフィルハンドルを押せない。WebKitGTK のスクロールバーは幅 0 で中身の上に重なり、端から約 12px が `elementFromPoint` でスクロール領域そのものを返す(スクロールバーの当たり判定)。ハンドルは角から 4px はみ出し、残りもその帯に入る。macOS の既定(トラックパッド)も重なる型のスクロールバーなので、Mac の Safari / Chrome でも起こりうる | `react/src/styles.css:1289-`(`.ssg-fill-handle`)、`react/src/view/FillHandleLayer.tsx` |
| BR-5 | 低 | WebKit | ✅ | 100 万行(行の位置を縮めて持つモード、縮尺 2.4)で `selectCell(999999, …, { scrollIntoView: true })` / `scrollToRow(999999, { align: 'end' })` のあと、最終行が合計行の下に 2px 隠れる(scrollTop 14,999,655 / 最大 14,999,656)。論理位置を物理位置へ直した小数のスクロール位置を WebKit が切り捨てるため(Chromium は 14,999,656)。中央寄せ(500,000 行目)でも同じ 1px の差で 2px ずれる | `core/controllers/viewportSyncController.ts:126-131`、`core/engine/gridApi.ts:176`(`logicalToPhysicalScrollTop`) |

直し方の案(どれも挙動が変わるので未着手):

- BR-1: virtual-core に `useAnimationFrameWithResizeObserver: true` を渡し、scrollSyncController の ResizeObserver も状態の更新を次のフレームへずらす(同じ値なら何もしない)。
- BR-2: 件数の欄に桁数ぶんの最小幅(`tabular-nums` + 最小幅)を持たせるか、幅が足りないときは折り返さず集計の側を細くする。
- BR-3: まず Mac の Safari で再現するか確かめる。再現すれば、見出しのボタンの表示を `:hover` だけに頼らない(pointerenter / pointerleave で属性を付ける)。
- BR-4: 選択範囲がスクロール領域の右端 / 下端に接するときはハンドルを内側へ寄せる。
- BR-5: 下端へ合わせるとき(`cellBottom > visibleBottom`、`align: 'end'`)は物理位置を切り上げる。

## 4. ハーネス側の修正(ライブラリの挙動とは無関係)

- `pw.mjs`: `SSG_AUDIT_BROWSER` でブラウザを切り替える。`SUPPORTS` で使えない機能を判定し、使えない確認は `skip()` で `SKIP` と出す(Chromium の出力は従来どおり)。
- `wd.mjs`(新規): Playwright の Page / Locator / Mouse / Keyboard のうちハーネスが使う分を W3C WebDriver で実装。
- `pasteText` / `copyText` / `t-ssrm` の貼り付け: Firefox は `new ClipboardEvent('paste', { clipboardData })` の DataTransfer を中身の無い別物に差し替えるので、自分の DataTransfer を被せる。
- `t-basic` の自動フィルター: Chromium の `innerText` は `<select>` の選択肢の文字を含むが、WebKit / Firefox は含まない。選択肢の文字を足して見る。
- `t-features` のメモのツールチップ: WebKit の `innerText` は改行が描画されていても空白で返す(描画は 2 行)。行数を描画された行の位置で数える。
- `t-total`: `scrollTop = 1e12` は WebKit で 0 になる(32 ビット整数を超える値)。1e9 にした。
- `t-verify` の RD-2: テストからクリップボードへ書けないブラウザでは「グリッドが横取りしない」だけを確かめ、貼り付けた中身の確認は SKIP。
- `t-features` の IME / `t-lifecycle` の theme auto / `t-leftovers` の L-15 / `t-lazy`: 使えない機能を SKIP。
- WebKitGTK 2.52 の WebDriver は右ボタンを離したことが伝わらない(`mouseup` の `button` が 0、`buttons` に右ボタンが残り、以降の左クリックが `pointerdown` にならない。素のページでも起きる)ので、`wd.mjs` で右クリックをページ内で合成する。

## 5. 問題なしを確認した範囲

- 編集(ダブルクリック / Enter / Tab / blur / 検査)、貼り付け(行・列のあふれ、検査で弾くセル)、元に戻す / やり直し、行選択、状態の往復、エクスポート、スクロール API(t-basic 104 件)は 3 つのブラウザで全部通った。
- 監査所見の追試(t-verify 49 件。RD-1〜3 / C-1 / C-3 / B-01〜03 / V-02 / 編集確定後のフォーカス ほか)は 3 つのブラウザで全部通った。
- SSRM、100 万行(t-big)、見送り分(t-leftovers の L-15 以外)、Firefox のフィルハンドル全 74 件とキー / ポインタの優先順位全 25 件。
- Firefox は BR-1 以外の失敗なし。

## 6. 使っている機能と各ブラウザの対応版

下限を決めているのは JS より CSS。dist は ES2023 向けにビルドしている(構文の変換なし)。

| 機能 | 使っている所 | Chrome | Firefox | Safari | 対応していないと |
| --- | --- | --- | --- | --- | --- |
| `color-mix()` | style.css の 10 か所(条件付き書式のチップ・保存の印・エラー表示など)とテーマ CSS | 111 | 113 | 16.2 | その色の指定が無視され、チップや印の色が消える |
| `overflow: clip` | 固定列のペイン(GridShell のインライン style) | 90 | 81 | 16 | ペインからはみ出して表が崩れる |
| `:has()` | キーボード操作のフォーカスの枠(`styles.css:3522`)、見出しのボタンのキーボード表示(`styles.css:3360`) | 105 | 121 | 15.4 | フォーカスの枠が出ない(操作はできる) |
| `inert` 属性 | 列ドラッグの浮かぶ列(`columnHeaderDragController.ts:723`) | 102 | 112 | 15.5 | 浮かぶ列にフォーカスが入りうる |
| `oklch()` | shadcn テーマの成功 / 注意の色 | 111 | 113 | 15.4 | その色だけ無効 |
| JS の構文(`??=` など) | dist 全体 | 85 | 79 | 14 | 読み込みで失敗 |
| `String.prototype.replaceAll` / `Element.replaceChildren` / ResizeObserver | 日付の表示 / 列ドラッグ / 計測 | 86 | 78 | 14 | 該当機能で例外 |

`requestIdleCallback`(Safari に無い)は `utils/scheduler.ts` で無いときの代わりを持っている。`scrollbar-color` は Safari で効かないが見た目だけ。

## 7. React 18

- React 18 で動かないのは「関数コンポーネントで `ref` を props として受け取る」(React 19 の ref-as-prop)の 1 か所だけ。公開コンポーネント `SpreadsheetGrid`(`SpreadsheetGrid.tsx`)と `createSpreadsheetGrid` が作るコンポーネント(`createSpreadsheetGrid.tsx`)が、`GridShell.tsx:434` で props の `ref` を取り出して `useImperativeHandle` に渡している。React 18 では `ref` は props に入らないため、命令的 API が付かない(本番ビルドでは警告も出ず `ref.current` が null のまま。開発ビルドは「Function components cannot be given refs」の警告)。
- それ以外に React 19 だけの API は使っていない: React から import しているのは `useState` / `useRef` / `useEffect` / `useLayoutEffect` / `useMemo` / `useCallback` / `useReducer` / `useId` / `useSyncExternalStore` / `useDeferredValue`(引数 1 つ)/ `memo` / `createPortal` / `flushSync` で、どれも React 18 にある。内部の部品へ `ref` を渡している所は DOM 要素だけで、コールバック ref の後片付け(React 19 の機能)も使っていない。
- 確かめたこと:
  - jsdom のテスト(React 18.3.1): そのままだと 195 件が失敗(ref を使うテスト)。`SpreadsheetGrid` / `createSpreadsheetGrid` を forwardRef で包んだ写しでは 2,011 件中 5 件まで減った。残りは (a) 編集確定後のフォーカスの 4 件 = React 18 の `act` と jsdom の rAF の順番の違い(同じ操作を実ブラウザの React 18 で行うと React 19 と同じ結果。下記)と、(b) `<Activity>` を使うテスト 1 件(React 19.2 の部品。テスト側の都合)。ほかに themes.test のファイルが読み込めない(写しに website の依存が無いため。React とは無関係)。
  - 実ブラウザ(Chromium、React 18.3.1、forwardRef の写し): ハーネス 12 本で 589 / 589。jsdom で落ちた「編集中に別のセル / 行見出しを押して確定」も React 19 と同じ結果(行見出しは `enableRowSelection: false` で確認)。
  - 利用側アプリ(examples/basic を写し、React 18.3.1 + `@types/react` 18.3 + pack した 0.57.0 の tarball): `tsc --noEmit` と `vite build` が通る(d.ts は React 18 の型でも問題なし)。ただし npm は peer(`react: ^19.0.0`)が合わず `ERESOLVE` で止まる(`--legacy-peer-deps` で入る)。
- 選択肢とサイズ(`size:check`。別の worktree で 2 つのコンポーネントを包んで build:lib → 計測し、変更は捨てた):

  | 案 | 中身 | full(上限 112.3KB) | lite | standard |
  | --- | --- | --- | --- | --- |
  | A. 対応しない | 今のまま。README に「React 19 以上」と明記 | 112.28KB | 60.65KB | 79.00KB |
  | B. 版を見て包む | `React.version` が 19 未満のときだけ forwardRef で包む + peer を `^18.3.0 \|\| ^19.0.0` | 112.34KB(+0.06) | 60.70KB | 79.05KB |
  | C. 常に包む | いつも forwardRef で包む(React は将来 forwardRef を非推奨にすると案内している) | 112.31KB(+0.03) | 60.67KB | 79.02KB |

  B / C はどちらもフル版の上限(2026-10-24 のユーザー判断で 112.3KB 固定)を超えるので、上限の判断が要る。

## 8. 対応状況

すべて判断待ち(ライブラリの修正なし)。対応ブラウザの方針・React 18 対応の要否・semver / 1.0 の方針は、報告書(Claude Doc)でユーザーに提案した。