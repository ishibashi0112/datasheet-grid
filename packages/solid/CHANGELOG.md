# 変更履歴(Solid 版)

`@ishibashi0112/spreadsheet-grid-solid`(Solid 2.0 向けの Solid 版)の変更履歴です。Solid 版の版は React 版・core とは別で、core には同じ 1 つの版で依存します(どの版の core かは各版の見出しの下に書きます)。React 版と core の変更履歴はリポジトリの [CHANGELOG.md](../../CHANGELOG.md) にあります。

1.0 より前は minor でも壊す変更が入ることがあります。そのときは「挙動の変化」「削除」に書きます。

使い方は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) と、React 版の [API リファレンス](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md)(props とメソッドは同じ)を参照してください。

## 未リリース

### 修正

- Shadow DOM(Web Components)の中のグリッドで、効かない操作がありました。ツールチップが出ない、`imeDirectInput` で変換を確定しても編集が始まらず打った文字が消える、列メニューと右クリックメニューの ↓ がいつも先頭へ・↑ がいつも末尾へ移る、ツールパネルを開いてもフォーカスが移らない(Escape で閉じるとフォーカスが外れる)、ポップアップが `document.body` の直下に出て見た目が付かない(Shadow root の中の CSS が届かない)、の 5 つです。Shadow root の中のイベントと、フォーカスのある要素を読めるように直し、`popupContainer` の既定(`'auto'`)は、グリッドを囲むダイアログが無ければ、Shadow root の直下でグリッドを包む要素の中に描くようにしました。使い方(CSS を Shadow root に入れる・グリッドを要素で包む・open の Shadow root を使う)と、ページの文字の大きさを受け継ぐこと、親のページから iframe の document へ描く形には対応しないことを、React 版の API リファレンスの「Shadow DOM の中のグリッド」に書きました。

## 0.1.1 — 2026-11-22

core 1.2.1 に依存します(0.1.0 と同じ)。Solid 版の品質を React 版にそろえる作業の段 1(React 版と同じ物差しでの測り直し)で見つけた Solid 版だけの不具合の修正です。

### 挙動の変化

- グリッドが描く途中で呼ぶ通知(React 版が描いた後の effect で呼ぶもの: `onActiveCellChange` / `onStateChange` / `onFiltersChange` / `onSortChange` / `onExpandedDetailRowKeysChange` ほか)は、その変化を画面に反映し終えた直後(次のマイクロタスク)に呼びます(下の「通知の中で action を始めると表が止まる」の修正のため)。テストでは、`flush()` の後に `await Promise.resolve()` などで 1 回待ってから通知を確かめてください。グリッドを外した後には呼びません。押した・打ったときにその場で呼ぶ通知(`onRowsChange` / `onCellClick` など)は、これまでどおり同じ処理の中で呼びます。
- サーバーで描く(SSR)ときは、行・件数(上下のバーの「行 2 / 4」)・合計を描かず、ハイドレーションの後に描きます(下の「SSR でタイムゾーンが違うと固定列に別の行が残る」の修正のため)。サーバーの HTML には骨組み(見出し・上下のバーの絞り込み / 並び替えの表示)が出ます。サーバーで描かない使い方は変わりません。

### 追加

- 開発時の警告: グリッドを描く前(`<Loading>` の中で最初の行を待っている間など)に、状態を変えるハンドルのメソッド(`applyState` / `selectCell` / `scrollToBottom` など)を呼ぶと、何もしないことを 1 回知らせます(描く前は列も行もまだ知らないので効きません)。最初の状態は `initialState` で渡すか、行を読む effect から呼んでください。

### 修正

- 通知の中で `action` を始めると(`onRowsChange` から `action` + `createOptimistic` で保存する、ふつうの signal に rows を書いてから `action` で保存する など)、その action が終わるまでグリッドの表示が止まっていた。保存の間もエディタが閉じず、続けて打った文字は捨てられ、保存中に別の行を編集すると前の行のエディタへ入って 1 回目の編集を上書きしていた。グリッドの書き込みを利用者の action の取引に入れないようにしました(React 版の `startTransition` と同じく、保存の間もエディタは閉じ、続けた操作はその場で効きます)。右クリックメニューの項目の `onSelect` で `action` を始めたとき(画面の移動など)も、メニューはすぐ閉じます。
- 行を非同期の `createMemo` / `createSignal(async)` で持つと、取り直しの間グリッドが止まっていた(スクロールしても行が描かれない、矢印キーが効かない、列メニューが開かない。届いた後にまとめて効いた)。取り直しの間も前の行のまま操作できます(React 版の `use` + transition と同じ)。最初の行を `<Loading>` の中で待つ形はこれまでどおりです。
- サーバーで描いた HTML をハイドレーションするとき、サーバーとブラウザでタイムゾーンや今日が違うと(日付の範囲や「今日」の条件を `initialState` で入れた、Date の値の列を固定した など)、固定列のセルにサーバーで絞り込んだ別の行の文字が残り、そのセルを編集すると別の行が書き換わっていた。件数と行数もサーバーのまま残っていた。行はハイドレーションの後にブラウザで描きます(React 版は食い違いをクライアントで描き直して直します)。
- 保存中(`action` + `createOptimistic`)に `fillHandle` のある表で次のセルを打ち始めると、例外(`<Show>` の古い値の読み取り)で表(境界が無ければアプリ全体)が止まっていた(Solid 2.0.3 で起きる)。上の「通知の中で `action` を始めると表が止まる」と同じ原因で、同じ修正で直りました。
- 行を非同期の `createMemo` で持ち、行を出した後の取り直しが失敗すると、同じエラーが console に 12〜13 回出ていた。今は利用側の `<Errored>` が受けるだけで、console には出ません(行を JSX で読んだときと同じ)。
- 変化のたびに作り直す props のオブジェクトを spread で渡すと(`{...gridProps()}`)、開発時に Solid が `STRICT_READ_UNTRACKED` を出していた。
- 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)の関数の本体で文脈を読んだ値(React 版の書き方の引数の分割代入 `({ derivedSummary }) => …` も)が、最初の値のまま変わらなかった。今は読んだ値が変わったときに関数を呼び直します(`renderCell` と同じ)。変わらない値(`setGlobalFilterText` など)だけを本体で読み、変わる値を JSX の中で読むときは、これまでどおりバーを作り直しません(入力欄のフォーカスと打ちかけの文字が残る)。
- 行のグループ化をした表で、編集中に上へ行が足されて編集中の位置が一瞬グループ行を指すと、エディタが作り直され、number / date のエディタは打ちかけの文字を失い、複数行の text のエディタはフォーカスを失っていた。エディタの種類を React 版と同じく行ではなく列から決めます(custom のエディタは React 版と同じく作り直します)。
- 列メニューの「列の固定」の小メニューを開いたまま別の列のメニューへ切り替え、元の列へ戻ると、小メニューが開いたまま出ていた。別の列へ切り替えたら閉じます(React 版と同じ)。
- checkbox の列のセルをダブルクリックしても `onCellDoubleClick` が呼ばれなかった(1 回目のクリックで値を反転したときにセルの中身を作り直し、2 回目のクリックが外れた要素に届いていた)。反転してもセルの中身はそのまま使い、印だけを変えます(React 版と同じ)。
- サーバーで描いた HTML をハイドレーションすると、`theme="auto"` と `motion` の既定の `'auto'` が OS の設定(ダーク / 視差効果を減らす)に合わず、サーバーで描いたライト・動きありのまま残っていた。ハイドレーションの間はサーバーと同じ値で描き、その後に OS の設定へ合わせます(React 版と同じ)。

## 0.1.0 — 2026-11-22

最初の公開です。core 1.2.1 に依存します。

### 追加

- `SpreadsheetGrid`(全部入り)と `createSpreadsheetGrid`(機能を選んで組み込む。機能の部品とプリセット `standardFeatures` も同じ入口)。props・列の定義・命令的なハンドル・通知・CSS のクラスとトークン・見た目は React 版 1.2.1 と同じです。
- 入口 `/locales/en`(`localeTextEn`)と `/testing`(`installJsdomLayoutStubs` ほか)、CSS の `style.css` / `style.layer.css` / `themes/*.css`(React 版と同じファイル)。
- `solid` の export 条件で JSX のままのソース(利用側のバンドラが自分の Solid の設定でコンパイル)、それ以外は DOM 向けにコンパイル済みのビルド(ESM だけ)。

React 版との違い(`ref` の受け取り方、描く関数を呼び直す時、ことばで絞り込み `/ai` が無いこと)と Solid で気をつけること(`rows` は store ではなく signal で持つ ほか)は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) にあります。