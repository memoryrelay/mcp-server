# @memoryrelay/mcp-server

**MCP server for MemoryRelay** - Give your AI agents persistent memory across sessions.

[![CI/CD](https://github.com/memoryrelay/mcp-server/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/memoryrelay/mcp-server/actions)
[![npm version](https://badge.fury.io/js/@memoryrelay%2Fmcp-server.svg)](https://www.npmjs.com/package/@memoryrelay/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Persistent Memory**: Store and retrieve memories across conversations
- **Semantic Search**: Find relevant memories using natural language queries
- **Batch Operations**: Create multiple memories in a single request for optimal performance
- **Security Hardened**: API key masking, input validation, sanitized errors
- **MCP Compliant**: Works with Claude Desktop, OpenClaw, and any MCP client
- **Fully Tested**: 169 test cases covering all functionality

---

## 📦 Installation

### Using npx (recommended)

No installation needed - run directly:

```bash
npx @memoryrelay/mcp-server
```

### Global Installation

```bash
npm install -g @memoryrelay/mcp-server
```

### Local Project Installation

```bash
npm install @memoryrelay/mcp-server
```

---

## ⚡ Quick Start

### 1. Get Your API Key

Sign up at [memoryrelay.ai](https://memoryrelay.ai) to get your API key (format: `mem_prod_xxxxx`).

### 2. Configure Your MCP Client

#### For OpenClaw

> See [docs/OPENCLAW_GUIDE.md](docs/OPENCLAW_GUIDE.md) for a comprehensive setup guide.

Edit `~/.openclaw/openclaw.json`:

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx",
        "MEMORYRELAY_AGENT_ID": "iris"
      }
    }
  }
}
```

#### For Claude Desktop (macOS)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "MemoryRelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx"
      }
    }
  }
}
```

#### For Claude Desktop (Windows)

On Windows, `npx` with scoped packages can fail to resolve the bin entry. Install globally first, then use `node` directly.

**Step 1:** Install the package globally:

```bash
npm install -g @memoryrelay/mcp-server
```

**Step 2:** Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "MemoryRelay": {
      "command": "node",
      "args": ["%APPDATA%\\npm\\node_modules\\@memoryrelay\\mcp-server\\dist\\index.js"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx"
      }
    }
  }
}
```

> **Note:** Replace `%APPDATA%` with your actual path (e.g., `C:\\Users\\YourName\\AppData\\Roaming`). You can find it by running `echo %APPDATA%` in Command Prompt.

### 3. Restart Your Client

Restart OpenClaw or Claude Desktop to load the MCP server.

### 4. Test It Out

Try asking:
- "Remember that I prefer Python over JavaScript"
- "What programming languages do I like?"
- "Create an entity for the MemoryRelay project"

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MEMORYRELAY_API_KEY` | ✅ Yes | - | Your API key (starts with `mem_`) |
| `MEMORYRELAY_API_URL` | No | `https://api.memoryrelay.net` | API base URL (for custom deployments) |
| `MEMORYRELAY_AGENT_ID` | No | Auto-detected | Agent identifier (auto-generated if not set) |
| `MEMORYRELAY_TIMEOUT` | No | `30000` | Request timeout in milliseconds |
| `MEMORYRELAY_LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `MEMORYRELAY_TOOLS` | No | `all` | Comma-separated tool groups to enable (see below) |

### Tool Groups

Control which tools are exposed via the `MEMORYRELAY_TOOLS` environment variable:

| Group | Tools | Description |
|-------|-------|-------------|
| `core` | 16 tools | Memory CRUD, entities, agents, health |
| `sessions` | 4 tools | Session lifecycle (start, end, recall, list) |
| `decisions` | 4 tools | Decision recording and checking |
| `patterns` | 4 tools | Pattern library (create, search, adopt, suggest) |
| `projects` | 3 tools | Project registration and listing |
| `relationships` | 6 tools | Project graph (add, deps, dependents, related, impact, shared patterns) |
| `context` | 2 tools | Project context, memory promotion |

Examples:
- `MEMORYRELAY_TOOLS=all` (default) — all tools enabled
- `MEMORYRELAY_TOOLS=core,sessions` — only core + session tools
- `MEMORYRELAY_TOOLS=core,relationships,context` — core + graph tools

### Agent ID Detection

The server automatically detects your agent ID from:
1. `MEMORYRELAY_AGENT_ID` environment variable
2. `OPENCLAW_AGENT_NAME` environment variable (OpenClaw)
3. Hostname-based generation (if neither is set)

---

## 🛠️ Available Tools

The MCP server provides 39 tools organized into groups:

### Memory Management Tools

#### `memory_store`

Store a new memory with optional metadata.

> **Note**: The `agent_id` parameter is automatically injected from `MEMORYRELAY_AGENT_ID` environment variable. You don't need to include it in your request.

**Parameters:**
- `content` (string, required) - The memory content to store (1-50,000 characters)
- `metadata` (object, optional) - Key-value metadata to attach (max 10KB when serialized)

**Example:**
```json
{
  "content": "User prefers Python for data analysis projects",
  "metadata": {
    "category": "preference",
    "topic": "programming"
  }
}
```

**Returns:** Memory object with `id`, `content`, `agent_id`, `metadata`, `created_at`, `updated_at`

**Rate Limit**: 30 requests per minute

---

#### `memory_search`

Search memories using semantic similarity.

**Parameters:**
- `query` (string, required) - Natural language search query
- `limit` (number, optional, default: 10) - Maximum results (1-50)
- `threshold` (number, optional, default: 0.5) - Minimum similarity score (0-1)

**Example:**
```json
{
  "query": "What are the user's programming preferences?",
  "limit": 5,
  "threshold": 0.7
}
```

**Returns:** Array of memory objects with similarity scores

---

#### `memory_list`

List recent memories chronologically.

**Parameters:**
- `limit` (number, optional, default: 20) - Number of memories to return (1-100)
- `offset` (number, optional, default: 0) - Pagination offset

**Example:**
```json
{
  "limit": 10,
  "offset": 0
}
```

**Returns:** Object with `memories` array, `total`, `limit`, `offset`

---

#### `memory_get`

Retrieve a specific memory by ID.

**Parameters:**
- `id` (string, required) - Memory UUID

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Returns:** Memory object

---

#### `memory_update`

Update an existing memory's content or metadata.

> **Note**: Metadata updates are **merged** with existing metadata, not replaced. To remove a key, explicitly set it to `null`.

**Parameters:**
- `id` (string, required) - Memory UUID
- `content` (string, required) - New content (1-50,000 characters)
- `metadata` (object, optional) - Updated metadata (merged with existing, max 10KB)

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "Updated: User prefers Python and TypeScript for data analysis",
  "metadata": {
    "category": "preference",
    "updated": "2026-02-12"
  }
}
```

**Returns:** Updated memory object

---

#### `memory_delete`

Permanently delete a memory.

**Parameters:**
- `id` (string, required) - Memory UUID

**Example:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Returns:** Success confirmation

---

### Health Check Tool

#### `memory_health`

Check API connectivity and server health.

**Parameters:** None

**Example:**
```json
{}
```

**Returns:** Health status object with `status`, `version`, `latency`

---

## 🔒 Security

This MCP server is designed with security best practices:

### API Key Protection
- API keys starting with `mem_` are automatically masked in all logs
- Keys are never exposed in error messages or debug output
- Environment variables are the only supported authentication method

### Input Validation
- All inputs validated using Zod schemas before processing
- UUIDs validated for format correctness
- String lengths enforced (content max 50,000 characters, metadata max 10KB)
- Memory IDs must be valid UUIDs

### Error Handling
- Errors sanitized to prevent information leakage
- No internal paths or stack traces exposed to clients
- All errors logged to stderr (stdout reserved for MCP protocol)

### STDIO Safety
- All logging strictly to stderr
- STDIO transport properly isolated per MCP specification

For detailed security information, see [SECURITY.md](./docs/SECURITY.md).

---

## 🧪 Development

### Prerequisites

- Node.js 18+ (22+ recommended)
- npm or yarn

### Setup

```bash
# Clone the repository
git clone https://github.com/memoryrelay/mcp-server.git
cd mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run all tests (including integration)
npm run test:all

# Generate coverage report
npm run test:coverage

# Type checking
npm run type-check
```

### Available Scripts

- `npm run build` - Build for production
- `npm run dev` - Build in watch mode
- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests (requires API key)
- `npm run test:server` - Run server-specific tests
- `npm run test:security` - Run security-focused tests
- `npm run test:all` - Run all tests
- `npm run test:coverage` - Generate coverage report
- `npm run type-check` - Run TypeScript type checking

### Project Structure

```
mcp-server/
├── src/
│   ├── index.ts          # Entry point with CLI routing
│   ├── server.ts         # MCP server implementation (39 tools)
│   ├── client.ts         # MemoryRelay API client
│   ├── config.ts         # Configuration loader + tool groups
│   ├── logger.ts         # Security-hardened logging
│   ├── types.ts          # TypeScript types
│   └── cli/
│       ├── setup.ts      # Interactive setup wizard
│       └── test.ts       # Connection test command
├── tests/
│   ├── server.test.ts    # Server tests
│   ├── client.test.ts    # Client tests
│   ├── config.test.ts    # Config tests
│   ├── security.test.ts  # Security tests
│   ├── entity.test.ts    # Entity tests
│   ├── e2e-protocol.test.ts # MCP protocol e2e tests
│   └── integration.test.ts # Integration tests
├── docs/
│   ├── SECURITY.md       # Security documentation
│   └── OPENCLAW_GUIDE.md # OpenClaw setup guide
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── eslint.config.js
├── CHANGELOG.md
├── LICENSE
└── README.md
```

---

## 🐛 Troubleshooting

### Server Won't Start

**Problem:** `Failed to start MemoryRelay MCP server`

**Solutions:**
1. Verify your API key is set correctly:
   ```bash
   echo $MEMORYRELAY_API_KEY
   ```
2. Check the API key format (should start with `mem_`)
3. Ensure Node.js version is 18+ (`node --version`)
4. Try running with debug logging:
   ```json
   {
     "env": {
       "MEMORYRELAY_LOG_LEVEL": "debug"
     }
   }
   ```

### Connection Errors

**Problem:** `API request failed` or timeout errors

**Solutions:**
1. Check internet connectivity
2. Verify API URL (if using custom deployment)
3. Increase timeout:
   ```json
   {
     "env": {
       "MEMORYRELAY_TIMEOUT": "60000"
     }
   }
   ```
4. Check firewall/proxy settings

### Windows: `npx` Fails with Scoped Package

**Problem:** `'memoryrelay-mcp' is not recognized` when using `npx` on Windows

**Solutions:**
1. Install globally instead of using `npx`:
   ```bash
   npm install -g @memoryrelay/mcp-server
   ```
2. Use `node` directly in your Claude Desktop config (see [Windows setup](#for-claude-desktop-windows) above)
3. Verify the global install path:
   ```bash
   npm root -g
   ```

### Tools Not Showing Up

**Problem:** MCP tools not available in client

**Solutions:**
1. Restart your MCP client (Claude Desktop, OpenClaw)
2. Check configuration file syntax (valid JSON)
3. Verify the `command` path is correct
4. Check client logs for MCP server connection errors

### Authentication Errors

**Problem:** `401 Unauthorized` errors

**Solutions:**
1. Verify API key is correct and active
2. Check for extra spaces in environment variable
3. Ensure key hasn't expired
4. Contact support if key should be valid

### Validation Errors

**Problem:** `Validation error` when calling tools

**Solutions:**
1. Check parameter types match schema (e.g., `limit` should be number, not string)
2. Verify required parameters are provided
3. Check UUID format for ID parameters
4. Ensure string lengths are within limits (e.g., entity names max 200 chars)

### Debug Mode

Enable debug logging to see detailed information:

```json
{
  "env": {
    "MEMORYRELAY_LOG_LEVEL": "debug"
  }
}
```

Debug logs go to stderr and include:
- API request/response details (with masked API keys)
- Tool invocation parameters
- Validation errors
- Connection status

### Getting Help

- 📖 [Full Documentation](https://github.com/memoryrelay/mcp-server#readme)
- 🐛 [Report Issues](https://github.com/memoryrelay/mcp-server/issues)
- 💬 [Discussions](https://github.com/memoryrelay/mcp-server/discussions)
- 🔒 [Security Policy](./docs/SECURITY.md)

---

## 📊 Testing

The project has comprehensive test coverage:

- **169 test cases** covering all functionality
- Unit tests for each component
- Integration tests against live API
- Security-focused tests for API key masking and input validation
- Server protocol tests

Run tests:

```bash
# All unit tests
npm test

# With coverage
npm run test:coverage

# Integration tests (requires API key)
MEMORYRELAY_API_KEY=mem_prod_xxx npm run test:integration

# Specific test suites
npm run test:server    # Server tests only
npm run test:security  # Security tests only
```

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

---

## 🔗 Links

- **Documentation**: [GitHub Repository](https://github.com/memoryrelay/mcp-server)
- **npm Package**: [@memoryrelay/mcp-server](https://www.npmjs.com/package/@memoryrelay/mcp-server)
- **Website**: [memoryrelay.ai](https://memoryrelay.ai)
- **API**: [api.memoryrelay.net](https://api.memoryrelay.net)
- **Model Context Protocol**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **OpenClaw**: [openclaw.org](https://openclaw.org)

---

## 🙏 Contributing

Contributions welcome! Please open an issue or pull request on [GitHub](https://github.com/memoryrelay/mcp-server).

---

## 📝 Changelog

### v0.2.0 (2026-03-04)

- **39 tools** across 7 configurable tool groups (up from 9)
- **Session tools**: `session_start`, `session_end`, `session_recall`, `session_list` — track development sessions with automatic memory linking
- **Decision tools**: `decision_record`, `decision_list`, `decision_supersede`, `decision_check` — log architectural decisions with semantic search
- **Pattern tools**: `pattern_create`, `pattern_search`, `pattern_adopt`, `pattern_suggest` — share and reuse conventions across projects
- **Project tools**: `project_register`, `project_list`, `project_info`, `project_context` — manage project namespaces and load full context
- **Relationship tools**: `project_add_relationship`, `project_dependencies`, `project_dependents`, `project_related`, `project_impact`, `project_shared_patterns` — map project dependencies and analyze impact
- **Context tools**: `memory_promote` — manage memory importance tiers (hot/warm/cold)
- **Tool group configuration**: `MEMORYRELAY_TOOLS` env var to selectively enable tool groups
- **Session-aware descriptions**: Tool descriptions dynamically show active session context
- **Server instructions**: Recommended workflow guidance via MCP protocol instructions field
- 169 test cases with full coverage

### v0.1.0 (2026-02-12)

- Initial release
- 9 MCP tools for memory and entity management
- Semantic search with configurable thresholds
- Entity linking for knowledge graphs
- Security hardened with API key masking and input validation
- 102 test cases with full coverage
- Support for OpenClaw and Claude Desktop

---

Made with ❤️ by the [MemoryRelay Team](https://github.com/memoryrelay)
