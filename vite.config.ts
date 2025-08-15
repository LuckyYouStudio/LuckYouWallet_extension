import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.entry.tsx',
        content: 'src/content.entry.ts',
        background: 'src/background.entry.ts',
        provider: 'src/provider.entry.ts',
        inject: 'src/inject.ts'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name].[ext]'
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom']
  }
});
