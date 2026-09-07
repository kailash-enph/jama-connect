#!/usr/bin/env python3
"""build_zip.py — Build a self-contained deployment zip for the Jama Cache Server.

The zip contains everything needed to run `docker compose up -d` without
cloning the full repository.  It bundles a pre-built wheel of jama_mcp_v2
(the Python backend package) so there is no dependency on the parent repo.

Usage (from jama-connect/ root, or from server/):
    python server/build_zip.py              # output: server/dist/jama-cache-server-<ver>.zip
    python server/build_zip.py --out /tmp   # custom output directory

What's inside the zip:
    jama-cache-server-<ver>/
    ├── Dockerfile              # standalone — installs from dist/*.whl
    ├── docker-compose.yml      # adjusted context / no parent dir needed
    ├── nginx.conf
    ├── entrypoint.sh
    ├── .env.example
    ├── server_config.json      # blank default
    ├── cache_server.py
    ├── scripts/
    │   └── generate_caches.py
    └── dist/
        └── jama_connect-<ver>-py3-none-any.whl

Quick-start (after unzipping):
    cd jama-cache-server-<ver>
    cp .env.example .env        # fill in credentials
    docker compose up -d --build
    # Dashboard: http://localhost:8866
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

# ── locate repo roots ─────────────────────────────────────────────────────────
_HERE = Path(__file__).resolve().parent          # server/
_REPO = _HERE.parent                             # jama-connect/
_CLIENT = _REPO / "client" / "backend"           # jama_mcp_v2 package source


# ── standalone Dockerfile (used inside the zip, not the dev one) ─────────────
_STANDALONE_DOCKERFILE = """\
# ── Jama Connect Cache Server — standalone deployment image ──────────────────
#
# This Dockerfile is included in the deployment zip.
# It installs jama_mcp_v2 from the pre-built wheel in dist/.
#
# Quick start:
#   cp .env.example .env   # fill in credentials
#   docker compose up -d --build
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

RUN useradd -m -u 1000 jama
WORKDIR /app

# Install jama_mcp_v2 from the bundled wheel
COPY dist/ dist/
RUN pip install --no-cache-dir dist/jama_connect-*.whl

# Copy server code
COPY cache_server.py scripts/ entrypoint.sh server_config.json ./
COPY scripts/ scripts/

RUN chown -R jama:jama /app
USER jama

EXPOSE 8867

ENTRYPOINT ["sh", "entrypoint.sh"]
"""

# ── standalone docker-compose.yml (context is the unzipped dir, not parent) ──
_STANDALONE_COMPOSE = """\
version: "3.9"

# ── Jama Connect LAN Cache Server ────────────────────────────────────────────
#
# Quick start:
#   cp .env.example .env   # fill in credentials
#   docker compose up -d --build
#   # Dashboard:  http://localhost:8866
#   # Admin panel is embedded — click the lock icon
# ─────────────────────────────────────────────────────────────────────────────

services:

  api:
    build: .                       # context is this directory (the unzipped folder)
    image: jama-cache-api
    container_name: jama-cache-api
    env_file: .env
    environment:
      - PYTHONUNBUFFERED=1
      - SERVE_DIR=/data
    volumes:
      - ${SERVE_DIR:-./data}:/data
      - ./.env:/app/.env:ro
    expose:
      - "8867"
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    container_name: jama-cache-server
    ports:
      - "${SERVE_PORT:-8866}:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ${SERVE_DIR:-./data}:/usr/share/nginx/html:ro
    depends_on:
      - api
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/index.json"]
      interval: 30s
      timeout: 5s
      retries: 3
"""


def build_wheel(client_dir: Path, wheel_dir: Path) -> Path:
    """Build a wheel from client/backend and return the .whl path."""
    print(f"Building wheel from {client_dir} …")
    wheel_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, "-m", "pip", "wheel", "--no-deps", "--wheel-dir", str(wheel_dir), str(client_dir)],
        check=True,
    )
    wheels = sorted(wheel_dir.glob("jama_connect-*.whl"))
    if not wheels:
        raise RuntimeError("No jama_connect-*.whl produced — check build output above")
    return wheels[-1]


def get_version(client_dir: Path) -> str:
    """Extract version from pyproject.toml."""
    toml = (client_dir / "pyproject.toml").read_text(encoding="utf-8")
    for line in toml.splitlines():
        if line.startswith("version"):
            return line.split("=")[1].strip().strip('"')
    return "0.0.0"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", default=str(_HERE / "dist"), help="Output directory (default: server/dist/)")
    parser.add_argument("--no-wheel", action="store_true", help="Skip wheel build (use existing dist/*.whl)")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    version = get_version(_CLIENT)
    zip_name = f"jama-cache-server-{version}.zip"
    zip_path = out_dir / zip_name
    folder_name = f"jama-cache-server-{version}"

    # ── 1. build wheel ────────────────────────────────────────────────────────
    wheel_staging = _HERE / "dist" / "_wheels"
    if args.no_wheel:
        existing = sorted((_HERE / "dist").glob("jama_connect-*.whl"))
        if not existing:
            print("ERROR: --no-wheel set but no jama_connect-*.whl found in server/dist/")
            sys.exit(1)
        wheel_path = existing[-1]
        print(f"Reusing wheel: {wheel_path.name}")
    else:
        wheel_path = build_wheel(_CLIENT, wheel_staging)
        print(f"Built wheel: {wheel_path.name}")

    # ── 2. assemble zip ───────────────────────────────────────────────────────
    print(f"\nAssembling {zip_name} …")
    if zip_path.exists():
        zip_path.unlink()

    # Files to include from server/
    server_files = [
        "cache_server.py",
        "nginx.conf",
        "entrypoint.sh",
        "server_config.json",
        ".env.example",
    ]
    script_files = [
        "scripts/generate_caches.py",
    ]

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        def add(arcname: str, data: str | bytes | Path) -> None:
            if isinstance(data, Path):
                zf.write(data, f"{folder_name}/{arcname}")
            else:
                content = data.encode() if isinstance(data, str) else data
                zf.writestr(f"{folder_name}/{arcname}", content)

        # Standalone Dockerfile + compose
        add("Dockerfile",         _STANDALONE_DOCKERFILE)
        add("docker-compose.yml", _STANDALONE_COMPOSE)

        # Server source files
        for fname in server_files:
            src = _HERE / fname
            if src.exists():
                add(fname, src)
            else:
                print(f"  WARNING: {fname} not found — skipping")

        for fname in script_files:
            src = _HERE / fname
            if src.exists():
                add(fname, src)
            else:
                print(f"  WARNING: {fname} not found — skipping")

        # Bundled wheel
        add(f"dist/{wheel_path.name}", wheel_path)

    # ── 3. clean up temp wheel staging ───────────────────────────────────────
    if wheel_staging.exists() and not args.no_wheel:
        shutil.rmtree(wheel_staging)

    size_kb = zip_path.stat().st_size // 1024
    print(f"\nDone!  {zip_path}  ({size_kb:,} KB)")
    print(f"\nQuick start after unzipping:")
    print(f"  cd {folder_name}")
    print(f"  cp .env.example .env   # fill in your credentials")
    print(f"  docker compose up -d --build")
    print(f"  # Dashboard: http://localhost:8866")


if __name__ == "__main__":
    main()
