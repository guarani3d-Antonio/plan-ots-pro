import re

fixes = {
    r'\ud83d\udcbe': '💾',
    r'\ud83d\uddd1': '🗑',
    r'\u2715': '✕',
    r'\u2014': '—',
    r'\u00b7': '·',
    r'\u00bf': '¿',
    r'\u00f3': 'ó',
    r'\u00fa': 'ú',
    r'\u00e9': 'é',
    r'\u00e1': 'á',
    r'\u00ed': 'í',
    r'\u2026': '…',
    r'\u00e0': 'à',
}

files = [
    'src/components/plano/ModalVersiones.tsx',
    'src/components/plano/VistaPlano.tsx',
]

for path in files:
    with open(path, 'r', encoding='utf-8') as f:
        c = f.read()
    original = c
    count = 0
    for esc, char in fixes.items():
        occurrences = c.count(esc)
        if occurrences:
            c = c.replace(esc, char)
            count += occurrences
            print(f'  {path}: {esc} → {char} ({occurrences}x)')
    if c != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(c)
        print(f'  ✓ {path} actualizado ({count} reemplazos)')
    else:
        print(f'  - {path}: sin cambios')

print('Done')
