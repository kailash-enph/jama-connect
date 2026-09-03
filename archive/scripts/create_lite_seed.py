#!/usr/bin/env python3
"""
Create a lightweight master seed with project metadata only (no full items).

This seed is bundled with the pip package for instant first-run experience.

Output:
  - src/jama_mcp_v2/cache_seeds/master_seed_lite.db.gz (10-20 MB)
  - src/jama_mcp_v2/cache_seeds/master_seed_lite_metadata.json

Usage:
  python scripts/create_lite_seed.py
"""

import asyncio
import gzip
import json
import logging
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from jama_mcp_v2.api_client import JamaClient
from jama_mcp_v2.settings_api import get_settings

import aiosqlite

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def create_lite_seed():
    """Create a lightweight master seed with project metadata only."""
    
    # Output paths
    output_dir = Path(__file__).parent.parent / "src" / "jama_mcp_v2" / "cache_seeds"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    lite_db_path = output_dir / "master_seed_lite.db"
    lite_gz_path = output_dir / "master_seed_lite.db.gz"
    metadata_path = output_dir / "master_seed_lite_metadata.json"
    
    # Remove existing files
    lite_db_path.unlink(missing_ok=True)
    lite_gz_path.unlink(missing_ok=True)
    metadata_path.unlink(missing_ok=True)
    
    logger.info("Creating lite seed database: %s", lite_db_path)
    
    # Create database
    async with aiosqlite.connect(lite_db_path) as conn:
        # Create schema (minimal)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY,
                name TEXT,
                description TEXT,
                created_date TEXT,
                modified_date TEXT,
                item_count INTEGER DEFAULT 0,
                is_folder INTEGER DEFAULT 0,
                parent_id INTEGER,
                project_key TEXT
            )
        """)
        
        await conn.execute("""
            INSERT INTO meta (key, value) VALUES ('schema_version', '3')
        """)
        
        await conn.execute("""
            INSERT INTO meta (key, value) VALUES ('created', ?)
        """, (datetime.now(timezone.utc).isoformat(),))
        
        await conn.commit()
        
        # Fetch all projects from Jama
        settings = get_settings()
        client = JamaClient(
            base_url=settings.jama_url,
            client_id=settings.jama_client_id,
            client_secret=settings.jama_client_secret,
        )
        
        logger.info("Fetching projects from Jama...")
        projects_data = await client.get_projects()
        
        total_projects = 0
        total_items = 0
        
        for project in projects_data:
            project_id = project["id"]
            project_name = project.get("fields", {}).get("name", f"Project {project_id}")
            project_desc = project.get("fields", {}).get("description", "")
            created_date = project.get("createdDate", "")
            modified_date = project.get("modifiedDate", "")
            is_folder = project.get("isFolder", False)
            parent_id = project.get("parent", {}).get("project") if isinstance(project.get("parent"), dict) else None
            project_key = project.get("projectKey", "")
            
            # Get item count for this project
            try:
                items_response = await client.get_items(project_id, limit=1)
                item_count = items_response.get("meta", {}).get("pageInfo", {}).get("totalResults", 0)
            except Exception as exc:
                logger.warning("Failed to get item count for project %d: %s", project_id, exc)
                item_count = 0
            
            await conn.execute("""
                INSERT INTO projects (id, name, description, created_date, modified_date, item_count, is_folder, parent_id, project_key)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (project_id, project_name, project_desc, created_date, modified_date, item_count, int(is_folder), parent_id, project_key))
            
            total_projects += 1
            total_items += item_count
            
            logger.info("  Project %d: %s (%d items)", project_id, project_name, item_count)
        
        await conn.commit()
        
        logger.info("Lite seed created: %d projects, %d total items", total_projects, total_items)
    
    # Get file size
    uncompressed_size_mb = lite_db_path.stat().st_size / (1024 * 1024)
    logger.info("Uncompressed size: %.1f MB", uncompressed_size_mb)
    
    # Compress
    logger.info("Compressing...")
    with open(lite_db_path, "rb") as f_in:
        with gzip.open(lite_gz_path, "wb", compresslevel=9) as f_out:
            shutil.copyfileobj(f_in, f_out)
    
    compressed_size_mb = lite_gz_path.stat().st_size / (1024 * 1024)
    logger.info("Compressed size: %.1f MB", compressed_size_mb)
    
    # Create metadata
    metadata = {
        "version": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "generated": datetime.now(timezone.utc).isoformat(),
        "total_projects": total_projects,
        "total_items": total_items,
        "compressed_size_mb": round(compressed_size_mb, 1),
        "uncompressed_size_mb": round(uncompressed_size_mb, 1),
        "description": "Lightweight master seed with project metadata only (no full items)",
        "bundled": True,
    }
    
    with open(metadata_path, "w") as f:
        json.dump(metadata, f, indent=2)
    
    logger.info("Metadata saved: %s", metadata_path)
    
    # Cleanup uncompressed DB
    lite_db_path.unlink()
    
    logger.info("✅ Lite seed created successfully!")
    logger.info("   Compressed: %s (%.1f MB)", lite_gz_path, compressed_size_mb)
    logger.info("   Metadata: %s", metadata_path)
    logger.info("")
    logger.info("Next steps:")
    logger.info("  1. Update pyproject.toml to include cache_seeds/*.gz")
    logger.info("  2. Update cache.py to use bundled seed first")
    logger.info("  3. Build wheel: uv build")
    logger.info("  4. Test: pip install --force-reinstall dist/jama_connect-*.whl")


if __name__ == "__main__":
    asyncio.run(create_lite_seed())
