#!/usr/bin/env python3
# dev server with no-cache headers
# plain http.server sends no Cache-Control, so browsers guess freshness from file mtime
# (heuristic caching) and serve stale js until a hard reload, this kills that during development

import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    server = http.server.ThreadingHTTPServer(("", port), NoCacheHandler)
    print(f"serving on http://localhost:{port} (Cache-Control: no-cache)")
    server.serve_forever()
