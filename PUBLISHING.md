# MCP Server Publishing Guide

`@memoryrelay/mcp-server` is **not published from this repository** any more.

The package source moved to [`memoryrelay/api`](https://github.com/memoryrelay/api)
under `mcp/`, and versions from 0.6.0 onward are published there by
`.github/workflows/mcp-publish.yml`. To publish one:

1. Bump `mcp/package.json` (and its lockfile) in `memoryrelay/api` and merge to `main`.
2. Publish a GitHub release on `memoryrelay/api` tagged `mcp-vX.Y.Z`, matching that version.
3. The workflow builds, tests and publishes with npm provenance. To re-publish an
   existing tag, run the workflow manually from `main` with `tag: mcp-vX.Y.Z`.

This repository keeps its build and test job, but has no publish job. Its
`package.json` is marked `private` so that a manual `npm publish` from a
checkout here is refused, and `release.sh` only prints these directions.
