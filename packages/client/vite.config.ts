import { defineConfig } from 'vite';
const proxy = { '/socket': { target: `ws://127.0.0.1:${process.env.PORT ?? 8787}`, ws: true } };
export default defineConfig({
  server: { proxy },
  preview: { proxy },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
