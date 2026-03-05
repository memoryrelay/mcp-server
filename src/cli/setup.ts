#!/usr/bin/env node
/**
 * Interactive setup wizard for MemoryRelay MCP server.
 *
 * Detects installed MCP clients (Claude Desktop, Claude Code, OpenClaw),
 * validates the API key, and writes the correct configuration.
 *
 * Usage: npx memoryrelay-mcp setup
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

// ── Helpers ──────────────────────────────────────────────────────────

function stderr(msg: string): void {
  process.stderr.write(msg + '\n');
}

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── Client Detection ─────────────────────────────────────────────────

interface MCPClient {
  name: string;
  configPath: string;
  exists: boolean;
}

function getClaudeDesktopConfigPath(): string {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  } else {
    return path.join(home, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function getClaudeCodeConfigPath(): string {
  const home = os.homedir();
  return path.join(home, '.claude', 'settings.json');
}

function getOpenClawConfigPath(): string {
  const home = os.homedir();
  return path.join(home, '.openclaw', 'config.json');
}

function detectClients(): MCPClient[] {
  const clients: MCPClient[] = [
    {
      name: 'Claude Desktop',
      configPath: getClaudeDesktopConfigPath(),
      exists: false,
    },
    {
      name: 'Claude Code',
      configPath: getClaudeCodeConfigPath(),
      exists: false,
    },
    {
      name: 'OpenClaw',
      configPath: getOpenClawConfigPath(),
      exists: false,
    },
  ];

  for (const client of clients) {
    try {
      // Check if config file or its parent directory exists
      const dir = path.dirname(client.configPath);
      client.exists = fs.existsSync(dir);
    } catch {
      client.exists = false;
    }
  }

  return clients;
}

// ── API Key Validation ───────────────────────────────────────────────

async function validateApiKey(apiKey: string, apiUrl: string): Promise<{ valid: boolean; message: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${apiUrl}/v1/health`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': '@memoryrelay/mcp-server setup',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { valid: true, message: 'API key validated successfully' };
    } else if (response.status === 401 || response.status === 403) {
      return { valid: false, message: 'Invalid API key. Check your key at https://app.memoryrelay.ai/settings' };
    } else {
      return { valid: false, message: `Unexpected response: ${response.status} ${response.statusText}` };
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { valid: false, message: 'Connection timed out. Check your network and API URL.' };
    }
    return { valid: false, message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

// ── Config Writing ───────────────────────────────────────────────────

interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

function buildServerConfig(apiKey: string, apiUrl: string, agentId?: string): MCPServerConfig {
  const env: Record<string, string> = {
    MEMORYRELAY_API_KEY: apiKey,
  };

  if (apiUrl !== 'https://api.memoryrelay.net') {
    env.MEMORYRELAY_API_URL = apiUrl;
  }

  if (agentId) {
    env.MEMORYRELAY_AGENT_ID = agentId;
  }

  return {
    command: 'npx',
    args: ['-y', '@memoryrelay/mcp-server'],
    env,
  };
}

function writeConfig(configPath: string, serverConfig: MCPServerConfig): { success: boolean; message: string } {
  try {
    // Read existing config or create new one
    let config: Record<string, unknown> = {};
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(raw);
    }

    // Ensure mcpServers section exists
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }

    // Add or update memoryrelay server
    (config.mcpServers as Record<string, unknown>).memoryrelay = serverConfig;

    // Ensure directory exists
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write config
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');

    return { success: true, message: `Configuration written to ${configPath}` };
  } catch (error) {
    return {
      success: false,
      message: `Failed to write config: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ── Main Setup Flow ──────────────────────────────────────────────────

export async function runSetup(): Promise<void> {
  const rl = createReadline();

  stderr('');
  stderr('  MemoryRelay MCP Server Setup');
  stderr('  ============================');
  stderr('');

  // Step 1: Detect clients
  stderr('  Detecting MCP clients...');
  const clients = detectClients();
  const detectedClients = clients.filter(c => c.exists);

  if (detectedClients.length === 0) {
    stderr('');
    stderr('  No MCP clients detected. Supported clients:');
    stderr('    - Claude Desktop (https://claude.ai/download)');
    stderr('    - Claude Code (https://claude.ai/code)');
    stderr('    - OpenClaw');
    stderr('');
    stderr('  You can still configure manually. Continuing...');
    stderr('');
  } else {
    stderr('');
    for (const client of detectedClients) {
      stderr(`    [+] ${client.name} found`);
    }
    stderr('');
  }

  // Step 2: Get API key
  const apiKey = await ask(rl, '  API Key (starts with mem_): ');

  if (!apiKey.startsWith('mem_')) {
    stderr('');
    stderr('  Error: API key must start with "mem_"');
    stderr('  Get your key at https://app.memoryrelay.ai/settings');
    rl.close();
    process.exit(1);
  }

  if (apiKey.length < 20) {
    stderr('');
    stderr('  Error: API key appears too short');
    rl.close();
    process.exit(1);
  }

  // Step 3: API URL (optional)
  const apiUrlInput = await ask(rl, '  API URL [https://api.memoryrelay.net]: ');
  const apiUrl = apiUrlInput || 'https://api.memoryrelay.net';

  // Step 4: Agent ID (optional)
  const agentId = await ask(rl, '  Agent ID (optional, auto-detected if blank): ');

  // Step 5: Validate API key
  stderr('');
  stderr('  Validating API key...');
  const validation = await validateApiKey(apiKey, apiUrl);

  if (!validation.valid) {
    stderr(`  Error: ${validation.message}`);
    stderr('');
    const proceed = await ask(rl, '  Continue anyway? (y/N): ');
    if (proceed.toLowerCase() !== 'y') {
      rl.close();
      process.exit(1);
    }
  } else {
    stderr(`  ${validation.message}`);
  }

  // Step 6: Choose clients to configure
  const serverConfig = buildServerConfig(apiKey, apiUrl, agentId || undefined);
  const configuredClients: string[] = [];

  stderr('');

  if (detectedClients.length > 0) {
    for (const client of detectedClients) {
      const answer = await ask(rl, `  Configure ${client.name}? (Y/n): `);
      if (answer.toLowerCase() !== 'n') {
        const result = writeConfig(client.configPath, serverConfig);
        if (result.success) {
          stderr(`    ${result.message}`);
          configuredClients.push(client.name);
        } else {
          stderr(`    ${result.message}`);
        }
      }
    }
  } else {
    // No detected clients — offer manual config options
    for (const client of clients) {
      const answer = await ask(rl, `  Configure ${client.name}? (y/N): `);
      if (answer.toLowerCase() === 'y') {
        const result = writeConfig(client.configPath, serverConfig);
        if (result.success) {
          stderr(`    ${result.message}`);
          configuredClients.push(client.name);
        } else {
          stderr(`    ${result.message}`);
        }
      }
    }
  }

  // Step 7: Summary
  stderr('');
  stderr('  Setup complete!');
  stderr('  ===============');
  stderr('');

  if (configuredClients.length > 0) {
    stderr(`  Configured: ${configuredClients.join(', ')}`);
    stderr('');
    stderr('  Restart your MCP client to activate MemoryRelay.');
  } else {
    stderr('  No clients were configured. To configure manually, add');
    stderr('  the following to your MCP client config:');
    stderr('');
    stderr(JSON.stringify({ mcpServers: { memoryrelay: serverConfig } }, null, 2)
      .split('\n')
      .map(line => '    ' + line)
      .join('\n'));
  }

  stderr('');
  stderr('  Documentation: https://github.com/memoryrelay/mcp-server');
  stderr('');

  rl.close();
}
