"""Genera cinco mockups A4 con datos ficticios; no es el motor de informes de Plan-OTs."""

from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor, Color
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import simpleSplit
from pypdf import PdfReader, PdfWriter


HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / "output" / "pdf" / "expediente-2026-09-23"
OUT.mkdir(parents=True, exist_ok=True)
FONT_DIR = Path(r"C:\Windows\Fonts")
pdfmetrics.registerFont(TTFont("Segoe", str(FONT_DIR / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("Segoe-Bold", str(FONT_DIR / "segoeuib.ttf")))
W, H = A4
M = 39
CW = W - 2 * M

NAVY = HexColor("#142C48")
BLUE = HexColor("#315B91")
INK = HexColor("#1E2D3D")
MUTED = HexColor("#53657A")
LINE = HexColor("#D7E0E9")
PALE = HexColor("#F4F7FA")
ICE = HexColor("#EAF1F8")
GREEN = HexColor("#16754F")
GREEN_PALE = HexColor("#EAF6EF")
AMBER = HexColor("#8B5A0B")
AMBER_PALE = HexColor("#FFF5E3")
RED = HexColor("#A73737")
RED_PALE = HexColor("#FBEDED")


def txt(c, x, y, value, size=10.5, bold=False, color=INK):
    c.setFont("Segoe-Bold" if bold else "Segoe", size)
    c.setFillColor(color)
    c.drawString(x, y, str(value))


def right(c, x, y, value, size=9, bold=False, color=INK):
    c.setFont("Segoe-Bold" if bold else "Segoe", size)
    c.setFillColor(color)
    c.drawRightString(x, y, str(value))


def rounded(c, x, top, width, height, fill=PALE, stroke=LINE, radius=7):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(.7)
    c.roundRect(x, top - height, width, height, radius, fill=1, stroke=1)


def lines(value, width, size=10.5, bold=False):
    return simpleSplit(str(value), "Segoe-Bold" if bold else "Segoe", size, width)


def para(c, x, top, value, width, size=10.5, leading=14.5, bold=False, color=INK):
    wrapped = lines(value, width, size, bold)
    for i, line in enumerate(wrapped):
        txt(c, x, top - size - i * leading, line, size, bold, color)
    return top - max(1, len(wrapped)) * leading


def badge(c, x, top, value, fill=ICE, color=BLUE, width=None):
    fs = 8.4
    width = width or max(58, pdfmetrics.stringWidth(value, "Segoe-Bold", fs) + 19)
    rounded(c, x, top, width, 23, fill, fill, 11)
    txt(c, x + 9, top - 15.4, value, fs, True, color)
    return width


def section(c, n, label, top):
    c.setFillColor(BLUE)
    c.circle(M + 9, top - 9, 9, fill=1, stroke=0)
    txt(c, M + 6.3, top - 12.5, str(n), 8, True, HexColor("#FFFFFF"))
    txt(c, M + 26, top - 13, label.upper(), 9.5, True, NAVY)
    c.setStrokeColor(LINE)
    c.setLineWidth(.7)
    c.line(M, top - 22, W - M, top - 22)
    return top - 28


def cell(c, x, top, label, value, width, value_size=9.8):
    txt(c, x, top - 10, label.upper(), 7.6, True, MUTED)
    para(c, x, top - 14, value, width, value_size, 12.7)


def header(c, doc_type, title, docid, date, status):
    c.setFillColor(NAVY)
    c.roundRect(M, H - 60, 27, 27, 6, fill=1, stroke=0)
    txt(c, M + 8, H - 50.5, "P", 15, True, HexColor("#FFFFFF"))
    txt(c, M + 37, H - 43, "SERVICIOS TÉCNICOS EJEMPLO S.A.", 9.6, True, NAVY)
    txt(c, M + 37, H - 56, "Expediente técnico  /  OT-042 · Ciclo 01", 8.5, False, MUTED)
    badge(c, W - M - 194, H - 35, "MUESTRA · SIN VALIDEZ", AMBER_PALE, AMBER, 194)
    c.setStrokeColor(LINE)
    c.line(M, H - 71, W - M, H - 71)
    txt(c, M, H - 99, doc_type.upper(), 8.5, True, BLUE)
    txt(c, M, H - 124, title, 19, True, NAVY)
    right(c, W - M, H - 99, status, 9, True, MUTED)
    rounded(c, M, H - 140, CW, 69, PALE, LINE)
    cell(c, M + 12, H - 147, "Documento / revisión", docid, 180, 9.2)
    cell(c, M + 218, H - 147, "Proyecto", "Edificio Parque de Prueba", 265, 9.6)
    cell(c, M + 12, H - 178, "Cliente / ubicación", "Administración Edificio Ejemplo · Oficina 204", 282, 9.2)
    cell(c, M + 322, H - 178, "Fecha del hecho", date, 175, 9.2)
    return H - 221


def footer(c, docid, page=1, total=1, content_bottom=None):
    if content_bottom is not None and content_bottom < 58:
        raise ValueError(f"Contenido invade el pie de {docid}: y={content_bottom:.1f}")
    c.setStrokeColor(LINE)
    c.line(M, 51, W - M, 51)
    txt(c, M, 34, "MUESTRA · DATOS FICTICIOS · SIN VALIDEZ", 8.7, True, AMBER)
    right(c, W - M, 34, f"{docid}   ·   Página {page} de {total}", 8.8, False, MUTED)


def info_box(c, top, label, value, fill=ICE, height=55):
    rounded(c, M, top, CW, height, fill, LINE)
    txt(c, M + 12, top - 16, label.upper(), 8.2, True, BLUE)
    para(c, M + 12, top - 21, value, CW - 24, 10.2, 14)
    return top - height - 8


def two_cards(c, top, left_title, left_text, right_title, right_text, height=72):
    gap = 10
    half = (CW - gap) / 2
    for x, label, value in ((M, left_title, left_text), (M + half + gap, right_title, right_text)):
        rounded(c, x, top, half, height, HexColor("#FFFFFF"), LINE)
        txt(c, x + 11, top - 17, label.upper(), 8.1, True, BLUE)
        para(c, x + 11, top - 22, value, half - 22, 9.8, 13.2)
    return top - height - 8


def table(c, top, headers, widths, rows, font_size=9.2, min_h=31):
    x0 = M
    hh = 25
    rounded(c, x0, top, sum(widths), hh, ICE, LINE, 4)
    x = x0
    for head, width in zip(headers, widths):
        txt(c, x + 8, top - 16, head.upper(), 7.7, True, NAVY)
        x += width
    top -= hh
    for row in rows:
        prepared = [lines(v, width - 16, font_size) for v, width in zip(row, widths)]
        height = max(min_h, 12 + max(map(len, prepared)) * 12.2)
        c.setFillColor(HexColor("#FFFFFF"))
        c.setStrokeColor(LINE)
        c.rect(x0, top - height, sum(widths), height, fill=1, stroke=1)
        x = x0
        for entry, width in zip(prepared, widths):
            for i, line in enumerate(entry):
                txt(c, x + 8, top - 14 - i * 12.2, line, font_size)
            x += width
        top -= height
    return top - 8


def evidence(c, top, ident, caption, variant="initial"):
    height = 82
    rounded(c, M, top, CW, height, PALE, LINE)
    x = M + 10
    inner_top = top - 8
    rounded(c, x, inner_top, 136, 65, HexColor("#DCE7EE"), LINE, 4)
    # Esquema simple de una unidad interior y drenaje. No representa una fotografía real.
    c.setFillColor(HexColor("#FFFFFF"))
    c.setStrokeColor(BLUE)
    c.roundRect(x + 15, inner_top - 42, 85, 22, 4, fill=1, stroke=1)
    c.setStrokeColor(MUTED)
    c.line(x + 25, inner_top - 38, x + 88, inner_top - 38)
    c.setStrokeColor(BLUE)
    p = c.beginPath()
    p.moveTo(x + 100, inner_top - 31)
    p.lineTo(x + 113, inner_top - 31)
    p.lineTo(x + 113, inner_top - 57)
    p.lineTo(x + 127, inner_top - 57)
    c.drawPath(p)
    if variant == "initial":
        c.setFillColor(RED)
        c.circle(x + 113, inner_top - 64, 3, fill=1, stroke=0)
    elif variant == "finding":
        c.setFillColor(AMBER)
        c.circle(x + 112, inner_top - 51, 5, fill=1, stroke=0)
    else:
        c.setFillColor(GREEN)
        c.circle(x + 126, inner_top - 58, 4, fill=1, stroke=0)
    txt(c, M + 160, top - 19, f"{ident}  ·  ESQUEMA ILUSTRATIVO", 8.2, True, BLUE)
    para(c, M + 160, top - 24, caption, CW - 174, 9.8, 13.4)
    txt(c, M + 160, top - 67, "Sin fotografía real adjunta en esta muestra.", 8.3, False, MUTED)
    return top - height - 8


def signature(c, top, left_label, right_label):
    h = 48
    half = (CW - 10) / 2
    for x, label in ((M, left_label), (M + half + 10, right_label)):
        rounded(c, x, top, half, h, PALE, LINE)
        txt(c, x + 10, top - 17, label.upper(), 8.1, True, BLUE)
        txt(c, x + 10, top - 37, "Pendiente · sin firma en esta muestra", 8.9, False, MUTED)
    return top - h - 8


def make_service_order(c):
    doc = "POT-2026-OS-00000001 R00"
    y = header(c, "01 / Apertura", "Orden de servicio", doc, "21/09/2026 · 08:25", "Borrador de muestra")
    y = section(c, 1, "Origen y solicitud", y)
    y = two_cards(c, y, "Recepción del pedido", "21/09 · 08:15 · Correo del cliente. Referencia MSG-01.", "Registro de la OT", "21/09 · 08:25 · Operador de mesa de servicios.", 64)
    y = info_box(c, y, "Reclamo original del solicitante", "Se observa goteo debajo de la unidad interior durante el uso.", ICE, 52)
    y = evidence(c, y, "E01", "Imagen enviada por el cliente con MSG-01; no es registro de una visita técnica.", "initial")
    y = section(c, 2, "Clasificación y derivación", y)
    y = table(c, y, ["Dato", "Registro", "Procedencia"], [140, 153, CW - 293], [
        ("Activo referido", "AC-204", "Declarado por el cliente"),
        ("Prioridad inicial", "Media · provisional", "Clasificación operativa"),
        ("Responsable", "Técnica A", "Asignación de mesa"),
    ], 9.2, 30)
    y = info_box(c, y, "Siguiente paso", "Realizar relevamiento técnico. No se certifican visita, diagnóstico ni conformidad en esta orden.", GREEN_PALE, 55)
    y = signature(c, y, "Registro · mesa de servicios", "Revisión de apertura · pendiente")
    footer(c, doc, content_bottom=y)


def make_survey(c):
    doc = "POT-2026-REL-00000002 R00"
    y = header(c, "02 / Diagnóstico", "Informe de relevamiento", doc, "21/09/2026 · 11:00", "Alcance de muestra")
    y = section(c, 1, "Hallazgo y diagnóstico", y)
    y = two_cards(c, y, "Origen y modalidad", "OS folio 00000001 R00 · Visita 21/09, 09:00–09:40 · Técnica A.", "Hallazgo H01", "Obstrucción observada en tramo accesible de drenaje.", 61)
    y = evidence(c, y, "E02", "21/09 · Tramo accesible donde se observó la obstrucción.", "finding")
    y = info_box(c, y, "Diagnóstico · causa probable", "La obstrucción podría explicar el goteo. Se confirmará con una prueba de descarga después de la limpieza.", AMBER_PALE, 52)
    y = section(c, 2, "Alcance y criterios propuestos", y)
    y = table(c, y, ["Ítem", "Trabajo", "Criterio de aceptación"], [44, 192, CW - 236], [
        ("T01", "Limpiar tramo accesible", "Descarga libre, sin rebalse visible."),
        ("T02", "Reinstalar conexiones", "Sin fugas visibles en comprobación."),
        ("T03", "Verificar y entregar registro", "Sin goteo en prueba acordada; registro entregado."),
    ], 8.9, 33)
    y = two_cards(c, y, "Exclusión", "Red embutida fuera del tramo accesible.", "Plazo previsto", "22–23/09/2026. Método y duración de prueba: acuerdo del caso ficticio.", 63)
    y = info_box(c, y, "Decisión de alcance", "Aprobación simulada de POT-2026-REL-00000002 R00 por responsable autorizado. Sin firma ni autorización real.", GREEN_PALE, 49)
    footer(c, doc, content_bottom=y)


def make_progress(c):
    doc = "POT-2026-AV-00000004 R00"
    y = header(c, "03 / Ejecución", "Informe de avance", doc, "23/09/2026 · corte diario", "Avance 02 de 02")
    y = section(c, 1, "Resultado del período", y)
    rounded(c, M, y, CW, 92, ICE, LINE)
    txt(c, M + 12, y - 18, "ALCANCE APROBADO", 8, True, BLUE)
    txt(c, M + 12, y - 36, "POT-2026-REL-00000002 R00 · Hitos ponderados", 10, True, NAVY)
    txt(c, M + 12, y - 54, "23/09 · T02 y T03 · Técnica A", 9.5)
    right(c, W - M - 12, y - 29, "100%", 24, True, GREEN)
    right(c, W - M - 12, y - 47, "+60 puntos hoy", 9, True, GREEN)
    c.setFillColor(LINE)
    c.roundRect(M + 12, y - 77, CW - 24, 8, 4, fill=1, stroke=0)
    c.setFillColor(GREEN)
    c.roundRect(M + 12, y - 77, CW - 24, 8, 4, fill=1, stroke=0)
    y -= 103
    y = section(c, 2, "Previsto frente a realizado", y)
    y = table(c, y, ["Ítem", "Peso", "Al 22/09", "En este período", "Acumulado"], [44, 55, 103, 152, CW - 354], [
        ("T01", "40%", "Completado", "Sin actividad", "Completado"),
        ("T02", "30%", "Pendiente", "Reinstalado", "Completado"),
        ("T03", "30%", "Pendiente", "Prueba y registro", "Completado"),
    ], 8.7, 32)
    y = evidence(c, y, "E04", "23/09 · Prueba final y evidencia del trabajo ejecutado.", "final")
    y = section(c, 3, "Desvíos y siguiente decisión", y)
    y = two_cards(c, y, "Desvíos del alcance", "Sin cambios aprobados respecto de POT-2026-REL-00000002 R00 en este corte.", "Siguiente paso", "Emitir cierre técnico tras validar resultados; la recepción del cliente sigue pendiente.", 75)
    y = info_box(c, y, "Lectura del indicador", "100% de hitos técnicos ejecutados. El expediente no está aceptado por el cliente ni formalizado por este porcentaje.", AMBER_PALE, 49)
    footer(c, doc, content_bottom=y)


def make_close(c):
    doc = "POT-2026-CIE-00000005 R00"
    y = header(c, "04 / Verificación", "Informe de cierre técnico", doc, "23/09/2026 · 16:00", "Recepción pendiente")
    y = section(c, 1, "Base y ejecución final", y)
    y = info_box(c, y, "Alcance de referencia", "POT-2026-REL-00000002 R00 · T01–T03. Ejecución 22–23/09. Avances POT-2026-AV-00000003 R00 y POT-2026-AV-00000004 R00.", ICE, 50)
    y = section(c, 2, "Comprobación de criterios", y)
    y = table(c, y, ["Ítem", "Verificación registrada", "Resultado", "Evidencia"], [45, 230, 128, CW - 403], [
        ("T01", "Descarga libre; sin rebalse visible.", "Conforme", "E04"),
        ("T02", "Sin fugas visibles en conexiones.", "Conforme", "E04"),
        ("T03", "Sin goteo en prueba acordada; registro entregado.", "Conforme", "E04"),
    ], 8.8, 33)
    y = evidence(c, y, "E04", "23/09 · Resultado final asociado a T01–T03. Original en expediente.", "final")
    y = section(c, 3, "Pendientes y decisión técnica", y)
    y = two_cards(c, y, "Pendiente P01", "Copia adicional del registro para archivo. Supervisor B · 25/09.", "Verificador", "Supervisor B · 23/09/2026. Pruebas y resultados de esta revisión.", 70)
    y = info_box(c, y, "Conclusión técnica", "Conforme según los criterios registrados. P01 es administrativo y queda abierto. La aceptación del cliente se registra aparte.", GREEN_PALE, 55)
    y = signature(c, y, "Autorización técnica · Supervisor B", "Recepción del cliente · ver acta")
    footer(c, doc, content_bottom=y)


def make_act(c):
    doc = "POT-2026-ACT-00000006 R00"
    y = header(c, "05 / Recepción", "Acta de conformidad", doc, "24/09/2026 · 10:00", "Pendiente de firma")
    y = section(c, 1, "Objeto de recepción", y)
    y = info_box(c, y, "Servicio entregado", "Intervención del drenaje y verificación de AC-204. Cierre técnico POT-2026-CIE-00000005 R00 y registro principal entregados.", ICE, 59)
    y = two_cards(c, y, "Receptor previsto", "Representante C · Administración Edificio Ejemplo. Autoridad a verificar.", "Emisor", "Servicios Técnicos Ejemplo S.A. · Supervisor B.", 70)
    y = section(c, 2, "Decisión y reservas", y)
    rounded(c, M, y, CW, 76, AMBER_PALE, LINE)
    txt(c, M + 12, y - 18, "DECISIÓN PROPUESTA DE LA MUESTRA", 8.2, True, AMBER)
    txt(c, M + 12, y - 40, "Aceptado con reservas", 15, True, NAVY)
    para(c, M + 12, y - 48, "Reserva P01: copia adicional del registro para archivo. Responsable: Supervisor B. Plazo: 25/09/2026.", CW - 24, 9.6, 13.4)
    y -= 84
    y = section(c, 3, "Condiciones y formalización", y)
    y = info_box(c, y, "Garantía contractual", "Cobertura y plazo pendientes de definir para esta muestra. No se presume una garantía nueva a partir de la OT.", RED_PALE, 54)
    y = two_cards(c, y, "Estado del instrumento", "Borrador pendiente de condiciones y firma. La decisión aún no tiene efecto.", "Contenido a consentir", "POT-2026-ACT-00000006 R00, POT-2026-CIE-00000005 R00, reserva P01 y condiciones acordadas.", 72)
    y = signature(c, y, "Representante C · cliente", "Supervisor B · emisor")
    footer(c, doc, content_bottom=y)


DOCS = [
    ("01_orden_servicio", make_service_order),
    ("02_relevamiento", make_survey),
    ("03_avance", make_progress),
    ("04_cierre", make_close),
    ("05_acta", make_act),
]


def main():
    for stem, renderer in DOCS:
        path = OUT / f"{stem}.pdf"
        c = canvas.Canvas(str(path), pagesize=A4, pageCompression=1)
        c.setTitle(f"Mockup Plan-OTs · {stem}")
        renderer(c)
        c.showPage()
        c.save()
    merged = PdfWriter()
    for stem, _ in DOCS:
        for page in PdfReader(str(OUT / f"{stem}.pdf")).pages:
            merged.add_page(page)
    with (OUT / "00_expediente_completo.pdf").open("wb") as stream:
        merged.write(stream)
    print(f"Generados {len(DOCS)} mockups y expediente conjunto en {OUT}")


if __name__ == "__main__":
    main()
