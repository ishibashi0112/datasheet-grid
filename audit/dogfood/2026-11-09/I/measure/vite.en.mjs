import { defineConfig } from 'vite';
export default defineConfig({ logLevel: 'silent', build: { outDir: 'measure/out-en', emptyOutDir: true, minify: true, rolldownOptions: { input: 'measure/en.ts', external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'], output: { entryFileNames: '[name].js' } } } });
