#!/bin/bash
#
# install.sh — macOS unified installer for jama-mcp-v2.
#
# Checks Python >= 3.12, installs the pip package from internal PyPI,
# and optionally installs the launchd login service.
#
# Usage:
#   curl -sSf <url>/install.sh | bash
#   # or locally:
#   ./scripts/install.sh
#

set -euo pipefail

PYPI_URL="http://nz-lnx-01/pypi"
PACKAGE="jama-mcp-v2"
MIN_PYTHON_MAJOR=3
MIN_PYTHON_MINOR=12
PORT=8765

echo "============================================"
echo "  Jama MCP v2 — macOS Installer"
echo "============================================"
echo ""

# ---------- Check Python ----------
PYTHON_CMD=""
for cmd in python3 python; do
    if command -v "$cmd" &>/dev/null; then
        PY_VER=$("$cmd" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
        PY_MAJOR=$(echo "$PY_VER" | cut -d. -f1)
        PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
        if [ "$PY_MAJOR" -ge "$MIN_PYTHON_MAJOR" ] && [ "$PY_MINOR" -ge "$MIN_PYTHON_MINOR" ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python >= ${MIN_PYTHON_MAJOR}.${MIN_PYTHON_MINOR} not found."
    echo ""
    echo "Install Python:"
    echo "  brew install python@3.12"
    echo "  # or download from https://www.python.org/downloads/"
    exit 1
fi

echo "[1/3] Python: $($PYTHON_CMD --version) ($PYTHON_CMD)"

# ---------- Install pip package ----------
echo "[2/3] Installing $PACKAGE from $PYPI_URL..."
"$PYTHON_CMD" -m pip install --upgrade "$PACKAGE" \
    --extra-index-url "$PYPI_URL" \
    --trusted-host nz-lnx-01 \
    --quiet

# Verify installation
if ! command -v jama-rest &>/dev/null; then
    echo ""
    echo "WARNING: 'jama-rest' CLI not on PATH."
    echo "You may need to add ~/.local/bin to your PATH:"
    echo '  export PATH="$HOME/.local/bin:$PATH"'
    echo ""
fi

echo "  Installed: $("$PYTHON_CMD" -m pip show "$PACKAGE" 2>/dev/null | grep Version || echo 'unknown')"
echo ""

# ---------- Optional: install login service ----------
read -rp "[3/3] Install as login service (auto-start at login)? (y/N) " INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" =~ ^[Yy]$ ]]; then
    # Find install-service.sh relative to the installed package
    SCRIPT_DIR="$("$PYTHON_CMD" -c "import jama_mcp_v2, pathlib; print(pathlib.Path(jama_mcp_v2.__file__).parent.parent.parent / 'scripts')" 2>/dev/null || echo "")"

    if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/install-service.sh" ]; then
        bash "$SCRIPT_DIR/install-service.sh" --port "$PORT"
    else
        echo ""
        echo "Login service script not found in pip package."
        echo "Run manually: install-service.sh --port $PORT"
    fi
fi

echo ""
echo "============================================"
echo "  Installation complete!"
echo "============================================"
echo ""
echo "  Start backend:  jama-rest"
echo "  Open viewer:    http://localhost:${PORT}/viewer"
echo "  Configure:      http://localhost:${PORT}/viewer/settings"
echo ""
