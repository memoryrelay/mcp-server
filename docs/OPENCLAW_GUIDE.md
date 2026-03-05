# OpenClaw Setup Guide for MemoryRelay MCP Server

This guide walks through configuring the MemoryRelay MCP server with OpenClaw, giving your AI agent persistent memory across sessions.

---

## Prerequisites

- **Node.js 18+** -- Verify with `node --version`
- **npm** -- Comes with Node.js
- **OpenClaw** installed and working
- **MemoryRelay API key** -- Obtain one from <https://app.memoryrelay.ai> (format: `mem_prod_xxxxx`)

---

## Quick Setup

### 1. Get Your API Key

Sign up or log in at <https://app.memoryrelay.ai> and generate an API key. The key will start with `mem_` (e.g., `mem_prod_abc123def456`).

### 2. Configure OpenClaw

Edit your OpenClaw configuration file at `~/.openclaw/openclaw.json` and add the `memoryrelay` server:

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx",
        "OPENCLAW_AGENT_NAME": "your-agent-name"
      }
    }
  }
}
```

Replace `mem_prod_xxxxx` with your actual API key and `your-agent-name` with a descriptive name for this agent (e.g., `iris`, `friday`, `code-assistant`).

### 3. Restart OpenClaw

Restart OpenClaw to load the MCP server. The MemoryRelay tools should now appear in your tool list.

### 4. Verify the Connection

Ask your agent to run a health check:

> "Check the memory service health."

This invokes the `memory_health` tool and confirms connectivity to the MemoryRelay API.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `MEMORYRELAY_API_KEY` | Yes | -- | Your API key. Must start with `mem_`. |
| `OPENCLAW_AGENT_NAME` | No | -- | Agent name auto-detected by the MCP server from the OpenClaw environment. |
| `MEMORYRELAY_AGENT_ID` | No | Auto-detected | Explicit agent identifier. Takes priority over `OPENCLAW_AGENT_NAME`. |
| `MEMORYRELAY_API_URL` | No | `https://api.memoryrelay.net` | API base URL. Only change this for custom or self-hosted deployments. |
| `MEMORYRELAY_TIMEOUT` | No | `30000` | Request timeout in milliseconds. |
| `MEMORYRELAY_LOG_LEVEL` | No | `info` | Logging verbosity. One of: `debug`, `info`, `warn`, `error`. |

### Agent ID Priority

The MCP server determines the agent ID using the following priority order:

1. **`MEMORYRELAY_AGENT_ID`** -- Explicit configuration, highest priority.
2. **`OPENCLAW_AGENT_NAME`** -- Detected automatically from the OpenClaw environment.
3. **Auto-generated** -- Built from your system username and hostname (e.g., `sparc-DESKTOP`). Truncated to 32 characters.

For most OpenClaw setups, setting `OPENCLAW_AGENT_NAME` in the config is sufficient. Use `MEMORYRELAY_AGENT_ID` only if you need to override the agent name with a specific UUID or identifier.

---

## Available Tools

The MCP server exposes 13 tools:

### Memory Tools

| Tool | Description |
|---|---|
| `memory_store` | Store a new memory with optional metadata and deduplication. |
| `memory_search` | Semantic search across memories using natural language queries. |
| `memory_list` | List recent memories chronologically with pagination. |
| `memory_get` | Retrieve a specific memory by its UUID. |
| `memory_update` | Update the content or metadata of an existing memory. |
| `memory_delete` | Permanently delete a memory by its UUID. |

### Entity Tools

| Tool | Description |
|---|---|
| `entity_create` | Create a named entity (person, place, organization, project, concept). |
| `entity_link` | Link an entity to a memory with a relationship label. |
| `entity_list` | List entities in the knowledge graph with pagination. |

### Agent Tools

| Tool | Description |
|---|---|
| `agent_list` | List all agents with their memory counts. |
| `agent_create` | Create a new named agent (memory namespace). |
| `agent_get` | Get details of a specific agent by ID. |

### Health

| Tool | Description |
|---|---|
| `memory_health` | Check API connectivity and server health status. |

---

## Configuration Examples

### Minimal Configuration

Only the API key is strictly required. The agent ID will be auto-generated from your username and hostname:

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

### Full Configuration

All available options specified:

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx",
        "MEMORYRELAY_AGENT_ID": "iris",
        "MEMORYRELAY_API_URL": "https://api.memoryrelay.net",
        "MEMORYRELAY_TIMEOUT": "30000",
        "MEMORYRELAY_LOG_LEVEL": "info"
      }
    }
  }
}
```

### Self-Hosted Deployment

If you are running your own MemoryRelay API instance:

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_dev_xxxxx",
        "MEMORYRELAY_API_URL": "http://localhost:8000",
        "MEMORYRELAY_AGENT_ID": "local-dev",
        "MEMORYRELAY_LOG_LEVEL": "debug"
      }
    }
  }
}
```

---

## Troubleshooting

### "API key must start with mem_"

Your API key is missing or has the wrong format. Verify that:
- The key is set in the `env` block of your OpenClaw config.
- The key begins with `mem_` (e.g., `mem_prod_abc123`).
- There are no leading or trailing spaces around the key value.

### "Connection refused" or Timeout Errors

The MCP server cannot reach the MemoryRelay API. Check the following:
- Verify your internet connection.
- If using a custom `MEMORYRELAY_API_URL`, confirm the URL is correct and the service is running.
- Try increasing the timeout: set `MEMORYRELAY_TIMEOUT` to `60000` (60 seconds).
- Check firewall or proxy settings that may block outbound HTTPS traffic.

### "Rate limited" (HTTP 429)

You are sending too many requests. The server handles rate limiting automatically with exponential backoff, but if you see persistent errors:
- Reduce the frequency of tool calls.
- Batch operations where possible (e.g., store multiple related facts in a single memory).
- Wait for the retry period indicated in the error message.

### Agent ID Not Detected

If memories are not being attributed to the correct agent:
- Set `OPENCLAW_AGENT_NAME` explicitly in your config `env` block.
- Alternatively, set `MEMORYRELAY_AGENT_ID` for full control over the agent identifier.
- Run `agent_list` to see which agents exist and verify the correct one is being used.

### Tools Not Showing Up in OpenClaw

If the MemoryRelay tools do not appear after configuration:
- Restart OpenClaw completely.
- Verify that `~/.openclaw/openclaw.json` contains valid JSON (no trailing commas, proper quoting).
- Check that the `command` field is set to `npx` and `args` includes `"-y"` and `"@memoryrelay/mcp-server"`.
- Ensure Node.js 18+ is installed and accessible from your PATH.

### Authentication Errors (HTTP 401)

Your API key is not being accepted:
- Confirm the key is active and has not expired at <https://app.memoryrelay.ai>.
- Check for extra whitespace in the environment variable value.
- Regenerate the key if the issue persists.

### Enabling Debug Logging

To see detailed request/response information, set the log level to `debug`:

```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx",
        "MEMORYRELAY_LOG_LEVEL": "debug"
      }
    }
  }
}
```

Debug logs are written to stderr and include:
- API request and response details (with API keys masked).
- Tool invocation parameters.
- Validation errors.
- Connection status and retry attempts.

---

## Further Resources

- [MemoryRelay MCP Server README](../README.md)
- [Security Documentation](./SECURITY.md)
- [GitHub Repository](https://github.com/memoryrelay/mcp-server)
- [Report Issues](https://github.com/memoryrelay/mcp-server/issues)
- [MemoryRelay Dashboard](https://app.memoryrelay.ai)
- [MCP Protocol Specification](https://modelcontextprotocol.io)
