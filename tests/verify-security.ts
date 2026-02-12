#!/usr/bin/env node
/**
 * Security verification script
 * Tests that API key masking works correctly
 */

import { Logger } from '../src/logger.js';

const logger = new Logger('debug');

console.error('\n=== Testing API Key Masking ===\n');

// Test 1: API key in message
logger.info('Connecting with API key: mem_prod_1234567890abcdefghij');

// Test 2: API key in data object
logger.debug('Configuration loaded', {
  apiKey: 'mem_test_abcdefghijklmnop',
  apiUrl: 'https://api.memoryrelay.net',
});

// Test 3: Multiple API keys
logger.warn('Found keys: mem_dev_xyz123 and mem_prod_abc789');

// Test 4: Path sanitization
logger.error('Error in /home/user/.openclaw/workspace/mcp/src/index.ts at line 42');

// Test 5: Stack trace sanitization
const error = new Error('Test error');
logger.error('Exception occurred', {
  message: error.message,
  stack: error.stack,
});

console.error('\n=== All API keys should show as mem_**** ===');
console.error('=== All file paths should be sanitized ===\n');
