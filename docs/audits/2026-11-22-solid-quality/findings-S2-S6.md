# S2(SSR の管理画面)と S6(モバイル・読み上げ・ダイアログ)の点検の報告(作り直しの組)

段階 4 の 1-6。手順は `audit/dogfood/2026-11-22-solid-quality/BRIEF.md`。ライブラリは今のブランチを pack した Solid 版 0.1.0 の tarball(core 1.2.1 は npm)。ポートは S2 = 3501(dev)/ 5502(本番)、S6 = 5506。点検者の報告を写した(所見の ID は点検者が付けたもの)。

まとめ: 前の所見のうち直したもの(S2-01・S6-01)は直っていて、README に書いたもの(S2-02〜S2-04・S6-05)はそのとおりに書けた。前に通った操作の回帰は無し。新しい所見は中 2(どちらも Solid だけ・SSR)・低 3。

## S2 SSR の管理画面(SSRM、英語。dev 3501 / 本番 5502)

### 作ったもの

- 構成: 前のアプリを写し、グリッドだけ候補の tarball に替えた。Vite 8.3.8、solid-js / `@solidjs/web` 2.0.3、`@solidjs/router` 2.0.1、`@solidjs/vite-plugin` 3.0.1(`ssr: true`)、TS 6。サーバーは自作の Node の http サーバー(dev は Vite の middlewareMode、本番は `vite build` + `vite build --ssr`)。`renderToString` と `?stream` の `renderToStream` の両方。
- 前からある機能: SSRM の一覧 `/users`(5 万人)、詳細、設定、URL と状態の同期、書き戻し、右クリックメニュー、検索、検査。
- 今回足したもの: 設定の Theme(既定 `theme="auto"`、`motion` は既定)、`/users` に `reviewDue` 列(dateSet。API はサーバーの `TZ` で今日を決める)、`/activity`(clientSide 2,640 行、プリセット today / thisMonth を URL の `initialState` から入れて SSR)、`/activity2`(README どおりの URL 同期 = `onStateChange` → `setSearch`、location が変わったら `applyState`)、`entry-server.tsx` の `?noevent`(`provideRequestEvent` なし)。
- 最小の再現: `repro-tz`(1 ファイルの SSR、10 行、dateSet の today)、`repro-cand`(候補)と `repro-npm010`(npm の 0.1.0)、React 1.2.1 の同じもの `react-tz`(`hydrateRoot` + `onRecoverableError`)。

### 確かめた操作(問題なし)

- ハイドレーション: dev / 本番 × `renderToString` / `renderToStream` のどれも SSR と同じルート要素のまま引き継ぎ、警告なし。JS を切ると SSR の枠だけが見える。
- テーマと動きの既定: `emulateMedia` でダーク + 視差効果を減らすにすると、ハイドレーションの後に `ssg-theme-dark ssg-motion-off` へ変わる(dev 約 465ms、本番 約 146ms、React 版も同じ動きで約 91ms)。列メニュー・ポップアップ・ポータルもダーク、警告なし。
- README の SSR の説明: `createRequestEvent`(`@solidjs/web`)と `provideRequestEvent`(`@solidjs/web/storage`)はそのとおりに書けて型も通る。外すと router が「RequestEvent is missing」をログに出す。
- text / set / number / dateSet / date のフィルター・ソート・グローバルフィルターがサーバーへの要求と URL の両方に入る。
- 編集・保存の印・編集中のスクロールでエディタが残る・失敗のロールバックと保存失敗のバー・貼り付けは PATCH 1 回・検査の mark / reject・SSRM の中で元に戻すは効かない(仕様)。
- SSRM の読み込み: 追加・削除の後の `refreshServerSide()`、読み込み失敗のバー、失敗後にスクロールしても取り直さない、`retryServerSideLoads()` と組み込みの Retry、バーの閉じるボタン、保存中の PATCH が取り直しより先。
- 右クリックメニューから詳細へ、CSV(BOM、CRLF)、キー操作とコピー、Ctrl+A の「Loaded rows only」、英語の UI に日本語が 1 文字も無い(dev / 本番)、本番でルートを 30 回行き来してもノード数とリスナー数が増えない(nodes 10539 / listeners 2158)。

### 前の所見の今

- S2-01 直っている(7 つの通知のどれからも警告 0 件)。
- S2-02 変わった(README の開発時の診断の表に載った)。ただし表に無い名前の `memo "computed" … effect "clampSelectionToRowCount"` も出た(`dev-t13-inflight.txt`)。
- S2-03 変わった(SSR の節ができ import 元も正しい)。サーバーの `NODE_ENV` のことは無い(→ S2-21)。
- S2-04 直っている(README の書き方の `/activity2` は更新が止まらない繰り返しも起きず、戻る / 進むも効く)。

### 所見

**S2-21** 中 / 不具合 + ドキュメント / Solid だけ(React 版は `NODE_ENV` が無くても引き継ぐ)/ 回帰ではない(npm の 0.1.0 でも同じ)/ 本番だけ / 確実 — サーバーの `NODE_ENV` が `production` でないと、本番の SSR のグリッドがハイドレーションの後も枠だけのまま動かない。`vite build` + `vite build --ssr` で作り、独自のフラグ(`PROD=1` など)だけで本番の形にして `NODE_ENV` を付けずに起動すると、中央のペインが空のまま、列の見出しは「#」と固定列だけ、行はスケルトンのまま、データを取りに行かない(グリッドの外は動く、コンソールは無言)。SSR の出力 `dist/server/entry-server.js` に `process.env.NODE_ENV` の分岐(開発時の警告の部品)が 5 か所残り、クライアントの出力には 0 か所。サーバーだけが開発時の分岐を通り、部品の木が変わってハイドレーションのキーがずれていると見ている。回避: サーバーを `NODE_ENV=production` で起動する、または SSR のビルドに `define: { 'process.env.NODE_ENV': JSON.stringify('production') }`。証拠 `S2/out/shot-noenv-users.png`、`S2/run-probe.sh`・`run-main-probe.sh`、`S2/react-tz`。

**S2-22** 中 / 不具合 / Solid だけ(React 版は回復できるハイドレーションのエラーを 1 回出して作り直し、正しくなる)/ 回帰かは不明(前は試していない)/ dev・本番 / 確実 — 相対日付のプリセット(今日)を入れたまま clientSide で SSR し、サーバーとブラウザで日付が違うと、件数と行数がサーバーのまま残り、行番号だけの行が残る。10 行(11-21 が 2・11-22 が 5・11-23 が 3)、`initialState` に today のプリセット、サーバー `TZ=Pacific/Kiritimati`(11-22)、ブラウザ `timezoneId: 'Pacific/Pago_Pago'`(11-21)。データの行は 2 行に変わるが、上下のバーは「行 5 / 10」、`aria-rowcount` は 6 のまま、左のペインにデータの無い行番号 3〜5 の行が残り、セルを押しても直らない。dev では `Hydration completed with 9 unclaimed server-rendered node(s)`(`data-pane="left" data-row-index="2"` ほか)。React 1.2.1 は `Hydration failed …` を 1 回出した後「行 2 / 10」・`aria-rowcount` 3。証拠 `S2/out/shot-tz-repro-*.png`・`shot-tz-at-Pacific_Pago_Pago.png`、`S2/t21-tz.cjs`。

**S2-23** 低 / ドキュメント / React 版も同じ / 回帰ではない / 確実 — SSRM で相対日付のプリセットを使うと「今日」がサーバーのタイムゾーンで決まる(プリセットは解決しないまま `{ mode:'preset', preset:'today' }` で `getRows` へ届く)が、誰のタイムゾーンで解決するか・利用者のタイムゾーンをどう渡すかがドキュメントに無い。証拠 `S2/out/shot-tz-reviewDue-Pacific_Pago_Pago.png`、`/api/_log`。

## S6 モバイル・読み上げ・ダイアログ(ポート 5506)

### 作ったもの

- 前のアプリを `S6/solid` へ写して候補の tarball に替えた。比べる React 版は `S6/react`(React 19.3.1、1.2.1)。現場点検 200 行、展開行のカード、行のドラッグ、日本語と英語の切り替え、`<dialog>` の中のグリッドは前と同じ。5506 番 1 つで React の本番 / Solid の本番 / Solid の dev を返し、同じ操作を 3 通りで回した。
- 今回足したもの: 1 ページに 2 つのグリッドの `two.html`(上 A は `theme="dark"` の 200 行、下 B は `theme="light"` の 100 行、両方 `find` / `enableContextMenu` + `getContextMenuItems` / `enableRowSelection`、ハンドルの `focus()` のボタン 2 つ)。`?plain` でカードの入力を README の勧めどおりふつうの signal で持つ。

### 確かめた操作(問題なし)

- 前の台本はどれも React と同じ: t2-mobile(iPhone 13 / iPad Mini)、t3-keys / t3b-detail 差 0、t4-axe 規則も件数も同じ、t5-aria 7 か所で差 0、t6-media(ダーク / 視差効果を減らす / active)スクショが同じ、t7-dialog 同じ、t8-lang(en のときの日本語 0、en → ja)、t9-drag、dev の警告なし。
- 2 つのグリッド(3 通りとも完全に同じ): キー操作は押した方だけ、元に戻す / やり直しはグリッドごと、A でコピーして B へ貼り付け、Ctrl+A は B だけ、Delete は A だけ、B の Ctrl+F は B の検索バーだけ、A のメニューと select のリストはダーク・B はライト、A を右クリックした後に B を右クリックすると A のメニューは閉じる、A の列メニューを開いたまま B のセルを押すとメニューは閉じて B へ、`focus()` のボタン、A から Tab で B のバーへ。
- 展開行のカード: README どおりふつうの signal(`createSignal(untrack(() => props.row.x))`)で持つと React の `useState` と同じで、同じ行の別のセルの編集・保存・元に戻す・並べ替え・言語の切り替えの後も未保存の入力が残る(`t10-card.cjs`、`?plain`)。

### 前の所見の今

- S6-01 直っている(タップの当たり判定が React と同じ)。
- S6-02 / S6-03 / S6-04 まだある(React 版も同じ。t4-axe / t5-aria で React と同じ結果)。
- S6-05 README に書かれた。派生シグナル `createSignal(() => props.row.x)` は今も同じ行の編集で入力が消えるが、勧めのふつうの signal なら残る(書き方の注意 → S6-22)。

### 所見

**S6-21** 低 / 使いにくさ / React 版も同じ / 回帰ではない(前は試していない)/ dev・本番 / 確実 — 2 つのグリッドがあるとき、片方の列メニュー(または右クリックメニュー)を開いたまま、もう片方の列見出しのメニューボタンを押すと、前のメニューが閉じずに 2 つ開く(B のメニューは上へ開いて A の表に重なる)。Esc 1 回で両方閉じる。右クリック同士や本体のセルを押したときは前のメニューが閉じる。証拠 `S6/solid/out/shot-two-colmenus-solidprod.png`、`S6/solid/t11b-two-menus.cjs`。

**S6-22** 低 / ドキュメント / Solid だけ / 回帰ではない / 確実 — README の「保存前の入力はふつうの signal で持つ」をそのまま `createSignal(ctx.row.x)` と書くと、dev で `[STRICT_READ_UNTRACKED] Reactive value read directly in <DetailCard> will not update` が出る(動きは正しい)。`untrack(() => ctx.row.x)` で包むと出ない。README に 1 行の例がほしい。証拠 `S6/solid/t10-card.cjs`(`?plain`)、`S6/solid/src/App.tsx` の `DetailCard`。

## Solid の利用者として / 要望

- SSR は README のとおりに書けた。「本番のサーバーは `NODE_ENV=production` で起動する(またはビルドで `define`)」の 1 行がほしい(無いと黙って動かず、dist を読む必要があった)。相対日付のプリセットや `theme="auto"` のように、サーバーとブラウザで値が変わりうるものを SSR したときの扱い(「プリセットは client で解決したものを渡す」「グリッドは client だけで描く」のどちらを勧めるか)も。
- 開発時の診断の表: `memo "computed"` / `clampSelectionToRowCount` も載せるか、「表の名前は例」と書いてほしい。
- 2 つのグリッドは素直に分かれて動いた。右クリックメニューは項目を返す関数が無いとブラウザ標準のメニューになることが、Solid の README から API_REFERENCE へ行けば分かった(初めは `enableContextMenu` だけで出ると思い込んだ)。
- 要望: S2-22 は React 版のように作り直してでも件数・行数・行を合わせてほしい。S6-21 別のグリッドの列メニューを開いたら前のグリッドのメニューも閉じる(React 版も)。S2-23 SSRM のプリセットの解決に使う日付(またはタイムゾーン)を `getRows` の引数で受け取れるとよい。