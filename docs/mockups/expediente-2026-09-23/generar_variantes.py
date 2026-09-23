"""Lámina de estados alternativos para revisar sin confundirlos con documentos firmados."""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
FONT_DIR = Path(r"C:\Windows\Fonts")
FONT = str(FONT_DIR / "segoeui.ttf")
BOLD = str(FONT_DIR / "segoeuib.ttf")
im = Image.new("RGB", (1500, 960), "#F3F6FA")
d = ImageDraw.Draw(im)


def t(x, y, value, size=19, bold=False, color="#1E2D3D"):
    d.text((x, y), value, font=ImageFont.truetype(BOLD if bold else FONT, size), fill=color)


def box(x, y, w, h, fill="#FFFFFF", border="#D9E3EC"):
    d.rounded_rectangle((x, y, x+w, y+h), radius=15, fill=fill, outline=border, width=2)


def scenario(x, y, number, title, state, detail, action, color, bg):
    box(x, y, 700, 327)
    t(x+23, y+19, number, 16, True, "#315B91")
    t(x+23, y+46, title, 23, True, "#142C48")
    box(x+23, y+96, 654, 100, bg, bg)
    t(x+39, y+109, state, 24, True, color)
    t(x+39, y+153, detail, 16, False, "#263A4F")
    t(x+23, y+223, "REGLA DE PRESENTACIÓN", 14, True, "#315B91")
    t(x+23, y+251, action, 17, False, "#263A4F")


t(45, 27, "Estados que no deben parecer conformidad automática", 29, True, "#142C48")
t(45, 73, "Variantes visuales de la misma OT ficticia · diseño conceptual", 18, False, "#53657A")

scenario(45, 122, "ORDEN · BORRADOR", "Falta dato obligatorio", "No se puede emitir", "Falta confirmar canal y fecha de recepción del pedido.", "Mostrar el faltante junto al campo y conservar borrador.", "#8B5A0B", "#FFF5E3")
scenario(755, 122, "CIERRE · PRUEBA FALLIDA", "Resultado no conforme", "Cierre bloqueado", "T02 presentó una fuga visible en la verificación.", "Registrar acción correctiva y repetir la prueba; no afirmar cierre.", "#A73737", "#FBEDED")
scenario(45, 475, "ACTA · DECISIÓN FAVORABLE", "P01 resuelto", "Aceptación propuesta", "Copia entregada el 25/09; condiciones ya definidas.", "La firma/identidad se vincula al archivo exacto antes de formalizar.", "#176D4D", "#EAF6EF")
scenario(755, 475, "ACTA · RECHAZO", "Motivo registrado", "Recepción rechazada", "El receptor declara que T03 no quedó satisfactorio.", "Abrir tratamiento y nueva revisión; conservar el rechazo.", "#A73737", "#FBEDED")

box(45, 833, 1410, 75, "#EAF1F8", "#D9E3EC")
t(64, 846, "Aprobaciones por empresa", 17, True, "#315B91")
t(64, 877, "El menú Creador habilita la política; cada documento conserva su decisión y su firma propias.", 18)
t(47, 931, "MUESTRA · DATOS FICTICIOS · SIN FIRMA NI VALIDEZ", 13, True, "#8B5A0B")

path = HERE / "variantes_estados.png"
im.save(path)
print(path)
