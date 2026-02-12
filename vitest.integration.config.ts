/**
 * Vitest configuration for Integration Tests
 * Minimal config to run integration tests without exclusions
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 15000, // Longer timeout for API calls
    hookTimeout: 15000,
    reporters: ['verbose'],
  },
});
