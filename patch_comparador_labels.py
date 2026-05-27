with open('src/components/plano/ComparadorVersiones.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Quitar "anterior" y "actual" de los labels de version
c = c.replace('Versi\u00f3n A \u00b7 anterior', 'Versi\u00f3n A')
c = c.replace('Versi\u00f3n B \u00b7 actual',   'Versi\u00f3n B')
c = c.replace('Ver. A (anterior)',               'Ver. A')
c = c.replace('Ver. B (actual)',                 'Ver. B')
print('  [1] Labels OK')

# 2. Insertar tip antes del primer versionBlock
TIP = '''          <div className={styles.tipMsg}>
            \U0001f4a1 Recomendaci\u00f3n: seleccion\u00e1 la versi\u00f3n m\u00e1s antigua como Versi\u00f3n A y la m\u00e1s nueva como Versi\u00f3n B para ver los cambios correctamente.
          </div>
'''
TARGET = '          <div className={styles.versionBlock}>'
if TARGET in c and 'tipMsg' not in c:
    c = c.replace(TARGET, TIP + TARGET, 1)
    print('  [2] Tip insertado OK')
else:
    print('  [2] SKIP (ya existe o anchor no encontrado)')

with open('src/components/plano/ComparadorVersiones.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
