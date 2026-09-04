"""Post-install helper: set up Devin MCP symlink AND install VS Code extension.

Usage:
    jama-post-install                   # Full setup (symlink + extension)
    jama-post-install --check           # Check status without making changes
    jama-post-install --skip-extension  # Symlink only, skip VS Code install

Run once after `pip install jama-connect`. Safe to run multiple times.

Actions:
  1. Creates ~/.devin/mcp-servers/jama-connect -> <site-packages>/jama_mcp_v2/..
  2. Installs the bundled jama-editor.vsix via `code --install-extension`
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import argparse
from pathlib import Path


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def get_package_dir() -> Path:
    """Find the installed jama_mcp_v2 package directory."""
    return Path(__file__).parent


def get_bundled_vsix() -> Path:
    """Return the path to the bundled VS Code extension .vsix."""
    return get_package_dir() / "data" / "jama-editor.vsix"


def get_devin_mcp_dir() -> Path:
    """Get the Devin MCP servers directory (~/.devin/mcp-servers/)."""
    home = Path(os.environ.get("USERPROFILE", "~")) if sys.platform == "win32" else Path.home()
    return home / ".devin" / "mcp-servers"


# ---------------------------------------------------------------------------
# Step 1: Devin MCP symlink
# ---------------------------------------------------------------------------

def create_symlink(check_only: bool = False) -> bool:
    """Create or verify symlink from Devin MCP dir to installed package.

    Returns True if the link is (or was already) in place.
    """
    pkg_dir = get_package_dir()
    # Point to the parent of jama_mcp_v2 (contains both jama_mcp_v2 and jama_editor)
    target = pkg_dir.parent
    devin_dir = get_devin_mcp_dir()
    link_path = devin_dir / "jama-connect"

    if check_only:
        if link_path.exists():
            if link_path.is_symlink():
                print(f"  [OK] MCP symlink: {link_path} -> {link_path.resolve()}")
            else:
                print(f"  [OK] MCP directory: {link_path}")
            return True
        else:
            print(f"  [MISSING] MCP link not found: {link_path}")
            return False

    devin_dir.mkdir(parents=True, exist_ok=True)

    if link_path.exists():
        if link_path.is_symlink():
            if link_path.resolve() == target.resolve():
                print(f"  MCP symlink already correct: {link_path}")
                return True
            else:
                print(f"  Updating MCP symlink: {link_path}")
                link_path.unlink()
        else:
            print(f"  WARNING: {link_path} exists and is not a symlink, skipping")
            return True  # non-fatal

    try:
        os.symlink(str(target), str(link_path), target_is_directory=True)
        print(f"  Created MCP symlink: {link_path} -> {target}")
        return True
    except OSError as exc:
        if sys.platform == "win32" and "privilege" in str(exc).lower():
            print("  Symlink needs admin rights — trying junction (no elevation needed)...")
            try:
                subprocess.run(
                    ["cmd", "/c", "mklink", "/J", str(link_path), str(target)],
                    check=True, capture_output=True,
                )
                print(f"  Created junction: {link_path} -> {target}")
                return True
            except subprocess.CalledProcessError as e2:
                print(f"  ERROR creating junction: {e2}", file=sys.stderr)
                return False
        else:
            print(f"  ERROR creating symlink: {exc}", file=sys.stderr)
            return False


# ---------------------------------------------------------------------------
# Step 2: VS Code extension install
# ---------------------------------------------------------------------------

def _find_code_binary() -> str | None:
    """Find the `code` CLI binary. Returns the command string or None."""
    if sys.platform == "win32":
        # On Windows, shutil.which misses extensionless scripts; try .cmd variants first,
        # then fully-qualified paths for the standard VS Code install location.
        candidates = [
            "code.cmd",
            "code-insiders.cmd",
            "code",
            r"C:\Program Files\Microsoft VS Code\bin\code.cmd",
            r"C:\Program Files (x86)\Microsoft VS Code\bin\code.cmd",
        ]
        localappdata = os.environ.get("LOCALAPPDATA", "")
        if localappdata:
            candidates += [
                os.path.join(localappdata, "Programs", "Microsoft VS Code", "bin", "code.cmd"),
                os.path.join(localappdata, "Programs", "Microsoft VS Code Insiders", "bin", "code-insiders.cmd"),
            ]
    else:
        candidates = ["code", "code-insiders"]

    for candidate in candidates:
        found = shutil.which(candidate)
        if found:
            return found
        if Path(candidate).exists():
            return candidate
    return None


def install_vscode_extension(check_only: bool = False) -> bool:
    """Install the bundled jama-editor.vsix via the `code` CLI.

    Returns True if the extension is (or was just) installed successfully.
    """
    vsix = get_bundled_vsix()
    if not vsix.exists():
        print(f"  WARNING: Bundled .vsix not found at {vsix} — skipping extension install")
        return False

    code_bin = _find_code_binary()
    if not code_bin:
        print("  WARNING: `code` CLI not found in PATH — skipping extension install")
        print("  To install manually: code --install-extension <path/to/jama-editor.vsix>")
        print(f"  VSIX location: {vsix}")
        return False

    if check_only:
        # Check if extension is already installed
        try:
            result = subprocess.run(
                [code_bin, "--list-extensions"],
                capture_output=True, text=True, timeout=15,
            )
            installed = "enphase.jama-editor" in result.stdout
            if installed:
                print(f"  [OK] VS Code extension: enphase.jama-editor is installed")
            else:
                print(f"  [MISSING] VS Code extension: enphase.jama-editor not found")
            return installed
        except Exception as e:
            print(f"  WARNING: Could not check extension status: {e}")
            return False

    print(f"  Installing VS Code extension from {vsix} ...")
    try:
        result = subprocess.run(
            [code_bin, "--install-extension", str(vsix), "--force"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            print("  VS Code extension installed successfully.")
            return True
        else:
            print(f"  WARNING: Extension install returned {result.returncode}")
            if result.stderr:
                print(f"    stderr: {result.stderr.strip()}")
            return False
    except subprocess.TimeoutExpired:
        print("  WARNING: Extension install timed out (60 s) — try manually:")
        print(f"    code --install-extension \"{vsix}\" --force")
        return False
    except Exception as e:
        print(f"  WARNING: Could not install extension: {e}")
        print(f"  To install manually: code --install-extension \"{vsix}\" --force")
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_setup(check_only: bool = False, skip_extension: bool = False) -> None:
    """Run the full post-install setup."""
    print("=== jama-connect post-install setup ===")

    print("\n[1/2] Devin MCP symlink")
    create_symlink(check_only=check_only)

    if not skip_extension:
        print("\n[2/2] VS Code extension (jama-editor)")
        install_vscode_extension(check_only=check_only)
    else:
        print("\n[2/2] VS Code extension — skipped (--skip-extension)")

    print("\nDone. Reload VS Code/Windsurf/Devin to activate the extension.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="jama-connect post-install: create Devin MCP link and install VS Code extension"
    )
    parser.add_argument("--check", action="store_true", help="Check status only, make no changes")
    parser.add_argument("--skip-extension", action="store_true", help="Skip VS Code extension install")
    args = parser.parse_args()
    run_setup(check_only=args.check, skip_extension=args.skip_extension)


if __name__ == "__main__":
    main()
