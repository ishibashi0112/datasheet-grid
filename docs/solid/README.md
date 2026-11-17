# Solid 版の作業記録

2026-11-17 に Solid 2.0 の正式版(solid-js / @solidjs/web 2.0.0)が出たのを受けて、core の上に Solid のシェルを載せた
`@ishibashi0112/spreadsheet-grid-solid` を作る。2026-11-17 にユーザーが「Solid 版を作る」を選んだ(試作の報告と見積もりは
Claude Doc「Solid 2.0 版の試作の報告」)。試作の中身と分かったことは `packages/solid/README.md`。

この表は進み具合の記録も兼ねる。コミットごとに「状況」を更新して push する(週の使用量の上限などで途中で止まっても、
別のセッションがこの表とコミットから再開できるように)。

## 段取り

| 段階 | 中身 | PR | 公開 |
| --- | --- | --- | --- |
| 0 | core へ寄せる整理(React 版の公開 API と見た目は不変)+ 試作の `packages/solid`(非公開) | 1 | React 版は patch / minor に混ぜる |
| 1 | Solid 版の本体(React の `/lite` の機能なしと同じ範囲: エディタ 6 種・列幅・ツールチップ・行の選択・展開行・ラベル行・SSRM の読み取り と書き戻し・ARIA) | 3〜4 | — |
| 2 | 20 の機能(`/lite` の部品と同じ名前で) | 3〜4 | — |
| 3 | ハーネス(3 ブラウザ)・`types:check`・`size:check`・ドキュメント・サンプル | 2 | `@ishibashi0112/spreadsheet-grid-solid` 0.x |

## 段階 0 の中身

| # | 内容 | 状況 |
| --- | --- | --- |
| 0-1 | キー操作 / コピー・貼り付け / ポインタのコントローラが、イベントの時点の状態を store から読む(`getUiState`。Solid は書き込みをマイクロタスクでまとめるので、同じタスクの中で続けたイベントが古い状態を読んでいた) | 済み(コントローラ 3 つ + React 版 + 試作。`keyboardController.test.ts` と試作の `timing.test.tsx` で確認) |
| 0-2 | シェルの「セルの操作」を core のコマンド群へ(編集を始めてよいかの判断・ダブルクリック・チェックボックスの切り替え・選択したセルの削除・全選択) | 済み(core `engine/cellCommands`。renderCell の `setValue` の書き込みも。React 版はシェルの useCallback 5 つを置き換え) |
| 0-3 | オーバーレイの位置(アクティブセル / 編集中のセル / 選択範囲のペインごとの矩形)と `aria-activedescendant` の判断を core の関数へ | 済み(core `logic/cellPlacement`。クロスヘアの列の帯も) |
| 0-4 | エディタのキーの割り当て(Enter / Tab / Esc / 複数行の Enter / スクロールのキー)と密度の既定の高さを core へ | 済み(core `logic/editorKeys` / `logic/density`。React 版の `editors/editorKeyBindings.ts` は合成イベントを詰め替えるだけ) |
| 0-5 | 試作(`packages/solid`)を 0-1〜0-4 の core の関数へ差し替え | 済み(試作のシェル 903 → 828 行、エディタ 101 → 76 行。React 版の GridShell.tsx は 5,721 → 5,420 行) |
| 0-6 | 全ゲート + ハーネス(Chromium / Firefox / WebKit)+ 別視点のレビュー → PR | 作業中 |