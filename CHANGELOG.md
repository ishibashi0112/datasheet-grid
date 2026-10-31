# 変更履歴

`@ishibashi0112/spreadsheet-grid`(React 版)と `@ishibashi0112/spreadsheet-grid-core`(フレームワーク非依存のコア。0.39.0 から公開)の変更履歴です。両パッケージの版は常に揃えています。

- **挙動の変化**: 公開 API は変わらないものの、見た目や動きが変わる変更です。上げる前に確かめてください。
- **core の破壊的変更**: core を直接使っている場合だけ影響します。React 版だけを使っている場合は関係ありません。
- **非推奨**: 今は使えますが、後の版で消す予定のものです。代わりに使うものと一緒に書きます。

版の上げ方と公開範囲は[バージョンと互換性](https://datasheet-grid.vercel.app/docs/versioning)にあります。

詳しい使い方は[ドキュメントサイト](https://datasheet-grid.vercel.app)と [API リファレンス](./packages/react/API_REFERENCE.md)を参照してください。

## 0.60.0 — 2026-10-31

### 変更

- バージョンの方針(semver)と公開範囲を README とドキュメント([バージョンと互換性](https://datasheet-grid.vercel.app/docs/versioning))に書きました。0.x の間は壊す変更も minor で出し、この変更履歴の「挙動の変化」「core の破壊的変更」に書きます。1.0 からは壊す変更は major でだけ出し、消すものはその前の minor で非推奨にします。core の部品(`@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>`)は React 版が使う内部の部品で、semver の対象外です。
- CSS の公開範囲を API リファレンスの「スタイリング用の状態クラス(公開契約)」と、新しい節「CSS トークン(`--ssg-*`)(公開契約)」にまとめました。これまでガイドや API リファレンスの各所で案内していたクラスと属性(`.ssg-find-mark` / `.ssg-row-drag-handle` / `.ssg-ask` / `[data-ssg-save]` など)と、`style.css` のトークン 120 個がすべて載っています。表に無い `ssg-*` クラスと DOM の形は内部です。クラスやトークンの名前と付き方は変えていません。
- React 版の core への依存を、同じ版の固定にしました(`^X.Y.Z` → `X.Y.Z`)。React 版は core の内部の部品を使うので、版がずれると壊れることがあるためです。両パッケージは今までどおり同じ版で出します。core も直接使っている場合は、React 版と同じ版にそろえてください(違う版だと core が 2 つ入ります)。
- core の部品を `@ishibashi0112/spreadsheet-grid-core/internal/<dir>/<module>` からも import できるようにし、React 版はこちらを使うようにしました。中身は同じです。こちらも内部の部品で semver の対象外です(旧サブパスの代わりには入口を使ってください。下の「非推奨」)。

### 非推奨

- core の旧サブパス `@ishibashi0112/spreadsheet-grid-core/<dir>/<module>`(`internal/` の無いもの)。0.61.0 で消す予定です。React 版だけを使っている場合は関係ありません(React 版の上に作ったライブラリの型(d.ts)を公開している場合は、0.60.0 以降で作り直してください。0.59.0 までで作った d.ts には、型の推論で旧サブパスが書かれていることがあります)。core を直接使っている場合は入口 `@ishibashi0112/spreadsheet-grid-core` から import してください。入口に無いものが要る場合は `…-core/internal/<dir>/<module>` で動きますが、こちらも内部の部品でどの版でも変わるため、使いたいものを issue で知らせてもらえれば入口に足すことを検討します。

## 0.59.0 — 2026-10-29

### 変更

- 対応ブラウザを README とドキュメント([インストール](https://datasheet-grid.vercel.app/docs/installation))に書きました: Chrome / Edge 111 以降、Firefox 121 以降、Safari 16.4 以降。下限は CSS(`color-mix()` / `:has()`)で決まります。これより古いブラウザでも読み込めますが、一部の色とキーボード操作のフォーカスの表示が出ないことがあります。

### 挙動の変化

- 下部バー(件数あり)の右のグループ(Active / Selection / 選択の件数 / Cols)に最小幅(56ch)を持たせました。これまでは選択を広げて件数の桁が増えるとグループが数 px 伸び、窓の幅 600px 前後でバーが折り返して高さが 27px → 49px に変わり、表全体がずれていました。バーが 2 行になる幅は少し広くなり(500 行 × 12 列の表で約 610px → 約 665px)、2 行目へ回った右のグループは右端に寄ります。選択範囲の集計(平均 / データの個数 / 合計)を出す場所はそのぶん狭くなり、集計が切れずに出る幅も少し広くなります(同じ表で約 906px → 約 957px)。件数なし(`showBottomBarCounts: false`)のときは変わりません。表記が最小幅より長い大きな表(100 万行など)や、グループの中でチップが折り返す狭い幅(約 420px 以下)では、従来どおり表記の長さで高さが変わります。
- 大きさの変化への追従が 1 フレーム遅れます(下の ResizeObserver の修正のため)。窓や親の大きさが変わった直後と、auto-height の行の中身の大きさが変わった直後(列の幅を変えるドラッグ中、Web フォントの読み込み、テーマの切り替えなど)は、1 フレームだけ前の大きさのまま描かれ(flex 列の幅や行の高さ)、次のフレームで追いつきます。隠したグリッドを同じ大きさで出し直したとき(タブの切り替えなど)は従来どおり最初から正しく描きます。隠したまま生成したグリッド(最初は開いていないタブの中など)を初めて出したときと、隠している間に大きさが変わったときは、出した最初のフレームだけ前の大きさ(初めてなら大きさ 0)のまま描かれます(その場で書くと、auto-height のグリッドで出した後に行の高さを測らなくなる 0.58.0 までの不具合が戻るため)。

### 修正

- レイアウトが変わるとき(窓の幅の変化、SSRM の読み込み、auto-height の行の高さの変化など)に、ブラウザが「ResizeObserver loop completed with undelivered notifications」を window の error に出し、Sentry などのエラー監視に記録されていたのを直しました(Firefox で多く、Chrome / Safari でも auto-height のときに出ていました)。見える高さ / 幅と auto-height の行の測り直しを、ResizeObserver の通知の次のフレームで行います(隠れている間の大きさ 0 は書きません)。core の `createScrollSyncController` / `createAutoHeightMeasurer` を直接使っている場合も、`setViewState` への書き込みと snapshot の `nonce` の更新が次のフレームになります。
- auto-height のグリッドをスクロールした状態で隠す(`display: none`。タブの切り替えなど)と「Maximum update depth exceeded」でグリッドが外れていたのを直しました。隠れている間に測った高さ 0 を行の高さとして記録していたためです(core の `createAutoHeightMeasurer` も高さ 0 のセルを記録しません)。あわせて、隠したまま生成した auto-height のグリッドを出しても行の高さを測らなかったのも直りました。
- 行の位置を縮めて持つモード(100 万行など)で最後の行へ移ったとき(`scrollToRow(…, { align: 'end' })` / `selectCell(…, { scrollIntoView: true })` / キー操作)、Safari で最後の行が合計行の下に 2px 隠れていたのを直しました。行を下端に合わせるときはスクロール位置を切り上げます。あわせて、このモードで見えている行へ `'auto'` でスクロールしたとき、Safari で 1px 上へ動き `onScroll` に `source: 'user'` で通知されることがあったのも直しました(今の位置を変えずに渡します)。

## 0.58.0 — 2026-10-28

### 追加

- React 18.3 に対応しました(React 版の peer を `react` / `react-dom` `^18.3.0 || ^19.0.0` に広げました)。これまでは命令的 API の `ref` を React 19 の ref-as-prop で受け取っていたため、React 18 では `ref.current` が null のままでした。React 18 のときだけ `SpreadsheetGrid` と `createSpreadsheetGrid` が作るコンポーネントを内部で `forwardRef` に包むので、書き方はどちらの版でも同じです(利用側で `forwardRef` は要りません)。React 19 の利用者には何も変わりません(部品は従来と同じ)。全部入りの初期 JS は約 0.09KB gzip 増えます。

## 0.57.0 — 2026-10-28

### 追加

- AI コーディングツール向けの [Agent Skill](https://agentskills.io) を React 版の npm パッケージに同梱しました(`skills/spreadsheet-grid/SKILL.md`)。Claude Code / Cursor / Codex / GitHub Copilot など `SKILL.md` を読むツールが、間違えやすいルールと、同梱の `API_REFERENCE.md` のどこを読めばよいかを読み込みます。Skill のフォルダへ写すか、`npx skills add https://github.com/ishibashi0112/datasheet-grid/tree/main/packages/react/skills/spreadsheet-grid` で入れます([AI アシスタントで使う](https://datasheet-grid.vercel.app/docs/ai-assistants))。JS は増えません。
- ことばで絞り込み: 新しい入口 `@ishibashi0112/spreadsheet-grid/ai` の `GridAskBar` をグリッドの上に置くと、「東京の在庫が 10 個以下を高い順に」のような文から、AI がフィルター・並び・グローバル検索・列の表示(`allowColumnVisibility` のとき)を入れます(グリッドで列フィルター / 並び / 検索を止めているときは `allowFilter` / `allowSort` / `allowSearch` で AI にも変えさせません)。グリッドは AI を呼ばず、利用側の `ask`(自分のサーバー → 好きな AI。構造化出力の JSON Schema を `request.schema` で渡す)で聞きます。行のデータは送りません。AI が入れられる条件は列の `filterType` のフィルター画面と同じで、答えはすべて検査し(無い列・使えない条件・候補に無い値は捨てて「使えなかった部分」に出す)、すぐ反映してチップで見せ、「元に戻す」で戻せます。自前の UI 向けの `useGridAsk` と、React に依存しない `createGridAskRequest` / `readGridAskAnswer`(core からも公開)も入れました([ガイド](https://datasheet-grid.vercel.app/docs/guides/ai-filter))。`/ai` は別の入口(約 11.7KB gzip)なので、全部入りと `/lite` の JS は増えません。`style.css` にバーの見た目(約 0.7KB gzip)が入り、色のトークンの定義の対象に `.ssg-ask` が加わりました(`themes/*.css` も同じ)。

## 0.56.0 — 2026-10-26

### 追加

- number エディタの `integer`(`true` で整数だけ)。`editor: { type: 'number', min: 0, integer: true }` のように書くと、`validate` を書かなくても小数のセルに印とメッセージが付きます(`validationMode: 'reject'` なら書き込みません)。

### 挙動の変化

- number エディタの `min` / `max` を値の検査にも使うようになりました(これまでは ↑↓ キーとスピナーの刻みだけに効いていた)。`min` / `max` を付けている列では、範囲外の値や数値として読めない値のセルに印とメッセージ(「0 以上で入力してください」など)が付き、`getInvalidCells()` にも出ます。`validationMode: 'reject'` の列では書き込みません。空のセルは通します。`validate` と併用したときは `validate` が先で、`validate` の NG はそのメッセージのまま出ます(`validate` が通した値だけを組み込みの検査にかける)。検査をしたくない列は `min` / `max` を外してください(`step` は検査に使いません)。

### 修正

- number エディタの列でセルを選んで `-5` と打つと `5` が入っていた(打ち始めの `-` が消えていた。`.5` も同様)。`-` / `+` / `.` から打ち始めたときは、数値になるまで書けるよう文字の入力欄(`inputmode="decimal"`)で開き、確定した文字列を数値に直します(`-` だけなら空。数値として読めない文字列は貼り付けと同じくそのまま入り、検査があれば印 / reject)。`imeDirectInput` で「ー」「。」だけを確定したときも `-` / `.` の打ち始めとして編集を始めます(これまでは変換を捨てていた)。
- キーボードで操作した後やセルをクリックした後に、表全体を囲むブラウザ既定のフォーカスの枠(Chromium では表の上下の黒い線)が出ていた。フォーカスの位置はアクティブセルの枠で示し、キーボードで操作していてアクティブセルが無いとき(Tab で入った直後など)だけ表の内側にアクセント色(`--ssg-accent`)の枠を出します(マウス / タッチで触った後は出しません)。

## 0.55.0 — 2026-10-25

### 追加

- デザインシステムのテーマ `themes/astryx.css` / `themes/mantine.css` / `themes/heroui.css` / `themes/shadcn.css`。`style.css` の後に読み込むと、グリッドの配色が [Astryx](https://astryx.atmeta.com) / [Mantine](https://mantine.dev) / [HeroUI](https://heroui.com)(v3)/ [shadcn/ui](https://ui.shadcn.com) のテーマとライト / ダークに揃います。JS は増えません([ガイド](https://datasheet-grid.vercel.app/docs/guides/design-systems))。
- トークン `--ssg-invalid-contrast` / `--ssg-save-ok-contrast`(既定 `#ffffff`)。セル編集のエラーの吹き出しと保存の印の文字色です(これまでは白で固定)。

### 修正

- アンマウントした直後に、仮想化の遅れた通知で再描画しようとしないようにした(jsdom のテストで `window is not defined` になることがあった)

## 0.54.0 — 2026-10-25

### 追加

- `/lite` 入口。`createSpreadsheetGrid({ features })` で使う機能だけを組み込めます(20 の機能の部品と、よく使う機能一式の `standardFeatures`)。初期 JS は機能なしで約 60KB、`standardFeatures` で約 78KB です(全部入りは約 112KB。いずれも gzip)。

全部入り(`SpreadsheetGrid`)の公開 API と見た目・挙動は変わりません。

### core の破壊的変更

- `createVerticalLayoutResolver(features.autoHeight)` / `createRowPipelineResolver(features)` / `createColumnResolver(features)` は引数が必須(無いと TypeError)
- `createGridEngine` の `features` に filtering / serverSide / autoHeight / labelRow / grouping が無いと、その機能は無効(全機能は `fullCoreFeatures`)
- `GridEngine` から `filterPopoverCommands` / `resolveFilterPopoverDerived` を削除
- SSRM とラベル行を core で併用するときは `features.labelRow.wrapRowModelWithLabelRows` を自分で掛ける
- 追加: `GridCoreFeatures.labelRow` / `grouping`、型 `LabelRowFeature` / `GroupingFeature` / `AutoHeightFeature`

## 0.53.0 — 2026-10-24

### 修正

- `onFindChange` を内容(query / matchCount / currentIndex / open)が変わったときだけ呼ぶ。インラインの `rowKeyGetter` とハンドラ内の setState を組み合わせると、検索バーを開いている間ずっと呼ばれ続けていた(0.46.1 から)

### 内部

- 機能を差し込み式の部品へ分ける作業の段階 1〜2(0.54.0 の `/lite` の準備)。React 版の公開 API と見た目・挙動は変わりません。

### core の破壊的変更

- `createGridEngine` の `init.features` が必須(全機能は `fullCoreFeatures`)。サブパスの `createGridApi()` を引数なしで呼ぶと、機能のエクスポートが代役になる
- 追加: `GridCoreFeatures` / `fullCoreFeatures`

## 0.52.0 — 2026-10-24

### 変更

- 列フィルターのポップオーバーとツールパネルを別のチャンクへ分けて遅延読み込みに(初期 JS 約 119KB → 108KB gzip)。マウント後の空き時間に先読みし、先読みの前に開いたときはその場で読み込みます。

### 追加

- `preloadGridPopups()`: ポップオーバーの部品を先に読み込む

### 挙動の変化

- 利用側の jsdom テストで、ポップオーバーを開いた直後に同期で中身を確かめているものは、`preloadGridPopups()` を先に呼ぶか `findBy` で待つ必要があります。

## 0.51.0 — 2026-10-15

### 挙動の変化

- number 列の既定のパーサ(貼り付け / 確定 / SSRM の書き戻しで共通)が、全角の数字・符号・小数点(IME の「ー」「。」「、」を含む)と 3 桁区切りを数値として読む。空白だけの入力は null(従来は 0)
- `imeDirectInput` が number 列でも使える。確定した変換を半角の数値に直して編集を始め、数値にならない変換は捨てる

## 0.50.0 — 2026-10-12

### 挙動の変化

- flex 列の幅を整数 px で配分(各列の幅は比どおりとの差が 1px 未満)
- 相対日付のフィルター(今日 / 今月 / 過去 30 日など)を掛けたまま日付が変わっても、範囲が追従する

### 改善

- clientSide でソート中の 1 セル編集を差分で処理(100 万行で約 0.5 秒 → 0.1〜0.18 秒)
- 同じ値の更新では状態の通知をしない
- React 19.2 以降の開発モードで、100 万行のソートが極端に遅くなる問題を解消(約 80 秒 → 0.7 秒)

## 0.49.0 — 2026-10-12

### 追加

- 選択範囲の集計 `showSelectionAggregates`(既定 true。2 セル以上を選ぶと下部バーに平均 / データの個数 / 合計)
- 合計行 `totalRow`(列の `aggFunc` で集計し、表の下端に固定)
- フィルハンドル `fillHandle`(Excel のオートフィル)
- WAI-ARIA の grid パターンに沿った役割と状態
- CSV の数式エスケープ `escapeFormulas`(opt-in)

### 挙動の変化

- `canEditCell` の `rowIndex` をビュー行の index に統一し、第 5 引数 `ctx` を追加
- 選択範囲の集計は、数値と数値の文字列だけを数える
- `renderHeader` 内のボタンなどを押しても、列の範囲選択を始めない
- ドラッグ中にウィンドウのフォーカスが外れたら、ドラッグを取り消す
- ほか、2026-10-04 監査の残りの所見に対応([監査記録](./docs/audits/2026-10-04/README.md))

## 0.48.0 — 2026-10-10

### 挙動の変化

- `columnDragMotion="live"` で固定ペインをまたぐときも、掴んだ列が付いてくる(浮かぶ列 + 移動先の縦線 + ピン留めのアイコン)。離すと新しい位置へ滑り込み、Esc で元に戻る

## 0.47.1 — 2026-10-10

### 修正

- 行ドラッグ / 展開行 / 行グルーピングの列が中央ペインの先頭にあるとき、列ヘッダーの grip を押して離すだけで右隣の列と入れ替わり、ドロップ位置も 1 列ずれていた
- 掴んだ列の直前・直後で離したときは `onColumnsChange` を呼ばない
- 列 / 行のドラッグ中にツールチップを出さない

## 0.47.0 — 2026-10-10

### 追加

- 列ドラッグの live 方式 `columnDragMotion: 'ghost' | 'live'`(同じペイン内では周りの列がよける)と、列ドラッグの Esc キャンセル

### 修正

- `animateRows` で、ソート時に DOM ごと移動した行も滑らせる

## 0.46.1 — 2026-10-10

0.46.0 は欠番です(core 0.46.0 だけが古い中身で公開されたため、npm で deprecate しています)。

### 追加

- モーション: `motion`(`'auto' | 'on' | 'off'`。OS の「視差効果を減らす」で自動的に止まる)、アクティブセルの移動とポップオーバーの出現、SSRM の読み込みシマーと行のフェードイン、`animateRows`、`showCopyRange`(コピー範囲の動く点線)、`hoverHighlight`、`highlightChanges`、`showSaveStatus`、`rowDragMotion`
- セル内検索 `find`(Ctrl/Cmd+F)と `onFindChange`、ハンドルの `openFind` / `closeFind` / `findNext` / `findPrev`
- 条件付き書式 `GridColumn.conditionalFormat`(データバー / カラースケール / 状態チップ)
- ドキュメントサイトにテーマビルダー(/theme-builder)

### 挙動の変化

- 既定で動きが入る(`motion` の既定 `'auto'`、`showCopyRange` / `showSaveStatus` / `animateRows` の既定 true)

## 0.45.0 — 2026-10-06

### 挙動の変化(修正)

- 編集中にグリッドの外の入力欄をクリックして確定したとき、フォーカスをグリッドへ奪い返さない
- 編集中にグリッド内の別のセル・行・列ヘッダーを押して確定したとき、アクティブセルを編集していたセルへ戻さない

## 0.44.0 — 2026-10-06

### 追加

- セル操作の通知 `onCellClick` / `onCellDoubleClick` / `onActiveCellChange`(`params.preventDefault()` で編集の開始を止められる)
- セルのメモ `GridColumn.cellNote`(右上の三角とツールチップ)
- IME をオンにしたまま打ち始められる `imeDirectInput`(opt-in)

## 0.43.0 — 2026-10-04

### 挙動の変化

- 行グルーピング中の `'view'` エクスポートは、折りたたみに関係なく全 leaf 行を出力する。`isRowExportable` の `viewRowIndex` は全展開時のビュー行 index

## 0.42.0 — 2026-10-04

2026-10-04 の全体監査のうち、判断が要った所見への対応です([監査記録](./docs/audits/2026-10-04/README.md))。

### 追加

- `retryServerSideLoads()`: SSRM で失敗したブロックを明示的に再試行する(失敗したブロックはスクロールでは再要求しない)

### 挙動の変化

- 非表示の列の列フィルター / ソートも評価する
- 空の値は昇順・降順とも末尾に並べる
- `getState().columnWidths` は幅が決まった列だけを返し、`columns` の参照が変わっても消えない
- 端の列で Tab を押すとグリッドの外へ移動する
- 表示行数が減ったら、activeCell / selection を範囲内へ詰める
- TSV のコピー / 貼り付けを Excel と互換に
- ほか: ポップオーバーの外側をクリックしたあとのフォーカス復帰、確定時の編集可否の再評価、auto-height での `scrollToBottom()`

### core の破壊的変更

- `createInitialGridUiState()` は引数なし、`RowOrderInputs.visibleColumns` を `filterSortColumns` へ改名、`compareUnknownValues` の意味を変更

## 0.41.3 — 2026-10-04

- 0.41.2 と同じ中身です(版の番号だけを上げて公開し直しました)。

## 0.41.2 — 2026-10-04

### 修正

- 2026-10-04 監査で見つかった不具合のうち、挙動を大きく変えないものを修正(フィルターのポップオーバーと日付フィールドのボタンを Enter / Space でも押せる、列の全解除で残す列、`applyState` に壊れた列フィルターを渡したときの扱い、`numberFormatter` の性能、選択 API の範囲外の値など)

## 0.41.1 — 2026-10-03

### 追加

- 公開型の JSDoc を API リファレンスから生成して同梱(エディタの補完で説明が出る)
- `height` に % を指定すると、上下のバーを含むグリッド全体が親要素に収まる

## 0.41.0 — 2026-09-24

### 追加

- `manualFiltering` / `manualSorting`(UI と状態の通知はそのままで、行の絞り込み / 並べ替えはしない。サーバー側で処理するとき向け)
- `onFiltersChange` / `onSortChange`
- `getFilterOptions`: set / select の候補を非同期に渡せる(取得中 / 失敗と再試行 / 打ち切りの表示つき)

### 修正

- フィルターの入力欄で、IME の変換中の Enter を確定として扱わない

## 0.40.0 — 2026-09-23

### 追加

- ラベル行 `labelRow`(見出し / 区切り行。全幅の帯、見出しの区間の中でのソート、`sticky`、エクスポートの `includeLabelRows` / `rowKinds`)

## 0.39.0 — 2026-09-14

### 変更

- フレームワーク非依存のコア `@ishibashi0112/spreadsheet-grid-core` を初めて公開し、React 版はそれに依存する形に(自動でインストールされます)。公開 API は変わりません。

## 0.38.0 — 2026-09-14

- 内部構造の整理(本体を `engine/` へ分解)。挙動は変わりません。

## 0.37.0 — 2026-09-14

- 内部構造の整理(DOM を扱う処理をフレームワーク非依存のコントローラへ抽出)。挙動は変わりません。

## 0.36.0 — 2026-09-13

- 内部構造の整理(状態を React 非依存の外部 store へ載せ替え、コントローラを抽出)。挙動は変わりません。

## 0.35.0 — 2026-09-13

- 仮想化を `@tanstack/virtual-core` の直接利用に切り替え、公開型を React 非依存の層へ分離。挙動は変わりません。

## 0.34.0 — 2026-09-13

### 追加

- `className` 系のスロット(25 パーツ)が `{ className, style }` も受け付ける(StyleX の `stylex.props()` をそのまま渡せる)

## 0.33.0 — 2026-09-11

### 追加

- `isRowExportable`: コピー / CSV / `getExportData` の対象行を絞る
- 行ホバーを制御できる `hoveredRowIndex` / `onHoveredRowChange`

## 0.32.0 — 2026-09-04

### 追加

- 行ドラッグ並び替え `enableRowDrag` / `isRowDraggable` / `onRowMove` / `moveRow()`(clientSide のみ。ソート / フィルター中は無効)

## 0.31.0 — 2026-09-04

### 追加

- 展開行(Master/Detail)`detailRow`(clientSide / SSRM の両方)

## 0.30.0 — 2026-09-04

### 追加

- タッチ操作の基本対応(タップで選択、ダブルタップで編集、スワイプでスクロール)

### 修正

- タッチで列メニュー(⋮)がすぐ閉じる問題と、メニューの位置

## 0.29.1 — 2026-08-30

### 修正

- セルを押したときのフォーカスでページがスクロールしないように

## 0.29.0 — 2026-08-29

### 追加

- スクロール位置の取得 / 設定 / 通知(`onScroll` ほか)
- jsdom 用のレイアウトの代役を `/testing` で公開
- `getRowClassName` の第 3 引数 `ctx`、`CellStyleContext` の公開
- `rows` / `columns` / `filterOptions` に readonly 配列を渡せる
- 状態クラスを公開の約束事として文書化

## 0.28.1 — 2026-08-27

### 修正

- 日付フィールドの月・年ビューで、選択中のセルがホバーで見えなくなる問題と「← 戻る」の導線

## 0.28.0 — 2026-08-27

### 追加

- 日付フィルターの入力を内製の日付フィールドに(自由入力 + 年・月へ切り替えられるカレンダー)と、差し替え用の `renderFilterDateInput`

## 0.27.0 — 2026-08-26

### 追加

- `dateFilterPresets`(日付フィルターのプリセットを隠す / 独自に定義する)

### 変更

- フィルターのポップオーバーを詰めた密度に

### 修正

- フィルターのポップオーバーを画面内に収める

## 0.26.0 — 2026-07-28

### 追加

- `editorEnterMove`(Enter で確定したあとの移動先)

### 変更

- 確定後の移動先を再描画後の行数で決める(末尾に空行を足す使い方で、Enter が増えた行へ進む)

## 0.25.0 — 2026-07-25

### 追加

- `filterType: 'auto'`(列の値からフィルターの種類を自動で決める)

## 0.24.0 — 2026-07-25

### 追加

- 数値フィルターを演算子を選ぶ形に(!= / 空白 / 空白でない を追加)
- 複合フィルター `numberSet` / `textSet` / `dateSet`(条件と値の一覧の組み合わせ。日付は年月日のツリーと相対日付のプリセット付き)

## 0.23.0 — 2026-07-25

### 修正

- フィルターの確定などで、画面外のアクティブセルへスクロールが引き戻される

## 0.22.0 — 2026-07-23

### 追加

- `scrollHint` の `minRows`(行数がしきい値以上のときだけ有効にする)

## 0.21.0 — 2026-07-18

### 追加

- スクロール位置インジケーター `scrollHint`(行番号の吹き出し / ルーラー / ジャンプ先のプレビュー / カスタムスクロールバー)
- ドキュメントサイトを公開

### 修正

- SSR で `theme` の解決が throw する問題

## 0.20.1 — 2026-07-18

### 追加

- `enableClearOnDelete`(Delete / Backspace でのクリアを止められる)

## 0.20.0 — 2026-07-17

### 追加

- 行グルーピングと集計 `rowGroup` / `aggFunc`(自動のグループ列、開閉の操作、命令的 API。clientSide のみ)

## 0.19.0 — 2026-07-17

### 修正

- 非セキュアコンテキスト(http)で、Ctrl+C のコピーが何も言わずに失敗する

## 0.18.0 — 2026-07-16

### 追加

- SSRM のセル編集の書き戻し `dataSource.updateRows`(楽観更新、失敗時のロールバック、保存失敗のバー、`onServerSideWriteError`)

## 0.17.0 — 2026-07-16

### 追加

- `showValidationMarks`(バリデーションの印を出すかどうかを宣言的に切り替える)
- セルのコンテキストに `sourceRowIndex` / `rowKey`

## 0.16.0 — 2026-07-15

### 追加

- `refreshServerSide()`、`getRows` の失敗時のエラーバーと再試行

## 0.15.0 — 2026-07-15

### 追加

- エディタの種類 `column.editor`(number / select / date / checkbox / custom)
- セル編集のバリデーション `column.validate`(印を付ける `mark` が既定、`reject` も選べる)

## 0.14.0 — 2026-07-13

### 追加

- undo / redo(Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y とハンドルの `undo()` / `redo()`)
- Delete / Backspace で選択範囲をクリア

### 修正

- IME の変換中の Enter / Escape / Tab でセルを確定・取り消ししない

## 0.13.0 — 2026-07-11

### 追加

- `showCellOverflowTooltip`(省略されたセルの全文をツールチップで出す)と、列ごとの `wordBreak` / `lineBreak`

## 0.12.0 — 2026-07-11

### 追加

- `autoSizeColumns`(データを入れたときに列幅を内容に合わせる)

## 0.11.0 — 2026-07-07

### 変更

- パネルを 1 つに統合(位置を覚える)、列の表示切替の全選択をトグルに、列のリセットで並び順も戻す

## 0.10.0 — 2026-07-06

### 追加

- `theme`(light / dark / auto)とダークのプリセット
- 見た目を揃えたツールチップ(`data-ssg-tooltip` で自分の要素にも使える)
- フィルター管理パネルと `showFilterChipBar`
- 密度のプリセットと `dimReadOnlyCells`
- `style.layer.css`(カスケードレイヤー版)

### 変更

- 基本の CSS をレイヤーなしにして、Tailwind の Preflight などのリセットに負けないように

## 0.9.0 — 2026-07-04

### 追加

- エクスポートの範囲 `'view'` / `'raw'` / `'rendered'`(`'all'` / `'visible'` は非推奨の別名)

## 0.8.0 — 2026-07-02

### 追加

- コンテキストメニュー、行選択、列の並べ替えのアニメーション

### 改善

- グローバルフィルターの使い勝手

## 0.7.0 — 2026-06-28

### 追加

- CSV の出力と、Excel へ出すための補助

## 0.6.0 — 2026-06-28

### 追加

- ref の命令的 API、`getState()` / `applyState()`

## 0.5.0 — 2026-06-28

### 追加

- 列幅の自動調整

## 0.4.0 — 2026-06-27

### 追加

- 列の flex、`valueFormatter` と `numberFormatter`、列のリサイズの props での制御

## 0.3.0 — 2026-06-26

### 追加

- 高さを決める props

## 0.2.0 — 2026-06-26

- タグを付けた最初の版(仮想化、固定列、ソート / フィルター、セル編集、クリップボード、SSRM の読み取り)