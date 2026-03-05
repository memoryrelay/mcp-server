/**
 * Connection test command for MemoryRelay MCP server.
 *
 * Validates configuration and tests API connectivity.
 *
 * Usage: npx memoryrelay-mcp test
 */

import { loadConfig, getAgentId } from '../config.js';
import { MemoryRelayClient } from '../client.js';

function stderr(msg: string): void {
  process.stderr.write(msg + '\n');
}

export async function runTest(): Promise<void> {
  stderr('');
  stderr('  MemoryRelay Connection Test');
  stderr('  ===========================');
  stderr('');

  // Step 1: Check configuration
  stderr('  1. Checking configuration...');
  let config;
  try {
    config = loadConfig();
    stderr('     API Key: ' + config.apiKey.substring(0, 8) + '***');
    stderr('     API URL: ' + config.apiUrl);
  } catch (error) {
    stderr(`     FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stderr('');
    stderr('  Run "npx memoryrelay-mcp setup" to configure.');
    process.exit(1);
  }

  // Step 2: Resolve agent ID
  stderr('');
  stderr('  2. Resolving agent ID...');
  const agentId = getAgentId(config);
  stderr(`     Agent ID: ${agentId}`);
  if (config.agentId) {
    stderr('     Source: MEMORYRELAY_AGENT_ID');
  } else if (process.env.OPENCLAW_AGENT_NAME) {
    stderr('     Source: OPENCLAW_AGENT_NAME');
  } else {
    stderr('     Source: auto-generated (user@hostname)');
  }

  // Step 3: Test API connectivity
  stderr('');
  stderr('  3. Testing API connectivity...');
  const client = new MemoryRelayClient({
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    agentId,
    timeout: config.timeout,
  });

  const health = await client.healthCheck();
  if (health.status === 'healthy') {
    stderr(`     ${health.message}`);
  } else {
    stderr(`     FAIL: ${health.message}`);
    process.exit(1);
  }

  // Step 4: Test memory operations
  stderr('');
  stderr('  4. Testing memory operations...');
  try {
    // Store a test memory
    const memory = await client.storeMemory(
      '__memoryrelay_connection_test__',
      { _test: 'true', _cleanup: 'safe_to_delete' }
    );
    stderr(`     Store: OK (id: ${memory.id})`);

    // Search for it
    const results = await client.searchMemories('connection test', 1, 0.0);
    stderr(`     Search: OK (${results.length} result${results.length !== 1 ? 's' : ''})`);

    // Clean up
    await client.deleteMemory(memory.id);
    stderr('     Delete: OK (test memory cleaned up)');
  } catch (error) {
    stderr(`     FAIL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    stderr('');
    stderr('  API connection works but memory operations failed.');
    stderr('  Check your API key scopes (needs read + write + delete).');
    process.exit(1);
  }

  // Summary
  stderr('');
  stderr('  All tests passed! MemoryRelay is ready.');
  stderr('');
}
