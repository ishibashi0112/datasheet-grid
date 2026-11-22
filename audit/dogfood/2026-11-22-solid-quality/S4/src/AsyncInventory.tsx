// サーバーから読む在庫一覧(Solid 2.0 の非同期 + action + createOptimistic で保存)
import { action, createMemo, createOptimistic, Errored, isPending, Loading, refresh } from 'solid-js'
import { SpreadsheetGrid, type SpreadsheetGridHandle } from '@ishibashi0112/spreadsheet-grid-solid'
import { inventoryColumns, type Item } from './inventory'

export type InventoryApi = {
  list: (category: string) => Promise<Item[]>
  save: (rows: Item[]) => Promise<void>
}

export type AsyncInventoryProps = {
  api: InventoryApi
  category: string
  /** Loading の on に渡す(切り替えで読み込み中を出し直す) */
  rearm?: boolean | undefined
  ref?: ((handle: SpreadsheetGridHandle<Item>) => void) | undefined
  onSaveError?: ((err: unknown) => void) | undefined
}

export function AsyncInventory(props: AsyncInventoryProps) {
  const serverRows = createMemo(() => props.api.list(props.category))
  // 表に出す行: サーバーの行に、保存中は楽観的な値をかぶせる
  const [rows, setRows] = createOptimistic(() => serverRows())
  const [saving, setSaving] = createOptimistic(false)

  const save = action(function* (next: Item[]) {
    setSaving(true)
    setRows(next)
    try {
      yield props.api.save(next)
    } catch (err) {
      props.onSaveError?.(err)
      return
    }
    refresh(serverRows)
  })

  return (
    <Errored
      fallback={(err, reset) => (
        <div role="alert">
          読み込みに失敗しました: {String((err() as Error)?.message ?? err())}
          <button type="button" onClick={() => reset()}>
            再試行
          </button>
        </div>
      )}
    >
      <Loading fallback={<p data-testid="loading">読み込み中…</p>} on={props.rearm ? props.category : undefined}>
        <p data-testid="status">
          {isPending(() => serverRows()) ? '更新中…' : saving() ? '保存中…' : '保存済み'}
        </p>
        <SpreadsheetGrid
          ref={(h) => props.ref?.(h)}
          ariaLabel="在庫一覧(サーバー)"
          rows={rows()}
          columns={inventoryColumns}
          rowKeyGetter={(r) => r.id}
          onRowsChange={(next) => save(next)}
          height={400}
        />
      </Loading>
    </Errored>
  )
}

// テスト用の擬似サーバー(遅延と失敗を差し込める)
export function createFakeServer(initial: Record<string, Item[]>) {
  const db: Record<string, Item[]> = structuredClone(initial)
  const calls: string[] = []
  let failNextSave = false
  let failNextList = false
  let delay = 50
  const wait = () => new Promise<void>((r) => setTimeout(r, delay))
  const api: InventoryApi = {
    async list(category) {
      calls.push(`list:${category}`)
      await wait()
      if (failNextList) {
        failNextList = false
        throw new Error('一覧の取得に失敗')
      }
      return structuredClone(db[category] ?? [])
    },
    async save(rows) {
      calls.push(`save:${rows.length}`)
      await wait()
      if (failNextSave) {
        failNextSave = false
        throw new Error('保存に失敗')
      }
      const cat = Object.keys(db).find((k) => db[k]!.some((r) => r.id === rows[0]?.id)) ?? 'A'
      db[cat] = structuredClone(rows)
    },
  }
  return {
    api,
    db,
    calls,
    failSave: () => (failNextSave = true),
    failList: () => (failNextList = true),
    setDelay: (ms: number) => (delay = ms),
  }
}