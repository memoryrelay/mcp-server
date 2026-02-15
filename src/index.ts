#!/usr/bin/env node
/**
 * MemoryRelay MCP Server - Entry Point
 * 
 * Provides persistent memory storage for AI agents via Model Context Protocol
 */

import { loadConfig, getAgentId } from './config.js';
import { initLogger, getLogger } from './logger.js';
import { MemoryRelayMCPServer } from './server.js';

async function main() {
  try {
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

  } catch (error) {
    const logger = getLogger();
    
    if (error instanceof Error) {
      logger.error('Fatal error:', { message: error.message });
      
      // Print user-friendly error to stderr
      console.error('\n❌ Failed to start MemoryRelay MCP server\n');
      console.error(error.message);
      console.error('\nFor help, see: https://github.com/memoryrelay/mcp-server#troubleshooting\n');
    } else {
      logger.error('Fatal error:', { error });
      console.error('\n❌ An unexpected error occurred\n');
    }
    
    process.exit(1);
  }
}

main();
