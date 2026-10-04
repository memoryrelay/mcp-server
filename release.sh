#!/bin/bash
# Releases of @memoryrelay/mcp-server no longer come from this repository.
# The package is built and published from memoryrelay/api: bump mcp/package.json
# there, then publish a GitHub release tagged mcp-vX.Y.Z (see that repo's
# mcp/PUBLISHING.md). Tagging here would publish nothing.
echo "This repository no longer publishes @memoryrelay/mcp-server." >&2
echo "Release from memoryrelay/api with a GitHub release tagged mcp-vX.Y.Z." >&2
exit 1
