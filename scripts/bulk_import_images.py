"""Bulk-download all uncached Jama embedded images using a browser session cookie.

Usage:
  1. Open https://enphase.jamacloud.com in your browser (login via Azure AD SSO)
  2. Open DevTools (F12) → Application → Cookies → jamacloud.com
  3. Copy the value of the 'JSESSIONID' cookie (or all cookies as a single string)
  4. Run: python bulk_import_images.py --cookie "JSESSIONID=abc123..."

Alternatively, export all cookies in Netscape format and use:
  python bulk_import_images.py --cookie-file cookies.txt
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

import httpx

API_BASE = os.environ.get("JAMA_VIEWER_API", "http://localhost:8765")
CACHE_DIR = Path(os.path.expanduser("~/.jama-mcp-v2/attachments"))


async def get_uncached() -> list[dict]:
    async with httpx.AsyncClient() as http:
        r = await http.get(f"{API_BASE}/api/proxy/jama-image/uncached", timeout=30)
        r.raise_for_status()
        data = r.json()
        return data.get("uncached", [])


async def download_image(
    http: httpx.AsyncClient, url: str, att_id: int, file_name: str, cookies: str
) -> bool:
    """Download a single image using the browser session cookie."""
    cache_dir = CACHE_DIR / str(att_id)
    cache_dir.mkdir(parents=True, exist_ok=True)
    local_path = cache_dir / file_name

    if local_path.exists() and local_path.stat().st_size > 100:
        return True  # already cached

    try:
        r = await http.get(
            url,
            headers={
                "Cookie": cookies,
                "Accept": "image/*, */*",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
            follow_redirects=True,
            timeout=30,
        )
        if r.status_code == 200 and len(r.content) > 100:
            # Verify it's an image (not an HTML login page)
            ct = r.headers.get("content-type", "")
            if "image" in ct or r.content[:4] in (b'\x89PNG', b'\xff\xd8\xff', b'GIF8', b'RIFF'):
                local_path.write_bytes(r.content)
                return True
            else:
                print(f"  SKIP {att_id}: got {ct} ({len(r.content)}b) — likely login redirect")
                return False
        else:
            print(f"  FAIL {att_id}: HTTP {r.status_code} ({len(r.content)}b)")
            return False
    except Exception as e:
        print(f"  ERROR {att_id}: {e}")
        return False


async def main(cookies: str, max_concurrent: int = 5):
    print("Fetching list of uncached images...")
    uncached = await get_uncached()
    print(f"Found {len(uncached)} uncached images")

    if not uncached:
        print("All images are cached!")
        return

    # Deduplicate by attachment_id
    seen = set()
    unique = []
    for img in uncached:
        if img["attachment_id"] not in seen:
            seen.add(img["attachment_id"])
            unique.append(img)
    print(f"Unique attachment IDs: {len(unique)}")

    sem = asyncio.Semaphore(max_concurrent)
    ok_count = 0
    fail_count = 0

    async with httpx.AsyncClient() as http:

        async def download_one(img: dict):
            nonlocal ok_count, fail_count
            async with sem:
                success = await download_image(
                    http, img["url"], img["attachment_id"], img["file_name"], cookies
                )
                if success:
                    ok_count += 1
                else:
                    fail_count += 1
                total = ok_count + fail_count
                if total % 10 == 0 or total == len(unique):
                    print(f"  Progress: {total}/{len(unique)} (OK: {ok_count}, FAIL: {fail_count})")

        tasks = [download_one(img) for img in unique]
        await asyncio.gather(*tasks)

    print(f"\nDone! Cached: {ok_count}, Failed: {fail_count}")
    if fail_count > 0:
        print("Tip: if images failed, your cookie may have expired. Re-extract from browser.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Bulk import uncached Jama images")
    parser.add_argument("--cookie", help="Cookie string, e.g. 'JSESSIONID=abc123; other=val'")
    parser.add_argument("--cookie-file", help="Path to Netscape-format cookie file")
    parser.add_argument("--concurrency", type=int, default=5, help="Max concurrent downloads")
    args = parser.parse_args()

    if args.cookie_file:
        # Parse Netscape cookie file → cookie string
        cookies_parts = []
        with open(args.cookie_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("\t")
                    if len(parts) >= 7:
                        cookies_parts.append(f"{parts[5]}={parts[6]}")
        cookie_str = "; ".join(cookies_parts)
    elif args.cookie:
        cookie_str = args.cookie
    else:
        # Interactive prompt
        print("No cookie provided. To get your JSESSIONID:")
        print("  1. Open https://enphase.jamacloud.com in your browser (login via Azure AD)")
        print("  2. Press F12 -> Application -> Cookies -> jamacloud.com")
        print("  3. Copy the JSESSIONID cookie value")
        print()
        value = input("Paste JSESSIONID value here: ").strip()
        if not value:
            print("No value entered. Exiting.")
            sys.exit(1)
        cookie_str = f"JSESSIONID={value}" if not value.startswith("JSESSIONID=") else value

    asyncio.run(main(cookie_str, args.concurrency))
