/*
 * brand.js — Configuración de marca (lo único que hay que tocar para cambiar la identidad).
 * Misma idea que en informeCalidad: copiar desde ahí el logo y los colores de Agrofacil.
 *
 * logo: ruta relativa (ej. 'assets/logo.png') o data URI. Vacío = sin logo.
 * colores: se aplican como variables CSS (--brand, --brand-ink).
 * documento: código de registro controlado para el pie del reporte (opcional).
 */
window.BRAND = {
  empresa: 'Agrofacil S.A.',
  area: 'Departamento de Calidad',
  logo: '',                      // ej: 'assets/logo.png'
  colores: {
    primario: '#0f5c6e',         // barra superior, botones principales, títulos del reporte
    textoSobrePrimario: '#ffffff'
  },
  documento: {
    titulo: 'Reporte de Control del Día',
    codigo: '',                  // ej: '8170 REG-XX'
    revision: ''
  }
};
