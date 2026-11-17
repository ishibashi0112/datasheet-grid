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
| 0-6 | 全ゲート + ハーネス(Chromium / Firefox / WebKit)+ 別視点のレビュー → PR | 済み(下の「段階 0 の確かめ」)。PR を見てもらう |

## 段階 0 の確かめ

- ゲート(見直しの修正 6a2fdd0 の後): `tsc -b` / `tsc -p tsconfig.vitest.json` 0・eslint 0 problems・`vp test` 277 files / 2,788 tests・`build:lib`・`types:check` 11 通り・`examples:check` 3 つ。試作は `pnpm --filter ./packages/solid test`(8 件)/ `typecheck` / `spike:build`(ルートの vitest と CI には入れていない)。
- サイズ: full 149.79 / lite 87.12 / standard 110.40 / ai 14.03KB(上限 150.1 / 87.5 / 110.8 / 14.6。core の関数に分けたぶん約 0.2KB 増え、full の残りは 0.31KB)。
- ハーネス(6a2fdd0 の後、新しく起動した開発サーバーで全部): Chromium 941 / 941・Firefox 865 / 865・WebKit 861 / 864(FAIL は既知の BR-3 = t-priority の 1 件と BR-4 = t-fill の 2 件だけ。1.2.0 と同じ数)。
- 別視点のレビュー(このブランチの差分を、結論を渡さずに読んでもらった)で、このブランチの変更による回帰が 2 件(公開版には無い):
  - 高-1: div などの custom エディタが keydown の中で `ctx.commit` / `ctx.cancel` を呼ぶと、同じ keydown が描き直す前のシェルまで上がってきて、store の今の値だけで「編集中か」を見ていたため Enter で同じセルの編集が開き直り、Escape で選択まで消えた。→ core `controllers/liveUiState` の `isEditingAtEvent`(描いた時点か今のどちらかで編集中なら扱わない)を keyboard / clipboard で使う。
  - 中-1: `renderCell` の `ctx.setValue` を並びが変わった後に呼ぶと、描いた時点の行の位置を今の並びで読んで別の行へ書いた(初回のマウントでは何もしなかった)。→ 書き込みを純粋な `writeCellValueTo` に分け、React 版は描いた時点の `rows` / `rowModel` で書く(元の動き)。Solid 版の試作は今のところ `cells.writeCellValue`(今の値)のままで、段階 1 で描いた時点の値を渡す形にそろえる。
  - 回帰テスト `SpreadsheetGrid.sharedCore.integration.test.tsx`(2 件)と `keyboardController.test.ts`(1 件)。修正を外すと落ちることを確かめた。
  - 低(直さない): 同じタスクの中で JS から続けて送った keydown が、今の状態から動くようになった(React は離散イベントごとに描き直すので実際の入力では変わらない)/ `cellCommands` は `createGridEngine` に入れずシェルが作る(`T extends object` の制約のため)。