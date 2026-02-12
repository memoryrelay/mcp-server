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
        '  - MEMORYRELAY_LOG_LEVEL (optional, default: info)'
      );
    }
    throw error;
  }
}

/**
 * Get or generate agent ID
 */
export function getAgentId(config: Config): string {
  if (config.agentId) {
    return config.agentId;
  }

  // Auto-generate from hostname
  const hostname = process.env.HOSTNAME || 'unknown';
  return `agent-${hostname.slice(0, 8)}`;
}
