"""Allow running as `python -m jama_editor`."""

import argparse
import os

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Jama Editor Backend Server")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("JAMA_EDITOR_PORT", "8766")),
        help="Editor REST API port (default: 8766)",
    )
    args = parser.parse_args()

    from .editor_server import run_editor
    import jama_editor.editor_server as srv

    srv.EDITOR_PORT = args.port
    run_editor()
