#!/usr/bin/env python3
"""Génère les icônes PNG de L'Antre sans dépendance externe (zlib uniquement).

Usage : python3 tools/generate-icons.py
Produit : assets/icons/icon-{72,192,512}.png et assets/default-profile.png
"""
import os
import struct
import zlib

SS = 4  # facteur de suréchantillonnage (anticrénelage)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def write_png(path, w, h, pixels):
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filtre "None" pour chaque ligne
        for px in pixels[y]:
            raw += bytes(px)
    comp = zlib.compress(bytes(raw), 9)

    def chunk(tag, data):
        head = struct.pack('>I', len(data)) + tag + data
        return head + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', comp))
        f.write(chunk(b'IEND', b''))


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rounded_rect(x, y, w, h, r, px, py):
    if px < x or px > x + w or py < y or py > y + h:
        return False
    cx = min(max(px, x + r), x + w - r)
    cy = min(max(py, y + r), y + h - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def arch(px, py, x, w, top, bottom):
    """Arche : rectangle surmonté d'un demi-cercle."""
    r = w / 2.0
    if px < x or px > x + w or py > bottom or py < top:
        return False
    if py >= top + r:
        return True
    return (px - (x + r)) ** 2 + (py - (top + r)) ** 2 <= r * r


def render_icon(size):
    S = size * SS
    BG, P1, P2 = (26, 26, 26), (255, 45, 117), (255, 107, 157)
    ax, aw = 0.27 * S, 0.46 * S
    atop, abot = 0.20 * S, 0.82 * S
    th = 0.052 * S
    hx, hy, hr = ax + aw - 0.10 * S, 0.55 * S, 0.032 * S
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0.0, 0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    px, py = x * SS + sx + 0.5, y * SS + sy + 0.5
                    if not rounded_rect(0, 0, S, S, 0.22 * S, px, py):
                        continue
                    outer = arch(px, py, ax, aw, atop, abot)
                    inner = arch(px, py, ax + th, aw - 2 * th, atop + th, abot - th)
                    handle = (px - hx) ** 2 + (py - hy) ** 2 <= hr * hr
                    if (outer and not inner) or handle:
                        col = lerp(P1, P2, py / S)
                    elif outer:
                        col = (36, 36, 36)
                    else:
                        col = BG
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]; acc[3] += 255
            n = SS * SS
            a = acc[3] / n
            if a < 0.5:
                row.append((0, 0, 0, 0))
            else:
                k = acc[3] / 255.0
                row.append((round(acc[0] / k), round(acc[1] / k), round(acc[2] / k), round(a)))
        out.append(row)
    return out


def render_avatar(size):
    S = size * SS
    BG, FG = (45, 45, 45), (128, 128, 128)
    hcx, hcy, hr = 0.5 * S, 0.38 * S, 0.16 * S
    bcx, bcy, brx, bry = 0.5 * S, 1.00 * S, 0.32 * S, 0.47 * S
    out = []
    for y in range(size):
        row = []
        for x in range(size):
            acc = [0.0, 0.0, 0.0]
            for sy in range(SS):
                for sx in range(SS):
                    px, py = x * SS + sx + 0.5, y * SS + sy + 0.5
                    head = (px - hcx) ** 2 + (py - hcy) ** 2 <= hr * hr
                    body = ((px - bcx) / brx) ** 2 + ((py - bcy) / bry) ** 2 <= 1 and py > hcy + hr * 0.6
                    col = FG if (head or body) else BG
                    acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2]
            n = SS * SS
            row.append((round(acc[0] / n), round(acc[1] / n), round(acc[2] / n), 255))
        out.append(row)
    return out


if __name__ == '__main__':
    for s in (72, 192, 512):
        write_png(os.path.join(ROOT, 'assets', 'icons', f'icon-{s}x{s}.png'), s, s, render_icon(s))
        print(f'assets/icons/icon-{s}x{s}.png')
    write_png(os.path.join(ROOT, 'assets', 'default-profile.png'), 320, 320, render_avatar(320))
    print('assets/default-profile.png')
