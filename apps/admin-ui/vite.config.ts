import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@fishplate/workflow-core': resolve(__dirname, '../../libs/workflow-core/src/index.ts'),
    },
  },
  optimizeDeps: {
    include: ['@dagrejs/dagre'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    deps: {
      optimizer: {
        web: {
          include: ['@dagrejs/dagre'],
        },
      },
    },
  },
});
