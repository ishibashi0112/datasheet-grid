import solid from '@solidjs/vite-plugin'
import { defineConfig } from 'vite'
export default defineConfig({
  plugins: [solid({ ssr: true }), { name: 'log', enforce: 'post', load(id) { if (id.includes('spreadsheet-grid-solid')) console.log('LOAD', id.replace(/.*node_modules\//, '')) } }],
})
