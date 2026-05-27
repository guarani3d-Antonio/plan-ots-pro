content = """\
/* src/components/plano/ModalVersiones.module.css */

.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-default, #E2E8F0);
  border-radius: 12px;
  width: 520px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.15);
  overflow: hidden;
}

/* ─── Header ─── */
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-default, #E2E8F0);
  flex-shrink: 0;
}
.headerIcon { font-size: 16px; }
.headerTitle {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary, #0F172A);
  flex: 1;
}
.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #64748B);
  font-size: 15px;
  padding: 3px 7px;
  border-radius: 5px;
  line-height: 1;
}
.closeBtn:hover {
  background: var(--border-default, #E2E8F0);
  color: var(--text-primary, #0F172A);
}

/* ─── Guardar sección ─── */
.guardarSec {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-default, #E2E8F0);
  flex-shrink: 0;
}

.btnNueva {
  background: #2563EB;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
  transition: background .15s;
}
.btnNueva:hover { background: #1D4ED8; }

.form { display: flex; flex-direction: column; gap: 8px; }

.input {
  width: 100%;
  border: 1px solid var(--border-default, #E2E8F0);
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13px;
  color: var(--text-primary, #0F172A);
  background: var(--bg-surface, #fff);
  outline: none;
  box-sizing: border-box;
}
.input:focus {
  border-color: #2563EB;
  box-shadow: 0 0 0 2px rgba(37,99,235,.15);
}

.formRow {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btnCancelar {
  background: none;
  border: 1px solid var(--border-default, #E2E8F0);
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-secondary, #64748B);
  cursor: pointer;
}
.btnCancelar:hover { background: var(--border-default, #E2E8F0); }

.btnConfirmar {
  background: #2563EB;
  color: #fff;
  border: none;
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.btnConfirmar:hover:not(:disabled) { background: #1D4ED8; }
.btnConfirmar:disabled { opacity: 0.5; cursor: not-allowed; }

/* ─── Lista ─── */
.lista {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.msg {
  padding: 28px 24px;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary, #64748B);
  line-height: 1.7;
}

/* ─── Version card ─── */
.card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-default, #E2E8F0);
  transition: background .1s;
}
.card:last-child { border-bottom: none; }
.card:hover { background: #F8FAFC; }

.vNum {
  font-size: 20px;
  font-weight: 800;
  color: #2563EB;
  min-width: 44px;
  padding-top: 1px;
  line-height: 1;
  flex-shrink: 0;
}

.cardBody { flex: 1; min-width: 0; }

.cardNombre {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #0F172A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cardMeta {
  font-size: 11px;
  color: var(--text-secondary, #64748B);
  margin-top: 2px;
}

.cardDesc {
  font-size: 11px;
  color: var(--text-secondary, #64748B);
  margin-top: 2px;
  font-style: italic;
}

.cardBtns {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.btnRestaurar {
  background: #2563EB;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s;
}
.btnRestaurar:hover { background: #1D4ED8; }

.btnComparar {
  background: none;
  border: 1px solid var(--border-default, #E2E8F0);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 11px;
  color: var(--text-secondary, #64748B);
  cursor: pointer;
}
.btnComparar:hover {
  background: var(--border-default, #E2E8F0);
  color: var(--text-primary, #0F172A);
}

.btnDel {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary, #64748B);
  font-size: 14px;
  padding: 4px 6px;
  border-radius: 4px;
  flex-shrink: 0;
  align-self: center;
  transition: background .1s;
}
.btnDel:hover:not(:disabled) { background: #FEF2F2; color: #DC2626; }
.btnDel:disabled { opacity: 0.4; cursor: not-allowed; }
"""

with open('src/components/plano/ModalVersiones.module.css', 'w', encoding='utf-8') as f:
    f.write(content)
print('OK CSS -', content.count('\n'), 'lineas')
