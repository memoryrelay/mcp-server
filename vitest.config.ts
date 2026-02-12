/**
 * Vitest configuration for MemoryRelay MCP Server
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test file patterns
    include: ['tests/**/*.test.ts'],
    
    // Exclude integration tests from default run (run separately)
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/integration.test.ts', // Run separately with real API
    ],
    
    // Test environment
    environment: 'node',
    
    // Global test timeout (10 seconds)
    testTimeout: 10000,
    
    // Hook timeout
    hookTimeout: 10000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.ts',
      ],
    },
    
    // Reporter configuration
    reporters: ['verbose'],
    
    // Fail fast on first error (set to true for CI)
    bail: 1,
  },
});
