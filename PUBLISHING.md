# MCP Server Publishing Guide

This package (`@memoryrelay/mcp-server`) is published to npm by the
`.github/workflows/ci-cd.yml` workflow when a **`v*` git tag** is pushed.

## Prerequisites (one-time)

1. **`NPM_TOKEN` GitHub secret** (Settings → Secrets and variables → Actions).
   It must be a token for an npm account that is an **owner** of
   `@memoryrelay/mcp-server` (currently `sparck75`), with **write/publish**
   access — an Automation token, or a Granular token granting read+write to
   this package. A token for any other account fails `npm publish` with a
   misleading `E404` (npm returns 404, not 403, for scoped packages the token
   cannot write). Verify with:
   ```bash
   npm whoami                                   # must be an owner
   npm owner ls @memoryrelay/mcp-server          # lists owners
   ```

2. **Node.js 24+** — the toolchain (vitest 5) and `engines.node` require
   Node >= 24.

## Releasing

Use the helper script from a clean `main`:

```bash
./release.sh [patch|minor|major]   # default: patch
```

It bumps the version (no git tag yet), prompts you to update `CHANGELOG.md`,
commits `chore: Release vX.Y.Z`, creates an annotated `vX.Y.Z` tag, and pushes
`main` + the tag.

Or do it manually:

```bash
npm version <patch|minor|major> --no-git-tag-version
# edit CHANGELOG.md
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main vX.Y.Z
```

> If a `CLAUDE.md`/branch-protection rule forbids pushing to `main` directly,
> land the version bump via a PR first, then tag the merge commit on `main`
> and push only the tag.

## What the tag push triggers (`ci-cd.yml`)

1. **test** job — `npm ci`, lint, `npm test`, build on Node 24.
2. **publish** job (only on `refs/tags/v*`):
   - build,
   - verify the tag version matches `package.json`,
   - `npm publish --access public` using `NPM_TOKEN`,
   - create the GitHub Release.

## Verifying a release

```bash
# Authoritative (bypasses npm-view/CDN lag, which can trail a publish ~1 min):
curl -s https://registry.npmjs.org/@memoryrelay%2Fmcp-server | \
  jq '{latest:.["dist-tags"].latest, has:(.versions["X.Y.Z"]!=null)}'

npm view @memoryrelay/mcp-server version   # once CDN catches up
npx -y @memoryrelay/mcp-server --help
```

The npm publish step prints `+ @memoryrelay/mcp-server@X.Y.Z` on success —
that, and the registry JSON above, are authoritative; `npm view` may lag.

## Troubleshooting

### `npm publish` fails with `E404 ... PUT .../@memoryrelay%2fmcp-server`
The `NPM_TOKEN` account lacks write access to the package (expired token,
read-only/granular token without this package, or an account that is not an
owner). Fix the secret (see Prerequisites), then **re-run only the failed
job** against the existing tag — no need to retag:
```bash
gh run rerun <run-id> --failed
```

### Version mismatch
The publish job fails if the `vX.Y.Z` tag doesn't match `package.json`.
Bump `package.json`, commit, delete and recreate the tag:
```bash
git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z
git tag -a vX.Y.Z -m "Release vX.Y.Z" && git push origin vX.Y.Z
```

### Package contents wrong
Check with `npm pack --dry-run`; adjust the `files` array in `package.json`
(currently `dist`, `README.md`, `docs`).

## Security

- Keep `NPM_TOKEN` in GitHub secrets only; never commit a token or `.npmrc`.
- Prefer a short-lived Automation/Granular token and rotate it regularly.
- Enable 2FA on the npm account (Automation tokens publish under 2FA).
