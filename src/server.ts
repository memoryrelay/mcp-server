/**
 * MCP Server implementation for MemoryRelay
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { MemoryRelayClient } from './client.js';
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

  constructor(config: ClientConfig) {
    this.client = new MemoryRelayClient(config);
    
    this.server = new Server(
      {
        name: '@memoryrelay/mcp-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.logger.info('MCP server initialized');
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'memory_store',
          description: 'Store a new memory. Use this to save important information, facts, preferences, or context that should be remembered for future conversations.',
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
            },
            required: ['content'],
          },
        },
        {
          name: 'memory_search',
          description: 'Search memories using natural language. Returns the most relevant memories based on semantic similarity to the query.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Natural language search query',
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
          name: 'memory_health',
          description: 'Check API connectivity and health status.',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      this.logger.debug(`Tool called: ${name}`, args);

      try {
        switch (name) {
          case 'memory_store': {
            const memory = await this.client.storeMemory(
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

          case 'memory_search': {
            const results = await this.client.searchMemories(
              args.query as string,
              args.limit as number | undefined,
              args.threshold as number | undefined
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
}
