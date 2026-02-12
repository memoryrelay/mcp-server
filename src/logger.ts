/**
 * Security-hardened logger for MCP server
 * 
 * - All output to stderr (stdout reserved for MCP protocol)
 * - Automatic masking of API keys (anything starting with "mem_")
 * - No internal paths in error messages
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private minLevel: number;

  constructor(level: LogLevel = 'info') {
    this.minLevel = LOG_LEVELS[level];
  }

  /**
   * Mask sensitive data in log messages
   * - API keys starting with "mem_" are masked
   * - Internal paths are sanitized
   */
  private sanitize(message: string): string {
    let sanitized = message;

    // Mask API keys (mem_xxx -> mem_****)
    sanitized = sanitized.replace(/mem_[a-zA-Z0-9_-]+/g, 'mem_****');

    // Remove internal paths (anything that looks like a file path)
    sanitized = sanitized.replace(/\/[a-zA-Z0-9_\-./]+\.(ts|js|json)/g, '<file>');
    sanitized = sanitized.replace(/at\s+[^\s]+\s+\([^)]+\)/g, 'at <location>');

    return sanitized;
  }

  /**
   * Format log message with timestamp and level
   */
  private format(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const sanitizedMessage = this.sanitize(message);
    
    let output = `[${timestamp}] [${level.toUpperCase()}] ${sanitizedMessage}`;
    
    if (data !== undefined) {
      const sanitizedData = this.sanitize(JSON.stringify(data, null, 2));
      output += `\n${sanitizedData}`;
    }
    
    return output;
  }

  debug(message: string, data?: unknown): void {
    if (this.minLevel <= LOG_LEVELS.debug) {
      console.error(this.format('debug', message, data));
    }
  }

  info(message: string, data?: unknown): void {
    if (this.minLevel <= LOG_LEVELS.info) {
      console.error(this.format('info', message, data));
    }
  }

  warn(message: string, data?: unknown): void {
    if (this.minLevel <= LOG_LEVELS.warn) {
      console.error(this.format('warn', message, data));
    }
  }

  error(message: string, data?: unknown): void {
    if (this.minLevel <= LOG_LEVELS.error) {
      console.error(this.format('error', message, data));
    }
  }
}

// Export singleton instance
let logger: Logger;

export function initLogger(level: LogLevel = 'info'): Logger {
  logger = new Logger(level);
  return logger;
}

export function getLogger(): Logger {
  if (!logger) {
    logger = new Logger();
  }
  return logger;
}
