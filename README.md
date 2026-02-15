# @memoryrelay/mcp-server

**MCP server for MemoryRelay** - Give your AI agents persistent memory across sessions.

[![CI/CD](https://github.com/memoryrelay/mcp-server/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/memoryrelay/mcp-server/actions)
[![npm version](https://badge.fury.io/js/@memoryrelay%2Fmcp-server.svg)](https://www.npmjs.com/package/@memoryrelay/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🚀 Features

- **Persistent Memory**: Store and retrieve memories across conversations
- **Semantic Search**: Find relevant memories using natural language queries
- **Entity Management**: Create and link entities (people, projects, concepts) for knowledge graphs
- **MCP Resources**: Expose memories as readable resources for richer context injection
- **MCP Prompts**: Built-in prompt templates for common memory workflows
- **Security Hardened**: API key masking, input validation, sanitized errors
- **MCP Compliant**: Works with Claude Desktop, OpenClaw, and any MCP client
- **Fully Tested**: 102+ test cases covering all functionality

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

#### For Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx"
      }
    }
  }
}
```

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

### Agent ID Detection

The server automatically detects your agent ID from:
1. `MEMORYRELAY_AGENT_ID` environment variable
2. `OPENCLAW_AGENT_NAME` environment variable (OpenClaw)
3. Hostname-based generation (if neither is set)

---

## 🛠️ Available Tools

The MCP server provides 9 tools for memory and entity management:

### Memory Management Tools

#### `memory_store`

Store a new memory with optional metadata.

**Parameters:**
- `content` (string, required) - The memory content to store
- `metadata` (object, optional) - Key-value metadata to attach

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

**Returns:** Memory object with `id`, `content`, `metadata`, `created_at`, `updated_at`

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

**Parameters:**
- `id` (string, required) - Memory UUID
- `content` (string, required) - New content
- `metadata` (object, optional) - Updated metadata (replaces existing)

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

### Entity Management Tools

#### `entity_create`

Create a named entity for the knowledge graph.

**Parameters:**
- `name` (string, required) - Entity name (1-200 characters)
- `type` (enum, required) - One of: `person`, `place`, `organization`, `project`, `concept`, `other`
- `metadata` (object, optional) - Key-value metadata

**Example:**
```json
{
  "name": "MemoryRelay Project",
  "type": "project",
  "metadata": {
    "status": "active",
    "started": "2026-01"
  }
}
```

**Returns:** Entity object with `id`, `name`, `type`, `metadata`, `created_at`

---

#### `entity_link`

Link an entity to a memory to establish relationships.

**Parameters:**
- `entity_id` (string, required) - Entity UUID
- `memory_id` (string, required) - Memory UUID
- `relationship` (string, optional, default: "mentioned_in") - Relationship type

**Example:**
```json
{
  "entity_id": "650e8400-e29b-41d4-a716-446655440001",
  "memory_id": "550e8400-e29b-41d4-a716-446655440000",
  "relationship": "relates_to"
}
```

**Returns:** Success confirmation with link details

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

## 📚 Resources

The server exposes memories as MCP resources, allowing clients to read memory data directly.

### Static Resources

#### `memory:///recent`

Returns the 20 most recent memories as a JSON resource.

### Resource Templates

#### `memory:///{id}`

Retrieve a specific memory by its UUID. Replace `{id}` with a valid memory UUID.

**Example URI:** `memory:///550e8400-e29b-41d4-a716-446655440000`

---

## 💬 Prompts

The server provides prompt templates that guide the AI through common memory workflows.

### `store_memory`

Store information as a persistent memory with appropriate metadata.

**Arguments:**
- `information` (string, required) - The information to remember
- `category` (string, optional) - Category tag (e.g., preference, fact, instruction)

### `recall_memories`

Search for and recall relevant memories about a topic.

**Arguments:**
- `topic` (string, required) - The topic or question to search memories for

### `summarize_memories`

List and summarize all recent memories for context.

**Arguments:** None

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
- Entity names sanitized to prevent XSS attacks
- String lengths enforced (e.g., entity names max 200 characters)

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
mcp/
├── src/
│   ├── index.ts          # Entry point
│   ├── server.ts         # MCP server implementation
│   ├── client.ts         # MemoryRelay API client
│   ├── config.ts         # Configuration loader
│   ├── logger.ts         # Logging utilities
│   └── types.ts          # TypeScript types
├── tests/
│   ├── server.test.ts    # Server tests
│   ├── client.test.ts    # Client tests
│   ├── config.test.ts    # Config tests
│   ├── security.test.ts  # Security tests
│   └── integration.test.ts # Integration tests
├── docs/
│   └── SECURITY.md       # Security documentation
├── package.json
├── tsconfig.json
├── vitest.config.ts
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

- 📖 [Full Documentation](https://github.com/memoryrelay/mcp-server/tree/main/mcp)
- 🐛 [Report Issues](https://github.com/memoryrelay/mcp-server/issues)
- 💬 [Discussions](https://github.com/memoryrelay/mcp-server/discussions)
- 🔒 [Security Policy](./docs/SECURITY.md)

---

## 📊 Testing

The project has comprehensive test coverage:

- **102+ test cases** covering all functionality
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

MIT License - see [LICENSE](../LICENSE) for details

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

Contributions welcome! Please see [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

## 📝 Changelog

### v0.1.8 (2026-02-15)

- Add MCP resources: `memory:///recent` and `memory:///{id}` for direct memory access
- Add MCP prompts: `store_memory`, `recall_memories`, `summarize_memories` templates
- Fix `npx @memoryrelay/mcp-server` execution for scoped packages
- Fix server version reporting (was hardcoded as 0.1.0)
- Implement `OPENCLAW_AGENT_NAME` environment variable support
- Fix error help URL to point to current repository
- Fix GitHub Release install commands to use scoped package name
- Fix TypeScript strict mode errors

### v0.1.0 (2026-02-12)

- Initial release
- 9 MCP tools for memory and entity management
- Semantic search with configurable thresholds
- Entity linking for knowledge graphs
- Security hardened with API key masking and input validation
- 102+ test cases with full coverage
- Support for OpenClaw and Claude Desktop

---

Made with ❤️ by the [MemoryRelay Team](https://github.com/memoryrelay)
