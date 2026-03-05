#!/usr/bin/env node
/**
 * MemoryRelay MCP Server - Entry Point
 *
 * Provides persistent memory storage for AI agents via Model Context Protocol.
 *
 * CLI commands:
 *   npx memoryrelay-mcp          Start MCP server (stdio transport)
 *   npx memoryrelay-mcp setup    Interactive setup wizard
 *   npx memoryrelay-mcp test     Test API connectivity
 */

import { loadConfig, getAgentId } from './config.js';
import { initLogger, getLogger } from './logger.js';
import { MemoryRelayMCPServer } from './server.js';

async function startServer(): Promise<void> {
  // Load and validate configuration
  const config = loadConfig();

  // Initialize logger with configured level
  initLogger(config.logLevel);
  const logger = getLogger();

  logger.info('Starting MemoryRelay MCP server');

  // Get or generate agent ID
  const agentId = getAgentId(config);

  // Create and start MCP server
  const server = new MemoryRelayMCPServer({
    apiKey: config.apiKey,
    apiUrl: config.apiUrl,
    agentId,
    timeout: config.timeout,
  });

  await server.start();

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });
}

async function main(): Promise<void> {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'setup': {
        const { runSetup } = await import('./cli/setup.js');
        await runSetup();
        break;
      }
      case 'test': {
        const { runTest } = await import('./cli/test.js');
        await runTest();
        break;
      }
      case '--help':
      case '-h': {
        console.error(`
  memoryrelay-mcp - Persistent memory for AI agents

  Usage:
    npx memoryrelay-mcp          Start MCP server (stdio transport)
    npx memoryrelay-mcp setup    Interactive setup wizard
    npx memoryrelay-mcp test     Test API connectivity
    npx memoryrelay-mcp --help   Show this help message

  Environment variables:
    MEMORYRELAY_API_KEY     API key (required, starts with "mem_")
    MEMORYRELAY_API_URL     API URL (default: https://api.memoryrelay.net)
    MEMORYRELAY_AGENT_ID    Agent ID (optional, auto-detected)
    MEMORYRELAY_TIMEOUT     Request timeout in ms (default: 30000)
    MEMORYRELAY_LOG_LEVEL   Log level: debug|info|warn|error (default: info)

  Documentation: https://github.com/memoryrelay/mcp-server
`);
        break;
      }
      default:
        await startServer();
    }
  } catch (error) {
    const logger = getLogger();

    if (error instanceof Error) {
      logger.error('Fatal error:', { message: error.message });

      // Print user-friendly error to stderr
      console.error('\nFailed to start MemoryRelay MCP server\n');
      console.error(error.message);
      console.error('\nFor help, run: npx memoryrelay-mcp --help\n');
    } else {
      logger.error('Fatal error:', { error });
      console.error('\nAn unexpected error occurred\n');
    }

    process.exit(1);
  }
}

main();
