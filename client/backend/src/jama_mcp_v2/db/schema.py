"""Database schema v4 for jama-connect per-project SQLite files.

Changes from v3 (legacy cache.py):
  1. Drop `items_fts` content table — `unified_fts` with doc_type='item' replaces it
  2. Add `project_id` column to `test_cycles` — eliminates JOIN to test_plans
  3. Add `project_id` column to `test_runs`   — eliminates 2-JOIN chain
  4. Add `images` table — BLOB storage for embedded images (_with_images variant)
"""

from __future__ import annotations

SCHEMA_VERSION = 4

# ---------------------------------------------------------------------------
# Core DDL (applied once on first open)
# ---------------------------------------------------------------------------

SCHEMA_SQL = """
-- Metadata
CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id            INTEGER PRIMARY KEY,
    project_key   TEXT NOT NULL DEFAULT '',
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    is_folder     INTEGER NOT NULL DEFAULT 0,
    parent_id     INTEGER,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0
);

-- Items
CREATE TABLE IF NOT EXISTS items (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    item_type       INTEGER NOT NULL DEFAULT 0,
    document_key    TEXT NOT NULL DEFAULT '',
    global_id       TEXT NOT NULL DEFAULT '',
    name            TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    parent_id       INTEGER,
    created_date    TEXT,
    modified_date   TEXT,
    modified_by     INTEGER,
    created_by      INTEGER,
    version         INTEGER NOT NULL DEFAULT 0,
    current_version INTEGER NOT NULL DEFAULT 0,
    fields_json     TEXT NOT NULL DEFAULT '{}',
    resources_json  TEXT NOT NULL DEFAULT '{}',
    location_json   TEXT NOT NULL DEFAULT '{}',
    synced_at       REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (project_id) REFERENCES projects(id)
);
CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id);
CREATE INDEX IF NOT EXISTS idx_items_parent  ON items(parent_id);
CREATE INDEX IF NOT EXISTS idx_items_dockey  ON items(document_key);

-- Per-item version tracking (lightweight — just version number)
CREATE TABLE IF NOT EXISTS versions (
    item_id   INTEGER NOT NULL,
    version   INTEGER NOT NULL DEFAULT 0,
    synced_at REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id),
    FOREIGN KEY (item_id) REFERENCES items(id)
);

-- On-demand version snapshots (cached permanently, never evicted)
CREATE TABLE IF NOT EXISTS item_versions (
    item_id          INTEGER NOT NULL,
    version_num      INTEGER NOT NULL,
    fields_json      TEXT NOT NULL DEFAULT '{}',
    description_html TEXT NOT NULL DEFAULT '',
    modified_by      INTEGER,
    modified_date    TEXT,
    created_date     TEXT,
    type             TEXT NOT NULL DEFAULT '',
    version_comment  TEXT NOT NULL DEFAULT '',
    cached_at        REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (item_id, version_num)
);

-- Relationships between items
CREATE TABLE IF NOT EXISTS relationships (
    id                INTEGER PRIMARY KEY,
    project_id        INTEGER NOT NULL,
    from_item         INTEGER NOT NULL,
    to_item           INTEGER NOT NULL,
    relationship_type INTEGER,
    suspect           INTEGER NOT NULL DEFAULT 0,
    synced_at         REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rel_project ON relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_rel_from    ON relationships(from_item);
CREATE INDEX IF NOT EXISTS idx_rel_to      ON relationships(to_item);

-- Attachment metadata (not file content — use images table for BLOBs)
CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY,
    item_id     INTEGER NOT NULL,
    file_name   TEXT NOT NULL DEFAULT '',
    file_size   INTEGER NOT NULL DEFAULT 0,
    mime_type   TEXT NOT NULL DEFAULT '',
    url         TEXT NOT NULL DEFAULT '',
    local_path  TEXT,
    synced_at   REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_att_item ON attachments(item_id);

-- Image BLOBs (only in _with_images variant, populated by generate_caches.py)
CREATE TABLE IF NOT EXISTS images (
    attachment_id INTEGER PRIMARY KEY,
    file_name     TEXT NOT NULL DEFAULT '',
    mime_type     TEXT NOT NULL DEFAULT 'image/png',
    data          BLOB NOT NULL,
    size_bytes    INTEGER NOT NULL DEFAULT 0,
    cached_at     REAL NOT NULL DEFAULT 0
);

-- Test management
CREATE TABLE IF NOT EXISTS test_plans (
    id            INTEGER PRIMARY KEY,
    project_id    INTEGER NOT NULL,
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT '',
    archived      INTEGER NOT NULL DEFAULT 0,
    created_date  TEXT,
    modified_date TEXT,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tp_project ON test_plans(project_id);

CREATE TABLE IF NOT EXISTS test_cycles (
    id            INTEGER PRIMARY KEY,
    test_plan_id  INTEGER NOT NULL,
    project_id    INTEGER NOT NULL DEFAULT 0,
    name          TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    start_date    TEXT,
    end_date      TEXT,
    status        TEXT NOT NULL DEFAULT '',
    created_date  TEXT,
    modified_date TEXT,
    fields_json   TEXT NOT NULL DEFAULT '{}',
    synced_at     REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (test_plan_id) REFERENCES test_plans(id)
);
CREATE INDEX IF NOT EXISTS idx_tc_plan    ON test_cycles(test_plan_id);
CREATE INDEX IF NOT EXISTS idx_tc_project ON test_cycles(project_id);

CREATE TABLE IF NOT EXISTS test_runs (
    id                       INTEGER PRIMARY KEY,
    test_cycle_id            INTEGER NOT NULL,
    project_id               INTEGER NOT NULL DEFAULT 0,
    test_case_id             INTEGER,
    test_case_version_number INTEGER,
    name                     TEXT NOT NULL DEFAULT '',
    status                   TEXT NOT NULL DEFAULT 'NOT_RUN',
    assigned_to              INTEGER,
    actual_results           TEXT NOT NULL DEFAULT '',
    execution_date           TEXT,
    planned_results          TEXT NOT NULL DEFAULT '',
    fields_json              TEXT NOT NULL DEFAULT '{}',
    synced_at                REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (test_cycle_id) REFERENCES test_cycles(id)
);
CREATE INDEX IF NOT EXISTS idx_tr_cycle   ON test_runs(test_cycle_id);
CREATE INDEX IF NOT EXISTS idx_tr_case    ON test_runs(test_case_id);
CREATE INDEX IF NOT EXISTS idx_tr_project ON test_runs(project_id);

-- Sync log
CREATE TABLE IF NOT EXISTS sync_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    INTEGER NOT NULL,
    started_at    TEXT NOT NULL,
    completed_at  TEXT,
    total_items   INTEGER NOT NULL DEFAULT 0,
    changed_items INTEGER NOT NULL DEFAULT 0,
    new_items     INTEGER NOT NULL DEFAULT 0,
    deleted_items INTEGER NOT NULL DEFAULT 0,
    errors        INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL DEFAULT 'running',
    message       TEXT NOT NULL DEFAULT ''
);

-- Unified FTS5 across items, test plans, cycles, runs
CREATE TABLE IF NOT EXISTS unified_fts_content (
    rowid        INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id    INTEGER NOT NULL,
    doc_type     TEXT NOT NULL DEFAULT 'item',
    project_id   INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT '',
    name         TEXT NOT NULL DEFAULT '',
    description  TEXT NOT NULL DEFAULT '',
    document_key TEXT NOT NULL DEFAULT '',
    extra_text   TEXT NOT NULL DEFAULT '',
    UNIQUE(entity_id, doc_type)
);
CREATE INDEX IF NOT EXISTS idx_ufc_entity  ON unified_fts_content(entity_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_ufc_project ON unified_fts_content(project_id);

CREATE VIRTUAL TABLE IF NOT EXISTS unified_fts USING fts5(
    name,
    description,
    document_key,
    extra_text,
    content=unified_fts_content,
    content_rowid=rowid
);
"""

# ---------------------------------------------------------------------------
# Migration SQL — applied when existing DB has older schema_version
# ---------------------------------------------------------------------------

MIGRATION_SQL: dict[int, str] = {
    4: """
        -- Add project_id to test_cycles (eliminates JOIN to test_plans)
        ALTER TABLE test_cycles ADD COLUMN project_id INTEGER NOT NULL DEFAULT 0;

        -- Add project_id to test_runs (eliminates 2-JOIN chain)
        ALTER TABLE test_runs ADD COLUMN project_id INTEGER NOT NULL DEFAULT 0;

        -- Backfill project_id from joins
        UPDATE test_cycles SET project_id = (
            SELECT project_id FROM test_plans WHERE id = test_cycles.test_plan_id
        ) WHERE project_id = 0;

        UPDATE test_runs SET project_id = (
            SELECT tc.project_id FROM test_cycles tc
            WHERE tc.id = test_runs.test_cycle_id
        ) WHERE project_id = 0;

        -- Drop legacy items_fts (unified_fts doc_type='item' replaces it)
        DROP TABLE IF EXISTS items_fts;

        -- Add images table (BLOBs for _with_images variant)
        CREATE TABLE IF NOT EXISTS images (
            attachment_id INTEGER PRIMARY KEY,
            file_name     TEXT NOT NULL DEFAULT '',
            mime_type     TEXT NOT NULL DEFAULT 'image/png',
            data          BLOB NOT NULL,
            size_bytes    INTEGER NOT NULL DEFAULT 0,
            cached_at     REAL NOT NULL DEFAULT 0
        );
    """
}

REBUILD_FTS_SQL = "INSERT INTO unified_fts(unified_fts) VALUES('rebuild');"
