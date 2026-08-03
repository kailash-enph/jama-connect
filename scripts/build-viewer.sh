#!/bin/bash
#
# build-viewer.sh — Build the Next.js viewer as a static export
#                    and copy output into the Python package for wheel inclusion.
#
# Prerequisites: Node.js >= 18, npm
#
# Usage:
#   ./scripts/build-viewer.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
VIEWER_DIR="$PROJECT_DIR/jama-viewer"
TARGET_DIR="$PROJECT_DIR/src/jama_mcp_v2/viewer_static"

echo "============================================"
echo "  Build Jama Viewer — Static Export"
echo "============================================"
echo ""

# Check prerequisites
if ! command -v node &>/dev/null; then
    echo "ERROR: Node.js not found. Install Node.js >= 18."
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Node.js >= 18 required (found v$NODE_VERSION)."
    exit 1
fi

echo "  Node.js: $(node --version)"
echo "  npm:     $(npm --version)"
echo "  Viewer:  $VIEWER_DIR"
echo "  Output:  $TARGET_DIR"
echo ""

# Install dependencies
echo "[1/3] Installing npm dependencies..."
cd "$VIEWER_DIR"
npm ci --silent

# Build static export
echo "[2/3] Building static export..."
npm run build

# Copy to Python package
echo "[3/3] Copying to Python package..."
rm -rf "$TARGET_DIR"
cp -r "$VIEWER_DIR/out" "$TARGET_DIR"

# Count files
FILE_COUNT=$(find "$TARGET_DIR" -type f | wc -l | tr -d ' ')
SIZE=$(du -sh "$TARGET_DIR" | cut -f1)

echo ""
echo "Build complete!"
echo "  Files: $FILE_COUNT"
echo "  Size:  $SIZE"
echo "  Path:  $TARGET_DIR"
echo ""
echo "Next: build the pip wheel with 'uv build' or 'python -m build'"
