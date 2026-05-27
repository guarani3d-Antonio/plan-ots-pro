# Patch: Reemplazar window.confirm con modal estilizado dentro de ModalVersiones

# ── 1. ModalVersiones.tsx — estado + onClick + overlay ──────────
with open('src/components/plano/ModalVersiones.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1a. Agregar estado pendingRestaur
for i, l in enumerate(lines):
    if 'const [eliminando, setEliminando]' in l and 'pendingRestaur' not in ''.join(lines):
        lines.insert(i+1, '  const [pendingRestaur, setPendingRestaur] = useState<Version | null>(null);\n')
        print('  [1a] estado pendingRestaur OK')
        break

# 1b. Cambiar onClick del boton Restaurar
for i, l in enumerate(lines):
    if 'onClick={() => onRestaurar(v)}' in l:
        lines[i] = l.replace('onClick={() => onRestaurar(v)}', 'onClick={() => setPendingRestaur(v)}')
        print('  [1b] onClick Restaurar OK')
        break

# 1c. Insertar overlay de confirmacion antes del cierre del modal (ultimo </div> de 6 espacios)
confirm_jsx = [
    '\n',
    '        {/* \u2500\u2500\u2500 Confirmaci\u00f3n restaurar \u2500\u2500\u2500 */}\n',
    '        {pendingRestaur && (\n',
    '          <div className={styles.confirmOverlay}>\n',
    '            <div className={styles.confirmBox}>\n',
    '              <div className={styles.confirmIcon}>\u26a0\ufe0f</div>\n',
    '              <div className={styles.confirmTitle}>Confirmar restauraci\u00f3n</div>\n',
    '              <div className={styles.confirmMsg}>\n',
    '                \u00bfRestaurar al estado de <strong>"{pendingRestaur.nombre}"</strong>?\n',
    '                <br /><br />\n',
    '                Se guardar\u00e1 un backup autom\u00e1tico del estado actual antes de restaurar.\n',
    '              </div>\n',
    '              <div className={styles.confirmBtns}>\n',
    '                <button className={styles.btnCancelar} type="button"\n',
    '                  onClick={() => setPendingRestaur(null)}>Cancelar</button>\n',
    '                <button className={styles.btnConfirmarRed} type="button"\n',
    '                  onClick={() => { onRestaurar(pendingRestaur as import(\'../../services/versionesService\').Version); setPendingRestaur(null); }}>\n',
    '                  \u2713 Confirmar restauraci\u00f3n\n',
    '                </button>\n',
    '              </div>\n',
    '            </div>\n',
    '          </div>\n',
    '        )}\n',
]
inserted = False
for i in range(len(lines)-1, -1, -1):
    if lines[i].rstrip('\r\n') == '      </div>' and not inserted:
        lines[i:i] = confirm_jsx
        inserted = True
        print(f'  [1c] overlay insertado en linea {i}')
        break

with open('src/components/plano/ModalVersiones.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
print('  ModalVersiones.tsx OK')

# ── 2. VistaPlano.tsx — eliminar window.confirm ──────────────────
with open('src/components/plano/VistaPlano.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

import re
# Eliminar el bloque confirm y su guard return
c = re.sub(
    r"\s*const confirmar = window\.confirm\([^)]+\);\s*if \(!confirmar\) return;\s*",
    "\n    ",
    c, count=1
)
with open('src/components/plano/VistaPlano.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('  [2] VistaPlano.tsx window.confirm removido')
print('Done')
