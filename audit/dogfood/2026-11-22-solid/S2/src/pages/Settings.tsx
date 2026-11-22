import { createSignal, onSettled } from 'solid-js'
import { getChaos, setChaos } from '../api'
import { density, setDensity, setShowSave, showSave } from '../settings'

export default function Settings() {
  const [chaos, setC] = createSignal({ getFailRate: 0, patchFailRate: 0.1, getDelay: 150 })
  onSettled(() => {
    getChaos().then(setC)
  })
  const update = async (patch: Record<string, number>) => setC(await setChaos(patch))
  return (
    <section class="page settings">
      <h1>Settings</h1>
      <label>
        Density{' '}
        <select value={density()} onChange={(e) => setDensity(e.currentTarget.value as 'compact')}>
          <option value="compact">compact</option>
          <option value="standard">standard</option>
          <option value="comfortable">comfortable</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={showSave()} onChange={(e) => setShowSave(e.currentTarget.checked)} /> Show save status
      </label>
      <fieldset>
        <legend>Server simulation</legend>
        <label>
          GET failure rate{' '}
          <input data-testid="get-fail" type="number" step="0.1" min="0" max="1" value={chaos().getFailRate} onChange={(e) => update({ getFailRate: Number(e.currentTarget.value) })} />
        </label>
        <label>
          PATCH failure rate{' '}
          <input type="number" step="0.1" min="0" max="1" value={chaos().patchFailRate} onChange={(e) => update({ patchFailRate: Number(e.currentTarget.value) })} />
        </label>
      </fieldset>
    </section>
  )
}
