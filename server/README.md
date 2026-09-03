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

Without `JAMA_SESSION_COOKIE`: ~40–70% of images (REST-uploaded files via OAuth)
With fresh `JSESSIONID`: ~95–100% (includes browser-pasted inline images)

The `JSESSIONID` expires in ~8 hours. Obtain it from browser F12 → Application →
Cookies → enphase.jamacloud.com and paste into `.env` before running the generator.
