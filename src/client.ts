/**
 * MemoryRelay API client with retry logic and error handling
 */

import type {
  Memory,
  Entity,
  SearchResult,
  ListResponse,
  ClientConfig,
  EntityType,
} from './types.js';
import { getLogger } from './logger.js';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_CONTENT_SIZE = 50 * 1024; // 50KB

/**
 * Exponential backoff retry wrapper
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry on certain errors
      if (
        lastError.message.includes('401') ||
        lastError.message.includes('403') ||
        lastError.message.includes('404') ||
        lastError.message.includes('400')
      ) {
        throw lastError;
      }
      
      // On last attempt, throw the error
      if (attempt === retries) {
        throw lastError;
      }
      
      // Exponential backoff with jitter
      const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
      const jitter = Math.random() * 0.3 * delay;
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  throw lastError || new Error('Retry failed');
}

/**
 * Mask API key in error messages for security
 */
function maskApiKey(message: string, apiKey: string): string {
  if (!apiKey) return message;
  const maskedKey = apiKey.substring(0, 8) + '***';
  return message.replace(new RegExp(apiKey, 'g'), maskedKey);
}

export class MemoryRelayClient {
  private config: ClientConfig;
  private logger = getLogger();

  constructor(config: ClientConfig) {
    this.config = config;
    this.logger.info('MemoryRelay client initialized', {
      apiUrl: config.apiUrl,
      agentId: config.agentId,
    });
  }

  /**
   * Make authenticated HTTP request to MemoryRelay API with retry logic
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return withRetry(async () => {
      const url = `${this.config.apiUrl}${path}`;
      
      this.logger.debug(`API request: ${method} ${path}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout);

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'User-Agent': '@memoryrelay/mcp-server',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          // Handle rate limiting with retry
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
            this.logger.warn(`Rate limited, waiting ${waitMs}ms`);
            await new Promise(resolve => setTimeout(resolve, waitMs));
            throw new Error(`Rate limited: 429 - Retry after ${waitMs}ms`);
          }

          const errorData = await response.json().catch(() => ({}));
          const errorMsg = `API request failed: ${response.status} ${response.statusText}` +
            (errorData.message ? ` - ${errorData.message}` : '');
          
          // Mask API key in error message
          throw new Error(maskApiKey(errorMsg, this.config.apiKey));
        }

        const data = await response.json();
        this.logger.debug(`API response: ${method} ${path}`, { status: response.status });
        
        return data as T;
      } catch (error) {
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            throw new Error(`Request timeout after ${this.config.timeout}ms`);
          }
          // Mask API key in all error messages
          error.message = maskApiKey(error.message, this.config.apiKey);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    });
  }

  /**
   * Validate content size
   */
  private validateContentSize(content: string): void {
    if (content.length > MAX_CONTENT_SIZE) {
      throw new Error(`Content exceeds maximum size of ${MAX_CONTENT_SIZE} bytes`);
    }
  }

  /**
   * Store a new memory
   */
  async storeMemory(content: string, metadata?: Record<string, string>): Promise<Memory> {
    this.validateContentSize(content);
    
    return this.request<Memory>('POST', '/v1/memories/memories', {
      content,
      metadata,
      agent_id: this.config.agentId,
    });
  }

  /**
   * Search memories using semantic search
   */
  async searchMemories(
    query: string,
    limit: number = 10,
    threshold: number = 0.5
  ): Promise<SearchResult[]> {
    this.validateContentSize(query);
    
    const response = await this.request<{ data: SearchResult[] }>(
      'POST',
      '/v1/memories/memories/search',
      { query, limit, threshold, agent_id: this.config.agentId }
    );
    return response.data;
  }

  /**
   * List recent memories with pagination
   */
  async listMemories(limit: number = 20, offset: number = 0): Promise<ListResponse<Memory>> {
    return this.request<ListResponse<Memory>>(
      'GET',
      `/v1/memories/memories?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory> {
    return this.request<Memory>('GET', `/v1/memories/memories/${id}`);
  }

  /**
   * Update an existing memory
   */
  async updateMemory(
    id: string,
    content: string,
    metadata?: Record<string, string>
  ): Promise<Memory> {
    this.validateContentSize(content);
    
    return this.request<Memory>('PATCH', `/v1/memories/memories/${id}`, {
      content,
      metadata,
    });
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/memories/memories/${id}`);
  }

  /**
   * Create a named entity
   */
  async createEntity(
    name: string,
    type: EntityType,
    metadata?: Record<string, string>
  ): Promise<Entity> {
    this.validateContentSize(name);
    
    return this.request<Entity>('POST', '/v1/entities', {
      name,
      type,
      metadata,
    });
  }

  /**
   * Link an entity to a memory
   */
  async linkEntity(
    entityId: string,
    memoryId: string,
    relationship: string = 'mentioned_in'
  ): Promise<void> {
    await this.request<void>('POST', '/v1/entities/links', {
      entity_id: entityId,
      memory_id: memoryId,
      relationship,
    });
  }

  /**
   * Get an entity by ID
   */
  async getEntity(id: string): Promise<Entity> {
    return this.request<Entity>('GET', `/v1/entities/${id}`);
  }

  /**
   * List entities with pagination
   */
  async listEntities(limit: number = 20, offset: number = 0): Promise<ListResponse<Entity>> {
    return this.request<ListResponse<Entity>>(
      'GET',
      `/v1/entities?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/entities/${id}`);
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      // Simple GET request to check API is reachable
      await this.request<{ status: string }>('GET', '/v1/health');
      return {
        status: 'healthy',
        message: 'API connection successful',
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'unhealthy',
        message: `API connection failed: ${errorMsg}`,
      };
    }
  }
}
