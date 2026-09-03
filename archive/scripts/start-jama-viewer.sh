#!/bin/bash
#
# start-jama-viewer.sh — Launch the Jama backend + open viewer in browser.
#
# macOS equivalent of start-jama-viewer.bat.
# If the backend is already running (e.g. via Launch Agent), skips starting it.
#
# Usage:
#   ./start-jama-viewer.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Configuration
JAMA_URL="https://enphase.jamacloud.com"
JAMA_REST_PORT="${JAMA_REST_PORT:-8765}"

echo "============================================"
echo "  Jama Viewer — Starting Backend + Frontend"
echo "============================================"
echo ""

# Check if backend is already running
HEALTH_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost:${JAMA_REST_PORT}/api/health" 2>/dev/null || echo "000")

if [ "$HEALTH_CODE" = "200" ]; then
    echo "[1/2] Backend already running on port ${JAMA_REST_PORT} — skipping start."
else
    echo "[1/2] Starting unified backend on port ${JAMA_REST_PORT}..."

    # Determine how to start the backend
    if command -v jama-mcp-v2 &>/dev/null; then
        jama-mcp-v2 --rest-only --port "$JAMA_REST_PORT" &
    elif command -v uv &>/dev/null; then
        (cd "$PROJECT_DIR" && uv run --link-mode=copy python -m jama_mcp_v2 --rest-only --port "$JAMA_REST_PORT") &
    else
        echo "ERROR: Neither 'jama-mcp-v2' nor 'uv' found on PATH."
        exit 1
    fi

    BACKEND_PID=$!
    echo "     Backend PID: $BACKEND_PID"
    echo "     Waiting for backend..."
    sleep 5
fi

# Open viewer in browser
VIEWER_URL="http://localhost:${JAMA_REST_PORT}/viewer"
echo "[2/2] Opening viewer..."
echo ""
echo "  Backend:  http://localhost:${JAMA_REST_PORT}"
echo "  Health:   http://localhost:${JAMA_REST_PORT}/api/health"
echo "  Viewer:   ${VIEWER_URL}"
echo "  Settings: ${VIEWER_URL}/settings"
echo ""

open "$VIEWER_URL" 2>/dev/null || xdg-open "$VIEWER_URL" 2>/dev/null || echo "Open ${VIEWER_URL} in your browser."

echo "Press Ctrl+C to stop."

# If we started the backend, wait for it
if [ -n "${BACKEND_PID:-}" ]; then
    trap "echo 'Stopping backend...'; kill $BACKEND_PID 2>/dev/null || true; exit 0" INT TERM
    wait "$BACKEND_PID"
else
    echo "Backend running as service — this script can be closed."
fi
