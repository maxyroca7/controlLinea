# AGENTS.md — Control de Línea

Contexto para agentes de código (Claude Code, OpenCode, etc.). Leer entero antes de tocar nada.

## Qué es
PWA para el **checker de calidad** de Agrofacil S.A. Registra el trabajo de control que se hace
durante la jornada en las líneas de envasado, **haya o no desvíos**, y genera un
**Reporte de Control del Día** gráfico para gerencia.

Es una app **separada** de `informeCalidad` (repo `maxyroca7/informeCalidad`):
- `informeCalidad` → detalla desvíos de toda la planta (dentro y fuera de las líneas), con fotos.
- `controlLinea` (esta) → evidencia de que cada línea fue controlada, recorrida por recorrida.

## Cómo trabaja el usuario (flujo real)
1. Sale a planta y recorre **línea por línea**, en un orden fijo, verificando el **lote que se está envasando**.
2. Cada vuelta completa es una **recorrida** (R1, R2, R3…). Hay varias por turno.
3. Por cada línea marca: **Conforme**, **Ajuste en línea** o **Sin producción**.
4. Si hubo ajuste, registra qué se detectó/ajustó y la **Relevancia del evento**
   (qué se evitó o corrigió + magnitud opcional en L, kg, unid., min…).
5. Aparte, registra lotes terminados en **Control final** (Conforme / Reprocesado / No conforme; reprocesado = tenía falla y la corrigió él mismo) antes del despacho.
6. Al final del turno exporta el reporte (PDF vía imprimir) o comparte un resumen de texto.

## Reglas de producto (no romper)
- **Simple**. Es un MVP. Avisar al usuario si un pedido convierte esto en algo más que un MVP.
- El término es **"Relevancia del evento"** (no "litros salvados": la magnitud puede ser en cualquier unidad).
- **Fuera de alcance** por decisión del usuario: muestreos de materia prima (van en otro informe).
- El reporte es para **gerencia**: tiene que leerse en segundos. Gráfico antes que texto.
- Uso con una mano y guantes: botones grandes (mín. 44–48 px), pocos campos obligatorios.
- Funciona **sin señal** (service worker) y sin backend. Datos solo en el dispositivo.
- Idioma de la interfaz: español rioplatense (vos: "Iniciá", "Cargá").

## Estructura
```
index.html            Estructura de la app (barra superior, <main id="view">, pestañas)
css/styles.css        Estilos + reglas @media print del reporte (A4)
js/brand.js           Marca configurable (empresa, logo, colores, código de documento)
js/store.js           Capa de datos (localStorage, clave 'controlLinea.v1')
js/report.js          Arma el HTML del reporte y el texto para compartir (solo lectura)
js/app.js             Interfaz: pantallas, formulario (hoja inferior), eventos
sw.js                 Service worker (red primero, caché si no hay señal)
manifest.webmanifest  Datos de instalación de la PWA
icons/                Íconos (svg, 192, 512)
assets/               Poner acá el logo real (ej. assets/logo.png) y referenciarlo en brand.js
```
Scripts clásicos (sin módulos, sin build, sin dependencias). Orden de carga en index.html:
`brand.js → store.js → report.js → app.js`. Cada uno expone un objeto global
(`BRAND`, `Store`, `Report`); `app.js` es una IIFE.

## Modelo de datos (store.js)
```js
{
  config: { checker, lineas: [..], unidades: [..], turnos: [..] },
  dias: {
    'AAAA-MM-DD': {
      turno,
      recorridas: [{ id, numero, inicio: 'HH:MM', fin: 'HH:MM' | null }],
      controles:  [{
        id, tipo: 'linea' | 'final', recorridaId, linea, producto, lote, hora,
        resultado: 'conforme' | 'ajuste' | 'sin_produccion' | 'no_conforme' | 'reprocesado',
        detalle,
        relevancia: { descripcion, magnitud: number | null, unidad } | null
      }]
    }
  }
}
```
- Una sola recorrida abierta por jornada (`fin === null`).
- Los horarios se pueden corregir después (el usuario a veces carga tarde): inicio/fin de la
  recorrida con `Store.editarRecorrida`, hora de cada control desde su formulario, y las líneas
  que faltaron en una recorrida cerrada se agregan con "+ Línea" en el registro. El reporte
  (y el PDF) siempre se arma con estos datos: para corregir el PDF se corrigen los datos.
- Un control por línea por recorrida (se edita, no se duplica). Si se toca una línea ya
  controlada en la recorrida abierta, se pregunta: empezar la recorrida siguiente o corregir
  (el usuario llegó a pisar la vuelta 1 con datos de la vuelta 2 por no cerrarla).
- Jornada = fecha elegida en la cabecera. Si ayer quedó una recorrida abierta (turno noche),
  la app arranca en ayer.
- Si cambiás la forma de los datos: subí la clave a `controlLinea.v2` y escribí una migración
  desde v1 en `load()`. No perder datos del usuario.

## Convenciones
- Todo texto del usuario se escapa con `Report.esc()` antes de ir a `innerHTML`.
- Botones con `data-act="..."` → se manejan en el `switch` del listener de click de `app.js`.
- Colores de estado en variables CSS: `--ok`, `--warn`, `--bad`, `--off` (+ `-bg`).
- Al cambiar cualquier archivo: **subir `VERSION` en `sw.js`** o los celulares siguen con la versión vieja.
- Comentarios en español, explicando el porqué (el usuario está aprendiendo a programar).

## Probar
Servir la carpeta (no abrir con file://, el service worker no anda):
```
python3 -m http.server 8000     # y abrir http://localhost:8000
```
Checklist manual: iniciar recorrida → cargar las líneas (conforme / ajuste con relevancia /
sin producción) → cerrar → segunda recorrida (producto y lote se precargan) → control final
con un no conforme → Reporte → Exportar PDF.

## Deploy
GitHub Pages igual que informeCalidad: repo nuevo (ej. `maxyroca7/controlLinea`),
Settings → Pages → Deploy from branch → `main` / `(root)`.

## Ideas para después (no hacer sin que el usuario lo pida)
- Exportar el reporte como imagen (PNG) para mandar por WhatsApp.
- Reporte semanal/mensual (tendencia de ajustes por línea).
- Motivos de ajuste predefinidos por línea (lista corta) para poder agruparlos.
- Enlazar un ajuste con un desvío de informeCalidad.
