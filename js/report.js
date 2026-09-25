/*
 * report.js — Arma el "Reporte de Control del Día" (HTML listo para ver e imprimir a PDF)
 * y el texto corto para compartir por WhatsApp/mail.
 * No guarda nada: solo lee Store y devuelve HTML/texto.
 */
const Report = (() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtFecha = f => { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; };
  const fmtNum = n => Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });

  const ETIQUETA = {
    conforme: 'Conforme',
    ajuste: 'Ajuste en línea',
    sin_produccion: 'Sin producción',
    no_conforme: 'No conforme'
  };

  /** Calcula todos los números del día. */
  function calcular(fecha) {
    const d = Store.getDia(fecha);
    const cfg = Store.getConfig();
    const linea = d.controles.filter(c => c.tipo === 'linea');
    const final = d.controles.filter(c => c.tipo === 'final').sort((a, b) => a.hora.localeCompare(b.hora));
    const controlados = linea.filter(c => c.resultado !== 'sin_produccion');
    const ajustes = linea.filter(c => c.resultado === 'ajuste');
    const conformes = controlados.filter(c => c.resultado === 'conforme');
    const finalNC = final.filter(c => c.resultado === 'no_conforme');

    // Líneas: las configuradas + cualquier otra que aparezca en los datos.
    const lineas = [...cfg.lineas];
    linea.forEach(c => { if (!lineas.includes(c.linea)) lineas.push(c.linea); });

    const lotes = new Set(controlados.map(c => `${c.linea}|${c.lote}`).filter(x => !x.endsWith('|')));

    // Eventos relevantes: ajustes en línea + no conformes en control final.
    const eventos = [...ajustes, ...finalNC].sort((a, b) => a.hora.localeCompare(b.hora));

    // Magnitud total por unidad.
    const magnitudes = {};
    eventos.forEach(e => {
      const r = e.relevancia;
      if (r && r.magnitud != null && r.magnitud !== '' && !isNaN(r.magnitud)) {
        const u = r.unidad || '';
        magnitudes[u] = (magnitudes[u] || 0) + Number(r.magnitud);
      }
    });

    // Actividad por hora (controles en línea + finales).
    const porHora = {};
    d.controles.forEach(c => {
      const h = parseInt((c.hora || '').slice(0, 2), 10);
      if (!isNaN(h)) porHora[h] = (porHora[h] || 0) + 1;
    });

    return {
      d, cfg, linea, final, controlados, ajustes, conformes, finalNC, lineas, lotes, eventos, magnitudes, porHora,
      conformidad: controlados.length ? Math.round((conformes.length / controlados.length) * 100) : null
    };
  }

  function tablero(x) {
    const recs = x.d.recorridas;
    if (!recs.length) return '<p class="r-empty">Sin recorridas registradas.</p>';
    const cols = recs.map(r => `<th scope="col"><span>R${r.numero}</span><small>${esc(r.inicio)}</small></th>`).join('');
    const filas = x.lineas.map(l => {
      let ok = 0, aj = 0;
      const celdas = recs.map(r => {
        const c = x.linea.find(k => k.recorridaId === r.id && k.linea === l);
        if (!c) return '<td><span class="cell cell-none" title="No controlada"></span></td>';
        if (c.resultado === 'conforme') ok++;
        if (c.resultado === 'ajuste') aj++;
        const t = `${ETIQUETA[c.resultado]}${c.lote ? ' · Lote ' + c.lote : ''} · ${c.hora}`;
        return `<td><span class="cell cell-${c.resultado}" title="${esc(t)}">${c.resultado === 'ajuste' ? '!' : ''}</span></td>`;
      }).join('');
      return `<tr><th scope="row">${esc(l)}</th>${celdas}<td class="r-tot">${ok + aj}${aj ? ` <em>(${aj} aj.)</em>` : ''}</td></tr>`;
    }).join('');
    return `
      <div class="r-scroll">
        <table class="r-board">
          <thead><tr><th></th>${cols}<th class="r-tot">Controles</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
      <div class="r-legend">
        <span><i class="cell cell-conforme"></i>Conforme</span>
        <span><i class="cell cell-ajuste"></i>Ajuste en línea</span>
        <span><i class="cell cell-sin_produccion"></i>Sin producción</span>
        <span><i class="cell cell-none"></i>No controlada</span>
      </div>`;
  }

  function actividad(x) {
    const horas = Object.keys(x.porHora).map(Number);
    if (!horas.length) return '<p class="r-empty">Sin controles registrados.</p>';
    const min = Math.min(...horas), max = Math.max(...horas);
    const tope = Math.max(...Object.values(x.porHora));
    let barras = '';
    for (let h = min; h <= max; h++) {
      const n = x.porHora[h] || 0;
      const alto = n ? Math.max(8, Math.round((n / tope) * 100)) : 0;
      barras += `<div class="r-bar"><span class="r-bar-n">${n || ''}</span><div class="r-bar-fill" style="height:${alto}%"></div><span class="r-bar-h">${String(h).padStart(2, '0')}</span></div>`;
    }
    return `<div class="r-bars">${barras}</div>`;
  }

  function donut(x) {
    if (x.conformidad == null) return '';
    const p = x.conformidad;
    return `<div class="r-donut" style="--p:${p}"><div><strong>${p}%</strong><span>conformes al primer control</span></div></div>`;
  }

  function eventos(x) {
    if (!x.eventos.length) return '<p class="r-empty">Sin ajustes ni no conformidades en el día.</p>';
    return x.eventos.map(e => {
      const r = e.relevancia || {};
      const mag = (r.magnitud != null && r.magnitud !== '') ? `<span class="r-mag">${fmtNum(r.magnitud)} ${esc(r.unidad || '')}</span>` : '';
      const donde = e.tipo === 'final' ? 'Control final' : esc(e.linea);
      return `
        <article class="r-event r-event-${e.resultado}">
          <header>
            <span class="r-event-time">${esc(e.hora)}</span>
            <strong>${donde}</strong>
            <span class="r-event-lote">${esc(e.producto || '')}${e.lote ? ' · Lote ' + esc(e.lote) : ''}</span>
            ${mag}
          </header>
          ${e.detalle ? `<p><b>${e.tipo === 'final' ? 'Qué no cumple' : 'Qué se ajustó'}:</b> ${esc(e.detalle)}</p>` : ''}
          ${r.descripcion ? `<p><b>Relevancia del evento:</b> ${esc(r.descripcion)}</p>` : ''}
        </article>`;
    }).join('');
  }

  function finalTabla(x) {
    if (!x.final.length) return '<p class="r-empty">Sin lotes registrados en control final.</p>';
    const filas = x.final.map(c => `
      <tr>
        <td>${esc(c.hora)}</td>
        <td>${esc(c.producto || '—')}</td>
        <td>${esc(c.lote || '—')}</td>
        <td>${esc(c.linea || '—')}</td>
        <td><span class="pill pill-${c.resultado}">${ETIQUETA[c.resultado]}</span></td>
      </tr>`).join('');
    return `<div class="r-scroll"><table class="r-table"><thead><tr><th>Hora</th><th>Producto</th><th>Lote</th><th>Línea</th><th>Resultado</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }

  function render(fecha) {
    const x = calcular(fecha);
    const B = window.BRAND || {};
    const doc = B.documento || {};
    const mags = Object.entries(x.magnitudes);
    const magTxt = mags.length ? mags.map(([u, n]) => `${fmtNum(n)} ${esc(u)}`).join('<br>') : '—';
    const recs = x.d.recorridas;
    const franja = recs.length ? `${recs[0].inicio} a ${recs[recs.length - 1].fin || 'en curso'}` : '';

    return `
    <div class="report" id="report">
      <header class="r-head">
        ${B.logo ? `<img src="${esc(B.logo)}" alt="${esc(B.empresa || '')}" class="r-logo">` : ''}
        <div class="r-title">
          <h1>${esc(doc.titulo || 'Reporte de Control del Día')}</h1>
          <p>${esc(B.area || '')}${B.empresa ? ', ' + esc(B.empresa) : ''}</p>
        </div>
        <dl class="r-meta">
          <div><dt>Fecha</dt><dd>${fmtFecha(fecha)}</dd></div>
          <div><dt>Turno</dt><dd>${esc(x.d.turno || '—')}</dd></div>
          <div><dt>Checker</dt><dd>${esc(x.cfg.checker || '—')}</dd></div>
        </dl>
      </header>

      <section class="r-hero">
        <div class="r-hero-main">
          <span class="r-hero-n">${x.controlados.length}</span>
          <span class="r-hero-l">controles de lote en línea<br>en ${recs.length} recorrida${recs.length === 1 ? '' : 's'} de planta${franja ? ` (${esc(franja)})` : ''}</span>
        </div>
        <div class="r-kpis">
          <div class="r-kpi"><strong>${x.lotes.size}</strong><span>lotes distintos</span></div>
          <div class="r-kpi r-kpi-warn"><strong>${x.ajustes.length}</strong><span>ajustes en línea</span></div>
          <div class="r-kpi"><strong>${x.final.length}</strong><span>lotes en control final${x.finalNC.length ? ` (${x.finalNC.length} no conf.)` : ''}</span></div>
          <div class="r-kpi r-kpi-brand"><strong>${magTxt}</strong><span>magnitud de los eventos</span></div>
        </div>
        ${donut(x)}
      </section>

      <section class="r-sec">
        <h2>Cobertura de la recorrida</h2>
        <p class="r-sub">Cada casillero es una línea verificada en una recorrida.</p>
        ${tablero(x)}
      </section>

      <section class="r-sec">
        <h2>Actividad por hora</h2>
        <p class="r-sub">Controles registrados en cada hora del turno.</p>
        ${actividad(x)}
      </section>

      <section class="r-sec">
        <h2>Eventos relevantes</h2>
        ${eventos(x)}
      </section>

      <section class="r-sec">
        <h2>Control final</h2>
        ${finalTabla(x)}
      </section>

      <footer class="r-foot">
        <span>${doc.codigo ? esc(doc.codigo) + (doc.revision ? ' Rev. ' + esc(doc.revision) : '') : ''}</span>
        <span>Generado el ${new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</span>
      </footer>
    </div>`;
  }

  /** Resumen de texto para compartir. */
  function texto(fecha) {
    const x = calcular(fecha);
    const mags = Object.entries(x.magnitudes).map(([u, n]) => `${fmtNum(n)} ${u}`).join(', ');
    const lineas = [
      `Control de línea ${fmtFecha(fecha)}${x.d.turno ? ' – Turno ' + x.d.turno : ''}`,
      `• ${x.d.recorridas.length} recorridas de planta, ${x.controlados.length} controles de lote en línea`,
      `• ${x.ajustes.length} ajustes en línea${x.conformidad != null ? ` (${x.conformidad}% conforme al primer control)` : ''}`,
      `• Control final: ${x.final.length} lotes${x.finalNC.length ? `, ${x.finalNC.length} no conformes` : ''}`
    ];
    if (mags) lineas.push(`• Magnitud de los eventos: ${mags}`);
    x.eventos.forEach(e => {
      const r = e.relevancia || {};
      lineas.push(`  – ${e.hora} ${e.tipo === 'final' ? 'Control final' : e.linea}${e.lote ? ' lote ' + e.lote : ''}: ${e.detalle || ''}${r.descripcion ? ' → ' + r.descripcion : ''}`);
    });
    if (x.cfg.checker) lineas.push(`Checker: ${x.cfg.checker}`);
    return lineas.join('\n');
  }

  return { render, texto, calcular, ETIQUETA, esc, fmtFecha };
})();
