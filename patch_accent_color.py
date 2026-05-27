import re, os, glob

# ── 1. index.css — paleta accent completa ──────────────────────
with open('src/index.css', 'r', encoding='utf-8') as f:
    c = f.read()

replacements = [
    ('#2462C9', '#3B599B'),
    ('#1A51B0', '#2E4A82'),
    ('#153F8F', '#243B6B'),
    ('#EBF2FF', '#EEF1F8'),
    ('#BFDBFE', '#B8C5E0'),
    ('rgba(36, 98, 201, 0.18)', 'rgba(59, 89, 155, 0.18)'),
]
for old, new in replacements:
    c = c.replace(old, new)

with open('src/index.css', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [1] index.css OK')

# ── 2. Todos los .css — hardcoded #2563EB y hover #1D4ED8 ──────
css_files = glob.glob('src/**/*.css', recursive=True) + glob.glob('src/*.css')
count = 0
for path in css_files:
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    orig = c
    c = c.replace('#2563EB', '#3B599B')
    c = c.replace('#2563eb', '#3B599B')
    c = c.replace('#1D4ED8', '#2E4A82')
    c = c.replace('#1d4ed8', '#2E4A82')
    if c != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        count += 1
        print(f'  [2] {path}')
print(f'  [2] {count} archivos CSS actualizados')
print('Done')
