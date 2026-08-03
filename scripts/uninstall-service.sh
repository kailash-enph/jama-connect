#!/bin/bash
#
# uninstall-service.sh — Remove the Jama MCP Backend macOS Launch Agent
#                        and stop the running backend.
#
# Usage:
#   ./uninstall-service.sh
#

set -euo pipefail

LABEL="com.enphase.jama-backend"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
PID_FILE="$HOME/.jama-mcp-v2/backend.pid"
PORT=8765

# Unload the agent if loaded
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
    echo "Stopping launch agent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    sleep 2
    echo "Launch agent unloaded."
else
    echo "Launch agent '${LABEL}' is not loaded."
fi

# Remove plist file
if [ -f "$PLIST_PATH" ]; then
    rm -f "$PLIST_PATH"
    echo "Removed $PLIST_PATH"
else
    echo "Plist file does not exist."
fi

# Try graceful shutdown via REST API
if curl -sf -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
    curl -sf -X POST "http://localhost:${PORT}/settings/server/stop" 2>/dev/null || true
    echo "Sent stop signal to backend."
    sleep 2
else
    echo "Backend not running or already stopped."
fi

# Clean up PID file
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE" 2>/dev/null || true)
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Killing remaining backend process (PID $OLD_PID)..."
        kill "$OLD_PID" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
    echo "Cleaned up PID file."
fi

echo ""
echo "Jama MCP Backend service uninstalled."
