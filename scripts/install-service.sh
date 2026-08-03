#!/bin/bash
#
# install-service.sh — Install the Jama MCP Backend as a macOS Launch Agent.
#
# The backend will start automatically at login for the current user,
# with keep-alive (auto-restart on crash).
#
# Prerequisites:
#   - Python >= 3.12 with jama-mcp-v2 installed (pip install jama-mcp-v2)
#     OR uv on PATH with the jama-mcp-v2 project directory
#
# Usage:
#   ./install-service.sh              # Install with defaults (port 8765)
#   ./install-service.sh --port 9000  # Custom port
#   ./install-service.sh --uninstall  # Remove the launch agent
#

set -euo pipefail

LABEL="com.enphase.jama-backend"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_DIR="$HOME/.jama-mcp-v2/logs"
PORT=8765
UNINSTALL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port)
            PORT="$2"
            shift 2
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--port PORT] [--uninstall]"
            echo "  --port PORT    REST API port (default: 8765)"
            echo "  --uninstall    Remove the launch agent"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# --- Uninstall ---
if $UNINSTALL; then
    if launchctl list 2>/dev/null | grep -q "$LABEL"; then
        echo "Unloading launch agent..."
        launchctl unload "$PLIST_PATH" 2>/dev/null || true
    fi
    if [ -f "$PLIST_PATH" ]; then
        rm -f "$PLIST_PATH"
        echo "Removed $PLIST_PATH"
    else
        echo "Launch agent not installed."
    fi
    # Try graceful shutdown
    if curl -sf -o /dev/null "http://localhost:${PORT}/api/health" 2>/dev/null; then
        curl -sf -X POST "http://localhost:${PORT}/settings/server/stop" 2>/dev/null || true
        echo "Sent stop signal to backend."
        sleep 2
    fi
    # Clean up PID file
    PID_FILE="$HOME/.jama-mcp-v2/backend.pid"
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
    echo "Jama MCP Backend launch agent uninstalled."
    exit 0
fi

# --- Install ---
echo "============================================"
echo "  Jama MCP Backend — macOS Launch Agent"
echo "============================================"
echo ""

# Resolve script directory and project directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Determine the command to run the backend
# Priority: 1) jama-mcp-v2 CLI on PATH (pip install), 2) uv in project dir
PROGRAM_ARGS=""
PROGRAM_PATH=""
WORKING_DIR="$PROJECT_DIR"

if command -v jama-mcp-v2 &>/dev/null; then
    PROGRAM_PATH="$(command -v jama-mcp-v2)"
    PROGRAM_ARGS="--rest-only --port ${PORT}"
    echo "  Mode:    pip-installed CLI"
    echo "  Binary:  $PROGRAM_PATH"
elif command -v uv &>/dev/null; then
    PROGRAM_PATH="$(command -v uv)"
    PROGRAM_ARGS="run --link-mode=copy python -m jama_mcp_v2 --rest-only --port ${PORT}"
    echo "  Mode:    uv (dev mode)"
    echo "  uv:      $PROGRAM_PATH"
    echo "  Project: $PROJECT_DIR"
else
    echo "ERROR: Neither 'jama-mcp-v2' nor 'uv' found on PATH."
    echo ""
    echo "Install one of:"
    echo "  pip install jama-mcp-v2 --extra-index-url http://nz-lnx-01/pypi"
    echo "  curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

echo "  Port:    $PORT"
echo ""

# Create log directory
mkdir -p "$LOG_DIR"

# Unload existing agent if present
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
    echo "Removing existing launch agent..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# Create LaunchAgents directory if needed
mkdir -p "$HOME/Library/LaunchAgents"

# Generate plist
cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${PROGRAM_PATH}</string>
PLIST_EOF

# Add each argument as a separate <string> element
for arg in $PROGRAM_ARGS; do
    echo "        <string>${arg}</string>" >> "$PLIST_PATH"
done

cat >> "$PLIST_PATH" << PLIST_EOF
    </array>

    <key>WorkingDirectory</key>
    <string>${WORKING_DIR}</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>${LOG_DIR}/service.log</string>

    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/service.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin:${HOME}/.local/bin:${HOME}/.cargo/bin</string>
    </dict>

    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST_EOF

# Load the agent
launchctl load "$PLIST_PATH"

echo ""
echo "Launch agent '${LABEL}' installed successfully!"
echo ""
echo "  Agent starts at login and auto-restarts on crash."
echo "  Log file:   ${LOG_DIR}/service.log"
echo "  To stop:    launchctl unload ${PLIST_PATH}"
echo "  To remove:  $0 --uninstall"
echo ""

# Offer to start now
read -rp "Start the backend now? (y/N) " START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    launchctl start "$LABEL"
    echo "Agent started. Backend should be available at http://localhost:${PORT} in a few seconds."
fi
