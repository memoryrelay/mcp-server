/**
 * MemoryRelay API client with retry logic and error handling
 */

import type {
  Memory,
  Entity,
  Agent,
  Session,
  SessionDetail,
  Decision,
  DecisionCheckResult,
  Project,
  Pattern,
  PatternSearchResult,
  SearchResult,
  ListResponse,
  ClientConfig,
  EntityType,
  BatchMemoryItem,
  BatchStoreResponse,
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

          const errorData = await response.json().catch(() => ({})) as { message?: string };
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
            throw new Error(`Request timeout after ${this.config.timeout}ms`, { cause: error });
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
  async storeMemory(
    content: string,
    metadata?: Record<string, string>,
    deduplicate?: boolean,
    dedupThreshold?: number,
    project?: string,
    importance?: number,
    tier?: string
  ): Promise<Memory> {
    this.validateContentSize(content);

    const body: Record<string, unknown> = {
      content,
      metadata,
      agent_id: this.config.agentId,
    };
    if (deduplicate) {
      body.deduplicate = true;
    }
    if (dedupThreshold !== undefined) {
      body.dedup_threshold = dedupThreshold;
    }
    if (project) {
      body.project = project;
    }
    if (importance !== undefined) {
      body.importance = importance;
    }
    if (tier) {
      body.tier = tier;
    }

    return this.request<Memory>('POST', '/v1/memories', body);
  }

  /**
   * Search memories using semantic search
   * @param agentId - Optional agent ID override. If omitted, uses config agentId. Pass null for cross-agent search.
   * @param includeConfidential - Include confidential memories in results
   * @param includeArchived - Include archived memories in results
   * @param project - Optional project slug to filter by
   */
  async searchMemories(
    query: string,
    limit: number = 10,
    threshold: number = 0.5,
    agentId?: string | null,
    includeConfidential: boolean = false,
    includeArchived: boolean = false,
    compress: boolean = false,
    maxContextTokens?: number,
    project?: string,
    tier?: string,
    minImportance?: number
  ): Promise<SearchResult[]> {
    this.validateContentSize(query);

    // If agentId is explicitly null, omit it (cross-agent search).
    // If agentId is undefined, use the default from config.
    const effectiveAgentId = agentId === null ? undefined : (agentId ?? this.config.agentId);

    const body: Record<string, unknown> = { query, limit, threshold };
    if (effectiveAgentId) {
      body.agent_id = effectiveAgentId;
    }
    if (includeConfidential) {
      body.include_confidential = true;
    }
    if (includeArchived) {
      body.include_archived = true;
    }
    if (compress) {
      body.compress = true;
    }
    if (maxContextTokens !== undefined) {
      body.max_context_tokens = maxContextTokens;
    }
    if (project) {
      body.project = project;
    }
    if (tier) {
      body.tier = tier;
    }
    if (minImportance !== undefined) {
      body.min_importance = minImportance;
    }

    const response = await this.request<{ data: SearchResult[] }>(
      'POST',
      '/v1/memories/search',
      body
    );
    return response.data;
  }

  /**
   * List recent memories with pagination
   */
  async listMemories(limit: number = 20, offset: number = 0): Promise<ListResponse<Memory>> {
    return this.request<ListResponse<Memory>>(
      'GET',
      `/v1/memories?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Get a specific memory by ID
   */
  async getMemory(id: string): Promise<Memory> {
    return this.request<Memory>('GET', `/v1/memories/${id}`);
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
    
    return this.request<Memory>('PATCH', `/v1/memories/${id}`, {
      content,
      metadata,
    });
  }

  /**
   * Delete a memory
   */
  async deleteMemory(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/memories/${id}`);
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
   * Get entity neighborhood (ego-centric subgraph).
   * Returns the entity's 1-hop or 2-hop neighbors and relationships.
   */
  async getEntityNeighborhood(
    entityId: string,
    depth: number = 1,
    maxNeighbors: number = 50
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/entities/${entityId}/neighborhood?depth=${depth}&max_neighbors=${maxNeighbors}`
    );
  }

  /**
   * Delete an entity
   */
  async deleteEntity(id: string): Promise<void> {
    await this.request<void>('DELETE', `/v1/entities/${id}`);
  }

  /**
   * List agents with pagination
   */
  async listAgents(limit: number = 20, offset: number = 0): Promise<ListResponse<Agent>> {
    return this.request<ListResponse<Agent>>(
      'GET',
      `/v1/agents?limit=${limit}&offset=${offset}`
    );
  }

  /**
   * Create a new agent
   */
  async createAgent(
    name: string,
    description?: string,
    metadata?: Record<string, string>
  ): Promise<Agent> {
    const body: Record<string, unknown> = { name };
    if (description) body.description = description;
    if (metadata) body.metadata = metadata;

    return this.request<Agent>('POST', '/v1/agents', body);
  }

  /**
   * Get an agent by ID
   */
  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>('GET', `/v1/agents/${id}`);
  }

  /**
   * Batch store multiple memories in a single API call.
   * Uses the /v1/memories/batch endpoint.
   */
  async batchStoreMemories(
    items: BatchMemoryItem[]
  ): Promise<BatchStoreResponse> {
    if (items.length === 0) {
      return { success: true, total: 0, succeeded: 0, failed: 0, skipped: 0, results: [] };
    }
    if (items.length > 100) {
      throw new Error('Batch size exceeds maximum of 100 memories');
    }

    // Attach default agent_id to items that don't have one
    const memories = items.map(item => ({
      content: item.content,
      metadata: item.metadata || {},
      agent_id: item.agent_id || this.config.agentId,
    }));

    return this.request<BatchStoreResponse>('POST', '/v1/memories/batch', { memories });
  }

  /**
   * Build a context string from search results.
   * Searches for relevant memories, formats them, and returns
   * a single string ready for prompt injection.
   */
  async buildContext(
    query: string,
    limit: number = 10,
    threshold: number = 0.5,
    maxTokens?: number
  ): Promise<{ context: string; memories_used: number; total_chars: number }> {
    const results = await this.searchMemories(
      query,
      limit,
      threshold,
      undefined, // use default agent
      false,     // no confidential
      false,     // no archived
      !!maxTokens, // compress if token budget provided
      maxTokens
    );

    if (results.length === 0) {
      return { context: '', memories_used: 0, total_chars: 0 };
    }

    const lines: string[] = [];
    for (const result of results) {
      const score = (result.score * 100).toFixed(0);
      lines.push(`[${score}%] ${result.memory.content}`);
    }

    const context = lines.join('\n\n');

    // Rough token budget enforcement (1 token ≈ 4 chars)
    let finalContext = context;
    if (maxTokens) {
      const charBudget = maxTokens * 4;
      if (finalContext.length > charBudget) {
        finalContext = finalContext.slice(0, charBudget) + '\n\n[...truncated]';
      }
    }

    return {
      context: finalContext,
      memories_used: results.length,
      total_chars: finalContext.length,
    };
  }

  /**
   * Start a new session
   */
  async startSession(
    title?: string,
    project?: string,
    metadata?: Record<string, string>
  ): Promise<Session> {
    const body: Record<string, unknown> = {};
    if (this.config.agentId) body.agent_id = this.config.agentId;
    if (title) body.title = title;
    if (project) body.project = project;
    if (metadata) body.metadata = metadata;
    return this.request<Session>('POST', '/v1/sessions', body);
  }

  /**
   * End an active session
   */
  async endSession(
    sessionId: string,
    summary?: string,
  ): Promise<Session> {
    const body: Record<string, unknown> = {};
    if (summary) body.summary = summary;
    return this.request<Session>('PUT', `/v1/sessions/${sessionId}/end`, body);
  }

  /**
   * Get a session by ID with its memories
   */
  async getSession(sessionId: string): Promise<SessionDetail> {
    return this.request<SessionDetail>(
      'GET',
      `/v1/sessions/${sessionId}?include_memories=true`
    );
  }

  /**
   * List sessions with optional filters
   */
  async listSessions(
    limit: number = 20,
    agentId?: string,
    project?: string,
    status?: string,
  ): Promise<ListResponse<Session>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    const effectiveAgentId = agentId ?? this.config.agentId;
    if (effectiveAgentId) params.set('agent_id', effectiveAgentId);
    if (project) params.set('project', project);
    if (status) params.set('status', status);
    return this.request<ListResponse<Session>>(
      'GET',
      `/v1/sessions?${params.toString()}`
    );
  }

  /**
   * Record a new decision
   */
  async recordDecision(
    title: string,
    rationale: string,
    alternatives?: string,
    project?: string,
    tags?: string[],
    status?: string,
    metadata?: Record<string, string>
  ): Promise<Decision> {
    const body: Record<string, unknown> = { title, rationale };
    if (this.config.agentId) body.agent_id = this.config.agentId;
    if (alternatives) body.alternatives = alternatives;
    if (project) body.project_slug = project;
    if (tags) body.tags = tags;
    if (status) body.status = status;
    if (metadata) body.metadata = metadata;
    return this.request<Decision>('POST', '/v1/decisions', body);
  }

  /**
   * List decisions with optional filters
   */
  async listDecisions(
    limit?: number,
    project?: string,
    status?: string,
    tags?: string,
  ): Promise<ListResponse<Decision>> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (project) params.set('project', project);
    if (status) params.set('status', status);
    if (tags) params.set('tags', tags);
    return this.request<ListResponse<Decision>>(
      'GET',
      `/v1/decisions?${params.toString()}`
    );
  }

  /**
   * Supersede a decision with a new one
   */
  async supersedeDecision(
    decisionId: string,
    title: string,
    rationale: string,
    alternatives?: string,
    tags?: string[],
  ): Promise<Decision> {
    const body: Record<string, unknown> = { title, rationale };
    if (alternatives) body.alternatives = alternatives;
    if (tags) body.tags = tags;
    return this.request<Decision>(
      'POST',
      `/v1/decisions/${decisionId}/supersede`,
      body
    );
  }

  /**
   * Check for existing decisions about a topic (semantic search)
   */
  async checkDecisions(
    query: string,
    project?: string,
    limit?: number,
    threshold?: number,
    includeSuperseded?: boolean,
  ): Promise<{ data: DecisionCheckResult[]; query: string; total: number }> {
    const params = new URLSearchParams();
    params.set('query', query);
    if (limit) params.set('limit', String(limit));
    if (threshold !== undefined) params.set('threshold', String(threshold));
    if (project) params.set('project', project);
    if (includeSuperseded) params.set('include_superseded', 'true');
    return this.request<{ data: DecisionCheckResult[]; query: string; total: number }>(
      'GET',
      `/v1/decisions/check?${params.toString()}`
    );
  }

  /**
   * Register a new project
   */
  async createProject(
    slug: string,
    name: string,
    description?: string,
    stack?: Record<string, unknown>,
    repo_url?: string,
    metadata?: Record<string, unknown>
  ): Promise<Project> {
    const body: Record<string, unknown> = { slug, name };
    if (description) body.description = description;
    if (stack) body.stack = stack;
    if (repo_url) body.repo_url = repo_url;
    if (metadata) body.metadata = metadata;
    return this.request<Project>('POST', '/v1/projects', body);
  }

  /**
   * List projects with optional pagination
   */
  async listProjects(
    limit: number = 20,
    cursor?: string
  ): Promise<ListResponse<Project>> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (cursor) params.set('cursor', cursor);
    return this.request<ListResponse<Project>>(
      'GET',
      `/v1/projects?${params.toString()}`
    );
  }

  /**
   * Get a project by slug
   */
  async getProject(slug: string): Promise<Project> {
    return this.request<Project>('GET', `/v1/projects/${slug}`);
  }

  /**
   * Create a reusable pattern
   */
  async createPattern(
    title: string,
    description: string,
    category?: string,
    example_code?: string,
    scope?: string,
    tags?: string[],
    source_project?: string,
    metadata?: Record<string, unknown>
  ): Promise<Pattern> {
    const body: Record<string, unknown> = { title, description };
    if (category) body.category = category;
    if (example_code) body.example_code = example_code;
    if (scope) body.scope = scope;
    if (tags) body.tags = tags;
    if (source_project) body.source_project = source_project;
    if (metadata) body.metadata = metadata;
    return this.request<Pattern>('POST', '/v1/patterns', body);
  }

  /**
   * Search patterns using semantic search
   */
  async searchPatterns(
    query: string,
    category?: string,
    project?: string,
    limit?: number,
    threshold?: number,
  ): Promise<{ data: PatternSearchResult[]; query: string; total: number }> {
    const params = new URLSearchParams();
    params.set('query', query);
    if (category) params.set('category', category);
    if (project) params.set('project', project);
    if (limit) params.set('limit', String(limit));
    if (threshold !== undefined) params.set('threshold', String(threshold));
    return this.request<{ data: PatternSearchResult[]; query: string; total: number }>(
      'GET',
      `/v1/patterns/search?${params.toString()}`
    );
  }

  /**
   * Adopt a pattern for a project
   */
  async adoptPattern(
    patternId: string,
    project: string,
  ): Promise<Pattern> {
    return this.request<Pattern>(
      'POST',
      `/v1/patterns/${patternId}/adopt`,
      { project }
    );
  }

  /**
   * Suggest patterns for a project
   */
  async suggestPatterns(
    project: string,
    limit?: number,
  ): Promise<{ data: Pattern[]; project: string; total: number }> {
    const params = new URLSearchParams();
    params.set('project', project);
    if (limit) params.set('limit', String(limit));
    return this.request<{ data: Pattern[]; project: string; total: number }>(
      'GET',
      `/v1/patterns/suggest?${params.toString()}`
    );
  }

  // ── Project Relationships (Issue #186) ──

  /**
   * Add a relationship between two projects
   */
  async addProjectRelationship(
    sourceSlug: string,
    targetProject: string,
    relationshipType: string,
    metadata?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      target_project: targetProject,
      relationship_type: relationshipType,
    };
    if (metadata) body.metadata = metadata;
    return this.request<Record<string, unknown>>(
      'POST',
      `/v1/projects/${sourceSlug}/relationships`,
      body,
    );
  }

  /**
   * Get what this project depends on
   */
  async getProjectDependencies(slug: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/projects/${slug}/dependencies`,
    );
  }

  /**
   * Get what depends on this project
   */
  async getProjectDependents(slug: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/projects/${slug}/dependents`,
    );
  }

  /**
   * Get all related projects
   */
  async getProjectRelated(slug: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/projects/${slug}/related`,
    );
  }

  /**
   * Run impact analysis for a project change
   */
  async projectImpactAnalysis(
    project: string,
    changeDescription: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/v1/projects/impact-analysis',
      { project, change_description: changeDescription },
    );
  }

  /**
   * Find patterns shared between two projects
   */
  async getSharedPatterns(
    slugA: string,
    slugB: string,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/projects/shared-patterns?a=${encodeURIComponent(slugA)}&b=${encodeURIComponent(slugB)}`,
    );
  }

  /**
   * Get full project context (hot memories, decisions, patterns, formatted text)
   */
  async getProjectContext(slug: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/v1/projects/${encodeURIComponent(slug)}/context`,
    );
  }

  /**
   * Promote/demote a memory by updating its importance and tier
   */
  async promoteMemory(
    memoryId: string,
    importance: number,
    tier?: string
  ): Promise<Memory> {
    const body: Record<string, unknown> = { importance };
    if (tier) {
      body.tier = tier;
    }
    return this.request<Memory>(
      'PUT',
      `/v1/memories/${encodeURIComponent(memoryId)}/importance`,
      body,
    );
  }

  // ── V2 Async API (60-600x faster) ──

  /**
   * Store a memory asynchronously (V2 API).
   * Returns immediately with 202 Accepted and a job ID.
   * Use getMemoryStatus() to poll for completion.
   */
  async storeMemoryAsync(
    content: string,
    metadata?: Record<string, string>,
    project?: string,
    importance?: number,
    tier?: string,
    webhookUrl?: string
  ): Promise<{ id: string; status: string; job_id: string; estimated_completion_seconds: number }> {
    this.validateContentSize(content);

    const body: Record<string, unknown> = {
      content,
      agent_id: this.config.agentId,
    };
    if (metadata) body.metadata = metadata;
    if (project) body.project = project;
    if (importance !== undefined) body.importance = importance;
    if (tier) body.tier = tier;
    if (webhookUrl) body.webhook_url = webhookUrl;

    return this.request<{ id: string; status: string; job_id: string; estimated_completion_seconds: number }>(
      'POST',
      '/v2/memories',
      body
    );
  }

  /**
   * Get memory processing status (V2 API).
   * Use after storeMemoryAsync() to check when embedding is ready.
   */
  async getMemoryStatus(memoryId: string): Promise<{
    id: string;
    status: 'pending' | 'processing' | 'ready' | 'failed';
    created_at: string;
    updated_at: string;
    error?: string;
  }> {
    return this.request<{
      id: string;
      status: 'pending' | 'processing' | 'ready' | 'failed';
      created_at: string;
      updated_at: string;
      error?: string;
    }>('GET', `/v2/memories/${memoryId}/status`);
  }

  /**
   * Build a ranked context bundle from memories (V2 API).
   * Supports optional AI summarization with custom LLM URL.
   */
  async buildContextV2(
    query: string,
    options?: {
      agentId?: string | null;
      maxMemories?: number;
      maxTokens?: number;
      aiEnhanced?: boolean;
      rankingVersion?: string;
      searchMode?: 'semantic' | 'hybrid' | 'keyword';
      llmApiUrl?: string;
      llmModel?: string;
      excludeMemoryIds?: string[];
    }
  ): Promise<{
    context: Array<{
      memory_id: string;
      content: string;
      score: number;
      memory_type?: string;
    }>;
    summary?: string;
    token_count: number;
    ranking_version: string;
    ai_enhanced: boolean;
    latency_ms: number;
  }> {
    const body: Record<string, unknown> = { query };
    if (options?.agentId !== undefined) body.agent_id = options.agentId;
    if (options?.maxMemories) body.max_memories = options.maxMemories;
    if (options?.maxTokens) body.max_tokens = options.maxTokens;
    if (options?.aiEnhanced) body.ai_enhanced = true;
    if (options?.rankingVersion) body.ranking_version = options.rankingVersion;
    if (options?.searchMode) body.search_mode = options.searchMode;
    if (options?.llmApiUrl) body.llm_api_url = options.llmApiUrl;
    if (options?.llmModel) body.llm_model = options.llmModel;
    if (options?.excludeMemoryIds) body.exclude_memory_ids = options.excludeMemoryIds;

    return this.request<{
      context: Array<{
        memory_id: string;
        content: string;
        score: number;
        memory_type?: string;
      }>;
      summary?: string;
      token_count: number;
      ranking_version: string;
      ai_enhanced: boolean;
      latency_ms: number;
    }>('POST', '/v2/context/build', body);
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
