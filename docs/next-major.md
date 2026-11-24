# 次の major(2.0)の候補

1.0 から、壊す変更は major だけで出します(`website/content/docs/versioning.mdx`「バージョンと互換性」)。ここは、見つけたけれども壊す変更になるので 1.x では直さず、次の major で入れる候補の一覧です。消すものは前の minor で非推奨にしておく(CLAUDE.md「非推奨にする手順」)ので、非推奨を経るものはその版も書きます。

2.0 の作業を始めるときは、この一覧を上から確かめ、入れたものは CHANGELOG の「削除」「挙動の変化」「core の破壊的変更」に書いてから行を消します。

| ID | 中身 | 見つけた所 | 今の回避と文書 | 2.0 でやること |
| --- | --- | --- | --- | --- |
| S4-06 | `SpreadsheetGridProps<T>` に、グリッドの部品と同じ `T extends object` の制約が無い。汎用の包み部品を `<T>` で書くと TS2322 になる(React 版・Solid 版とも) | 2026-11-22 の Solid 版の点検(`docs/audits/2026-11-22-solid/findings-S1-S4.md`) | 包み部品を `<T extends object>` で書く。API リファレンスの props の節とガイド「困ったとき」の「グリッドを包む部品で型エラーになる」に記載(1.5.x)。型のテスト `type-tests/src/wrapper.tsx` / `type-tests/solid/src/wrapper.tsx` | core `model/gridTypes.core.ts` の `SpreadsheetGridProps<T, …>` を `T extends object` にする(型を狭める = 壊す変更)。React 版・Solid 版の別名と、同じ `T` を受ける公開型(`GridColumn<T>` など)もそろえるかを決める。型のテストの `@ts-expect-error` は型引数の宣言の側へ移る |

## 1.x のまま残すと決めたこと(壊す変更ではないので major を待たない)

- Solid 版の開発時の知らせ `EFFECT_WRITES_OWN_SOURCE`(`autoHeightMeasurer` / `activeRowFollow` / `edit` の 3 つ): 消すには core がアクティブセル・選択・編集中のセルを位置ではなく行のキーで持つよう作り替える必要があり、React 版の編集と選択の動きに広く触れる。得られるのは開発時の console が静かになることだけなので、今のまま(2026-11-23 の判断。`docs/audits/2026-11-23-solid-speed/README.md` の「1.5.0 の後の残り」)。