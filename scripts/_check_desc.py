"""Quick check: what format are Jama item descriptions stored in?"""
import sqlite3

conn = sqlite3.connect("C:/Users/ENPH/.jama-mcp-v2/cache.db")

# 1. Show a description with embedded images
rows = conn.execute(
    "SELECT id, description FROM items WHERE description LIKE '%img%' OR description LIKE '%attachment%' LIMIT 3"
).fetchall()
for item_id, desc in rows:
    print(f"=== Item {item_id} (first 600 chars) ===")
    print(desc[:600])
    print()

# 2. Count items with image references
ct = conn.execute(
    "SELECT COUNT(*) FROM items WHERE description LIKE '%img%' OR description LIKE '%attachment%'"
).fetchone()[0]
print(f"Total items with image/attachment refs: {ct}")

# 3. Show table schema
print("\n=== items table columns ===")
for row in conn.execute("PRAGMA table_info(items)"):
    print(row)
