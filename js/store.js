/*
 * store.js — Capa de datos. Todo se guarda en localStorage del dispositivo.
 *
 * Estructura (clave 'controlLinea.v1'):
 * {
 *   config: { checker, lineas: [..], unidades: [..], turnos: [..] },
 *   dias: {
 *     'AAAA-MM-DD': {
 *       turno: 'Mañana',
 *       recorridas: [ { id, numero, inicio: 'HH:MM', fin: 'HH:MM'|null } ],
 *       controles:  [ Control ]
 *     }
 *   }
 * }
 *
 * Control = {
 *   id, tipo: 'linea' | 'final',
 *   recorridaId (solo tipo 'linea'),
 *   linea, producto, lote, hora: 'HH:MM',
 *   resultado: 'conforme' | 'ajuste' | 'sin_produccion'   (tipo 'linea')
 *            | 'conforme' | 'no_conforme'                  (tipo 'final')
 *   detalle: texto (qué se detectó / qué se ajustó / observación),
 *   relevancia: { descripcion, magnitud: número|null, unidad } | null
 * }
 */
const Store = (() => {
  const KEY = 'controlLinea.v1';

  const defaults = () => ({
    config: {
      checker: '',
      lineas: ['Línea 1', 'Línea 2', 'Línea 3', 'Línea 4'],
      unidades: ['L', 'kg', 'unid.', 'min'],
      turnos: ['Mañana', 'Tarde', 'Noche']
    },
    dias: {}
  });

  let state = defaults();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const base = defaults();
        state = {
          config: Object.assign(base.config, data.config || {}),
          dias: data.dias || {}
        };
      }
    } catch (e) {
      console.error('No se pudieron leer los datos guardados', e);
      state = defaults();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('No se pudo guardar', e);
      return false;
    }
  }

  // ---------- utilidades ----------
  const pad = n => String(n).padStart(2, '0');
  function hoy() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function horaActual() {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- config ----------
  function getConfig() { return state.config; }
  function setConfig(parcial) {
    Object.assign(state.config, parcial);
    return save();
  }

  // ---------- días ----------
  function vacio() { return { turno: '', recorridas: [], controles: [] }; }
  /** Devuelve el día (sin crearlo). */
  function getDia(fecha) { return state.dias[fecha] || vacio(); }
  /** Devuelve el día, creándolo si no existe. */
  function dia(fecha) {
    if (!state.dias[fecha]) state.dias[fecha] = vacio();
    return state.dias[fecha];
  }
  function diasConDatos() {
    return Object.keys(state.dias)
      .filter(f => state.dias[f].controles.length || state.dias[f].recorridas.length)
      .sort().reverse();
  }
  function setTurno(fecha, turno) { dia(fecha).turno = turno; return save(); }

  // ---------- recorridas ----------
  function recorridaActiva(fecha) {
    return getDia(fecha).recorridas.find(r => !r.fin) || null;
  }
  function iniciarRecorrida(fecha) {
    const d = dia(fecha);
    const activa = d.recorridas.find(r => !r.fin);
    if (activa) return activa;
    const r = { id: uid(), numero: d.recorridas.length + 1, inicio: horaActual(), fin: null };
    d.recorridas.push(r);
    save();
    return r;
  }
  function cerrarRecorrida(fecha, id) {
    const r = dia(fecha).recorridas.find(x => x.id === id);
    if (r) { r.fin = horaActual(); save(); }
  }
  function reabrirRecorrida(fecha, id) {
    const d = dia(fecha);
    d.recorridas.forEach(r => { if (!r.fin) r.fin = horaActual(); });
    const r = d.recorridas.find(x => x.id === id);
    if (r) { r.fin = null; save(); }
  }
  /**
   * Corrige los horarios de una recorrida ya iniciada.
   * Sirve cuando la cargaste tarde: el reporte usa estos horarios, no los del momento de carga.
   * cambios = { inicio: 'HH:MM', fin: 'HH:MM' | null }. Si no viene 'fin', se deja como estaba.
   */
  function editarRecorrida(fecha, id, cambios) {
    const r = dia(fecha).recorridas.find(x => x.id === id);
    if (!r) return false;
    if (cambios.inicio) r.inicio = cambios.inicio;
    if ('fin' in cambios && r.fin) r.fin = cambios.fin || r.fin; // una recorrida cerrada no se reabre desde acá
    return save();
  }
  function borrarRecorrida(fecha, id) {
    const d = dia(fecha);
    d.controles = d.controles.filter(c => c.recorridaId !== id);
    d.recorridas = d.recorridas.filter(r => r.id !== id);
    d.recorridas.forEach((r, i) => { r.numero = i + 1; });
    save();
  }

  // ---------- controles ----------
  function guardarControl(fecha, control) {
    const d = dia(fecha);
    if (!control.id) control.id = uid();
    const i = d.controles.findIndex(c => c.id === control.id);
    if (i >= 0) d.controles[i] = control; else d.controles.push(control);
    return save() ? control : null;
  }
  function borrarControl(fecha, id) {
    const d = dia(fecha);
    d.controles = d.controles.filter(c => c.id !== id);
    save();
  }
  /** Control de una línea dentro de una recorrida (si existe). */
  function controlDeLinea(fecha, recorridaId, linea) {
    return getDia(fecha).controles.find(c => c.tipo === 'linea' && c.recorridaId === recorridaId && c.linea === linea) || null;
  }
  /** Último control de esa línea (hoy o días anteriores) para precargar producto/lote. */
  function ultimoDeLinea(fecha, linea) {
    const fechas = Object.keys(state.dias).filter(f => f <= fecha).sort().reverse().slice(0, 3);
    for (const f of fechas) {
      const lista = state.dias[f].controles
        .filter(c => c.tipo === 'linea' && c.linea === linea && c.resultado !== 'sin_produccion')
        .sort((a, b) => (a.hora < b.hora ? 1 : -1));
      if (lista.length) return lista[0];
    }
    return null;
  }
  function productosUsados() {
    const set = new Set();
    Object.values(state.dias).forEach(d => d.controles.forEach(c => c.producto && set.add(c.producto)));
    return [...set].sort();
  }

  // ---------- respaldo ----------
  function exportar() { return JSON.stringify(state, null, 2); }
  function importar(texto) {
    const data = JSON.parse(texto);
    if (!data || typeof data !== 'object' || !data.dias) throw new Error('El archivo no es un respaldo de Control de Línea.');
    const base = defaults();
    state = { config: Object.assign(base.config, data.config || {}), dias: data.dias };
    save();
  }
  function borrarDia(fecha) { delete state.dias[fecha]; save(); }

  load();

  return {
    hoy, horaActual, uid,
    getConfig, setConfig,
    getDia, diasConDatos, setTurno,
    recorridaActiva, iniciarRecorrida, cerrarRecorrida, reabrirRecorrida, editarRecorrida, borrarRecorrida,
    guardarControl, borrarControl, controlDeLinea, ultimoDeLinea, productosUsados,
    exportar, importar, borrarDia
  };
})();
