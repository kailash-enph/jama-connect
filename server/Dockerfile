# ── Jama Connect Cache Server — Python API container ─────────────────────────
#
# Build context must be the jama-connect/ root (one level above server/) so
# we can install the jama_mcp_v2 package from client/backend/.
#
#   docker build -f server/Dockerfile -t jama-cache-api .
#
# docker-compose.yml sets the context correctly — no manual build needed.
#
# For a self-contained deployment (no repo needed), use build_zip.py to
# produce a zip archive with a pre-built wheel and a standalone Dockerfile.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.12-slim

# Non-root user for security
RUN useradd -m -u 1000 jama
WORKDIR /app

# ── Install Python dependencies ───────────────────────────────────────────────
# jama_mcp_v2 — required by generate_caches.py (sync subprocess)
COPY client/backend/pyproject.toml client/backend/
COPY client/backend/src/           client/backend/src/
RUN pip install --no-cache-dir ./client/backend

# ── Copy server code ──────────────────────────────────────────────────────────
COPY server/ .

RUN chown -R jama:jama /app
USER jama

EXPOSE 8867

# entrypoint.sh seeds server_config.json into the data volume on first run
ENTRYPOINT ["sh", "entrypoint.sh"]
