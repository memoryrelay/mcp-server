# Security Guide

This document outlines the security measures implemented in the MemoryRelay MCP server and provides best practices for secure deployment.

---

## 🔐 Overview

The MemoryRelay MCP server is designed with security as a top priority:

- **No credential storage** - API keys never written to disk
- **Automatic key masking** - Sensitive data hidden in all logs
- **Input validation** - All inputs validated before processing
- **Error sanitization** - No internal paths or sensitive data leaked
- **STDIO isolation** - Logs strictly to stderr per MCP spec

---

## 🔑 API Key Handling

### Best Practices

#### ✅ DO

- Store API keys in environment variables only
- Use your MCP client's configuration file to set environment variables
- Rotate API keys regularly (recommended: every 90 days)
- Use different API keys for different agents/environments
- Revoke compromised keys immediately via the MemoryRelay dashboard

#### ❌ DON'T

- Never commit API keys to version control
- Never hardcode API keys in configuration files
- Never share API keys between production and development
- Never log API keys manually in your own code
- Never expose API keys in command-line arguments (use env vars)

### How Keys Are Protected

The MCP server automatically masks any string starting with `mem_` in:

- Application logs (stderr)
- Error messages
- Debug output
- API request/response logging

**Example:**

```typescript
// In logs, this:
MEMORYRELAY_API_KEY=mem_prod_abc123xyz789

// Becomes:
MEMORYRELAY_API_KEY=mem_prod_***
```

### Key Format

Valid API keys have the format:

```
mem_{environment}_{random_string}
```

Where `{environment}` is typically:
- `prod` - Production keys
- `dev` - Development keys
- `test` - Testing keys

---

## 🌍 Environment Variables

### Recommended Configuration

Always configure via your MCP client's environment block:

**OpenClaw** (`~/.openclaw/openclaw.json`):
```json
{
  "mcpServers": {
    "memoryrelay": {
      "command": "npx",
      "args": ["-y", "@memoryrelay/mcp-server"],
      "env": {
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx",
        "MEMORYRELAY_AGENT_ID": "iris",
        "MEMORYRELAY_LOG_LEVEL": "info"
      }
    }
  }
}
```

**Claude Desktop**:
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

### File Permissions

Protect your configuration files:

```bash
# macOS/Linux
chmod 600 ~/.openclaw/openclaw.json
chmod 600 ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Verify permissions
ls -la ~/.openclaw/openclaw.json
# Should show: -rw------- (read/write for owner only)
```

### Environment Variable Precedence

The server reads configuration in this order (first found wins):

1. `MEMORYRELAY_API_KEY` - Explicit API key
2. `MEMORYRELAY_API_URL` - Custom API endpoint (defaults to production)
3. `MEMORYRELAY_AGENT_ID` - Agent identifier
4. `OPENCLAW_AGENT_NAME` - OpenClaw auto-detection fallback
5. Hostname-based generation - Last resort for agent ID

---

## 📊 Logging & Data Handling

### What Gets Logged

The MCP server logs to **stderr only** (stdout is reserved for MCP protocol):

#### Always Logged (INFO level):
- Server startup/shutdown events
- API connectivity status
- Tool invocation names (but NOT parameters)

#### Debug Level Only:
- Tool invocation parameters (with sensitive data masked)
- API request/response metadata (not full bodies)
- Validation errors with sanitized details

#### NEVER Logged:
- Full API key values
- Memory content (your actual data)
- Full API request/response bodies in production
- Internal file paths or stack traces

### Log Levels

Configure via `MEMORYRELAY_LOG_LEVEL`:

| Level | Purpose | Use Case |
|-------|---------|----------|
| `error` | Critical errors only | Production (minimal logging) |
| `info` | Standard operations | Production (recommended) |
| `debug` | Detailed diagnostics | Development/troubleshooting |

**Production Recommendation:** Use `info` level

**Development:** Use `debug` to see tool parameters and API details

### Sensitive Data Masking

Automatic masking patterns:

- **API Keys**: `mem_*` → `mem_prod_***`
- **UUIDs**: Logged but not considered sensitive (they're already access-controlled)
- **Usernames/Emails**: Not currently logged

### Example Log Output

```
[2026-02-12T00:00:00.000Z] INFO: Starting MemoryRelay MCP server
[2026-02-12T00:00:00.100Z] INFO: MCP server initialized
[2026-02-12T00:00:00.200Z] INFO: MCP server started on STDIO
[2026-02-12T00:00:10.000Z] DEBUG: Tool called: memory_store {"content":"...","metadata":{...}}
[2026-02-12T00:00:10.100Z] DEBUG: API request: POST /memories (key: mem_prod_***)
```

---

## ✅ Input Validation

### Automatic Validation

All tool inputs are validated using Zod schemas:

#### Memory Content
- Type: String (required)
- No length limit (API enforces reasonable limits)
- HTML-encoded when used in entity names

#### Entity Names
- Type: String (required)
- Length: 1-200 characters
- Automatically sanitized to prevent XSS

#### UUIDs
- Format: Standard UUID v4
- Validated before API calls
- Invalid UUIDs rejected immediately

#### Metadata
- Type: Object with string values
- Keys and values are strings only
- No nested objects allowed

#### Numbers
- Limits and offsets: Non-negative integers
- Thresholds: Float between 0 and 1
- Timeouts: Positive integers

### XSS Prevention

Entity names are HTML-encoded:

```typescript
// Input:
name: "<script>alert('xss')</script>"

// Stored as:
name: "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"
```

This prevents injection attacks if entity names are displayed in web interfaces.

---

## 🚫 Error Handling

### Error Sanitization

Errors are sanitized before being returned to clients:

#### What's Included:
- User-friendly error message
- Error type (validation, network, API error)
- Field-level validation details (for Zod errors)

#### What's Excluded:
- Internal file paths
- Stack traces
- Environment variables
- API endpoint details
- Server configuration

### Example Error Response

```json
{
  "error": "Tool execution failed",
  "message": "Validation error",
  "details": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": ["content"],
      "message": "Expected string, received number"
    }
  ]
}
```

---

## 🔒 Rate Limiting

### Client-Side Behavior

The MCP server respects API rate limits:

- **Timeout**: Default 30 seconds per request (configurable)
- **Retries**: No automatic retries (MCP clients should handle retries)
- **Backoff**: Not implemented (API returns 429 if rate limited)

### API Rate Limits

The MemoryRelay API enforces these limits (as of 2026-02-12):

| Tier | Requests/min | Requests/day |
|------|--------------|--------------|
| Free | 20 | 1,000 |
| Pro | 100 | 10,000 |
| Enterprise | Custom | Custom |

**429 Responses**: When rate limited, the API returns:
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

### Handling Rate Limits

The MCP server will return rate limit errors to the client. Your MCP client (Claude Desktop, OpenClaw) should:

1. Display the error to the user
2. Retry after the `retry_after` period
3. Consider caching frequently accessed memories

---

## 🛡️ Security Checklist

Use this checklist when deploying the MCP server:

### Configuration

- [ ] API key stored in environment variable (not hardcoded)
- [ ] Configuration file permissions set to 600 (owner read/write only)
- [ ] Different API keys for different environments (dev/prod)
- [ ] `MEMORYRELAY_LOG_LEVEL` set to `info` or `error` in production
- [ ] Custom `MEMORYRELAY_AGENT_ID` configured (optional but recommended)

### Environment

- [ ] Node.js version 18+ (22+ recommended)
- [ ] MCP client is up to date (Claude Desktop, OpenClaw)
- [ ] Server runs with minimal privileges (not root/admin)
- [ ] Network connectivity to `api.memoryrelay.net` confirmed

### Monitoring

- [ ] Server logs reviewed regularly for errors
- [ ] API key usage monitored via MemoryRelay dashboard
- [ ] Unusual activity alerts configured (if available)
- [ ] Regular API key rotation schedule established

### Response Plan

- [ ] Procedure documented for API key compromise
- [ ] Backup MCP client configuration saved securely
- [ ] Contact information for MemoryRelay support saved
- [ ] Incident response plan includes MCP server logs

---

## 🚨 Security Issues

### Reporting Vulnerabilities

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email security@memoryrelay.net with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

3. Allow 90 days for response and patch before public disclosure

### Security Updates

Monitor for security updates:

- **GitHub Releases**: https://github.com/memoryrelay/mcp-server/releases
- **npm Security Advisories**: `npm audit` in the project directory
- **Dependencies**: Regularly run `npm update` and `npm audit fix`

### Known Limitations

Current known limitations:

1. **No built-in encryption**: Memory content is encrypted at rest by the API, but not additionally encrypted by the MCP server
2. **No client authentication**: MCP protocol doesn't provide client authentication (trust your MCP client)
3. **No request signing**: API requests are authenticated via API key only
4. **No rate limit caching**: Server doesn't cache rate limit state

These are either API-level concerns or MCP protocol limitations, not server bugs.

---

## 🔧 Advanced Security Configuration

### Custom API Endpoint

For self-hosted MemoryRelay deployments:

```json
{
  "env": {
    "MEMORYRELAY_API_URL": "https://memory.internal.company.com",
    "MEMORYRELAY_API_KEY": "mem_prod_xxxxx"
  }
}
```

**Security Note:** Always use HTTPS for custom endpoints.

### Network Isolation

For high-security environments:

1. Use a firewall to restrict outbound connections to `api.memoryrelay.net` only
2. Use a proxy server for MCP server traffic (set `HTTPS_PROXY` env var)
3. Consider running MCP server in a sandboxed environment (Docker, VM)

### Audit Logging

To enable comprehensive audit logging:

```bash
# Run MCP server with debug logging redirected to a file
# (Your MCP client must support this - OpenClaw does)

# In openclaw.json:
{
  "mcpServers": {
    "memoryrelay": {
      "command": "bash",
      "args": ["-c", "npx -y @memoryrelay/mcp-server 2>> /var/log/memoryrelay-mcp.log"],
      "env": {
        "MEMORYRELAY_LOG_LEVEL": "debug",
        "MEMORYRELAY_API_KEY": "mem_prod_xxxxx"
      }
    }
  }
}
```

**Warning:** Debug logs may contain sensitive information. Protect log files appropriately.

---

## 📚 Further Reading

- [MCP Security Best Practices](https://modelcontextprotocol.io/security)
- [MemoryRelay API Documentation](https://api.memoryrelay.net/docs)
- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Last Updated:** 2026-02-12  
**Version:** 0.1.0
