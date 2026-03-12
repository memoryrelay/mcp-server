/**
 * MCP Server implementation for MemoryRelay
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MemoryRelayClient } from './client.js';
import { getEnabledTools } from './config.js';
import { getLogger } from './logger.js';
import type { ClientConfig } from './types.js';

/**
 * HTML-encode string to prevent XSS
 */
function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate UUID format
 */
const uuidSchema = z.string().uuid();

function validateUuid(id: string, fieldName: string = 'id'): void {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID`);
  }
}

export class MemoryRelayMCPServer {
  private server: Server;
  private client: MemoryRelayClient;
  private logger = getLogger();
  private activeSessionId: string | null = null;
  private enabledTools: Set<string> | null = null;

  constructor(config: ClientConfig, client?: MemoryRelayClient) {
    this.client = client ?? new MemoryRelayClient(config);
    this.enabledTools = getEnabledTools();

    this.server = new Server(
      {
        name: '@memoryrelay/mcp-server',
        version: '0.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
        instructions: [
          'Recommended workflow:',
          '1. Call project_context(project) to load hot-tier memories for context',
          '2. Call session_start(project, goal) to begin tracking your work',
          '3. Call decision_check(project, topic) before making architectural choices',
          '4. Call pattern_search(query) to find established conventions',
          '5. Work on the task, using memory_store for important findings',
          '6. Call session_end(session_id, summary) when done',
        ].join('\n'),
      }
    );

    this.setupHandlers();
    this.logger.info('MCP server initialized');
  }

  /**
   * Check if a tool is enabled by the current tool group configuration.
   */
  private isToolEnabled(name: string): boolean {
    return this.enabledTools === null || this.enabledTools.has(name);
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools (filtered by MEMORYRELAY_TOOLS env var)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const sessionHint = this.activeSessionId
        ? ` Active session: ${this.activeSessionId}.`
        : ' Tip: Call session_start first to track what you are working on.';

      const allTools = [
        {
          name: 'memory_store',
          description: `Store a new memory. Use this to save important information, facts, preferences, or context that should be remembered for future conversations.${sessionHint}`,
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The memory content to store. Be specific and include relevant context.',
              },
              metadata: {
                type: 'object',
                description: 'Optional key-value metadata to attach to the memory',
                additionalProperties: { type: 'string' },
              },
              deduplicate: {
                type: 'boolean',
                description: 'Check for duplicate/near-duplicate content before storing. Returns existing memory if match found.',
                default: false,
              },
              dedup_threshold: {
                type: 'number',
                description: 'Semantic similarity threshold for dedup (0.5-1.0). Only used when deduplicate=true.',
                minimum: 0.5,
                maximum: 1.0,
                default: 0.95,
              },
              project: {
                type: 'string',
                description: 'Project slug to associate the memory with (e.g., "my-api")',
                maxLength: 100,
              },
              importance: {
                type: 'number',
                description: 'Memory importance (0.0-1.0). Defaults to 0.5. Values >= 0.8 promote to hot tier.',
                minimum: 0,
                maximum: 1,
                default: 0.5,
              },
              tier: {
                type: 'string',
                description: 'Memory tier override: "hot" (always in context), "warm" (default), "cold" (archived). Auto-computed from importance if omitted.',
                enum: ['hot', 'warm', 'cold'],
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'memory_search',
          description: 'Search memories using natural language. Returns the most relevant memories based on semantic similarity to the query. Omit agent_id to search across all agents.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query',
              },
              agent_id: {
                type: 'string',
                description: 'Optional agent ID to scope the search. If omitted, searches across all agents.',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (1-50)',
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1)',
                minimum: 0,
                maximum: 1,
                default: 0.5,
              },
              include_confidential: {
                type: 'boolean',
                description: 'Include confidential memories in results (default: false)',
                default: false,
              },
              include_archived: {
                type: 'boolean',
                description: 'Include archived memories in results (default: false)',
                default: false,
              },
              compress: {
                type: 'boolean',
                description: 'Enable context compression on results',
                default: false,
              },
              max_context_tokens: {
                type: 'number',
                description: 'Target total token budget for compressed results',
              },
              project: {
                type: 'string',
                description: 'Filter by project slug. Omit for cross-project search.',
                maxLength: 100,
              },
              tier: {
                type: 'string',
                description: 'Filter by tier: "hot", "warm", or "cold". Omit to search all tiers.',
                enum: ['hot', 'warm', 'cold'],
              },
              min_importance: {
                type: 'number',
                description: 'Minimum importance threshold (0.0-1.0). Only return memories above this.',
                minimum: 0,
                maximum: 1,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'memory_list',
          description: 'List recent memories chronologically. Use to review what has been remembered.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of memories to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              offset: {
                type: 'number',
                description: 'Offset for pagination',
                minimum: 0,
                default: 0,
              },
            },
          },
        },
        {
          name: 'memory_get',
          description: 'Retrieve a specific memory by its ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The memory ID (UUID) to retrieve',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'memory_update',
          description: 'Update the content of an existing memory. Use to correct or expand stored information.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The memory ID (UUID) to update',
              },
              content: {
                type: 'string',
                description: 'The new content to replace the existing memory',
              },
              metadata: {
                type: 'object',
                description: 'Updated metadata (replaces existing)',
                additionalProperties: { type: 'string' },
              },
            },
            required: ['id', 'content'],
          },
        },
        {
          name: 'memory_delete',
          description: 'Permanently delete a memory. Use sparingly - memories are valuable context.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The memory ID (UUID) to delete',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'entity_create',
          description: 'Create a named entity (person, place, organization, project, concept) for the knowledge graph. Entities help organize and connect memories.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 200,
                description: 'Entity name (1-200 characters)',
              },
              type: {
                type: 'string',
                enum: ['person', 'place', 'organization', 'project', 'concept', 'other'],
                description: 'Entity type classification',
              },
              metadata: {
                type: 'object',
                description: 'Optional key-value metadata',
                additionalProperties: { type: 'string' },
              },
            },
            required: ['name', 'type'],
          },
        },
        {
          name: 'entity_link',
          description: 'Link an entity to a memory to establish relationships in the knowledge graph.',
          inputSchema: {
            type: 'object',
            properties: {
              entity_id: {
                type: 'string',
                description: 'Entity UUID',
              },
              memory_id: {
                type: 'string',
                description: 'Memory UUID',
              },
              relationship: {
                type: 'string',
                description: 'Relationship type (e.g., "mentioned_in", "created_by", "relates_to")',
                default: 'mentioned_in',
              },
            },
            required: ['entity_id', 'memory_id'],
          },
        },
        {
          name: 'entity_list',
          description: 'List entities in the knowledge graph with pagination. Entities are people, places, organizations, projects, and concepts extracted from memories.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of entities to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              offset: {
                type: 'number',
                description: 'Offset for pagination',
                minimum: 0,
                default: 0,
              },
            },
          },
        },
        {
          name: 'agent_list',
          description: 'List all agents with their memory counts. Agents are namespaces that isolate memories.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of agents to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
            },
          },
        },
        {
          name: 'agent_create',
          description: 'Create a named agent. Agents are namespaces that isolate memories for different use cases or AI assistants.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Agent name (descriptive, e.g. "iris", "friday", "code-assistant")',
              },
              description: {
                type: 'string',
                description: 'Optional description of the agent\'s purpose',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'agent_get',
          description: 'Get details of a specific agent by ID, including memory count.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'The agent ID (UUID) to retrieve',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'entity_graph',
          description: 'Explore the knowledge graph around an entity. Returns neighboring entities and their relationships up to N hops away. Useful for understanding connections between people, projects, and concepts.',
          inputSchema: {
            type: 'object',
            properties: {
              entity_id: {
                type: 'string',
                description: 'Entity UUID to explore from',
              },
              depth: {
                type: 'number',
                description: 'How many hops to traverse (1 or 2)',
                minimum: 1,
                maximum: 2,
                default: 1,
              },
              max_neighbors: {
                type: 'number',
                description: 'Maximum neighbor entities to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 50,
              },
            },
            required: ['entity_id'],
          },
        },
        {
          name: 'memory_batch_store',
          description: 'Store multiple memories in a single operation. More efficient than calling memory_store repeatedly when saving several related facts or observations.',
          inputSchema: {
            type: 'object',
            properties: {
              memories: {
                type: 'array',
                description: 'Array of memories to store (1-100 items)',
                items: {
                  type: 'object',
                  properties: {
                    content: {
                      type: 'string',
                      description: 'The memory content to store',
                    },
                    metadata: {
                      type: 'object',
                      description: 'Optional key-value metadata',
                      additionalProperties: { type: 'string' },
                    },
                  },
                  required: ['content'],
                },
                minItems: 1,
                maxItems: 100,
              },
            },
            required: ['memories'],
          },
        },
        {
          name: 'memory_context',
          description: 'Build a formatted context string from relevant memories for a given query. Returns ranked memories with similarity scores, ready for use in prompts. More convenient than memory_search when you need a single context block.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query to find relevant memories',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of memories to include (1-50)',
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1)',
                minimum: 0,
                maximum: 1,
                default: 0.5,
              },
              max_tokens: {
                type: 'number',
                description: 'Maximum token budget for the context string. Results are truncated to fit.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'project_register',
          description: 'Register a project (codebase/repository) to scope memories, sessions, and decisions. Projects have a unique slug for ergonomic referencing.',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'URL-safe identifier (lowercase, hyphens allowed, e.g., "my-api")',
                pattern: '^[a-z0-9][a-z0-9-]*$',
                maxLength: 100,
              },
              name: {
                type: 'string',
                description: 'Human-readable project name (e.g., "My API Service")',
                maxLength: 255,
              },
              description: {
                type: 'string',
                description: 'Optional project description',
              },
              stack: {
                type: 'object',
                description: 'Technical stack metadata (e.g., {"languages": ["python"], "frameworks": ["fastapi"]})',
              },
              repo_url: {
                type: 'string',
                description: 'Repository URL (e.g., "https://github.com/org/repo")',
                maxLength: 500,
              },
            },
            required: ['slug', 'name'],
          },
        },
        {
          name: 'project_list',
          description: 'List registered projects. Shows all projects with their memory counts.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of projects to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
            },
          },
        },
        {
          name: 'project_info',
          description: 'Get detailed information about a specific project by its slug, including memory count and stack metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              slug: {
                type: 'string',
                description: 'Project slug to look up',
              },
            },
            required: ['slug'],
          },
        },
        // ── Project Relationship Tools (Issue #186) ──
        {
          name: 'project_add_relationship',
          description: 'Register a relationship between two projects (e.g., depends_on, api_consumer, shares_schema, shares_infra, pattern_source, forked_from).',
          inputSchema: {
            type: 'object',
            properties: {
              from: {
                type: 'string',
                description: 'Source project slug',
              },
              to: {
                type: 'string',
                description: 'Target project slug',
              },
              type: {
                type: 'string',
                description: 'Relationship type (e.g., depends_on, api_consumer, shares_schema)',
              },
              details: {
                type: 'object',
                description: 'Optional relationship metadata',
                additionalProperties: true,
              },
            },
            required: ['from', 'to', 'type'],
          },
        },
        {
          name: 'project_dependencies',
          description: 'What does this project depend on? Returns outgoing depends_on and api_consumer relationships.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug',
              },
            },
            required: ['project'],
          },
        },
        {
          name: 'project_dependents',
          description: 'What depends on this project? Returns incoming depends_on and api_consumer relationships.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug',
              },
            },
            required: ['project'],
          },
        },
        {
          name: 'project_related',
          description: 'All related projects with relationship types and direction indicators.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug',
              },
            },
            required: ['project'],
          },
        },
        {
          name: 'project_impact',
          description: 'Impact analysis: given a change description, which dependent projects might be affected? Searches decisions and memories in downstream projects.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug being changed',
              },
              change_description: {
                type: 'string',
                description: 'Description of the change to analyze (max 5000 chars)',
                maxLength: 5000,
              },
            },
            required: ['project', 'change_description'],
          },
        },
        {
          name: 'project_shared_patterns',
          description: 'What do two projects have in common? Returns patterns adopted by both projects.',
          inputSchema: {
            type: 'object',
            properties: {
              project_a: {
                type: 'string',
                description: 'First project slug',
              },
              project_b: {
                type: 'string',
                description: 'Second project slug',
              },
            },
            required: ['project_a', 'project_b'],
          },
        },
        {
          name: 'memory_health',
          description: 'Check API connectivity and health status.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'session_start',
          description: 'Start a new session to group related memories. Sessions track bounded interaction periods (e.g., a coding session, a conversation). Use session_recall to see what happened in previous sessions.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Session title or goal (e.g., "Fix email queue retry logic")',
                maxLength: 500,
              },
              project: {
                type: 'string',
                description: 'Project label for filtering sessions (e.g., "northrelay")',
                maxLength: 255,
              },
              metadata: {
                type: 'object',
                description: 'Optional metadata',
                additionalProperties: { type: 'string' },
              },
            },
          },
        },
        {
          name: 'session_end',
          description: 'End an active session with an optional summary of what was accomplished.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Session ID (UUID) to end',
              },
              summary: {
                type: 'string',
                description: 'Summary of what was accomplished during the session',
                maxLength: 50000,
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'session_recall',
          description: 'Recall a session by ID, including all memories created during it. Use this to review what happened in a past session.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Session ID (UUID) to recall',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'session_list',
          description: 'List recent sessions, optionally filtered by project or status. Shows session summaries to understand what happened in previous sessions.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of sessions to return (1-100)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              project: {
                type: 'string',
                description: 'Filter by project label',
              },
              status: {
                type: 'string',
                enum: ['active', 'ended'],
                description: 'Filter by session status',
              },
            },
          },
        },
        {
          name: 'decision_record',
          description: 'Record an architectural decision with rationale. Use to log important technical choices, design decisions, or policy changes so they can be referenced later.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Decision title (e.g., "Use PostgreSQL instead of MongoDB")',
                maxLength: 500,
              },
              rationale: {
                type: 'string',
                description: 'Why this decision was made. Include context, constraints, and reasoning.',
                maxLength: 50000,
              },
              alternatives: {
                type: 'string',
                description: 'Alternatives that were considered and why they were rejected',
              },
              project: {
                type: 'string',
                description: 'Project slug to scope the decision to',
                maxLength: 100,
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for categorization (e.g., ["architecture", "database"])',
              },
              status: {
                type: 'string',
                enum: ['active', 'experimental'],
                description: 'Decision status (default: active)',
              },
            },
            required: ['title', 'rationale'],
          },
        },
        {
          name: 'decision_list',
          description: 'List recorded decisions, optionally filtered by project, status, or tags.',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum results (1-100, default 20)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              project: {
                type: 'string',
                description: 'Filter by project slug',
              },
              status: {
                type: 'string',
                enum: ['active', 'superseded', 'reverted', 'experimental'],
                description: 'Filter by decision status',
              },
              tags: {
                type: 'string',
                description: 'Comma-separated tags to filter by',
              },
            },
          },
        },
        {
          name: 'decision_supersede',
          description: 'Supersede an existing decision with a new one. Marks the old decision as superseded and creates a new active decision.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'ID (UUID) of the decision to supersede',
              },
              title: {
                type: 'string',
                description: 'Title of the new decision',
              },
              rationale: {
                type: 'string',
                description: 'Rationale for the new decision',
              },
              alternatives: {
                type: 'string',
                description: 'Alternatives considered',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for the new decision (inherits from old if omitted)',
              },
            },
            required: ['id', 'title', 'rationale'],
          },
        },
        {
          name: 'decision_check',
          description: 'Check if there are existing decisions about a topic using semantic search. Use this before making a new decision to see if the topic has already been addressed.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query describing the decision topic to check',
              },
              project: {
                type: 'string',
                description: 'Filter by project slug',
              },
              limit: {
                type: 'number',
                description: 'Maximum results (1-20, default 5)',
                minimum: 1,
                maximum: 20,
                default: 5,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1, default 0.3)',
                minimum: 0,
                maximum: 1,
                default: 0.3,
              },
              include_superseded: {
                type: 'boolean',
                description: 'Include superseded decisions in results (default: false)',
                default: false,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'pattern_create',
          description: 'Create a reusable development pattern or convention. Use to document patterns like "always use Zod for validation" or "error responses follow RFC 7807" so they can be discovered and adopted across projects.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'Pattern title (e.g., "Zod validation at API boundaries")',
                maxLength: 500,
              },
              description: {
                type: 'string',
                description: 'Full description with context, rationale, and when to apply this pattern',
                maxLength: 50000,
              },
              category: {
                type: 'string',
                description: 'Category (e.g., "validation", "error-handling", "auth", "testing")',
                maxLength: 100,
              },
              example_code: {
                type: 'string',
                description: 'Code snippet demonstrating the pattern',
              },
              scope: {
                type: 'string',
                enum: ['global', 'project'],
                description: 'Scope: global (all projects) or project (specific projects). Default: global',
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Tags for categorization',
              },
              source_project: {
                type: 'string',
                description: 'Slug of the project where this pattern was first established',
              },
            },
            required: ['title', 'description'],
          },
        },
        {
          name: 'pattern_search',
          description: 'Search for development patterns using semantic similarity. When working on a project, shows both global patterns and patterns adopted by that project.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language query describing the pattern to find (e.g., "validation", "error handling")',
              },
              category: {
                type: 'string',
                description: 'Filter by category',
              },
              project: {
                type: 'string',
                description: 'Project context — shows global patterns plus patterns adopted by this project',
              },
              limit: {
                type: 'number',
                description: 'Maximum results (1-50, default 10)',
                minimum: 1,
                maximum: 50,
                default: 10,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1, default 0.3)',
                minimum: 0,
                maximum: 1,
                default: 0.3,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'pattern_adopt',
          description: 'Mark a pattern as adopted by a project. This links the pattern to the project so it shows up in project-scoped searches.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Pattern ID (UUID) to adopt',
              },
              project: {
                type: 'string',
                description: 'Project slug to adopt this pattern for',
              },
            },
            required: ['id', 'project'],
          },
        },
        {
          name: 'pattern_suggest',
          description: 'Suggest relevant patterns for a project based on what similar projects have adopted. Returns patterns not yet adopted by the target project, ranked by popularity.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug to get suggestions for',
              },
              limit: {
                type: 'number',
                description: 'Maximum suggestions (1-50, default 10)',
                minimum: 1,
                maximum: 50,
                default: 10,
              },
            },
            required: ['project'],
          },
        },
        {
          name: 'project_context',
          description: 'Get full project context for LLM consumption. Returns hot-tier memories, active decisions, adopted patterns, and a pre-formatted markdown context string.',
          inputSchema: {
            type: 'object',
            properties: {
              project: {
                type: 'string',
                description: 'Project slug to get context for',
              },
            },
            required: ['project'],
          },
        },
        {
          name: 'memory_promote',
          description: 'Update a memory\'s importance and tier. Use to promote critical memories to hot tier (always in context) or demote them to cold tier (archived).',
          inputSchema: {
            type: 'object',
            properties: {
              memory_id: {
                type: 'string',
                description: 'Memory ID (UUID) to promote/demote',
              },
              importance: {
                type: 'number',
                description: 'New importance value (0.0-1.0). Values >= 0.8 promote to hot tier.',
                minimum: 0,
                maximum: 1,
              },
              tier: {
                type: 'string',
                description: 'Optional tier override: "hot", "warm", or "cold". Auto-computed from importance if omitted.',
                enum: ['hot', 'warm', 'cold'],
              },
            },
            required: ['memory_id', 'importance'],
          },
        },
        // ── V2 Async API Tools (60-600x faster) ──
        {
          name: 'memory_store_async',
          description: 'Store a memory asynchronously using V2 API. Returns immediately (<50ms) with 202 Accepted and a job ID. Background workers generate the embedding. Use memory_status to poll for completion. Prefer this over memory_store for high-throughput or latency-sensitive applications.',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'The memory content to store. Be specific and include relevant context.',
              },
              metadata: {
                type: 'object',
                description: 'Optional key-value metadata to attach to the memory',
                additionalProperties: { type: 'string' },
              },
              project: {
                type: 'string',
                description: 'Project slug to associate the memory with',
                maxLength: 100,
              },
              importance: {
                type: 'number',
                description: 'Memory importance (0.0-1.0). Values >= 0.8 promote to hot tier.',
                minimum: 0,
                maximum: 1,
              },
              tier: {
                type: 'string',
                description: 'Memory tier override: "hot", "warm", or "cold"',
                enum: ['hot', 'warm', 'cold'],
              },
              webhook_url: {
                type: 'string',
                description: 'Optional webhook URL to receive completion notification',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'memory_status',
          description: 'Check the processing status of a memory created via memory_store_async. Poll this endpoint to determine when embedding generation is complete. Status values: pending (waiting for worker), processing (generating embedding), ready (searchable), failed (error occurred).',
          inputSchema: {
            type: 'object',
            properties: {
              memory_id: {
                type: 'string',
                description: 'Memory ID (UUID) to check status for',
              },
            },
            required: ['memory_id'],
          },
        },
        {
          name: 'context_build',
          description: 'Build a ranked context bundle from memories using V2 API with optional AI summarization. Searches for relevant memories, ranks them by composite score, and optionally generates an AI summary. Useful for building token-efficient context windows for LLM prompts. Supports custom LLM endpoints (Ollama, llama.cpp, vLLM, etc.).',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Context query describing what information is needed',
              },
              max_memories: {
                type: 'number',
                description: 'Maximum number of memories to include (1-100, default 20)',
                minimum: 1,
                maximum: 100,
                default: 20,
              },
              max_tokens: {
                type: 'number',
                description: 'Token budget for context window (enforces truncation)',
                minimum: 100,
                maximum: 128000,
              },
              ai_enhanced: {
                type: 'boolean',
                description: 'Enable AI summarization of context (uses LLM)',
                default: false,
              },
              search_mode: {
                type: 'string',
                description: 'Search mode: "semantic", "hybrid", or "keyword"',
                enum: ['semantic', 'hybrid', 'keyword'],
                default: 'hybrid',
              },
              llm_api_url: {
                type: 'string',
                description: 'Custom LLM API URL for summarization (OpenAI-compatible). Use for local LLMs: Ollama (http://localhost:11434/v1), llama.cpp, vLLM, LM Studio, etc.',
              },
              llm_model: {
                type: 'string',
                description: 'Model name for custom LLM (e.g., "mistral", "llama3", "gemma")',
              },
              exclude_memory_ids: {
                type: 'array',
                items: { type: 'string' },
                description: 'Memory IDs to exclude (for multi-turn context building)',
              },
            },
            required: ['query'],
          },
        },
        // ── Tool Name Aliases (backward compatibility with OpenClaw plugin) ──
        {
          name: 'memory_forget',
          description: 'Delete a memory by ID, or search by query to find candidates. Alias for memory_delete. Provide memoryId for direct deletion, or query to search first.',
          inputSchema: {
            type: 'object',
            properties: {
              memoryId: {
                type: 'string',
                description: 'Memory ID to delete',
              },
              query: {
                type: 'string',
                description: 'Search query to find memory',
              },
            },
          },
        },
        {
          name: 'memory_recall',
          description: 'Search memories using natural language. Alias for memory_search with default project scoping. Returns the most relevant memories based on semantic similarity.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum results (1-50). Default 5.',
                minimum: 1,
                maximum: 50,
                default: 5,
              },
              threshold: {
                type: 'number',
                description: 'Minimum similarity threshold (0-1). Default 0.3.',
                minimum: 0,
                maximum: 1,
                default: 0.3,
              },
              project: {
                type: 'string',
                description: 'Filter by project slug',
              },
              max_tokens: {
                type: 'number',
                description: 'Token budget for context window',
              },
            },
            required: ['query'],
          },
        },
      ];

      return {
        tools: allTools.filter(t => this.isToolEnabled(t.name)),
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args = {} } = request.params;

      this.logger.debug(`Tool called: ${name}`, args);

      try {
        switch (name) {
          case 'memory_store': {
            const memory = await this.client.storeMemory(
              args.content as string,
              args.metadata as Record<string, string> | undefined,
              args.deduplicate as boolean | undefined,
              args.dedup_threshold as number | undefined,
              args.project as string | undefined,
              args.importance as number | undefined,
              args.tier as string | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(memory, null, 2),
                },
              ],
            };
          }

          case 'memory_search': {
            // If agent_id is provided, use it; otherwise pass null for cross-agent search
            const searchAgentId = args.agent_id != null
              ? (args.agent_id as string)
              : null;
            const results = await this.client.searchMemories(
              args.query as string,
              args.limit as number | undefined,
              args.threshold as number | undefined,
              searchAgentId,
              args.include_confidential as boolean | undefined ?? false,
              args.include_archived as boolean | undefined ?? false,
              args.compress as boolean | undefined ?? false,
              args.max_context_tokens as number | undefined,
              args.project as string | undefined,
              args.tier as string | undefined,
              args.min_importance as number | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { memories: results, total: results.length },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'memory_list': {
            const response = await this.client.listMemories(
              args.limit as number | undefined,
              args.offset as number | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'memory_get': {
            const id = args.id as string;
            validateUuid(id, 'memory_id');
            
            const memory = await this.client.getMemory(id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(memory, null, 2),
                },
              ],
            };
          }

          case 'memory_update': {
            const id = args.id as string;
            validateUuid(id, 'memory_id');
            
            const memory = await this.client.updateMemory(
              id,
              args.content as string,
              args.metadata as Record<string, string> | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(memory, null, 2),
                },
              ],
            };
          }

          case 'memory_delete': {
            const id = args.id as string;
            validateUuid(id, 'memory_id');
            
            await this.client.deleteMemory(id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    { success: true, message: 'Memory deleted successfully' },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'entity_create': {
            // Validate input schema
            const entitySchema = z.object({
              name: z.string().min(1).max(200),
              type: z.enum(['person', 'place', 'organization', 'project', 'concept', 'other']),
              metadata: z.record(z.string()).optional(),
            });

            const validatedInput = entitySchema.parse(args);
            
            // Sanitize name to prevent XSS
            const sanitizedName = sanitizeHtml(validatedInput.name);
            
            const entity = await this.client.createEntity(
              sanitizedName,
              validatedInput.type,
              validatedInput.metadata
            );
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(entity, null, 2),
                },
              ],
            };
          }

          case 'entity_link': {
            // Validate input schema
            const linkSchema = z.object({
              entity_id: z.string().uuid(),
              memory_id: z.string().uuid(),
              relationship: z.string().default('mentioned_in'),
            });

            const validatedInput = linkSchema.parse(args);
            
            await this.client.linkEntity(
              validatedInput.entity_id,
              validatedInput.memory_id,
              validatedInput.relationship
            );
            
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      message: 'Entity linked to memory successfully',
                      entity_id: validatedInput.entity_id,
                      memory_id: validatedInput.memory_id,
                      relationship: validatedInput.relationship,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'entity_list': {
            const response = await this.client.listEntities(
              args.limit as number | undefined,
              args.offset as number | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'agent_list': {
            const response = await this.client.listAgents(
              args.limit as number | undefined
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'agent_create': {
            const createSchema = z.object({
              name: z.string().min(1).max(255),
              description: z.string().max(1000).optional(),
            });

            const validatedInput = createSchema.parse(args);
            const sanitizedName = sanitizeHtml(validatedInput.name);

            const agent = await this.client.createAgent(
              sanitizedName,
              validatedInput.description
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(agent, null, 2),
                },
              ],
            };
          }

          case 'agent_get': {
            const id = args.id as string;
            validateUuid(id, 'agent_id');

            const agent = await this.client.getAgent(id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(agent, null, 2),
                },
              ],
            };
          }

          case 'entity_graph': {
            const graphSchema = z.object({
              entity_id: z.string().uuid(),
              depth: z.number().min(1).max(2).default(1),
              max_neighbors: z.number().min(1).max(100).default(50),
            });

            const validatedInput = graphSchema.parse(args);
            const result = await this.client.getEntityNeighborhood(
              validatedInput.entity_id,
              validatedInput.depth,
              validatedInput.max_neighbors
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'memory_batch_store': {
            const batchSchema = z.object({
              memories: z.array(z.object({
                content: z.string().min(1),
                metadata: z.record(z.string()).optional(),
              })).min(1).max(100),
            });

            const validatedInput = batchSchema.parse(args);
            const result = await this.client.batchStoreMemories(validatedInput.memories);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'memory_context': {
            const contextSchema = z.object({
              query: z.string().min(1),
              limit: z.number().min(1).max(50).default(10),
              threshold: z.number().min(0).max(1).default(0.5),
              max_tokens: z.number().positive().optional(),
            });

            const validatedInput = contextSchema.parse(args);
            const result = await this.client.buildContext(
              validatedInput.query,
              validatedInput.limit,
              validatedInput.threshold,
              validatedInput.max_tokens
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'project_register': {
            const projectSchema = z.object({
              slug: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),
              name: z.string().min(1).max(255),
              description: z.string().optional(),
              stack: z.record(z.unknown()).optional(),
              repo_url: z.string().max(500).optional(),
            });

            const validatedInput = projectSchema.parse(args);
            const project = await this.client.createProject(
              validatedInput.slug,
              validatedInput.name,
              validatedInput.description,
              validatedInput.stack,
              validatedInput.repo_url,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
            };
          }

          case 'project_list': {
            const response = await this.client.listProjects(
              args.limit as number | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'project_info': {
            const slug = args.slug as string;
            if (!slug) {
              throw new Error('Project slug is required');
            }
            const project = await this.client.getProject(slug);
            return {
              content: [{ type: 'text', text: JSON.stringify(project, null, 2) }],
            };
          }

          // ── Project Relationship Handlers (Issue #186) ──

          case 'project_add_relationship': {
            const relSchema = z.object({
              from: z.string().min(1),
              to: z.string().min(1),
              type: z.string().min(1).max(100),
              details: z.record(z.unknown()).optional(),
            });
            const relArgs = relSchema.parse(args);
            const relationship = await this.client.addProjectRelationship(
              relArgs.from,
              relArgs.to,
              relArgs.type,
              relArgs.details as Record<string, unknown> | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(relationship, null, 2) }],
            };
          }

          case 'project_dependencies': {
            const depSlug = args.project as string;
            if (!depSlug) throw new Error('Project slug is required');
            const deps = await this.client.getProjectDependencies(depSlug);
            return {
              content: [{ type: 'text', text: JSON.stringify(deps, null, 2) }],
            };
          }

          case 'project_dependents': {
            const deptSlug = args.project as string;
            if (!deptSlug) throw new Error('Project slug is required');
            const dependents = await this.client.getProjectDependents(deptSlug);
            return {
              content: [{ type: 'text', text: JSON.stringify(dependents, null, 2) }],
            };
          }

          case 'project_related': {
            const relatedSlug = args.project as string;
            if (!relatedSlug) throw new Error('Project slug is required');
            const related = await this.client.getProjectRelated(relatedSlug);
            return {
              content: [{ type: 'text', text: JSON.stringify(related, null, 2) }],
            };
          }

          case 'project_impact': {
            const impactSchema = z.object({
              project: z.string().min(1),
              change_description: z.string().min(1).max(5000),
            });
            const impactArgs = impactSchema.parse(args);
            const impact = await this.client.projectImpactAnalysis(
              impactArgs.project,
              impactArgs.change_description,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(impact, null, 2) }],
            };
          }

          case 'project_shared_patterns': {
            const spSchema = z.object({
              project_a: z.string().min(1),
              project_b: z.string().min(1),
            });
            const spArgs = spSchema.parse(args);
            const shared = await this.client.getSharedPatterns(
              spArgs.project_a,
              spArgs.project_b,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(shared, null, 2) }],
            };
          }

          case 'memory_health': {
            const health = await this.client.healthCheck();
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(health, null, 2),
                },
              ],
            };
          }

          case 'session_start': {
            const session = await this.client.startSession(
              args.title as string | undefined,
              args.project as string | undefined,
              args.metadata as Record<string, string> | undefined,
            );
            // Track active session for session-aware tool descriptions
            this.activeSessionId = (session as unknown as Record<string, unknown>).id as string ?? null;
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(session, null, 2),
                },
              ],
            };
          }

          case 'session_end': {
            const id = args.id as string;
            validateUuid(id, 'session_id');
            const session = await this.client.endSession(
              id,
              args.summary as string | undefined,
            );
            // Clear active session tracking
            if (this.activeSessionId === id) {
              this.activeSessionId = null;
            }
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(session, null, 2),
                },
              ],
            };
          }

          case 'session_recall': {
            const id = args.id as string;
            validateUuid(id, 'session_id');
            const session = await this.client.getSession(id);
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(session, null, 2),
                },
              ],
            };
          }

          case 'session_list': {
            const response = await this.client.listSessions(
              args.limit as number | undefined,
              undefined,
              args.project as string | undefined,
              args.status as string | undefined,
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response, null, 2),
                },
              ],
            };
          }

          case 'decision_record': {
            const decision = await this.client.recordDecision(
              args.title as string,
              args.rationale as string,
              args.alternatives as string | undefined,
              args.project as string | undefined,
              args.tags as string[] | undefined,
              args.status as string | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(decision, null, 2) }],
            };
          }

          case 'decision_list': {
            const response = await this.client.listDecisions(
              args.limit as number | undefined,
              args.project as string | undefined,
              args.status as string | undefined,
              args.tags as string | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'decision_supersede': {
            const id = args.id as string;
            validateUuid(id, 'decision_id');
            const decision = await this.client.supersedeDecision(
              id,
              args.title as string,
              args.rationale as string,
              args.alternatives as string | undefined,
              args.tags as string[] | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(decision, null, 2) }],
            };
          }

          case 'decision_check': {
            const response = await this.client.checkDecisions(
              args.query as string,
              args.project as string | undefined,
              args.limit as number | undefined,
              args.threshold as number | undefined,
              (args.include_superseded as boolean | undefined) ?? false,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'pattern_create': {
            const patternSchema = z.object({
              title: z.string().min(1).max(500),
              description: z.string().min(1).max(50000),
              category: z.string().max(100).optional(),
              example_code: z.string().optional(),
              scope: z.enum(['global', 'project']).optional(),
              tags: z.array(z.string()).max(20).optional(),
              source_project: z.string().max(100).optional(),
            });

            const validatedInput = patternSchema.parse(args);
            const pattern = await this.client.createPattern(
              validatedInput.title,
              validatedInput.description,
              validatedInput.category,
              validatedInput.example_code,
              validatedInput.scope,
              validatedInput.tags,
              validatedInput.source_project,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(pattern, null, 2) }],
            };
          }

          case 'pattern_search': {
            const response = await this.client.searchPatterns(
              args.query as string,
              args.category as string | undefined,
              args.project as string | undefined,
              args.limit as number | undefined,
              args.threshold as number | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'pattern_adopt': {
            const id = args.id as string;
            validateUuid(id, 'pattern_id');
            const pattern = await this.client.adoptPattern(
              id,
              args.project as string,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(pattern, null, 2) }],
            };
          }

          case 'pattern_suggest': {
            const response = await this.client.suggestPatterns(
              args.project as string,
              args.limit as number | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'project_context': {
            const context = await this.client.getProjectContext(
              args.project as string,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(context, null, 2) }],
            };
          }

          case 'memory_promote': {
            const id = args.memory_id as string;
            validateUuid(id, 'memory_id');
            const updated = await this.client.promoteMemory(
              id,
              args.importance as number,
              args.tier as string | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
            };
          }

          // ── V2 Async API Tool Handlers ──

          case 'memory_store_async': {
            const response = await this.client.storeMemoryAsync(
              args.content as string,
              args.metadata as Record<string, string> | undefined,
              args.project as string | undefined,
              args.importance as number | undefined,
              args.tier as string | undefined,
              args.webhook_url as string | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
            };
          }

          case 'memory_status': {
            const id = args.memory_id as string;
            validateUuid(id, 'memory_id');
            const status = await this.client.getMemoryStatus(id);
            return {
              content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
            };
          }

          case 'context_build': {
            const result = await this.client.buildContextV2(
              args.query as string,
              {
                agentId: args.agent_id as string | null | undefined,
                maxMemories: args.max_memories as number | undefined,
                maxTokens: args.max_tokens as number | undefined,
                aiEnhanced: args.ai_enhanced as boolean | undefined,
                rankingVersion: args.ranking_version as string | undefined,
                searchMode: args.search_mode as 'semantic' | 'hybrid' | 'keyword' | undefined,
                llmApiUrl: args.llm_api_url as string | undefined,
                llmModel: args.llm_model as string | undefined,
                excludeMemoryIds: args.exclude_memory_ids as string[] | undefined,
              }
            );
            return {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
          }

          // ── Tool Name Aliases (backward compatibility) ──

          case 'memory_forget': {
            // Alias for memory_delete
            const id = args.memoryId as string | undefined;
            const query = args.query as string | undefined;
            
            if (id) {
              await this.client.deleteMemory(id);
              return {
                content: [{ type: 'text', text: `Memory ${id.slice(0, 8)}... deleted.` }],
              };
            } else if (query) {
              // Search and auto-delete if high confidence match
              const results = await this.client.searchMemories(query, 1, 0.9);
              if (results.length === 1) {
                await this.client.deleteMemory(results[0].memory.id);
                return {
                  content: [{ type: 'text', text: `Memory ${results[0].memory.id.slice(0, 8)}... deleted (matched query).` }],
                };
              }
              return {
                content: [{ type: 'text', text: `Found ${results.length} matches. Provide memoryId to delete.` }],
              };
            }
            throw new Error('memoryId or query is required');
          }

          case 'memory_recall': {
            // Alias for memory_search with default agent_id from config
            const results = await this.client.searchMemories(
              args.query as string,
              (args.limit as number) ?? 5,
              (args.threshold as number) ?? 0.3,
              undefined, // use default agent
              false,
              false,
              false,
              args.max_tokens as number | undefined,
              args.project as string | undefined,
            );
            return {
              content: [{ type: 'text', text: JSON.stringify({ memories: results, total: results.length }, null, 2) }],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        let errorMessage = 'Unknown error';
        let errorDetails: unknown = undefined;

        if (error instanceof z.ZodError) {
          errorMessage = 'Validation error';
          errorDetails = error.errors;
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }

        this.logger.error(`Tool execution failed: ${name}`, {
          error: errorMessage,
          details: errorDetails,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  error: 'Tool execution failed',
                  message: errorMessage,
                  details: errorDetails,
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server with STDIO transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    this.logger.info('MCP server started on STDIO');
  }

  /**
   * Connect the MCP server to a custom transport (for testing)
   */
  async connectTransport(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Close the MCP server connection
   */
  async close(): Promise<void> {
    await this.server.close();
  }
}
