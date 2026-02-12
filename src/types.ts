/**
 * TypeScript type definitions for MemoryRelay MCP server
 */

/**
 * Memory object from MemoryRelay API
 */
export interface Memory {
  id: string;
  content: string;
  metadata?: Record<string, string>;
  created_at: number;
  updated_at?: number;
  agent_id?: string;
}

/**
 * Entity object from MemoryRelay API
 */
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  metadata?: Record<string, string>;
  created_at: number;
}

export type EntityType = 'person' | 'place' | 'organization' | 'project' | 'concept' | 'other';

/**
 * Search result with similarity score
 */
export interface SearchResult {
  memory: Memory;
  score: number;
}

/**
 * Paginated list response
 */
export interface ListResponse<T> {
  data: T[];  // API uses 'data' not 'items'
  has_more: boolean;
  total_count?: number | null;
  next_cursor?: string | null;
}

/**
 * API error response
 */
export interface APIError {
  error: string;
  message: string;
  details?: unknown;
}

/**
 * API client configuration
 */
export interface ClientConfig {
  apiKey: string;
  apiUrl: string;
  agentId: string;
  timeout: number;
}
