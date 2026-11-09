import { defineConfig } from 'vite';
export default defineConfig({ logLevel: 'silent', build: { outDir: 'measure/out-grid-ai', emptyOutDir: true, minify: true, rolldownOptions: { input: 'measure/grid-ai.ts', external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], output: { entryFileNames: '[name].js' } } } });
