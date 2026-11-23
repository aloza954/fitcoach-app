"""Servidor local de desarrollo sin caché (para ver los cambios al recargar).

Uso:  python tools/serve.py [puerto]      (por defecto 8765)
Abre http://localhost:8765 en el navegador. Solo escucha en 127.0.0.1.
"""
import functools
import http.server
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as srv:
        print(f"FitCoach en http://localhost:{port}  (Ctrl+C para parar)")
        srv.serve_forever()
