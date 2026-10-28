# ブラウザ対応と React 18 対応の調査(2026-10-28・v0.57.0 時点)

広める計画の残り 2 件(⑥ ブラウザ対応の確認 / ⑦ React 18 対応の調査)の記録。調査では監査ハーネス(`audit/harness/`)だけを変え、Chromium 以外でも回せるようにした(使い方は同ディレクトリの README の「他のブラウザで回す」)。ブラウザの所見(BR-1〜BR-5)のライブラリ側の修正はしていない。React 18 対応はユーザーが案 B を選び、同じ PR で実装した(§7 の最後)。

## 1. 進め方と前提

- 対象: main の d72a656(v0.57.0 + ドキュメントの変更のみ)。
- 実ブラウザ: 監査ハーネス 12 本を 3 つのブラウザで回した。クラウド環境からは Playwright の Firefox / WebKit の配布元へ届かないため、次の方法で動かした。
  - Chromium 153: 従来どおり Playwright。
  - WebKit: Ubuntu の `webkit2gtk-driver`(WebKitGTK 2.52.6、Safari と同じ WebKit の Linux 版)+ Xvfb。W3C WebDriver で操作する薄い層 `audit/harness/wd.mjs` を足した。
  - Firefox 159.0: conda-forge の `firefox` / `geckodriver` パッケージ(`.conda` を展開しただけ。sha256 を repodata と照合)。同じく `wd.mjs`。Playwright の実験的な WebDriver BiDi(`firefox-bidi`)はダブルクリックが届かず使えなかった。
- WebKit だけで落ちた操作は、X のマウスイベントを直接送る `xdotool` でも試し、自動操作側の癖か本当の挙動かを切り分けた。
- WebDriver では使えない確認(CDP の IME 変換 / `page.route` / `page.clock` / `emulateMedia` / テストからクリップボードへ書く)は SKIP にした: `t-lazy` 全体、`t-features` の IME の変換(G-2。変換を使わない入力受けの確認は回す)、`t-leftovers` の L-15、`t-lifecycle` の `theme="auto"` の追従、`t-verify` の RD-2 の実際の Ctrl+V(代わりにエディタへ paste イベントを送って確かめる)。WebDriver の WebKitGTK / Firefox は窓を幅 420px にできないので、`t-aggregates` の 420px の 2 件も SKIP。
- React 18: リポジトリの写しに React / React DOM 18.3.1 と `@types/react` 18 を入れ、jsdom のテスト・ハーネス(Chromium)・利用側アプリ(Vite)で確かめた。
- 使っている CSS / JS の機能は、ソースと dist を検索して MDN の互換データ(`@mdn/browser-compat-data`)と caniuse で対応版を引いた。

## 2. ブラウザ別の結果

PASS / 実行した確認の数(SKIP は数に入れない)。

| シナリオ | Chromium 153 | WebKitGTK 2.52.6 | Firefox 159 |
| --- | --- | --- | --- |
| t-basic | 104 / 104 | 104 / 104 | 104 / 104 |
| t-ssrm | 36 / 36 | 36 / 36 | 35 / 36(BR-1) |
| t-lifecycle | 31 / 31 | 30 / 30 | 29 / 30(BR-1) |
| t-features | 123 / 124(BR-1) | 104 / 105(BR-1) | 103 / 105(BR-1 ×2) |
| t-verify | 49 / 49 | 49 / 49 | 49 / 49 |
| t-aggregates | 27 / 27 | 24 / 25(BR-2) | 24 / 25(BR-1) |
| t-total | 49 / 49 | 48 / 49(BR-5) | 48 / 49(BR-1) |
| t-fill | 74 / 74 | 72 / 74(BR-4 ×2) | 74 / 74 |
| t-big | 21 / 21 | 21 / 21 | 21 / 21 |
| t-leftovers | 24 / 24 | 15 / 15 | 15 / 15 |
| t-lazy | 25 / 25 | SKIP | SKIP |
| t-priority | 25 / 25 | 24 / 25(BR-3) | 25 / 25 |
| 計 | 588 / 589 | 527 / 533 | 527 / 533 |

- 数は見直し(§4 の後半)を入れたあとに 3 つのブラウザで全部回し直したもの。
- WebKit / Firefox の t-features は、IME の変換を使わない入力受けの確認 11 件を足した分だけ多い(Chromium は変換の区画の中で同じ確認をしている)。
- WebKit の t-fill の 2 件は、BR-4 でハンドルを押せないときに FAIL として記録して続けたもの(最初の記録では、押せずにスクリプトが止まるため、その 2 か所を飛ばした写しで回していた)。
- Chromium の BR-1(auto-height)は見直しで分かった。Playwright は例外でない window の error(ResizeObserver のループの通知)を Chromium では拾わないため、最初の記録の Chromium 589 / 589 はこれを見ていなかった。`pw.mjs` で拾うようにして 3 回回し、3 回とも auto-height で出た。
- React 18.3.1 での結果は §7。
- Chromium の t-fill の「ハンドルを押すと開いているコンテキストメニューを閉じる」が最初の記録のときに 1 回だけ落ち(右クリックのメニューが 120ms 以内に開かなかった)、続けて 2 回回して通った。見直し後の回し直しでは起きていない。

## 3. 所見(ライブラリ側。BR-1・BR-2・BR-5 は対応済み = §8)

| ID | 重さ | ブラウザ | 実機 | 要約 | 場所 |
| --- | --- | --- | --- | --- | --- |
| BR-1 | 中 | 全ブラウザ(Chromium・WebKit は auto-height だけ) | ✅ | レイアウトが変わるときに `ResizeObserver loop completed with undelivered notifications` が window の error として出る。表示は次のフレームで正しくなるが、エラー監視(Sentry など)に記録されうる。Firefox は窓を 1,200px → 1,400px に広げて横スクロールバーが消えて出直す・2 つのグリッドでページのスクロールバーが出入りする・ラベル行・SSRM・auto-height で出る。Chromium と WebKit は auto-height(行の高さの実測)のときだけ出る(Chromium の分は見直しで判明。§2)。ResizeObserver を包んで追うと、出る直前に動いていたのはスクロール同期の観測(見える高さ / 幅を view スライスへ書く)と `@tanstack/virtual-core` の観測で、スクロール領域が 1370×420 → 1370×408 と 1 フレームで揺れていた | `packages/core/src/controllers/scrollSyncController.ts:94-99`、`packages/react/src/hooks/useVirtualizerCore.ts`(virtual-core の `useAnimationFrameWithResizeObserver` は既定 false) |
| BR-2 | 低 | 全ブラウザ(幅は別) | ✅ | 件数表示あり(`showBottomBarCounts`)で 2 セル以上を選ぶと、右の件数の表記が数 px 伸びて次の行へ折り返し、下部バーが 27px → 49px に伸びて表全体がずれる。WebKit は窓 600px、Chromium は 608px で起きた(文字の幅で境目が変わる。ハーネスの 600px の確認は Chromium の文字幅でだけ通っていた) | `packages/react/src/styles.css` の `.ssg-bar--bottom` まわり、`audit/harness/t-aggregates.mjs:80` |
| BR-3 | 低 | WebKit(要 Safari 実機) | ✅(xdotool) | 列の幅の境界をドラッグした直後、マウスが見出しの行から出るまで、他の列の見出しで並べ替えのつまみ(grip)と ⋮ が出ない。つまみの位置を押すと見出しの押下 = 列の選択になる。WebKit が `:hover` を見出しの行(`.ssg-header-row`)で止めたまま更新しない(pointermove はラベルに届くが pointerover が来ない)。幅が変わらない押下・縦に外れるドラッグでは起きず、素のページで同じ形(pointerdown を preventDefault して幅を変える)を作っても再現しないので、原因は未特定 | `packages/react/src/styles.css:3339-3360`(`.ssg-header-actions` を `:hover` で出す)、`packages/core/src/engine/columnCommands.ts:417` |
| BR-4 | 低 | WebKit(要 Mac 実機) | ✅ | 右端の列・最下行のフィルハンドルを押せない。WebKitGTK のスクロールバーは幅 0 で中身の上に重なり、端から約 12px が `elementFromPoint` でスクロール領域そのものを返す(スクロールバーの当たり判定)。ハンドルは角から 4px はみ出し、残りもその帯に入る。macOS の既定(トラックパッド)も重なる型のスクロールバーなので、Mac の Safari / Chrome でも起こりうる | `packages/react/src/styles.css:1289-`(`.ssg-fill-handle`)、`packages/react/src/view/FillHandleLayer.tsx` |
| BR-5 | 低 | WebKit | ✅ | 100 万行(行の位置を縮めて持つモード、縮尺 2.4)で `selectCell(999999, …, { scrollIntoView: true })` / `scrollToRow(999999, { align: 'end' })` のあと、最終行が合計行の下に 2px 隠れる(scrollTop 14,999,655 / 最大 14,999,656)。論理位置を物理位置へ直した小数のスクロール位置を WebKit が切り捨てるため(Chromium は 14,999,656)。中央寄せ(500,000 行目)でも同じ 1px の差で 2px ずれる | `packages/core/src/controllers/viewportSyncController.ts:126-131`、`packages/core/src/engine/gridApi.ts:176`(`logicalToPhysicalScrollTop`) |

直し方の案(調査の時点。BR-1・BR-2・BR-5 の実際の直し方は §8):

- BR-1: virtual-core に `useAnimationFrameWithResizeObserver: true` を渡し、scrollSyncController の ResizeObserver も状態の更新を次のフレームへずらす(同じ値なら何もしない)。
- BR-2: 件数の欄に桁数ぶんの最小幅(`tabular-nums` + 最小幅)を持たせるか、幅が足りないときは折り返さず集計の側を細くする。
- BR-3: まず Mac の Safari で再現するか確かめる。再現すれば、見出しのボタンの表示を `:hover` だけに頼らない(pointerenter / pointerleave で属性を付ける)。
- BR-4: 選択範囲がスクロール領域の右端 / 下端に接するときはハンドルを内側へ寄せる。
- BR-5: 下端へ合わせるとき(`cellBottom > visibleBottom`、`align: 'end'`)は物理位置を切り上げる。

## 4. ハーネス側の修正(ライブラリの挙動とは無関係)

- `pw.mjs`: `SSG_AUDIT_BROWSER` でブラウザを切り替える。`SUPPORTS` で使えない機能を判定し、使えない確認は `skip()` で `SKIP` と出す(Chromium の判定は従来どおり。出力の先頭に `BROWSER <名前> <版>` の行が 1 行増える)。
- `wd.mjs`(新規): Playwright の Page / Locator / Mouse / Keyboard のうちハーネスが使う分を W3C WebDriver で実装。
- `pasteText` / `copyText` / `t-ssrm` の貼り付け: Firefox は `new ClipboardEvent('paste', { clipboardData })` の DataTransfer を中身の無い別物に差し替えるので、自分の DataTransfer を被せる。
- `t-basic` の自動フィルター: Chromium の `innerText` は `<select>` の選択肢の文字を含むが、WebKit / Firefox は含まない。選択肢の文字を足して見る。
- `t-features` のメモのツールチップ: WebKit の `innerText` は改行が描画されていても空白で返す(描画は 2 行)。行数を描画された行の位置で数える。
- `t-total`: `scrollTop = 1e12` は WebKit で 0 になる(32 ビット整数を超える値)。1e9 にした。
- `t-verify` の RD-2: テストからクリップボードへ書けないブラウザでは、エディタへ中身の入った paste イベントを送り「グリッドが既定の動作を止めない・行を書き換えない・エディタを閉じない」を確かめる(実際の Ctrl+V で中身が入る確認は SKIP。§5 の「全部通った」はこの弱めた確認を含む)。
- `t-features` の IME / `t-lifecycle` の theme auto / `t-leftovers` の L-15 / `t-lazy`: 使えない機能を SKIP。
- 見直し(別の目)で直したこと:
  - クリップボードの代役が、本物の書き込みの成否を見ずに文字列を覚えていた(書けなくてもコピーの確認が通りうる)。書けたときだけ覚えるようにした(回し直しでも 3 つのブラウザでコピーの確認は通った = 実際に書けている)。
  - Playwright が Chromium で拾わない例外でない window の error を、`addInitScript` で `console.error` へ流して `pageErrors` に入れる(WebDriver と同じ範囲)。これで Chromium の auto-height の BR-1 が出た。
  - `t-features` の IME: 変換を使わない確認(入力受けへのフォーカス / 文字キー / Escape / 矢印 / 貼り付け / Delete / F2 / 端の列の Tab / 無効化)を全ブラウザで回す。
  - `wd.mjs`: 窓の中の大きさを頼んだ値にできなければ例外にする(以前は黙って別の幅で回していた。`t-aggregates` の 420px は SKIP に)。最初の描画中のエラーを `window.__errors` から写す。ドライバをプロセスグループで起動し、終了時にブラウザごと止める(以前は MiniBrowser が残っていた)。ドライバの起動失敗・無応答・固まりを例外にする。特殊キーをエスケープで書く。`insertText` は例外にする。
  - `t-fill`: BR-4 でハンドルを押せないときは FAIL として記録して続ける。
  - Playwright の firefox / webkit の経路にも同じクリップボードの代役を入れた(配布元へ届かないので未検証)。
- WebKitGTK 2.52 の WebDriver は右ボタンを離したことが伝わらない(`mouseup` の `button` が 0、`buttons` に右ボタンが残り、以降の左クリックが `pointerdown` にならない。素のページでも起きる)ので、`wd.mjs` で右クリックをページ内で合成する。

## 5. 問題なしを確認した範囲

- 編集(ダブルクリック / Enter / Tab / blur / 検査)、貼り付け(行・列のあふれ、検査で弾くセル)、元に戻す / やり直し、行選択、状態の往復、エクスポート、スクロール API(t-basic 104 件)は 3 つのブラウザで全部通った。
- 監査所見の追試(t-verify 49 件。RD-1〜3 / C-1 / C-3 / B-01〜03 / V-02 / 編集確定後のフォーカス ほか)は 3 つのブラウザで全部通った。
- SSRM、100 万行(t-big)、見送り分(t-leftovers の L-15 以外)、Firefox のフィルハンドル全 74 件とキー / ポインタの優先順位全 25 件。
- Firefox は BR-1 以外の失敗なし。
- `imeDirectInput` の入力受け(変換を使わない操作)は WebKit / Firefox でも全部通った。変換そのもの(IME の確定の引き継ぎ)は CDP の模擬なので Chromium でしか確かめていない。

## 6. 使っている機能と各ブラウザの対応版

下限を決めているのは JS より CSS。dist は ES2023 向けにビルドしている(構文の変換なし)。

| 機能 | 使っている所 | Chrome | Firefox | Safari | 対応していないと |
| --- | --- | --- | --- | --- | --- |
| `color-mix()` | `packages/react/src/styles.css`(公開名 `style.css`)の 10 か所(条件付き書式のチップ・保存の印・エラー表示など)とテーマ CSS | 111 | 113 | 16.2 | その色の指定が無視され、チップや印の色が消える |
| `overflow: clip` | 固定列のペイン(GridShell のインライン style) | 90 | 81 | 16 | ペインからはみ出して表が崩れる |
| `:has()` | 見出しの ⋮ ボタンのキーボード表示(`styles.css:3360`)、`imeDirectInput` のときのフォーカスの枠(`styles.css:3522`) | 105 | 121 | 15.4 | Tab で移っても ⋮ が見えない、`imeDirectInput` のときフォーカスの枠が出ない(操作はできる。3522 は `:is()` の中なので、ふだんの `:focus-visible` の枠は出るはず) |
| `inert` 属性 | 列ドラッグの浮かぶ列(`packages/core/src/controllers/columnHeaderDragController.ts:723`) | 102 | 112 | 15.5 | 浮かぶ列にフォーカスが入りうる |
| `oklch()` | shadcn テーマの成功 / 注意の色 | 111 | 113 | 15.4 | その色だけ無効 |
| JS の構文(`??=` など) | dist 全体 | 85 | 79 | 14 | 読み込みで失敗 |
| `String.prototype.replaceAll` / `Element.replaceChildren` / ResizeObserver | 日付の表示 / 列ドラッグ / 計測 | 86 | 78 | 14 | 該当機能で例外 |

`requestIdleCallback`(Safari に無い)は `packages/core/src/utils/scheduler.ts` で無いときの代わりを持っている。`scrollbar-color` は Safari で効かないが見た目だけ。

## 7. React 18

- React 18 で動かないのは「関数コンポーネントで `ref` を props として受け取る」(React 19 の ref-as-prop)の 1 か所だけ。公開コンポーネント `SpreadsheetGrid`(`packages/react/src/SpreadsheetGrid.tsx`)と `createSpreadsheetGrid` が作るコンポーネント(`packages/react/src/createSpreadsheetGrid.tsx`)が、`packages/react/src/GridShell.tsx:434` で props の `ref` を取り出して `useImperativeHandle` に渡している。React 18 では `ref` は props に入らないため、命令的 API が付かない(本番ビルドでは警告も出ず `ref.current` が null のまま。開発ビルドは「Function components cannot be given refs」の警告)。
- それ以外に React 19 だけの API は使っていない: React から import しているのは `useState` / `useRef` / `useEffect` / `useLayoutEffect` / `useMemo` / `useCallback` / `useReducer` / `useId` / `useImperativeHandle` / `useSyncExternalStore` / `useDeferredValue`(引数 1 つ)/ `memo` / `createPortal` / `flushSync` で、どれも React 18 にある。内部の部品へ `ref` を渡している所は DOM 要素だけで、コールバック ref の後片付け(React 19 の機能)も使っていない。
- 確かめたこと:
  - jsdom のテスト(React 18.3.1): そのままだと 195 件が失敗(ref を使うテスト)。`SpreadsheetGrid` / `createSpreadsheetGrid` を forwardRef で包んだ写しでは 2,011 件中 5 件まで減った。残りは (a) 編集確定後のフォーカスの 4 件 = React 18 の `act` と jsdom の rAF の順番の違い(同じ操作を実ブラウザの React 18 で行うと React 19 と同じ結果。下記)と、(b) `<Activity>` を使うテスト 1 件(React 19.2 の部品。テスト側の都合)。ほかに themes.test のファイルが読み込めない(写しに website の依存が無いため。React とは無関係)。
  - 実ブラウザ(Chromium、React 18.3.1、forwardRef の写し): ハーネス 12 本で 589 / 589(見直し前のハーネス。Chromium の window の error を拾っていなかったので BR-1 は見えていない)。jsdom で落ちた「編集中に別のセル / 行見出しを押して確定」も React 19 と同じ結果(行見出しは `enableRowSelection: false` で確認)。
  - 利用側アプリ(examples/basic を写し、React 18.3.1 + `@types/react` 18.3 + pack した 0.57.0 の tarball): `tsc --noEmit` と `vite build` が通る(d.ts は React 18 の型でも問題なし)。ただし npm は peer(`react: ^19.0.0`)が合わず `ERESOLVE` で止まる(`--legacy-peer-deps` で入る)。
- 選択肢とサイズ(`size:check`。別の worktree で 2 つのコンポーネントを包んで build:lib → 計測し、変更は捨てた):

  | 案 | 中身 | full(上限 112.3KB) | lite | standard |
  | --- | --- | --- | --- | --- |
  | A. 対応しない | 今のまま。README に「React 19 以上」と明記 | 112.28KB | 60.65KB | 79.00KB |
  | B. 版を見て包む | `React.version` が 19 未満のときだけ forwardRef で包む + peer を `^18.3.0 \|\| ^19.0.0` | 112.34KB(+0.06) | 60.70KB | 79.05KB |
  | C. 常に包む | いつも forwardRef で包む(React は将来 forwardRef を非推奨にすると案内している) | 112.31KB(+0.03) | 60.67KB | 79.02KB |

  B / C はどちらもフル版の上限(2026-10-24 のユーザー判断で 112.3KB 固定)を超えるので、上限の判断が要る。

- 実装(2026-10-28、ユーザーが B を選択): `packages/react/src/withRefProp.ts` が React の `version` を読み込み時に 1 回見て、19 以上ならコンポーネントをそのまま返し、19 未満なら forwardRef で受けた ref を props の `ref` へ戻してから呼ぶ。`SpreadsheetGrid` と `createSpreadsheetGrid` の戻り値に掛けた。React 版の peer を `^18.3.0 || ^19.0.0` に広げ、フル版の上限を 112.4KB に上げた(実測 112.34KB。lite 60.70KB / standard 79.05KB / ai 11.74KB は上限内)。eslint の react-refresh に `withRefProp` を HOC として登録した。
- 実装の確認:
  - React 19(リポジトリ): ゲート全緑。`withRefProp.test.tsx` で、React 19 ではそのまま返すことと、react の `version` だけを 18.3.1 に差し替えて読み直すと forwardRef で包まれ、`ref` に命令的ハンドルが入ること(全部入り / `createSpreadsheetGrid`)を確かめる。
  - React 18.3.1 の写し(jsdom): 2,013 件中 6 件が失敗。上の既知の 5 件(編集確定後のフォーカス 4 件 = `act` の順番、`<Activity>` 1 件)と、`withRefProp.test` の「React 19 ではそのまま返す」(React 18 では包むので当然落ちる)。themes.test は写しに website の依存が無く読み込めない(React とは無関係)。
  - React 18.3.1 の写し(実ブラウザ、Chromium): ハーネス 12 本で 588 / 589。落ちたのは React 19 と同じ BR-1(auto-height)。t-basic は dev サーバーを起動した直後の 1 回目だけ 16 件目のあとでセルが 30 秒見つからずに止まり、続けて 2 回回して 2 回とも 104 / 104(原因は特定していない。React 19 の写しでは起きていない)。
  - 利用側アプリ(examples/basic を写し、React 18.3.1 + `@types/react` 18.3 + pack した tarball): `--legacy-peer-deps` なしで `npm install` が通る。`tsc --noEmit` は `--skipLibCheck false` でも通る(全部入りの `ref`・`/lite` のグリッドの `ref`・`/ai` の `GridAskBar` を使う一時ファイルを足して確認)。`vite build` が通り、本番ビルドと dev の両方で CSV ボタン(`gridRef.current?.downloadCsv`)からダウンロードできる(= ref が付いている)。
  - ライブラリのソースそのものは `@types/react` 18 では型検査が通らない(`useRef` の null の扱いなどの型の違い。公開の d.ts は上のとおり通る)。開発と CI は React 19 で行う。
- 実装の見直し(別の目のコードレビュー。build:lib した dist を React 18.3.1 / 19.3.0 で createRoot + StrictMode・旧来の `ReactDOM.render`・`renderToString`・`hydrateRoot` に描き、オブジェクト / コールバックの ref・アンマウントで null・`@types/react` 18 + `skipLibCheck: false` の型・ref を props で受ける公開物が 2 つだけなこと・React 18 に無い API を使っていないことを確認)で見つかった点と対応:
  - React 18 の SSR(開発ビルド)で全部入りを描くたびに `useLayoutEffect does nothing on the server` の警告が 3 件出た(列ドラッグの settle・行ドラッグの settle・ラベル行の縦固定レイヤー。React 19 は出さない)→ `hooks/useController` の `useIsomorphicLayoutEffect`(SSR では useEffect)を書き出して使うようにし、`useVirtualizerCore` の同じ定義もこれにまとめた。ライブラリで素の `useLayoutEffect` を import すると eslint(`no-restricted-imports`)で止まる。
  - React 18 では包んだ側に名前が無く、開発ツールに `ForwardRef` とだけ出た → `withRefProp` が包む前の `displayName` か関数名を付ける。
  - `packages/react/README.md` と website の「はじめに」の「対応環境」に peer `>= 19` が残っていた → 直した。
  - 対応しないもの: d.ts の `SpreadsheetGrid` は関数の型のままで、React 18 での実体は forwardRef のオブジェクト。`SpreadsheetGrid(props)` と関数として直接呼ぶと React 18 では TypeError になる(JSX で使う分には関係ない。関数として呼ぶのは React の使い方として想定外)。

## 8. 対応状況

- React 18 対応: 実装済み(案 B。§7)。0.58.0 で公開。
- 2026-10-28 にユーザーが選んだこと: BR-1・BR-2・BR-5 を 1 つの PR で直す / 対応ブラウザの下限を Chrome・Edge 111 / Firefox 121 / Safari 16.4 として README とドキュメントに書く / BR-3・BR-4 はユーザーが Mac の Safari で確かめ、再現したものだけ直す / semver / 1.0 は方針を採って準備を始める(BR の PR の後)。
- BR-1(対応済み): ResizeObserver のコールバックの中で状態を書かず、次のフレームで書く。`packages/core/src/controllers/scrollSyncController.ts`(見える高さ / 幅を view スライスへ)と `packages/core/src/controllers/autoHeightMeasurer.ts`(auto-height の測り直しの合図 `nonce`)。同じフレームに何度通知が来ても書くのは 1 回、外すとき(detach / dispose)は待っているフレームを取り消す。useSyncExternalStore の購読者は store が変わると同期で描き直すため、コールバックの中で書くと同じフレームでスクロール領域の大きさがまた変わり、ブラウザがループの通知を出していた。virtual-core の観測は描き直しを同期で行わない(useVirtualizerCore の rerender は通常の更新)ので、`useAnimationFrameWithResizeObserver` は変えていない。
- BR-2(対応済み・見た目が少し変わる): 件数ありのとき、下部バーの右のグループに最小幅 `min(56ch, 100%)` を持たせ(500 行 × 12 列の表を全部選んだ表記が収まる幅。`ch` をチップの文字で測るため font-size を 11.5px に揃える)、`margin-left: auto` と `justify-content: flex-end` で右端に寄せる(`packages/react/src/styles.css` の `.ssg-bar--bottom .ssg-bar-group:not(:first-child)`)。バーの折り返しが選択の表記ではなく窓の幅だけで決まる(表記が最小幅を超える大きな選択を除く)。2 行になる境目は Chromium の文字で約 610px → 約 665px に移る。件数なしは折り返さないので対象外。JS は増えない。ハーネスの `t-aggregates` に境目の前後の幅(680 / 608px)を足した。
- BR-5(対応済み): 行を下端に合わせるとき(`align: 'end'`、`'auto'` で下へ動くとき、キー操作の `cellBottom > visibleBottom`)は、物理のスクロール位置を `Math.ceil` で切り上げる(`packages/core/src/engine/gridApi.ts` の `applyScroll` に `align` を渡す、`packages/core/src/controllers/viewportSyncController.ts` の `scrollCellIntoView`)。上端に合わせるときはそのまま。縮尺 1 では位置が整数なので何も変わらない。
- フル版の初期 JS: BR-1 と BR-5 で 112.37KB → 112.47KB(上限 112.4KB を超えたので、112.5KB への引き上げを PR でユーザーに伺う)。
- 単体テスト: scrollSyncController / autoHeightMeasurer(次のフレームで 1 回だけ書く・取り消し)、gridApi / viewportSyncController(縮尺 2.4 で下端合わせだけ切り上げる)。
- 修正後のハーネス(12 本、Chromium 153 / Firefox 159(geckodriver)/ WebKitGTK 2.52.6): Chromium 593 / 593、Firefox 537 / 537(SKIP 8)、WebKit 534 / 537(SKIP 8)。残る FAIL は BR-3(t-priority の 1 件)と BR-4(t-fill の 2 件)だけ。BR-1(Chromium の t-features / Firefox の t-ssrm・t-lifecycle・t-features・t-aggregates・t-total)・BR-2(WebKit の t-aggregates)・BR-5(WebKit の t-total)は通った。数は `t-aggregates` に足した幅のぶん 4 件(WebDriver では 420px が SKIP なので 4 件のまま)増えている。WebKit の t-aggregates の「計算中のスクロールの次フレームまで 200ms 未満」が 1 回目だけ 362ms で落ち、続けて 2 回回して通った(3 つのブラウザを続けて回した負荷によるもので、修正とは無関係)。