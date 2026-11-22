import { renderToString, renderToStream } from '@solidjs/web'
import { AsyncInventory, createFakeServer } from '../src/AsyncInventory'
import { makeItems } from '../src/inventory'

const server = () => createFakeServer({ A: makeItems(6) })
export function renderAsyncString() {
  return renderToString(() => <AsyncInventory api={server().api} category="A" />)
}
export async function renderAsyncStream() {
  return await renderToStream(() => <AsyncInventory api={server().api} category="A" />)
}
