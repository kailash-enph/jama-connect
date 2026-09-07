# Jama Connect Cache Server

A lightweight nginx file server that exposes pre-generated SQLite database snapshots
for fast LAN distribution. Users download a project `.db.gz` once instead of waiting
for a full API sync.

## Quick Start

1. Copy `.env.example` → `.env` and fill in credentials:
   ```
   JAMA_CLIENT_ID=your-client-id
   JAMA_CLIENT_SECRET=your-client-secret
   JAMA_PROJECTS=20570
   ```

2. Generate the initial cache:
   ```
   pip install jama-connect   # from client/backend/
   python scripts/generate_caches.py --out ./data
   ```

3. Start nginx:
   ```
   docker compose up -d
   ```

4. Clients can now fetch:
   - `http://server-ip:8866/index.json` — project list + sizes
   - `http://server-ip:8866/projects/20570.db.gz` — data-only DB
   - `http://server-ip:8866/projects/20570_with_images.db.gz` — with images

## Scheduled Generation

Register a nightly Task Scheduler job (Windows):
```
.\scripts\setup_task.ps1
```

## Image Coverage

The nightly generator embeds all images accessible via the Jama OAuth REST API
(~40–70% of total images). Browser-pasted inline images are synced separately
via the admin panel **Browser Image Sync** tab, which uses a short-lived upload
token — no credentials are stored server-side.
