"""Genera los iconos PNG de la PWA sin dependencias externas (solo librería estándar).

Uso:  python tools/make_icons.py
Crea icons/icon-192.png e icons/icon-512.png: fondo degradado a sangre completa (válido como
icono "maskable") y un rayo blanco centrado dentro de la zona segura.
"""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = (109, 93, 252)   # violeta (color de acento)
B = (255, 111, 181)  # rosa
# Rayo en coordenadas de 24x24 (mismo dibujo que el icono "bolt" de la app)
BOLT = [(13, 2.5), (4.5, 13.5), (12, 13.5), (11, 21.5), (19.5, 10.5), (12, 10.5)]


def inside(px, py, poly):
    c = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
            c = not c
        j = i
    return c


def render(size):
    scale = size * 0.52 / 24
    off = size / 2 - 12 * scale
    poly = [(x * scale + off, y * scale + off) for x, y in BOLT]
    ss = [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)]  # supermuestreo 2x2
    rows = []
    for y in range(size):
        row = bytearray([0])  # filtro PNG "none"
        for x in range(size):
            t = (x + y) / (2 * size) * 0.75
            bg = [round(A[k] + (B[k] - A[k]) * t) for k in range(3)]
            cov = sum(inside(x + dx, y + dy, poly) for dx, dy in ss) / len(ss)
            row += bytes(round(bg[k] + (255 - bg[k]) * cov) for k in range(3))
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    for s in (192, 512):
        (out / f"icon-{s}.png").write_bytes(render(s))
        print(f"icons/icon-{s}.png")
