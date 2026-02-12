/**
 * Configuration validation tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, getAgentId } from '../src/config.js';

describe('Config Validation', () => {
  // Store original env vars
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('loadConfig', () => {
    it('should load valid configuration', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      
      const config = loadConfig();
      
      expect(config.apiKey).toBe('mem_test_1234567890abcdef');
      expect(config.apiUrl).toBe('https://api.memoryrelay.net');
      expect(config.timeout).toBe(30000);
      expect(config.logLevel).toBe('info');
    });

    it('should accept custom API URL', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_API_URL = 'https://custom.api.example.com';
      
      const config = loadConfig();
      
      expect(config.apiUrl).toBe('https://custom.api.example.com');
    });

    it('should accept custom timeout', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_TIMEOUT = '60000';
      
      const config = loadConfig();
      
      expect(config.timeout).toBe(60000);
    });

    it('should accept custom log level', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_LOG_LEVEL = 'debug';
      
      const config = loadConfig();
      
      expect(config.logLevel).toBe('debug');
    });

    it('should accept optional agent ID', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_AGENT_ID = 'test-agent';
      
      const config = loadConfig();
      
      expect(config.agentId).toBe('test-agent');
    });

    it('should reject missing API key', () => {
      delete process.env.MEMORYRELAY_API_KEY;
      
      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
    });

    it('should reject API key without mem_ prefix', () => {
      process.env.MEMORYRELAY_API_KEY = 'invalid_key_1234567890';
      
      expect(() => loadConfig()).toThrow(/must start with "mem_"/);
    });

    it('should reject API key that is too short', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_short';
      
      expect(() => loadConfig()).toThrow(/too short/);
    });

    it('should reject invalid API URL', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_API_URL = 'not-a-url';
      
      expect(() => loadConfig()).toThrow(/must be a valid URL/);
    });

    it('should reject negative timeout', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_TIMEOUT = '-1000';
      
      expect(() => loadConfig()).toThrow(/must be positive/);
    });

    it('should reject invalid log level', () => {
      process.env.MEMORYRELAY_API_KEY = 'mem_test_1234567890abcdef';
      process.env.MEMORYRELAY_LOG_LEVEL = 'invalid';
      
      expect(() => loadConfig()).toThrow(/Configuration validation failed/);
    });
  });

  describe('getAgentId', () => {
    it('should return configured agent ID', () => {
      const config = {
        apiKey: 'mem_test_1234567890abcdef',
        apiUrl: 'https://api.memoryrelay.net',
        agentId: 'test-agent',
        timeout: 30000,
        logLevel: 'info' as const,
      };
      
      const agentId = getAgentId(config);
      
      expect(agentId).toBe('test-agent');
    });

    it('should generate agent ID from hostname when not configured', () => {
      const config = {
        apiKey: 'mem_test_1234567890abcdef',
        apiUrl: 'https://api.memoryrelay.net',
        timeout: 30000,
        logLevel: 'info' as const,
      };
      
      const agentId = getAgentId(config);
      
      expect(agentId).toMatch(/^agent-/);
    });

    it('should truncate hostname to 8 characters', () => {
      process.env.HOSTNAME = 'very-long-hostname';
      
      const config = {
        apiKey: 'mem_test_1234567890abcdef',
        apiUrl: 'https://api.memoryrelay.net',
        timeout: 30000,
        logLevel: 'info' as const,
      };
      
      const agentId = getAgentId(config);
      
      expect(agentId).toBe('agent-very-lon');
    });
  });
});
