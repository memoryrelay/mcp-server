#!/bin/bash
# Release script for MemoryRelay MCP Server
# Usage: ./release.sh [major|minor|patch]

set -e

RELEASE_TYPE=${1:-patch}

echo "🚀 MemoryRelay MCP Server Release"
echo "=================================="
echo ""

# Check git status
if ! git diff-index --quiet HEAD --; then
    echo "❌ Error: You have uncommitted changes"
    exit 1
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ Error: Must be on main branch (currently on $CURRENT_BRANCH)"
    exit 1
fi

# Pull latest
echo "📥 Pulling latest changes..."
git pull origin main

# Run tests
echo "🧪 Running tests..."
npm test

# Bump version
echo "📝 Bumping version ($RELEASE_TYPE)..."
NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
NEW_VERSION=${NEW_VERSION#v}

echo "✅ New version: $NEW_VERSION"
echo ""

# Update CHANGELOG
echo "📋 Please update CHANGELOG.md with changes for v$NEW_VERSION"
echo "Press Enter when done..."
read

# Commit version bump
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: Release v$NEW_VERSION"

# Create and push tag
echo "🏷️  Creating tag v$NEW_VERSION..."
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

echo "📤 Pushing to GitHub..."
git push origin main
git push origin "v$NEW_VERSION"

echo ""
echo "✅ Release v$NEW_VERSION complete!"
echo ""
echo "GitHub Actions will now:"
echo "  1. Run tests"
echo "  2. Build the package"
echo "  3. Publish to npm"
echo "  4. Create GitHub release"
echo ""
echo "Monitor: https://github.com/memoryrelay/mcp-server/actions"
