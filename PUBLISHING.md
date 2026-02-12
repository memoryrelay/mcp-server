# MCP Server Publishing Quick Reference

## 🚀 Publishing Checklist

### Pre-Publishing Setup (One-Time)

1. **Configure GitHub Secrets** (Settings → Secrets and variables → Actions)
   ```
   NPM_TOKEN=npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
   
   Optional for integration tests:
   ```
   MEMORYRELAY_TEST_API_KEY=mem_test_xxxxx
   MEMORYRELAY_TEST_API_URL=https://api.memoryrelay.net
   ```

2. **Verify npm Account**
   - Organization: `@memoryrelay`
   - Package name available: `@memoryrelay/mcp-server`
   - Account has publish rights

### Publishing a Release

#### Method 1: GitHub Release (Recommended)

1. **Update version** in `mcp/package.json`:
   ```json
   {
     "version": "0.1.0"  // Change this
   }
   ```

2. **Commit and push**:
   ```bash
   git add mcp/package.json
   git commit -m "Bump version to 0.1.0"
   git push
   ```

3. **Create and push tag**:
   ```bash
   git tag mcp-v0.1.0
   git push origin mcp-v0.1.0
   ```

4. **Create GitHub Release**:
   - Go to: https://github.com/Alteriom/ai-memory-service/releases/new
   - Tag: `mcp-v0.1.0` (select the tag you just pushed)
   - Title: `MCP Server v0.1.0`
   - Description: Release notes
   - Click "Publish release"

5. **Workflow runs automatically**:
   - CI tests run
   - Package is built
   - Published to npm
   - Package is verified
   - Tarball attached to release

#### Method 2: Manual Workflow (For Testing)

1. Go to: Actions → Publish MCP Server → Run workflow
2. Set parameters:
   - `tag`: `mcp-v0.1.0`
   - `dry_run`: `true` (for testing) or `false` (for real publish)
3. Click "Run workflow"

### Version Numbering

**Format:** `mcp-vX.Y.Z[-suffix]`

- `mcp-v0.1.0` - Stable release
- `mcp-v0.1.0-beta` - Beta release
- `mcp-v0.2.0-alpha.1` - Alpha release

**Semantic Versioning:**
- Major (`X`): Breaking changes
- Minor (`Y`): New features (backward compatible)
- Patch (`Z`): Bug fixes

### Post-Publishing

1. **Verify on npm**:
   ```bash
   npm view @memoryrelay/mcp-server
   ```

2. **Test installation**:
   ```bash
   npx @memoryrelay/mcp-server --help
   ```

3. **Update documentation** if needed:
   - Update version references in README.md
   - Update changelog

---

## 🧪 Testing Before Publishing

### Local Testing

```bash
cd mcp

# Build
npm run build

# Run all tests
npm test

# Package validation
npm pack --dry-run

# Test package contents
npm pack
npm install -g ./memoryrelay-mcp-server-0.1.0.tgz
memoryrelay-mcp --help
npm uninstall -g @memoryrelay/mcp-server
```

### CI/CD Testing

Push to a branch and open a PR:
```bash
git checkout -b test-publish
# Make changes
git commit -am "Test changes"
git push origin test-publish
```

CI will run automatically on PRs.

### Dry-Run Publishing

Use manual workflow with `dry_run: true` to simulate publishing without actually publishing.

---

## 🔧 CI/CD Workflows

### mcp-ci.yml (Continuous Integration)

**Triggers:**
- Push to `main` or `develop` (with `mcp/**` changes)
- Pull requests (with `mcp/**` changes)

**Jobs:**
- Test on Node 18, 20, 22
- Security audit
- Package validation
- Lint/type checking

### mcp-publish.yml (Publishing)

**Triggers:**
- GitHub release published (tag: `mcp-v*`)
- Manual workflow dispatch

**Jobs:**
- Validate tag format
- Verify version matches tag
- Run tests
- Build
- Publish to npm
- Verify published package
- Create summary

---

## 📋 Troubleshooting

### Publishing Fails: Version Mismatch

**Error:** `package.json version doesn't match tag version`

**Fix:**
1. Update `mcp/package.json` version
2. Commit and push
3. Delete and recreate tag:
   ```bash
   git tag -d mcp-v0.1.0
   git push origin :refs/tags/mcp-v0.1.0
   git tag mcp-v0.1.0
   git push origin mcp-v0.1.0
   ```

### Publishing Fails: NPM_TOKEN Invalid

**Error:** `401 Unauthorized`

**Fix:**
1. Generate new npm token: https://www.npmjs.com/settings/tokens
2. Update GitHub secret: `NPM_TOKEN`
3. Re-run workflow

### CI Tests Fail

**Check:**
1. View workflow logs: Actions → MCP Server CI → Failed run
2. Common issues:
   - Outdated dependencies: `npm update` in `mcp/`
   - Type errors: `npm run type-check` in `mcp/`
   - Test failures: `npm test` in `mcp/`

### Package Contents Wrong

**Check:**
```bash
cd mcp
npm pack --dry-run
```

**Fix:** Update `files` array in `package.json`:
```json
{
  "files": [
    "dist",
    "README.md",
    "docs"
  ]
}
```

---

## 📝 Release Notes Template

```markdown
## 🎉 MemoryRelay MCP Server v0.1.0

### ✨ New Features
- Feature 1
- Feature 2

### 🐛 Bug Fixes
- Fix 1
- Fix 2

### 📚 Documentation
- Documentation improvement 1

### 🔧 Internal
- Internal change 1

### 📦 Installation
\`\`\`bash
npx @memoryrelay/mcp-server
# or
npm install -g @memoryrelay/mcp-server
\`\`\`

### 🔗 Links
- [npm Package](https://www.npmjs.com/package/@memoryrelay/mcp-server)
- [Documentation](https://github.com/Alteriom/ai-memory-service/tree/main/mcp#readme)
- [Security Guide](https://github.com/Alteriom/ai-memory-service/blob/main/mcp/docs/SECURITY.md)
```

---

## 🔐 Security

- Always use GitHub secrets for `NPM_TOKEN`
- Never commit `.npmrc` with actual tokens
- Rotate npm tokens regularly (every 90 days)
- Enable 2FA on npm account
- Review publish workflow before merging changes

---

**Last Updated:** 2026-02-12  
**Current Version:** 0.1.0
