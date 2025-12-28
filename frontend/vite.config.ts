import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/microshop': {
        target: 'http://nginx',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('@mantine')) return 'mantine';
          if (id.includes('@emotion')) return 'emotion';
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('@tabler')) return 'tabler';
          if (id.includes('react-router')) return 'router';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          )
            return 'react';

          if (id.includes('recharts') || id.includes('/d3-')) return 'charts';
          if (id.includes('tiptap') || id.includes('prosemirror')) return 'editor';
          if (id.includes('date-fns')) return 'date';
          if (id.includes('axios')) return 'http';
          if (id.includes('zod')) return 'validation';

          return 'vendor';
        },
      },
    },
  },
})
