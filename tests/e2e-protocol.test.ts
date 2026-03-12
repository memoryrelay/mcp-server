/**
 * MCP Protocol End-to-End Tests
 *
 * These tests exercise the full MCP protocol lifecycle using in-memory
 * transports. A real MCP Client sends protocol messages (ListTools,
 * CallTool) to the MemoryRelayMCPServer, which processes them and
 * returns responses -- exactly as Claude Desktop or OpenClaw would.
 *
 * The HTTP client is mocked so tests run without a live API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MemoryRelayMCPServer } from '../src/server.js';
import { MemoryRelayClient } from '../src/client.js';
import type { ClientConfig } from '../src/types.js';

// ── Helpers ──────────────────────────────────────────────────────────

const TEST_UUID_1 = '550e8400-e29b-41d4-a716-446655440000';
const TEST_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';
const TEST_UUID_3 = '770e8400-e29b-41d4-a716-446655440002';

const TEST_CONFIG: ClientConfig = {
  apiKey: 'mem_test_1234567890abcdef',
  apiUrl: 'https://api.memoryrelay.net',
  agentId: 'test-agent',
  timeout: 30000,
};

function makeMockClient(): MemoryRelayClient {
  const client = new MemoryRelayClient(TEST_CONFIG);

  // Mock all client methods
  vi.spyOn(client, 'storeMemory').mockResolvedValue({
    id: TEST_UUID_1,
    content: 'Test memory content',
    agent_id: 'test-agent',
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  } as any);

  vi.spyOn(client, 'searchMemories').mockResolvedValue([
    {
      id: TEST_UUID_1,
      content: 'Test memory content',
      similarity: 0.95,
      agent_id: 'test-agent',
      created_at: '2026-02-28T00:00:00Z',
    },
  ] as any);

  vi.spyOn(client, 'listMemories').mockResolvedValue({
    data: [
      { id: TEST_UUID_1, content: 'Memory 1', agent_id: 'test-agent' },
      { id: TEST_UUID_2, content: 'Memory 2', agent_id: 'test-agent' },
    ],
    total: 2,
    limit: 20,
    offset: 0,
  } as any);

  vi.spyOn(client, 'getMemory').mockResolvedValue({
    id: TEST_UUID_1,
    content: 'Test memory content',
    agent_id: 'test-agent',
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T00:00:00Z',
  } as any);

  vi.spyOn(client, 'updateMemory').mockResolvedValue({
    id: TEST_UUID_1,
    content: 'Updated content',
    agent_id: 'test-agent',
    created_at: '2026-02-28T00:00:00Z',
    updated_at: '2026-02-28T01:00:00Z',
  } as any);

  vi.spyOn(client, 'deleteMemory').mockResolvedValue(undefined);

  vi.spyOn(client, 'createEntity').mockResolvedValue({
    id: TEST_UUID_2,
    name: 'Test Entity',
    type: 'concept',
    created_at: '2026-02-28T00:00:00Z',
  } as any);

  vi.spyOn(client, 'linkEntity').mockResolvedValue(undefined);

  vi.spyOn(client, 'listEntities').mockResolvedValue({
    data: [
      { id: TEST_UUID_2, name: 'Entity 1', type: 'concept' },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  } as any);

  vi.spyOn(client, 'listAgents').mockResolvedValue({
    data: [
      { id: TEST_UUID_3, name: 'test-agent', memory_count: 5 },
    ],
    total: 1,
    limit: 20,
    offset: 0,
  } as any);

  vi.spyOn(client, 'createAgent').mockResolvedValue({
    id: TEST_UUID_3,
    name: 'new-agent',
    description: 'A test agent',
    created_at: '2026-02-28T00:00:00Z',
  } as any);

  vi.spyOn(client, 'getAgent').mockResolvedValue({
    id: TEST_UUID_3,
    name: 'test-agent',
    memory_count: 5,
    created_at: '2026-02-28T00:00:00Z',
  } as any);

  vi.spyOn(client, 'healthCheck').mockResolvedValue({
    status: 'healthy',
    message: 'API connection successful',
  });

  vi.spyOn(client, 'getEntityNeighborhood').mockResolvedValue({
    entity: { id: TEST_UUID_2, name: 'Test Entity', type: 'concept' },
    neighbors: [
      { id: TEST_UUID_1, name: 'Related Entity', type: 'person', relationship: 'relates_to', depth: 1 },
    ],
    total_neighbors: 1,
  });

  vi.spyOn(client, 'batchStoreMemories').mockResolvedValue({
    success: true,
    total: 2,
    succeeded: 2,
    failed: 0,
    skipped: 0,
    results: [
      { status: 'success', memory_id: TEST_UUID_1 },
      { status: 'success', memory_id: TEST_UUID_2 },
    ],
  });

  vi.spyOn(client, 'buildContext').mockResolvedValue({
    context: '[95%] User prefers Python\n\n[87%] User works on AI projects',
    memories_used: 2,
    total_chars: 55,
  });

  vi.spyOn(client, 'createProject').mockResolvedValue({
    id: TEST_UUID_1,
    slug: 'my-api',
    name: 'My API',
    description: 'An API project',
    stack: { languages: ['python'] },
    memory_count: 0,
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
  } as any);

  vi.spyOn(client, 'listProjects').mockResolvedValue({
    data: [
      { id: TEST_UUID_1, slug: 'my-api', name: 'My API', memory_count: 5 },
    ],
    has_more: false,
    total_count: 1,
  } as any);

  vi.spyOn(client, 'getProject').mockResolvedValue({
    id: TEST_UUID_1,
    slug: 'my-api',
    name: 'My API',
    description: 'An API project',
    stack: { languages: ['python'] },
    memory_count: 5,
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
  } as any);

  vi.spyOn(client, 'createPattern').mockResolvedValue({
    id: TEST_UUID_1,
    title: 'Zod validation at API boundaries',
    description: 'All API route handlers validate input with Zod schemas',
    scope: 'global',
    category: 'validation',
    tags: ['api', 'validation'],
    adoption_count: 0,
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
  } as any);

  vi.spyOn(client, 'searchPatterns').mockResolvedValue({
    data: [
      {
        pattern: {
          id: TEST_UUID_1,
          title: 'Zod validation',
          description: 'Use Zod for validation',
          scope: 'global',
          tags: [],
          adoption_count: 2,
          created_at: '2026-03-02T00:00:00Z',
          updated_at: '2026-03-02T00:00:00Z',
        },
        score: 0.92,
      },
    ],
    query: 'validation',
    total: 1,
  } as any);

  vi.spyOn(client, 'adoptPattern').mockResolvedValue({
    id: TEST_UUID_1,
    title: 'Zod validation',
    description: 'Use Zod for validation',
    scope: 'global',
    tags: [],
    adoption_count: 1,
    created_at: '2026-03-02T00:00:00Z',
    updated_at: '2026-03-02T00:00:00Z',
  } as any);

  vi.spyOn(client, 'suggestPatterns').mockResolvedValue({
    data: [
      {
        id: TEST_UUID_2,
        title: 'Error Response Format',
        description: 'RFC 7807 error responses',
        scope: 'global',
        tags: ['error-handling'],
        adoption_count: 3,
        created_at: '2026-03-02T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
    ],
    project: 'my-api',
    total: 1,
  } as any);

  return client;
}

async function createTestPair() {
  const mockClient = makeMockClient();
  const mcpServer = new MemoryRelayMCPServer(TEST_CONFIG, mockClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const mcpClient = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await mcpServer.connectTransport(serverTransport);
  await mcpClient.connect(clientTransport);

  return { mcpClient, mcpServer, mockClient };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('MCP Protocol E2E Tests', () => {
  let mcpClient: Client;
  let mcpServer: MemoryRelayMCPServer;
  let mockClient: MemoryRelayClient;

  beforeEach(async () => {
    const pair = await createTestPair();
    mcpClient = pair.mcpClient;
    mcpServer = pair.mcpServer;
    mockClient = pair.mockClient;
  });

  afterEach(async () => {
    await mcpClient.close();
    await mcpServer.close();
  });

  // ── Tool Discovery ───────────────────────────────────────────────

  describe('ListTools', () => {
    it('should list all 44 tools', async () => {
      const result = await mcpClient.listTools();

      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBe(44);

      const toolNames = result.tools.map(t => t.name).sort();
      expect(toolNames).toEqual([
        'agent_create',
        'agent_get',
        'agent_list',
        'context_build',
        'decision_check',
        'decision_list',
        'decision_record',
        'decision_supersede',
        'entity_create',
        'entity_graph',
        'entity_link',
        'entity_list',
        'memory_batch_store',
        'memory_context',
        'memory_delete',
        'memory_forget',
        'memory_get',
        'memory_health',
        'memory_list',
        'memory_promote',
        'memory_recall',
        'memory_search',
        'memory_status',
        'memory_store',
        'memory_store_async',
        'memory_update',
        'pattern_adopt',
        'pattern_create',
        'pattern_search',
        'pattern_suggest',
        'project_add_relationship',
        'project_context',
        'project_dependencies',
        'project_dependents',
        'project_impact',
        'project_info',
        'project_list',
        'project_register',
        'project_related',
        'project_shared_patterns',
        'session_end',
        'session_list',
        'session_recall',
        'session_start',
      ]);
    });

    it('should include input schemas for all tools', async () => {
      const result = await mcpClient.listTools();

      for (const tool of result.tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.description).toBeTruthy();
      }
    });

    it('should mark required fields in tool schemas', async () => {
      const result = await mcpClient.listTools();

      const memoryStore = result.tools.find(t => t.name === 'memory_store');
      expect(memoryStore?.inputSchema.required).toContain('content');

      const memoryGet = result.tools.find(t => t.name === 'memory_get');
      expect(memoryGet?.inputSchema.required).toContain('id');

      const entityCreate = result.tools.find(t => t.name === 'entity_create');
      expect(entityCreate?.inputSchema.required).toContain('name');
      expect(entityCreate?.inputSchema.required).toContain('type');

      const batchStore = result.tools.find(t => t.name === 'memory_batch_store');
      expect(batchStore?.inputSchema.required).toContain('memories');

      const context = result.tools.find(t => t.name === 'memory_context');
      expect(context?.inputSchema.required).toContain('query');
    });
  });

  // ── Memory Lifecycle ─────────────────────────────────────────────

  describe('Memory Lifecycle (store -> search -> get -> update -> delete)', () => {
    it('should store a memory via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_store',
        arguments: { content: 'Test memory content' },
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.id).toBe(TEST_UUID_1);
      expect(response.content).toBe('Test memory content');

      expect(mockClient.storeMemory).toHaveBeenCalledWith(
        'Test memory content',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should store a memory with metadata and deduplication', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_store',
        arguments: {
          content: 'Important fact',
          metadata: { source: 'test', priority: 'high' },
          deduplicate: true,
          dedup_threshold: 0.9,
        },
      });

      expect(result.isError).toBeFalsy();
      expect(mockClient.storeMemory).toHaveBeenCalledWith(
        'Important fact',
        { source: 'test', priority: 'high' },
        true,
        0.9,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should search memories via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_search',
        arguments: { query: 'test query', limit: 5, threshold: 0.7 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.memories).toHaveLength(1);
      expect(response.memories[0].similarity).toBe(0.95);
      expect(response.total).toBe(1);
    });

    it('should search across all agents when agent_id is omitted', async () => {
      await mcpClient.callTool({
        name: 'memory_search',
        arguments: { query: 'cross-agent search' },
      });

      expect(mockClient.searchMemories).toHaveBeenCalledWith(
        'cross-agent search',
        undefined,
        undefined,
        null,
        false,
        false,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should get a memory by ID via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_get',
        arguments: { id: TEST_UUID_1 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.id).toBe(TEST_UUID_1);
      expect(response.content).toBe('Test memory content');
    });

    it('should update a memory via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_update',
        arguments: {
          id: TEST_UUID_1,
          content: 'Updated content',
        },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.content).toBe('Updated content');

      expect(mockClient.updateMemory).toHaveBeenCalledWith(
        TEST_UUID_1,
        'Updated content',
        undefined,
      );
    });

    it('should delete a memory via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_delete',
        arguments: { id: TEST_UUID_1 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.success).toBe(true);
      expect(response.message).toBe('Memory deleted successfully');

      expect(mockClient.deleteMemory).toHaveBeenCalledWith(TEST_UUID_1);
    });

    it('should list memories via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_list',
        arguments: { limit: 10, offset: 0 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.data).toHaveLength(2);
      expect(response.total).toBe(2);
    });
  });

  // ── Entity Lifecycle ─────────────────────────────────────────────

  describe('Entity Lifecycle (create -> link -> list)', () => {
    it('should create an entity via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_create',
        arguments: {
          name: 'Test Entity',
          type: 'concept',
          metadata: { domain: 'testing' },
        },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.id).toBe(TEST_UUID_2);
      expect(response.name).toBe('Test Entity');
      expect(response.type).toBe('concept');
    });

    it('should sanitize entity names (XSS prevention)', async () => {
      await mcpClient.callTool({
        name: 'entity_create',
        arguments: {
          name: '<script>alert("xss")</script>',
          type: 'person',
        },
      });

      expect(mockClient.createEntity).toHaveBeenCalledWith(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
        'person',
        undefined,
      );
    });

    it('should link an entity to a memory via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_link',
        arguments: {
          entity_id: TEST_UUID_2,
          memory_id: TEST_UUID_1,
          relationship: 'relates_to',
        },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.success).toBe(true);
      expect(response.entity_id).toBe(TEST_UUID_2);
      expect(response.memory_id).toBe(TEST_UUID_1);
      expect(response.relationship).toBe('relates_to');

      expect(mockClient.linkEntity).toHaveBeenCalledWith(
        TEST_UUID_2,
        TEST_UUID_1,
        'relates_to',
      );
    });

    it('should use default relationship when not specified', async () => {
      await mcpClient.callTool({
        name: 'entity_link',
        arguments: {
          entity_id: TEST_UUID_2,
          memory_id: TEST_UUID_1,
        },
      });

      expect(mockClient.linkEntity).toHaveBeenCalledWith(
        TEST_UUID_2,
        TEST_UUID_1,
        'mentioned_in',
      );
    });

    it('should list entities via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_list',
        arguments: { limit: 10 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].name).toBe('Entity 1');
    });
  });

  // ── Graph Traversal ─────────────────────────────────────────────

  describe('Graph Traversal', () => {
    it('should explore entity neighborhood via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_graph',
        arguments: { entity_id: TEST_UUID_2, depth: 1 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.entity).toBeDefined();
      expect(response.neighbors).toHaveLength(1);

      expect(mockClient.getEntityNeighborhood).toHaveBeenCalledWith(
        TEST_UUID_2,
        1,
        50,
      );
    });

    it('should reject invalid UUID for entity_graph', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_graph',
        arguments: { entity_id: 'not-a-uuid' },
      });

      expect(result.isError).toBe(true);
    });

    it('should pass depth and max_neighbors options', async () => {
      await mcpClient.callTool({
        name: 'entity_graph',
        arguments: { entity_id: TEST_UUID_2, depth: 2, max_neighbors: 25 },
      });

      expect(mockClient.getEntityNeighborhood).toHaveBeenCalledWith(
        TEST_UUID_2,
        2,
        25,
      );
    });
  });

  // ── Agent Operations ─────────────────────────────────────────────

  describe('Agent Operations', () => {
    it('should list agents via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'agent_list',
        arguments: { limit: 10 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].name).toBe('test-agent');
    });

    it('should create an agent via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'agent_create',
        arguments: { name: 'new-agent', description: 'A test agent' },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.id).toBe(TEST_UUID_3);
      expect(response.name).toBe('new-agent');
    });

    it('should sanitize agent names (XSS prevention)', async () => {
      await mcpClient.callTool({
        name: 'agent_create',
        arguments: { name: '<b>bold</b>' },
      });

      expect(mockClient.createAgent).toHaveBeenCalledWith(
        '&lt;b&gt;bold&lt;&#x2F;b&gt;',
        undefined,
      );
    });

    it('should get an agent by ID via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'agent_get',
        arguments: { id: TEST_UUID_3 },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.id).toBe(TEST_UUID_3);
      expect(response.name).toBe('test-agent');
    });
  });

  // ── Batch Store ─────────────────────────────────────────────────

  describe('Batch Store', () => {
    it('should batch store memories via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_batch_store',
        arguments: {
          memories: [
            { content: 'Fact one' },
            { content: 'Fact two', metadata: { source: 'test' } },
          ],
        },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.success).toBe(true);
      expect(response.total).toBe(2);
      expect(response.succeeded).toBe(2);
      expect(response.failed).toBe(0);
      expect(response.results).toHaveLength(2);

      expect(mockClient.batchStoreMemories).toHaveBeenCalledWith([
        { content: 'Fact one' },
        { content: 'Fact two', metadata: { source: 'test' } },
      ]);
    });

    it('should reject empty memories array', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_batch_store',
        arguments: { memories: [] },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject memories with empty content', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_batch_store',
        arguments: {
          memories: [{ content: '' }],
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject missing memories field', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_batch_store',
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });
  });

  // ── Context Builder ────────────────────────────────────────────

  describe('Context Builder', () => {
    it('should build context via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_context',
        arguments: { query: 'user preferences' },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.context).toContain('User prefers Python');
      expect(response.memories_used).toBe(2);
      expect(response.total_chars).toBe(55);
    });

    it('should pass all options to client', async () => {
      await mcpClient.callTool({
        name: 'memory_context',
        arguments: {
          query: 'test query',
          limit: 5,
          threshold: 0.7,
          max_tokens: 1000,
        },
      });

      expect(mockClient.buildContext).toHaveBeenCalledWith(
        'test query',
        5,
        0.7,
        1000,
      );
    });

    it('should use defaults when optional params omitted', async () => {
      await mcpClient.callTool({
        name: 'memory_context',
        arguments: { query: 'simple query' },
      });

      expect(mockClient.buildContext).toHaveBeenCalledWith(
        'simple query',
        10,
        0.5,
        undefined,
      );
    });

    it('should reject empty query', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_context',
        arguments: { query: '' },
      });

      expect(result.isError).toBe(true);
    });

    it('should reject missing query', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_context',
        arguments: {},
      });

      expect(result.isError).toBe(true);
    });
  });

  // ── Health Check ─────────────────────────────────────────────────

  describe('Health Check', () => {
    it('should check health via MCP protocol', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_health',
        arguments: {},
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.status).toBe('healthy');
      expect(response.message).toBe('API connection successful');
    });
  });

  // ── Error Handling ───────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should return error for invalid UUID on memory_get', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_get',
        arguments: { id: 'not-a-uuid' },
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.error).toBe('Tool execution failed');
      expect(response.message).toContain('Invalid memory_id');
    });

    it('should return error for invalid UUID on memory_update', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_update',
        arguments: { id: 'bad-uuid', content: 'test' },
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.message).toContain('Invalid memory_id');
    });

    it('should return error for invalid UUID on memory_delete', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_delete',
        arguments: { id: 'invalid' },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid entity type', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_create',
        arguments: { name: 'Test', type: 'invalid_type' },
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.error).toBe('Tool execution failed');
      expect(response.message).toBe('Validation error');
      expect(response.details).toBeDefined();
    });

    it('should return error for empty entity name', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_create',
        arguments: { name: '', type: 'concept' },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for entity name exceeding 200 chars', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_create',
        arguments: { name: 'x'.repeat(201), type: 'concept' },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid UUID on entity_link', async () => {
      const result = await mcpClient.callTool({
        name: 'entity_link',
        arguments: {
          entity_id: 'not-uuid',
          memory_id: TEST_UUID_1,
        },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for invalid UUID on agent_get', async () => {
      const result = await mcpClient.callTool({
        name: 'agent_get',
        arguments: { id: 'invalid' },
      });

      expect(result.isError).toBe(true);
    });

    it('should return error for unknown tool', async () => {
      const result = await mcpClient.callTool({
        name: 'nonexistent_tool',
        arguments: {},
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.message).toContain('Unknown tool');
    });

    it('should return error when API client throws', async () => {
      vi.spyOn(mockClient, 'storeMemory').mockRejectedValueOnce(
        new Error('API request failed: 500 Internal Server Error')
      );

      const result = await mcpClient.callTool({
        name: 'memory_store',
        arguments: { content: 'will fail' },
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.message).toContain('500');
    });

    it('should return error when API returns 404', async () => {
      vi.spyOn(mockClient, 'getMemory').mockRejectedValueOnce(
        new Error('API request failed: 404 Not Found')
      );

      const result = await mcpClient.callTool({
        name: 'memory_get',
        arguments: { id: TEST_UUID_1 },
      });

      expect(result.isError).toBe(true);

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.message).toContain('404');
    });
  });

  // ── Search Edge Cases ────────────────────────────────────────────

  describe('Search Edge Cases', () => {
    it('should handle empty search results', async () => {
      vi.spyOn(mockClient, 'searchMemories').mockResolvedValueOnce([]);

      const result = await mcpClient.callTool({
        name: 'memory_search',
        arguments: { query: 'nothing matches' },
      });

      expect(result.isError).toBeFalsy();

      const response = JSON.parse((result.content[0] as any).text);
      expect(response.memories).toHaveLength(0);
      expect(response.total).toBe(0);
    });

    it('should pass search options to client', async () => {
      await mcpClient.callTool({
        name: 'memory_search',
        arguments: {
          query: 'test',
          include_confidential: true,
          include_archived: true,
          compress: true,
          max_context_tokens: 2000,
        },
      });

      expect(mockClient.searchMemories).toHaveBeenCalledWith(
        'test',
        undefined,
        undefined,
        null,
        true,
        true,
        true,
        2000,
        undefined,
        undefined,
        undefined,
      );
    });

    it('should scope search to specific agent when agent_id provided', async () => {
      await mcpClient.callTool({
        name: 'memory_search',
        arguments: {
          query: 'test',
          agent_id: TEST_UUID_3,
        },
      });

      expect(mockClient.searchMemories).toHaveBeenCalledWith(
        'test',
        undefined,
        undefined,
        TEST_UUID_3,
        false,
        false,
        false,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });
  });

  // ── Response Format ──────────────────────────────────────────────

  describe('Response Format', () => {
    it('should return text content type for all successful responses', async () => {
      const tools = [
        { name: 'memory_store', arguments: { content: 'test' } },
        { name: 'memory_search', arguments: { query: 'test' } },
        { name: 'memory_list', arguments: {} },
        { name: 'memory_get', arguments: { id: TEST_UUID_1 } },
        { name: 'memory_health', arguments: {} },
        { name: 'entity_list', arguments: {} },
        { name: 'agent_list', arguments: {} },
      ];

      for (const tool of tools) {
        const result = await mcpClient.callTool(tool);
        expect(result.content).toHaveLength(1);
        expect((result.content[0] as any).type).toBe('text');

        // Verify the text is valid JSON
        const parsed = JSON.parse((result.content[0] as any).text);
        expect(parsed).toBeDefined();
      }
    });

    it('should return valid JSON in error responses', async () => {
      const result = await mcpClient.callTool({
        name: 'memory_get',
        arguments: { id: 'not-a-uuid' },
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);

      const parsed = JSON.parse((result.content[0] as any).text);
      expect(parsed).toHaveProperty('error');
      expect(parsed).toHaveProperty('message');
    });
  });
});
