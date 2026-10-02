# Control de Línea

PWA para registrar las **recorridas de control** en las líneas de envasado y el **control final** de lotes, y sacar un **Reporte de Control del Día** gráfico para gerencia. Pensada para usarse en planta con una mano y guantes: botones grandes, pocos campos obligatorios y funcionamiento **sin señal**.

Es una app separada de `informeCalidad`: aquella detalla desvíos de toda la planta con fotos; esta deja evidencia de que cada línea fue controlada, recorrida por recorrida, haya o no desvíos.

## Características

- **Recorridas** (R1, R2, R3…): la app lleva línea por línea, en el orden configurado. Por cada línea se marca el resultado:
  - **Conforme**
  - **Ajuste en línea**
  - **Sin producción**
- **Relevancia del evento**: si hubo ajuste, se registra qué se detectó o corrigió y la magnitud opcional (L, kg, unidades, min…).
- **Control final** de lotes terminados antes del despacho: **Conforme**, **Parcial** (algunos pallets no están OK, con cantidad), **Reprocesado** o **No conforme**.
- **Correcciones posteriores**: se pueden editar los horarios de inicio/fin y la hora de cada control, agregar con "+ Línea" las que faltaron en una recorrida cerrada, y clonar o renumerar recorridas.
- **Reporte del día** pensado para leerse en segundos (gráfico antes que texto):
  - **Exportar PDF** (A4, vía "Guardar como PDF").
  - **Compartir resumen** como texto.
  - Casilla **Incluir Control final** para ocultarlo del reporte sin borrar datos.
- **Respaldo JSON**: descarga y restauración de todos los datos desde Ajustes.
- **Instalable y offline** gracias al service worker.

## Tecnologías

HTML + CSS + JavaScript puro, **sin frameworks, sin npm y sin paso de build**. Scripts clásicos (sin módulos), un objeto global por archivo. Datos en `localStorage` (clave `controlLinea.v1`). Sin login ni backend.

## Estructura

```
├── index.html              # Estructura: barra superior, <main id="view"> y pestañas
├── manifest.webmanifest    # Datos de instalación PWA
├── sw.js                   # Service worker (red primero, caché sin señal)
├── css/
│   └── styles.css          # Estilos mobile first y reglas @media print (A4)
├── js/
│   ├── brand.js            # Marca configurable (BRAND)
│   ├── store.js            # Capa de datos (Store)
│   ├── report.js           # Reporte del día y texto para compartir (Report)
│   └── app.js              # Pantallas, formularios y eventos
├── icons/                  # Íconos de la app
├── assets/                 # Logo real (ej. assets/logo.png)
├── AGENTS.md / CLAUDE.md   # Contexto para agentes de IA
```

Orden de carga de los scripts: `brand` → `store` → `report` → `app`.

## Uso

1. **Ajustes**: cargá tu nombre y las líneas en el orden en que las recorrés.
2. **Recorrida**: tocá *Iniciar recorrida*. La app te lleva línea por línea; marcá Conforme, Ajuste en línea o Sin producción. Si hubo ajuste, completá la *Relevancia del evento*.
3. **Control final**: registrá cada lote terminado antes del despacho.
4. **Reporte**: elegí la jornada y tocá *Exportar PDF* o *Compartir resumen*.

Los datos quedan solo en el celular: descargá un respaldo desde Ajustes cada tanto.

Para probarla en local (con `file://` el service worker no funciona):

```bash
python3 -m http.server 8000
```

Abrir `http://localhost:8000`.

## Publicar en GitHub Pages

1. Subir todos los archivos de esta carpeta al repo.
2. Settings → Pages → Deploy from branch → `main` / `(root)`.
3. Abrir la URL en Chrome del celular → menú → *Instalar app*.

Todas las rutas son relativas, así que funciona en cualquier subdirectorio.

## Personalización de la marca

Todo se edita en `js/brand.js`:

```js
window.BRAND = {
  empresa: '...',
  area: 'Departamento de Calidad',
  logo: '',                  // ej: 'assets/logo.png' (vacío = sin logo)
  colores: {
    primario: '#0f5c6e',     // barra superior, botones y títulos del reporte
    textoSobrePrimario: '#ffffff'
  },
  documento: {
    titulo: 'Reporte de Control del Día',
    codigo: '',              // código de registro controlado (opcional)
    revision: ''
  }
};
```

## Notas de mantenimiento

- Al cambiar cualquier archivo, subir `VERSION` en `sw.js` y mantener `ARCHIVOS` al día; si no, los celulares siguen con la versión vieja.
- Si cambia la forma de los datos, subir la clave a `controlLinea.v2` y migrar desde v1 en `load()` para no perder datos.
- Los datos viven en el dispositivo: borrar los datos del navegador los elimina, por eso conviene el respaldo.
