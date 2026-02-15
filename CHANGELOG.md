# Changelog

All notable changes to the MemoryRelay MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-02-15

### Fixed
- **CRITICAL**: All memory API endpoints were using wrong paths (`/v1/memories/memories` instead of `/v1/memories`), causing all memory operations (store, search, list, get, update, delete) to fail with 404/422 errors
- Health check endpoint path corrected (`/v1/health` to `/health`)
- Claude Desktop config examples now use `MemoryRelay` display name (was `memoryrelay`)

## [0.1.9] - 2026-02-15

### Added
- Windows-specific Claude Desktop setup instructions using global install + `node` command
- Windows `npx` scoped package troubleshooting guide

### Fixed
- Project structure in README now shows correct `mcp-server/` root (was `mcp/`)
- LICENSE link in README (was `../LICENSE`, now `./LICENSE`)
- CONTRIBUTING link replaced with direct GitHub link (file did not exist)
- "Getting Help" documentation link fixed (was pointing to non-existent `mcp` subdirectory)
- Added missing `tsup.config.ts`, `CHANGELOG.md`, and `LICENSE` to project structure diagram

## [0.1.8] - 2026-02-15

### Added
- MCP resources: `memory:///recent` and `memory:///{id}` resource templates for direct memory access
- MCP prompts: `store_memory`, `recall_memories`, `summarize_memories` prompt templates
- `OPENCLAW_AGENT_NAME` environment variable support for agent ID detection
- Additional `mcp-server` bin entry for proper `npx @memoryrelay/mcp-server` execution

### Fixed
- Server version now dynamically read from package.json at build time (was hardcoded as 0.1.0)
- Error help URL now points to correct repository (memoryrelay/mcp-server)
- GitHub Release install commands now use scoped package name
- All TypeScript strict mode errors resolved (14 errors in server.ts and client.ts)
- Clone path in README development section

### Changed
- Updated signup URL to memoryrelay.ai (correct website)
- Clarified Links section with separate Website and API URLs

## [0.1.6] - 2026-02-12

### Changed
- **BREAKING**: Package name changed to `@memoryrelay/mcp-server` (scoped)
- Updated all documentation links to memoryrelay organization
- Updated author to "MemoryRelay Team"
- Improved API key signup instructions
- Binary name now `memoryrelay-mcp-server` (matches old flat package)

### Added
- LICENSE file (MIT)
- CI/CD workflow badge to README

## [0.1.5] - 2026-02-12

### Changed
- Updated repository URLs to memoryrelay organization
- Migrated from Alteriom/ai-memory-service to memoryrelay/mcp-server

## [0.1.4] - 2026-02-12

### Added
- Initial production release
- 9 MCP tools: memory_store, memory_search, memory_list, memory_get, memory_update, memory_delete, entity_create, entity_link, memory_health
- Full test coverage (102 tests)
- Entity tracking and relationships
- Health checks
- TypeScript implementation

### Security
- API key authentication
- Input validation
- Rate limiting support

[Unreleased]: https://github.com/memoryrelay/mcp-server/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/memoryrelay/mcp-server/compare/v0.1.9...v0.2.0
[0.1.9]: https://github.com/memoryrelay/mcp-server/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/memoryrelay/mcp-server/compare/v0.1.6...v0.1.8
[0.1.6]: https://github.com/memoryrelay/mcp-server/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/memoryrelay/mcp-server/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/memoryrelay/mcp-server/releases/tag/v0.1.4
