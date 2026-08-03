"""Allow running as `python -m jama_mcp_v2`.

Unified entry point:
  python -m jama_mcp_v2                    # MCP stdio mode (for Windsurf)
  python -m jama_mcp_v2 --rest-only        # REST API + editor on single port
  python -m jama_mcp_v2 --rest-only --port 9000
"""

import argparse
import os

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Jama Unified Backend")
    parser.add_argument("--rest-only", action="store_true",
                        help="Run unified REST API only (no MCP stdio)")
    parser.add_argument("--port", type=int,
                        default=int(os.environ.get("JAMA_REST_PORT", "8765")),
                        help="REST API port (default: 8765)")
    args = parser.parse_args()

    if args.rest_only:
        from .server import run_rest
        from .services import services as _svc
        import jama_mcp_v2.server as srv
        # Override port if specified
        _svc_mod = __import__("jama_mcp_v2.services", fromlist=["REST_PORT"])
        if args.port != 8765:
            srv.REST_PORT = args.port  # type: ignore[attr-defined]
        run_rest()
    else:
        from .server import main
        main()
