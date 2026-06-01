import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
  build: {
    emptyOutDir: true,
    rollupOptions: {
      input: {
        side_panel: 'index.html',
        service_worker: 'src/background/service_worker.ts',
        content_script: 'src/content/content_script.ts'
      },
      output: {
        entryFileNames: (chunk_info) => {
          if (chunk_info.name === 'service_worker') {
            return 'background/service_worker.js';
          }

          if (chunk_info.name === 'content_script') {
            return 'content/content_script.js';
          }

          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
