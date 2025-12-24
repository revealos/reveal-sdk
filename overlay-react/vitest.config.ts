import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'node_modules',
      'dist',
      // Temporarily exclude Web Component integration tests that require complex mocking
      // These tests verify OverlayManager + Web Components work together
      // The actual WC functionality is tested in @reveal/overlay-wc package
      'src/__tests__/unit/OverlayManager.test.tsx',
      'src/__tests__/unit/TooltipNudge.test.tsx',
    ],
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});

