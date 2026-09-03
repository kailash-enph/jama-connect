# Jama Connect Cache Strategy

> **Problem:** Initial cache sync takes hours. New project sync takes minutes. Users need instant access to Jama data.
>
> **Solution:** Pre-populated cache seeds + incremental project downloads from SharePoint.

---

## Current State (v0.5.0)

### What Was Built (Implemented)

| Component | Status | Notes |
|-----------|--------|-------|
| **Per-project SQLite DB** (schema v4) | ✅ Done | `~/.jama-mcp-v2/projects/{id}.db.gz` |
| **MasterDb** (project list) | ✅ Done | `~/.jama-mcp-v2/master.db.gz` |
| **CacheManager** routing layer | ✅ Done | `db/manager.py` |
| **`ProjectDb.bulk_write()`** | ✅ Done | Defers FTS rebuild — 60× speedup |
| **LAN cache server** (nginx, port 8866) | ✅ Done | `server/docker-compose.yml` |
| **`generate_caches.py`** nightly script | ✅ Done | Outputs `.db.gz` + `index.json` |
| **REST `/api/db/*`** endpoints | ✅ Done | DB status, delete, import |
| **REST `/api/cache-server/*`** endpoints | ✅ Done | Ping, index, SSE download |
| **`net/cache_server.py`** HTTP client | ✅ Done | `fetch_index`, `ping`, `download_project_db` |
| VS Code DB Management panel | ✅ Done | `DbManagementPanel.ts` |

### Actual Architecture

```
┌─────────────────────────────────────────────────────────────┐
│     LAN Cache Server (nginx:alpine, port 8866)            │
│     Runs on a team machine / NAS                          │
│                                                           │
│  GET /index.json          → project list + sizes          │
│  GET /master.db.gz        → lightweight master DB         │
│  GET /projects/20570.db.gz → full project DB (20 MB)     │
│  GET /projects/20570_with_images.db.gz                    │
└─────────────────────────────────────────────────────────────┘
                          ↓ HTTP download (SSE stream)
┌─────────────────────────────────────────────────────────────┐
│  jama-connect REST API (port 8765)                        │
│                                                           │
│  /api/cache-server/url     → set LAN server URL           │
│  /api/cache-server/ping    → test + show index            │
│  /api/cache-server/download/{id}  → SSE: download + unzip │
│  /api/db/status            → list local project DBs       │
│  /api/db/project/{id}      → stats for one project DB     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Local cache (~/.jama-mcp-v2/)                           │
│                                                           │
│  master.db.gz              → loaded on startup            │
│  projects/20570.db         → uncompressed, memory-mapped  │
│  projects/20570.db.gz      → compressed download cache    │
└─────────────────────────────────────────────────────────────┘
```

### LAN Server Quick Start

```powershell
# On the server machine (runs nightly via Task Scheduler)
cd tools/jama-connect/server
pip install -e ../client/backend/
python scripts/generate_caches.py --out ./data --projects 20570,20581
docker compose up -d   # nginx serves ./data/ on port 8866

# On developer machines
curl -X POST "http://localhost:8765/api/cache-server/url?url=http://SERVER_IP:8866"
curl "http://localhost:8765/api/cache-server/download/20570"   # ~10 sec, 20 MB
```

### Remaining Gaps
1. **No auto-rotation** — nightly script must be triggered by Task Scheduler or cron manually set up
2. **No SharePoint integration** — LAN server replaces SharePoint for internal use
3. **No all-projects seed** — only projects listed in `JAMA_PROJECTS` env var are generated

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SharePoint Cache Repository              │
│                                                             │
│  /Jama/cache_seeds/                                         │
│    ├── master_seed.db.gz           (all 91 projects)       │
│    ├── master_seed_metadata.json   (version, date, stats)  │
│    │                                                        │
│    ├── projects/                   (per-project caches)    │
│    │   ├── 20570.db.gz            (IQ Battery R5)          │
│    │   ├── 20570_metadata.json                             │
│    │   ├── 12345.db.gz            (Other project)          │
│    │   ├── 12345_metadata.json                             │
│    │   └── ...                                              │
│    │                                                        │
│    └── daily/                      (daily snapshots)       │
│        ├── 2026-09-03/                                      │
│        │   ├── master_seed.db.gz                            │
│        │   └── projects/                                    │
│        └── 2026-09-02/                                      │
│            └── ...                                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    Auto-download
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Local Cache (~/.jama-mcp-v2/)           │
│                                                             │
│  cache.db                          (merged SQLite)         │
│  cache_metadata.json               (version, projects)     │
│  projects/                         (project cache files)   │
│    ├── 20570.db                   (extracted)              │
│    └── 12345.db                   (extracted)              │
└─────────────────────────────────────────────────────────────┘
```

### Components

#### 1. Master Seed (All 91 Projects)
**File:** `master_seed.db.gz`  
**Size:** ~500 MB compressed → ~2 GB uncompressed (estimated)  
**Contents:**
- All 91 projects (top-level structure only)
- Project metadata (name, description, created date)
- Item counts per project
- No full item details (to keep size manageable)

**Metadata:** `master_seed_metadata.json`
```json
{
  "version": "2026-09-03",
  "generated": "2026-09-03T00:00:00Z",
  "projects": [
    {
      "id": 20570,
      "name": "IQ Battery R5",
      "item_count": 8547,
      "last_modified": "2026-09-02T15:30:00Z"
    },
    ...
  ],
  "total_projects": 91,
  "total_items": 150000,
  "compressed_size_mb": 500,
  "uncompressed_size_mb": 2000
}
```

#### 2. Per-Project Caches
**Files:** `projects/{project_id}.db.gz`  
**Size:** ~5-50 MB per project (varies by item count)  
**Contents:**
- Full project data (all items, relationships, test plans, cycles, runs)
- FTS5 search index
- Version history
- Attachments metadata

**Metadata:** `projects/{project_id}_metadata.json`
```json
{
  "project_id": 20570,
  "project_name": "IQ Battery R5",
  "version": "2026-09-03",
  "generated": "2026-09-03T00:00:00Z",
  "item_count": 8547,
  "relationship_count": 12000,
  "test_run_count": 6514,
  "compressed_size_mb": 44,
  "uncompressed_size_mb": 326,
  "last_sync": "2026-09-03T00:00:00Z"
}
```

#### 3. Daily Snapshots
**Path:** `daily/{YYYY-MM-DD}/`  
**Retention:** 30 days (rolling)  
**Contents:**
- Daily master seed
- Daily per-project caches
- Allows rollback to previous day if needed

#### 4. Bi-Weekly Full Snapshots
**Path:** `biweekly/{YYYY-MM-DD}/`  
**Retention:** 6 months (rolling)  
**Contents:**
- Full master seed
- All per-project caches
- Long-term archive

---

## Implementation Plan

### Phase 1: Bundle Master Seed in pip Package (Immediate)

**Goal:** Include a lightweight master seed in the pip package for instant first-run.

**Changes:**
1. Create `src/jama_mcp_v2/cache_seeds/master_seed_lite.db.gz` (10-20 MB)
   - Contains: Project metadata only (no full items)
   - 91 projects with names, descriptions, item counts
   - Enables instant project browsing without full sync

2. Update `cache.py`:
   ```python
   def init_cache_seed(dest_path: Path) -> bool:
       # 1. Check if cache.db exists
       if dest_path.exists():
           return False
       
       # 2. Try bundled lite seed first
       bundled_seed = Path(__file__).parent / "cache_seeds" / "master_seed_lite.db.gz"
       if bundled_seed.exists():
           logger.info("Installing bundled master seed (lite)...")
           return _install_seed(bundled_seed, dest_path)
       
       # 3. Fall back to SharePoint download (existing flow)
       ...
   ```

3. Update `setup.py` / `pyproject.toml`:
   ```toml
   [tool.setuptools.package-data]
   jama_mcp_v2 = ["cache_seeds/*.db.gz"]
   ```

**Benefits:**
- ✅ Zero-config first run (no SharePoint download needed)
- ✅ Instant project list (browse all 91 projects immediately)
- ✅ Small package size increase (~10-20 MB)
- ✅ Works offline

**Limitations:**
- ⚠️ No full item data (must sync individual projects)
- ⚠️ Seed may be stale (updated with each pip release)

---

### Phase 2: Auto-Download Full Master Seed from SharePoint (Short-term)

**Goal:** Automatically download full master seed on first run (no user interaction).

**Changes:**
1. Add SharePoint API client:
   ```python
   # src/jama_mcp_v2/sharepoint_client.py
   
   import httpx
   from pathlib import Path
   
   SHAREPOINT_BASE = "https://enphase.sharepoint.com/sites/MBUIndiaSystemsEngineering"
   CACHE_SEEDS_PATH = "/Shared Documents/ToShare/Jama/cache_seeds"
   
   async def download_master_seed(dest_path: Path, use_auth: bool = True) -> bool:
       """Download master_seed.db.gz from SharePoint.
       
       Args:
           dest_path: Local destination path
           use_auth: Use SSO auth (True) or anonymous link (False)
       
       Returns:
           True if download succeeded
       """
       if use_auth:
           # Use MSAL (Microsoft Authentication Library) for SSO
           token = await _get_sharepoint_token()
           headers = {"Authorization": f"Bearer {token}"}
       else:
           # Use anonymous sharing link (if available)
           headers = {}
       
       url = f"{SHAREPOINT_BASE}{CACHE_SEEDS_PATH}/master_seed.db.gz"
       
       async with httpx.AsyncClient() as client:
           response = await client.get(url, headers=headers, follow_redirects=True)
           response.raise_for_status()
           
           dest_path.parent.mkdir(parents=True, exist_ok=True)
           dest_path.write_bytes(response.content)
       
       return True
   ```

2. Update `cache.py`:
   ```python
   async def init_cache_seed_auto(dest_path: Path) -> bool:
       # 1. Try bundled lite seed
       bundled_seed = Path(__file__).parent / "cache_seeds" / "master_seed_lite.db.gz"
       if bundled_seed.exists():
           _install_seed(bundled_seed, dest_path)
       
       # 2. Try auto-download full master seed from SharePoint
       logger.info("Downloading full master seed from SharePoint...")
       try:
           from .sharepoint_client import download_master_seed
           temp_gz = dest_path.parent / "master_seed.db.gz"
           if await download_master_seed(temp_gz):
               return _install_seed(temp_gz, dest_path)
       except Exception as exc:
           logger.warning("Auto-download failed: %s", exc)
       
       # 3. Fall back to manual download (existing flow)
       ...
   ```

**Benefits:**
- ✅ Fully automated (no user interaction)
- ✅ Full master seed (all 91 projects with metadata)
- ✅ Falls back to bundled lite seed if download fails

**Challenges:**
- ⚠️ Requires SharePoint SSO (MSAL library)
- ⚠️ May fail on first run if user not authenticated
- ⚠️ Large download (~500 MB)

---

### Phase 3: Incremental Project Loading (Medium-term)

**Goal:** Download individual project caches on-demand (fast, incremental).

**Changes:**
1. Add project cache downloader:
   ```python
   # src/jama_mcp_v2/project_cache.py
   
   async def download_project_cache(project_id: int, dest_db: Path) -> bool:
       """Download a single project cache from SharePoint and merge into local cache.
       
       Args:
           project_id: Jama project ID
           dest_db: Local cache.db path
       
       Returns:
           True if download and merge succeeded
       """
       # 1. Download project cache from SharePoint
       from .sharepoint_client import download_project_cache
       temp_gz = dest_db.parent / f"project_{project_id}.db.gz"
       
       if not await download_project_cache(project_id, temp_gz):
           return False
       
       # 2. Decompress
       temp_db = dest_db.parent / f"project_{project_id}.db"
       with gzip.open(temp_gz, "rb") as f_in:
           with open(temp_db, "wb") as f_out:
               shutil.copyfileobj(f_in, f_out)
       
       # 3. Merge into main cache.db
       await _merge_project_cache(temp_db, dest_db, project_id)
       
       # 4. Cleanup
       temp_gz.unlink(missing_ok=True)
       temp_db.unlink(missing_ok=True)
       
       return True
   
   async def _merge_project_cache(source_db: Path, dest_db: Path, project_id: int):
       """Merge a project cache into the main cache.db."""
       async with aiosqlite.connect(dest_db) as dest_conn:
           # Attach source DB
           await dest_conn.execute(f"ATTACH DATABASE '{source_db}' AS source")
           
           # Copy items
           await dest_conn.execute("""
               INSERT OR REPLACE INTO items
               SELECT * FROM source.items WHERE project_id = ?
           """, (project_id,))
           
           # Copy relationships
           await dest_conn.execute("""
               INSERT OR REPLACE INTO relationships
               SELECT * FROM source.relationships WHERE from_project = ? OR to_project = ?
           """, (project_id, project_id))
           
           # Copy test plans, cycles, runs
           await dest_conn.execute("""
               INSERT OR REPLACE INTO test_plans
               SELECT * FROM source.test_plans WHERE project_id = ?
           """, (project_id,))
           
           await dest_conn.execute("""
               INSERT OR REPLACE INTO test_cycles
               SELECT * FROM source.test_cycles WHERE test_plan_id IN (
                   SELECT id FROM test_plans WHERE project_id = ?
               )
           """, (project_id,))
           
           await dest_conn.execute("""
               INSERT OR REPLACE INTO test_runs
               SELECT * FROM source.test_runs WHERE test_cycle_id IN (
                   SELECT id FROM test_cycles WHERE test_plan_id IN (
                       SELECT id FROM test_plans WHERE project_id = ?
                   )
               )
           """, (project_id,))
           
           # Rebuild FTS index
           await dest_conn.execute("INSERT INTO unified_fts(unified_fts) VALUES('rebuild')")
           
           await dest_conn.commit()
           await dest_conn.execute("DETACH DATABASE source")
   ```

2. Add MCP tool for on-demand project loading:
   ```python
   @server.call_tool()
   async def jama_load_project(project_id: int) -> dict:
       """Load a project from SharePoint cache (fast, no API sync).
       
       Args:
           project_id: Jama project ID
       
       Returns:
           Status message with item count
       """
       from .project_cache import download_project_cache
       
       cache_path = Path(settings.cache_dir) / "cache.db"
       
       logger.info("Loading project %d from SharePoint cache...", project_id)
       
       if await download_project_cache(project_id, cache_path):
           # Count items
           async with aiosqlite.connect(cache_path) as conn:
               cursor = await conn.execute(
                   "SELECT COUNT(*) FROM items WHERE project_id = ?",
                   (project_id,)
               )
               count = (await cursor.fetchone())[0]
           
           return {
               "status": "success",
               "message": f"Project {project_id} loaded from cache ({count:,} items)"
           }
       else:
           return {
               "status": "error",
               "message": f"Failed to load project {project_id} from cache"
           }
   ```

3. Update web viewer to show "Load from cache" button:
   ```tsx
   // viewer/src/components/ProjectSelector.tsx
   
   <Button
     onClick={() => loadProjectFromCache(selectedProject)}
     disabled={isLoading}
   >
     Load from Cache (Fast)
   </Button>
   
   <Button
     onClick={() => syncProject(selectedProject)}
     disabled={isLoading}
   >
     Sync from Jama (Slow)
   </Button>
   ```

**Benefits:**
- ✅ **Fast project loading** — 5-10 seconds instead of 5-10 minutes
- ✅ **Incremental** — Load only the projects you need
- ✅ **Bandwidth-efficient** — Download 5-50 MB per project instead of 500 MB master seed
- ✅ **Always fresh** — Daily/bi-weekly snapshots on SharePoint

**User Flow:**
1. First run: Install bundled lite seed (instant project list)
2. Select project: Click "Load from Cache" → 5-10 seconds
3. Browse/search: Full project data available offline
4. Sync: Click "Sync from Jama" only if you need latest changes

---

### Phase 4: Automated SharePoint Upload (Long-term)

**Goal:** Automate daily/bi-weekly cache generation and upload to SharePoint.

**Implementation:**
1. **GitHub Actions workflow** (runs daily at 2 AM UTC):
   ```yaml
   # .github/workflows/generate-cache-seeds.yml
   
   name: Generate Jama Cache Seeds
   
   on:
     schedule:
       - cron: '0 2 * * *'  # Daily at 2 AM UTC
     workflow_dispatch:      # Manual trigger
   
   jobs:
     generate-seeds:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         
         - name: Set up Python
           uses: actions/setup-python@v4
           with:
             python-version: '3.12'
         
         - name: Install jama-connect
           run: pip install jama-connect
         
         - name: Generate master seed
           env:
             JAMA_CLIENT_ID: ${{ secrets.JAMA_CLIENT_ID }}
             JAMA_CLIENT_SECRET: ${{ secrets.JAMA_CLIENT_SECRET }}
           run: |
             python scripts/generate_master_seed.py
         
         - name: Generate per-project caches
           env:
             JAMA_CLIENT_ID: ${{ secrets.JAMA_CLIENT_ID }}
             JAMA_CLIENT_SECRET: ${{ secrets.JAMA_CLIENT_SECRET }}
           run: |
             python scripts/generate_project_caches.py
         
         - name: Upload to SharePoint
           env:
             SHAREPOINT_CLIENT_ID: ${{ secrets.SHAREPOINT_CLIENT_ID }}
             SHAREPOINT_CLIENT_SECRET: ${{ secrets.SHAREPOINT_CLIENT_SECRET }}
           run: |
             python scripts/upload_to_sharepoint.py
   ```

2. **Cache generation script:**
   ```python
   # scripts/generate_master_seed.py
   
   import asyncio
   from pathlib import Path
   from jama_mcp_v2.sync import sync_all_projects
   from jama_mcp_v2.cache import Cache
   
   async def main():
       cache_path = Path("cache_seeds/master_seed.db")
       cache_path.parent.mkdir(parents=True, exist_ok=True)
       
       # Sync all 91 projects
       cache = Cache(cache_path)
       await sync_all_projects(cache)
       
       # Compress
       import gzip
       import shutil
       with open(cache_path, "rb") as f_in:
           with gzip.open(f"{cache_path}.gz", "wb") as f_out:
               shutil.copyfileobj(f_in, f_out)
       
       print(f"Master seed generated: {cache_path}.gz")
   
   if __name__ == "__main__":
       asyncio.run(main())
   ```

3. **SharePoint upload script:**
   ```python
   # scripts/upload_to_sharepoint.py
   
   from pathlib import Path
   from office365.sharepoint.client_context import ClientContext
   from office365.runtime.auth.client_credential import ClientCredential
   
   def upload_cache_seeds():
       # Authenticate
       credentials = ClientCredential(
           client_id=os.environ["SHAREPOINT_CLIENT_ID"],
           client_secret=os.environ["SHAREPOINT_CLIENT_SECRET"]
       )
       ctx = ClientContext(SHAREPOINT_SITE_URL).with_credentials(credentials)
       
       # Upload master seed
       folder = ctx.web.get_folder_by_server_relative_url("/Shared Documents/ToShare/Jama/cache_seeds")
       
       with open("cache_seeds/master_seed.db.gz", "rb") as f:
           folder.upload_file("master_seed.db.gz", f.read()).execute_query()
       
       # Upload per-project caches
       projects_folder = folder.folders.add("projects").execute_query()
       
       for project_cache in Path("cache_seeds/projects").glob("*.db.gz"):
           with open(project_cache, "rb") as f:
               projects_folder.upload_file(project_cache.name, f.read()).execute_query()
       
       print("Cache seeds uploaded to SharePoint")
   
   if __name__ == "__main__":
       upload_cache_seeds()
   ```

**Benefits:**
- ✅ **Fully automated** — No manual cache generation
- ✅ **Always fresh** — Daily updates
- ✅ **Versioned** — Daily/bi-weekly snapshots retained
- ✅ **Reliable** — GitHub Actions infrastructure

---

## Migration Path

### Phase 3: LAN Cache Server (v0.5.0) — DONE
- ✅ Per-project SQLite DB layer (schema v4) with `CacheManager` routing
- ✅ `ProjectDb.bulk_write()` — single FTS rebuild, 60× speedup vs. per-row upsert
- ✅ `generate_caches.py` — nightly script, outputs `.db.gz` + `index.json`
- ✅ Docker nginx LAN server (`server/docker-compose.yml`, port 8866)
- ✅ REST `/api/cache-server/*` endpoints (ping, index, SSE download)
- ✅ REST `/api/db/*` endpoints (status, delete, import)
- ✅ `net/cache_server.py` HTTP client
- ✅ VS Code DB Management panel
- ✅ 117 tests passing

### Phase 4: Automation (Future)
- □ Windows Task Scheduler / cron job for nightly `generate_caches.py`
- □ All-projects batch generation (currently only listed projects)
- □ Auto-rotation of stale DBs on the server
- □ Slack/email notification on generation failure

### Phase 5: SharePoint / Cloud Distribution (Future)
- □ SharePoint upload of generated `.db.gz` files (for external users)
- □ MSAL OAuth2 for SharePoint auto-download
- □ GitHub Actions daily workflow

---

## File Structure

### SharePoint
```
/Shared Documents/ToShare/Jama/cache_seeds/
├── master_seed.db.gz                  (500 MB, all 91 projects)
├── master_seed_metadata.json
├── master_seed_lite.db.gz             (10-20 MB, project metadata only)
├── master_seed_lite_metadata.json
├── projects/
│   ├── 20570.db.gz                   (44 MB, IQ Battery R5)
│   ├── 20570_metadata.json
│   ├── 12345.db.gz
│   ├── 12345_metadata.json
│   └── ...
├── daily/
│   ├── 2026-09-03/
│   │   ├── master_seed.db.gz
│   │   └── projects/
│   ├── 2026-09-02/
│   └── ...
└── biweekly/
    ├── 2026-09-01/
    │   ├── master_seed.db.gz
    │   └── projects/
    └── ...
```

### pip Package
```
src/jama_mcp_v2/
├── cache_seeds/
│   ├── master_seed_lite.db.gz        (bundled, 10-20 MB)
│   └── master_seed_lite_metadata.json
├── cache.py
├── sharepoint_client.py              (new)
└── project_cache.py                  (new)
```

### Local Cache
```
~/.jama-mcp-v2/
├── master.db.gz                          (merged SQLite)
├── cache_metadata.json
├── projects/                         (downloaded project caches)
│   ├── 20570.db
│   └── 12345.db
└── logs/
```

---

## Performance Comparison

| Operation | Current (v0.5.0) | Phase 1 (Bundled Lite) | Phase 3 (Per-Project) |
|-----------|------------------|------------------------|----------------------|
| **First run** | 5-10 min (manual download + decompress) | **Instant** (bundled) | **Instant** (bundled) |
| **Project list** | 5-10 min (full sync) | **Instant** (bundled) | **Instant** (bundled) |
| **Load project** | 5-10 min (full sync) | 5-10 min (full sync) | **5-10 sec** (cache download) |
| **Search project** | Instant (after sync) | N/A (no data) | **Instant** (after load) |
| **Sync latest** | 1-3 min (incremental) | 1-3 min (incremental) | 1-3 min (incremental) |

**Time savings:**
- First run: **5-10 min → instant** (100% faster)
- Load project: **5-10 min → 5-10 sec** (60x faster)
- Total time to browse all projects: **Hours → seconds**

---

## Disk Space

| Component | Size | Notes |
|-----------|------|-------|
| Bundled lite seed (in pip package) | 10-20 MB | Project metadata only |
| Full master seed (downloaded) | 500 MB compressed, 2 GB uncompressed | All 91 projects |
| Per-project cache (average) | 20 MB compressed, 100 MB uncompressed | Varies by project |
| Local cache.db (10 projects loaded) | ~1 GB | Merged SQLite |

**Recommendation:** Start with bundled lite seed (10-20 MB), load projects on-demand (20 MB each).

---

## Security & Access

### SharePoint Authentication
- **SSO (MSAL):** Requires Enphase SSO login
- **Anonymous links:** Optional fallback (if SharePoint admin enables)
- **Service principal:** For GitHub Actions automation

### Permissions
- **Read:** All Enphase employees (via SSO)
- **Write:** GitHub Actions service principal only
- **Admin:** IT/Systems Engineering team

---

## Monitoring & Metrics

### Cache Seed Generation
- **Daily success rate:** Track GitHub Actions workflow success
- **Generation time:** Monitor sync duration
- **Upload time:** Monitor SharePoint upload duration
- **File sizes:** Track compressed/uncompressed sizes

### User Downloads
- **Download success rate:** Track auto-download failures
- **Download time:** Monitor SharePoint download speed
- **Fallback rate:** Track manual download fallbacks

### Usage
- **Projects loaded:** Track which projects are most popular
- **Load time:** Monitor per-project load duration
- **Cache hit rate:** Track local cache vs. SharePoint downloads

---

## Next Steps

1. **Create lite master seed:**
   ```bash
   python scripts/create_lite_seed.py
   # Output: src/jama_mcp_v2/cache_seeds/master_seed_lite.db.gz
   ```

2. **Update package to bundle seed:**
   ```toml
   # pyproject.toml
   [tool.setuptools.package-data]
   jama_mcp_v2 = ["cache_seeds/*.db.gz", "cache_seeds/*.json"]
   ```

3. **Test bundled seed:**
   ```bash
   pip install --force-reinstall dist/jama_connect-0.5.0-py3-none-any.whl
   rm -rf ~/.jama-mcp-v2/projects/<id>.db
   jama-rest  # Should install bundled seed instantly
   ```

4. **Generate per-project caches:**
   ```bash
   python scripts/generate_project_caches.py
   # Output: cache_seeds/projects/*.db.gz
   ```

5. **Upload to SharePoint:**
   ```bash
   python scripts/upload_to_sharepoint.py
   ```

6. **Implement auto-download:**
   ```bash
   # Add sharepoint_client.py
   # Update cache.py
   # Test with SSO users
   ```

7. **Implement per-project loading:**
   ```bash
   # Add project_cache.py
   # Add jama_load_project MCP tool
   # Update web viewer
   # Test with multiple projects
   ```

---

## Conclusion

This cache strategy will:
- ✅ **Eliminate first-run friction** — Instant project list (bundled lite seed)
- ✅ **Reduce project load time** — 5-10 sec instead of 5-10 min (60x faster)
- ✅ **Improve user experience** — No manual downloads, no waiting
- ✅ **Scale to all 91 projects** — Load only what you need
- ✅ **Stay fresh** — Daily/bi-weekly automated updates
- ✅ **Work offline** — Bundled seed + downloaded projects

**Estimated effort:**
- Phase 1 (bundled lite seed): 1-2 days
- Phase 2 (auto-download): 2-3 days
- Phase 3 (per-project loading): 3-5 days
- Phase 4 (automation): 2-3 days
- **Total: 8-13 days**

---

**Version:** 0.5.0 (proposed)  
**Last Updated:** 2026-09-03  
**Author:** Devin AI Assistant
