import { defineConfig } from 'vite';
export default defineConfig({ logLevel: 'silent', build: { outDir: 'measure/out-grid-only', emptyOutDir: true, minify: true, rolldownOptions: { input: 'measure/grid-only.ts', external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], output: { entryFileNames: '[name].js' } } } });
