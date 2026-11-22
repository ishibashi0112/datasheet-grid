# 変更履歴(Solid 版)

`@ishibashi0112/spreadsheet-grid-solid`(Solid 2.0 向けの Solid 版)の変更履歴です。Solid 版の版は React 版・core とは別で、core には同じ 1 つの版で依存します(どの版の core かは各版の見出しの下に書きます)。React 版と core の変更履歴はリポジトリの [CHANGELOG.md](../../CHANGELOG.md) にあります。

1.0 より前は minor でも壊す変更が入ることがあります。そのときは「挙動の変化」「削除」に書きます。

使い方は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) と、React 版の [API リファレンス](https://github.com/ishibashi0112/datasheet-grid/blob/main/packages/react/API_REFERENCE.md)(props とメソッドは同じ)を参照してください。

## 未リリース

### 修正

- 自作の上部 / 下部バー(`renderTopBar` / `renderBottomBar`)の関数の本体で文脈を読んだ値(React 版の書き方の引数の分割代入 `({ derivedSummary }) => …` も)が、最初の値のまま変わらなかった。今は読んだ値が変わったときに関数を呼び直します(`renderCell` と同じ)。変わらない値(`setGlobalFilterText` など)だけを本体で読み、変わる値を JSX の中で読むときは、これまでどおりバーを作り直しません(入力欄のフォーカスと打ちかけの文字が残る)。
- 行のグループ化をした表で、編集中に上へ行が足されて編集中の位置が一瞬グループ行を指すと、エディタが作り直され、number / date のエディタは打ちかけの文字を失い、複数行の text のエディタはフォーカスを失っていた。エディタの種類を React 版と同じく行ではなく列から決めます(custom のエディタは React 版と同じく作り直します)。
- 列メニューの「列の固定」の小メニューを開いたまま別の列のメニューへ切り替え、元の列へ戻ると、小メニューが開いたまま出ていた。別の列へ切り替えたら閉じます(React 版と同じ)。

## 0.1.0 — 2026-11-22

最初の公開です。core 1.2.1 に依存します。

### 追加

- `SpreadsheetGrid`(全部入り)と `createSpreadsheetGrid`(機能を選んで組み込む。機能の部品とプリセット `standardFeatures` も同じ入口)。props・列の定義・命令的なハンドル・通知・CSS のクラスとトークン・見た目は React 版 1.2.1 と同じです。
- 入口 `/locales/en`(`localeTextEn`)と `/testing`(`installJsdomLayoutStubs` ほか)、CSS の `style.css` / `style.layer.css` / `themes/*.css`(React 版と同じファイル)。
- `solid` の export 条件で JSX のままのソース(利用側のバンドラが自分の Solid の設定でコンパイル)、それ以外は DOM 向けにコンパイル済みのビルド(ESM だけ)。

React 版との違い(`ref` の受け取り方、描く関数を呼び直す時、ことばで絞り込み `/ai` が無いこと)と Solid で気をつけること(`rows` は store ではなく signal で持つ ほか)は [Solid で使う](https://datasheet-grid.vercel.app/docs/solid) にあります。