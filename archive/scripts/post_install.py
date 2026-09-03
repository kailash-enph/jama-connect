"""Post-install script: create symlink in Devin's MCP server directory.

Usage:
    jama-post-install          # Auto-detect and create symlink
    jama-post-install --check  # Check if symlink exists

Creates: ~/.devin/mcp-servers/jama-connect -> <site-packages>/jama_mcp_v2/..
"""

import os
import sys
import argparse
from pathlib import Path


def get_package_dir() -> Path:
    """Find the installed jama_mcp_v2 package directory."""
    try:
        import jama_mcp_v2
        return Path(jama_mcp_v2.__file__).parent
    except ImportError:
        print("ERROR: jama-connect is not installed.", file=sys.stderr)
        sys.exit(1)


def get_devin_mcp_dir() -> Path:
    """Get the Devin MCP servers directory."""
    if sys.platform == "win32":
        home = Path(os.environ.get("USERPROFILE", "~"))
    else:
        home = Path.home()
    return home / ".devin" / "mcp-servers"


def create_symlink(check_only: bool = False) -> None:
    """Create or verify symlink from Devin MCP dir to installed package."""
    pkg_dir = get_package_dir()
    # Point to the parent of jama_mcp_v2 (which contains both jama_mcp_v2 and jama_editor)
    target = pkg_dir.parent
    devin_dir = get_devin_mcp_dir()
    link_path = devin_dir / "jama-connect"

    if check_only:
        if link_path.exists():
            if link_path.is_symlink():
                actual = link_path.resolve()
                print(f"OK: Symlink exists: {link_path} -> {actual}")
            else:
                print(f"OK: Directory exists: {link_path}")
        else:
            print(f"NOT FOUND: {link_path}")
        return

    # Create parent directory
    devin_dir.mkdir(parents=True, exist_ok=True)

    if link_path.exists():
        if link_path.is_symlink():
            existing_target = link_path.resolve()
            if existing_target == target.resolve():
                print(f"Symlink already correct: {link_path} -> {target}")
                return
            else:
                print(f"Updating symlink: {link_path}")
                link_path.unlink()
        else:
            print(f"WARNING: {link_path} exists and is not a symlink, skipping")
            return

    try:
        os.symlink(str(target), str(link_path), target_is_directory=True)
        print(f"Created symlink: {link_path} -> {target}")
    except OSError as exc:
        if sys.platform == "win32" and "privilege" in str(exc).lower():
            print(f"WARNING: Cannot create symlink (need admin or Developer Mode): {exc}")
            print("  Fallback: copying directory instead...")
            import shutil
            shutil.copytree(str(target), str(link_path), dirs_exist_ok=True)
            print(f"  Copied: {target} -> {link_path}")
        else:
            print(f"ERROR: Failed to create symlink: {exc}", file=sys.stderr)
            sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Create Devin MCP symlink for jama-connect")
    parser.add_argument("--check", action="store_true", help="Only check if symlink exists")
    args = parser.parse_args()
    create_symlink(check_only=args.check)


if __name__ == "__main__":
    main()
