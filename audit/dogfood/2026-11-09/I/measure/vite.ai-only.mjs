import { defineConfig } from 'vite';
export default defineConfig({ logLevel: 'silent', build: { outDir: 'measure/out-ai-only', emptyOutDir: true, minify: true, rolldownOptions: { input: 'measure/ai-only.ts', external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], output: { entryFileNames: '[name].js' } } } });
