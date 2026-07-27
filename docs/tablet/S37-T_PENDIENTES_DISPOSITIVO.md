# S37-T · Pendientes de prueba en el dispositivo físico

Cosas que **no se pueden validar en la notebook** y que hay que probar en la
Samsung Galaxy Tab S7 FE antes de aprobar el sprint. No tocar el código de estos
puntos hasta tener el resultado de la prueba real.

---

## P-1 · `background-attachment: fixed` + `backdrop-filter: blur()` puede trabar el scroll

**Estado:** ⏳ pendiente de prueba física · **Bloquea:** aprobación del tema Vidrio como definitivo
**Introducido en:** F2 (`c84bf5e`) · **Archivo:** `src/styles/tablet.css`

### Qué se hizo

```css
body.modo-tablet.tema-vidrio {
  background-image: url('/obra_bg.jpg.png'), linear-gradient(...);
  background-attachment: fixed, fixed;   /* ← el punto de riesgo */
}
```

más `backdrop-filter: blur(22px)` previsto sobre cada panel de vidrio.

### Por qué puede fallar

Son dos costos que se multiplican, no que se suman:

1. **`background-attachment: fixed` en Android/Chrome es históricamente
   problemático.** Obliga al navegador a repintar el fondo en cada frame de
   scroll en vez de desplazarlo junto con el contenido. Varios navegadores
   móviles directamente lo ignoran y caen a `scroll`; los que lo respetan pagan
   el repintado.
2. **`backdrop-filter` es caro en GPU**, y cada panel que lo use obliga a
   recomponer el desenfoque contra lo que tiene detrás. Si lo que tiene detrás
   es un fondo que se repinta en cada frame, el costo se multiplica por la
   cantidad de paneles visibles.

La S7 FE monta un Snapdragon 750G — gama media. Es exactamente el perfil de
dispositivo donde esta combinación se nota.

### Cómo probarlo

1. Modo tablet + tema **Vidrio**.
2. Scrollear con el dedo, rápido y sostenido, en las vistas con más contenido:
   Dashboard y Grilla.
3. Repetir en **ambas orientaciones** (en vertical hay más scroll vertical, que
   es el caso peor).
4. Comparar contra el tema **Campo** en la misma vista: si Campo va fluido y
   Vidrio se traba, el problema es esta combinación y no el dispositivo.

Señales de que hay que actuar: scroll a tirones, el fondo "salta" o se queda
atrás respecto del contenido, o la app baja de ~60 fps de forma perceptible.

### Mitigaciones, en orden de menor a mayor costo

1. **Sacar `background-attachment: fixed`** y mover la foto a la capa
   `::before` que ya existe para el scrim (que es `position: fixed` y no
   participa del scroll). Resuelve el punto 1 sin tocar el diseño y es un cambio
   de pocas líneas. **Primera opción a probar.**
2. **Bajar el blur** de 22px a 10–12px. El efecto de vidrio se conserva y el
   costo de composición baja bastante.
3. **Limitar `backdrop-filter` a los paneles flotantes** (modales, tarjetas
   centradas) y usar un color sólido semitransparente en los paneles de fondo,
   que son los que más se repiten en pantalla.
4. **Descartar `backdrop-filter`** y quedarse con superficies translúcidas
   planas. Se pierde el efecto, se conserva la estética.

---

## P-2 · Las clases globales de `index.css` no las usa nadie

**Estado:** ✅ verificado en código · ⏳ pendiente de decisión
**Detectado en:** revisión de F2

`.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`,
`.field-input`, `.section-heading`, `.badge`, `.spinner` y `.divider` están
definidas en `index.css` y **ningún componente las referencia**.

Evidencia:

| Comprobación | Resultado |
|---|---|
| `className="…"` con string literal en `.tsx` | 0 ocurrencias |
| `:global` / `composes:` en cualquier `.css` | 0 ocurrencias |
| `.module.css` importados | 37 archivos |

Son restos del rediseño S15. Toda la app estiliza por CSS Modules o por estilos
inline.

**Consecuencia para el sprint:** las reglas de `tablet.css` que apuntan a
`.card`, `.card::after`, `.btn`, `.btn-primary`, `.btn-secondary` y
`.field-input` no enganchan con nada. Hay que borrarlas o aceptar que son
decorativas.

### Alcance real del tema Vidrio hoy

- ✅ Fondo de obra + scrim: funcionan (van sobre `body`).
- ⚠️ Tokens: solo **10 de 37** módulos consumen los tokens de superficie/texto
  que Vidrio redefine, y varios de esos 10 mezclan con hex hardcodeados.
- ❌ Los 27 restantes tienen el color quemado en el CSS. Entre ellos las vistas
  más pesadas de la demo:

```
VistaGrilla.module.css      166 hex hardcodeados
PanelOT.module.css          106
ComparadorVersiones          83
EditorFoto                   72
ModalInformeOT               65
ModalDetalleOT               57
SelectorProyectos            29
AuthForm                     26
```

O sea: Vidrio es hoy **cimiento + fondo**, no la app entera vestida. Cada vista
se viste en la fase que la toca (F5 Dashboard, F5B Plano/Gantt), o se encara una
tokenización general como sprint aparte (~600 reemplazos en 8 archivos, dos de
ellos SENSIBLES).

---

## P-3 · Peso del fondo de obra

**Estado:** ⏳ pendiente de reemplazo del asset

`public/obra_bg.jpg.png` es un **PNG de 2,78 MB** con doble extensión. La
especificación pedía JPEG de 3840×2160 y 400–900 KB.

Impacto medido en el build:

```
- obra_bg.jpg.png is 2.78 MB, and won't be precached.
- assets/index-B4lsi4Cq.js is 2.17 MB, and won't be precached.
```

Es la segunda causa de falla de `npm run build`, junto al chunk preexistente.
Además, 2,78 MB de fondo en una PWA de campo es mucho para la primera carga.

Al reemplazarlo por el JPEG correcto, cambiar la única referencia en
`src/styles/tablet.css` (bloque "Fondo de obra").
