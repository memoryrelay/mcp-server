import { z } from 'zod';

/**
 * Configuration schema with security validation
 */
export const configSchema = z.object({
  apiKey: z.string()
    .startsWith('mem_', { message: 'API key must start with "mem_"' })
    .min(20, { message: 'API key appears to be invalid (too short)' }),
  apiUrl: z.string()
    .url({ message: 'API URL must be a valid URL' })
    .default('https://api.memoryrelay.net'),
  agentId: z.string()
    .optional()
    .describe('Agent identifier - auto-detected if not provided'),
  timeout: z.number()
    .positive({ message: 'Timeout must be positive' })
    .default(30000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error'])
    .default('info'),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Tool groups that can be enabled/disabled via MEMORYRELAY_TOOLS env var.
 * Default (when unset or 'all'): all groups enabled.
 */
export const TOOL_GROUPS: Record<string, string[]> = {
  core: [
    'memory_store', 'memory_search', 'memory_list', 'memory_get',
    'memory_update', 'memory_delete', 'entity_create', 'entity_link',
    'entity_list', 'entity_graph', 'memory_batch_store', 'memory_context',
    'agent_list', 'agent_create', 'agent_get', 'memory_health',
  ],
  sessions: ['session_start', 'session_end', 'session_recall', 'session_list'],
  decisions: ['decision_record', 'decision_list', 'decision_supersede', 'decision_check'],
  patterns: ['pattern_create', 'pattern_search', 'pattern_adopt', 'pattern_suggest'],
  projects: ['project_register', 'project_list', 'project_info'],
  relationships: [
    'project_add_relationship', 'project_dependencies', 'project_dependents',
    'project_related', 'project_impact', 'project_shared_patterns',
  ],
  context: ['project_context', 'memory_promote'],
};

/**
 * Parse MEMORYRELAY_TOOLS env var and return set of enabled tool names.
 * Returns null if all tools should be enabled (default behavior).
 */
export function getEnabledTools(): Set<string> | null {
  const raw = process.env.MEMORYRELAY_TOOLS;
  if (!raw || raw.trim().toLowerCase() === 'all') {
    return null; // all tools enabled
  }

  const groups = raw.split(',').map(g => g.trim().toLowerCase());
  const enabled = new Set<string>();
  for (const group of groups) {
    const tools = TOOL_GROUPS[group];
    if (tools) {
      for (const tool of tools) {
        enabled.add(tool);
      }
    }
  }
  return enabled;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  try {
    const config = configSchema.parse({
      apiKey: process.env.MEMORYRELAY_API_KEY,
      apiUrl: process.env.MEMORYRELAY_API_URL,
      agentId: process.env.MEMORYRELAY_AGENT_ID,
      timeout: process.env.MEMORYRELAY_TIMEOUT 
        ? parseInt(process.env.MEMORYRELAY_TIMEOUT, 10) 
        : undefined,
      logLevel: process.env.MEMORYRELAY_LOG_LEVEL,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `  - ${issue.path.join('.')}: ${issue.message}`
      ).join('\n');
      
      throw new Error(
        `Configuration validation failed:\n${issues}\n\n` +
        'Please check your environment variables:\n' +
        '  - MEMORYRELAY_API_KEY (required, starts with "mem_")\n' +
        '  - MEMORYRELAY_API_URL (optional, default: https://api.memoryrelay.net)\n' +
        '  - MEMORYRELAY_AGENT_ID (optional, auto-detected)\n' +
        '  - MEMORYRELAY_TIMEOUT (optional, default: 30000)\n' +
        '  - MEMORYRELAY_LOG_LEVEL (optional, default: info)',
        { cause: error }
      );
    }
    throw error;
  }
}

/**
 * Get or generate agent ID.
 *
 * Priority order:
 * 1. MEMORYRELAY_AGENT_ID (explicit configuration)
 * 2. OPENCLAW_AGENT_NAME (OpenClaw auto-detection)
 * 3. Auto-generated from username + hostname
 *
 * When no explicit ID is provided we build a human-readable identifier
 * from the current user and hostname so that memories are easier to
 * attribute in the dashboard (e.g. "sparc-DESKTOP" instead of "agent-a1b2c3d4").
 */
export function getAgentId(config: Config): string {
  if (config.agentId) {
    return config.agentId;
  }

  // OpenClaw auto-detection: use agent name from OpenClaw environment
  const openclawAgent = process.env.OPENCLAW_AGENT_NAME;
  if (openclawAgent) {
    return openclawAgent.slice(0, 32);
  }

  const hostname = process.env.HOSTNAME || process.env.COMPUTERNAME || 'unknown';
  const user = process.env.USER || process.env.USERNAME || '';
  return user
    ? `${user}-${hostname}`.slice(0, 32)
    : `mcp-${hostname}`.slice(0, 32);
}
