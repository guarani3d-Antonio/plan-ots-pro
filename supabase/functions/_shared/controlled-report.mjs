//#region src/services/reportAutofillService.ts
const textoFuente = (value) => typeof value === "string" ? value : "";
const objetoFuente = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
function restaurarCampos(inicial, guardado) {
	const saved = objetoFuente(guardado);
	const result = { ...inicial };
	for (const key of Object.keys(inicial)) if (typeof saved[String(key)] === "string") result[key] = saved[String(key)];
	return result;
}
function prepararAutocompletado(orden, proyectoNombre, cliente = null, fuentes = {}) {
	const c = cliente?.cliente_id === orden.cliente_id && cliente?.ubicacion_id === orden.cliente_ubicacion_id ? cliente : null;
	const campo = (key) => textoFuente(orden.campos?.[key]);
	const v = objetoFuente(fuentes.visita?.visita);
	const r = objetoFuente(fuentes.relevamiento?.relevamiento);
	const a = objetoFuente(fuentes.avance?.avance);
	const cierreAnterior = objetoFuente(fuentes.cierre?.cierre);
	const identificacion = {
		obra: textoFuente(orden.obra) || textoFuente(c?.nombre_obra) || proyectoNombre,
		unidad_amenities: textoFuente(orden.unidad_amenities) || textoFuente(c?.unidad) || textoFuente(c?.sector),
		ubicacion: textoFuente(orden.ubicacion),
		responsable: textoFuente(orden.responsable),
		rubro: textoFuente(orden.rubro),
		fecha_ingreso: textoFuente(orden.fecha_ingreso),
		descripcion: textoFuente(orden.descripcion),
		cliente: textoFuente(c?.nombre) || campo("solicitante"),
		identificacion: textoFuente(c?.identificacion),
		contacto: textoFuente(c?.contacto) || campo("contacto_solicitante"),
		telefono: textoFuente(c?.telefono),
		correo: textoFuente(c?.correo),
		domicilio: textoFuente(c?.domicilio),
		direccion_obra: textoFuente(c?.direccion_obra),
		piso: textoFuente(c?.piso)
	};
	const origen = {
		canal: campo("canal_solicitud"),
		fechaRecepcion: campo("fecha_solicitud"),
		solicitante: campo("solicitante") || identificacion.cliente,
		contacto: campo("contacto_solicitante") || identificacion.telefono || identificacion.correo || identificacion.contacto,
		referencia: campo("referencia_solicitud"),
		urgencia: campo("urgencia_solicitada"),
		proximoPaso: campo("proximo_paso")
	};
	const visita = {
		propietario: origen.solicitante,
		contacto: origen.contacto,
		edificio: identificacion.obra,
		unidad: identificacion.unidad_amenities || identificacion.ubicacion,
		responsableVisita: identificacion.responsable,
		descripcion: identificacion.descripcion,
		observacionesTecnicas: textoFuente(orden.comentarios),
		compromisos: origen.proximoPaso
	};
	const relevamiento = {
		tecnico: textoFuente(v.responsableVisita) || identificacion.responsable,
		fechaIntervencion: textoFuente(v.fechaVisita),
		participantes: textoFuente(v.participantes),
		antecedentes: identificacion.descripcion,
		condiciones: textoFuente(v.restricciones),
		hallazgos: textoFuente(v.observacionesTecnicas),
		planoReferencia: identificacion.ubicacion
	};
	const avance = { porcentaje: typeof orden.porcentaje_avance === "number" ? String(orden.porcentaje_avance) : "" };
	const cierre = {
		inicioReal: textoFuente(orden.fecha_inicio_trabajos),
		finReal: textoFuente(orden.fecha_fin_trabajos),
		planoReferencia: textoFuente(r.planoReferencia) || identificacion.ubicacion,
		alcanceReferencia: textoFuente(a.alcanceReferencia)
	};
	const acta = {
		receptor: identificacion.cliente,
		objetoEntrega: textoFuente(cierreAnterior.ejecucionPorItem),
		anexosEntregados: textoFuente(cierreAnterior.entregables)
	};
	const encuesta = { respondente: identificacion.cliente };
	const alcance = Array.isArray(fuentes.relevamiento?.itemsAlcance) ? fuentes.relevamiento.itemsAlcance : [];
	return {
		identificacion,
		origen,
		visita,
		relevamiento,
		avance,
		cierre,
		acta,
		encuesta,
		itemsAvance: alcance.map((item) => {
			const i = objetoFuente(item);
			return {
				id: textoFuente(i.id),
				previsto: textoFuente(i.trabajo),
				realizado: "",
				saldo: ""
			};
		}),
		itemsCierre: alcance.map((item) => {
			const i = objetoFuente(item);
			return {
				id: textoFuente(i.id),
				trabajo: textoFuente(i.trabajo),
				criterio: textoFuente(i.criterio),
				resultado: "",
				verificadorFecha: ""
			};
		}),
		observaciones: textoFuente(orden.comentarios)
	};
}
function ordenParaInforme(orden, identificacion) {
	return {
		...orden,
		obra: identificacion.obra,
		unidad_amenities: identificacion.unidad_amenities,
		ubicacion: identificacion.ubicacion,
		responsable: identificacion.responsable,
		rubro: identificacion.rubro,
		fecha_ingreso: identificacion.fecha_ingreso,
		descripcion: identificacion.descripcion,
		campos: {
			...orden.campos,
			identificacion_informe: { ...identificacion }
		}
	};
}
//#endregion
//#region src/services/reportPrintCss.ts
const REPORT_PRINT_CSS = `
:root{color-scheme:light}
*,*::before,*::after{box-sizing:border-box}
html{font-family:Arial,Helvetica,sans-serif;color:#1a2433}
body{margin:0;font-size:12px;line-height:1.45;background:#fff}
h1,h2,h3,h4,p,figure{margin:0}
p{margin-top:5px;overflow-wrap:anywhere}
h1{font-size:23px;line-height:1.18;font-weight:700;letter-spacing:-.02em}
h3{font-size:13px;line-height:1.35;font-weight:700}
strong{font-weight:700;color:#243954}
.a4-page{color:#1a2433}
.flex{display:flex}.inline-flex{display:inline-flex}.flex-col{flex-direction:column}
.items-center{align-items:center}.items-start{align-items:flex-start}.items-end{align-items:flex-end}
.justify-between{justify-content:space-between}
.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.col-span-3{grid-column:span 3}
.gap-0\\.5{gap:2px}.gap-1{gap:4px}.gap-1\\.5{gap:6px}.gap-2\\.5{gap:10px}
.gap-4{gap:16px}.gap-6{gap:24px}.gap-12{gap:48px}
.w-full{width:100%}.h-1\\.5{height:6px}
.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-4{margin-bottom:16px}
.mb-5{margin-bottom:20px}.mb-6{margin-bottom:24px}.mb-8{margin-bottom:32px}
.mb-10{margin-bottom:40px}.mb-12{margin-bottom:48px}
.mt-3{margin-top:12px}.mt-4{margin-top:16px}.mt-6{margin-top:24px}
.p-4{padding:16px}.p-5{padding:20px}.p-6{padding:24px}
.px-4{padding-left:16px;padding-right:16px}.px-6{padding-left:24px;padding-right:24px}
.py-1\\.5{padding-top:6px;padding-bottom:6px}
.pb-2{padding-bottom:8px}.pb-6{padding-bottom:24px}.pl-5{padding-left:20px}
.pt-14{padding-top:56px}
.border{border:1px solid #d5dce5}.border-b{border-bottom:1px solid #d5dce5}
.border-l-\\[6px\\]{border-left:6px solid #244b80}
.border-dashed{border-style:dashed}.border-outline-variant{border-color:#d5dce5}
.rounded-lg{border-radius:7px}.rounded-xl{border-radius:10px}.rounded-full{border-radius:999px}
.bg-surface-container-lowest{background:#fff}.bg-surface-container-low{background:#f4f7fa}
.bg-\\[\\#CC7A00\\]{background:#cc7a00}
.text-primary{color:#173d6c}.text-on-surface{color:#1a2433}
.text-on-surface-variant{color:#5c6776}.text-outline{color:#6a7482}
.text-\\[\\#CC7A00\\]{color:#a45e00}
.text-body-md{font-size:12px;line-height:1.5}.text-body-sm{font-size:11px}
.text-headline-xl{font-size:23px;line-height:1.18}
.text-xs{font-size:10px}.text-\\[10px\\]{font-size:10px}.text-\\[9px\\]{font-size:9px}
.font-bold,.font-label-bold,.font-section-header{font-weight:700}
.font-headline-xl{font-weight:700}.font-mono-technical{font-family:Consolas,monospace}
.text-right{text-align:right}.text-center{text-align:center}.text-justify{text-align:justify}
.uppercase{text-transform:uppercase}.italic{font-style:italic}
.tracking-widest{letter-spacing:.08em}.tracking-wider{letter-spacing:.05em}
.leading-relaxed{line-height:1.55}.shadow-sm{box-shadow:0 1px 4px #14283c12}
.max-w-3xl{max-width:48rem}
.a4-page>header{align-items:flex-start;gap:20px}
.a4-page>header>div:last-child{max-width:55%}
.a4-page>header+div{margin-bottom:24px}
.a4-page h1{border-left:5px solid #244b80;padding-left:16px;margin-bottom:9px}
.a4-page section{min-width:0;break-inside:avoid;page-break-inside:avoid}
.a4-page section>strong{display:block;font-size:11px;line-height:1.3;text-transform:uppercase;letter-spacing:.035em}
.a4-page section>p{font-size:12px;line-height:1.5}
.a4-page section.grid{gap:10px 14px}
.a4-page section.grid>div{min-width:0}
.a4-page section.grid>div>strong{display:block;font-size:11px;line-height:1.3;text-transform:uppercase;letter-spacing:.035em}
.a4-page section.grid>div>p{font-size:12px}
.evidencias-secuenciales{margin-top:14px}
.evidencia-bloque{width:100%;max-width:100%;break-inside:avoid;page-break-inside:avoid}
.acta-page>header{margin-bottom:22px;padding-bottom:15px}
.acta-page>header+div{margin-bottom:16px}
.acta-page .mb-6{margin-bottom:13px}.acta-page .mb-4{margin-bottom:10px}
.acta-page .p-4{padding:10px 12px}.acta-page .p-6{padding:13px 15px}
.acta-page section.grid{gap:8px 12px}
.os-page>header,.relevamiento-page>header{margin-bottom:22px;padding-bottom:13px}
.os-page>header+div,.relevamiento-page>header+div{margin-bottom:18px}
.os-page .mb-8,.relevamiento-page .mb-8{margin-bottom:17px}
.os-page .mb-6,.relevamiento-page .mb-6{margin-bottom:14px}
.os-page .mb-4,.relevamiento-page .mb-4{margin-bottom:10px}
.os-page .mt-4,.relevamiento-page .mt-4{margin-top:10px}
.os-page .mt-6,.relevamiento-page .mt-6{margin-top:12px}
.os-page .p-4,.relevamiento-page .p-4{padding:11px 13px}
.os-page .p-6,.relevamiento-page .p-6{padding:15px 17px}
.os-page section.grid,.relevamiento-page section.grid{gap:8px 12px}
.os-page section[style*="border-left"],.relevamiento-page section[style*="border-left"]{padding:12px 15px!important}
.relevamiento-page>header{margin-bottom:18px;padding-bottom:10px}
.relevamiento-page>header+div{margin-bottom:14px}
.relevamiento-page .mb-4{margin-bottom:7px}
.relevamiento-page .p-4{padding:9px 12px}
.relevamiento-page .p-6{padding:12px 15px}
.relevamiento-page section[style*="border-left"]{padding:10px 13px!important}
.page-footer{padding-top:10px;border-top:3px solid #cc7a00;color:#566476;font-size:10px}
.footer-pagina{color:#566476!important;opacity:1!important}

/* Diseno compartido del expediente: jerarquia y bloques de los cinco mockups. */
.a4-page{font-family:Arial,Helvetica,sans-serif;color:#162a45}
.a4-page>header{padding:0 0 11px;margin-bottom:16px;border-bottom:1px solid #d7e1ec}
.a4-page>header>div:first-child strong{display:inline-flex;align-items:center;gap:9px;color:#173455!important;font-size:12px!important}
.a4-page>header>div:first-child strong::before{content:"P";display:inline-grid;place-items:center;width:25px;height:25px;background:#193757;color:white;border-radius:5px;font-size:14px}
.a4-page>header>div:last-child{font-size:9px;line-height:1.35}
.a4-page>header+div{margin-bottom:14px}
.a4-page .report-kicker{display:flex;justify-content:space-between;gap:8px;margin:0 0 7px;color:#244b80;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase}
.a4-page .report-kicker span{color:#6a7482;font-weight:500;text-transform:none;letter-spacing:0}
.a4-page h1{font-size:20px;color:#173455;border-left:4px solid #244b80;padding-left:11px;margin-bottom:5px}
.a4-page .report-section-title{display:flex;align-items:center;gap:8px;border-bottom:1px solid #c8d9ec;margin:13px 0 8px;padding-bottom:4px;color:#173455;font-size:11px;font-weight:700;line-height:1.2;text-transform:uppercase;letter-spacing:.025em;break-after:avoid;page-break-after:avoid}
.a4-page .report-section-title span{display:grid;place-items:center;width:21px;height:21px;flex:none;border-radius:50%;background:#244b80;color:#fff;font-size:10px}
.a4-page>header+div>p{font-size:10px;color:#506178}
.a4-page section{margin-bottom:10px!important}
.a4-page section.grid{background:#f4f8fd;border:1px solid #d6e3f0;border-radius:7px;padding:12px 14px!important;gap:9px 13px!important}
.a4-page section.grid>div{background:white;border:1px solid #dbe5ef;border-radius:5px;padding:8px 10px!important}
.a4-page section.grid>div:first-child.col-span-3{border:0;border-bottom:1px solid #d6e3f0;background:transparent;border-radius:0;padding:0 0 5px!important}
.a4-page section:not(.grid)[class*="border"]{border-color:#d6e3f0;background:#f7faff;border-radius:7px;padding:10px 13px!important}
.a4-page section[style*="border-left"]{background:#fff7e9!important;border-left:4px solid #c98517!important;padding:10px 13px!important}
.a4-page section[style*="border-left"] p{white-space:pre-line}
.a4-page section>strong,.a4-page section h3{color:#244b80;font-size:9px!important;letter-spacing:.045em}
.a4-page .os-evidence{background:#eef5fc;border:1px solid #d6e3f0;border-radius:7px;padding:10px 12px}
.a4-page .os-evidence>strong{display:block;color:#244b80;font-size:9px;text-transform:uppercase;margin-bottom:6px}
.a4-page .os-evidence-body{display:flex;align-items:flex-start;gap:10px}
.a4-page .os-evidence-body img{display:block;max-width:35%;max-height:42mm;object-fit:contain;border-radius:4px}
.a4-page .os-evidence-body p{flex:1;margin:0;white-space:pre-line}
.a4-page .os-evidence-body small{display:block;color:#5d6d80;margin-top:7px}
.a4-page .report-data-table{width:100%;border-collapse:collapse;margin:6px 0 12px;font-size:10px;table-layout:fixed}
.a4-page .report-data-table th{background:#244b80;color:white;text-align:left;font-size:9px;letter-spacing:.03em;text-transform:uppercase}
.a4-page .report-data-table th,.a4-page .report-data-table td{border:1px solid #c8d9ec;padding:7px 9px;vertical-align:top;overflow-wrap:anywhere}
.a4-page .report-data-table th:first-child,.a4-page .report-data-table td:first-child{width:52px;font-weight:700}
.a4-page .report-data-table tbody tr:nth-child(even){background:#f4f8fd}
.a4-page .report-data-table-wide th,.a4-page .report-data-table-wide td{font-size:9px;padding:6px 7px}
.a4-page .report-data-table thead{display:table-header-group}
.a4-page .report-data-table tr{break-inside:avoid;page-break-inside:avoid}
.a4-page .evidencia-bloque{background:#eef5fc;border:1px solid #d6e3f0;border-radius:7px;padding:8px!important}
.a4-page .evidencia-bloque img{max-height:86mm!important}
.a4-page p{font-size:10px;line-height:1.35}
.a4-page .grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}
.a4-page .grid-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}
.a4-page.os-page section.os-meta{grid-template-columns:repeat(4,minmax(0,1fr))}
.a4-page.os-page section.os-meta>div{padding:6px 7px!important}
.a4-page.os-page section.os-meta>div>strong{font-size:8px;line-height:1.1}
.a4-page.os-page section.os-meta>div>p{font-size:9px;line-height:1.2}
.a4-page.acta-page>header+div{margin-bottom:10px}
.a4-page.acta-page .report-section-title{margin:9px 0 5px}
.a4-page.acta-page section{margin-bottom:6px!important}
.a4-page.acta-page section.grid{padding:8px 10px!important;gap:6px 8px!important}
.a4-page.acta-page section.grid>div{padding:6px 8px!important}
.page-break{break-after:page;page-break-after:always}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
@media screen{
  .a4-page{margin:0 auto 24px;min-height:297mm;width:210mm;padding:18mm 18mm 16mm;background:#fff}
  .page-footer{width:210mm;margin:0 auto 24px;padding:10px 18mm 18mm;background:#fff}
}
@media print{
  @page{
    size:A4 portrait;margin:13mm 15mm 15mm;
    @bottom-left{content:"Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN";font:8px Arial,sans-serif;color:#566476}
    @bottom-right{content:counter(page) " / " counter(pages);font:8px Arial,sans-serif;color:#566476}
  }
  body{margin:0;padding:0;background:#fff}
  .a4-page{width:auto;min-height:0;margin:0;padding:0;display:block;box-shadow:none}
  .page-footer{display:none}
  header,.no-break,.evidencia-bloque{break-inside:avoid;page-break-inside:avoid}
  h1,h2,h3,h4{break-after:avoid;page-break-after:avoid}
  img{max-width:100%;break-inside:avoid;page-break-inside:avoid}
}
`;
//#endregion
//#region src/services/reportTemplates.ts
function escapeHtml(s) {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatearFechaCorta(fecha) {
	if (!fecha) return "--/--/----";
	const d = /* @__PURE__ */ new Date(fecha + "T00:00:00");
	return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function generarGridFotos(fotos) {
	if (fotos.length === 0) return "<p class=\"no-break\" style=\"padding:12px 16px; border:1px solid #ddd; border-radius:8px; color:#666; font-size:12px;\">Sin fotografías registradas en esta etapa.</p>";
	return `<div class="evidencias-secuenciales">${fotos.map((f, idx) => {
		const desc = (f.descripcion ?? "").trim();
		const observacion = (f.descripcion_observacion ?? "").trim();
		const obs = observacion === desc ? "" : observacion;
		const descripcionHtml = desc ? escapeHtml(desc) : "<span style=\"color:#bbb\">Sin descripción registrada</span>";
		return `<figure class="evidencia-bloque" style="break-inside: avoid; page-break-inside: avoid; margin: 0 0 18px;">
        <div style="border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
          <img src="${escapeHtml(f.file_url)}" alt="Evidencia fotográfica ${idx + 1}" loading="eager" onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex')" style="max-width:100%; width:auto; height:auto; max-height:105mm; object-fit:contain; margin:0 auto; border-radius:4px; display:block;" />
          <div style="display:none; width:100%; min-height:75mm; background:#f0f0f0; border-radius:4px; align-items:center; justify-content:center; color:#999; font-size:11px;">
            Imagen no disponible
          </div>
        </div>
        <figcaption style="margin-top: 6px; padding: 6px 10px; background: #f8f8f8; border-left: 3px solid #CC7A00; border-radius: 0 4px 4px 0; min-height: 28px;">
          <span style="font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px;">Descripción técnica</span>
          <span style="font-size: 11px; color: #333; font-style: italic; line-height: 1.4;">${descripcionHtml}</span>
          ${f.id ? `<span style="display:block;font-size:9px;color:#657183;margin-top:3px;overflow-wrap:anywhere">Ref. evidencia: ${escapeHtml(f.id)}</span>` : ""}
        </figcaption>
        ${obs ? `<div style="margin-top:4px;padding:5px 10px;background:#fff8f0;border-left:3px solid #CC7A00;border-radius:0 4px 4px 0"><span style="font-size:10px;font-weight:600;color:#CC7A00;text-transform:uppercase;display:block;margin-bottom:2px">Observación del Editor</span><span style="font-size:11px;color:#333;font-style:italic">${escapeHtml(obs)}</span></div>` : ""}
      </figure>`;
	}).join("\n")}</div>`;
}
function _estadoBadgeCfg(estado) {
	switch (estado) {
		case "Cerrada": return {
			texto: "CERRADO",
			bg: "#e7f3eb",
			text: "#1e4620",
			border: "#1e4620",
			icon: "check_circle"
		};
		case "En proceso": return {
			texto: "EN PROCESO",
			bg: "#dbeafe",
			text: "#1e3a8a",
			border: "#1e3a8a",
			icon: "pending_actions"
		};
		case "Pendiente": return {
			texto: "PENDIENTE",
			bg: "#fef3c7",
			text: "#92400e",
			border: "#92400e",
			icon: "schedule"
		};
		case "No aplica": return {
			texto: "NO APLICA",
			bg: "#f1f5f9",
			text: "#475569",
			border: "#475569",
			icon: "block"
		};
		default: return {
			texto: escapeHtml(estado.toUpperCase()),
			bg: "#f1f5f9",
			text: "#475569",
			border: "#475569",
			icon: "info"
		};
	}
}
const _HEAD_INFORME = `<!DOCTYPE html>
<html class="light" lang="es">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<title>__TITLE__</title>

<style>
${REPORT_PRINT_CSS}
</style>
</head>`;
const _FOOTER_INFORME = `<footer class="page-footer">
  <div class="w-full h-1.5 bg-[#CC7A00] mb-4"></div>
  <div class="flex justify-between items-start mb-3">
    <div class="flex flex-col gap-0.5">
      <span class="font-bold text-[10px] text-primary">Plan-OTs · Documento de trabajo · __YEAR__</span>
      <span class="text-[9px] text-[#CC7A00] uppercase tracking-widest font-bold">BORRADOR · SIN EMISIÓN NI APROBACIÓN</span>
    </div>
  </div>
  <div class="flex justify-between items-center">
    <span class="text-[10px] text-on-surface-variant/80 italic">Vista de trabajo. No constituye constancia de recepción ni conformidad.</span>
    <span class="footer-pagina" style="font-size:9px; color:#fff; opacity:0.7;"></span>
  </div>
</footer>`;
const _LOGOS_HTML_INFORME = `<div class="flex items-center gap-4"><strong style="font-size:16px;color:#003366">Plan-OTs</strong></div>`;
function _paginaHeader(orden, titulo, subtitulo, codigoDocumento, contexto) {
	const badge = _estadoBadgeCfg(orden.estado);
	const otLabel = orden.ot ?? "Sin código";
	return `<header class="flex justify-between items-start mb-10 border-b border-outline-variant pb-6">
    <div>${_LOGOS_HTML_INFORME}${contexto?.emisor ? `<p style="font-size:11px;max-width:280px;margin-top:8px">Emisor: ${escapeHtml(contexto.emisor)}</p>` : ""}</div>
    <div class="text-right">
      <div class="px-4 py-1.5 rounded-full font-label-bold text-xs flex items-center gap-1.5 inline-flex mb-2" style="background:${badge.bg}; color:${badge.text}; border:1px solid ${badge.border}33;">
        <span aria-hidden="true" style="width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block"></span>
        ESTADO: ${badge.texto}
      </div>
      <div class="text-body-sm font-mono-technical text-on-surface-variant">ID DE ORDEN: ${escapeHtml(otLabel)}</div>
      <div class="text-body-sm font-mono-technical text-on-surface-variant">DOCUMENTO: ${escapeHtml(codigoDocumento || "Borrador sin reservar")}</div>
      <div class="text-body-sm">${contexto ? `Revisión documental: R${String(contexto.revision).padStart(2, "0")}` : "Revisión documental: sin emitir"}</div>
    </div>
  </header>
  <div class="report-title mb-8">
    <div class="report-kicker">${escapeHtml({
		"ORDEN DE SERVICIO": "01 / APERTURA",
		"FICHA DE VISITA TÉCNICA": "VIS / VISITA",
		"INFORME DE RELEVAMIENTO": "02 / DIAGNÓSTICO",
		"INFORME DE AVANCE": "03 / EJECUCIÓN",
		"INFORME DE CIERRE TÉCNICO": "04 / VERIFICACIÓN",
		"ACTA DE CONFORMIDAD": "05 / RECEPCIÓN",
		"ENCUESTA DE SATISFACCIÓN": "SAT / EXPERIENCIA"
	}[titulo] ?? "EXPEDIENTE TÉCNICO")} <span>${contexto ? "Estado de emisión verificable en Plan-OTs" : "Documento de trabajo · sin emitir"}</span></div>
    <h1 class="font-headline-xl text-headline-xl text-primary border-l-[6px] border-primary pl-5 mb-3">${escapeHtml(titulo)}${contexto ? "" : " · BORRADOR"}</h1>
    <p class="text-on-surface-variant text-body-md max-w-3xl leading-relaxed">${escapeHtml(subtitulo)}</p>
  </div>`;
}
function _seccionInforme(numero, titulo) {
	return `<h2 class="report-section-title"><span>${numero}</span>${escapeHtml(titulo)}</h2>`;
}
function _envolverInforme(titulo, contenido, contexto) {
	let head = _HEAD_INFORME.replace("__TITLE__", escapeHtml(titulo)).replace("Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN", contexto ? "Plan-OTs · ESTADO VERIFICABLE EN LA APLICACIÓN" : "Plan-OTs · BORRADOR · SIN EMISIÓN NI APROBACIÓN");
	if (contexto) head = head.replace("</head>", "<style>@media print{@page{@bottom-left{content:none}@bottom-right{content:none}}}</style></head>");
	const pie = contexto ? _FOOTER_INFORME.replace("Documento de trabajo", "Expediente documental").replace("BORRADOR · SIN EMISIÓN NI APROBACIÓN", `${escapeHtml(contexto.codigo)} · R${String(contexto.revision).padStart(2, "0")}`).replace("Vista de trabajo. No constituye constancia de recepción ni conformidad.", "La emisión y la recepción se verifican por separado en el registro digital.").replace("__YEAR__", String(contexto.anio)) : _FOOTER_INFORME.replace("__YEAR__", String((/* @__PURE__ */ new Date()).getFullYear()));
	return `${head}
<body class="bg-surface font-body-md text-on-surface min-h-screen">
${contenido}
${pie}
</body></html>`;
}
function _bloqueDatosCliente(orden) {
	const snapshot = orden.campos?.identificacion_informe;
	const datos = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
	const extras = [
		["ubicacion", "Ubicación referencial"],
		["rubro", "Rubro"],
		["cliente", "Cliente"],
		["identificacion", "RUC o documento"],
		["contacto", "Contacto"],
		["telefono", "Teléfono"],
		["correo", "Correo"],
		["domicilio", "Domicilio del cliente"],
		["direccion_obra", "Dirección de la obra"],
		["piso", "Piso"]
	].filter(([clave]) => typeof datos[clave] === "string" && datos[clave] !== "").map(([clave, etiqueta]) => `<div class="flex flex-col gap-1"><span class="text-[10px] font-bold text-outline uppercase">${etiqueta}</span><span style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(datos[clave])}</span></div>`).join("");
	return `<section class="grid grid-cols-3 gap-6 bg-surface-container-lowest p-6 rounded-xl border border-outline-variant mb-6 shadow-sm no-break">
    <div class="col-span-3 border-b border-outline-variant/30 pb-2 mb-2">
      <h3 class="font-section-header text-[10px] text-primary uppercase tracking-widest">Identificación de la OT</h3>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Obra</span>
      <span class="text-body-md text-on-surface">${escapeHtml(orden.obra || "No especificado")}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Unidad o Sector</span>
      <span class="text-body-md text-on-surface">${escapeHtml(orden.unidad_amenities || "No especificado")}</span>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-[10px] font-bold text-outline uppercase tracking-wider">Responsable asignado</span>
      <span class="text-body-md text-on-surface">${escapeHtml(orden.responsable || "No asignado")}</span>
    </div>
    ${extras}
  </section>`;
}
function _bloqueNaranjaIzquierdo(titulo, contenido, vacioPlaceholder, id = "bloque-texto-naranja") {
	const tieneContenido = contenido.trim().length > 0;
	const textoFinal = tieneContenido ? contenido : vacioPlaceholder;
	return `<section class="mb-8 no-break" style="border-left: 4px solid #CC7A00; background: #fffbf5; padding: 16px 20px; border-radius: 0 8px 8px 0;">
    <h3 class="font-section-header text-xs text-primary uppercase tracking-widest mb-3">${escapeHtml(titulo)}</h3>
    <p ${id ? `id="${escapeHtml(id)}"` : ""} class="text-body-md leading-relaxed text-justify" style="color: ${tieneContenido ? "#1a1c1f" : "#888"}; ${tieneContenido ? "" : "font-style: italic;"}">${escapeHtml(textoFinal)}</p>
  </section>`;
}
//#endregion
//#region src/services/reportService.ts
function generarEncuestaSatisfaccion(orden, datos, codigoDocumento, contexto) {
	const campo = (clave) => `<p id="enc-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || "Sin respuesta")}</p>`;
	const pregunta = (numero, titulo, escala, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4 no-break"><strong>${numero}. ${escapeHtml(titulo)}</strong><small style="display:block;color:#64748B;margin-top:4px">${escapeHtml(escala)}</small>${campo(clave)}</section>`;
	const contenido = `<div class="a4-page">
${_paginaHeader(orden, "ENCUESTA DE SATISFACCIÓN", "Experiencia declarada sobre la atención de Facility Services; no reemplaza el acta de conformidad.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Procedencia de las respuestas")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de respuesta declarada</strong>${campo("fechaRespuesta")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Persona consultada (verificar al responder)</strong>${campo("respondente")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Relación con la OT</strong>${campo("relacionConOT")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Modalidad de captura</strong>${campo("modalidad")}</div>
</section>
<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>Referencia al formulario o comunicación de origen</strong>${campo("referenciaFuente")}</section>
${_seccionInforme(2, "Evaluación de la atención")}
${pregunta(1, "Satisfacción general con el servicio", "Muy insatisfecho · Insatisfecho · Neutral · Satisfecho · Muy satisfecho", "satisfaccionGeneral")}
${pregunta(2, "¿Se resolvió completamente el problema o necesidad?", "Sí · No · Parcialmente", "resolucion")}
${pregunta(3, "Calidad del trabajo realizado", "Escala de 1 a 10", "calidadTrabajo")}
${pregunta(4, "¿Se completó dentro del plazo prometido?", "Sí · No · Parcialmente", "plazoPrometido")}
${pregunta(5, "Claridad y eficiencia de la comunicación", "Muy deficiente · Deficiente · Neutral · Eficiente · Muy eficiente", "comunicacion")}
${pregunta(6, "Profesionalismo y respeto del personal", "Sí · No · Parcialmente", "profesionalismo")}
${pregunta(7, "Rapidez y eficacia percibidas", "Muy insatisfecho · Insatisfecho · Neutral · Satisfecho · Muy satisfecho", "rapidez")}
${pregunta(8, "¿El resultado final cumplió sus expectativas?", "Sí · No · Parcialmente", "expectativas")}
${pregunta(9, "Probabilidad de recomendar el servicio", "Nada probable · Poco probable · Neutral · Probable · Muy probable", "recomendacion")}
${pregunta(10, "Sugerencias o comentarios adicionales", "Respuesta libre", "sugerencias")}
<p class="text-xs text-on-surface-variant">${contexto ? "Respuestas registradas. Este documento no acredita por sí solo autoría verificada del cliente, firma, conformidad con el trabajo ni decisión sobre el acta." : "Borrador de respuestas registradas. No acredita autoría verificada del cliente, firma, conformidad con el trabajo ni decisión sobre el acta."}</p>
</div>`;
	return _envolverInforme(`Encuesta de satisfacción${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarFichaVisita(orden, datos, fotosVisita = [], codigoDocumento, contexto) {
	const campo = (clave) => `<p id="vis-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || "No registrado")}</p>`;
	const bloque = (titulo, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
	const contenido = `<div class="a4-page">
${_paginaHeader(orden, "FICHA DE VISITA TÉCNICA", contexto ? "Registro de la visita técnica documentada." : "Registro de visita en preparación. Debe completarse con lo observado cuando la visita haya ocurrido.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Visita y participantes")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de visita</strong>${campo("fechaVisita")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Horario: inicio</strong>${campo("horaInicio")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Horario: fin</strong>${campo("horaFin")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Prioridad registrada en la OT</strong><p>${escapeHtml(orden.prioridad || "No registrada")}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Propietario o solicitante</strong>${campo("propietario")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Contacto</strong>${campo("contacto")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Edificio u obra visitada</strong>${campo("edificio")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Departamento, unidad o sector</strong>${campo("unidad")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Responsable de la visita</strong>${campo("responsableVisita")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Otros participantes</strong>${campo("participantes")}</div>
</section>
${_seccionInforme(2, "Registro de campo")}
${bloque("Descripción del motivo de la visita", "descripcion")}
${bloque("Observaciones técnicas realizadas en la visita", "observacionesTecnicas")}
${bloque("Restricciones y límites de observación", "restricciones")}
${bloque("Compromisos y próximo paso declarados", "compromisos")}
${_seccionInforme(3, "Participación y formalización")}
${bloque("Representantes previstos para la firma", "representantesPrevistos")}
<p class="text-xs text-on-surface-variant">${contexto ? "Esta ficha no acredita firma ni conformidad del propietario. Las firmas requieren un registro vinculado a esta revisión exacta." : "Este borrador no acredita firma, conformidad del propietario ni aprobación técnica. Las firmas requieren un registro vinculado a esta revisión exacta."}</p>
${fotosVisita.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia vinculada a la visita</h3>${generarGridFotos(fotosVisita)}` : ""}
</div>`;
	return _envolverInforme(`Ficha de visita técnica${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarInformeCierre(orden, proyectoNombre, observaciones, _fotosAntes, fotosDespues, datos, codigoDocumento, itemsCierre = [], contexto) {
	const campo = (clave) => `<p id="cie-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || "No registrado")}</p>`;
	const bloque = (titulo, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
	const tablaCierre = itemsCierre.length ? `<table class="report-data-table report-data-table-wide">
  <thead><tr><th>Ítem</th><th>Trabajo</th><th>Criterio</th><th>Resultado</th><th>Verificador y fecha</th></tr></thead>
  <tbody>${itemsCierre.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="cie-item-${index}-trabajo">${escapeHtml(item.trabajo.trim() || "No registrado")}</td><td id="cie-item-${index}-criterio">${escapeHtml(item.criterio.trim() || "No registrado")}</td><td id="cie-item-${index}-resultado">${escapeHtml(item.resultado.trim() || "No registrado")}</td><td id="cie-item-${index}-verificadorFecha">${escapeHtml(item.verificadorFecha.trim() || "No registrado")}</td></tr>`).join("")}</tbody>
</table>` : "";
	const contenido = `<div class="a4-page">
${_paginaHeader(orden, "INFORME DE CIERRE TÉCNICO", "Resultados de la intervención y pendientes de verificación. La recepción del cliente corresponde al acta.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Base y ejecución final")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Proyecto</strong><p>${escapeHtml(proyectoNombre)}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Alcance aprobado de referencia</strong>${campo("alcanceReferencia")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Inicio real declarado</strong>${campo("inicioReal")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fin real declarado</strong>${campo("finReal")}</div>
</section>
${bloque("Cambios de alcance aprobados (referencias)", "cambiosAprobados")}
${_bloqueNaranjaIzquierdo("Síntesis del resultado técnico", observaciones, "No se registró una síntesis técnica.")}
${_seccionInforme(2, "Comprobación de criterios")}
${tablaCierre}
${itemsCierre.length ? datos?.ejecucionPorItem?.trim() ? bloque("Notas generales de ejecución final", "ejecucionPorItem") : "" : bloque("Ejecución final por ítem del alcance", "ejecucionPorItem")}
${itemsCierre.length ? datos?.verificacion?.trim() ? bloque("Pruebas y verificaciones adicionales", "verificacion") : "" : bloque("Pruebas finales: criterio, método, resultado, verificador y fecha", "verificacion")}
${bloque("Ubicación y referencia en plano", "planoReferencia")}
${bloque("Limpieza: comprobación, responsable y fecha", "limpiezaVerificada")}
${bloque("Daños: comprobación, responsable y fecha", "danosVerificados")}
${bloque("Pendientes, restricciones y acciones acordadas", "pendientes")}
${bloque("Entregables técnicos efectivamente entregados", "entregables")}
${_seccionInforme(3, "Pendientes y decisión técnica")}
${bloque("Conclusión técnica declarada", "conclusion")}
${bloque("Autorización interna: actor y referencia", "autorizacionInterna")}
<p class="text-xs text-on-surface-variant">El estado de la OT no acredita pruebas ni autorización. ${contexto ? "Este informe no equivale a conformidad del cliente." : "Este borrador no equivale a conformidad del cliente."}</p>
${fotosDespues.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia final (después)</h3>
${generarGridFotos(fotosDespues)}` : ""}
</div>`;
	return _envolverInforme(`Informe de cierre técnico${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarInformeOrdenServicio(orden, aclaracion, origen, codigoDocumento, fotosCliente = [], contexto) {
	const dato = (clave, legado) => {
		const valor = origen ? origen[clave] : orden.campos?.[legado];
		return typeof valor === "string" && valor.trim() ? valor.trim() : "No registrado";
	};
	const contenido = `<div class="a4-page os-page">
${_paginaHeader(orden, "ORDEN DE SERVICIO", "Registro de apertura de la orden de trabajo y procedencia de la solicitud. No certifica una visita ni un diagnóstico.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Origen y solicitud")}
<section class="grid grid-cols-2 os-meta gap-4 mb-6 no-break">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de ingreso de OT</strong><p>${escapeHtml(formatearFechaCorta(orden.fecha_ingreso))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Canal de solicitud</strong><p id="os-canal">${escapeHtml(dato("canal", "canal_solicitud"))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha y hora de recepción declarada</strong><p id="os-fechaRecepcion">${escapeHtml(dato("fechaRecepcion", "fecha_solicitud").replace("T", " "))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Solicitante</strong><p id="os-solicitante">${escapeHtml(dato("solicitante", "solicitante"))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Contacto de origen</strong><p id="os-contacto">${escapeHtml(dato("contacto", "contacto_solicitante"))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Referencia del mensaje</strong><p id="os-referencia">${escapeHtml(dato("referencia", "referencia_solicitud"))}</p></div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Urgencia manifestada</strong><p id="os-urgencia">${escapeHtml(dato("urgencia", "urgencia_solicitada"))}</p></div>
</section>
${_bloqueNaranjaIzquierdo("Solicitud original", orden.descripcion ?? "", "No se ha registrado el reclamo original.", "")}
${fotosCliente.length ? `<section class="os-evidence"><strong>Evidencia aportada al ingreso · ${fotosCliente.length} foto(s)</strong>
  ${generarGridFotos(fotosCliente)}
  <p class="text-xs text-on-surface-variant">Las imágenes aportadas no acreditan por sí solas una visita técnica.</p></section>` : ""}
${_bloqueNaranjaIzquierdo("Aclaración posterior", aclaracion, "Sin aclaraciones posteriores.")}
${_seccionInforme(2, "Clasificación y derivación")}
<section class="p-4 border border-outline-variant rounded-lg no-break"><strong>Clasificación inicial</strong><p>${escapeHtml(orden.rubro || "Sin clasificar")} · Prioridad ${escapeHtml(orden.prioridad || "No registrada")} · Responsable ${escapeHtml(orden.responsable || "No asignado")}</p></section>
<section class="p-4 border border-outline-variant rounded-lg no-break mt-4"><strong>Próximo paso acordado</strong><p id="os-proximoPaso">${escapeHtml(dato("proximoPaso", "proximo_paso"))}</p></section>
</div>`;
	return _envolverInforme(`Orden de servicio${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarInformeRelevamiento(orden, comentarioInicial, fotosAntes, datos, codigoDocumento, itemsAlcance = [], contexto) {
	const campo = (clave) => {
		const valor = datos?.[clave];
		return `<p id="rel-${clave}" style="white-space:pre-line">${escapeHtml(valor || "No registrado")}</p>`;
	};
	const bloque = (titulo, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
	const tablaAlcance = itemsAlcance.length ? `<table class="report-data-table">
  <thead><tr><th>Ítem</th><th>Trabajo propuesto</th><th>Criterio de aceptación propuesto</th></tr></thead>
  <tbody>${itemsAlcance.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="rel-item-${index}-trabajo">${escapeHtml(item.trabajo.trim() || "No registrado")}</td><td id="rel-item-${index}-criterio">${escapeHtml(item.criterio.trim() || "No registrado")}</td></tr>`).join("")}</tbody>
</table>` : "";
	const contenido = `<div class="a4-page relevamiento-page">
${_paginaHeader(orden, "INFORME DE RELEVAMIENTO", "Diagnóstico técnico inicial y detección del alcance de la intervención requerida.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Hallazgo y diagnóstico")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Modalidad (visita o remota)</strong>${campo("modalidad")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Fecha de intervención declarada</strong>${campo("fechaIntervencion")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Técnico interviniente</strong>${campo("tecnico")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Participantes</strong>${campo("participantes")}</div>
</section>
${bloque("Antecedentes pertinentes de la solicitud", "antecedentes")}
${bloque("Condiciones, acceso y límites de observación", "condiciones")}
${bloque("Hallazgos y evidencia relacionada", "hallazgos")}
${bloque("Pruebas y mediciones realizadas", "pruebas")}
${_bloqueNaranjaIzquierdo("Diagnóstico Inicial", comentarioInicial, "Sin diagnóstico registrado.")}
${bloque("Causa confirmada, probable o no determinada y sustento", "causa")}
${bloque("Ubicación y referencia en plano", "planoReferencia")}
${_seccionInforme(2, "Alcance y criterios propuestos")}
${tablaAlcance}
${itemsAlcance.length ? datos?.alcance?.trim() ? bloque("Notas generales del alcance", "alcance") : "" : bloque("Alcance propuesto", "alcance")}
${bloque("Exclusiones y supuestos", "exclusiones")}
${itemsAlcance.length ? datos?.criterios?.trim() ? bloque("Criterios adicionales", "criterios") : "" : bloque("Criterios de aceptación propuestos", "criterios")}
${bloque("Cronograma propuesto o aprobado y su referencia", "cronograma")}
${bloque("Condiciones operativas acordadas para esta intervención", "condicionesOperativas")}
${_seccionInforme(3, "Cobertura y decisión")}
${bloque("Aplicabilidad de garantía declarada", "decisionGarantia")}
${bloque("Fundamento contractual o técnico de la cobertura", "fundamentoGarantia")}
${bloque("Estado declarado del alcance", "decisionAlcance")}
<p class="text-xs text-on-surface-variant">${contexto ? "La aprobación del alcance se registra por separado y se vincula a esta revisión y a su actor autorizado." : "Este borrador no acredita aprobación del alcance. La autorización debe vincularse a una revisión y a su actor con facultades."}</p>
</div>
${fotosAntes.length ? `<div class="a4-page">
<div>
  <div class="flex items-center gap-2.5 mb-5 border-b border-outline-variant pb-2">
    <h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Fotografías previas vinculadas a la OT</h3>
  </div>
  <p class="text-xs text-on-surface-variant">El origen, autor, fecha y relación con cada hallazgo deben verificarse antes de emitir. Una foto previa no acredita por sí sola una visita técnica.</p>
  ${generarGridFotos(fotosAntes)}
</div>
</div>` : ""}`;
	return _envolverInforme(`Informe de relevamiento${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarInformeAvance(orden, comentarioAvance, _fotosAntes, fotosDurante, datos, codigoDocumento, itemsAvance = [], contexto) {
	const campo = (clave) => `<p id="av-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || "No registrado")}</p>`;
	const bloque = (titulo, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
	const tablaAvance = itemsAvance.length ? `<table class="report-data-table report-data-table-wide">
  <thead><tr><th>Ítem</th><th>Previsto</th><th>Realizado en el corte</th><th>Saldo pendiente</th></tr></thead>
  <tbody>${itemsAvance.map((item, index) => `<tr><td>${escapeHtml(item.id)}</td><td id="av-item-${index}-previsto">${escapeHtml(item.previsto.trim() || "No registrado")}</td><td id="av-item-${index}-realizado">${escapeHtml(item.realizado.trim() || "No registrado")}</td><td id="av-item-${index}-saldo">${escapeHtml(item.saldo.trim() || "No registrado")}</td></tr>`).join("")}</tbody>
</table>` : "";
	const contenido = `<div class="a4-page">
${_paginaHeader(orden, "INFORME DE AVANCE", contexto ? "Estado de la ejecución durante el período y corte identificados." : "Estado de la ejecución durante un período determinado. El corte y su revisión deberán quedar identificados al emitir.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Resultado del período")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Período desde</strong>${campo("periodoDesde")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Corte hasta</strong>${campo("periodoHasta")}</div>
</section>
${bloque("Alcance aprobado de referencia (código y revisión)", "alcanceReferencia")}
${_bloqueNaranjaIzquierdo("Trabajo observado en este corte", comentarioAvance, "Sin avance técnico registrado para este corte.")}
${tablaAvance}
${itemsAvance.length ? datos?.acumulado?.trim() ? bloque("Notas generales de avance acumulado", "acumulado") : "" : bloque("Avance acumulado y saldo por ítem", "acumulado")}
${_seccionInforme(2, "Previsto frente a realizado")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Porcentaje declarado al corte</strong>${campo("porcentaje")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Método y base de cálculo</strong>${campo("metodoPorcentaje")}</div>
</section>
${bloque("Desvíos, impacto y acciones", "desvios")}
${_seccionInforme(3, "Desvíos y siguiente decisión")}
${bloque("Objetivos y dependencias del próximo período", "proximoPeriodo")}
<p class="text-xs text-on-surface-variant">Un porcentaje sin método, base y alcance aprobado no acredita el progreso. ${contexto ? "La recepción del cliente se documenta por separado." : "Este borrador no certifica ejecución ni recepción."}</p>
${fotosDurante.length ? `<h3 class="font-section-header text-section-header text-primary uppercase tracking-widest">Evidencia de ejecución (durante)</h3>
${generarGridFotos(fotosDurante)}` : ""}
</div>`;
	return _envolverInforme(`Informe de avance${contexto ? "" : " — borrador"}`, contenido, contexto);
}
function generarInformeActaConformidad(orden, datos, codigoDocumento, contexto) {
	const campo = (clave) => `<p id="act-${clave}" style="white-space:pre-line">${escapeHtml(datos?.[clave] || "No registrado")}</p>`;
	const bloque = (titulo, clave) => `<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>${titulo}</strong>${campo(clave)}</section>`;
	const contenido = `<div class="a4-page acta-page">
${_paginaHeader(orden, "ACTA DE CONFORMIDAD", "Instrumento de recepción pendiente de decisión expresa del cliente.", codigoDocumento, contexto)}
${_bloqueDatosCliente(orden)}
${_seccionInforme(1, "Objeto de recepción")}
${bloque("Objeto breve de la entrega", "objetoEntrega")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cierre técnico (código y revisión)</strong>${campo("cierreReferencia")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Anexos entregados</strong>${campo("anexosEntregados")}</div>
</section>
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Receptor previsto</strong>${campo("receptor")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Organización</strong>${campo("organizacion")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cargo o calidad</strong>${campo("cargo")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Facultad para recibir (referencia)</strong>${campo("facultad")}</div>
</section>
${_seccionInforme(2, "Decisión y reservas")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Opción preparada (sin manifestación)</strong>${campo("decisionPreparada")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Reservas propuestas y tratamiento</strong>${campo("reservas")}</div>
</section>
${bloque("Observaciones del cliente registradas para revisión", "observacionesCliente")}
${_seccionInforme(3, "Condiciones y formalización")}
<section class="grid grid-cols-2 gap-4 mb-6">
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Garantía contractual de referencia</strong>${campo("garantiaReferencia")}</div>
  <div class="p-4 border border-outline-variant rounded-lg"><strong>Cobertura y condiciones acordadas</strong>${campo("garantiaCondiciones")}</div>
</section>
<section class="p-4 border border-outline-variant rounded-lg mb-4"><strong>Decisión y formalización</strong><p>Pendientes de manifestación expresa del receptor autorizado y vínculo con la revisión exacta del acta. ${contexto ? "La emisión de esta acta no acredita por sí sola aceptación, firma ni garantía nueva." : "Este borrador no acredita aceptación, firma ni garantía nueva."}</p></section>
</div>`;
	return _envolverInforme(`Acta de Conformidad${contexto ? "" : " — borrador"}`, contenido, contexto);
}
//#endregion
//#region src/services/controlledReportService.ts
const PLANTILLA_CONTROLADA_VERSION = "expediente-controlado-2026-10-04";
const PLANTILLA_LEGACY = "expediente-controlado-2026-09-29";
function objeto(valor, etiqueta) {
	if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new Error(`${etiqueta} inválido`);
	return valor;
}
function texto(valor, etiqueta) {
	if (typeof valor !== "string") throw new Error(`${etiqueta} inválido`);
	return valor;
}
function camposTexto(valor, etiqueta) {
	const registro = objeto(valor, etiqueta);
	for (const [clave, dato] of Object.entries(registro)) if (typeof dato !== "string") throw new Error(`${etiqueta}.${clave} inválido`);
	return registro;
}
function listaTexto(valor, etiqueta) {
	if (valor == null) return [];
	if (!Array.isArray(valor) || valor.length > 100) throw new Error(`${etiqueta} inválido`);
	return valor.map((item, i) => camposTexto(item, `${etiqueta}[${i}]`));
}
function materializarHtmlControlado(revision, fuentesValor, imagenesVerificadas) {
	const fuentes = objeto(fuentesValor, "Fuentes");
	if (fuentes.version !== 1) throw new Error("Versión de fuentes no admitida");
	const documento = objeto(fuentes.documento, "Documento");
	const identidadRevision = objeto(fuentes.revision, "Identidad de revisión");
	const proyecto = objeto(fuentes.proyecto, "Proyecto");
	const ordenFuente = objeto(fuentes.orden, "Orden");
	const codigo = texto(documento.codigo, "Código");
	const tipo = texto(documento.tipo, "Tipo");
	if (documento.id !== revision.documento_id || identidadRevision.id !== revision.id || identidadRevision.numero !== revision.revision || identidadRevision.datos_sha256 !== revision.contenido_sha256 || identidadRevision.plantilla_version !== revision.plantilla_version || documento.orden_id !== ordenFuente.id || documento.proyecto_id !== proyecto.id || documento.tenant_id !== proyecto.tenant_id || ordenFuente.proyecto_id !== proyecto.id) throw new Error("La revisión y las fuentes no corresponden");
	const anio = Number(/^POT-(\d{4})-/.exec(codigo)?.[1]);
	if (!Number.isInteger(anio) || anio < 2020 || anio > 2100) throw new Error("Año documental inválido");
	const contexto = {
		codigo,
		anio,
		revision: revision.revision
	};
	if (!["expediente-controlado-2026-10-04", PLANTILLA_LEGACY].includes(revision.plantilla_version)) throw new Error("Versión de plantilla no compatible con este renderizador");
	if (revision.plantilla_version !== PLANTILLA_LEGACY && fuentes.empresa) {
		const empresa = objeto(fuentes.empresa, "Empresa emisora");
		if (empresa.id !== documento.tenant_id) throw new Error("Empresa emisora ajena al documento");
		const nombre = texto(empresa.nombre, "Nombre de empresa emisora");
		contexto.emisor = nombre === "Benítez Bittar Constructora" ? `${nombre} / Facility Services` : nombre;
	}
	const datos = objeto(revision.datos, "Datos de revisión");
	const observaciones = texto(datos.observaciones ?? "", "Observaciones");
	if (typeof datos.incluirFotos !== "boolean") throw new Error("Selección de fotos inválida");
	const ids = datos.fotoIds ?? [];
	if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("IDs de fotos inválidos");
	const fotosFuente = fuentes.fotos;
	if (!Array.isArray(fotosFuente) || fotosFuente.length !== ids.length) throw new Error("Las fotos congeladas no coinciden con la revisión");
	const fasePermitida = {
		orden_servicio: "ANTES",
		visita: "ANTES",
		relevamiento: "ANTES",
		avance: "DURANTE",
		cierre: "DESPUES",
		acta: null,
		encuesta: null
	};
	const fotos = fotosFuente.map((valor, i) => {
		const fuente = objeto(valor, `Foto ${i + 1}`);
		const id = texto(fuente.id, "ID de foto");
		if (id !== ids[i]) throw new Error("Orden o identidad de foto alterada");
		const categoria = texto(fuente.categoria, "Categoría de foto");
		if (categoria !== fasePermitida[tipo]) throw new Error("La categoría de foto no corresponde a este documento");
		const path = texto(fuente.edicion_path, "Ruta de foto");
		texto(fuente.original_path, "Ruta de original");
		const fileUrl = imagenesVerificadas[path];
		if (datos.incluirFotos && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(fileUrl ?? "")) throw new Error("Falta la imagen verificada de una foto seleccionada");
		return {
			id,
			categoria,
			file_url: datos.incluirFotos ? fileUrl : "",
			descripcion: fuente.descripcion == null ? null : texto(fuente.descripcion, "Descripción de foto"),
			descripcion_observacion: fuente.descripcion_observacion == null ? null : texto(fuente.descripcion_observacion, "Observación de foto")
		};
	});
	const fase = (categoria) => datos.incluirFotos ? fotos.filter((f) => f.categoria === categoria) : [];
	const antes = fase("ANTES");
	const durante = fase("DURANTE");
	const despues = fase("DESPUES");
	const proyectoNombre = texto(proyecto.nombre, "Nombre de proyecto");
	const ordenOriginal = ordenFuente;
	const identidadGuardada = datos.identificacion === void 0 ? void 0 : camposTexto(datos.identificacion, "Identificación");
	const orden = revision.plantilla_version === PLANTILLA_LEGACY ? ordenOriginal : ordenParaInforme(ordenOriginal, restaurarCampos(prepararAutocompletado(ordenOriginal, proyectoNombre).identificacion, identidadGuardada));
	switch (tipo) {
		case "orden_servicio": return generarInformeOrdenServicio(orden, observaciones, camposTexto(datos.origen, "Origen"), codigo, antes, contexto);
		case "visita": return generarFichaVisita(orden, camposTexto(datos.visita, "Visita"), antes, codigo, contexto);
		case "relevamiento": return generarInformeRelevamiento(orden, observaciones, antes, camposTexto(datos.relevamiento, "Relevamiento"), codigo, listaTexto(datos.itemsAlcance, "Alcance"), contexto);
		case "avance": return generarInformeAvance(orden, observaciones, antes, durante, camposTexto(datos.avance, "Avance"), codigo, listaTexto(datos.itemsAvance, "Items de avance"), contexto);
		case "cierre": return generarInformeCierre(orden, proyectoNombre, observaciones, antes, despues, camposTexto(datos.cierre, "Cierre"), codigo, listaTexto(datos.itemsCierre, "Items de cierre"), contexto);
		case "acta": return generarInformeActaConformidad(orden, camposTexto(datos.acta, "Acta"), codigo, contexto);
		case "encuesta": return generarEncuestaSatisfaccion(orden, camposTexto(datos.encuesta, "Encuesta"), codigo, contexto);
		default: throw new Error("Tipo documental no admitido");
	}
}
//#endregion
export { PLANTILLA_CONTROLADA_VERSION, materializarHtmlControlado };
