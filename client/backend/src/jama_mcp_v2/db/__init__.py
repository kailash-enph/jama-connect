"""Database layer — replaces the monolithic cache.py JamaCache class.

Exports:
    ProjectDb    — per-project SQLite DB with bulk_write context
    MasterDb     — lightweight project-list DB (from cache server)
    CacheManager — routes reads/writes to the correct ProjectDb
"""

from .manager import CacheManager
from .master_db import MasterDb
from .project_db import ProjectDb

__all__ = ["CacheManager", "MasterDb", "ProjectDb"]
