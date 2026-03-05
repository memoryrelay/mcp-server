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
 * Agent object from MemoryRelay API
 */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  metadata?: Record<string, string>;
  memory_count?: number;
  created_at: number;
  updated_at: number;
}

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
 * Batch store request item
 */
export interface BatchMemoryItem {
  content: string;
  metadata?: Record<string, string>;
  agent_id?: string;
}

/**
 * Batch store result item
 */
export interface BatchMemoryResult {
  status: 'success' | 'error' | 'skipped';
  memory_id?: string;
  error?: string;
}

/**
 * Batch store response
 */
export interface BatchStoreResponse {
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: BatchMemoryResult[];
}

/**
 * Session object from MemoryRelay API
 */
export interface Session {
  id: string;
  agent_id?: string;
  project?: string;
  status: 'active' | 'ended';
  title?: string;
  summary?: string;
  metadata?: Record<string, string>;
  memory_count?: number;
  started_at: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Session with associated memories
 */
export interface SessionDetail extends Session {
  memories: Memory[];
}

/**
 * Session summary response
 */
export interface SessionSummary {
  session_id: string;
  summary: string;
  memory_count: number;
  generated_at: string;
}

/**
 * Decision status values
 */
export type DecisionStatus = 'active' | 'superseded' | 'reverted' | 'experimental';

/**
 * Decision object from MemoryRelay API
 */
export interface Decision {
  id: string;
  agent_id?: string;
  session_id?: string;
  project_slug?: string;
  title: string;
  rationale: string;
  alternatives?: string;
  status: DecisionStatus;
  superseded_by?: string;
  tags: string[];
  metadata?: Record<string, string>;
  created_at: string;
  updated_at: string;
}

/**
 * Decision check result with similarity score
 */
export interface DecisionCheckResult {
  decision: Decision;
  score: number;
}

/**
 * Project object from MemoryRelay API
 */
export interface Project {
  id: string;
  slug: string;
  name: string;
  description?: string;
  stack?: Record<string, unknown>;
  repo_url?: string;
  metadata?: Record<string, unknown>;
  memory_count?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Pattern object from MemoryRelay API
 */
export interface Pattern {
  id: string;
  title: string;
  description: string;
  scope: string;
  category?: string;
  tags: string[];
  example_code?: string;
  source_project_id?: string;
  source_project_slug?: string;
  metadata?: Record<string, unknown>;
  adoption_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Pattern search result with similarity score
 */
export interface PatternSearchResult {
  pattern: Pattern;
  score: number;
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
