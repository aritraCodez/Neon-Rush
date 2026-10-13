import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/ws': { target: 'ws://127.0.0.1:3001', ws: true } } },
  build: { rollupOptions: { output: { manualChunks: { three: ['three', '@react-three/fiber', '@react-three/postprocessing', 'postprocessing'] } } } },
});
