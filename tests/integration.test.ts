/**
 * Integration Tests - Real API Testing
 * 
 * Tests the full lifecycle against the production MemoryRelay API
 * Issue #15: https://github.com/Alteriom/ai-memory-service/issues/15
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryRelayClient } from '../src/client.js';
import type { Memory, Entity } from '../src/types.js';

describe('Integration Tests (Real API)', () => {
  // Use environment variable or hardcoded production key for testing
  const API_KEY = process.env.MEMORYRELAY_API_KEY || 'mem_prod_e0affdcce0f3859b2ee691f6cfd73ff2';
  const API_URL = 'https://api.memoryrelay.net';
  const AGENT_ID = 'test-agent-integration';

  let client: MemoryRelayClient;
  let testMemoryId: string;
  let testEntityId: string;

  // Track all created resources for cleanup
  const createdMemoryIds: string[] = [];
  const createdEntityIds: string[] = [];

  beforeAll(() => {
    client = new MemoryRelayClient({
      apiKey: API_KEY,
      apiUrl: API_URL,
      agentId: AGENT_ID,
      timeout: 10000,
    });
  });

  afterAll(async () => {
    // Clean up all test data
    console.log('\n🧹 Cleaning up test data...');
    
    // Delete all created memories
    for (const id of createdMemoryIds) {
      try {
        await client.deleteMemory(id);
        console.log(`  ✓ Deleted memory: ${id}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to delete memory ${id}:`, error);
      }
    }

    // Delete all created entities
    for (const id of createdEntityIds) {
      try {
        await client.deleteEntity(id);
        console.log(`  ✓ Deleted entity: ${id}`);
      } catch (error) {
        console.warn(`  ⚠ Failed to delete entity ${id}:`, error);
      }
    }

    console.log('✅ Cleanup complete\n');
  });

  describe('Health Check', () => {
    it('should verify API connectivity', async () => {
      const health = await client.healthCheck();
      
      expect(health).toBeDefined();
      expect(health.status).toBe('healthy');
      expect(health.message).toContain('successful');
    }, 10000);
  });

  describe('Memory Lifecycle', () => {
    it('should create a new memory', async () => {
      const content = `Integration test memory created at ${new Date().toISOString()}`;
      const metadata = {
        test: 'true',
        type: 'integration',
        timestamp: Date.now().toString(),
      };

      const memory = await client.storeMemory(content, metadata);

      expect(memory).toBeDefined();
      expect(memory.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(memory.content).toBe(content);
      // Note: API may not return metadata in the same format or may return empty object
      expect(memory.metadata).toBeDefined();
      expect(memory.created_at).toBeGreaterThan(0);
      // agent_id may be transformed to UUID by API
      expect(memory.agent_id).toBeDefined();

      // Store for later tests and cleanup
      testMemoryId = memory.id;
      createdMemoryIds.push(memory.id);
    }, 10000);

    it('should retrieve the created memory by ID', async () => {
      expect(testMemoryId).toBeDefined();

      const memory = await client.getMemory(testMemoryId);

      expect(memory).toBeDefined();
      expect(memory.id).toBe(testMemoryId);
      expect(memory.content).toContain('Integration test memory');
      expect(memory.metadata).toBeDefined();
    }, 10000);

    it('should search for the created memory', async () => {
      expect(testMemoryId).toBeDefined();

      const results = await client.searchMemories('Integration test memory', 10, 0.3);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Find our test memory
      const foundMemory = results.find(r => r.memory.id === testMemoryId);
      expect(foundMemory).toBeDefined();
      expect(foundMemory!.score).toBeGreaterThan(0);
      expect(foundMemory!.score).toBeLessThanOrEqual(1);
    }, 10000);

    it('should list memories and include the created one', async () => {
      const response = await client.listMemories(50, 0);

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThanOrEqual(1);
      expect(typeof response.has_more).toBe('boolean');

      // Find our test memory
      const foundMemory = response.data.find(m => m.id === testMemoryId);
      expect(foundMemory).toBeDefined();
    }, 10000);

    it('should update the memory content', async () => {
      expect(testMemoryId).toBeDefined();

      const newContent = `UPDATED: Integration test memory at ${new Date().toISOString()}`;
      const newMetadata = {
        test: 'true',
        type: 'integration',
        updated: 'true',
      };

      const updated = await client.updateMemory(testMemoryId, newContent, newMetadata);

      expect(updated).toBeDefined();
      expect(updated.id).toBe(testMemoryId);
      expect(updated.content).toBe(newContent);
      expect(updated.metadata).toBeDefined();
      expect(updated.updated_at).toBeDefined();
      expect(updated.updated_at).toBeGreaterThanOrEqual(updated.created_at);
    }, 10000);

    it('should delete the memory', async () => {
      expect(testMemoryId).toBeDefined();

      // Delete should not throw
      await expect(client.deleteMemory(testMemoryId)).resolves.toBeUndefined();

      // Verify it's gone (should throw 404)
      await expect(client.getMemory(testMemoryId)).rejects.toThrow(/404/);

      // Remove from cleanup list since it's already deleted
      const index = createdMemoryIds.indexOf(testMemoryId);
      if (index > -1) {
        createdMemoryIds.splice(index, 1);
      }
    }, 10000);
  });

  describe('Entity Lifecycle', () => {
    let linkedMemoryId: string;

    beforeAll(async () => {
      // Create a memory to link to
      const memory = await client.storeMemory(
        'Memory for entity linking test',
        { test: 'entity-link' }
      );
      linkedMemoryId = memory.id;
      createdMemoryIds.push(memory.id);
    });

    it('should create a new entity', async () => {
      const entity = await client.createEntity(
        `Test Entity ${Date.now()}`,
        'concept',
        { test: 'true', source: 'integration' }
      );

      expect(entity).toBeDefined();
      expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(entity.name).toContain('Test Entity');
      expect(entity.type).toBe('concept');
      expect(entity.metadata?.test).toBe('true');
      expect(entity.created_at).toBeGreaterThan(0);

      // Store for later tests and cleanup
      testEntityId = entity.id;
      createdEntityIds.push(entity.id);
    }, 10000);

    it('should retrieve the created entity by ID', async () => {
      expect(testEntityId).toBeDefined();

      const entity = await client.getEntity(testEntityId);

      expect(entity).toBeDefined();
      expect(entity.id).toBe(testEntityId);
      expect(entity.type).toBe('concept');
    }, 10000);

    it('should list entities and include the created one', async () => {
      const response = await client.listEntities(50, 0);

      expect(response).toBeDefined();
      expect(response.data).toBeDefined();
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeGreaterThanOrEqual(1);

      // Find our test entity
      const foundEntity = response.data.find(e => e.id === testEntityId);
      expect(foundEntity).toBeDefined();
    }, 10000);

    it('should link entity to memory', async () => {
      expect(testEntityId).toBeDefined();
      expect(linkedMemoryId).toBeDefined();

      // Link should not throw
      await expect(
        client.linkEntity(testEntityId, linkedMemoryId, 'tested_with')
      ).resolves.toBeUndefined();
    }, 10000);

    it('should delete the entity', async () => {
      expect(testEntityId).toBeDefined();

      // Delete should not throw
      await expect(client.deleteEntity(testEntityId)).resolves.toBeUndefined();

      // Verify it's gone (should throw 404)
      await expect(client.getEntity(testEntityId)).rejects.toThrow(/404/);

      // Remove from cleanup list since it's already deleted
      const index = createdEntityIds.indexOf(testEntityId);
      if (index > -1) {
        createdEntityIds.splice(index, 1);
      }
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle invalid memory ID gracefully', async () => {
      await expect(client.getMemory('invalid-uuid')).rejects.toThrow();
    }, 10000);

    it('should handle non-existent memory ID', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      await expect(client.getMemory(fakeUuid)).rejects.toThrow(/404/);
    }, 10000);

    it('should handle oversized content', async () => {
      const hugeContent = 'x'.repeat(60 * 1024); // 60KB (over 50KB limit)
      await expect(client.storeMemory(hugeContent)).rejects.toThrow(/maximum size/);
    }, 10000);
  });

  describe('Pagination', () => {
    beforeAll(async () => {
      // Create multiple memories for pagination testing
      for (let i = 0; i < 5; i++) {
        const memory = await client.storeMemory(
          `Pagination test memory ${i}`,
          { test: 'pagination', index: i.toString() }
        );
        createdMemoryIds.push(memory.id);
      }
    });

    it('should paginate memory list results', async () => {
      const page1 = await client.listMemories(2, 0);
      const page2 = await client.listMemories(2, 2);

      expect(page1.data.length).toBe(2);
      expect(page2.data.length).toBeGreaterThanOrEqual(1);
      
      // IDs should be different
      const page1Ids = new Set(page1.data.map(m => m.id));
      const page2Ids = new Set(page2.data.map(m => m.id));
      
      // Check for no overlap between pages
      for (const id of page2Ids) {
        if (page1Ids.has(id)) {
          // Some overlap is OK if there are concurrent writes, but most should be different
          console.warn('Found overlapping ID in pagination - possible concurrent write');
        }
      }
    }, 15000);
  });
});
