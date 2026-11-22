import { render } from '@solidjs/web'
import { createSignal } from 'solid-js'
const [n, setN] = createSignal(0)
render(() => <button onClick={() => setN(n() + 1)}>{n()}</button>, document.getElementById('root')!)
