import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({ plugins: [react()], server: { port: 5510, strictPort: true }, preview: { port: 5510, strictPort: true } })
