# VS Code Extension Bundling Strategy

This document explores how to bundle the jama-connect pip package with the VS Code extension.

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  pip install jama-connect                                   │
├─────────────────────────────────────────────────────────────┤
│  ✓ Python backend (MCP + REST API)                          │
│  ✓ Next.js viewer (static files)                            │
│  ✓ VS Code extension source (TypeScript)                    │
│  ✗ Extension NOT automatically installed in VS Code         │
└─────────────────────────────────────────────────────────────┘
```

## Goal

Make the pip package automatically install the VS Code extension when users run `jama-editor`.

## Approaches

### Approach 1: Extension Installer Command (Recommended)

**How it works:**
1. Build the extension to a `.vsix` file during package build
2. Include the `.vsix` in the wheel
3. `jama-editor` command extracts and installs the `.vsix` via `code --install-extension`

**Pros:**
- Simple, no external dependencies
- Works offline
- Users get the exact version bundled with the pip package
- Can be installed to any VS Code installation

**Cons:**
- Requires VS Code CLI to be available
- User must have VS Code installed

**Implementation:**

```python
# src/jama_editor/installer.py
import subprocess
import sys
from pathlib import Path

def install_extension():
    """Install the bundled VS Code extension."""
    vsix_path = Path(__file__).parent / "jama-editor.vsix"
    
    if not vsix_path.exists():
        print(f"ERROR: Extension not found at {vsix_path}")
        sys.exit(1)
    
    try:
        subprocess.run(
            ["code", "--install-extension", str(vsix_path)],
            check=True
        )
        print(f"✓ Extension installed from {vsix_path}")
    except FileNotFoundError:
        print("ERROR: VS Code CLI not found. Install VS Code or add 'code' to PATH")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Failed to install extension: {e}")
        sys.exit(1)
```

### Approach 2: Marketplace Installation

**How it works:**
1. Publish the extension to VS Code Marketplace
2. `jama-editor` command runs `code --install-extension enphase.jama-connect`
3. VS Code downloads and installs from marketplace

**Pros:**
- Users always get latest version
- Automatic updates
- Standard marketplace distribution

**Cons:**
- Requires marketplace account
- Requires internet connection
- Version mismatch possible between pip package and extension

### Approach 3: Hybrid Approach

**How it works:**
1. Bundle `.vsix` in pip package (Approach 1)
2. Also publish to marketplace (Approach 2)
3. `jama-editor` tries bundled version first, falls back to marketplace

**Pros:**
- Works offline with bundled version
- Users can opt-in to marketplace updates
- Best of both worlds

**Cons:**
- More complex
- Potential version confusion

## Recommended Implementation

**Use Approach 1 (Extension Installer) with Approach 3 (Hybrid) as future enhancement.**

### Step 1: Build Extension to VSIX

Update `build-package.ps1`:

```powershell
# In the extension build section:
Write-Host "Packaging extension to VSIX..."
npm run package

# Copy VSIX to src/jama_editor/ for inclusion in wheel
$vsixFile = Get-ChildItem $extDir -Filter "*.vsix" | Select-Object -First 1
if ($vsixFile) {
    Copy-Item $vsixFile.FullName (Join-Path $scriptDir "src\jama_editor\jama-editor.vsix")
    Write-Host "VSIX copied to wheel package"
}
```

### Step 2: Update pyproject.toml

```toml
[tool.hatch.build.targets.wheel.force-include]
"src/jama_editor/jama-editor.vsix" = "jama_editor/jama-editor.vsix"
```

### Step 3: Create Installer Command

```python
# src/jama_editor/installer.py
import subprocess
import sys
from pathlib import Path

def main():
    """Install jama-connect VS Code extension."""
    vsix_path = Path(__file__).parent / "jama-editor.vsix"
    
    if not vsix_path.exists():
        print("ERROR: Extension not found in package")
        print("Try: pip install --force-reinstall jama-connect")
        sys.exit(1)
    
    print(f"Installing jama-connect extension from {vsix_path}...")
    
    try:
        subprocess.run(
            ["code", "--install-extension", str(vsix_path), "--force"],
            check=True
        )
        print("✓ Extension installed successfully!")
        print("✓ Reload VS Code to activate the extension")
    except FileNotFoundError:
        print("ERROR: VS Code CLI not found")
        print("Please ensure VS Code is installed and 'code' is in your PATH")
        print("\nOn Windows, you can add it manually:")
        print("  Add to PATH: C:\\Users\\<username>\\AppData\\Local\\Programs\\Microsoft VS Code\\bin")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"ERROR: Installation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
```

### Step 4: Update Entry Point

```toml
[project.scripts]
jama-connect = "jama_mcp_v2.server:main"
jama-rest = "jama_mcp_v2.server:run_rest"
jama-editor = "jama_editor.installer:main"  # Changed from editor_server:run_editor
```

### Step 5: Update Installation Instructions

```bash
# Install the package
pip install jama-connect

# Install the VS Code extension
jama-editor

# Start the REST API + viewer
jama-rest
```

## Testing the Implementation

```bash
# Build the package
.\build-package.ps1

# Install locally
pip install -e .

# Test the installer
jama-editor

# Verify extension is installed
code --list-extensions | grep jama
```

## Future: Marketplace Publication

Once stable, publish to VS Code Marketplace:

```bash
cd vscode-extension
npm install -g @vscode/vsce
vsce publish
```

Then update installer to support both:

```python
def main():
    """Install jama-connect extension (bundled or from marketplace)."""
    # Try bundled first
    vsix_path = Path(__file__).parent / "jama-editor.vsix"
    if vsix_path.exists():
        install_from_vsix(vsix_path)
    else:
        # Fall back to marketplace
        install_from_marketplace()
```

## Summary

| Approach | Offline | Auto-Update | Complexity | Recommended |
|----------|---------|-------------|-----------|-------------|
| Bundled VSIX | ✓ | ✗ | Low | ✓ |
| Marketplace | ✗ | ✓ | Low | Future |
| Hybrid | ✓ | ✓ | Medium | Future |

**Start with Approach 1 (bundled VSIX), upgrade to Approach 3 (hybrid) after marketplace publication.**
