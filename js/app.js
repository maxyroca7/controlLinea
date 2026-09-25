/*
 * app.js — Interfaz. Pantallas: Recorrida, Control final, Reporte, Ajustes.
 * Patrón simple: cada pantalla es una función render*() que escribe HTML en #view,
 * y los botones usan data-act="..." (delegación de eventos en un solo listener).
 */
(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = Report.esc;
  const view = $('#view');
  const sheet = $('#sheet');

  // Fecha de jornada: si ayer quedó una recorrida abierta (turno noche), seguimos en ayer.
  function fechaInicial() {
    const h = Store.hoy();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const ayer = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return Store.recorridaActiva(ayer) ? ayer : h;
  }

  const ui = { tab: 'recorrida', fecha: fechaInicial(), reporteFecha: null };

  // ---------- marca ----------
  function aplicarMarca() {
    const B = window.BRAND || {};
    const root = document.documentElement.style;
    if (B.colores?.primario) root.setProperty('--brand', B.colores.primario);
    if (B.colores?.textoSobrePrimario) root.setProperty('--brand-ink', B.colores.textoSobrePrimario);
    $('#brandEmpresa').textContent = B.empresa || '';
    if (B.logo) { const img = $('#brandLogo'); img.src = B.logo; img.hidden = false; }
  }

  // ---------- utilidades UI ----------
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  const ESTADO_TXT = { conforme: 'Conforme', ajuste: 'Ajuste', sin_produccion: 'Sin producción', no_conforme: 'No conforme' };

  function topStatus() {
    const r = Store.recorridaActiva(ui.fecha);
    $('#topStatus').innerHTML = r ? `<span class="chip chip-live">Recorrida ${r.numero} en curso</span>` : '';
  }

  function render() {
    document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
    topStatus();
    if (ui.tab === 'recorrida') renderRecorrida();
    else if (ui.tab === 'final') renderFinal();
    else if (ui.tab === 'reporte') renderReporte();
    else renderAjustes();
    view.scrollTop = 0;
  }

  function cabeceraJornada() {
    const cfg = Store.getConfig();
    const d = Store.getDia(ui.fecha);
    const opts = ['', ...cfg.turnos].map(t => `<option value="${esc(t)}" ${t === d.turno ? 'selected' : ''}>${t ? esc(t) : 'Elegir…'}</option>`).join('');
    return `
      <section class="jornada">
        <label>Jornada<input type="date" id="inFecha" value="${ui.fecha}"></label>
        <label>Turno<select id="inTurno">${opts}</select></label>
      </section>`;
  }

  function filaControl(c) {
    const info = [c.producto, c.lote && `Lote ${c.lote}`].filter(Boolean).map(esc).join(' · ');
    const mag = c.relevancia?.magnitud ? ` · ${c.relevancia.magnitud} ${esc(c.relevancia.unidad || '')}` : '';
    return `
      <li>
        <button type="button" class="log-row" data-act="editar" data-id="${c.id}">
          <span class="log-time">${esc(c.hora)}</span>
          <span class="log-main"><strong>${esc(c.tipo === 'final' ? (c.linea ? 'Final · ' + c.linea : 'Control final') : c.linea)}</strong><small>${info || '—'}</small></span>
          <span class="pill pill-${c.resultado}">${ESTADO_TXT[c.resultado]}${mag}</span>
        </button>
      </li>`;
  }

  // ---------- Recorrida ----------
  function renderRecorrida() {
    const cfg = Store.getConfig();
    const d = Store.getDia(ui.fecha);
    const activa = Store.recorridaActiva(ui.fecha);
    let html = cabeceraJornada();

    if (activa) {
      const hechas = cfg.lineas.filter(l => Store.controlDeLinea(ui.fecha, activa.id, l)).length;
      const pct = cfg.lineas.length ? Math.round((hechas / cfg.lineas.length) * 100) : 0;
      const tiles = cfg.lineas.map(l => {
        const c = Store.controlDeLinea(ui.fecha, activa.id, l);
        const prev = c || Store.ultimoDeLinea(ui.fecha, l);
        const info = prev ? [prev.producto, prev.lote && `Lote ${prev.lote}`].filter(Boolean).map(esc).join(' · ') : '';
        return `
          <li>
            <button type="button" class="tile tile-${c ? c.resultado : 'pendiente'}" data-act="controlar" data-linea="${esc(l)}">
              <span class="tile-name">${esc(l)}</span>
              <span class="tile-info">${info || '&nbsp;'}</span>
              <span class="tile-state">${c ? `${ESTADO_TXT[c.resultado]} · ${esc(c.hora)}` : 'Pendiente'}</span>
            </button>
          </li>`;
      }).join('');
      html += `
        <section class="round">
          <div class="round-head">
            <h2>Recorrida ${activa.numero}</h2>
            <span>Iniciada ${esc(activa.inicio)} · ${hechas} de ${cfg.lineas.length} líneas</span>
          </div>
          <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
          <ul class="board">${tiles}</ul>
          <button type="button" class="btn ${hechas === cfg.lineas.length ? 'btn-primary' : 'btn-ghost'} btn-block" data-act="cerrar-rec" data-id="${activa.id}">Cerrar recorrida ${activa.numero}</button>
        </section>`;
    } else {
      const n = d.recorridas.length + 1;
      html += `
        <section class="start">
          <button type="button" class="btn btn-primary btn-xl" data-act="iniciar">Iniciar recorrida ${n}</button>
          <p>${cfg.lineas.length} líneas a verificar: ${cfg.lineas.map(esc).join(', ')}.</p>
        </section>`;
    }

    // Registro del día agrupado por recorrida (la más reciente primero)
    const grupos = [...d.recorridas].reverse().map(r => {
      const cs = d.controles.filter(c => c.tipo === 'linea' && c.recorridaId === r.id).sort((a, b) => a.hora.localeCompare(b.hora));
      const acciones = r.fin
        ? `<button type="button" class="link" data-act="reabrir" data-id="${r.id}">Reabrir</button>`
        : '';
      return `
        <div class="log-group">
          <div class="log-head">
            <strong>Recorrida ${r.numero}</strong>
            <span>${esc(r.inicio)}${r.fin ? ' a ' + esc(r.fin) : ' · en curso'}</span>
            ${acciones}
            <button type="button" class="link link-danger" data-act="borrar-rec" data-id="${r.id}">Borrar</button>
          </div>
          ${cs.length ? `<ul class="log">${cs.map(filaControl).join('')}</ul>` : '<p class="muted">Sin controles cargados.</p>'}
        </div>`;
    }).join('');
    html += `<section class="day-log"><h2>Registro de la jornada</h2>${grupos || '<p class="muted">Todavía no hay recorridas en esta jornada. Iniciá la primera cuando salgas a planta.</p>'}</section>`;

    view.innerHTML = html;
  }

  // ---------- Control final ----------
  function renderFinal() {
    const d = Store.getDia(ui.fecha);
    const fin = d.controles.filter(c => c.tipo === 'final').sort((a, b) => b.hora.localeCompare(a.hora));
    const nc = fin.filter(c => c.resultado === 'no_conforme').length;
    view.innerHTML = `
      ${cabeceraJornada()}
      <section class="start">
        <button type="button" class="btn btn-primary btn-xl" data-act="nuevo-final">Registrar lote en control final</button>
        <p>${fin.length ? `${fin.length} lote${fin.length === 1 ? '' : 's'} registrado${fin.length === 1 ? '' : 's'}${nc ? `, ${nc} no conforme${nc === 1 ? '' : 's'}` : ''}.` : 'Registrá cada lote terminado que verifiques antes del despacho.'}</p>
      </section>
      <section class="day-log">
        <h2>Lotes de la jornada</h2>
        ${fin.length ? `<ul class="log">${fin.map(filaControl).join('')}</ul>` : '<p class="muted">Sin lotes en control final todavía.</p>'}
      </section>`;
  }

  // ---------- Reporte ----------
  function renderReporte() {
    const dias = Store.diasConDatos();
    if (!ui.reporteFecha) ui.reporteFecha = ui.fecha;
    if (!dias.includes(ui.reporteFecha) && dias.length) ui.reporteFecha = dias.includes(ui.fecha) ? ui.fecha : dias[0];
    if (!dias.length) {
      view.innerHTML = `<section class="start"><p>El reporte se arma solo con lo que cargues en Recorrida y Control final. Todavía no hay datos.</p><button type="button" class="btn btn-primary" data-tab-go="recorrida">Ir a Recorrida</button></section>`;
      return;
    }
    const opts = dias.map(f => `<option value="${f}" ${f === ui.reporteFecha ? 'selected' : ''}>${Report.fmtFecha(f)}${Store.getDia(f).turno ? ' · ' + esc(Store.getDia(f).turno) : ''}</option>`).join('');
    view.innerHTML = `
      <section class="report-tools no-print">
        <label>Jornada<select id="inRepFecha">${opts}</select></label>
        <div class="report-actions">
          <button type="button" class="btn btn-primary" data-act="imprimir">Exportar PDF</button>
          <button type="button" class="btn btn-ghost" data-act="compartir">Compartir resumen</button>
        </div>
        <p class="muted small">Exportar PDF abre la ventana de impresión: elegí “Guardar como PDF”.</p>
      </section>
      ${Report.render(ui.reporteFecha)}`;
  }

  // ---------- Ajustes ----------
  function renderAjustes() {
    const cfg = Store.getConfig();
    view.innerHTML = `
      <form class="settings" id="formAjustes">
        <label>Nombre del checker<input name="checker" value="${esc(cfg.checker)}" autocomplete="name" placeholder="Aparece en el reporte"></label>
        <label>Líneas de la planta <small>Una por renglón, en el orden en que las recorrés.</small>
          <textarea name="lineas" rows="6">${esc(cfg.lineas.join('\n'))}</textarea></label>
        <label>Unidades para la relevancia <small>Una por renglón.</small>
          <textarea name="unidades" rows="4">${esc(cfg.unidades.join('\n'))}</textarea></label>
        <label>Turnos <small>Uno por renglón.</small>
          <textarea name="turnos" rows="3">${esc(cfg.turnos.join('\n'))}</textarea></label>
        <button type="submit" class="btn btn-primary btn-block">Guardar ajustes</button>
      </form>
      <section class="settings">
        <h2>Respaldo</h2>
        <p class="muted small">Los datos quedan guardados solo en este dispositivo. Descargá un respaldo cada tanto.</p>
        <div class="report-actions">
          <button type="button" class="btn btn-ghost" data-act="exportar">Descargar respaldo</button>
          <label class="btn btn-ghost file-btn">Restaurar respaldo<input type="file" accept="application/json,.json" id="inImport" hidden></label>
        </div>
      </section>`;
  }

  // ---------- Formulario (hoja inferior) ----------
  function abrirForm({ tipo, linea = '', recorridaId = null, control = null }) {
    const cfg = Store.getConfig();
    const c = control || {};
    const prev = !control && tipo === 'linea' ? Store.ultimoDeLinea(ui.fecha, linea) : null;
    const producto = c.producto ?? prev?.producto ?? '';
    const lote = c.lote ?? prev?.lote ?? '';
    const rec = recorridaId ? Store.getDia(ui.fecha).recorridas.find(r => r.id === recorridaId) : null;
    const resultados = tipo === 'linea'
      ? [['conforme', 'Conforme'], ['ajuste', 'Ajuste en línea'], ['sin_produccion', 'Sin producción']]
      : [['conforme', 'Conforme'], ['no_conforme', 'No conforme']];
    const r = c.relevancia || {};
    const unidades = cfg.unidades.map(u => `<option ${u === r.unidad ? 'selected' : ''}>${esc(u)}</option>`).join('');
    const productos = Store.productosUsados().map(p => `<option value="${esc(p)}">`).join('');
    const lineasOpt = ['', ...cfg.lineas].map(l => `<option value="${esc(l)}" ${l === (c.linea || '') ? 'selected' : ''}>${l ? esc(l) : 'Sin especificar'}</option>`).join('');

    sheet.innerHTML = `
      <div class="sheet-backdrop" data-act="cerrar-sheet"></div>
      <form class="sheet-panel" id="formControl" novalidate role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
        <header class="sheet-head">
          <div>
            <h2 id="sheetTitle">${tipo === 'linea' ? esc(linea) : 'Control final'}</h2>
            <small>${rec ? `Recorrida ${rec.numero}` : tipo === 'final' ? 'Lote terminado, antes del despacho' : ''}</small>
          </div>
          <button type="button" class="icon-btn" data-act="cerrar-sheet" aria-label="Cerrar">✕</button>
        </header>

        ${tipo === 'final' ? `<label>Línea de origen<select name="linea">${lineasOpt}</select></label>` : ''}
        <label>Producto<input name="producto" list="dlProd" value="${esc(producto)}" autocomplete="off"></label>
        <datalist id="dlProd">${productos}</datalist>
        <div class="row2">
          <label>Lote<input name="lote" value="${esc(lote)}" autocomplete="off" autocapitalize="characters"></label>
          <label>Hora<input type="time" name="hora" value="${esc(c.hora || Store.horaActual())}"></label>
        </div>

        <fieldset class="seg">
          <legend>Resultado</legend>
          ${resultados.map(([v, t]) => `
            <label class="seg-opt seg-${v}"><input type="radio" name="resultado" value="${v}" ${c.resultado === v ? 'checked' : ''}><span>${t}</span></label>`).join('')}
        </fieldset>

        <label id="wrapDetalle" hidden><span id="lblDetalle">Detalle</span><textarea name="detalle" rows="2">${esc(c.detalle || '')}</textarea></label>

        <fieldset class="rel" id="wrapRel" hidden>
          <legend>Relevancia del evento</legend>
          <label>¿Qué se evitó o corrigió?<textarea name="relDesc" rows="2" placeholder="Ej: se evitó envasar el resto del lote con etiqueta corrida">${esc(r.descripcion || '')}</textarea></label>
          <div class="row2">
            <label><span>Magnitud <small>(opcional)</small></span><input type="number" name="relMag" inputmode="decimal" min="0" step="any" value="${r.magnitud ?? ''}"></label>
            <label>Unidad<select name="relUni">${unidades}</select></label>
          </div>
        </fieldset>

        <p class="form-error" id="formError" hidden></p>

        <footer class="sheet-foot">
          ${control ? '<button type="button" class="btn btn-danger-ghost" data-act="borrar-control">Eliminar</button>' : ''}
          <button type="submit" class="btn btn-primary">${tipo === 'linea' && !control ? 'Guardar y seguir' : 'Guardar'}</button>
        </footer>
      </form>`;

    const form = $('#formControl');
    form.dataset.tipo = tipo;
    form.dataset.linea = linea;
    form.dataset.recorridaId = recorridaId || '';
    form.dataset.id = c.id || '';
    actualizarCampos(form);
    form.addEventListener('change', e => { if (e.target.name === 'resultado') actualizarCampos(form); });
    form.addEventListener('submit', e => { e.preventDefault(); guardarForm(form); });
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    setTimeout(() => { const first = form.querySelector('input[name="resultado"]:checked') || form.querySelector('input[name="resultado"]'); first?.focus({ preventScroll: true }); }, 50);
  }

  function actualizarCampos(form) {
    const res = form.resultado.value;
    const tipo = form.dataset.tipo;
    const evento = res === 'ajuste' || res === 'no_conforme';
    const lbl = {
      ajuste: '¿Qué se detectó y qué se ajustó?',
      no_conforme: '¿Qué no cumple?',
      sin_produccion: 'Motivo (opcional)',
      conforme: 'Observación (opcional)'
    }[res] || 'Detalle';
    $('#lblDetalle', form).textContent = lbl;
    $('#wrapDetalle', form).hidden = !res;
    $('#wrapRel', form).hidden = !evento;
    form.lote.closest('label').classList.toggle('dim', tipo === 'linea' && res === 'sin_produccion');
  }

  function cerrarSheet() {
    sheet.hidden = true;
    sheet.innerHTML = '';
    document.body.classList.remove('sheet-open');
  }

  function guardarForm(form) {
    const tipo = form.dataset.tipo;
    const res = form.resultado.value;
    const err = $('#formError', form);
    const falta = [];
    if (!res) falta.push('elegí el resultado');
    if (res && res !== 'sin_produccion' && !form.lote.value.trim()) falta.push('cargá el lote');
    if ((res === 'ajuste' || res === 'no_conforme') && !form.detalle.value.trim()) falta.push(res === 'ajuste' ? 'describí qué se ajustó' : 'describí qué no cumple');
    if (falta.length) { err.textContent = 'Para guardar: ' + falta.join(', ') + '.'; err.hidden = false; return; }

    const evento = res === 'ajuste' || res === 'no_conforme';
    const mag = form.relMag.value.trim();
    const control = {
      id: form.dataset.id || undefined,
      tipo,
      recorridaId: tipo === 'linea' ? form.dataset.recorridaId : null,
      linea: tipo === 'linea' ? form.dataset.linea : form.linea.value,
      producto: form.producto.value.trim(),
      lote: form.lote.value.trim(),
      hora: form.hora.value || Store.horaActual(),
      resultado: res,
      detalle: form.detalle.value.trim(),
      relevancia: evento ? { descripcion: form.relDesc.value.trim(), magnitud: mag === '' ? null : Number(mag), unidad: form.relUni.value } : null
    };
    if (!Store.guardarControl(ui.fecha, control)) { err.textContent = 'No se pudo guardar en este dispositivo (memoria llena o bloqueada). Descargá un respaldo desde Ajustes.'; err.hidden = false; return; }

    const eraNuevo = !form.dataset.id;
    cerrarSheet();
    render();

    // En recorrida: pasar directo a la siguiente línea pendiente.
    if (tipo === 'linea' && eraNuevo) {
      const rid = control.recorridaId;
      const lineas = Store.getConfig().lineas;
      const desde = lineas.indexOf(control.linea);
      const orden = [...lineas.slice(desde + 1), ...lineas.slice(0, desde)];
      const siguiente = orden.find(l => !Store.controlDeLinea(ui.fecha, rid, l));
      if (siguiente) abrirForm({ tipo: 'linea', linea: siguiente, recorridaId: rid });
      else toast('Todas las líneas verificadas. Podés cerrar la recorrida.');
    } else {
      toast('Guardado');
    }
  }

  function buscarControl(id) {
    return Store.getDia(ui.fecha).controles.find(c => c.id === id);
  }

  // ---------- eventos ----------
  document.querySelector('.tabbar').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    ui.tab = b.dataset.tab;
    if (ui.tab === 'reporte') ui.reporteFecha = ui.fecha;
    render();
  });

  document.addEventListener('click', e => {
    const go = e.target.closest('[data-tab-go]');
    if (go) { ui.tab = go.dataset.tabGo; render(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const id = el.dataset.id;

    switch (act) {
      case 'iniciar': {
        const r = Store.iniciarRecorrida(ui.fecha);
        render();
        const primera = Store.getConfig().lineas[0];
        if (primera) abrirForm({ tipo: 'linea', linea: primera, recorridaId: r.id });
        break;
      }
      case 'controlar': {
        const r = Store.recorridaActiva(ui.fecha);
        if (!r) return;
        const linea = el.dataset.linea;
        abrirForm({ tipo: 'linea', linea, recorridaId: r.id, control: Store.controlDeLinea(ui.fecha, r.id, linea) });
        break;
      }
      case 'cerrar-rec': {
        const cfg = Store.getConfig();
        const pend = cfg.lineas.filter(l => !Store.controlDeLinea(ui.fecha, id, l));
        if (pend.length && !confirm(`Quedan ${pend.length} línea(s) sin verificar (${pend.join(', ')}). ¿Cerrar la recorrida igual?`)) return;
        Store.cerrarRecorrida(ui.fecha, id);
        toast('Recorrida cerrada');
        render();
        break;
      }
      case 'reabrir':
        Store.reabrirRecorrida(ui.fecha, id);
        render();
        break;
      case 'borrar-rec':
        if (confirm('¿Borrar esta recorrida y todos sus controles? No se puede deshacer.')) { Store.borrarRecorrida(ui.fecha, id); render(); }
        break;
      case 'editar': {
        const c = buscarControl(id);
        if (c) abrirForm({ tipo: c.tipo, linea: c.linea, recorridaId: c.recorridaId, control: c });
        break;
      }
      case 'nuevo-final':
        abrirForm({ tipo: 'final' });
        break;
      case 'borrar-control': {
        const form = $('#formControl');
        if (form && confirm('¿Eliminar este control?')) { Store.borrarControl(ui.fecha, form.dataset.id); cerrarSheet(); render(); toast('Control eliminado'); }
        break;
      }
      case 'cerrar-sheet':
        cerrarSheet();
        break;
      case 'imprimir':
        window.print();
        break;
      case 'compartir': {
        const texto = Report.texto(ui.reporteFecha);
        if (navigator.share) navigator.share({ title: 'Control de línea', text: texto }).catch(() => {});
        else navigator.clipboard?.writeText(texto).then(() => toast('Resumen copiado'), () => toast('No se pudo copiar'));
        break;
      }
      case 'exportar': {
        const blob = new Blob([Store.exportar()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `control-linea-respaldo-${Store.hoy()}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        break;
      }
    }
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'inFecha' && t.value) { ui.fecha = t.value; render(); }
    else if (t.id === 'inTurno') { Store.setTurno(ui.fecha, t.value); }
    else if (t.id === 'inRepFecha') { ui.reporteFecha = t.value; render(); }
    else if (t.id === 'inImport' && t.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!confirm('Restaurar reemplaza todos los datos actuales por los del respaldo. ¿Continuar?')) return;
          Store.importar(reader.result); toast('Respaldo restaurado'); render();
        } catch (err) { alert(err.message || 'No se pudo leer el archivo.'); }
      };
      reader.readAsText(t.files[0]);
    }
  });

  document.addEventListener('submit', e => {
    if (e.target.id !== 'formAjustes') return;
    e.preventDefault();
    const f = e.target;
    const lista = s => s.split('\n').map(x => x.trim()).filter(Boolean);
    const lineas = lista(f.lineas.value);
    if (!lineas.length) { alert('Cargá al menos una línea.'); return; }
    Store.setConfig({
      checker: f.checker.value.trim(),
      lineas,
      unidades: lista(f.unidades.value).length ? lista(f.unidades.value) : ['L'],
      turnos: lista(f.turnos.value).length ? lista(f.turnos.value) : ['Mañana', 'Tarde', 'Noche']
    });
    toast('Ajustes guardados');
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) cerrarSheet(); });

  // ---------- inicio ----------
  aplicarMarca();
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
