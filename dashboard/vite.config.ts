import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 42000,
    proxy: {
      '/api': {
        target: 'http://localhost:42001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:42001',
        ws: true,
      },
    },
  },
});
