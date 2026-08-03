#!/bin/bash
# Build jama-connect package with viewer and VS Code extension
# This script:
# 1. Builds the Next.js viewer (static export)
# 2. Builds the VS Code extension
# 3. Packages everything into a wheel

set -e

SKIP_VIEWER=false
SKIP_EXTENSION=false
SKIP_WHEEL=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-viewer)
            SKIP_VIEWER=true
            shift
            ;;
        --skip-extension)
            SKIP_EXTENSION=true
            shift
            ;;
        --skip-wheel)
            SKIP_WHEEL=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "\033[0;32mBuilding jama-connect package...\033[0m"

# 1. Build Viewer (Next.js static export)
if [ "$SKIP_VIEWER" = false ]; then
    echo -e "\n\033[0;36m[1/3] Building Next.js viewer...\033[0m"
    
    VIEWER_DIR="$SCRIPT_DIR/viewer"
    if [ -d "$VIEWER_DIR" ]; then
        cd "$VIEWER_DIR"
        
        echo "Installing viewer dependencies..."
        npm ci
        
        echo "Building static export..."
        npm run build
        
        # Copy built files to viewer_static
        OUT_DIR="$VIEWER_DIR/out"
        STATIC_DIR="$SCRIPT_DIR/src/jama_mcp_v2/viewer_static"
        
        if [ -d "$OUT_DIR" ]; then
            echo "Copying static files to $STATIC_DIR"
            rm -rf "$STATIC_DIR"
            cp -r "$OUT_DIR" "$STATIC_DIR"
            echo -e "\033[0;32mViewer built successfully!\033[0m"
        else
            echo -e "\033[0;31mERROR: Viewer build output not found at $OUT_DIR\033[0m"
            exit 1
        fi
        
        cd "$SCRIPT_DIR"
    else
        echo -e "\033[0;33mWARNING: Viewer directory not found at $VIEWER_DIR\033[0m"
    fi
fi

# 2. Build VS Code Extension
if [ "$SKIP_EXTENSION" = false ]; then
    echo -e "\n\033[0;36m[2/3] Building VS Code extension...\033[0m"
    
    EXT_DIR="$SCRIPT_DIR/vscode-extension"
    if [ -d "$EXT_DIR" ]; then
        cd "$EXT_DIR"
        
        echo "Installing extension dependencies..."
        npm ci
        
        echo "Compiling extension..."
        npm run compile
        
        echo "Packaging extension..."
        npm run package
        
        # Copy VSIX to src/jama_editor/ for inclusion in wheel
        VSIX_FILE=$(find "$EXT_DIR" -name "*.vsix" -type f | head -n 1)
        if [ -n "$VSIX_FILE" ]; then
            cp "$VSIX_FILE" "$SCRIPT_DIR/src/jama_editor/jama-editor.vsix"
            echo -e "\033[0;32mExtension packaged: $(basename "$VSIX_FILE")\033[0m"
        fi
        
        cd "$SCRIPT_DIR"
    else
        echo -e "\033[0;33mWARNING: Extension directory not found at $EXT_DIR\033[0m"
    fi
fi

# 3. Build Python Wheel
if [ "$SKIP_WHEEL" = false ]; then
    echo -e "\n\033[0;36m[3/3] Building Python wheel...\033[0m"
    
    cd "$SCRIPT_DIR"
    
    echo "Building wheel with uv..."
    uv build
    
    WHEEL_FILE=$(find "$SCRIPT_DIR/dist" -name "*.whl" -type f | head -n 1)
    if [ -n "$WHEEL_FILE" ]; then
        echo -e "\033[0;32mWheel built successfully: $(basename "$WHEEL_FILE")\033[0m"
        echo -e "\n\033[0;36mTo install locally:\033[0m"
        echo -e "  \033[0;37mpip install dist/$(basename "$WHEEL_FILE")\033[0m"
        echo -e "\n\033[0;36mTo publish to PyPI:\033[0m"
        echo -e "  \033[0;37mtwine upload --repository-url http://nz-lnx-01/pypi dist/$(basename "$WHEEL_FILE")\033[0m"
    else
        echo -e "\033[0;31mERROR: Wheel build failed\033[0m"
        exit 1
    fi
fi

echo -e "\n\033[0;32mjama-connect build complete!\033[0m"
