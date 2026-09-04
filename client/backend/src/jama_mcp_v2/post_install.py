"""Post-install helper: repair installation, set up Devin MCP link, install VS Code extension.

Usage:
    jama-post-install                   # Full setup (repair + symlink + extension)
    jama-post-install --check           # Check all steps, make no changes
    jama-post-install --skip-extension  # Symlink only, skip VS Code install
    jama-post-install --repair-only     # Only clean up corrupted/stale dist-infos

Run once after `pip install jama-connect`. Safe to run multiple times.

Steps:
  0. Repair    — remove corrupted ~ama-* entries and stale old dist-infos
  1. Symlink   — create ~/.devin/mcp-servers/jama-connect -> site-packages parent
  2. Extension — install bundled jama-editor.vsix to:
                   a) Devin  (~/.devin/extensions/)  — direct zip extraction
                   b) VS Code (~/.vscode/extensions/) — via `code --install-extension`

Learnings captured:
  - pip --force-reinstall while daemon is running leaves ~ama-* corruption
  - Multiple jama_connect-*.dist-info entries cause wrong `pip show` version
  - Windows junctions != symlinks (os.path.islink / Path.is_symlink return False)
  - code.cmd needed on Windows (shutil.which misses extensionless scripts)
  - Devin uses ~/.devin/extensions/, not ~/.vscode/extensions/
  - code --install-extension targets VS Code only; Devin needs direct extraction
  - Daemon must be stopped before reinstalling the wheel
"""

from __future__ import annotations

import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import sys
import argparse
import zipfile
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


def _all_site_packages() -> list[Path]:
    """Return all site-packages directories on the current Python path."""
    import site
    dirs = []
    for d in site.getsitepackages() + [site.getusersitepackages()]:
        p = Path(d)
        if p.exists():
            dirs.append(p)
    return dirs


# ---------------------------------------------------------------------------
# Step 0: Repair installation
# Cleans up pip artefacts left by:
#   - force-reinstall while the daemon process has .exe files locked (→ ~ama-* corruption)
#   - package upgrades leaving stale dist-infos from old versions
#   - accidental editable + wheel dual installs
# ---------------------------------------------------------------------------

def _is_junction(path: Path) -> bool:
    """Return True if `path` is a Windows NTFS junction point."""
    if sys.platform != "win32":
        return False
    try:
        # Junction points have the reparse point flag (0x400) set
        import ctypes
        FILE_ATTRIBUTE_REPARSE_POINT = 0x400
        attrs = ctypes.windll.kernel32.GetFileAttributesW(str(path))
        return bool(attrs != -1 and attrs & FILE_ATTRIBUTE_REPARSE_POINT)
    except Exception:
        return False


def repair_installation(check_only: bool = False) -> bool:
    """Scan all site-packages dirs and remove corrupted / stale jama-connect entries.

    Corruption patterns:
      ~ama-connect-*.dist-info   — pip left a tilde-prefixed dist-info (files were locked)
      ~ama_connect-*.dist-info   — same, underscore variant
      ~ama_editor                — corrupted module dir
      jama_connect-X.Y.dist-info — old version, when a newer one is already present

    Returns True if the environment is clean (or was cleaned).
    """
    all_sp = _all_site_packages()
    corrupted: list[Path] = []
    stale_distinfos: list[Path] = []
    editable_distinfos: list[Path] = []

    # Collect all jama_connect dist-infos across all site-packages
    version_re = re.compile(r"jama.connect-(\d+\.\d+\.\d+)\.dist-info", re.IGNORECASE)
    all_jama_distinfos: list[tuple[tuple[int, ...], Path]] = []

    for sp in all_sp:
        for entry in sp.iterdir():
            name = entry.name
            # Corrupted tilde-prefixed entries
            if re.match(r"~ama.connect|~ama.editor|~ama_connect|~ama_editor", name, re.IGNORECASE):
                corrupted.append(entry)
                continue
            # Valid dist-info: collect with version for staleness check
            m = version_re.match(name)
            if m:
                ver_tuple = tuple(int(x) for x in m.group(1).split("."))
                all_jama_distinfos.append((ver_tuple, entry))
                # Check if this is an editable install pointing elsewhere
                direct_url = entry / "direct_url.json"
                if direct_url.exists():
                    try:
                        import json
                        info = json.loads(direct_url.read_text())
                        if info.get("dir_info", {}).get("editable"):
                            editable_distinfos.append(entry)
                    except Exception:
                        pass

    # Identify stale dist-infos: keep the highest version, remove older ones
    if len(all_jama_distinfos) > 1:
        all_jama_distinfos.sort(key=lambda x: x[0])
        latest_ver = all_jama_distinfos[-1][0]
        for ver, path in all_jama_distinfos[:-1]:
            if ver != latest_ver:
                stale_distinfos.append(path)

    # Editable installs alongside a wheel install cause version confusion
    # Only flag editable dist-infos as stale if a wheel dist-info also exists
    wheel_distinfos = [p for _, p in all_jama_distinfos if p not in editable_distinfos]
    if wheel_distinfos and editable_distinfos:
        for p in editable_distinfos:
            if p not in stale_distinfos:
                stale_distinfos.append(p)

    clean = not corrupted and not stale_distinfos

    if check_only:
        if corrupted:
            print(f"  [CORRUPT] {len(corrupted)} corrupted entr(ies) found:")
            for p in corrupted:
                print(f"    {p}")
        if stale_distinfos:
            print(f"  [STALE] {len(stale_distinfos)} stale dist-info(s) found:")
            for p in stale_distinfos:
                label = " (editable)" if p in editable_distinfos else ""
                print(f"    {p}{label}")
        if clean:
            print("  [OK] No corrupted or stale entries found.")
        return clean

    removed = 0
    for p in corrupted + stale_distinfos:
        try:
            if p.is_dir():
                shutil.rmtree(p)
            else:
                p.unlink()
            tag = "corrupt" if p in corrupted else "stale"
            print(f"  Removed ({tag}): {p.name}")
            removed += 1
        except OSError as e:
            print(f"  WARNING: Could not remove {p}: {e}")

    if removed:
        print(f"  Cleaned {removed} entr(ies).")
    else:
        print("  Already clean — nothing to remove.")

    return True


# ---------------------------------------------------------------------------
# Daemon check helper
# ---------------------------------------------------------------------------

def _daemon_is_running(port: int = 8765) -> bool:
    """Return True if the jama-connect REST backend is responding on `port`."""
    import urllib.request
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/health")
        with urllib.request.urlopen(req, timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def warn_if_daemon_running() -> None:
    """Print a warning if the backend is up (reinstall needs it stopped)."""
    if _daemon_is_running():
        print(
            "  WARNING: The jama-connect backend is currently running on port 8765.\n"
            "  Stop it before reinstalling the wheel to avoid file-locking issues:\n"
            "    Invoke-RestMethod -Uri http://localhost:8765/settings/server/stop -Method POST"
        )


# ---------------------------------------------------------------------------
# Step 1: Devin MCP symlink / junction
# ---------------------------------------------------------------------------

def create_symlink(check_only: bool = False) -> bool:
    """Create or verify a Devin MCP link pointing to the installed package parent.

    On Windows, first tries a symlink (requires Developer Mode or admin).
    Falls back to an NTFS junction if symlink creation fails — junctions work
    without elevation and show as a normal directory (is_symlink() returns False,
    but _is_junction() detects them).

    Returns True if the link is (or was already) in place.
    """
    pkg_dir = get_package_dir()
    target = pkg_dir.parent  # parent of jama_mcp_v2 contains both jama_mcp_v2 + jama_editor
    devin_dir = get_devin_mcp_dir()
    link_path = devin_dir / "jama-connect"

    if check_only:
        if link_path.exists() or link_path.is_symlink():
            is_junc = _is_junction(link_path)
            kind = "junction" if is_junc else ("symlink" if link_path.is_symlink() else "directory")
            resolved = link_path.resolve()
            ok = resolved == target.resolve()
            status = "[OK]" if ok else "[WRONG TARGET]"
            print(f"  {status} MCP {kind}: {link_path} -> {resolved}")
            return ok
        print(f"  [MISSING] MCP link not found: {link_path}")
        return False

    devin_dir.mkdir(parents=True, exist_ok=True)

    # Check existing
    if link_path.exists() or _is_junction(link_path):
        current_target = link_path.resolve()
        if current_target == target.resolve():
            kind = "junction" if _is_junction(link_path) else "symlink/dir"
            print(f"  MCP {kind} already correct: {link_path}")
            return True
        # Wrong target — remove and recreate
        print(f"  Updating MCP link (wrong target: {current_target})")
        try:
            if link_path.is_symlink():
                link_path.unlink()
            elif link_path.is_dir():
                # Junction: use rmdir (not rmtree — it would delete contents)
                subprocess.run(["cmd", "/c", "rmdir", str(link_path)], check=True, capture_output=True)
            else:
                link_path.unlink()
        except Exception as e:
            print(f"  WARNING: Could not remove old link: {e}")
            return False

    # Try symlink first
    try:
        os.symlink(str(target), str(link_path), target_is_directory=True)
        print(f"  Created MCP symlink: {link_path} -> {target}")
        return True
    except OSError as exc:
        if sys.platform != "win32" or "privilege" not in str(exc).lower():
            print(f"  ERROR creating symlink: {exc}", file=sys.stderr)
            return False

    # Windows fallback: NTFS junction (no elevation needed)
    print("  Symlink needs admin / Developer Mode — creating junction instead...")
    try:
        subprocess.run(
            ["cmd", "/c", "mklink", "/J", str(link_path), str(target)],
            check=True, capture_output=True,
        )
        print(f"  Created MCP junction: {link_path} -> {target}")
        return True
    except subprocess.CalledProcessError as e2:
        print(f"  ERROR creating junction: {e2}", file=sys.stderr)
        return False


# ---------------------------------------------------------------------------
# Step 2a: Devin extension install (direct zip extraction)
#
# Devin is a VS Code fork with dataFolderName=".devin", so user extensions
# live at ~/.devin/extensions/<publisher>.<name>-<version>/.
# `code --install-extension` only targets vanilla VS Code (~/.vscode/extensions/),
# so we must extract the .vsix (which is a zip) directly.
# ---------------------------------------------------------------------------

def _get_devin_extensions_dir() -> Path:
    """Return ~/.devin/extensions/ (Devin's user extension directory)."""
    home = Path(os.environ.get("USERPROFILE", "~")) if sys.platform == "win32" else Path.home()
    return home / ".devin" / "extensions"


def _vsix_extension_id(vsix: Path) -> str | None:
    """Read publisher + name from the vsix's package.json → 'publisher.name'."""
    try:
        with zipfile.ZipFile(vsix) as zf:
            data = json.loads(zf.read("extension/package.json"))
            return f"{data['publisher']}.{data['name']}"
    except Exception:
        return None


def _vsix_version(vsix: Path) -> str | None:
    """Read version from the vsix's package.json."""
    try:
        with zipfile.ZipFile(vsix) as zf:
            data = json.loads(zf.read("extension/package.json"))
            return data.get("version")
    except Exception:
        return None


def install_devin_extension(check_only: bool = False) -> bool:
    """Extract the bundled .vsix directly into ~/.devin/extensions/.

    Returns True if the extension is (or was just) installed successfully.
    """
    vsix = get_bundled_vsix()
    if not vsix.exists():
        print(f"  WARNING: Bundled .vsix not found at {vsix} — skipping Devin install")
        return False

    devin_ext_dir = _get_devin_extensions_dir()
    if not devin_ext_dir.parent.exists():
        print(f"  Devin not found at {devin_ext_dir.parent} — skipping Devin install")
        return False

    ext_id = _vsix_extension_id(vsix)
    ext_ver = _vsix_version(vsix)
    if not ext_id:
        print("  WARNING: Could not read extension ID from vsix — skipping Devin install")
        return False

    install_dir = devin_ext_dir / f"{ext_id}-{ext_ver}"

    if check_only:
        if install_dir.exists():
            pkg_file = install_dir / "package.json"
            installed_ver = "?"
            try:
                installed_ver = json.loads(pkg_file.read_text()).get("version", "?")
            except Exception:
                pass
            views = []
            try:
                views = [v["id"] for v in json.loads(pkg_file.read_text())
                         .get("contributes", {}).get("views", {})
                         .get("jama-editor", [])]
            except Exception:
                pass
            view_count = len(views)
            status = "[OK]" if view_count >= 3 else "[OUTDATED]"
            print(f"  {status} Devin extension: {ext_id} v{installed_ver} ({view_count} views)")
            return view_count >= 3
        print(f"  [MISSING] Devin extension not found: {install_dir.name}")
        return False

    devin_ext_dir.mkdir(parents=True, exist_ok=True)

    # Remove old install to avoid stale files
    if install_dir.exists():
        shutil.rmtree(install_dir)

    print(f"  Extracting {vsix.name} -> {install_dir.name} ...")
    try:
        with zipfile.ZipFile(vsix) as zf:
            # vsix layout: extension/* contains the actual extension files
            members = [m for m in zf.namelist() if m.startswith("extension/")]
            for member in members:
                relative = member[len("extension/"):]
                if not relative:
                    continue
                target = install_dir / relative
                if member.endswith("/"):
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(zf.read(member))
        print(f"  Devin extension installed: {ext_id} v{ext_ver}")
        return True
    except Exception as e:
        print(f"  WARNING: Could not extract extension to Devin: {e}")
        return False


# ---------------------------------------------------------------------------
# Step 2b: VS Code extension install (via `code --install-extension` CLI)
# ---------------------------------------------------------------------------

def _find_code_binary() -> str | None:
    """Find the VS Code CLI binary.

    On Windows, shutil.which misses extensionless scripts — `code` in the PATH
    is actually `code.cmd` (a batch wrapper). Try .cmd variants first, then
    fall back to fully-qualified paths for the standard VS Code install.
    """
    if sys.platform == "win32":
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
        print(f"  WARNING: Bundled .vsix not found at {vsix} — skipping")
        return False

    code_bin = _find_code_binary()
    if not code_bin:
        print("  WARNING: `code` CLI not found in PATH — skipping extension install")
        print(f"  Manual install: code --install-extension \"{vsix}\" --force")
        return False

    if check_only:
        try:
            result = subprocess.run(
                [code_bin, "--list-extensions"],
                capture_output=True, text=True, timeout=15,
            )
            installed = "enphase.jama-editor" in result.stdout
            status = "[OK]" if installed else "[MISSING]"
            label = "installed" if installed else "not found"
            print(f"  {status} VS Code extension: enphase.jama-editor {label}")
            return installed
        except Exception as e:
            print(f"  WARNING: Could not check extension status: {e}")
            return False

    print(f"  Installing VS Code extension from {vsix.name} ...")
    try:
        result = subprocess.run(
            [code_bin, "--install-extension", str(vsix), "--force"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0:
            print("  VS Code extension installed successfully.")
            return True
        print(f"  WARNING: Extension install returned exit code {result.returncode}")
        if result.stderr:
            print(f"    stderr: {result.stderr.strip()}")
        return False
    except subprocess.TimeoutExpired:
        print(f"  WARNING: Extension install timed out — try manually:")
        print(f"    code --install-extension \"{vsix}\" --force")
        return False
    except Exception as e:
        print(f"  WARNING: Could not install extension: {e}")
        print(f"  Manual install: code --install-extension \"{vsix}\" --force")
        return False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_setup(
    check_only: bool = False,
    skip_extension: bool = False,
    repair_only: bool = False,
) -> None:
    """Run the full post-install setup."""
    pkg_version = importlib.metadata.version("jama-connect")
    print(f"=== jama-connect post-install setup (v{pkg_version}) ===")

    if not check_only:
        warn_if_daemon_running()

    print("\n[0/3] Installation repair")
    repair_installation(check_only=check_only)

    if repair_only:
        print("\nRepair-only mode — done.")
        return

    print("\n[1/3] Devin MCP symlink")
    create_symlink(check_only=check_only)

    if not skip_extension:
        print("\n[2/3] Devin extension (direct extraction -> ~/.devin/extensions/)")
        install_devin_extension(check_only=check_only)

        print("\n[3/3] VS Code extension (code --install-extension)")
        install_vscode_extension(check_only=check_only)
    else:
        print("\n[2/3] Devin extension — skipped (--skip-extension)")
        print("\n[3/3] VS Code extension — skipped (--skip-extension)")

    if not check_only:
        print("\nDone. Reload VS Code / Devin to activate the extension.")
    else:
        print("\nCheck complete.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="jama-connect post-install: repair env, create Devin MCP link, install VS Code extension"
    )
    parser.add_argument("--check", action="store_true", help="Check all steps without making changes")
    parser.add_argument("--skip-extension", action="store_true", help="Skip VS Code extension install")
    parser.add_argument("--repair-only", action="store_true", help="Only clean up corrupted/stale dist-infos")
    args = parser.parse_args()
    run_setup(check_only=args.check, skip_extension=args.skip_extension, repair_only=args.repair_only)


if __name__ == "__main__":
    main()
