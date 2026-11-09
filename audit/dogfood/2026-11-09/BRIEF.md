# 1.0.0 実アプリ点検 — 共通の手順

以下 `$S` = `/tmp/claude-0/-home-user-datasheet-grid/4235a129-3a13-5977-b0b9-8595e17bd91f/scratchpad`。

## 目的

npm に公開済みの `@ishibashi0112/spreadsheet-grid@1.0.0`(と依存の `@ishibashi0112/spreadsheet-grid-core@1.0.0`)を、**実際の利用者として**使って現実的なアプリを作り、実ブラウザで操作して、不具合・ドキュメントとの食い違い・使いにくさ・型の問題を見つける。**修正はしない**(見つけて、確かめて、報告するだけ)。

## ルール

1. 作業場所は `$S/dogfood/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. パッケージは npm の公開版から入れる(`npm install @ishibashi0112/spreadsheet-grid@1.0.0`。指定があれば pnpm)。**リポジトリ `/home/user/datasheet-grid` は読まない・使わない**(src / audit / docs/audits / examples すべて)。使ってよいのは利用者が見られるものだけ:
   - `node_modules/@ishibashi0112/spreadsheet-grid/` の `README.md` / `API_REFERENCE.md` / `skills/spreadsheet-grid/SKILL.md`、core の `README.md`
   - ドキュメントサイトの写し `$S/dogfood/docs/`(MDX。サイト https://datasheet-grid.vercel.app はコンテナから開けない)と `$S/dogfood/docs/CHANGELOG.md`
   - `dist/` の中身は、不具合を体験した後に原因を切り分けるときだけ読んでよい(利用者もできるので)
3. 現実のアプリらしく作る: 題材に合うデータ(生成でよい)を使い、普通の開発者が書く書き方で書く。まずドキュメントを読んでそのとおりに書き、詰まった所・迷った所・ドキュメントに無かった所も記録する(ドキュメントの所見になる)。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` はどこからでも使え、`chromium.launch()` は引数不要。`playwright install` はしない)。スクリプトはアプリのディレクトリに置く。
   - 実際の入力で操作する(`page.mouse` / `page.keyboard` / `page.touchscreen`)。クリップボードは `context.grantPermissions(['clipboard-read','clipboard-write'])`。
   - `page.on('console')` と `page.on('pageerror')` を必ず集め、出た警告・エラーを記録する。
   - React の `StrictMode` を有効にする。
   - dev と本番ビルド(`vite build` + `vite preview`、Next.js は `next build` + `next start`)の両方で、少なくとも主要な操作を一度は確かめる。
   - スクリーンショットは `deviceScaleFactor: 1` で撮り、Read で開いて自分の目で見た目を確かめる(ずれ・はみ出し・重なり・色)。
5. ポートは指定のものだけ。終わったら自分が起動したサーバーとブラウザを止める(PID で kill。`pkill -f` は自分の bash ごと殺すことがあるので使わない)。長く動くサーバーは Bash の `run_in_background` で起動する。
6. 不具合と書く前に: ドキュメントでその使い方が正しいか確かめ、**最小の構成で再現し直す**(できれば 1 ファイルの最小アプリ)。自分のアプリの誤りなら所見にしない(ただしドキュメントが誤解を招いたならドキュメントの所見にする)。再現が安定しないもの・一度だけのものは「未確定」と書く。
7. ライブラリの dist を書き換えない。回避策が見つかれば書く。
8. マシンは 4 CPU を 12 本の点検で分け合っている。時間の数値は参考値。重さの所見は本番ビルドで 2 回以上測ってから書く。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、次の順に:

1. **作ったもの**: 構成(ツール・版・UI ライブラリ)、使った機能、画面の概要。
2. **確かめた操作**: 実際に試した操作の一覧(**問題が無かった範囲も**書く。後で「どこまで見たか」を報告するため)。
3. **所見**: ID は `<アプリID>-NN`(例 `A-01`)。各所見に:
   - 重要度: **高** = データが壊れる・失われる / 間違った値が保存・出力される / 例外で落ちる / よくある構成で機能が使えない(回避策なし)。**中** = 現実的な場面で明らかに誤った挙動(回避策あり)/ ドキュメントどおりに書くと動かない。**低** = 見た目・まれな条件・ドキュメントの不足・小さな使いにくさ。
   - 種類: 不具合 / ドキュメント / 使いにくさ / 型
   - 題名、再現手順(最小)、期待 / 実際、証拠(コンソールの文言・計測値・スクショのパス・最小再現のファイルのパス)、dev / 本番のどちらで、確度(確実 / 未確定)
4. **ピン留め行**: このアプリで「任意の行を表の上 / 下に固定したい」(下端の合計行 `totalRow` 以外)場面があったか。あれば、どんな行をどう固定したかったか、今の機能でどう代わりにしたか。無ければ「無し」。
5. **要望**(あれば短く)。

---

# アプリごとの内容

各アプリは「必ず試すこと」を中心に、題材の利用者が実際にやりそうな操作を自分で考えて足すこと。機能を単独で試すより、**組み合わせ**と**普段の作業の流れ**を重視する。

## A. 経費精算(ポート 5401)

- 構成: Vite + React 19 + TypeScript + **Tailwind CSS v4**(`@import "tailwindcss"` と一緒にグリッドの CSS を読む。`style.layer.css` を使う形をドキュメントどおりに)、npm。日本語(既定)。
- 列: 日付(date エディタ)/ 区分(select)/ 金額(number、0 以上の整数)/ 税区分(select)/ 領収書(checkbox)/ 摘要(text の複数行 `multiline`)/ 状態(提出済みの行は `canEditCell` で編集不可)。`validate` と検査の表示(mark と reject の両方を試す)、`totalRow`(金額の合計。アプリの見出しにも同じ合計を出して一致を確かめる)、`fillHandle`、行の選択と削除、元に戻す / やり直し。
- グリッドの上に「経費を追加」のフォームを置く(フォームの入力欄での入力・Enter・Tab がグリッドに影響しないか、編集中にフォームを押したときの確定とフォーカス)。
- 必ず試すこと: Excel からの貼り付け(クリップボードに TSV を書いて Ctrl+V。複数行・複数列、全角数字や「１，２００」、日付の「2026/11/1」「11/1」、select の表示名)、フィルハンドルで日付と金額の連続データ、貼り付け / フィル / 編集の後の Ctrl+Z / Ctrl+Y、`imeDirectInput`(CDP の `Input.imeSetComposition` → `Input.insertText` で日本語の変換確定を模す)、CSV のエクスポート(`includeTotalRow`、`escapeFormulas`、中身を開いて確かめる)、Tailwind の preflight との共存(見た目のスクショ)、ダークモード(Tailwind の `dark` クラス + `theme="class"`)。

## B. 株価ボード(ポート 5402)

- 構成: Vite + React 19 + TypeScript、npm。**英語**(`@ishibashi0112/spreadsheet-grid/locales/en` の `localeTextEn`)。
- 2,000 銘柄。250ms ごとに 100 行の値を変える(`rows` を作り直す方式と、ハンドルの `applyRows` の方式の両方を試す)。`highlightChanges`、`conditionalFormat`(前日比に colorScale、出来高に dataBar、状態に chips)、数値の書式(`valueFormatter` / `numberFormatter`、en-US)、`animateRows`。
- 必ず試すこと: 更新中に前日比でソート(並びは追従するか、アクティブセル / 選択はどの行に残るか)、更新中の列フィルター・検索(Ctrl+F)・範囲選択とコピー・選択範囲の集計、更新中にメモ列(編集可)を編集(エディタが閉じたり値が消えたりしないか)、3〜5 分動かしてメモリ(CDP の `Performance.getMetrics` / `HeapProfiler` 等)と長いタスクとコンソールを観察、本番ビルド。英語の画面に日本語が残っていないか(下部バー・列メニュー・フィルター画面・ツールパネル・右クリックメニュー・検証のメッセージ・aria-label・title)。

## C. シフト表(ポート 5403)

- 構成: Vite + React 19 + TypeScript + **HeroUI v3**(グリッドのテーマ `themes/heroui.css`)、npm。日本語。
- 職員 120 人 × 31 日。左に固定(氏名・部署)、右に固定(出勤日数・夜勤回数 = `valueGetter` で計算)、日の列は select エディタ(早 / 遅 / 夜 / 休)+ `conditionalFormat` の chips、`hoverHighlight: 'cross'`、見出しは `renderHeader`(日付 + 曜日、土日祝は色)、土日の列 / 行に class。部署ごとの見出しを `labelRow`(sticky)で。
- 必ず試すこと: 列の仮想化の上での横スクロール(固定列が崩れないか)、固定列と中央をまたぐ範囲のコピー / 貼り付け、フィルハンドルで横に「早,遅,夜」の繰り返し・縦にコピー、キー操作(Ctrl+矢印 / Home / End / PageUp / PageDown / Tab / Enter)、列の幅の自動調整とドラッグでの変更、月の切り替え(31 日 → 30 日 → 28 日で列と行を入れ替えたときの選択・幅・スクロール位置)、HeroUI のダークモード、見た目のスクショ。

## D. SaaS 管理画面(ポート 3401)

- 構成: **Next.js 16 App Router(Turbopack)** + React 19 + TypeScript + Tailwind v4 + グリッドのテーマ `themes/shadcn.css`(shadcn/ui の配色変数をドキュメントどおりに用意)、**pnpm**。**英語**(`localeTextEn`)。
- サーバー側: Route Handler で 50,000 人のユーザーのメモリ上の DB。`GET /api/users`(範囲・ソート・フィルター)、`PATCH /api/users`(書き戻し。300〜800ms の遅延、10% の確率で失敗)。グリッドは SSRM(`dataSource` の `getRows` と `updateRows`)。
- 必ず試すこと: 列フィルター(text / set / date / number)とソートがサーバーへ渡るか、グローバルフィルター、編集中・保存中のスクロール、書き戻しの失敗とロールバック・保存の状態表示、フォームからの追加 / 削除の後の `refreshServerSide()`、ネットワークの失敗(一時的に 500 を返す)と `retryServerSideLoads()`、並び / フィルターを URL のクエリと同期(`getState` / `applyState`、ブラウザの戻る / 進む)、`theme="class"` + next-themes のダークモード、Server Component と Client Component の境目(`'use client'`、`localeTextEn` の渡し方)、ハイドレーションの警告、`next build` + `next start`。

## E. 商品マスタ(`/lite`)(ポート 5405)

- 構成: Vite + React 19 + TypeScript + **Mantine v8**(グリッドのテーマ `themes/mantine.css`)、npm。日本語。**`@ishibashi0112/spreadsheet-grid/lite`** の `createSpreadsheetGrid` で、`standardFeatures` に必要な機能(ラベル行・行のドラッグ・エクスポート など。名前はドキュメントで調べる)を足す。
- 商品 5,000 件。カテゴリの見出しを `labelRow`(sticky)、カテゴリ内での行のドラッグの並べ替え(`onRowMove`)、画像のサムネイル列(`renderCell`)、選択肢の多い select、検査、検索。
- 必ず試すこと: 登録していない機能の prop を渡したとき(例 `fillHandle` を機能なしで)の開発時の警告の分かりやすさ → 機能を足して動くこと。ビルドした JS の gzip の大きさ(lite だけ / lite + standard / 全部入り `.`)をドキュメントの数字と比べる。同じアプリで `/lite` と `.` を混ぜた場合(グリッド 2 つ)の挙動と大きさ。Mantine のカラースキームの切り替え。Mantine の `Modal` の中にグリッドを置いたとき(列フィルター・列メニュー・右クリックメニュー・エディタのポップアップが前面に出るか、押せるか、フォーカスの罠)。custom エディタの中で Mantine の `Select`(ポータルで出るドロップダウン)を使ったとき、選ぶとエディタが閉じてしまわないか。

## F. 見積書(ポート 5406)

- 構成: Vite + **React 18.3.1 + @types/react 18** + TypeScript、npm。日本語。
- 区分(工事 / 材料 / 諸経費)を `labelRow` で区切り、明細: 品名(custom エディタ = 非同期の候補検索のポップアップ、キーボードで選べる)/ 数量 / 単価(number)/ 金額(`valueGetter` で計算)/ 備考(複数行 `multiline` と列の `enterKey`)。`totalRow`(合計)。
- 必ず試すこと: 今の行の下に行を足す(ボタンとショートカット)、行の削除、区分をまたぐ行のドラッグ、元に戻す / やり直し、ハンドル(`ref` が React 18 で効くか、`focus()` / `startEditing()` / `getState()` / `scrollToRow` 等)、custom エディタでの確定 / 取り消し / Tab、区分ごとの小計をどう出すか(ドキュメントで探す。無ければ要望)、エクスポート(ラベル行の `exportText`)、印刷のプレビュー(`page.emulateMedia({ media: 'print' })` で見た目)、React 18 の StrictMode で警告が出ないか。

## G. ログビューア(ポート 5407)

- 構成: Vite + React 19 + TypeScript、npm。日本語。
- ログ 1,000,000 行(時刻 / レベル / サービス / メッセージ / traceId)。時刻に日付フィルター(相対の期間を含む)、レベルとサービスに set フィルター + chips、メッセージは長文で `autoHeight` + 折り返し、展開行(`detailRow`)で JSON のペイロード / スタックトレース。
- 必ず試すこと: 100 万行での検索(Ctrl+F。途中で画面が固まらないか)・グローバルフィルター・列フィルター・時刻のソート、「末尾を追う」モード(毎秒 50 行を末尾に足し、いちばん下にいるときだけ自動で下へ。上へスクロールしたら止める)、行のコピー、本番ビルドでの初回表示・ソート・フィルター・検索の時間とメモリ(2 回以上)、autoHeight の行が多いときのスクロールのがたつき(スクロール位置の跳び)、展開行を開いた状態でのソート / フィルター / 追加。

## H. WBS / タスク管理(ポート 5408)

- 構成: Vite + React 19 + TypeScript + **Mantine v8**(`themes/mantine.css`)、npm。日本語。
- タスク 3,000 件。`rowGroup` で担当者 → 状態の 2 段のグループ、`aggFunc`(見積時間の合計、進捗の平均、件数)、列メニューからのグループ化の切り替え、全部開く / 閉じる(ハンドル)、展開行(`detailRow`)の中にもう一つの `SpreadsheetGrid`(サブタスク)、行の選択(チェックボックス)+ ツールバーで一括の状態変更、ツールパネル(列の表示 / 非表示)、列の並べ替え(`columnDragMotion="live"`)と列メニューからの固定。
- 必ず試すこと: 入れ子のグリッドでのキー操作・選択・コピー・スクロールが外のグリッドと混ざらないか、状態の保存と復元(`getState` → localStorage → 再読み込み → `initialState` / `restoreColumnsFromState`)、グループの開閉と `animateRows`、グループ中の編集(集計の更新)、グループを含むエクスポート(`includeGroupRows`)、グループ中のフィルターとソート。

## I. AI 売上分析(`/ai`)(ポート 5409)

- 構成: Vite + React 19 + TypeScript、npm。`@ishibashi0112/spreadsheet-grid/ai` の `GridAskBar` と `useGridAsk`。日本語と英語(`gridAskLocaleTextEn` + `localeTextEn`)の両方。
- 売上 20,000 行(日付 / 地域 / 担当 / 商品 / 数量 / 金額 / 状態)。本物の AI は呼べないので、`ask` はモック: 受け取った要求(system / prompt / schema)を記録し、10 個ほどの決まった文(「関東の 10 万円以上」「先月の売上を金額の大きい順」「状態が未入金のもの」など)に、ドキュメントの例と同じ形の構造化出力を返す。
- 必ず試すこと: 返す schema が構造化出力の制約を満たすか(Ajv で JSON Schema として検査 + ドキュメントにある各社の制約を読み、`additionalProperties: false` / `required` 等の観点で確かめる)、要求に行のデータが入っていないか、不正な答え(無い列・型違い・範囲外の値・空)の扱い、遅い答え(5 秒)と止める、例外を投げたとき、続けて聞く(refine)、チップの表示と、反映後に手で表を変えたときの「古い」印、`allowFilter`、`filterType` の無い列、グループ化中に聞く。`useGridAsk` で自作の UI を作る。ドキュメント(guides/ai-filter)のサーバー例のコードを実際の SDK の型で確かめる(`@anthropic-ai/sdk` / `openai` 等を入れて tsc。呼び出しはしない)。

## J. ダッシュボードへの埋め込み(ポート 5410)

- 構成: Vite + React 19 + TypeScript + Tailwind v4 + **Radix UI**(Dialog / Tabs / Popover)+ `react-resizable-panels`、npm。日本語。
- 1 画面にグリッド 4 つ。タブの中(非表示のタブ = `display:none` のまま描かれる形と、切り替えでアンマウントする形の両方)、Dialog の中、分割パネルの中(境目をドラッグ)、`transform: scale(0.8)` の箱の中、縦に長いページの途中(ページのスクロールとグリッドのスクロールが両方ある)。`height="100%"` を flex の中で。
- 必ず試すこと: 隠れていたタブを開いたときの表示(列の幅・行・スクロールバー)、Dialog の中で列フィルター / 列メニュー / 右クリックメニュー / select エディタ / date エディタが前面に出て押せるか(フォーカスの罠、Esc で Dialog ごと閉じないか)、分割パネルをドラッグしている間とその後の表示、拡大縮小の箱の中でのクリック位置・ドラッグ・列の幅の変更、タブを 50 回切り替え / グリッドを何度もマウント・アンマウントした後のメモリとリスナー(CDP の `DOMDebugger.getEventListeners` / heap)、ウィンドウの大きさの変更、ダークモード、表示倍率(`deviceScaleFactor` 1.25 / 1.5)での線のずれ・固定ペインの段差。

## K. テストと SSR と型(ポート 5411 / 3411)

- 構成: グリッドを使う部品(在庫の一覧など)を作り、利用者のテストとして書く。Vitest + jsdom + Testing Library、`@ishibashi0112/spreadsheet-grid/testing`(ドキュメント guides/testing のとおり)。**React 19 版と React 18.3 版の 2 つのコピー**で同じテストを回す。
- 必ず試すこと: テストの書き方がドキュメントどおりで通るか(描画・セルの編集・フィルター・キー操作・範囲選択とコピー・ハンドルの API)、`act` の警告、SSR(Node の ESM と CJS で `renderToString`。`window` が無くても落ちないか)、**Next.js 15 Pages Router + React 18.3** のページにグリッドを置いて SSR とハイドレーション(警告)、`next build` + `next start`。型: `GridColumn<Row>` の推論、`valueGetter` / `valueFormatter` / `rowKeyGetter` の型、`useRef<SpreadsheetGridHandle<Row>>`、グリッドを包む部品をライブラリとして `tsc --declaration` で d.ts を出す(パッケージの公開の名前だけで書かれるか)、`moduleResolution` が bundler / nodenext の両方、TypeScript 5.8 と最新。

## L. 現場点検(モバイル / タッチ / アクセシビリティ)(ポート 5412)

- 構成: Vite + **React 18.3.1** + TypeScript、npm。日本語。点検項目の一覧(場所 / 項目 / 結果 select / 数値 / メモ / 写真の有無 checkbox)。
- 必ず試すこと: スマートフォン(Playwright の `devices['iPhone 13']` 相当を Chromium で。`hasTouch` / `isMobile`)とタブレットで、タッチでのスクロール(CDP の `Input.dispatchTouchEvent` で指を動かす)・タップでの選択・編集の開始・select と checkbox・列フィルターの画面・下部バーの配置・横向きへの回転(大きさの変更)。キーボードだけの操作(フォーカスの見え方、Tab でグリッドに入って出る)。axe-core(npm の `axe-core` をページに注入)でグリッド・ポップオーバー・エディタを検査。仮想化された状態での `aria-rowcount` / `aria-rowindex` / `aria-colindex` が正しいか、ボタンの名前。`prefers-reduced-motion`(`page.emulateMedia({ reducedMotion: 'reduce' })`)で動きが止まるか、`forcedColors: 'active'` で選択やフォーカスが見えるか。
