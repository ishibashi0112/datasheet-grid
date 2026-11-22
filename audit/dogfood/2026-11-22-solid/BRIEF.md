# Solid 版 0.1.0 の候補の実アプリ点検 — 共通の手順

以下 `$D` = `/tmp/claude-0/-home-user/eb21e188-0cf8-51a9-aa1e-6d2dc24ac0be/scratchpad/dogfood-solid`(新しいコンテナでは自分のスクラッチに読み替える)。

## 目的

まだ公開していない Solid 版 `@ishibashi0112/spreadsheet-grid-solid@0.1.0` の候補(pack した tarball)を、**実際の利用者として**使って現実的なアプリを作り、実ブラウザで操作して、不具合・ドキュメントとの食い違い・使いにくさ・型の問題を見つける。Solid 版は React 版(`@ishibashi0112/spreadsheet-grid`、npm の 1.2.1)と同じ core の上に作った移植で、props・列の定義・ハンドル・CSS は React 版と同じ(違いは Solid 版の README の「Differences from the React version」)。**修正はしない**(見つけて、確かめて、報告するだけ)。

## 入れ方

- Solid 版: `npm install $D/pack/ishibashi0112-spreadsheet-grid-solid-0.1.0.tgz`(依存の core `@ishibashi0112/spreadsheet-grid-core@1.2.1` は npm の公開版から入る)。peer は `solid-js` / `@solidjs/web` の `^2.0.0`(npm の latest は 2.0.3)。
- Vite は 8 と `@solidjs/vite-plugin` 3(README のとおり)。
- 2026-11-22 時点で SolidStart の公開版(`@solidjs/start` 2.2.3)は solid-js 1 系向け(peer `^1.9.15`)。Solid 2.0 で使えるものが npm に無ければ、SSR は Vite 8 の SSR(`@solidjs/vite-plugin` の SSR + `@solidjs/web` の `renderToString` / `renderToStream` と `hydrate`)で手で組む。ルーターは `@solidjs/router` の 2.0 系。UI の部品ライブラリは Solid 2.0 に対応していないものが多いので、対応していなければ Tailwind と自前の部品で作る(ライブラリが入らないこと自体は所見にしない)。
- 利用側のテストは `@solidjs/testing-library` の `1.0.0-rc.2`(Solid 2.0 向けの `next`)。
- 比べるときの React 版: `npm install @ishibashi0112/spreadsheet-grid@1.2.1`(React 19)。

## ルール

1. 作業場所は `$D/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. **リポジトリ `/home/user/datasheet-grid` は読まない・使わない**(packages / audit / docs / examples すべて)。使ってよいのは利用者が見られるものだけ:
   - `node_modules/@ishibashi0112/spreadsheet-grid-solid/README.md`(= `$D/docs/SOLID_README.md`)、core の README
   - Solid 版の README が案内している React 版の `API_REFERENCE.md`(`$D/docs/API_REFERENCE.md`)、ドキュメントサイトの写し `$D/docs/website-docs/`(MDX。React 版向けに書いてある。サイトはコンテナから開けない)、`$D/docs/CHANGELOG.md`、GitHub のサンプル `$D/docs/examples/solid`(と React 版の `basic`)
   - `dist/` の中身は、不具合を体験した後に原因を切り分けるときだけ読んでよい(利用者もできるので)
   - ドキュメントサイトにはまだ Solid 版のページが無い(0.1.0 の公開と一緒に足す予定)。React 版のドキュメントを Solid に読み替えて詰まった所・迷った所は、**ドキュメントの所見**として記録する(Solid のページに書くべきことの材料になる)。
3. 現実のアプリらしく作る: 題材に合うデータ(生成でよい)を使い、Solid 2.0 の普通の書き方で書く(signal / store / `createMemo` / `<For>` / `<Show>` など)。まずドキュメントを読んでそのとおりに書く。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` はどこからでも使え、`chromium.launch()` は引数不要。`playwright install` はしない)。スクリプトはアプリのディレクトリに置く。
   - 実際の入力で操作する(`page.mouse` / `page.keyboard` / `page.touchscreen`)。Shift+クリックは `page.keyboard.down('Shift')` で押さえてからクリックする(`page.mouse.click` の `modifiers` は効かない)。クリップボードは `context.grantPermissions(['clipboard-read','clipboard-write'])`。
   - `page.on('console')` と `page.on('pageerror')` を必ず集め、出た警告・エラーを記録する(Solid 2.0 の開発時の診断も)。
   - dev と本番ビルド(`vite build` + `vite preview`。SSR は自分のサーバーの本番の形)の両方で、少なくとも主要な操作を一度は確かめる。
   - スクリーンショットは `deviceScaleFactor: 1` で撮り、Read で開いて自分の目で見た目を確かめる(ずれ・はみ出し・重なり・色)。
5. **React 版と比べる**: 不具合らしいものを見つけたら、React 版 1.2.1 で同じ構成・同じ操作の最小のアプリを作って確かめ、所見に「Solid だけ」/「React 版も同じ」を書く(React 版も同じなら、それは React 版の既知 / 未知の問題として扱う)。見た目や動きが React 版と違って見えるところも、React 版と並べて確かめる。
6. ポートは指定のものだけ。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない。ほかのエージェントも同じマシンで動いている)。長く動くサーバーは Bash の `run_in_background` で起動する。
7. 不具合と書く前に: ドキュメントでその使い方が正しいか確かめ、**最小の構成で再現し直す**(できれば 1 ファイルの最小アプリ)。自分のアプリの誤りなら所見にしない(ドキュメントが誤解を招いたならドキュメントの所見)。再現が安定しないもの・一度だけのものは「未確定」。
8. ライブラリの dist を書き換えない。回避策が見つかれば書く。
9. マシンは 4 CPU を 3 人で分け合っている。時間の数値は参考値。重さの所見は本番ビルドで 2 回以上測り、React 版の同じアプリと比べてから書く。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに次の順に:

1. **作ったもの**: 構成(ツール・版)、使った機能、画面の概要。
2. **確かめた操作**: 実際に試した操作の一覧(**問題が無かった範囲も**書く)。
3. **所見**: ID は `<アプリID>-NN`(例 `S1-01`)。各所見に:
   - 重要度: **高** = データが壊れる・失われる / 間違った値が保存・出力される / 例外で落ちる / よくある構成で機能が使えない(回避策なし)。**中** = 現実的な場面で明らかに誤った挙動(回避策あり)/ ドキュメントどおりに書くと動かない。**低** = 見た目・まれな条件・ドキュメントの不足・小さな使いにくさ。
   - 種類: 不具合 / ドキュメント / 使いにくさ / 型
   - **Solid だけ / React 版も同じ / React 版では確かめていない**
   - 題名、再現手順(最小)、期待 / 実際、証拠(コンソールの文言・計測値・スクショのパス・最小再現のファイルのパス)、dev / 本番のどちらで、確度(確実 / 未確定)
4. **Solid の利用者として**: React 版のドキュメントを Solid へ読み替えるときに困った所、Solid のページに書いてほしいこと(短く)。
5. **要望**(あれば短く)。

---

# アプリごとの内容

各アプリは「必ず試すこと」を中心に、題材の利用者が実際にやりそうな操作を自分で考えて足すこと。機能を単独で試すより、**組み合わせ**と**普段の作業の流れ**と、**Solid らしい書き方**(signal / store での行の更新、`<Show>` で出し入れ、ルートの切り替えでのマウント / アンマウント、細かい反応性)を重視する。

## S1. 在庫・発注表(ポート 5501)

- 構成: Vite 8 + Solid 2.0 + TypeScript + **Tailwind CSS v4**(`@import "tailwindcss"` と一緒にグリッドの CSS。`style.layer.css` の形をドキュメントどおりに)、npm。日本語(既定)。全部入りの `SpreadsheetGrid`。
- 列: 品番(固定)/ 品名(text)/ 区分(select)/ 数量・単価(number、0 以上の整数、`min` / `max` / `integer`)/ 金額(`valueGetter`)/ 入荷予定日(date)/ 要発注(checkbox)/ 備考(複数行 `multiline`)/ 状態(確定済みの行は `canEditCell` で編集不可)。`validate` と検査の表示(mark と reject)、`totalRow`、`fillHandle`、行の選択と削除、元に戻す / やり直し。行は `createSignal` の配列と `createStore` の 2 通りで持ってみる(`onRowsChange` の受け取り方、ドキュメントの「受け取った配列をそのまま戻す」)。
- グリッドの上に「品目を追加」のフォーム(入力・Enter・Tab がグリッドに影響しないか、編集中にフォームを押したときの確定とフォーカス)。
- 必ず試すこと: Excel からの貼り付け(TSV を書いて Ctrl+V。全角数字・「１，２００」・日付の「2026/11/1」・select の表示名)、フィルハンドルで日付と数量の連続データ、貼り付け / フィル / 編集の後の Ctrl+Z / Ctrl+Y、`imeDirectInput`(CDP の `Input.imeSetComposition` → `Input.insertText`)、CSV のエクスポート(`includeTotalRow`・`escapeFormulas`)、列メニュー・列フィルター・ツールパネル・右クリックメニュー・検索、Tailwind の preflight との共存、ダークモード(`theme="class"`)、`renderCell` の中のボタン(押せるか、押したときに列 / セルの選択が変にならないか)、ハンドル(`ref` を変数 / 関数で受ける形の両方、`focus()` / `startEditing()` / `getState()` / `applyState()` / `scrollToRow()`)。

## S2. SSR の管理画面(SSRM)(ポート 3501。必要なら 5502 も)

- 構成: Vite 8 + Solid 2.0 + `@solidjs/router` 2 + TypeScript の **SSR**(上の「入れ方」の SolidStart の注意を読む)。Node のサーバー(自分で書く。`renderToString` か `renderToStream` + `hydrate`)、npm。**英語**(`@ishibashi0112/spreadsheet-grid-solid/locales/en` の `localeTextEn`)。
- サーバー側: メモリ上の 50,000 人のユーザー。`GET /api/users`(範囲・ソート・フィルター)、`PATCH /api/users`(書き戻し。300〜800ms の遅延、10% の確率で失敗)。グリッドは SSRM(`dataSource` の `getRows` と `updateRows`)。ページは 2〜3 つ(一覧 / 詳細 / 設定)で、ルートを行き来してグリッドがマウント / アンマウントされる。
- 必ず試すこと: SSR の HTML にグリッドがどう出るか(エラーにならないか、`window` が無くても落ちないか)とハイドレーション(警告・二重の描画・ずれ)、列フィルター(text / set / date / number)とソートがサーバーへ渡るか、グローバルフィルター、編集中・保存中のスクロール、書き戻しの失敗とロールバック・保存の状態表示、追加 / 削除の後の `refreshServerSide()`、ネットワークの失敗と `retryServerSideLoads()`、並び / フィルターを URL のクエリと同期(`getState` / `applyState`、ブラウザの戻る / 進む)、ルートを 30 回行き来した後のメモリとリスナー(CDP)、本番の形。英語の画面に日本語が残っていないか。

## S3. 商品マスタ(機能を選んで組み込む)(ポート 5503)

- 構成: Vite 8 + Solid 2.0 + TypeScript + Tailwind v4 + グリッドのテーマ `themes/shadcn.css`(shadcn/ui の配色変数をドキュメントどおりに用意)、npm。日本語。**`createSpreadsheetGrid`** に `standardFeatures` と必要な機能(ラベル行・行のドラッグ・エクスポート など。名前はドキュメントで調べる)を足す(Solid 版は部品も同じ入口から import する)。
- 商品 5,000 件。カテゴリの見出しを `labelRow`(sticky)、カテゴリ内での行のドラッグ(`onRowMove`)、画像のサムネイル列(`renderCell`)、選択肢の多い select、custom エディタ(自前のポップアップ = 候補の検索、ポータルで body に出す、キーボードで選べる)、検査、検索。
- 必ず試すこと: 登録していない機能の prop を渡したとき(例 `fillHandle` を機能なし)の開発時の警告の分かりやすさ → 機能を足して動くこと。ビルドした JS の gzip の大きさ(機能なし / standard / 全部入り)を README の数字と比べ、同じアプリで `createSpreadsheetGrid` と `SpreadsheetGrid` を混ぜた場合の挙動と大きさ。ネイティブの `<dialog>`(`showModal()`)の中にグリッドを置いたとき(列フィルター・列メニュー・右クリックメニュー・エディタのポップアップが前面に出て押せるか、Esc でダイアログごと閉じないか)。custom エディタのポップアップで選ぶとエディタが閉じてしまわないか、Tab / Enter / Escape。ダークモード。

## S4. テストと型(ポート 5504)

- 構成: グリッドを使う部品(在庫の一覧など)を作り、利用者のテストとして書く。Vitest + jsdom + `@solidjs/testing-library`、`@ishibashi0112/spreadsheet-grid-solid/testing`(React 版のガイド guides/testing を Solid に読み替える)。happy-dom でも回す。
- 必ず試すこと: テストの書き方がドキュメント(の読み替え)どおりで通るか(描画・セルの編集・フィルター・キー操作・範囲選択とコピー・ハンドルの API)、Vitest の設定(README の「Node では solid か browser の条件」)、SSR(Node で `renderToString`)。型: `GridColumn<Row>` の推論、`valueGetter` / `valueFormatter` / `rowKeyGetter` の型、ハンドルの型、`renderCell` / `renderHeader` の引数の型、グリッドを包む部品をライブラリとして `tsc --declaration` で d.ts を出す(パッケージの公開の名前だけで書かれるか。README の peerDependencies の注意)、`moduleResolution` が bundler / nodenext の両方、TypeScript 5.8 と最新(7.0 系)、`strict` + `exactOptionalPropertyTypes`。React 版のテストの書き方(ガイド)と Solid での違い(`flush()` が要るか等)をまとめる。

## S5. ログと株価のライブ画面(ポート 5505)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。日本語。画面は 2 つ(タブ):
  - ログ 1,000,000 行(時刻 / レベル / サービス / メッセージ / traceId)。時刻に日付フィルター(相対の期間)、レベルとサービスに set フィルター + chips、メッセージは長文で `autoHeight` + 折り返し、展開行(`detailRow`)で JSON。末尾を追うモード(毎秒 50 行を足し、いちばん下にいるときだけ下へ。`isAtBottom()` / `onScroll` の `atBottom` / `scrollToBottom()`)。
  - 株価 2,000 銘柄、250ms ごとに 100 行を更新(signal の配列を作り直す形と、ハンドルの `applyRows` の形)。`highlightChanges`、`conditionalFormat`(colorScale / dataBar / chips)、`animateRows`、`activeCellFollows: 'row'`、`rowGroup` + `aggFunc`(業種ごと)、`pinnedTopRows`(指数)。
- 必ず試すこと: 100 万行での検索(Ctrl+F)・グローバルフィルター・列フィルター・ソート、遠くへのスクロール、本番ビルドでの初回表示・ソート・フィルター・検索・スクロールの時間とメモリ(2 回以上。**React 版で同じ画面を作って比べる**)、更新中のソート・選択・コピー・集計・メモの編集、3〜5 分動かしてメモリと長いタスクとコンソール。

## S6. モバイル・アクセシビリティ・ダイアログ(ポート 5506)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。日本語と英語の切り替え。現場点検の一覧(場所 / 項目 / 結果 select / 数値 / メモ / 写真の有無 checkbox)+ 点検の詳細を展開行(`detailRow`)のカード(入力欄とボタン)で、行のドラッグで並べ替え。
- 必ず試すこと: スマートフォン(`devices['iPhone 13']` 相当を Chromium で。`hasTouch` / `isMobile`)とタブレットで、タッチでのスクロール(CDP の `Input.dispatchTouchEvent`)・タップでの選択・編集の開始・select と checkbox・列フィルターの画面・下部バー・横向きへの回転。キーボードだけの操作(フォーカスの見え方、Tab でグリッドに入って出る、展開行のカードの中の `Tab` の順)。axe-core(npm の `axe-core` をページに注入)でグリッド・ポップオーバー・エディタを検査し、**React 版の同じ画面と結果を比べる**。`aria-rowcount` / `aria-rowindex` / `aria-colindex`、ボタンの名前。`prefers-reduced-motion` と `forcedColors: 'active'`。ネイティブの `<dialog>` の中のグリッド(ポップアップ・エディタ・右クリックメニュー)。言語を切り替えたとき(`localeText` を signal で変える)に文言が全部変わるか。