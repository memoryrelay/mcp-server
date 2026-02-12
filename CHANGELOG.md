# Changelog

All notable changes to the MemoryRelay MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/memoryrelay/mcp-server/compare/v0.1.5...HEAD
[0.1.5]: https://github.com/memoryrelay/mcp-server/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/memoryrelay/mcp-server/releases/tag/v0.1.4
