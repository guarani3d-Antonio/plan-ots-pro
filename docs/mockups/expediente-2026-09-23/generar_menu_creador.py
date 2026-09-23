"""Mockup visual de políticas documentales del Creador; no es una pantalla implementada."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
OUT = HERE / "menu_creador_politicas.png"
FONTS = Path(r"C:\Windows\Fonts")
REG = str(FONTS / "segoeui.ttf")
BOLD = str(FONTS / "segoeuib.ttf")

W, H = 1500, 1010
im = Image.new("RGB", (W, H), "#F3F6FA")
d = ImageDraw.Draw(im)


def font(size, bold=False):
    return ImageFont.truetype(BOLD if bold else REG, size)


def text(x, y, value, size=20, color="#1E2D3D", bold=False):
    d.text((x, y), value, font=font(size, bold), fill=color)


def card(box, fill="#FFFFFF", stroke="#D9E3EC", radius=16):
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=stroke, width=2)


def pill(x, y, value, fg, bg, width):
    card((x, y, x + width, y + 34), bg, bg, 16)
    text(x + 13, y + 5, value, 16, fg, True)


def toggle(x, y, enabled):
    d.rounded_rectangle((x, y, x + 50, y + 28), radius=14, fill="#176D4D" if enabled else "#C8D2DC")
    d.ellipse((x + 27 if enabled else x + 3, y + 3, x + 47 if enabled else x + 23, y + 25), fill="white")


# Side navigation
d.rectangle((0, 0, 250, H), fill="#203F70")
card((24, 27, 62, 65), "#DDE9F7", "#DDE9F7", 9)
text(36, 31, "P", 23, "#203F70", True)
text(76, 29, "Plan-OTs", 26, "#FFFFFF", True)
text(28, 112, "PLATAFORMA", 13, "#B8CAE1", True)
text(30, 154, "Empresas", 19, "#D5E2F2")
text(30, 207, "Accesos", 19, "#D5E2F2")
card((14, 254, 236, 309), "#3A5D92", "#3A5D92", 10)
text(30, 267, "Políticas documentales", 18, "#FFFFFF", True)
text(28, 962, "CREADOR · VISTA CONCEPTUAL", 12, "#B8CAE1", True)

# Header
text(292, 30, "Políticas documentales", 31, "#142C48", True)
text(293, 78, "Configuración por empresa · cada decisión conserva responsable, respaldo y vigencia", 18, "#53657A")
card((1070, 27, 1461, 80))
text(1092, 41, "Servicios Técnicos Ejemplo S.A.", 19, "#142C48", True)
text(1433, 42, "⌄", 21, "#53657A")

# Summary cards
summary = [
    (292, "2", "Aprobadas", "#EAF6EF", "#176D4D"),
    (563, "3", "Pendientes", "#FFF5E3", "#8B5A0B"),
    (834, "1", "No aprobada", "#FBEDED", "#A73737"),
    (1105, "6", "Módulos", "#EAF1F8", "#315B91"),
]
for x, number, label, bg, fg in summary:
    card((x, 118, x + 242, 200), bg, bg)
    text(x + 17, 131, number, 29, fg, True)
    text(x + 65, 146, label, 18, "#263A4F", True)

text(292, 231, "Reglas para emitir y recibir documentos", 23, "#142C48", True)
text(293, 266, "El estado habilita funciones; nunca aprueba ni firma automáticamente un documento.", 17, "#53657A")

rows = [
    ("Identidad y formularios", "Aprobada", "Emisor y formularios confirmados · vigencia 01/10/2026", True, "#EAF6EF", "#176D4D"),
    ("Revisión técnica", "Aprobada", "Supervisor autorizado · procedimiento PR-02", True, "#EAF6EF", "#176D4D"),
    ("Evidencias exigidas", "Pendiente", "Falta aprobación de criterios por tipo de trabajo", False, "#FFF5E3", "#8B5A0B"),
    ("Firma y recepción", "Pendiente", "Falta definir método y autoridad del receptor", False, "#FFF5E3", "#8B5A0B"),
    ("Garantía contractual", "No aprobada", "Sin condiciones contractuales verificadas", False, "#FBEDED", "#A73737"),
    ("Conservación y entrega", "Pendiente", "Falta definir plazo y canales permitidos", False, "#FFF5E3", "#8B5A0B"),
]

for i, (name, state, detail, active, bg, fg) in enumerate(rows):
    y = 310 + i * 94
    card((292, y, 1461, y + 79))
    text(311, y + 10, name, 20, "#142C48", True)
    text(311, y + 40, detail, 16, "#53657A")
    pill(1090, y + 22, state, fg, bg, 127 if state == "No aprobada" else 103)
    toggle(1390, y + 26, active)

card((292, 894, 1461, 978), "#EAF1F8", "#D9E3EC")
text(311, 907, "Regla de seguridad permanente", 18, "#315B91", True)
text(311, 938, "Versiones emitidas, firmas existentes y trazabilidad no se pueden desactivar desde este menú.", 17, "#263A4F")
text(293, 987, "MUESTRA · DATOS FICTICIOS · PANTALLA NO IMPLEMENTADA", 13, "#8B5A0B", True)

im.save(OUT)
print(OUT)
