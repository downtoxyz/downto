import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Minimal Vitest setup. We deliberately scope `include` to .test.ts only —
// no JSX yet, no DOM yet — so we don't have to drag in jsdom + a React
// test renderer. When we want component tests later we'll widen this.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
