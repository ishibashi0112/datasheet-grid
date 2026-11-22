# Solid 版の測り直し(段階 4 の 1-6)の実アプリ点検 — 共通の手順

以下 `$D` = `/tmp/claude-0/-home-user/3e0b10c7-25c1-5991-99b0-b5ddd5fe5ce3/scratchpad/dogfood-q`(新しいコンテナでは自分のスクラッチに読み替える)。

## 目的

公開済みの Solid 版 `@ishibashi0112/spreadsheet-grid-solid@0.1.0` に、その後の修正(段階 4 の測り直しのもの。`$D/docs/CHANGELOG.md` の「未リリース」)を入れた候補(pack した tarball)を、**実際の利用者として**使って現実的なアプリを作り、実ブラウザで操作して、不具合・ドキュメントとの食い違い・使いにくさ・型の問題を見つける。Solid 版は React 版(`@ishibashi0112/spreadsheet-grid`、npm の 1.2.1)と同じ core の上に作った移植で、props・列の定義・ハンドル・CSS は React 版と同じ(違いは Solid 版の README の「Differences from the React version」)。**修正はしない**(見つけて、確かめて、報告するだけ)。

2 つの組がある:

- **作り直し(S1〜S6)**: 2026-11-22 の 0.1.0 の前の点検で作った 6 本のアプリ(ソースは `$D/prev/<ID>/`、そのときの所見は `$D/prev/findings-*.md`)を、今の候補で作り直す。前の所見のうち「直した」ものが直っているか、「React 版も同じ」「記録だけ」のものが今どうか、前に通った操作が今も通るか(回帰)を確かめ、新しい所見を探す。
- **新しいアプリ(S7〜S12)**: 前の点検で試していない使い方で新しく作る。

## 入れ方

- Solid 版: `npm install $D/pack/ishibashi0112-spreadsheet-grid-solid-0.1.0.tgz`(中身は今の候補。依存の core `@ishibashi0112/spreadsheet-grid-core@1.2.1` は npm の公開版から入る)。peer は `solid-js` / `@solidjs/web` の `^2.0.0`(npm の latest は 2.0.3)。
- Vite は 8 と `@solidjs/vite-plugin` 3(README のとおり)。
- 2026-11-22 時点で SolidStart の公開版は solid-js 1 系向け。SSR は Vite 8 の SSR(`@solidjs/vite-plugin` の `ssr: true` + `@solidjs/web` の `renderToString` / `renderToStream` と `hydrate`)で手で組む。ルーターは `@solidjs/router` の 2.0 系。UI の部品ライブラリは Solid 2.0 に対応していないものが多いので、対応していなければ Tailwind と自前の部品で作る(ライブラリが入らないこと自体は所見にしない)。
- 利用側のテストは `@solidjs/testing-library` の `1.0.0-rc.2`。
- 比べるときの React 版: `npm install @ishibashi0112/spreadsheet-grid@1.2.1`(React 19)。

## ルール

1. 作業場所は `$D/<アプリID>/` だけ。ほかの場所に書かない。あなたはサブエージェント。さらにエージェントを起動しない。
2. **リポジトリ `/home/user/datasheet-grid` は読まない・使わない**(packages / audit / docs / examples すべて)。使ってよいのは利用者が見られるものだけ:
   - `node_modules/@ishibashi0112/spreadsheet-grid-solid/README.md`(= `$D/docs/SOLID_README.md`)、core の README
   - Solid 版の README が案内している React 版の `API_REFERENCE.md`(`$D/docs/API_REFERENCE.md`)、ドキュメントサイトの写し `$D/docs/website-docs/`(MDX。Solid のページは `solid.mdx`、ほかは React 版向け。サイトはコンテナから開けない)、Solid 版の変更履歴 `$D/docs/CHANGELOG.md`、GitHub のサンプル `$D/docs/examples/solid`(と React 版の `basic`)
   - 作り直しの組は、前のアプリのソースと所見 `$D/prev/` も読んでよい
   - `dist/` の中身は、不具合を体験した後に原因を切り分けるときだけ読んでよい(利用者もできるので)
3. 現実のアプリらしく作る: 題材に合うデータ(生成でよい)を使い、Solid 2.0 の普通の書き方で書く(signal / store / `createMemo` / `<For>` / `<Show>` / 非同期の `createMemo` と `<Loading>` など)。まずドキュメントを読んでそのとおりに書く。
4. 実ブラウザで確かめる: Playwright の Chromium(`require('playwright')` はどこからでも使え、`chromium.launch()` は引数不要。`playwright install` はしない)。スクリプトはアプリのディレクトリに置く。
   - 実際の入力で操作する(`page.mouse` / `page.keyboard` / `page.touchscreen`)。Shift+クリックは `page.keyboard.down('Shift')` で押さえてからクリックする。クリップボードは `context.grantPermissions(['clipboard-read','clipboard-write'])`。
   - `page.on('console')` と `page.on('pageerror')` を必ず集め、出た警告・エラーを記録する(Solid 2.0 の開発時の診断も。既知のものは Solid 版の README の表にある)。
   - dev と本番ビルド(`vite build` + `vite preview`。SSR は自分のサーバーの本番の形)の両方で、少なくとも主要な操作を一度は確かめる。
   - スクリーンショットは `deviceScaleFactor: 1` で撮り、Read で開いて自分の目で見た目を確かめる(ずれ・はみ出し・重なり・色)。
5. **React 版と比べる**: 不具合らしいものを見つけたら、React 版 1.2.1 で同じ構成・同じ操作の最小のアプリを作って確かめ、所見に「Solid だけ」/「React 版も同じ」を書く。見た目や動きが React 版と違って見えるところも、React 版と並べて確かめる。
6. ポートは指定のものだけ。終わったら自分が起動したサーバーとブラウザを PID で止める(`pkill -f` は使わない。ほかのエージェントも同じマシンで動いている)。長く動くサーバーは Bash の `run_in_background` で起動する。
7. 不具合と書く前に: ドキュメントでその使い方が正しいか確かめ、**最小の構成で再現し直す**(できれば 1 ファイルの最小アプリ)。自分のアプリの誤りなら所見にしない(ドキュメントが誤解を招いたならドキュメントの所見)。再現が安定しないもの・一度だけのものは「未確定」。
8. ライブラリの dist を書き換えない。回避策が見つかれば書く。
9. マシンは 4 CPU を 3 人で分け合っている。時間の数値は参考値。重さの所見は本番ビルドで 2 回以上測り、React 版の同じアプリと比べてから書く。

## 報告(最後のメッセージの本文として返す。ファイルには書かない)

日本語で、アプリごとに次の順に:

1. **作ったもの**: 構成(ツール・版)、使った機能、画面の概要。
2. **確かめた操作**: 実際に試した操作の一覧(**問題が無かった範囲も**書く)。
3. **前の所見の今**(作り直しの組だけ): 前の所見 ID ごとに「直っている / まだある / 変わった」と確かめ方を 1 行で。
4. **所見**: ID は `<アプリID>-NN`(作り直しの組は前の点検と重ならないよう `S1-21` のように 21 から)。各所見に:
   - 重要度: **高** = データが壊れる・失われる / 間違った値が保存・出力される / 例外で落ちる / よくある構成で機能が使えない(回避策なし)。**中** = 現実的な場面で明らかに誤った挙動(回避策あり)/ ドキュメントどおりに書くと動かない。**低** = 見た目・まれな条件・ドキュメントの不足・小さな使いにくさ。
   - 種類: 不具合 / ドキュメント / 使いにくさ / 型
   - **Solid だけ / React 版も同じ / React 版では確かめていない**
   - 回帰か(前の点検では起きなかった)
   - 題名、再現手順(最小)、期待 / 実際、証拠(コンソールの文言・計測値・スクショのパス・最小再現のファイルのパス)、dev / 本番のどちらで、確度(確実 / 未確定)
5. **Solid の利用者として**: ドキュメントで困った所、Solid のページに書いてほしいこと(短く)。
6. **要望**(あれば短く)。

---

# 作り直しの組(S1〜S6)

前のアプリ(`$D/prev/<ID>/`)を `$D/<ID>/` へ写し、依存を今の tarball に替えて入れ直し、前の確かめの台本(e2e などのスクリプト)を回す。前の点検の BRIEF(`$D/prev/BRIEF.md`)の「必ず試すこと」をもう一度ひととおり試し、加えて下の「今回足すこと」を試す。前の点検で使ったポートをそのまま使う(S1 = 5501 … S6 = 5506、S2 は 3501 も)。

- S1(在庫・発注表): 今回足すこと = 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)で文脈の値を関数の本体で読む書き方と JSX の中で読む書き方の両方(README の新しい説明どおりに追従するか、入力欄のフォーカスが残るか)。**HMR**: dev サーバーを動かしたまま、グリッドを使う部品のファイルと列の定義のファイルを書き換え、画面が更新されること・コンソールのエラー・二重のリスナー(グリッドが 2 つ動いていないか)・編集中や列フィルターを開いたままの HMR。
- S2(SSR の管理画面): 今回足すこと = `theme="auto"` / `motion` の既定でのハイドレーション(OS のダーク / 視差効果を減らすを `emulateMedia` で)、相対日付のプリセット(今日)を URL の状態から入れたまま SSR し、サーバーの `TZ` を変えて(例 `TZ=Pacific/Kiritimati`)ブラウザと日付がずれるとき。README の SSR の説明(`createRequestEvent` / `provideRequestEvent` の import 元)どおりに書けるか。
- S3(商品マスタ・機能を選んで組み込む): 今回足すこと = 列メニューの「列の固定」の小メニューを開いたまま別の列のメニューへ移って戻る、行のグループ化をした表で編集中に上へ行を足す(number / date / 複数行のエディタの打ちかけ)。
- S4(テストと型): 今回足すこと = 利用側のテストで `<Loading>` の中の非同期の行、`action` と `createOptimistic` で保存する形、`<Show>` で出し入れしたときの ref。
- S5(ログ 100 万行と株価): 今回足すこと = `<Loading>` と非同期の行で取り直す形(取り直しの間に前の行を出し続けるか)。
- S6(モバイル・読み上げ・ダイアログ): 今回足すこと = 1 ページに 2 つのグリッド(キー操作・ポップアップ・テーマが押した方だけに効くか)。

# 新しいアプリの組(S7〜S12)

各アプリは「必ず試すこと」を中心に、題材の利用者が実際にやりそうな操作を自分で考えて足すこと。機能を単独で試すより、**組み合わせ**と**普段の作業の流れ**と、**Solid らしい書き方**を重視する。

## S7. タスク管理(Solid 2.0 の非同期と遷移)(ポート 5507)

- 構成: Vite 8 + Solid 2.0 + `@solidjs/router` 2 + TypeScript、npm。日本語。プロジェクトごとのタスク一覧(担当 / 期限 date / 優先度 select / 見積 number / 状態 / メモ)。データは自分で書いた擬似 API(Vite のミドルウェアか、ブラウザ内の遅延付きの関数。200〜1,500ms、ときどき失敗)。
- 必ず試すこと: 行を非同期の `createMemo` で読み `<Loading>` / `<Errored>` で包む、プロジェクトを切り替えたとき(取り直しの間の表示・`isPending`・`<Loading on>`)、編集を `action` + `createOptimistic` で保存(成功・失敗で元に戻る)、ルートの切り替えでグリッドが外れて付くとき(編集中・保存中・ポップアップを開いたまま)、タブ(`<Show>` / `<Switch>`)で 2 つのグリッドを切り替える、フィルターとソートを URL と同期(戻る / 進む)。

## S8. 予約表(日付と SSR)(ポート 3508 と 5508)

- 構成: Vite 8 の SSR(`renderToStream` + `hydrate`)+ Solid 2.0 + `@solidjs/router` 2、Node のサーバーは自分で書く。日本語。会議室の予約(日付 / 開始・終了の時刻 / 部屋 select / 予約者 / 人数 number / 用途)。
- 必ず試すこと: 日付の列フィルターの相対の期間(今日 / 今月 / 過去 30 日)と日付の範囲を URL から `initialState` で入れて SSR、サーバーの `TZ` とブラウザのタイムゾーン(Playwright の `timezoneId`)を変えて日付がずれるとき、深夜 0 時をまたぐ(`page.clock`)、date エディタの入力(全角・「2026/11/1」)、`renderToStream` と `renderToString` の両方、ハイドレーションの警告、本番の形。

## S9. 経費精算(日本語の入力と検査)(ポート 5509)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。日本語。明細(日付 / 科目 select / 金額 number・全角で打つ / 税区分 / 摘要 複数行 / 領収書あり checkbox)と合計行。グリッドの上に申請者のフォーム、申請の確認は `<dialog>`。
- 必ず試すこと: IME(CDP の `Input.imeSetComposition` → `Input.insertText`)で日本語の摘要と全角の金額を打つ、`imeDirectInput`、検査(mark / reject、`validate` と `min` / `max` / `integer`)、Excel からの貼り付け(全角の数字・「¥1,200」・空のセル・行が足りないとき)、フィルハンドル、元に戻す、custom エディタ(科目の検索つき候補をポータルで)、フォームと `<dialog>` の中のグリッドのフォーカス、印刷用の CSV(`escapeFormulas`)。

## S10. 受注と明細(2 つのグリッドの連動)(ポート 5510)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。英語(`localeTextEn`)。上に受注の一覧のグリッド、下にその受注の明細のグリッド(上のアクティブな行で signal が変わり、下の rows が替わる)。
- 必ず試すこと: 上のグリッドでキー操作で行を動かしたときの下の入れ替わり(速さ・ちらつき・下の選択と元に戻すの履歴の扱い)、2 つのグリッドの間のフォーカスの移動(Tab / クリック / ハンドルの `focus()`)、下で編集すると上の合計が変わる、2 つのハンドルを同じ部品で持つ、列の幅と並びを 2 つのグリッドで `getState` / `applyState` で揃える、両方のエクスポート、一方だけダークのテーマ。

## S11. 埋め込みウィジェット(Shadow DOM と iframe)(ポート 5511)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。グリッドを使う部品をカスタム要素(`customElements.define` + `attachShadow` + Shadow root の中へ `render`)として作り、普通のページに置く。同じ部品を `<iframe>` の中にも置く。グリッドの CSS を Shadow root の中へ読ませる方法をドキュメントから探す(無ければドキュメントの所見)。
- 必ず試すこと: Shadow root の中でのクリック・キー操作・編集・コピー / 貼り付け、ポップアップ(列メニュー・列フィルター・右クリックメニュー・ツールチップ・select の候補・ツールパネル)がどこに出て見た目が正しいか・押せるか・外側を押したら閉じるか・Escape、ページの CSS(大きな `font-size` や `* { box-sizing }` の違い)が影響しないか、iframe の中での同じ操作、テーマ。

## S12. 列の多い表と細かい反応性(ポート 5512)

- 構成: Vite 8 + Solid 2.0 + TypeScript、npm。日本語。200 列 × 20,000 行の計画表(月ごとの数値の列)。共同編集の模擬: ほかの人のカーソル(行と列)を signal で持ち、`renderCell` の中でその signal を読んで印を出す。列は利用者が足す / 消す / 並べ替える / 固定する(`onColumnsChange`、ツールパネル)。
- 必ず試すこと: `renderCell` の中で外の signal を読んだときに、その signal が変わったセルだけが描き直されるか(ほかのセルの DOM が作り直されないか。要素の同一性で確かめる)、毎秒 20 回ほかの人のカーソルを動かしながらの編集・スクロール・コピー、列の追加 / 削除 / 並べ替えの後の選択とフォーカス、横の仮想化での遠くへのスクロール、本番ビルドでの速さとメモリ(**React 版の同じ画面と比べる**)、5 分動かしてのメモリ。