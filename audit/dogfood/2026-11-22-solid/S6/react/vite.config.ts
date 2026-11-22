import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({ base: process.env.BASE_PATH ?? '/', plugins: [react()], server: { port: 5506, strictPort: true }, preview: { port: 5506, strictPort: true } })
